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

function validateRemote(remote) {
  if (!remote || typeof remote !== "string") throw new Error("An explicit remote is required.");
  if (remote.startsWith("-") || /[\r\n\0]/.test(remote)) {
    throw new Error("Invalid Git remote value.");
  }
  return remote;
}

async function validateFullRef(repoPath, ref, config, headsOnly = false) {
  if (!ref || typeof ref !== "string" || !ref.startsWith("refs/")) {
    throw new Error("A full Git ref beginning with refs/ is required.");
  }
  if (/[\r\n\0]/.test(ref) || /[*?\[]/.test(ref)) {
    throw new Error("Wildcard or control characters are not permitted in an exact Git ref.");
  }
  if (headsOnly && !ref.startsWith("refs/heads/")) {
    throw new Error("Destination ref must be a full branch ref under refs/heads/.");
  }

  await runGit(repoPath, ["check-ref-format", ref], config, 20);
  return ref;
}

function validateCommitish(value, label) {
  if (!value || typeof value !== "string") throw new Error(label + " is required.");
  if (value.startsWith("-") || /[\r\n\0]/.test(value)) {
    throw new Error("Invalid " + label + " commit-ish.");
  }
  return value;
}

async function resolveCommit(repoPath, value, config, label = "commit-ish") {
  validateCommitish(value, label);
  const result = await runGit(
    repoPath,
    ["rev-parse", "--verify", value + "^{commit}"],
    config,
    20
  );
  const sha = (result.stdout || "").trim();
  if (!/^[0-9a-fA-F]{40}$/.test(sha)) {
    throw new Error("Could not resolve " + label + " to one exact commit SHA.");
  }
  return sha.toLowerCase();
}

async function resolveExplicitPushSource(repoPath, source, config) {
  if (/^[0-9a-fA-F]{40}$/.test(source)) {
    return await resolveCommit(repoPath, source, config, "source");
  }
  if (source && source.startsWith("refs/")) {
    await validateFullRef(repoPath, source, config, false);
    return await resolveCommit(repoPath, source, config, "source");
  }
  throw new Error("source must be an exact 40-hex commit SHA or a full refs/... ref.");
}

async function remoteRefSha(repoPath, remote, ref, config) {
  validateRemote(remote);
  await validateFullRef(repoPath, ref, config, false);
  const result = await runGit(
    repoPath,
    ["ls-remote", "--refs", remote, ref],
    config,
    60
  );

  const rows = String(result.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      return tab >= 0
        ? { sha: line.slice(0, tab), ref: line.slice(tab + 1) }
        : null;
    })
    .filter(Boolean)
    .filter((row) => row.ref === ref);

  if (rows.length === 0) return null;
  if (rows.length !== 1 || !/^[0-9a-fA-F]{40}$/.test(rows[0].sha)) {
    throw new Error("Remote ref lookup did not resolve to one exact SHA.");
  }
  return rows[0].sha.toLowerCase();
}

async function isAncestorSha(repoPath, ancestorSha, descendantSha, config) {
  const result = await runGitRaw(
    repoPath,
    ["merge-base", "--is-ancestor", ancestorSha, descendantSha],
    config,
    30
  );
  if (result.error) throw new Error("Failed to launch Git: " + result.error);
  if (result.timedOut) throw new Error("Git ancestry check timed out.");
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  const detail = resultText(result);
  throw new Error(
    "Git ancestry check failed (exit " + result.code + ")" +
    (detail ? "\n" + detail : "")
  );
}

async function configuredRemoteTarget(identity, explicitRemote, explicitRef, config) {
  const hasRemote = Boolean(explicitRemote);
  const hasRef = Boolean(explicitRef);

  if (hasRemote !== hasRef) {
    throw new Error("remote and ref must be supplied together.");
  }

  if (hasRemote && hasRef) {
    validateRemote(explicitRemote);
    await validateFullRef(identity.repo_root, explicitRef, config, false);
    return {
      remote: explicitRemote,
      ref: explicitRef,
      source: "explicit",
    };
  }

  if (!identity.branch) {
    throw new Error(
      "Cannot derive remote/ref without a current branch. Supply explicit remote and full ref."
    );
  }

  const remote = await tryGit(
    identity.repo_root,
    ["config", "--get", "branch." + identity.branch + ".remote"],
    config,
    20
  );
  const ref = await tryGit(
    identity.repo_root,
    ["config", "--get", "branch." + identity.branch + ".merge"],
    config,
    20
  );

  if (!remote || !ref) {
    throw new Error(
      "Current branch has no configured remote/merge ref. Supply explicit remote and full ref."
    );
  }

  validateRemote(remote);
  await validateFullRef(identity.repo_root, ref, config, false);
  return {
    remote,
    ref,
    source: "branch-config",
  };
}

async function localCommitObjectExists(repoPath, sha, config) {
  if (!sha) return false;
  const result = await runGitRaw(
    repoPath,
    ["cat-file", "-e", sha + "^{commit}"],
    config,
    20
  );
  if (result.error) throw new Error("Failed to launch Git: " + result.error);
  if (result.timedOut) throw new Error("Git object availability check timed out.");
  return result.code === 0;
}

async function localTrackingSha(identity, config) {
  if (!identity.upstream) return null;
  const sha = await tryGit(
    identity.repo_root,
    ["rev-parse", "--verify", identity.upstream + "^{commit}"],
    config,
    20
  );
  return /^[0-9a-fA-F]{40}$/.test(sha || "") ? sha.toLowerCase() : null;
}

async function commitDistance(repoPath, leftSha, rightSha, config) {
  const counts = await tryGit(
    repoPath,
    ["rev-list", "--left-right", "--count", leftSha + "..." + rightSha],
    config,
    20
  );
  if (!counts) return { ahead: null, behind: null };
  const [left, right] = counts.split(/\s+/).map(Number);
  return {
    ahead: Number.isFinite(left) ? left : null,
    behind: Number.isFinite(right) ? right : null,
  };
}

function classifyExactSync({
  head,
  remoteSha,
  remoteObjectLocal,
  localIsAncestorOfRemote,
  remoteIsAncestorOfLocal,
}) {
  if (!head) return "unborn";
  if (!remoteSha) return "remote_ref_missing";
  if (head === remoteSha) return "equal";
  if (!remoteObjectLocal) return "remote_object_not_local";
  if (localIsAncestorOfRemote === true && remoteIsAncestorOfLocal === false) {
    return "remote_ahead";
  }
  if (remoteIsAncestorOfLocal === true && localIsAncestorOfRemote === false) {
    return "local_ahead";
  }
  if (localIsAncestorOfRemote === false && remoteIsAncestorOfLocal === false) {
    return "diverged";
  }
  return "unknown";
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

  server.tool("git_sync_status", "Compare local HEAD/cached upstream state with one exact remote Git ref without fetching or mutating the repository.", {
    repo_path: z.string().min(1),
    remote: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
    include_untracked: z.boolean().optional(),
    max_status_entries: z.number().int().min(1).max(500).optional(),
  }, async ({
    repo_path,
    remote,
    ref,
    include_untracked = true,
    max_status_entries = 50,
  }) => {
    try {
      requireEnabled();

      const identity = await repoIdentity(repo_path, config);
      const target = await configuredRemoteTarget(identity, remote, ref, config);

      const statusResult = await runGit(
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
      const entries = parsePorcelainV1Z(statusResult.stdout);
      const statusCounts = countStatusEntries(entries);

      const remoteSha = await remoteRefSha(
        identity.repo_root,
        target.remote,
        target.ref,
        config
      );
      const trackingSha = await localTrackingSha(identity, config);

      let remoteObjectLocal = false;
      let exactAhead = null;
      let exactBehind = null;
      let localIsAncestorOfRemote = null;
      let remoteIsAncestorOfLocal = null;

      if (identity.head && remoteSha) {
        remoteObjectLocal = identity.head === remoteSha
          ? true
          : await localCommitObjectExists(identity.repo_root, remoteSha, config);

        if (remoteObjectLocal) {
          const distance = await commitDistance(
            identity.repo_root,
            identity.head,
            remoteSha,
            config
          );
          exactAhead = distance.ahead;
          exactBehind = distance.behind;

          if (identity.head === remoteSha) {
            localIsAncestorOfRemote = true;
            remoteIsAncestorOfLocal = true;
          } else {
            localIsAncestorOfRemote = await isAncestorSha(
              identity.repo_root,
              identity.head,
              remoteSha,
              config
            );
            remoteIsAncestorOfLocal = await isAncestorSha(
              identity.repo_root,
              remoteSha,
              identity.head,
              config
            );
          }
        }
      }

      const syncState = classifyExactSync({
        head: identity.head,
        remoteSha,
        remoteObjectLocal,
        localIsAncestorOfRemote,
        remoteIsAncestorOfLocal,
      });

      return textResult({
        repo_root: identity.repo_root,
        local: {
          head: identity.head,
          branch: identity.branch,
          detached: identity.detached,
          unborn: identity.unborn,
          upstream: identity.upstream,
          cached_ahead: identity.ahead,
          cached_behind: identity.behind,
        },
        working_tree: {
          clean: entries.length === 0,
          counts: statusCounts,
          entries: entries.slice(0, max_status_entries),
          entries_truncated: entries.length > max_status_entries,
          total_entries: entries.length,
          include_untracked,
        },
        target: {
          source: target.source,
          remote: target.remote,
          ref: target.ref,
        },
        exact_remote: {
          found: Boolean(remoteSha),
          sha: remoteSha,
          matches_local_head:
            identity.head && remoteSha ? identity.head === remoteSha : null,
          object_available_locally: remoteSha ? remoteObjectLocal : null,
          ahead: exactAhead,
          behind: exactBehind,
          local_is_ancestor_of_remote: localIsAncestorOfRemote,
          remote_is_ancestor_of_local: remoteIsAncestorOfLocal,
        },
        local_tracking: {
          ref: identity.upstream,
          sha: trackingSha,
          matches_exact_remote:
            trackingSha && remoteSha ? trackingSha === remoteSha : null,
        },
        sync_state: syncState,
        exact_ancestry_available:
          Boolean(identity.head && remoteSha && remoteObjectLocal),
        note:
          "Read-only verification only. No fetch is performed. cached_ahead/cached_behind compare HEAD with the local upstream tracking ref; exact_remote uses git ls-remote. Exact ancestry is unavailable until the exact remote commit object exists locally.",
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

  server.tool("git_remote_ref", "Resolve one exact full remote Git ref to its SHA without mutating the repository.", {
    repo_path: z.string().min(1),
    remote: z.string().min(1),
    ref: z.string().min(1),
  }, async ({ repo_path, remote, ref }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      const sha = await remoteRefSha(identity.repo_root, remote, ref, config);
      return textResult({
        repo_root: identity.repo_root,
        remote,
        ref,
        found: Boolean(sha),
        sha,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_is_ancestor", "Resolve two commit-ish values to exact commit SHAs and report whether the first is an ancestor of the second.", {
    repo_path: z.string().min(1),
    ancestor: z.string().min(1),
    descendant: z.string().min(1),
  }, async ({ repo_path, ancestor, descendant }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      const ancestorSha = await resolveCommit(identity.repo_root, ancestor, config, "ancestor");
      const descendantSha = await resolveCommit(identity.repo_root, descendant, config, "descendant");
      const isAncestor = await isAncestorSha(
        identity.repo_root,
        ancestorSha,
        descendantSha,
        config
      );
      return textResult({
        repo_root: identity.repo_root,
        ancestor,
        descendant,
        ancestor_sha: ancestorSha,
        descendant_sha: descendantSha,
        is_ancestor: isAncestor,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("git_push_ref", "Push one exact source commit/full ref to one explicit full branch ref with non-force fast-forward safety and before/after remote SHA evidence.", {
    repo_path: z.string().min(1),
    remote: z.string().min(1),
    source: z.string().min(1),
    destination: z.string().min(1),
  }, async ({ repo_path, remote, source, destination }) => {
    try {
      requireEnabled();
      const identity = await repoIdentity(repo_path, config);
      validateRemote(remote);
      await validateFullRef(identity.repo_root, destination, config, true);
      const sourceSha = await resolveExplicitPushSource(
        identity.repo_root,
        source,
        config
      );

      const beforeSha = await remoteRefSha(
        identity.repo_root,
        remote,
        destination,
        config
      );

      let fastForwardVerified = true;
      if (beforeSha) {
        await runGit(
          identity.repo_root,
          ["fetch", "--no-tags", remote, destination],
          config,
          60
        );
        const fetchedSha = await resolveCommit(
          identity.repo_root,
          "FETCH_HEAD",
          config,
          "fetched remote destination"
        );
        if (fetchedSha !== beforeSha) {
          return textResult({
            error_code: "REMOTE_REF_CHANGED",
            message: "Remote ref changed during fast-forward safety verification; retry with fresh evidence.",
            remote,
            destination,
            remote_sha_before: beforeSha,
            fetched_sha: fetchedSha,
            source_sha: sourceSha,
          }, true);
        }

        fastForwardVerified = await isAncestorSha(
          identity.repo_root,
          beforeSha,
          sourceSha,
          config
        );
        if (!fastForwardVerified) {
          return textResult({
            error_code: "NON_FAST_FORWARD",
            message: "Push rejected before mutation because the current remote branch is not an ancestor of the explicit source commit.",
            remote,
            destination,
            remote_sha_before: beforeSha,
            source_sha: sourceSha,
          }, true);
        }
      }

      const result = await runGit(
        identity.repo_root,
        ["push", "--porcelain", remote, sourceSha + ":" + destination],
        config,
        120
      );

      const afterSha = await remoteRefSha(
        identity.repo_root,
        remote,
        destination,
        config
      );

      return textResult({
        pushed: true,
        repo_root: identity.repo_root,
        remote,
        source,
        source_sha: sourceSha,
        destination,
        created: beforeSha === null,
        fast_forward_verified: fastForwardVerified,
        remote_sha_before: beforeSha,
        remote_sha_after: afterSha,
        post_push_matches_source: afterSha === sourceSha,
        force_used: false,
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
