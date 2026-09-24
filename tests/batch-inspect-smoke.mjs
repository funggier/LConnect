import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.MCP_ENABLE_POWERSHELL = "true";
env.LCONNECT_TELEMETRY_ENABLED = "true";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

const client = new Client(
  { name: "lconnect-batch-inspect-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

async function call(name, args = {}) {
  return await client.callTool({ name, arguments: args });
}

let tempGitRoot = null;

try {
  await client.connect(transport);

  await call("tool_telemetry", { action: "clear" });

  const catalogBatch = jsonOf(await call("batch_inspect", {
    operations: [{ id: "catalog", tool: "runtime_catalog", arguments: {} }],
  }));
  const catalogText = catalogBatch.results[0]?.result_text || "";
  const catalog = JSON.parse(catalogText);
  if (
    catalogBatch.results[0]?.ok !== true ||
    catalog.catalog_ready !== true ||
    catalog.tool_count < 113 ||
    !/^[0-9a-f]{64}$/.test(catalog.tool_name_digest_sha256)
  ) {
    throw new Error("runtime_catalog batch visibility failed");
  }

  tempGitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-batch-git-"));
  const gitInit = spawnSync("git", ["init"], {
    cwd: tempGitRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (gitInit.status !== 0) {
    throw new Error(`Disposable git init failed: ${gitInit.stderr || gitInit.stdout}`);
  }

  const readmePath = path.join(root, "README.md");
  const batch = await call("batch_inspect", {
    operations: [
      { id: "sessions", tool: "list_sessions", arguments: {} },
      { id: "system", tool: "system_info", arguments: {} },
      { id: "git", tool: "git_status", arguments: { repo_path: tempGitRoot } },
      { id: "readme", tool: "read_text_file", arguments: { path: readmePath, head: 12 } },
      { id: "info", tool: "get_file_info", arguments: { path: readmePath } },
    ],
    max_chars_per_result: 2000,
    max_total_chars: 8000,
  });

  if (batch.isError) throw new Error(`batch_inspect returned isError: ${textOf(batch)}`);
  const data = jsonOf(batch);

  if (data.requested_operations !== 5 || data.completed_operations !== 5) {
    throw new Error(`Unexpected operation counts: ${textOf(batch)}`);
  }
  if (data.stopped_early) throw new Error("Batch stopped early unexpectedly");

  const expectedIds = ["sessions", "system", "git", "readme", "info"];
  if (JSON.stringify(data.results.map((x) => x.id)) !== JSON.stringify(expectedIds)) {
    throw new Error("Batch operation ordering was not preserved");
  }
  if (!data.results.every((x) => x.ok && !x.is_error)) {
    throw new Error(`One or more read-only batch operations failed: ${textOf(batch)}`);
  }
  if (!data.results.find((x) => x.id === "readme")?.result_text.includes("# LConnect")) {
    throw new Error("README result missing expected content");
  }

  const telemetryResult = await call("tool_telemetry", {
    action: "snapshot",
    limit: 50,
    include_events: true,
  });
  const telemetry = jsonOf(telemetryResult);

  const batchEvent = telemetry.events
    .filter((event) => event.tool_name === "batch_inspect")
    .at(-1);
  if (!batchEvent) throw new Error("Outer batch_inspect telemetry event missing");

  const internalNames = new Set([
    "list_sessions",
    "system_info",
    "git_status",
    "read_text_file",
    "get_file_info",
  ]);
  const internalEvents = telemetry.events.filter((event) =>
    internalNames.has(event.tool_name)
  );

  if (internalEvents.length < 5) {
    throw new Error(`Internal telemetry events missing: ${JSON.stringify(telemetry.events)}`);
  }
  if (!internalEvents.every((event) => event.request_id === batchEvent.request_id)) {
    throw new Error("Internal batch telemetry did not preserve common MCP request ID");
  }

  // Non-allowlisted mutation must never execute.
  const forbiddenPath = path.join(root, "tests", "_batch-forbidden-write.tmp");
  try { fs.rmSync(forbiddenPath, { force: true }); } catch {}

  const continueBatch = jsonOf(await call("batch_inspect", {
    operations: [
      { id: "before", tool: "list_sessions", arguments: {} },
      {
        id: "blocked",
        tool: "write_file",
        arguments: { path: forbiddenPath, content: "MUST_NOT_BE_WRITTEN" },
      },
      { id: "after", tool: "system_info", arguments: {} },
    ],
    stop_on_error: false,
  }));

  if (continueBatch.completed_operations !== 3 || continueBatch.stopped_early) {
    throw new Error("stop_on_error=false behavior incorrect");
  }
  if (continueBatch.results[1].error_code !== "TOOL_NOT_ALLOWED") {
    throw new Error("Mutation tool was not rejected with TOOL_NOT_ALLOWED");
  }
  if (!continueBatch.results[2].ok) {
    throw new Error("Batch did not continue after blocked tool");
  }
  if (fs.existsSync(forbiddenPath)) {
    throw new Error("Blocked write_file operation unexpectedly executed");
  }

  const blockedGitBranch = jsonOf(await call("batch_inspect", {
    operations: [{
      id: "git-branch-mutation",
      tool: "git_branch",
      arguments: { repo_path: tempGitRoot, action: "create", name: "MUST_NOT_EXIST" },
    }],
  }));
  if (blockedGitBranch.results[0]?.error_code !== "TOOL_NOT_ALLOWED") {
    throw new Error("git_branch mutation surface was not rejected by batch allowlist");
  }
  const branchCheck = spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/MUST_NOT_EXIST"], {
    cwd: tempGitRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (branchCheck.status === 0) {
    throw new Error("Blocked git_branch mutation unexpectedly executed");
  }

  const stopBatch = jsonOf(await call("batch_inspect", {
    operations: [
      { id: "before", tool: "list_sessions", arguments: {} },
      {
        id: "blocked",
        tool: "write_file",
        arguments: { path: forbiddenPath, content: "MUST_NOT_BE_WRITTEN" },
      },
      { id: "never", tool: "system_info", arguments: {} },
    ],
    stop_on_error: true,
  }));

  if (!stopBatch.stopped_early || stopBatch.completed_operations !== 2) {
    throw new Error(`stop_on_error=true behavior incorrect: ${JSON.stringify(stopBatch)}`);
  }
  if (stopBatch.results.some((x) => x.id === "never")) {
    throw new Error("Batch executed operation after stop_on_error failure");
  }

  const bounded = jsonOf(await call("batch_inspect", {
    operations: [
      { id: "a", tool: "read_text_file", arguments: { path: readmePath } },
      { id: "b", tool: "read_text_file", arguments: { path: readmePath } },
    ],
    max_chars_per_result: 600,
    max_total_chars: 1000,
  }));

  if (bounded.returned_result_chars > 1000) {
    throw new Error("Batch total result character bound exceeded");
  }
  if (bounded.results.some((x) => x.returned_chars > 600)) {
    throw new Error("Batch per-result character bound exceeded");
  }
  if (!bounded.results.some((x) => x.truncated)) {
    throw new Error("Expected explicit truncation evidence");
  }

  const direct = await call("list_sessions");
  if (direct.isError) throw new Error("Direct tool behavior regressed after batch calls");

  console.log("batch_inspect runtime_catalog visibility: PASS");
  console.log("batch_inspect five-operation single call: PASS");
  console.log("batch_inspect ordered results: PASS");
  console.log("batch_inspect read-only allowlist guard: PASS");
  console.log("batch_inspect stop_on_error semantics: PASS");
  console.log("batch_inspect result bounds/truncation: PASS");
  console.log("batch_inspect telemetry correlation: PASS");
  console.log("direct tool compatibility: PASS");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
  if (tempGitRoot) {
    try { fs.rmSync(tempGitRoot, { recursive: true, force: true }); } catch {}
  }
}
