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
  { name: "lconnect-process-session-smoke", version: "1.1.0" },
  { capabilities: {} }
);

let tempRoot = null;
const cleanup = {
  sessions: new Set(),
  followers: new Set(),
  watchers: new Set(),
};

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

async function startNode(code, label) {
  const result = await callJson("start_process", {
    program: process.execPath,
    args: ["-e", code],
    cwd: root,
    label,
  });
  cleanup.sessions.add(result.data.session_id);
  return result.data;
}

async function waitComplete(id, timeout = 5) {
  const result = await callJson("wait_session", {
    session_id: id,
    timeout_seconds: timeout,
    poll_interval_ms: 50,
    include_output_tail: true,
    output_tail_chars: 2000,
  });
  if (!result.data.completed) {
    throw new Error(`Session did not complete: ${JSON.stringify(result.data)}`);
  }
  return result.data;
}

try {
  await client.connect(transport);
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-session-smoke-"));

  // Bounded timeout + exact terminal state.
  const staged = await startNode(
    [
      "process.stdout.write('OUT1\\n');",
      "setTimeout(()=>process.stderr.write('ERR1\\n'), 80);",
      "setTimeout(()=>process.stdout.write('OUT2\\n'), 140);",
      "setTimeout(()=>process.exit(7), 220);",
    ].join(""),
    "wait-and-events-fixture"
  );

  if (staged.label !== "wait-and-events-fixture") {
    throw new Error("start_process did not preserve label");
  }

  const firstWait = await callJson("wait_session", {
    session_id: staged.session_id,
    timeout_seconds: 0.03,
    poll_interval_ms: 25,
    include_output_tail: true,
  });
  if (!firstWait.data.running || firstWait.data.completed || !firstWait.data.timed_out) {
    throw new Error(`wait_session timeout contract failed: ${JSON.stringify(firstWait.data)}`);
  }

  const completed = await waitComplete(staged.session_id, 5);
  if (completed.exit_code !== 7 || completed.running || !completed.completed || completed.timed_out) {
    throw new Error(`wait_session terminal contract failed: ${JSON.stringify(completed)}`);
  }
  if (!completed.completed_at) throw new Error("completed_at missing");
  if (!completed.output_tail.stdout.includes("OUT2") || !completed.output_tail.stderr.includes("ERR1")) {
    throw new Error("wait_session output tail missing expected streams");
  }

  const repeated = await callJson("wait_session", {
    session_id: staged.session_id,
    timeout_seconds: 0,
  });
  if (!repeated.data.completed || repeated.data.exit_code !== 7) {
    throw new Error("Repeated terminal wait is not idempotent");
  }

  const events = await callJson("read_process_events", {
    session_id: staged.session_id,
    after_seq: 0,
    max_events: 100,
  });
  const seqs = events.data.events.map((event) => event.seq);
  if (!seqs.length || !seqs.every((value, i) => i === 0 || value > seqs[i - 1])) {
    throw new Error("Process event sequence is not monotonic");
  }
  const outputStreams = new Set(
    events.data.events.filter((event) => event.type === "output").map((event) => event.stream)
  );
  if (!outputStreams.has("stdout") || !outputStreams.has("stderr")) {
    throw new Error(`Process events lost stream identity: ${JSON.stringify(events.data.events)}`);
  }
  if (!events.data.events.some((event) => event.type === "exit" && event.exit_code === 7)) {
    throw new Error("Process events missing exit event");
  }

  const noRepeat = await callJson("read_process_events", {
    session_id: staged.session_id,
    after_seq: events.data.next_cursor,
    max_events: 100,
  });
  if (noRepeat.data.event_count !== 0) {
    throw new Error("Cursor read repeated already-consumed process events");
  }

  const released = await callJson("release_session", {
    session_id: staged.session_id,
  });
  if (!released.data.released) throw new Error("release_session did not release terminal session");
  cleanup.sessions.delete(staged.session_id);

  const releasedRead = await client.callTool({
    name: "read_process_output",
    arguments: { session_id: staged.session_id },
  });
  if (!releasedRead.isError) throw new Error("Released session remained readable");

  // Parent process exit must be terminal even if a descendant keeps inherited stdio open.
  const exitBeforeClose = await startNode(
    [
      "const {spawn}=require('node:child_process');",
      "spawn(process.execPath,['-e','setTimeout(()=>{},800)'],{stdio:['ignore','inherit','inherit'],windowsHide:true});",
      "process.stdout.write('PARENT_EXIT\\n');",
      "process.exit(0);",
    ].join(""),
    "exit-before-close-fixture"
  );
  const exitBeforeCloseResult = await callJson("wait_session", {
    session_id: exitBeforeClose.session_id,
    timeout_seconds: 0.5,
    poll_interval_ms: 25,
  });
  if (!exitBeforeCloseResult.data.completed || exitBeforeCloseResult.data.exit_code !== 0) {
    throw new Error(`wait_session waited for pipe close instead of process exit: ${JSON.stringify(exitBeforeCloseResult.data)}`);
  }
  await callJson("release_session", { session_id: exitBeforeClose.session_id });
  cleanup.sessions.delete(exitBeforeClose.session_id);

  // Running sessions cannot be released.
  const running = await startNode("setInterval(()=>{},1000)", "running-release-guard");
  const releaseRunning = await callJson("release_session", {
    session_id: running.session_id,
  }, true);
  if (!releaseRunning.isError) throw new Error("release_session accepted a running session");

  await client.callTool({
    name: "terminate_process",
    arguments: { session_id: running.session_id },
  });
  await waitComplete(running.session_id, 5);
  await callJson("release_session", { session_id: running.session_id });
  cleanup.sessions.delete(running.session_id);

  // Prune dry-run and actual release.
  const pruneA = await startNode("process.exit(0)", "prune-a");
  const pruneB = await startNode("process.exit(0)", "prune-b");
  await waitComplete(pruneA.session_id, 5);
  await waitComplete(pruneB.session_id, 5);

  const pruneDry = await callJson("prune_sessions", {
    older_than_seconds: 0,
    dry_run: true,
  });
  for (const id of [pruneA.session_id, pruneB.session_id]) {
    if (!pruneDry.data.matched_session_ids.includes(id)) {
      throw new Error("prune_sessions dry-run did not match terminal session");
    }
  }

  const pruneReal = await callJson("prune_sessions", {
    older_than_seconds: 0,
    dry_run: false,
  });
  for (const id of [pruneA.session_id, pruneB.session_id]) {
    if (!pruneReal.data.released_session_ids.includes(id)) {
      throw new Error("prune_sessions did not release terminal session");
    }
    cleanup.sessions.delete(id);
  }

  // Cursor overflow must be explicit.
  const overflow = await startNode(
    "process.stdout.write('X'.repeat(700000));",
    "overflow-fixture"
  );
  await waitComplete(overflow.session_id, 5);
  const overflowEvents = await callJson("read_process_events", {
    session_id: overflow.session_id,
    after_seq: 0,
    max_events: 1000,
  });
  if (!overflowEvents.data.overflowed || overflowEvents.data.earliest_available_seq <= 1) {
    throw new Error(`Process event overflow was not explicit: ${JSON.stringify(overflowEvents.data)}`);
  }
  await callJson("release_session", { session_id: overflow.session_id });
  cleanup.sessions.delete(overflow.session_id);

  // refresh_state inventory + safe pruning.
  const logPath = path.join(tempRoot, "fixture.log");
  await fsp.writeFile(logPath, "initial\n", "utf8");

  const follower = await callJson("follow_log", {
    path: logPath,
    from_end: true,
    poll_interval_ms: 100,
  });
  cleanup.followers.add(follower.data.follower_id);

  const watcher = await callJson("watch_path", {
    path: tempRoot,
    recursive: false,
  });
  cleanup.watchers.add(watcher.data.watcher_id);

  const refreshRunning = await startNode("setInterval(()=>{},1000)", "refresh-running");
  const refreshDone = await startNode("process.exit(0)", "refresh-terminal");
  await waitComplete(refreshDone.session_id, 5);

  const refreshDry = await callJson("refresh_state", {
    scope: "all",
    prune_terminal: true,
    older_than_seconds: 0,
    dry_run: true,
  });

  if (!refreshDry.data.process_sessions.before.running.some((x) => x.session_id === refreshRunning.session_id)) {
    throw new Error("refresh_state did not inventory running process session");
  }
  if (!refreshDry.data.process_sessions.before.terminal.some((x) => x.session_id === refreshDone.session_id)) {
    throw new Error("refresh_state did not inventory terminal process session");
  }
  if (!refreshDry.data.log_followers.active.some((x) => x.follower_id === follower.data.follower_id)) {
    throw new Error("refresh_state did not inventory active log follower");
  }
  if (!refreshDry.data.file_watchers.active.some((x) => x.watcher_id === watcher.data.watcher_id)) {
    throw new Error("refresh_state did not inventory active file watcher");
  }
  if (refreshDry.data.persistent_os_state_modified !== false) {
    throw new Error("refresh_state persistent OS mutation contract failed");
  }

  const refreshReal = await callJson("refresh_state", {
    scope: "all",
    prune_terminal: true,
    older_than_seconds: 0,
    dry_run: false,
  });
  if (!refreshReal.data.process_sessions.prune.released_session_ids.includes(refreshDone.session_id)) {
    throw new Error("refresh_state did not prune eligible terminal session");
  }
  if (!refreshReal.data.process_sessions.after.running.some((x) => x.session_id === refreshRunning.session_id)) {
    throw new Error("refresh_state modified running process session");
  }
  if (!refreshReal.data.log_followers.active.some((x) => x.follower_id === follower.data.follower_id)) {
    throw new Error("refresh_state stopped active log follower");
  }
  if (!refreshReal.data.file_watchers.active.some((x) => x.watcher_id === watcher.data.watcher_id)) {
    throw new Error("refresh_state stopped active file watcher");
  }
  cleanup.sessions.delete(refreshDone.session_id);

  await client.callTool({
    name: "terminate_process",
    arguments: { session_id: refreshRunning.session_id },
  });
  await waitComplete(refreshRunning.session_id, 5);
  await callJson("release_session", { session_id: refreshRunning.session_id });
  cleanup.sessions.delete(refreshRunning.session_id);

  await callJson("stop_log_follow", { follower_id: follower.data.follower_id });
  cleanup.followers.delete(follower.data.follower_id);
  await callJson("stop_watch", { watcher_id: watcher.data.watcher_id });
  cleanup.watchers.delete(watcher.data.watcher_id);

  console.log("wait_session bounded timeout/completion/idempotence: PASS");
  console.log("process label + completed_at: PASS");
  console.log("read_process_events cursor/stream/exit: PASS");
  console.log("read_process_events overflow metadata: PASS");
  console.log("wait_session exit-vs-pipe-close lifecycle: PASS");
  console.log("release_session running guard/terminal release: PASS");
  console.log("prune_sessions dry-run/terminal cleanup: PASS");
  console.log("refresh_state preserves active process/log/watch: PASS");
  console.log("refresh_state safe terminal prune: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  for (const id of cleanup.followers) {
    await client.callTool({
      name: "stop_log_follow",
      arguments: { follower_id: id },
    }).catch(() => {});
  }
  for (const id of cleanup.watchers) {
    await client.callTool({
      name: "stop_watch",
      arguments: { watcher_id: id },
    }).catch(() => {});
  }
  for (const id of cleanup.sessions) {
    await client.callTool({
      name: "terminate_process",
      arguments: { session_id: id },
    }).catch(() => {});
  }
  await transport.close().catch(() => {});
  if (tempRoot) {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}
