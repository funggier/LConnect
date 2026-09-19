import path from "node:path";
import { z } from "zod";
import { runProcess } from "./runtime.mjs";

const gitProgram = process.platform === "win32" ? "git.exe" : "git";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function resultText(result) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

async function runGitRaw(repoPath, args, config, timeoutSeconds = 60, maxOutputChars) {
  const repo = path.resolve(repoPath);
  return runProcess(
    gitProgram,
    ["-C", repo, ...args],
    {
      timeoutSeconds: Math.min(timeoutSeconds, config.shell.maxTimeoutSeconds),
      maxOutputChars: maxOutputChars ?? config.shell.maxOutputChars,
    }
  );
}

async function runGit(repoPath, args, config, timeoutSeconds = 60, maxOutputChars) {
  const result = await runGitRaw(repoPath, args, config, timeoutSeconds, maxOutputChars);

  if (result.error) {
    throw new Error(`Failed to launch Git: ${result.error}`);
  }
  if (result.timedOut) {
    throw new Error(`Git command timed out: git ${args.join(" ")}`);
  }
  if (result.code) {
    const detail = resultText(result);
    throw new Error(
      `Git command failed (exit ${result.code}): git ${args.join(" ")}${detail ? `\n${detail}` : ""}`
    );
  }

  return result;
}

async function tryGit(repoPath, args, config, timeoutSeconds = 30) {
  const result = await runGitRaw(repoPath, args, config, timeoutSeconds);
  if (result.error || result.timedOut) return null;
  if (result.code) return null;
  return (result.stdout || "").trim();
}

async function repoIdentity(repoPath, config) {
  const rootResult = await runGit(repoPath, ["rev-parse", "--show-toplevel"], config, 20);
  const root = (rootResult.stdout || "").trim();

  const head = await tryGit(root, ["rev-parse", "--verify", "HEAD"], config, 20);
  const branch = await tryGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], config, 20);
  const upstream = await tryGit(
    root,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    config,
    20
  );

  let ahead = null;
  let behind = null;
  if (head && upstream) {
    const counts = await tryGit(
      root,
      ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
      config,
      20
    );
    if (counts) {
      const [left, right] = counts.split(/\s+/).map(Number);
      ahead = Number.isFinite(left) ? left : null;
      behind = Number.isFinite(right) ? right : null;
    }
  }

  return {
    repo_root: root,
    head: head || null,
    branch: branch || null,
    detached: !branch && Boolean(head),
    unborn: !head,
    upstream: upstream || null,
    ahead,
    behind,
  };
}

function parsePorcelainV1Z(stdout) {
  const records = String(stdout || "").split("\0");
  const entries = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.length < 3) continue;

    const xy = record.slice(0, 2);
    const currentPath = record.slice(3);
    const item = {
      index_status: xy[0],
      worktree_status: xy[1],
      path: currentPath,
      original_path: null,
      untracked: xy === "??",
      ignored: xy === "!!",
    };

    if ((xy[0] === "R" || xy[0] === "C") && i + 1 < records.length) {
      item.original_path = records[++i] || null;
    }

    entries.push(item);
  }

  return entries;
}

function countStatusEntries(entries) {
  const counts = {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
  };

  const conflictCodes = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

  for (const entry of entries) {
    const code = entry.index_status + entry.worktree_status;
    if (entry.untracked) {
      counts.untracked++;
      continue;
    }
    if (conflictCodes.has(code)) counts.conflicts++;
    if (entry.index_status !== " " && entry.index_status !== "?") counts.staged++;
    if (entry.worktree_status !== " " && entry.worktree_status !== "?") counts.unstaged++;
  }

  return counts;
}

function truncateText(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) {
    return { text: value, truncated: false, original_char_count: value.length };
  }
  return {
    text: value.slice(0, maxChars),
    truncated: true,
    original_char_count: value.length,
  };
}

function parseLog(stdout) {
  const records = String(stdout || "").split("\x1e").filter(Boolean);
  return records.map((record) => {
    const fields = record.replace(/^\r?\n|\r?\n$/g, "").split("\x1f");
    return {
      sha: fields[0] || null,
      short_sha: fields[1] || null,
      author_name: fields[2] || null,
      author_email: fields[3] || null,
      authored_at: fields[4] || null,
      parents: fields[5] ? fields[5].split(" ").filter(Boolean) : [],
      subject: fields.slice(6).join("\x1f") || "",
    };
  });
}

function parseBranches(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [ref, shortName, sha, upstream, headMarker] = line.split("\t");
      return {
        ref,
        name: shortName,
        sha,
        upstream: upstream || null,
        current: headMarker === "*",
        remote: ref?.startsWith("refs/remotes/") ?? false,
      };
    });
}

function parseWorktrees(stdout) {
  const blocks = String(stdout || "").split(/\r?\n\r?\n/).filter(Boolean);
  return blocks.map((block) => {
    const item = {
      path: null,
      head: null,
      branch: null,
      detached: false,
      bare: false,
      locked: false,
      prunable: false,
    };

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) item.path = line.slice(9);
      else if (line.startsWith("HEAD ")) item.head = line.slice(5);
      else if (line.startsWith("branch ")) item.branch = line.slice(7).replace(/^refs\/heads\//, "");
      else if (line === "detached") item.detached = true;
      else if (line === "bare") item.bare = true;
      else if (line.startsWith("locked")) item.locked = true;
      else if (line.startsWith("prunable")) item.prunable = true;
    }

    return item;
  });
}

export function registerGitTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  const requireEnabled = () => {
    if (!enabled) throw new Error("Git tools require process execution to be enabled.");
  };

  server.tool("git_status", "Return structured repository, HEAD, upstream and working-tree status.", {
    repo_path: z.string().min(1),
    include_untracked: z.boolean().optional(),
  }, async ({ repo_path, include_untracked = true }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      const result = await runGit(
        identity.repo_root,
        [
          "status",
          "--porcelain=v1",
          "-z",
          include_untracked ? "--untracked-files=normal" : "--untracked-files=no",
        ],
        config,
        30
      );
      const entries = parsePorcelainV1Z(result.stdout);
      return textResult({
        ...identity,
        clean: entries.length === 0,
        counts: countStatusEntries(entries),
        entries,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_diff", "Return a bounded Git diff or name-only change list.", {
    repo_path: z.string().min(1),
    staged: z.boolean().optional(),
    name_only: z.boolean().optional(),
    paths: z.array(z.string().min(1)).optional(),
    max_chars: z.number().int().min(1000).max(500000).optional(),
  }, async ({
    repo_path,
    staged = false,
    name_only = false,
    paths = [],
    max_chars = 120000,
  }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      const args = ["diff", "--no-ext-diff", "--no-color"];
      if (staged) args.push("--cached");
      if (name_only) args.push("--name-only");
      if (paths.length) args.push("--", ...paths);

      const result = await runGit(
        identity.repo_root,
        args,
        config,
        60,
        Math.max(max_chars + 4096, config.shell.maxOutputChars)
      );
      const bounded = truncateText(result.stdout, max_chars);
      return textResult({
        repo_root: identity.repo_root,
        head: identity.head,
        staged,
        name_only,
        paths,
        diff: bounded.text,
        truncated: bounded.truncated,
        original_char_count: bounded.original_char_count,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_log", "Return structured Git commit history.", {
    repo_path: z.string().min(1),
    ref: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    paths: z.array(z.string().min(1)).optional(),
  }, async ({ repo_path, ref = "HEAD", limit = 20, paths = [] }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      if (identity.unborn) {
        return textResult({
          repo_root: identity.repo_root,
          ref,
          count: 0,
          commits: [],
        });
      }

      const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%s%x1e";
      const args = ["log", ref, `-n${limit}`, `--format=${format}`, "--no-color"];
      if (paths.length) args.push("--", ...paths);

      const result = await runGit(identity.repo_root, args, config, 45);
      const commits = parseLog(result.stdout);
      return textResult({
        repo_root: identity.repo_root,
        ref,
        count: commits.length,
        commits,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_branch", "List, create, switch or delete local Git branches.", {
    repo_path: z.string().min(1),
    action: z.enum(["list", "create", "switch", "delete"]).optional(),
    name: z.string().min(1).optional(),
    start_point: z.string().min(1).optional(),
    force: z.boolean().optional(),
  }, async ({
    repo_path,
    action = "list",
    name,
    start_point,
    force = false,
  }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);

      if (action === "list") {
        const result = await runGit(
          identity.repo_root,
          [
            "for-each-ref",
            "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(upstream:short)%09%(HEAD)",
            "refs/heads",
            "refs/remotes",
          ],
          config,
          30
        );
        return textResult({
          ...identity,
          branches: parseBranches(result.stdout),
        });
      }

      if (!name) return textResult("Branch name is required for this action.", true);

      if (action === "create") {
        const args = ["branch", name];
        if (start_point) args.push(start_point);
        await runGit(identity.repo_root, args, config, 30);
      } else if (action === "switch") {
        await runGit(identity.repo_root, ["switch", name], config, 30);
      } else if (action === "delete") {
        await runGit(identity.repo_root, ["branch", force ? "-D" : "-d", name], config, 30);
      }

      return textResult({
        action,
        name,
        force: action === "delete" ? force : undefined,
        repository: await repoIdentity(identity.repo_root, config),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_commit", "Create a Git commit with explicit staging behavior and return exact SHA evidence.", {
    repo_path: z.string().min(1),
    message: z.string().min(1),
    paths: z.array(z.string().min(1)).optional(),
    all: z.boolean().optional(),
    allow_empty: z.boolean().optional(),
  }, async ({
    repo_path,
    message,
    paths = [],
    all = false,
    allow_empty = false,
  }) => {
    try {
      requireEnabled();
      if (all && paths.length) {
        return textResult("Use either all=true or paths, not both.", true);
      }

      const identity = await repoIdentity(repo_path, config);
      const before = identity.head;

      if (all) {
        await runGit(identity.repo_root, ["add", "-A"], config, 30);
      } else if (paths.length) {
        await runGit(identity.repo_root, ["add", "--", ...paths], config, 30);
      }

      const args = ["commit", "-m", message];
      if (allow_empty) args.push("--allow-empty");
      const result = await runGit(identity.repo_root, args, config, 60);
      const afterIdentity = await repoIdentity(identity.repo_root, config);

      return textResult({
        committed: true,
        repo_root: identity.repo_root,
        before_sha: before,
        commit_sha: afterIdentity.head,
        branch: afterIdentity.branch,
        message,
        staged_via: all ? "all" : paths.length ? "paths" : "preexisting_index",
        paths,
        output: resultText(result),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_fetch", "Fetch from a Git remote without force behavior.", {
    repo_path: z.string().min(1),
    remote: z.string().min(1).optional(),
    refspecs: z.array(z.string().min(1)).optional(),
    prune: z.boolean().optional(),
    tags: z.boolean().optional(),
  }, async ({
    repo_path,
    remote = "origin",
    refspecs = [],
    prune = false,
    tags = false,
  }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      const args = ["fetch"];
      if (prune) args.push("--prune");
      if (tags) args.push("--tags");
      args.push(remote, ...refspecs);

      const result = await runGit(identity.repo_root, args, config, 120);
      return textResult({
        fetched: true,
        repo_root: identity.repo_root,
        remote,
        refspecs,
        prune,
        tags,
        output: resultText(result),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_pull", "Pull updates, using fast-forward-only mode by default.", {
    repo_path: z.string().min(1),
    remote: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    ff_only: z.boolean().optional(),
  }, async ({ repo_path, remote, branch, ff_only = true }) => {
    try {
      requireEnabled();
      if (branch && !remote) {
        return textResult("remote is required when branch is provided.", true);
      }

      const before = await repoIdentity(repo_path, config);
      const args = ["pull"];
      if (ff_only) args.push("--ff-only");
      if (remote) args.push(remote);
      if (branch) args.push(branch);

      const result = await runGit(before.repo_root, args, config, 120);
      const after = await repoIdentity(before.repo_root, config);

      return textResult({
        pulled: true,
        repo_root: before.repo_root,
        remote: remote ?? before.upstream?.split("/")[0] ?? null,
        branch: branch ?? null,
        ff_only,
        before_sha: before.head,
        after_sha: after.head,
        changed: before.head !== after.head,
        output: resultText(result),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_push", "Push the current or specified branch to a Git remote. Force push is intentionally not supported.", {
    repo_path: z.string().min(1),
    remote: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    set_upstream: z.boolean().optional(),
    tags: z.boolean().optional(),
  }, async ({
    repo_path,
    remote = "origin",
    branch,
    set_upstream = false,
    tags = false,
  }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      const targetBranch = branch ?? identity.branch;
      if (!targetBranch && !tags) {
        return textResult("No current branch is available; specify branch explicitly.", true);
      }

      const args = ["push"];
      if (set_upstream) args.push("--set-upstream");
      if (tags && !targetBranch) {
        args.push("--tags", remote);
      } else {
        args.push(remote, targetBranch);
        if (tags) args.push("--tags");
      }

      const result = await runGit(identity.repo_root, args, config, 120);
      const after = await repoIdentity(identity.repo_root, config);

      return textResult({
        pushed: true,
        repo_root: identity.repo_root,
        remote,
        branch: targetBranch ?? null,
        set_upstream,
        tags,
        head: after.head,
        output: resultText(result),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_worktree", "List, add, remove or prune Git worktrees.", {
    repo_path: z.string().min(1),
    action: z.enum(["list", "add", "remove", "prune"]).optional(),
    path: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    new_branch: z.string().min(1).optional(),
    force: z.boolean().optional(),
  }, async ({
    repo_path,
    action = "list",
    path: worktreePath,
    branch,
    new_branch,
    force = false,
  }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);

      if (action === "list") {
        const result = await runGit(
          identity.repo_root,
          ["worktree", "list", "--porcelain"],
          config,
          30
        );
        const worktrees = parseWorktrees(result.stdout);
        return textResult({
          repo_root: identity.repo_root,
          count: worktrees.length,
          worktrees,
        });
      }

      if (action === "prune") {
        const args = ["worktree", "prune"];
        if (force) args.push("--expire", "now");
        const result = await runGit(identity.repo_root, args, config, 30);
        return textResult({
          action,
          pruned: true,
          force,
          output: resultText(result),
        });
      }

      if (!worktreePath) return textResult("path is required for add/remove worktree actions.", true);
      const resolvedPath = path.resolve(worktreePath);

      if (action === "add") {
        if (branch && new_branch) {
          return textResult("Use either branch or new_branch for worktree add, not both.", true);
        }
        const args = ["worktree", "add"];
        if (new_branch) args.push("-b", new_branch);
        args.push(resolvedPath);
        if (branch) args.push(branch);

        const result = await runGit(identity.repo_root, args, config, 60);
        return textResult({
          action,
          added: true,
          path: resolvedPath,
          branch: branch ?? null,
          new_branch: new_branch ?? null,
          output: resultText(result),
        });
      }

      const args = ["worktree", "remove"];
      if (force) args.push("--force");
      args.push(resolvedPath);
      const result = await runGit(identity.repo_root, args, config, 60);
      return textResult({
        action,
        removed: true,
        path: resolvedPath,
        force,
        output: resultText(result),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });
}
