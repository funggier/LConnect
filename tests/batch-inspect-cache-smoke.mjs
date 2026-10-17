import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.LCONNECT_TELEMETRY_ENABLED = "true";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

const client = new Client(
  { name: "lconnect-batch-cache-smoke", version: "1.0.0" },
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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-cache-"));
const target = path.join(tempRoot, "state.txt");

try {
  fs.writeFileSync(target, "alpha\n".repeat(200), "utf8");
  await client.connect(transport);
  await call("tool_telemetry", { action: "clear" });

  const first = jsonOf(await call("batch_inspect", {
    operations: [{
      id: "state",
      tool: "read_text_file",
      arguments: { path: target },
    }],
    max_chars_per_result: 4000,
    max_total_chars: 4000,
  }));

  const firstItem = first.results[0];
  if (!firstItem?.ok || firstItem.not_modified || firstItem.execution_skipped) {
    throw new Error("Initial conditional-cache read did not return normal content");
  }
  if (!/^[0-9a-f]{64}$/.test(firstItem.result_digest_sha256 || "")) {
    throw new Error("Initial result digest missing or invalid");
  }
  if (!firstItem.result_text.includes("alpha")) {
    throw new Error("Initial result content missing");
  }

  const telemetryAfterFirst = jsonOf(await call("tool_telemetry", {
    action: "snapshot",
    limit: 100,
    include_events: true,
  }));
  const readsAfterFirst = telemetryAfterFirst.events.filter(
    (event) => event.tool_name === "read_text_file"
  ).length;

  const second = jsonOf(await call("batch_inspect", {
    cache_max_age_ms: 60000,
    operations: [{
      id: "state",
      tool: "read_text_file",
      arguments: { path: target },
      known_digest: firstItem.result_digest_sha256,
    }],
  }));

  const secondItem = second.results[0];
  if (
    secondItem?.not_modified !== true ||
    secondItem?.result_suppressed !== true ||
    secondItem?.cache_hit !== true ||
    secondItem?.execution_skipped !== true ||
    secondItem?.result_text !== ""
  ) {
    throw new Error("Fresh digest-cache short circuit failed");
  }
  if (second.conditional_cache?.cache_short_circuits !== 1) {
    throw new Error("Cache short-circuit summary missing");
  }
  if ((second.conditional_cache?.estimated_saved_chars ?? 0) < firstItem.result_chars) {
    throw new Error("Saved-character evidence missing for cache short circuit");
  }

  const telemetryAfterSecond = jsonOf(await call("tool_telemetry", {
    action: "snapshot",
    limit: 100,
    include_events: true,
  }));
  const readsAfterSecond = telemetryAfterSecond.events.filter(
    (event) => event.tool_name === "read_text_file"
  ).length;
  if (readsAfterSecond !== readsAfterFirst) {
    throw new Error("Underlying read_text_file unexpectedly executed on fresh cache hit");
  }

  const third = jsonOf(await call("batch_inspect", {
    cache_max_age_ms: 0,
    operations: [{
      id: "state",
      tool: "read_text_file",
      arguments: { path: target },
      known_digest: firstItem.result_digest_sha256,
    }],
  }));

  const thirdItem = third.results[0];
  if (
    thirdItem?.not_modified !== true ||
    thirdItem?.execution_skipped !== false ||
    thirdItem?.cache_hit !== false ||
    thirdItem?.result_text !== ""
  ) {
    throw new Error("Fresh revalidation did not suppress unchanged payload");
  }
  if (third.conditional_cache?.revalidated_not_modified !== 1) {
    throw new Error("Revalidated-not-modified summary missing");
  }

  fs.writeFileSync(target, "beta\n".repeat(200), "utf8");

  const changed = jsonOf(await call("batch_inspect", {
    cache_max_age_ms: 0,
    operations: [{
      id: "state",
      tool: "read_text_file",
      arguments: { path: target },
      known_digest: firstItem.result_digest_sha256,
    }],
    max_chars_per_result: 4000,
    max_total_chars: 4000,
  }));

  const changedItem = changed.results[0];
  if (
    !changedItem?.ok ||
    changedItem.not_modified ||
    changedItem.result_digest_sha256 === firstItem.result_digest_sha256 ||
    !changedItem.result_text.includes("beta")
  ) {
    throw new Error("Changed content was not returned after forced revalidation");
  }
  if (changed.conditional_cache?.changed_results !== 1) {
    throw new Error("Changed-result summary missing");
  }

  const freshChanged = jsonOf(await call("batch_inspect", {
    cache_max_age_ms: 60000,
    operations: [{
      id: "state",
      tool: "read_text_file",
      arguments: { path: target },
      known_digest: changedItem.result_digest_sha256,
    }],
  }));
  if (
    freshChanged.results[0]?.execution_skipped !== true ||
    freshChanged.results[0]?.not_modified !== true
  ) {
    throw new Error("Updated digest was not reusable for a fresh cache hit");
  }

  console.log("batch_inspect digest generation: PASS");
  console.log("batch_inspect digest-only cache short circuit: PASS");
  console.log("batch_inspect unchanged fresh revalidation suppression: PASS");
  console.log("batch_inspect changed-content invalidation: PASS");
  console.log("batch_inspect no-content-retention contract: PASS");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}
