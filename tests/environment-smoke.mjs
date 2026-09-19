import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);

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
  { name: "lconnect-environment-smoke", version: "1.0.2" },
  { capabilities: {} }
);

function parseToolJson(result, toolName) {
  if (result.isError) {
    const detail = result.content?.map((item) => item.text ?? "").join("\n") || "unknown error";
    throw new Error(`${toolName} returned isError: ${detail}`);
  }
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error(`${toolName} did not return text content`);
  return JSON.parse(text);
}

async function callJson(name, args = {}) {
  return parseToolJson(await client.callTool({ name, arguments: args }), name);
}

const tempName = `LCONNECT_ENV_TEST_${process.pid}_${Date.now()}`;
const persistentName = `LCONNECT_CI_ENV_TEST_${process.pid}_${Date.now()}`;

try {
  await client.connect(transport);

  const pathVar = await callJson("env_get", { name: "PATH", scope: "process" });
  if (!pathVar.exists || typeof pathVar.value !== "string" || !pathVar.value) {
    throw new Error("env_get PATH did not return the current process PATH");
  }

  const namesOnly = await callJson("env_list", { scope: "process" });
  if (!Array.isArray(namesOnly.entries) || namesOnly.entries.length === 0) {
    throw new Error("env_list did not return process environment names");
  }
  if (namesOnly.entries.some((entry) => Object.prototype.hasOwnProperty.call(entry, "value"))) {
    throw new Error("env_list exposed values even though include_values was not requested");
  }

  const setResult = await callJson("env_set", {
    name: tempName,
    value: "environment-smoke-value",
    scope: "process",
  });
  if (setResult.value !== "environment-smoke-value" || setResult.persistent !== false) {
    throw new Error("env_set process scope did not report the expected value");
  }

  const readback = await callJson("env_get", { name: tempName, scope: "process" });
  if (!readback.exists || readback.value !== "environment-smoke-value") {
    throw new Error("env_get did not observe the process-scoped mutation");
  }

  const deleted = await callJson("env_set", { name: tempName, value: null, scope: "process" });
  if (!deleted.deleted || deleted.value !== null) {
    throw new Error("env_set process deletion did not clear the variable");
  }

  const missing = await callJson("env_get", { name: tempName, scope: "process" });
  if (missing.exists || missing.value !== null) {
    throw new Error("deleted process environment variable is still present");
  }

  const paths = await callJson("path_list", { scope: "process" });
  if (!Array.isArray(paths.entries) || paths.entries.length === 0) {
    throw new Error("path_list did not return PATH entries");
  }

  const nodeMatch = await callJson("which", { command: process.platform === "win32" ? "node.exe" : "node" });
  if (!nodeMatch.found || typeof nodeMatch.match !== "string") {
    throw new Error("which could not resolve the Node executable");
  }

  if (process.platform === "win32") {
    const npmMatch = await callJson("which", { command: "npm" });
    if (!npmMatch.found || !/npm\.(?:cmd|bat|exe)$/i.test(npmMatch.match)) {
      throw new Error(`which did not resolve npm through PATHEXT: ${npmMatch.match}`);
    }


    const userPath = await callJson("env_get", { name: "PATH", scope: "user" });
    if (userPath.scope !== "user") {
      throw new Error("env_get user scope returned the wrong scope");
    }

    const userPaths = await callJson("path_list", { scope: "user" });
    if (userPaths.scope !== "user" || !Array.isArray(userPaths.entries)) {
      throw new Error("path_list user scope returned an invalid result");
    }
  }

  if (process.platform === "win32" && String(process.env.CI).toLowerCase() === "true") {
    try {
      const persisted = await callJson("env_set", {
        name: persistentName,
        value: "ci-persistent-value",
        scope: "user",
      });
      if (!persisted.persistent || persisted.value !== "ci-persistent-value") {
        throw new Error("env_set user scope failed on CI");
      }

      const persistentReadback = await callJson("env_get", {
        name: persistentName,
        scope: "user",
      });
      if (!persistentReadback.exists || persistentReadback.value !== "ci-persistent-value") {
        throw new Error("env_get user scope did not observe the CI persistent mutation");
      }
    } finally {
      await callJson("env_set", { name: persistentName, value: null, scope: "user" });
    }
  }

  console.log("env_get process: PASS");
  console.log("env_list names-only default: PASS");
  console.log("env_set process set/delete: PASS");
  console.log("path_list process: PASS");
  console.log("which node: PASS");
  if (process.platform === "win32") {
    console.log("which PATHEXT npm: PASS");
    console.log("user environment read: PASS");
  }
  if (process.platform === "win32" && String(process.env.CI).toLowerCase() === "true") {
    console.log("user environment persistent mutation on CI: PASS");
  }
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close();
}
