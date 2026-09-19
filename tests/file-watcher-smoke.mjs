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
  { name: "lconnect-file-watcher-smoke", version: "1.1.0" },
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

async function waitForEvent(watcherId, afterSeq, predicate, timeoutMs = 5000) {
  const started = Date.now();
  let cursor = afterSeq;
  const seen = [];

  while (Date.now() - started < timeoutMs) {
    const result = await callJson("watch_events", {
      watcher_id: watcherId,
      after_seq: cursor,
      max_events: 200,
    });
    if (result.data.events.length) {
      seen.push(...result.data.events);
      cursor = result.data.next_cursor;
      const match = seen.find(predicate);
      if (match) return { cursor, match, seen, snapshot: result.data.watcher };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for watcher event. Seen=${JSON.stringify(seen)}`);
}

try {
  await client.connect(transport);

  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-file-watcher-smoke-"));

  const started = await callJson("watch_path", {
    path: tempRoot,
    recursive: true,
    max_buffer_events: 100,
  });
  const watcherId = started.data.watcher_id;
  if (!watcherId || !started.data.running || started.data.kind !== "directory") {
    throw new Error(`watch_path did not create directory watcher: ${JSON.stringify(started.data)}`);
  }
  if (process.platform === "win32" && started.data.backend !== "dotnet-filesystemwatcher") {
    throw new Error(`Windows watcher did not use .NET backend: ${JSON.stringify(started.data)}`);
  }

  const status = await callJson("watch_status", { watcher_id: watcherId });
  if (!status.data.running || status.data.recursive !== true) {
    throw new Error("watch_status did not report running recursive watcher");
  }

  let cursor = 0;
  const fileA = path.join(tempRoot, "a.txt");
  await fsp.writeFile(fileA, "one\n", "utf8");
  const created = await waitForEvent(
    watcherId,
    cursor,
    (event) => event.type === "fs" && path.basename(event.path).toLowerCase() === "a.txt"
  );
  cursor = created.cursor;

  await fsp.appendFile(fileA, "two\n", "utf8");
  const changed = await waitForEvent(
    watcherId,
    cursor,
    (event) => event.type === "fs" && path.basename(event.path).toLowerCase() === "a.txt"
  );
  cursor = changed.cursor;

  const nestedDir = path.join(tempRoot, "nested");
  await fsp.mkdir(nestedDir);
  const nestedDirectoryEvent = await waitForEvent(
    watcherId,
    cursor,
    (event) => event.type === "fs" && path.basename(event.path).toLowerCase() === "nested"
  );
  cursor = nestedDirectoryEvent.cursor;

  const nestedFile = path.join(nestedDir, "child.txt");
  await fsp.writeFile(nestedFile, "nested\n", "utf8");
  const nested = await waitForEvent(
    watcherId,
    cursor,
    (event) => event.type === "fs" && path.basename(event.path).toLowerCase() === "child.txt"
  );
  cursor = nested.cursor;

  const fileB = path.join(tempRoot, "b.txt");
  await fsp.rename(fileA, fileB);
  const renamed = await waitForEvent(
    watcherId,
    cursor,
    (event) => event.type === "fs" && ["a.txt", "b.txt"].includes(path.basename(event.path).toLowerCase())
  );
  cursor = renamed.cursor;

  await fsp.rm(fileB);
  const removed = await waitForEvent(
    watcherId,
    cursor,
    (event) => event.type === "fs" && path.basename(event.path).toLowerCase() === "b.txt"
  );
  cursor = removed.cursor;

  const cursorRead = await callJson("watch_events", {
    watcher_id: watcherId,
    after_seq: cursor,
  });
  if (cursorRead.data.next_cursor !== cursor) {
    throw new Error("watch_events cursor moved without returning events");
  }

  const stopped = await callJson("stop_watch", { watcher_id: watcherId });
  if (!stopped.data.stopped || stopped.data.watcher.running !== false) {
    throw new Error("stop_watch did not stop watcher");
  }

  const missing = await callJson("watch_status", { watcher_id: watcherId }, true);
  if (!missing.isError || !String(missing.data).includes("Unknown watcher")) {
    throw new Error("stopped watcher remained in registry");
  }

  console.log("watch_path recursive directory: PASS");
  console.log("watch_status: PASS");
  console.log("watch_events create/change: PASS");
  console.log("watch_events recursive nested file: PASS");
  console.log("watch_events rename/delete: PASS");
  console.log("watch_events cursor stability: PASS");
  console.log("stop_watch cleanup: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
