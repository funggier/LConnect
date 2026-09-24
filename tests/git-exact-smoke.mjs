import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-git-exact-"));
const repo = path.join(fixture, "work");
const remote = path.join(fixture, "remote.git");
fs.mkdirSync(repo, { recursive: true });

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      "git " + args.join(" ") + " failed:\n" + (result.stderr || result.stdout || "")
    );
  }
  return (result.stdout || "").trim();
}

git(fixture, ["init", "--bare", remote]);
git(repo, ["init"]);
git(repo, ["config", "user.name", "LConnect Test"]);
git(repo, ["config", "user.email", "lconnect@example.invalid"]);
fs.writeFileSync(path.join(repo, "state.txt"), "A\n", "utf8");
git(repo, ["add", "state.txt"]);
git(repo, ["commit", "-m", "A"]);
git(repo, ["branch", "-M", "main"]);
const shaA = git(repo, ["rev-parse", "HEAD"]).toLowerCase();
git(repo, ["remote", "add", "origin", remote]);
git(repo, ["push", "-u", "origin", "main"]);

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
  { name: "lconnect-git-exact-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(textOf(result) || name + " failed");
  return jsonOf(result);
}

try {
  await client.connect(transport);

  const initialRemote = await call("git_remote_ref", {
    repo_path: repo,
    remote: "origin",
    ref: "refs/heads/main",
  });
  if (!initialRemote.found || initialRemote.sha !== shaA) {
    throw new Error("exact remote ref lookup failed");
  }

  fs.appendFileSync(path.join(repo, "state.txt"), "B\n", "utf8");
  git(repo, ["add", "state.txt"]);
  git(repo, ["commit", "-m", "B"]);
  const shaB = git(repo, ["rev-parse", "HEAD"]).toLowerCase();

  const forward = await call("git_is_ancestor", {
    repo_path: repo,
    ancestor: shaA,
    descendant: shaB,
  });
  if (
    forward.ancestor_sha !== shaA ||
    forward.descendant_sha !== shaB ||
    forward.is_ancestor !== true
  ) {
    throw new Error("ancestor true case failed");
  }

  const reverse = await call("git_is_ancestor", {
    repo_path: repo,
    ancestor: shaB,
    descendant: shaA,
  });
  if (reverse.is_ancestor !== false) {
    throw new Error("ancestor false case failed");
  }

  const pushed = await call("git_push_ref", {
    repo_path: repo,
    remote: "origin",
    source: shaB,
    destination: "refs/heads/main",
  });
  if (
    pushed.remote_sha_before !== shaA ||
    pushed.remote_sha_after !== shaB ||
    pushed.source_sha !== shaB ||
    pushed.fast_forward_verified !== true ||
    pushed.force_used !== false ||
    pushed.post_push_matches_source !== true
  ) {
    throw new Error("exact SHA fast-forward push evidence failed");
  }

  git(repo, ["switch", "-c", "diverge", shaA]);
  fs.writeFileSync(path.join(repo, "diverge.txt"), "C\n", "utf8");
  git(repo, ["add", "diverge.txt"]);
  git(repo, ["commit", "-m", "C"]);
  const shaC = git(repo, ["rev-parse", "HEAD"]).toLowerCase();

  const nonFastForward = await client.callTool({
    name: "git_push_ref",
    arguments: {
      repo_path: repo,
      remote: "origin",
      source: shaC,
      destination: "refs/heads/main",
    },
  });
  if (!nonFastForward.isError) {
    throw new Error("non-fast-forward push should be rejected");
  }
  const nff = jsonOf(nonFastForward);
  if (nff.error_code !== "NON_FAST_FORWARD") {
    throw new Error("non-fast-forward rejection missing structured error");
  }

  const unchangedRemote = await call("git_remote_ref", {
    repo_path: repo,
    remote: "origin",
    ref: "refs/heads/main",
  });
  if (unchangedRemote.sha !== shaB) {
    throw new Error("remote changed after rejected non-fast-forward push");
  }

  const createRef = await call("git_push_ref", {
    repo_path: repo,
    remote: "origin",
    source: shaB,
    destination: "refs/heads/release-test",
  });
  if (
    createRef.created !== true ||
    createRef.remote_sha_before !== null ||
    createRef.remote_sha_after !== shaB
  ) {
    throw new Error("new exact branch ref creation failed");
  }

  const missing = await call("git_remote_ref", {
    repo_path: repo,
    remote: "origin",
    ref: "refs/heads/does-not-exist",
  });
  if (missing.found !== false || missing.sha !== null) {
    throw new Error("missing remote ref evidence failed");
  }

  const shortRef = await client.callTool({
    name: "git_remote_ref",
    arguments: { repo_path: repo, remote: "origin", ref: "main" },
  });
  if (!shortRef.isError) throw new Error("short remote ref should be rejected");

  const ambiguousSource = await client.callTool({
    name: "git_push_ref",
    arguments: {
      repo_path: repo,
      remote: "origin",
      source: "HEAD",
      destination: "refs/heads/ambiguous-source",
    },
  });
  if (!ambiguousSource.isError) {
    throw new Error("non-exact push source should be rejected");
  }

  const tagDestination = await client.callTool({
    name: "git_push_ref",
    arguments: {
      repo_path: repo,
      remote: "origin",
      source: shaB,
      destination: "refs/tags/v-test",
    },
  });
  if (!tagDestination.isError) {
    throw new Error("tag destination should be rejected by first contract");
  }

  console.log("git_remote_ref exact lookup/missing: PASS");
  console.log("git_is_ancestor exact SHA true/false: PASS");
  console.log("git_push_ref exact SHA fast-forward: PASS");
  console.log("git_push_ref non-fast-forward rejection: PASS");
  console.log("git_push_ref before/after evidence: PASS");
  console.log("git_push_ref invalid source/ref/tag rejection: PASS");
} finally {
  await transport.close().catch(() => {});
  try { fs.rmSync(fixture, { recursive: true, force: true }); } catch {}
}
