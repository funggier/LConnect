import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-git-sync-"));
const repo = path.join(fixture, "work");
const peer = path.join(fixture, "peer");
const remote = path.join(fixture, "remote.git");
fs.mkdirSync(repo, { recursive: true });

function git(cwd, args, allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      "git " + args.join(" ") + " failed:\n" + (result.stderr || result.stdout || "")
    );
  }
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function gitOk(cwd, args) {
  return git(cwd, args).stdout;
}

gitOk(fixture, ["init", "--bare", remote]);
gitOk(repo, ["init"]);
gitOk(repo, ["config", "user.name", "LConnect Test"]);
gitOk(repo, ["config", "user.email", "lconnect@example.invalid"]);
fs.writeFileSync(path.join(repo, "state.txt"), "A\n", "utf8");
gitOk(repo, ["add", "state.txt"]);
gitOk(repo, ["commit", "-m", "A"]);
gitOk(repo, ["branch", "-M", "main"]);
const shaA = gitOk(repo, ["rev-parse", "HEAD"]).toLowerCase();
gitOk(repo, ["remote", "add", "origin", remote]);
gitOk(repo, ["push", "-u", "origin", "main"]);

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
const client = new Client(
  { name: "lconnect-git-sync-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

async function call(args, expectError = false) {
  const result = await client.callTool({
    name: "git_sync_status",
    arguments: args,
  });
  const text = textOf(result);
  if (Boolean(result.isError) !== expectError) {
    throw new Error(
      "unexpected isError=" + Boolean(result.isError) +
      " for " + JSON.stringify(args) + ": " + text
    );
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    result,
    data,
  };
}

try {
  await client.connect(transport);

  const initial = (await call({ repo_path: repo })).data;
  if (
    initial.sync_state !== "equal" ||
    initial.local.head !== shaA ||
    initial.local.branch !== "main" ||
    initial.target.source !== "branch-config" ||
    initial.target.remote !== "origin" ||
    initial.target.ref !== "refs/heads/main" ||
    initial.exact_remote.sha !== shaA ||
    initial.exact_remote.matches_local_head !== true ||
    initial.local_tracking.sha !== shaA ||
    initial.local_tracking.matches_exact_remote !== true ||
    initial.exact_ancestry_available !== true ||
    initial.working_tree.clean !== true
  ) {
    throw new Error("initial exact synced state failed");
  }

  fs.writeFileSync(path.join(repo, "dirty.txt"), "dirty\n", "utf8");
  const dirty = (await call({
    repo_path: repo,
    max_status_entries: 1,
  })).data;
  if (
    dirty.sync_state !== "equal" ||
    dirty.working_tree.clean !== false ||
    dirty.working_tree.counts.untracked !== 1 ||
    dirty.working_tree.entries.length !== 1
  ) {
    throw new Error("dirty tree independence failed");
  }
  fs.unlinkSync(path.join(repo, "dirty.txt"));

  fs.appendFileSync(path.join(repo, "state.txt"), "B\n", "utf8");
  gitOk(repo, ["add", "state.txt"]);
  gitOk(repo, ["commit", "-m", "B"]);
  const shaB = gitOk(repo, ["rev-parse", "HEAD"]).toLowerCase();

  const localAhead = (await call({ repo_path: repo })).data;
  if (
    localAhead.sync_state !== "local_ahead" ||
    localAhead.exact_remote.sha !== shaA ||
    localAhead.exact_remote.ahead !== 1 ||
    localAhead.exact_remote.behind !== 0 ||
    localAhead.exact_remote.remote_is_ancestor_of_local !== true ||
    localAhead.local_tracking.sha !== shaA ||
    localAhead.local_tracking.matches_exact_remote !== true
  ) {
    throw new Error("local-ahead state failed");
  }

  gitOk(repo, ["push", "origin", "main"]);
  const afterPush = (await call({ repo_path: repo })).data;
  if (
    afterPush.sync_state !== "equal" ||
    afterPush.exact_remote.sha !== shaB ||
    afterPush.local_tracking.matches_exact_remote !== true
  ) {
    throw new Error("post-push equal state failed");
  }

  gitOk(fixture, ["clone", "-b", "main", remote, peer]);
  gitOk(peer, ["config", "user.name", "LConnect Peer"]);
  gitOk(peer, ["config", "user.email", "peer@example.invalid"]);
  fs.appendFileSync(path.join(peer, "state.txt"), "C\n", "utf8");
  gitOk(peer, ["add", "state.txt"]);
  gitOk(peer, ["commit", "-m", "C"]);
  const shaC = gitOk(peer, ["rev-parse", "HEAD"]).toLowerCase();
  gitOk(peer, ["push", "origin", "main"]);

  const trackingBefore = gitOk(repo, ["rev-parse", "origin/main"]).toLowerCase();
  if (trackingBefore !== shaB) {
    throw new Error("expected stale tracking ref before exact remote check");
  }
  const objectBefore = git(repo, ["cat-file", "-e", shaC + "^{commit}"], true);
  if (objectBefore.status === 0) {
    throw new Error("remote-only commit unexpectedly exists locally before exact check");
  }

  const remoteNotLocal = (await call({ repo_path: repo })).data;
  if (
    remoteNotLocal.sync_state !== "remote_object_not_local" ||
    remoteNotLocal.exact_remote.sha !== shaC ||
    remoteNotLocal.exact_remote.object_available_locally !== false ||
    remoteNotLocal.exact_ancestry_available !== false ||
    remoteNotLocal.local_tracking.sha !== shaB ||
    remoteNotLocal.local_tracking.matches_exact_remote !== false
  ) {
    throw new Error("remote-object-not-local / stale tracking state failed");
  }

  const trackingAfter = gitOk(repo, ["rev-parse", "origin/main"]).toLowerCase();
  const objectAfter = git(repo, ["cat-file", "-e", shaC + "^{commit}"], true);
  if (trackingAfter !== shaB || objectAfter.status === 0) {
    throw new Error("git_sync_status performed an implicit fetch/mutation");
  }

  gitOk(repo, ["fetch", "origin"]);
  const remoteAhead = (await call({ repo_path: repo })).data;
  if (
    remoteAhead.sync_state !== "remote_ahead" ||
    remoteAhead.exact_remote.sha !== shaC ||
    remoteAhead.exact_remote.object_available_locally !== true ||
    remoteAhead.exact_remote.ahead !== 0 ||
    remoteAhead.exact_remote.behind !== 1 ||
    remoteAhead.exact_remote.local_is_ancestor_of_remote !== true ||
    remoteAhead.local_tracking.sha !== shaC ||
    remoteAhead.local_tracking.matches_exact_remote !== true
  ) {
    throw new Error("remote-ahead state after explicit fetch failed");
  }

  fs.writeFileSync(path.join(repo, "local.txt"), "D\n", "utf8");
  gitOk(repo, ["add", "local.txt"]);
  gitOk(repo, ["commit", "-m", "D"]);
  const diverged = (await call({ repo_path: repo })).data;
  if (
    diverged.sync_state !== "diverged" ||
    diverged.exact_remote.local_is_ancestor_of_remote !== false ||
    diverged.exact_remote.remote_is_ancestor_of_local !== false ||
    diverged.exact_remote.ahead !== 1 ||
    diverged.exact_remote.behind !== 1
  ) {
    throw new Error("diverged state failed");
  }

  const missing = (await call({
    repo_path: repo,
    remote: "origin",
    ref: "refs/heads/does-not-exist",
  })).data;
  if (
    missing.sync_state !== "remote_ref_missing" ||
    missing.exact_remote.found !== false ||
    missing.exact_remote.sha !== null
  ) {
    throw new Error("missing exact remote ref state failed");
  }

  gitOk(repo, ["switch", "-c", "scratch", shaA]);
  const explicit = (await call({
    repo_path: repo,
    remote: "origin",
    ref: "refs/heads/main",
  })).data;
  if (
    explicit.target.source !== "explicit" ||
    explicit.target.remote !== "origin" ||
    explicit.target.ref !== "refs/heads/main" ||
    explicit.exact_remote.sha !== shaC
  ) {
    throw new Error("explicit remote/ref on no-upstream branch failed");
  }

  const missingConfig = await call({ repo_path: repo }, true);
  if (
    !String(missingConfig.data).includes("Current branch has no configured remote/merge ref")
  ) {
    throw new Error("no-upstream implicit target should fail explicitly");
  }

  fs.writeFileSync(path.join(repo, "u1.txt"), "1\n", "utf8");
  fs.writeFileSync(path.join(repo, "u2.txt"), "2\n", "utf8");
  fs.writeFileSync(path.join(repo, "u3.txt"), "3\n", "utf8");
  const bounded = (await call({
    repo_path: repo,
    remote: "origin",
    ref: "refs/heads/main",
    max_status_entries: 1,
  })).data;
  if (
    bounded.working_tree.total_entries < 3 ||
    bounded.working_tree.entries.length !== 1 ||
    bounded.working_tree.entries_truncated !== true
  ) {
    throw new Error("bounded working-tree status entries failed");
  }

  console.log("git_sync_status exact synced state: PASS");
  console.log("git_sync_status dirty tree independence: PASS");
  console.log("git_sync_status local-ahead: PASS");
  console.log("git_sync_status stale tracking / remote object absent: PASS");
  console.log("git_sync_status no implicit fetch: PASS");
  console.log("git_sync_status remote-ahead after explicit fetch: PASS");
  console.log("git_sync_status diverged: PASS");
  console.log("git_sync_status missing remote ref: PASS");
  console.log("git_sync_status explicit no-upstream target: PASS");
  console.log("git_sync_status implicit no-upstream error: PASS");
  console.log("git_sync_status bounded status entries: PASS");
} finally {
  await transport.close().catch(() => {});
  try { fs.rmSync(fixture, { recursive: true, force: true }); } catch {}
}
