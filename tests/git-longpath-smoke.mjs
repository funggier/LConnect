import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

if (process.platform !== "win32") {
  console.log("git Windows long-path regression: SKIP (non-Windows)");
  process.exit(0);
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-git-longpath-"));
const repo = path.join(fixture, "work");
fs.mkdirSync(repo, { recursive: true });

function git(args, allowFailure = false) {
  const result = spawnSync("git.exe", args, {
    cwd: repo,
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

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

function normalizeGitPath(value) {
  return value.replace(/\\/g, "/");
}

git(["init"]);
git(["config", "user.name", "LConnect Long Path Test"]);
git(["config", "user.email", "lconnect-longpath@example.invalid"]);
git(["config", "core.longpaths", "false"]);

let deepDirectory = repo;
const segments = [];
while (path.join(deepDirectory, "probe.txt").length < 340) {
  const segment = "segment_" + String(segments.length).padStart(2, "0") + "_" + "x".repeat(18);
  segments.push(segment);
  deepDirectory = path.join(deepDirectory, segment);
}
fs.mkdirSync(deepDirectory, { recursive: true });
const absoluteFile = path.join(deepDirectory, "probe.txt");
const relativeFile = normalizeGitPath(path.relative(repo, absoluteFile));
fs.writeFileSync(absoluteFile, "LCONNECT_LONG_PATH_GIT\n", "utf8");

if (absoluteFile.length <= 260) {
  throw new Error("test fixture did not exceed the Windows legacy MAX_PATH boundary");
}

const configuredBefore = git(["config", "--local", "--get", "core.longpaths"]).stdout;
if (configuredBefore !== "false") {
  throw new Error("fixture must start with repository-local core.longpaths=false");
}

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
  { name: "lconnect-git-longpath-smoke", version: "1.3.2" },
  { capabilities: {} }
);

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await client.connect(transport);

  const statusResult = await client.callTool({
    name: "git_status",
    arguments: { repo_path: repo },
  });
  if (statusResult.isError) {
    throw new Error("git_status failed: " + textOf(statusResult));
  }
  const status = jsonOf(statusResult);
  if (
    status.clean !== false ||
    status.counts?.untracked !== 1 ||
    !status.entries?.some((entry) => normalizeGitPath(entry.path).startsWith(segments[0] + "/"))
  ) {
    throw new Error(
      "git_status did not observe the deep untracked tree: " + JSON.stringify(status)
    );
  }

  const commitResult = await client.callTool({
    name: "git_commit",
    arguments: {
      repo_path: repo,
      message: "long path",
      paths: [relativeFile],
    },
  });
  if (commitResult.isError) {
    throw new Error("git_commit failed: " + textOf(commitResult));
  }
  const committed = jsonOf(commitResult);
  if (!/^[0-9a-f]{40}$/i.test(committed.commit_sha || "")) {
    throw new Error("git_commit did not return an exact commit SHA");
  }

  const cleanResult = await client.callTool({
    name: "git_status",
    arguments: { repo_path: repo },
  });
  if (cleanResult.isError) {
    throw new Error("post-commit git_status failed: " + textOf(cleanResult));
  }
  const clean = jsonOf(cleanResult);
  if (clean.clean !== true) {
    throw new Error("repository was not clean after long-path commit");
  }

  const configuredAfter = git(["config", "--local", "--get", "core.longpaths"]).stdout;
  if (configuredAfter !== "false") {
    throw new Error(
      "LConnect mutated repository-local core.longpaths instead of using a per-invocation override"
    );
  }

  console.log("git Windows >260 path status: PASS");
  console.log("git Windows >260 path commit: PASS");
  console.log("git per-invocation override / repo config unchanged: PASS");
  console.log("absolute path length:", absoluteFile.length);
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
  await fsp.rm(fixture, { recursive: true, force: true }).catch(() => {});
}
