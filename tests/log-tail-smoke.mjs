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

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

const client = new Client(
  { name: "lconnect-log-tail-smoke", version: "1.0.2" },
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
    if (result.isError && allowError) return { data: text, isError: true };
    throw new Error(`${name} returned non-JSON output: ${text}\n${error.message}`);
  }
}

try {
  await client.connect(transport);

  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-log-tail-smoke-"));
  const logPath = path.join(tempRoot, "app.log");
  const rotatedPath = path.join(tempRoot, "app.log.1");

  await fsp.writeFile(logPath, "one\ntwo\nthree\n", "utf8");

  const tail = await callJson("tail_file", {
    path: logPath,
    lines: 2,
    max_bytes: 1024,
  });
  if (tail.data.returned_lines !== 2 || tail.data.lines.join("|") !== "two|three") {
    throw new Error(`tail_file failed: ${JSON.stringify(tail.data)}`);
  }

  const follow = await callJson("follow_log", {
    path: logPath,
    from_end: true,
    poll_interval_ms: 5000,
    max_buffer_chars: 20000,
    max_read_bytes: 4096,
  });
  const followerId = follow.data.follower_id;
  if (!followerId) throw new Error("follow_log did not return follower_id");

  let cursor = 0;

  await fsp.appendFile(logPath, "append-A\nappend-B\n", "utf8");
  const appended = await callJson("read_log_events", {
    follower_id: followerId,
    after_seq: cursor,
  });
  const appendEvent = appended.data.events.find((event) => event.type === "append");
  if (!appendEvent || !appendEvent.text.includes("append-A") || !appendEvent.text.includes("append-B")) {
    throw new Error(`follow append event failed: ${JSON.stringify(appended.data)}`);
  }
  cursor = appended.data.next_cursor;

  await fsp.writeFile(logPath, "after-truncate\n", "utf8");
  const truncated = await callJson("read_log_events", {
    follower_id: followerId,
    after_seq: cursor,
  });
  if (!truncated.data.events.some((event) => event.type === "truncate")) {
    throw new Error(`truncate event missing: ${JSON.stringify(truncated.data)}`);
  }
  const truncateAppend = truncated.data.events.find((event) => event.type === "append");
  if (!truncateAppend || !truncateAppend.text.includes("after-truncate")) {
    throw new Error("truncated file new content was not emitted");
  }
  cursor = truncated.data.next_cursor;

  await fsp.rename(logPath, rotatedPath);
  await fsp.writeFile(logPath, "rotated-start\nERROR rotated failure\n", "utf8");

  const rotated = await callJson("read_log_events", {
    follower_id: followerId,
    after_seq: cursor,
  });
  if (!rotated.data.events.some((event) => event.type === "rotate")) {
    throw new Error(`rotate event missing: ${JSON.stringify(rotated.data)}`);
  }
  const rotateAppend = rotated.data.events.find((event) => event.type === "append");
  if (!rotateAppend || !rotateAppend.text.includes("rotated-start")) {
    throw new Error("replacement log content was not emitted");
  }
  cursor = rotated.data.next_cursor;

  const emptyRead = await callJson("read_log_events", {
    follower_id: followerId,
    after_seq: cursor,
  });
  if (emptyRead.data.event_count !== 0 || emptyRead.data.next_cursor !== cursor) {
    throw new Error("cursor read without new events was not stable");
  }

  const search = await callJson("search_log", {
    path: logPath,
    query: "error\\s+rotated",
    regex: true,
    case_sensitive: false,
    max_matches: 10,
  });
  if (search.data.match_count !== 1 || !search.data.matches[0].text.includes("ERROR")) {
    throw new Error(`search_log regex failed: ${JSON.stringify(search.data)}`);
  }

  const stopped = await callJson("stop_log_follow", {
    follower_id: followerId,
  });
  if (!stopped.data.stopped || stopped.data.follower.running !== false) {
    throw new Error("stop_log_follow did not stop follower");
  }

  const missing = await callJson("read_log_events", {
    follower_id: followerId,
  }, true);
  if (!missing.isError || !String(missing.data).includes("Unknown log follower")) {
    throw new Error("stopped follower remained readable");
  }

  console.log("tail_file bounded last-lines: PASS");
  console.log("follow_log append event: PASS");
  console.log("follow_log truncate event: PASS");
  console.log("follow_log rotate event: PASS");
  console.log("read_log_events cursor stability: PASS");
  console.log("search_log regex: PASS");
  console.log("stop_log_follow cleanup: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
