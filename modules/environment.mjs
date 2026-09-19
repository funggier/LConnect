import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runPowerShell } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

const envNameSchema = z.string().min(1).max(32767).refine(
  (value) => !value.includes("=") && !value.includes("\0"),
  "Environment variable name must not contain '=' or NUL."
);

const scopeSchema = z.enum(["process", "user", "machine"]);

function normalizeName(name) {
  return process.platform === "win32" ? name.toLowerCase() : name;
}

function findProcessEnvEntry(name) {
  const wanted = normalizeName(name);
  for (const [key, value] of Object.entries(process.env)) {
    if (normalizeName(key) === wanted) {
      return { name: key, value: typeof value === "string" ? value : null };
    }
  }
  return { name, value: null };
}

function listProcessEnvironment() {
  return Object.entries(process.env)
    .filter(([, value]) => typeof value === "string")
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function persistentTarget(scope) {
  if (scope === "user") return "User";
  if (scope === "machine") return "Machine";
  throw new Error(`Persistent environment target is not valid for scope: ${scope}`);
}

async function runPowerShellJson(script, config) {
  const result = await runPowerShell(script, {
    timeoutSeconds: Math.min(30, config.shell.maxTimeoutSeconds),
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error) {
    throw new Error(`Failed to launch PowerShell: ${result.error}`);
  }
  if (result.timedOut) {
    throw new Error("PowerShell environment operation timed out.");
  }
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`PowerShell environment operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }

  const raw = (result.stdout || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse environment operation output as JSON: ${error.message}`);
  }
}

async function getPersistentEnv(name, scope, config) {
  const target = persistentTarget(scope);
  const script = [
    `$name = ${psLiteral(name)}`,
    `$target = [EnvironmentVariableTarget]::${target}`,
    "$value = [Environment]::GetEnvironmentVariable($name, $target)",
    "[pscustomobject]@{ name = $name; value = $value } | ConvertTo-Json -Compress",
  ].join("; ");
  return runPowerShellJson(script, config);
}

async function listPersistentEnvironment(scope, config) {
  const target = persistentTarget(scope);
  const script = [
    `$target = [EnvironmentVariableTarget]::${target}`,
    "$items = @([Environment]::GetEnvironmentVariables($target).GetEnumerator() | ForEach-Object { [pscustomobject]@{ name = [string]$_.Key; value = [string]$_.Value } } | Sort-Object name)",
    "ConvertTo-Json -InputObject $items -Compress",
  ].join("; ");
  const parsed = await runPowerShellJson(script, config);
  if (parsed == null) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function setPersistentEnv(name, value, scope, config) {
  const target = persistentTarget(scope);
  const valueExpression = value === null ? "$null" : psLiteral(value);
  const script = [
    `$name = ${psLiteral(name)}`,
    `$value = ${valueExpression}`,
    `$target = [EnvironmentVariableTarget]::${target}`,
    "[Environment]::SetEnvironmentVariable($name, $value, $target)",
    "$readback = [Environment]::GetEnvironmentVariable($name, $target)",
    "[pscustomobject]@{ name = $name; value = $readback } | ConvertTo-Json -Compress",
  ].join("; ");
  return runPowerShellJson(script, config);
}

function getPathEntry(entries) {
  return entries.find(({ name }) => normalizeName(name) === normalizeName("PATH")) ?? null;
}

function expandWindowsVariables(value) {
  if (process.platform !== "win32") return value;
  return value.replace(/%([^%]+)%/g, (match, name) => {
    const entry = findProcessEnvEntry(name);
    return entry.value ?? match;
  });
}

function inspectPathValue(value, scope) {
  const segments = typeof value === "string"
    ? value.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean)
    : [];

  const seen = new Set();
  const entries = segments.map((raw, index) => {
    const expanded = expandWindowsVariables(raw);
    const comparable = process.platform === "win32" ? expanded.toLowerCase() : expanded;
    const duplicate = seen.has(comparable);
    seen.add(comparable);

    let exists = false;
    let type = "missing";
    try {
      const stat = fs.statSync(expanded);
      exists = true;
      type = stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
    } catch {}

    return {
      index,
      raw,
      expanded: expanded === raw ? undefined : expanded,
      exists,
      type,
      duplicate,
    };
  });

  return {
    scope,
    delimiter: path.delimiter,
    count: entries.length,
    entries,
  };
}

function executableCandidates(basePath, pathext) {
  if (process.platform !== "win32") return [basePath];

  const extension = path.extname(basePath);
  if (extension) return [basePath];

  return pathext.map((ext) => basePath + ext);
}

function isExecutableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === "win32") return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function registerEnvironmentTools(server, config) {
  const persistentEnabled =
    config.shell.enabled &&
    process.env.MCP_ENABLE_POWERSHELL !== "false";

  const requirePersistentAccess = (scope) => {
    if (scope !== "process" && !persistentEnabled) {
      throw new Error("Persistent user/machine environment access requires shell execution to be enabled.");
    }
  };

  server.tool("env_get", "Read one environment variable from the LConnect process, user profile, or machine environment.", {
    name: envNameSchema,
    scope: scopeSchema.optional(),
  }, async ({ name, scope = "process" }) => {
    try {
      requirePersistentAccess(scope);
      const entry = scope === "process"
        ? findProcessEnvEntry(name)
        : await getPersistentEnv(name, scope, config);

      return textResult({
        scope,
        name: entry?.name ?? name,
        exists: entry?.value !== null && entry?.value !== undefined,
        value: entry?.value ?? null,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("env_list", "List environment variables. Values are omitted by default to reduce accidental secret exposure.", {
    scope: scopeSchema.optional(),
    include_values: z.boolean().optional(),
  }, async ({ scope = "process", include_values = false }) => {
    try {
      requirePersistentAccess(scope);
      const entries = scope === "process"
        ? listProcessEnvironment()
        : await listPersistentEnvironment(scope, config);

      const output = entries.map(({ name, value }) =>
        include_values ? { name, value } : { name }
      );

      return textResult({
        scope,
        include_values,
        count: output.length,
        entries: output,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("env_set", "Set or delete an environment variable. Process scope affects only the running LConnect process; user/machine scopes persist for future processes.", {
    name: envNameSchema,
    value: z.string().nullable(),
    scope: scopeSchema.optional(),
  }, async ({ name, value, scope = "process" }) => {
    try {
      requirePersistentAccess(scope);

      if (scope === "process") {
        const existing = findProcessEnvEntry(name);
        const key = existing.value !== null ? existing.name : name;

        if (value === null) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }

        const readback = findProcessEnvEntry(name);
        return textResult({
          scope,
          name: readback.name,
          deleted: value === null,
          value: readback.value,
          persistent: false,
          note: "Process scope affects this LConnect process and child processes launched after the change.",
        });
      }

      const readback = await setPersistentEnv(name, value, scope, config);
      return textResult({
        scope,
        name: readback?.name ?? name,
        deleted: value === null,
        value: readback?.value ?? null,
        persistent: true,
        note: "Persistent environment changes affect future processes. Existing processes do not automatically receive the updated environment block.",
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("path_list", "Return PATH entries for process, user, or machine scope with existence and duplicate information.", {
    scope: scopeSchema.optional(),
  }, async ({ scope = "process" }) => {
    try {
      requirePersistentAccess(scope);
      const entries = scope === "process"
        ? listProcessEnvironment()
        : await listPersistentEnvironment(scope, config);
      const pathEntry = getPathEntry(entries);
      return textResult(inspectPathValue(pathEntry?.value ?? null, scope));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("which", "Resolve an executable/file command using the current LConnect process PATH and Windows PATHEXT semantics.", {
    command: z.string().min(1).max(32767),
    all: z.boolean().optional(),
    cwd: z.string().min(1).optional(),
  }, async ({ command, all = false, cwd }) => {
    try {
      const workingDirectory = path.resolve(cwd || process.cwd());
      const hasPathSyntax =
        path.isAbsolute(command) ||
        command.includes("/") ||
        command.includes("\\");

      const pathValue = findProcessEnvEntry("PATH").value ?? "";
      const searchDirectories = hasPathSyntax
        ? [workingDirectory]
        : [workingDirectory, ...pathValue.split(path.delimiter).filter(Boolean)];

      const pathextValue = findProcessEnvEntry("PATHEXT").value ?? ".COM;.EXE;.BAT;.CMD";
      const pathext = process.platform === "win32"
        ? pathextValue.split(";").filter(Boolean).map((ext) => ext.startsWith(".") ? ext : "." + ext)
        : [];

      const matches = [];
      const seen = new Set();

      const bases = hasPathSyntax
        ? [path.isAbsolute(command) ? path.normalize(command) : path.resolve(workingDirectory, command)]
        : searchDirectories.map((dir) => path.resolve(dir, command));

      for (const basePath of bases) {
        for (const candidate of executableCandidates(basePath, pathext)) {
          if (!isExecutableFile(candidate)) continue;
          const key = process.platform === "win32" ? candidate.toLowerCase() : candidate;
          if (seen.has(key)) continue;
          seen.add(key);
          matches.push(candidate);
          if (!all) break;
        }
        if (matches.length && !all) break;
      }

      return textResult({
        command,
        cwd: workingDirectory,
        found: matches.length > 0,
        match: matches[0] ?? null,
        matches: all ? matches : matches.slice(0, 1),
        pathext: process.platform === "win32" ? pathext : null,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });
}
