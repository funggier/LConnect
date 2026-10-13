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

  const godot = ["project.godot", "export_presets.cfg"]
    .filter((name) => hasFile(entries, name));
  if (godot.includes("project.godot")) add("godot", godot);

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

function decodeGodotString(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed || null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.slice(1, -1);
  }
}

function decodeGodotStringList(value) {
  const matches = String(value ?? "").match(/"(?:\\.|[^"\\])*"/g) ?? [];
  return matches.map((item) => decodeGodotString(item)).filter((item) => item !== null);
}

async function godotProjectInfo(root) {
  const projectFile = path.join(root, "project.godot");
  if (!fs.existsSync(projectFile)) return null;

  const raw = await fsp.readFile(projectFile, "utf8");
  const values = new Map();
  let section = "";

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim();
    values.set(section + "/" + key, value);
  }

  const entries = await directoryEntries(root);
  const featuresRaw = values.get("application/config/features") ?? "";
  const dotnetProjects = matchingFiles(entries, (name) => /\.(?:sln|csproj|fsproj|vbproj)$/i.test(name));

  return {
    project_file: "project.godot",
    name: decodeGodotString(values.get("application/config/name")),
    version: decodeGodotString(values.get("application/config/version")),
    main_scene: decodeGodotString(values.get("application/run/main_scene")),
    features: decodeGodotStringList(featuresRaw),
    export_presets_present: hasFile(entries, "export_presets.cfg"),
    dotnet_projects: dotnetProjects,
  };
}

async function godotBuildSystem(root) {
  const info = await godotProjectInfo(root);
  if (!info) return null;

  const configuredProgram = String(process.env.GODOT_BIN ?? "").trim();
  return {
    type: "godot",
    system: "godot",
    execution_supported: true,
    project_file: info.project_file,
    program: configuredProgram || (process.platform === "win32" ? "godot.exe" : "godot"),
    program_source: configuredProgram ? "GODOT_BIN" : "PATH/default",
    export_presets_present: info.export_presets_present,
    operations: {
      build_modes: ["import", "export-release", "export-debug"],
      test: "explicit Godot --script runner",
      lint: "headless import/validation",
    },
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

  if (project.types.includes("godot")) {
    systems.push(await godotBuildSystem(root));
  }
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

function godotProgram(requestedProgram) {
  const explicit = String(requestedProgram ?? "").trim();
  if (explicit) return explicit;

  const configured = String(process.env.GODOT_BIN ?? "").trim();
  if (configured) return configured;

  return process.platform === "win32" ? "godot.exe" : "godot";
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
        ? `Node package-manager execution requires package.json. Detected: ${detected.types.join(", ")}`
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

function startGodotSession({
  operation,
  root,
  requestedProgram,
  args,
  config,
  env,
}) {
  const logicalProgram = godotProgram(requestedProgram);
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
    system: "godot",
    command: { program: logicalProgram, args },
    transport_command: launch.program === logicalProgram ? null : launch,
    session,
  };
}

async function requireGodotProject(root) {
  const info = await godotProjectInfo(root);
  if (!info) {
    const detected = await detectProjectEvidence(root);
    throw new Error(
      detected.detected
        ? `Godot execution requires project.godot. Detected: ${detected.types.join(", ")}`
        : "No supported project evidence was found."
    );
  }
  return info;
}

async function startGodotBuild({
  root,
  requestedProgram,
  mode,
  exportPreset,
  outputPath,
  extraArgs,
  env,
  config,
}) {
  await requireGodotProject(root);
  const selectedMode = mode || "import";
  const args = ["--headless", "--path", root];

  if (selectedMode === "import") {
    args.push("--import");
  } else {
    if (!exportPreset || !outputPath) {
      throw new Error(
        `Godot ${selectedMode} requires godot_export_preset and godot_output_path.`
      );
    }
    args.push(`--${selectedMode}`, exportPreset, outputPath);
  }

  args.push(...extraArgs);
  return startGodotSession({
    operation: selectedMode === "import" ? "build" : selectedMode,
    root,
    requestedProgram,
    args,
    config,
    env,
  });
}

async function startGodotTests({
  root,
  requestedProgram,
  script,
  extraArgs,
  env,
  config,
}) {
  await requireGodotProject(root);
  if (!script) {
    throw new Error(
      "Godot does not provide a standard project-level test runner. Provide godot_script for your test framework or custom SceneTree/MainLoop runner."
    );
  }

  const args = ["--headless", "--path", root, "--script", script];
  if (extraArgs.length) args.push("--", ...extraArgs);

  return startGodotSession({
    operation: "test",
    root,
    requestedProgram,
    args,
    config,
    env,
  });
}

async function startGodotLint({
  root,
  requestedProgram,
  extraArgs,
  env,
  config,
}) {
  await requireGodotProject(root);
  const args = ["--headless", "--path", root, "--import", ...extraArgs];
  return startGodotSession({
    operation: "lint",
    root,
    requestedProgram,
    args,
    config,
    env,
  });
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

  server.tool("project_info", "Return structured project metadata. Godot and Node metadata are expanded when present.", {
    project_path: z.string().min(1),
  }, async ({ project_path }) => {
    try {
      const root = await resolveProjectRoot(project_path);
      const detected = await detectProjectEvidence(root);
      const build = await detectBuildSystemData(root);
      const output = {
        ...detected,
        build_systems: build.systems,
        godot: null,
        node: null,
      };

      if (detected.types.includes("godot")) {
        output.godot = await godotProjectInfo(root);
      }

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
    godot_program: z.string().min(1).optional(),
    godot_mode: z.enum(["import", "export-release", "export-debug"]).optional(),
    godot_export_preset: z.string().min(1).optional(),
    godot_output_path: z.string().min(1).optional(),
    godot_script: z.string().min(1).optional(),
    extra_args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  };

  server.tool("run_build", "Start a Node build script or Godot headless build/import/export operation as a managed process session and return immediately.", scriptSchema, async ({
    project_path,
    manager,
    script,
    godot_program,
    godot_mode,
    godot_export_preset,
    godot_output_path,
    extra_args = [],
    env,
  }) => {
    try {
      requireEnabled();
      const root = await resolveProjectRoot(project_path);
      const detected = await detectProjectEvidence(root);

      if (detected.types.includes("godot")) {
        return textResult(await startGodotBuild({
          root,
          requestedProgram: godot_program,
          mode: godot_mode,
          exportPreset: godot_export_preset,
          outputPath: godot_output_path,
          extraArgs: extra_args,
          env,
          config,
        }));
      }

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

  server.tool("run_tests", "Start a Node test script or an explicit Godot test-runner script as a managed process session and return immediately.", scriptSchema, async ({
    project_path,
    manager,
    script,
    godot_program,
    godot_script,
    extra_args = [],
    env,
  }) => {
    try {
      requireEnabled();
      const root = await resolveProjectRoot(project_path);
      const detected = await detectProjectEvidence(root);

      if (detected.types.includes("godot")) {
        return textResult(await startGodotTests({
          root,
          requestedProgram: godot_program,
          script: godot_script,
          extraArgs: extra_args,
          env,
          config,
        }));
      }

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

  server.tool("run_lint", "Start a Node lint script or Godot headless import/validation operation as a managed process session and return immediately.", scriptSchema, async ({
    project_path,
    manager,
    script,
    godot_program,
    extra_args = [],
    env,
  }) => {
    try {
      requireEnabled();
      const root = await resolveProjectRoot(project_path);
      const detected = await detectProjectEvidence(root);

      if (detected.types.includes("godot")) {
        return textResult(await startGodotLint({
          root,
          requestedProgram: godot_program,
          extraArgs: extra_args,
          env,
          config,
        }));
      }

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
