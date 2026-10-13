import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.MCP_ENABLE_POWERSHELL = "true";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

const client = new Client(
  { name: "lconnect-development-smoke", version: "1.1.0" },
  { capabilities: {} }
);

let tempRoot = null;

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

async function callJson(name, args = {}, allowError = false) {
  const result = await client.callTool({ name, arguments: args });
  const text = textOf(result);
  if (result.isError && !allowError) {
    throw new Error(`${name} returned isError: ${text}`);
  }
  try {
    return { data: JSON.parse(text), isError: Boolean(result.isError) };
  } catch (error) {
    if (result.isError && allowError) {
      return { data: text, isError: true };
    }
    throw new Error(`${name} returned non-JSON output: ${text}\n${error.message}`);
  }
}

async function waitForSession(sessionId, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await callJson("read_process_output", { session_id: sessionId });
    if (!result.data.running) return result.data;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for development session ${sessionId}`);
}

async function runAndExpect(toolName, args, marker) {
  const started = Date.now();
  const operation = await callJson(toolName, args);
  const elapsed = Date.now() - started;

  if (!operation.data.started || !operation.data.session?.session_id) {
    throw new Error(`${toolName} did not return a managed process session`);
  }
  if (elapsed > 3000) {
    throw new Error(`${toolName} blocked too long before returning a session: ${elapsed}ms`);
  }

  const finished = await waitForSession(operation.data.session.session_id);
  if (finished.exit_code !== 0) {
    throw new Error(`${toolName} session failed: ${JSON.stringify(finished)}`);
  }
  if (marker && !(finished.stdout || "").includes(marker)) {
    throw new Error(`${toolName} output did not contain ${marker}: ${finished.stdout}`);
  }

  return { operation: operation.data, finished };
}

try {
  await client.connect(transport);

  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-development-smoke-"));
  const nodeProject = path.join(tempRoot, "node-project");
  const pythonProject = path.join(tempRoot, "python-project");
  const godotProject = path.join(tempRoot, "godot-project");
  await fsp.mkdir(nodeProject, { recursive: true });
  await fsp.mkdir(pythonProject, { recursive: true });
  await fsp.mkdir(godotProject, { recursive: true });

  const packageJson = {
    name: "lconnect-development-fixture",
    version: "1.0.0",
    private: true,
    scripts: {
      build: "node -e \"console.log('BUILD_OK')\"",
      test: "node -e \"console.log('TEST_OK')\"",
      lint: "node -e \"console.log('LINT_OK')\""
    },
    dependencies: {},
    devDependencies: {}
  };

  await fsp.writeFile(
    path.join(nodeProject, "package.json"),
    JSON.stringify(packageJson, null, 2) + "\n",
    "utf8"
  );
  await fsp.writeFile(
    path.join(pythonProject, "pyproject.toml"),
    "[project]\nname = \"python-fixture\"\nversion = \"0.0.1\"\n",
    "utf8"
  );

  await fsp.writeFile(
    path.join(godotProject, "project.godot"),
    [
      "config_version=5",
      "",
      "[application]",
      "config/name=\"Godot Fixture\"",
      "config/version=\"0.1.0\"",
      "run/main_scene=\"res://main.tscn\"",
      "config/features=PackedStringArray(\"4.5\", \"GL Compatibility\")",
      "",
    ].join("\n"),
    "utf8"
  );
  await fsp.writeFile(
    path.join(godotProject, "export_presets.cfg"),
    '[preset.0]\nname="Windows Desktop"\nplatform="Windows Desktop"\n',
    "utf8"
  );
  await fsp.writeFile(
    path.join(godotProject, "test_runner.gd"),
    "extends SceneTree\nfunc _init():\n    print(\"TEST_RUNNER\")\n    quit()\n",
    "utf8"
  );

  const fakeGodot = path.join(
    tempRoot,
    process.platform === "win32" ? "godot-fixture.cmd" : "godot-fixture.sh"
  );
  if (process.platform === "win32") {
    await fsp.writeFile(fakeGodot, "@echo off\r\necho GODOT_FAKE %*\r\nexit /b 0\r\n", "utf8");
  } else {
    await fsp.writeFile(fakeGodot, "#!/bin/sh\necho \"GODOT_FAKE $*\"\nexit 0\n", "utf8");
    await fsp.chmod(fakeGodot, 0o755);
  }

  const detected = await callJson("detect_project", { project_path: nodeProject });
  if (!detected.data.detected || detected.data.primary_type !== "node") {
    throw new Error(`detect_project did not identify Node project: ${JSON.stringify(detected.data)}`);
  }

  const buildSystem = await callJson("detect_build_system", { project_path: nodeProject });
  const nodeSystem = buildSystem.data.systems.find((item) => item.type === "node");
  if (!nodeSystem || nodeSystem.manager !== "npm" || !nodeSystem.execution_supported) {
    throw new Error(`detect_build_system did not report supported npm: ${JSON.stringify(buildSystem.data)}`);
  }
  if (!nodeSystem.available_standard_scripts.build || !nodeSystem.available_standard_scripts.test || !nodeSystem.available_standard_scripts.lint) {
    throw new Error("detect_build_system did not report fixture scripts");
  }

  const info = await callJson("project_info", { project_path: nodeProject });
  if (info.data.node?.name !== "lconnect-development-fixture") {
    throw new Error(`project_info did not return package metadata: ${JSON.stringify(info.data)}`);
  }

  const godotDetected = await callJson("detect_project", { project_path: godotProject });
  if (!godotDetected.data.detected || godotDetected.data.primary_type !== "godot") {
    throw new Error(`detect_project did not identify Godot project: ${JSON.stringify(godotDetected.data)}`);
  }
  if (!godotDetected.data.evidence.some((item) => item.type === "godot" && item.files.includes("project.godot"))) {
    throw new Error("Godot detection did not preserve project.godot evidence");
  }

  const godotBuildSystem = await callJson("detect_build_system", { project_path: godotProject });
  const godotSystem = godotBuildSystem.data.systems.find((item) => item.type === "godot");
  if (!godotSystem || !godotSystem.execution_supported || !godotSystem.export_presets_present) {
    throw new Error(`Godot build-system detection was incomplete: ${JSON.stringify(godotBuildSystem.data)}`);
  }

  const godotInfo = await callJson("project_info", { project_path: godotProject });
  if (
    godotInfo.data.godot?.name !== "Godot Fixture" ||
    godotInfo.data.godot?.version !== "0.1.0" ||
    godotInfo.data.godot?.main_scene !== "res://main.tscn" ||
    !godotInfo.data.godot?.features?.includes("4.5")
  ) {
    throw new Error(`project_info did not return Godot metadata: ${JSON.stringify(godotInfo.data)}`);
  }

  const pythonDetected = await callJson("detect_build_system", { project_path: pythonProject });
  const pythonSystem = pythonDetected.data.systems.find((item) => item.type === "python");
  if (!pythonSystem || pythonSystem.execution_supported !== false) {
    throw new Error("Python detection did not explicitly report unsupported execution");
  }

  const unsupportedRun = await callJson("run_build", {
    project_path: pythonProject,
  }, true);
  if (!unsupportedRun.isError || !String(unsupportedRun.data).includes("Node")) {
    throw new Error(`run_build did not explicitly reject unsupported non-Node project: ${String(unsupportedRun.data)}`);
  }

  const install = await runAndExpect("install_dependencies", {
    project_path: nodeProject,
    manager: "npm",
    ignore_scripts: true,
  });
  if (install.operation.command.program.toLowerCase().indexOf("npm") < 0) {
    throw new Error("install_dependencies did not report logical npm command");
  }

  await fsp.access(path.join(nodeProject, "package-lock.json"));

  await runAndExpect("run_build", {
    project_path: nodeProject,
  }, "BUILD_OK");

  await runAndExpect("run_tests", {
    project_path: nodeProject,
  }, "TEST_OK");

  await runAndExpect("run_lint", {
    project_path: nodeProject,
  }, "LINT_OK");

  const godotImport = await runAndExpect("run_build", {
    project_path: godotProject,
    godot_program: fakeGodot,
  }, "GODOT_FAKE");
  if (
    !godotImport.operation.command.args.includes("--headless") ||
    !godotImport.operation.command.args.includes("--path") ||
    !godotImport.operation.command.args.includes("--import")
  ) {
    throw new Error(`Godot default build did not use headless import: ${JSON.stringify(godotImport.operation)}`);
  }

  const godotExport = await runAndExpect("run_build", {
    project_path: godotProject,
    godot_program: fakeGodot,
    godot_mode: "export-release",
    godot_export_preset: "Windows Desktop",
    godot_output_path: "build/game.exe",
  }, "GODOT_FAKE");
  const exportArgs = godotExport.operation.command.args;
  if (
    !exportArgs.includes("--export-release") ||
    !exportArgs.includes("Windows Desktop") ||
    !exportArgs.includes("build/game.exe")
  ) {
    throw new Error(`Godot export contract was not preserved: ${JSON.stringify(godotExport.operation)}`);
  }

  const missingGodotRunner = await callJson("run_tests", {
    project_path: godotProject,
    godot_program: fakeGodot,
  }, true);
  if (!missingGodotRunner.isError || !String(missingGodotRunner.data).includes("godot_script")) {
    throw new Error(`Godot tests did not require an explicit runner: ${String(missingGodotRunner.data)}`);
  }

  const godotTests = await runAndExpect("run_tests", {
    project_path: godotProject,
    godot_program: fakeGodot,
    godot_script: "res://test_runner.gd",
    extra_args: ["--suite", "smoke"],
  }, "GODOT_FAKE");
  const godotTestArgs = godotTests.operation.command.args;
  if (
    !godotTestArgs.includes("--script") ||
    !godotTestArgs.includes("res://test_runner.gd") ||
    !godotTestArgs.includes("--")
  ) {
    throw new Error(`Godot test-runner contract was not preserved: ${JSON.stringify(godotTests.operation)}`);
  }

  const godotLint = await runAndExpect("run_lint", {
    project_path: godotProject,
    godot_program: fakeGodot,
  }, "GODOT_FAKE");
  if (!godotLint.operation.command.args.includes("--import")) {
    throw new Error(`Godot lint/validation did not use headless import: ${JSON.stringify(godotLint.operation)}`);
  }

  const sessions = await callJson("list_sessions");
  if (!Array.isArray(sessions.data) || sessions.data.length < 8) {
    throw new Error("Development operations did not use the shared process-session registry");
  }

  console.log("detect_project Node evidence: PASS");
  console.log("detect_build_system npm/scripts: PASS");
  console.log("project_info Node metadata: PASS");
  console.log("Godot project/build-system detection: PASS");
  console.log("Godot project_info metadata: PASS");
  console.log("Godot headless import/build managed session: PASS");
  console.log("Godot export-release argument contract: PASS");
  console.log("Godot explicit test-runner contract: PASS");
  console.log("Godot lint/import validation managed session: PASS");
  console.log("unsupported Python execution explicit: PASS");
  console.log("install_dependencies managed session: PASS");
  console.log("run_build managed session: PASS");
  console.log("run_tests managed session: PASS");
  console.log("run_lint managed session: PASS");
  console.log("shared process-session registry: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close();
  if (tempRoot) {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}
