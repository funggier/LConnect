import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const sourceRoot = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1))));
const root = process.platform === "win32"
  ? path.normalize(sourceRoot)
  : sourceRoot;

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
  { name: "lconnect-git-smoke", version: "1.1.0" },
  { capabilities: {} }
);

const git = process.platform === "win32" ? "git.exe" : "git";
let tempRoot = null;

function gitExec(args, cwd) {
  return execFileSync(git, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

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
    throw new Error(`${name} returned non-JSON output: ${text}\n${error.message}`);
  }
}

try {
  await client.connect(transport);

  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-git-smoke-"));
  const remote = path.join(tempRoot, "remote.git");
  const repoA = path.join(tempRoot, "repo-a");
  const repoB = path.join(tempRoot, "repo-b");
  const worktree = path.join(tempRoot, "worktree");

  gitExec(["init", "--bare", remote], tempRoot);
  gitExec(["init", "-b", "main", repoA], tempRoot);
  gitExec(["config", "user.name", "LConnect Test"], repoA);
  gitExec(["config", "user.email", "lconnect-test@example.invalid"], repoA);

  await fsp.writeFile(path.join(repoA, "alpha.txt"), "alpha\n", "utf8");

  const initialStatus = await callJson("git_status", { repo_path: repoA });
  if (initialStatus.data.clean || initialStatus.data.counts.untracked !== 1) {
    throw new Error(`git_status did not report initial untracked file: ${JSON.stringify(initialStatus.data)}`);
  }

  const initialCommit = await callJson("git_commit", {
    repo_path: repoA,
    message: "initial",
    paths: ["alpha.txt"],
  });
  if (!/^[0-9a-f]{40}$/i.test(initialCommit.data.commit_sha || "")) {
    throw new Error("git_commit did not return exact commit SHA");
  }

  const cleanStatus = await callJson("git_status", { repo_path: repoA });
  if (!cleanStatus.data.clean || cleanStatus.data.branch !== "main") {
    throw new Error(`git_status clean/main verification failed: ${JSON.stringify(cleanStatus.data)}`);
  }

  await fsp.appendFile(path.join(repoA, "alpha.txt"), "changed\n", "utf8");
  const diff = await callJson("git_diff", {
    repo_path: repoA,
    paths: ["alpha.txt"],
  });
  if (!diff.data.diff.includes("+changed") || diff.data.truncated) {
    throw new Error("git_diff did not return expected bounded diff");
  }

  const secondCommit = await callJson("git_commit", {
    repo_path: repoA,
    message: "second",
    paths: ["alpha.txt"],
  });
  if (secondCommit.data.before_sha === secondCommit.data.commit_sha) {
    throw new Error("git_commit did not advance HEAD");
  }

  const log = await callJson("git_log", {
    repo_path: repoA,
    limit: 5,
  });
  if (log.data.count < 2 || log.data.commits[0]?.subject !== "second") {
    throw new Error(`git_log did not return structured history: ${JSON.stringify(log.data)}`);
  }

  await callJson("git_branch", {
    repo_path: repoA,
    action: "create",
    name: "feature",
  });
  await callJson("git_branch", {
    repo_path: repoA,
    action: "switch",
    name: "feature",
  });

  const branchesOnFeature = await callJson("git_branch", {
    repo_path: repoA,
    action: "list",
  });
  if (
    branchesOnFeature.data.branch !== "feature" ||
    !branchesOnFeature.data.branches.some((item) => item.name === "feature" && item.current)
  ) {
    throw new Error("git_branch create/switch/list failed");
  }

  await callJson("git_branch", {
    repo_path: repoA,
    action: "switch",
    name: "main",
  });

  gitExec(["remote", "add", "origin", remote], repoA);
  const pushed = await callJson("git_push", {
    repo_path: repoA,
    remote: "origin",
    branch: "main",
    set_upstream: true,
  });
  if (!pushed.data.pushed || pushed.data.branch !== "main") {
    throw new Error("git_push did not report successful main push");
  }

  gitExec(["symbolic-ref", "HEAD", "refs/heads/main"], remote);
  gitExec(["clone", remote, repoB], tempRoot);
  gitExec(["config", "user.name", "LConnect Test B"], repoB);
  gitExec(["config", "user.email", "lconnect-test-b@example.invalid"], repoB);

  await fsp.writeFile(path.join(repoA, "remote-change.txt"), "from-a\n", "utf8");
  const thirdCommit = await callJson("git_commit", {
    repo_path: repoA,
    message: "remote change",
    paths: ["remote-change.txt"],
  });
  await callJson("git_push", {
    repo_path: repoA,
    remote: "origin",
    branch: "main",
  });

  const fetched = await callJson("git_fetch", {
    repo_path: repoB,
    remote: "origin",
    prune: true,
  });
  if (!fetched.data.fetched) throw new Error("git_fetch did not report success");

  const behind = await callJson("git_status", { repo_path: repoB });
  if (behind.data.behind !== 1 || behind.data.ahead !== 0) {
    throw new Error(`git_status upstream counts after fetch are wrong: ${JSON.stringify(behind.data)}`);
  }

  const pulled = await callJson("git_pull", {
    repo_path: repoB,
    ff_only: true,
  });
  if (!pulled.data.pulled || pulled.data.after_sha !== thirdCommit.data.commit_sha) {
    throw new Error(`git_pull did not fast-forward to expected SHA: ${JSON.stringify(pulled.data)}`);
  }

  const addedWorktree = await callJson("git_worktree", {
    repo_path: repoA,
    action: "add",
    path: worktree,
    new_branch: "worktree-test",
  });
  if (!addedWorktree.data.added || !fs.existsSync(worktree)) {
    throw new Error("git_worktree add failed");
  }

  const worktrees = await callJson("git_worktree", {
    repo_path: repoA,
    action: "list",
  });
  if (!worktrees.data.worktrees.some((item) => item.branch === "worktree-test")) {
    throw new Error(`git_worktree list did not include worktree-test branch: ${JSON.stringify(worktrees.data)}`);
  }

  const removedWorktree = await callJson("git_worktree", {
    repo_path: repoA,
    action: "remove",
    path: worktree,
  });
  if (!removedWorktree.data.removed || fs.existsSync(worktree)) {
    throw new Error("git_worktree remove failed");
  }

  console.log("git_status porcelain/upstream: PASS");
  console.log("git_diff bounded diff: PASS");
  console.log("git_log structured history: PASS");
  console.log("git_branch create/switch/list: PASS");
  console.log("git_commit explicit staging + SHA: PASS");
  console.log("git_push local bare remote: PASS");
  console.log("git_fetch local bare remote: PASS");
  console.log("git_pull ff-only: PASS");
  console.log("git_worktree add/list/remove: PASS");
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
