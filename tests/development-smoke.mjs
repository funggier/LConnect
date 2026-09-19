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
  await fsp.mkdir(nodeProject, { recursive: true });
  await fsp.mkdir(pythonProject, { recursive: true });

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

  const sessions = await callJson("list_sessions");
  if (!Array.isArray(sessions.data) || sessions.data.length < 4) {
    throw new Error("Development operations did not use the shared process-session registry");
  }

  console.log("detect_project Node evidence: PASS");
  console.log("detect_build_system npm/scripts: PASS");
  console.log("project_info Node metadata: PASS");
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
