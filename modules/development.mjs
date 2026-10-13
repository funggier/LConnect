import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { startManagedProcessSession } from "./process.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

async function resolveProjectRoot(inputPath) {
  const resolved = path.resolve(inputPath);
  const stat = await fsp.stat(resolved);
  if (!stat.isDirectory()) throw new Error(`Project path is not a directory: ${resolved}`);
  return resolved;
}

async function directoryEntries(root) {
  return fsp.readdir(root, { withFileTypes: true });
}

function hasFile(entries, name) {
  return entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === name.toLowerCase());
}

function matchingFiles(entries, predicate) {
  return entries.filter((entry) => entry.isFile() && predicate(entry.name)).map((entry) => entry.name);
}

async function readJsonFile(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

async function detectProjectEvidence(root) {
  const entries = await directoryEntries(root);
  const evidence = [];
  const types = [];

  const add = (type, files) => {
    if (!files.length) return;
    types.push(type);
    evidence.push({ type, files });
  };

  add("node", hasFile(entries, "package.json") ? ["package.json"] : []);

  const python = ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"]
    .filter((name) => hasFile(entries, name));
  add("python", python);

  add("rust", hasFile(entries, "Cargo.toml") ? ["Cargo.toml"] : []);
  add("go", hasFile(entries, "go.mod") ? ["go.mod"] : []);

  const dotnet = matchingFiles(entries, (name) =>
    /\.(?:sln|csproj|fsproj|vbproj)$/i.test(name)
  );
  add("dotnet", dotnet);

  const maven = hasFile(entries, "pom.xml") ? ["pom.xml"] : [];
  add("maven", maven);

  const gradle = ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"]
    .filter((name) => hasFile(entries, name));
  add("gradle", gradle);

  add("cmake", hasFile(entries, "CMakeLists.txt") ? ["CMakeLists.txt"] : []);

  const make = ["Makefile", "makefile", "GNUmakefile"]
    .filter((name) => hasFile(entries, name));
  add("make", make);

  return {
    project_path: root,
    detected: types.length > 0,
    primary_type: types[0] ?? null,
    types,
    evidence,
  };
}

function nodeManagerFromPackage(packageJson, entries) {
  const declared = typeof packageJson?.packageManager === "string"
    ? packageJson.packageManager.split("@")[0].trim().toLowerCase()
    : null;

  if (["npm", "pnpm", "yarn", "bun"].includes(declared)) {
    return { manager: declared, source: "packageManager" };
  }

  if (hasFile(entries, "pnpm-lock.yaml")) return { manager: "pnpm", source: "pnpm-lock.yaml" };
  if (hasFile(entries, "yarn.lock")) return { manager: "yarn", source: "yarn.lock" };
  if (hasFile(entries, "bun.lock") || hasFile(entries, "bun.lockb")) {
    return { manager: "bun", source: hasFile(entries, "bun.lock") ? "bun.lock" : "bun.lockb" };
  }
  if (hasFile(entries, "package-lock.json") || hasFile(entries, "npm-shrinkwrap.json")) {
    return {
      manager: "npm",
      source: hasFile(entries, "package-lock.json") ? "package-lock.json" : "npm-shrinkwrap.json",
    };
  }

  return { manager: "npm", source: "default-node-manager" };
}

async function nodeBuildSystem(root) {
  const entries = await directoryEntries(root);
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) return null;

  const packageJson = await readJsonFile(packagePath);
  const manager = nodeManagerFromPackage(packageJson, entries);
  const scripts = packageJson.scripts && typeof packageJson.scripts === "object"
    ? Object.fromEntries(Object.entries(packageJson.scripts).map(([name, value]) => [name, String(value)]))
    : {};

  const lockfiles = [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
  ].filter((name) => hasFile(entries, name));

  return {
    type: "node",
    manager: manager.manager,
    manager_source: manager.source,
    execution_supported: true,
    lockfiles,
    scripts,
    available_standard_scripts: {
      build: Object.prototype.hasOwnProperty.call(scripts, "build"),
      test: Object.prototype.hasOwnProperty.call(scripts, "test"),
      lint: Object.prototype.hasOwnProperty.call(scripts, "lint"),
    },
  };
}

async function detectBuildSystemData(root) {
  const project = await detectProjectEvidence(root);
  const systems = [];

  if (project.types.includes("node")) {
    systems.push(await nodeBuildSystem(root));
  }
  if (project.types.includes("python")) {
    systems.push({
      type: "python",
      execution_supported: false,
      note: "Python execution contract is not implemented in this Development Module version.",
    });
  }
  if (project.types.includes("rust")) {
    systems.push({
      type: "rust",
      system: "cargo",
      execution_supported: false,
      note: "Cargo execution contract is not implemented in this Development Module version.",
    });
  }
  if (project.types.includes("go")) {
    systems.push({
      type: "go",
      system: "go",
      execution_supported: false,
      note: "Go execution contract is not implemented in this Development Module version.",
    });
  }
  if (project.types.includes("dotnet")) {
    systems.push({
      type: "dotnet",
      system: "dotnet",
      execution_supported: false,
      note: ".NET execution contract is not implemented in this Development Module version.",
    });
  }
  if (project.types.includes("maven")) {
    systems.push({
      type: "maven",
      system: "maven",
      execution_supported: false,
      note: "Maven execution contract is not implemented in this Development Module version.",
    });
  }
  if (project.types.includes("gradle")) {
    systems.push({
      type: "gradle",
      system: "gradle",
      execution_supported: false,
      note: "Gradle execution contract is not implemented in this Development Module version.",
    });
  }
  if (project.types.includes("cmake")) {
    systems.push({
      type: "cmake",
      system: "cmake",
      execution_supported: false,
      note: "CMake execution contract is not implemented in this Development Module version.",
    });
  }
  if (project.types.includes("make")) {
    systems.push({
      type: "make",
      system: "make",
      execution_supported: false,
      note: "Make execution contract is not implemented in this Development Module version.",
    });
  }

  return {
    project_path: root,
    detected: systems.length > 0,
    primary_type: project.primary_type,
    systems,
  };
}

function managerProgram(manager) {
  if (!["npm", "pnpm", "yarn", "bun"].includes(manager)) {
    throw new Error(`Unsupported Node package manager: ${manager}`);
  }
  if (process.platform !== "win32") return manager;
  return manager === "bun" ? "bun.exe" : manager + ".cmd";
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function processLaunchSpec(program, args) {
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(program)) {
    const script = [
      `$lconnectArgs = @(${args.map(psLiteral).join(", ")})`,
      `& ${psLiteral(program)} @lconnectArgs`,
      "if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }",
    ].join("; ");
    return {
      program: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
    };
  }
  return { program, args };
}

async function requireNodeProject(root, requestedManager) {
  const system = await nodeBuildSystem(root);
  if (!system) {
    const detected = await detectProjectEvidence(root);
    throw new Error(
      detected.detected
        ? `Execution is currently implemented for Node projects only. Detected: ${detected.types.join(", ")}`
        : "No supported project evidence was found."
    );
  }

  const manager = requestedManager || system.manager;
  if (!["npm", "pnpm", "yarn", "bun"].includes(manager)) {
    throw new Error(`Unsupported Node package manager: ${manager}`);
  }

  return { system, manager };
}

function startDevelopmentSession({
  operation,
  root,
  manager,
  args,
  config,
  env,
}) {
  const logicalProgram = managerProgram(manager);
  const launch = processLaunchSpec(logicalProgram, args);
  const session = startManagedProcessSession({
    program: launch.program,
    args: launch.args,
    cwd: root,
    config,
    env,
  });

  return {
    started: true,
    operation,
    project_path: root,
    manager,
    command: { program: logicalProgram, args },
    transport_command: launch.program === logicalProgram ? null : launch,
    session,
  };
}

function installArgs(manager, frozen, ignoreScripts, extraArgs, hasNpmLock) {
  let args;

  if (manager === "npm") {
    args = [frozen && hasNpmLock ? "ci" : "install"];
    if (ignoreScripts) args.push("--ignore-scripts");
  } else if (manager === "pnpm") {
    args = ["install"];
    if (frozen) args.push("--frozen-lockfile");
    if (ignoreScripts) args.push("--ignore-scripts");
  } else if (manager === "yarn") {
    args = ["install"];
    if (frozen) args.push("--frozen-lockfile");
    if (ignoreScripts) args.push("--ignore-scripts");
  } else {
    args = ["install"];
    if (frozen) args.push("--frozen-lockfile");
    if (ignoreScripts) args.push("--ignore-scripts");
  }

  return [...args, ...extraArgs];
}

async function startScript({
  root,
  operation,
  defaultScript,
  requestedScript,
  requestedManager,
  extraArgs,
  env,
  config,
}) {
  const { system, manager } = await requireNodeProject(root, requestedManager);
  const script = requestedScript || defaultScript;

  if (!Object.prototype.hasOwnProperty.call(system.scripts, script)) {
    throw new Error(
      `package.json does not define script "${script}". Available scripts: ${Object.keys(system.scripts).join(", ") || "(none)"}`
    );
  }

  const args = ["run", script];
  if (extraArgs.length) args.push("--", ...extraArgs);

  return startDevelopmentSession({
    operation,
    root,
    manager,
    args,
    config,
    env,
  });
}

export function registerDevelopmentTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";
  const managerSchema = z.enum(["npm", "pnpm", "yarn", "bun"]);

  const requireEnabled = () => {
    if (!enabled) throw new Error("Development execution requires process execution to be enabled.");
  };

  server.tool("detect_project", "Detect project ecosystems from evidence in one project directory.", {
    project_path: z.string().min(1),
  }, async ({ project_path }) => {
    try {
      const root = await resolveProjectRoot(project_path);
      return textResult(await detectProjectEvidence(root));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("detect_build_system", "Detect build/package systems and supported execution contracts.", {
    project_path: z.string().min(1),
  }, async ({ project_path }) => {
    try {
      const root = await resolveProjectRoot(project_path);
      return textResult(await detectBuildSystemData(root));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("project_info", "Return structured project metadata. Node package metadata is expanded when present.", {
    project_path: z.string().min(1),
  }, async ({ project_path }) => {
    try {
      const root = await resolveProjectRoot(project_path);
      const detected = await detectProjectEvidence(root);
      const build = await detectBuildSystemData(root);
      const output = {
        ...detected,
        build_systems: build.systems,
        node: null,
      };

      if (detected.types.includes("node")) {
        const packageJson = await readJsonFile(path.join(root, "package.json"));
        output.node = {
          name: packageJson.name ?? null,
          version: packageJson.version ?? null,
          private: Boolean(packageJson.private),
          package_manager: build.systems.find((item) => item.type === "node")?.manager ?? null,
          scripts: packageJson.scripts && typeof packageJson.scripts === "object"
            ? packageJson.scripts
            : {},
          engines: packageJson.engines ?? {},
          dependency_counts: {
            dependencies: Object.keys(packageJson.dependencies ?? {}).length,
            dev_dependencies: Object.keys(packageJson.devDependencies ?? {}).length,
            optional_dependencies: Object.keys(packageJson.optionalDependencies ?? {}).length,
            peer_dependencies: Object.keys(packageJson.peerDependencies ?? {}).length,
          },
        };
      }

      return textResult(output);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("install_dependencies", "Start dependency installation as a managed process session and return immediately.", {
    project_path: z.string().min(1),
    manager: managerSchema.optional(),
    frozen: z.boolean().optional(),
    ignore_scripts: z.boolean().optional(),
    extra_args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  }, async ({
    project_path,
    manager: requestedManager,
    frozen = false,
    ignore_scripts = false,
    extra_args = [],
    env,
  }) => {
    try {
      requireEnabled();
      const root = await resolveProjectRoot(project_path);
      const { system, manager } = await requireNodeProject(root, requestedManager);
      const hasNpmLock = system.lockfiles.some((name) =>
        name === "package-lock.json" || name === "npm-shrinkwrap.json"
      );
      const args = installArgs(manager, frozen, ignore_scripts, extra_args, hasNpmLock);

      return textResult(startDevelopmentSession({
        operation: "install_dependencies",
        root,
        manager,
        args,
        config,
        env,
      }));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  const scriptSchema = {
    project_path: z.string().min(1),
    manager: managerSchema.optional(),
    script: z.string().min(1).optional(),
    extra_args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  };

  server.tool("run_build", "Start a Node build script as a managed process session and return immediately.", scriptSchema, async ({
    project_path,
    manager,
    script,
    extra_args = [],
    env,
  }) => {
    try {
      requireEnabled();
      const root = await resolveProjectRoot(project_path);
      return textResult(await startScript({
        root,
        operation: "build",
        defaultScript: "build",
        requestedScript: script,
        requestedManager: manager,
        extraArgs: extra_args,
        env,
        config,
      }));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("run_tests", "Start a Node test script as a managed process session and return immediately.", scriptSchema, async ({
    project_path,
    manager,
    script,
    extra_args = [],
    env,
  }) => {
    try {
      requireEnabled();
      const root = await resolveProjectRoot(project_path);
      return textResult(await startScript({
        root,
        operation: "test",
        defaultScript: "test",
        requestedScript: script,
        requestedManager: manager,
        extraArgs: extra_args,
        env,
        config,
      }));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("run_lint", "Start a Node lint script as a managed process session and return immediately.", scriptSchema, async ({
    project_path,
    manager,
    script,
    extra_args = [],
    env,
  }) => {
    try {
      requireEnabled();
      const root = await resolveProjectRoot(project_path);
      return textResult(await startScript({
        root,
        operation: "lint",
        defaultScript: "lint",
        requestedScript: script,
        requestedManager: manager,
        extraArgs: extra_args,
        env,
        config,
      }));
    } catch (error) {
      return textResult(error.message, true);
    }
  });
}
