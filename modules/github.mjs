import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getRuntimeRequestBudget, runProcess } from "./runtime.mjs";
import { makeExistingPathGuard } from "./path-utils.mjs";

const GH_PROGRAM = process.platform === "win32" ? "gh.exe" : "gh";
const TERMINAL_RUN_STATUS = new Set(["completed"]);

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function validateRepo(repo) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo || ""))) {
    throw new Error("repo must be an exact owner/name identifier.");
  }
  return repo;
}

function validateIdentity(value, label) {
  const text = String(value || "");
  if (!text || text.startsWith("-") || /[\r\n\0]/.test(text)) {
    throw new Error("Invalid " + label + ".");
  }
  return text;
}

function validateAssetName(value) {
  const name = validateIdentity(value, "asset_name");
  if (
    name === "." ||
    name === ".." ||
    name !== path.basename(name) ||
    /[\\/*?\[\]]/.test(name)
  ) {
    throw new Error(
      "asset_name must be one exact filename without path separators or glob metacharacters."
    );
  }
  return name;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function truncateText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) {
    return { text, truncated: false, original_char_count: text.length };
  }
  return {
    text: text.slice(0, maxChars),
    truncated: true,
    original_char_count: text.length,
  };
}

function knownSecrets(extraSecrets = []) {
  const values = [
    process.env.GH_TOKEN,
    process.env.GITHUB_TOKEN,
    ...extraSecrets,
  ];
  return values
    .filter((value) => typeof value === "string" && value.length >= 4)
    .map(String);
}

function redactGitHubSecrets(value, extraSecrets = []) {
  let text = String(value || "");
  for (const secret of knownSecrets(extraSecrets)) {
    text = text.split(secret).join("[REDACTED]");
  }
  text = text.replace(
    /\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g,
    "[REDACTED_GITHUB_TOKEN]"
  );
  return text;
}

function parseJsonResult(result, label) {
  try {
    return JSON.parse(result.stdout || "");
  } catch (error) {
    throw new Error(label + " returned invalid JSON: " + error.message);
  }
}

function normalizeJob(job) {
  const steps = Array.isArray(job?.steps)
    ? job.steps.map((step) => ({
        name: step?.name ?? null,
        status: step?.status ?? null,
        conclusion: step?.conclusion ?? null,
        number: step?.number ?? null,
        started_at: step?.startedAt ?? step?.started_at ?? null,
        completed_at: step?.completedAt ?? step?.completed_at ?? null,
      }))
    : [];

  return {
    id: job?.databaseId ?? job?.id ?? null,
    name: job?.name ?? null,
    status: job?.status ?? null,
    conclusion: job?.conclusion ?? null,
    started_at: job?.startedAt ?? job?.started_at ?? null,
    completed_at: job?.completedAt ?? job?.completed_at ?? null,
    url: job?.url ?? null,
    steps,
  };
}

function normalizeRun(run) {
  const jobs = Array.isArray(run?.jobs) ? run.jobs.map(normalizeJob) : [];
  return {
    id: run?.databaseId ?? run?.id ?? null,
    number: run?.number ?? null,
    workflow_name: run?.workflowName ?? run?.name ?? null,
    display_title: run?.displayTitle ?? null,
    event: run?.event ?? null,
    head_branch: run?.headBranch ?? null,
    head_sha: run?.headSha ?? null,
    status: run?.status ?? null,
    conclusion: run?.conclusion ?? null,
    created_at: run?.createdAt ?? null,
    started_at: run?.startedTime ?? run?.startedAt ?? null,
    updated_at: run?.updatedAt ?? null,
    url: run?.url ?? null,
    jobs,
  };
}

function failedJobs(run) {
  return (run.jobs || [])
    .filter((job) => job.conclusion && job.conclusion !== "success" && job.conclusion !== "skipped")
    .map((job) => ({
      ...job,
      failed_steps: (job.steps || []).filter((step) =>
        step.conclusion && step.conclusion !== "success" && step.conclusion !== "skipped"
      ),
    }));
}

function normalizeAsset(asset) {
  return {
    id: asset?.id ?? asset?.databaseId ?? null,
    name: asset?.name ?? null,
    size: Number.isFinite(Number(asset?.size)) ? Number(asset.size) : null,
    digest: asset?.digest ?? null,
    state: asset?.state ?? null,
    url: asset?.url ?? asset?.apiUrl ?? null,
    download_count: asset?.downloadCount ?? asset?.download_count ?? null,
    created_at: asset?.createdAt ?? asset?.created_at ?? null,
    updated_at: asset?.updatedAt ?? asset?.updated_at ?? null,
  };
}

function normalizeRelease(release) {
  const assets = Array.isArray(release?.assets)
    ? release.assets.map(normalizeAsset)
    : [];
  return {
    tag: release?.tagName ?? release?.tag_name ?? null,
    name: release?.name ?? null,
    target_commitish: release?.targetCommitish ?? release?.target_commitish ?? null,
    draft: Boolean(release?.isDraft ?? release?.draft),
    prerelease: Boolean(release?.isPrerelease ?? release?.prerelease),
    published_at: release?.publishedAt ?? release?.published_at ?? null,
    created_at: release?.createdAt ?? release?.created_at ?? null,
    url: release?.url ?? release?.html_url ?? null,
    assets,
  };
}

async function sha256File(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const hash = createHash("sha256");
    let bytes = 0;
    const stream = handle.createReadStream({
      autoClose: false,
      highWaterMark: 1024 * 1024,
    });
    for await (const chunk of stream) {
      hash.update(chunk);
      bytes += chunk.length;
    }
    return { digest: hash.digest("hex"), bytes };
  } finally {
    await handle.close();
  }
}

function defaultRunner(config) {
  return async function runGhRaw(args, options = {}) {
    return await runProcess(
      GH_PROGRAM,
      args,
      {
        cwd: options.cwd,
        timeoutSeconds: options.timeout_seconds ?? 10,
        maxOutputChars: options.max_output_chars ?? Math.min(config.shell.maxOutputChars, 240000),
      }
    );
  };
}

async function ensureGhReady(runGhRaw, timeoutSeconds = 5) {
  const result = await runGhRaw(
    ["auth", "status", "--hostname", "github.com"],
    { timeout_seconds: timeoutSeconds, max_output_chars: 12000 }
  );

  if (result.error) {
    throw new Error(
      "GitHub CLI is unavailable. Install gh and authenticate it before using GitHub tools."
    );
  }
  if (result.timedOut) {
    throw new Error("GitHub CLI authentication check timed out.");
  }
  if (result.code) {
    throw new Error(
      "GitHub CLI is not authenticated for github.com. Run gh auth login outside LConnect."
    );
  }
}

async function checkedGh(runGhRaw, args, options = {}, extraSecrets = []) {
  const result = await runGhRaw(args, options);
  if (result.error) {
    throw new Error("Failed to launch GitHub CLI.");
  }
  if (result.timedOut) {
    throw new Error("GitHub CLI command timed out.");
  }
  if (result.code) {
    const detail = redactGitHubSecrets(
      [result.stdout, result.stderr].filter(Boolean).join("\n"),
      extraSecrets
    );
    throw new Error(
      "GitHub CLI command failed (exit " + result.code + ")" +
      (detail ? "\n" + detail : "")
    );
  }
  return {
    ...result,
    stdout: redactGitHubSecrets(result.stdout, extraSecrets),
    stderr: redactGitHubSecrets(result.stderr, extraSecrets),
  };
}

async function readRun(runGhRaw, repo, runId, timeoutSeconds = 10) {
  const result = await checkedGh(
    runGhRaw,
    [
      "run",
      "view",
      String(runId),
      "--repo",
      repo,
      "--json",
      "databaseId,number,workflowName,displayTitle,event,headBranch,headSha,status,conclusion,createdAt,startedAt,updatedAt,url,jobs",
    ],
    { timeout_seconds: timeoutSeconds, max_output_chars: 240000 }
  );
  return normalizeRun(parseJsonResult(result, "gh run view"));
}

async function readRelease(runGhRaw, repo, tag) {
  const result = await checkedGh(
    runGhRaw,
    [
      "release",
      "view",
      tag,
      "--repo",
      repo,
      "--json",
      "tagName,name,targetCommitish,isDraft,isPrerelease,publishedAt,createdAt,url,assets",
    ],
    { timeout_seconds: 10, max_output_chars: 240000 }
  );
  return normalizeRelease(parseJsonResult(result, "gh release view"));
}

export function registerGitHubTools(server, config, dependencies = {}) {
  const runGhRaw = dependencies.runGhRaw || defaultRunner(config);
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = dependencies.now || (() => Date.now());
  const authReadyTtlMs = boundedInteger(
    dependencies.authReadyTtlMs,
    30000,
    1000,
    300000
  );
  let authReadyUntil = 0;
  const resolveAllowedExisting = makeExistingPathGuard(config);

  async function ensureGhReadyCached(timeoutSeconds = 5) {
    if (now() < authReadyUntil) {
      return { cached: true, ready_until: authReadyUntil };
    }

    await ensureGhReady(runGhRaw, timeoutSeconds);
    authReadyUntil = now() + authReadyTtlMs;
    return { cached: false, ready_until: authReadyUntil };
  }

  server.tool("github_run_list", "List GitHub Actions runs through authenticated gh with structured bounded output.", {
    repo: z.string().min(3),
    limit: z.number().int().min(1).max(100).optional(),
    workflow: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    event: z.string().min(1).optional(),
  }, async ({
    repo,
    limit = 20,
    workflow,
    branch,
    status,
    event,
  }) => {
    try {
      validateRepo(repo);
      await ensureGhReadyCached();
      const args = [
        "run",
        "list",
        "--repo",
        repo,
        "--limit",
        String(limit),
        "--json",
        "databaseId,number,workflowName,displayTitle,event,headBranch,headSha,status,conclusion,createdAt,updatedAt,url",
      ];
      if (workflow) args.push("--workflow", validateIdentity(workflow, "workflow"));
      if (branch) args.push("--branch", validateIdentity(branch, "branch"));
      if (status) args.push("--status", validateIdentity(status, "status"));
      if (event) args.push("--event", validateIdentity(event, "event"));

      const result = await checkedGh(
        runGhRaw,
        args,
        { timeout_seconds: 10, max_output_chars: 240000 }
      );
      const data = parseJsonResult(result, "gh run list");
      const runs = Array.isArray(data) ? data.slice(0, limit).map(normalizeRun) : [];
      return textResult({ repo, count: runs.length, limit, runs });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("github_run_view", "Return structured metadata and jobs for one exact GitHub Actions run ID.", {
    repo: z.string().min(3),
    run_id: z.number().int().positive(),
  }, async ({ repo, run_id }) => {
    try {
      validateRepo(repo);
      await ensureGhReadyCached();
      return textResult({ repo, run: await readRun(runGhRaw, repo, run_id) });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("github_run_wait", "Wait briefly (default 1s, maximum 3s) for one GitHub Actions run without cancelling it on timeout. Prefer github_run_view for a non-blocking status check.", {
    repo: z.string().min(3),
    run_id: z.number().int().positive(),
    wait_seconds: z.number().min(0).max(3).optional(),
    poll_interval_ms: z.number().int().min(100).max(5000).optional(),
  }, async ({
    repo,
    run_id,
    wait_seconds = 1,
    poll_interval_ms = 500,
  }) => {
    try {
      validateRepo(repo);
      const started = now();
      const runtimeBudgetMs = Math.max(
        1000,
        getRuntimeRequestBudget().maxSynchronousRequestSeconds * 1000 - 500
      );
      const requestedWaitMs = boundedInteger(wait_seconds * 1000, 1000, 0, 3000);
      const effectiveWaitMs = Math.min(requestedWaitMs, runtimeBudgetMs);
      const deadline = started + effectiveWaitMs;
      const pollMs = boundedInteger(poll_interval_ms, 1000, 100, 5000);
      const authTimeoutSeconds = Math.max(
        1,
        Math.min(5, Math.ceil(Math.max(1, deadline - now()) / 1000))
      );
      await ensureGhReadyCached(authTimeoutSeconds);
      let run;

      while (true) {
        const remainingBeforeRead = Math.max(1, deadline - now());
        const readTimeoutSeconds = Math.max(
          1,
          Math.min(5, Math.ceil(remainingBeforeRead / 1000))
        );
        run = await readRun(runGhRaw, repo, run_id, readTimeoutSeconds);
        if (TERMINAL_RUN_STATUS.has(String(run.status || "").toLowerCase())) {
          return textResult({
            repo,
            run_id,
            completed: true,
            timed_out: false,
            waited_ms: Math.max(0, now() - started),
            requested_wait_ms: requestedWaitMs,
            effective_wait_ms: effectiveWaitMs,
            request_budget_ms: runtimeBudgetMs,
            return_reason: "completed",
            run,
          });
        }

        const remaining = deadline - now();
        if (remaining <= 0) {
          return textResult({
            repo,
            run_id,
            completed: false,
            timed_out: true,
            waited_ms: Math.max(0, now() - started),
            requested_wait_ms: requestedWaitMs,
            effective_wait_ms: effectiveWaitMs,
            request_budget_ms: runtimeBudgetMs,
            return_reason: "timeout",
            run,
          });
        }
        await sleep(Math.min(pollMs, remaining));
      }
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("github_run_failed_logs", "Return bounded failed-job/step evidence and failed logs for one GitHub Actions run.", {
    repo: z.string().min(3),
    run_id: z.number().int().positive(),
    max_chars: z.number().int().min(1000).max(120000).optional(),
  }, async ({ repo, run_id, max_chars = 30000 }) => {
    try {
      validateRepo(repo);
      await ensureGhReadyCached();
      const run = await readRun(runGhRaw, repo, run_id);
      const result = await checkedGh(
        runGhRaw,
        ["run", "view", String(run_id), "--repo", repo, "--log-failed"],
        { timeout_seconds: 10, max_output_chars: Math.max(max_chars + 4096, 16000) }
      );
      const bounded = truncateText(
        redactGitHubSecrets(result.stdout),
        max_chars
      );
      return textResult({
        repo,
        run_id,
        run_status: run.status,
        run_conclusion: run.conclusion,
        failed_jobs: failedJobs(run),
        logs: bounded.text,
        truncated: bounded.truncated,
        original_char_count: bounded.original_char_count,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("github_workflow_dispatch", "Dispatch one exact GitHub workflow with explicit inputs. Input values are never echoed in the result.", {
    repo: z.string().min(3),
    workflow: z.string().min(1),
    ref: z.string().min(1).optional(),
    inputs: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  }, async ({ repo, workflow, ref, inputs = {} }) => {
    try {
      validateRepo(repo);
      validateIdentity(workflow, "workflow");
      if (ref) validateIdentity(ref, "ref");
      await ensureGhReadyCached();

      const args = ["workflow", "run", workflow, "--repo", repo];
      if (ref) args.push("--ref", ref);

      const extraSecrets = [];
      const inputKeys = Object.keys(inputs).sort();
      for (const key of inputKeys) {
        if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
          throw new Error("Invalid workflow input key: " + key);
        }
        const value = String(inputs[key]);
        extraSecrets.push(value);
        args.push("--field", key + "=" + value);
      }

      const requestedAt = new Date(now()).toISOString();
      const result = await checkedGh(
        runGhRaw,
        args,
        { timeout_seconds: 10, max_output_chars: 30000 },
        extraSecrets
      );

      return textResult({
        dispatched: true,
        repo,
        workflow,
        ref: ref || null,
        input_keys: inputKeys,
        requested_at: requestedAt,
        correlation: {
          run_id: null,
          note:
            "gh workflow run does not reliably return the created run ID. Correlate using workflow/ref/requested_at with github_run_list.",
        },
        output: redactGitHubSecrets(
          [result.stdout, result.stderr].filter(Boolean).join("\n"),
          extraSecrets
        ),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("github_release_view", "Return structured metadata and assets for one exact GitHub Release tag.", {
    repo: z.string().min(3),
    tag: z.string().min(1),
  }, async ({ repo, tag }) => {
    try {
      validateRepo(repo);
      validateIdentity(tag, "tag");
      await ensureGhReadyCached();
      return textResult({
        repo,
        release: await readRelease(runGhRaw, repo, tag),
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("github_release_download", "Download one exact GitHub Release asset through gh into an allowed existing directory using same-directory temporary staging, size bounds, and local SHA-256 evidence.", {
    repo: z.string().min(3),
    tag: z.string().min(1),
    asset_name: z.string().min(1),
    destination_directory: z.string().min(1),
    overwrite: z.boolean().optional(),
    max_bytes: z.number().int().min(1).max(2 * 1024 * 1024 * 1024).optional(),
  }, async ({
    repo,
    tag,
    asset_name,
    destination_directory,
    overwrite = false,
    max_bytes = 512 * 1024 * 1024,
  }) => {
    let tempDirectory = null;
    try {
      validateRepo(repo);
      validateIdentity(tag, "tag");
      const safeAssetName = validateAssetName(asset_name);
      await ensureGhReadyCached();

      const guarded = await resolveAllowedExisting(destination_directory);
      const destinationStat = await fsp.stat(guarded.real);
      if (!destinationStat.isDirectory()) {
        throw new Error("destination_directory must be an existing directory.");
      }

      const release = await readRelease(runGhRaw, repo, tag);
      const matches = release.assets.filter((asset) => asset.name === safeAssetName);
      if (matches.length !== 1) {
        throw new Error(
          matches.length === 0
            ? "Release asset not found: " + safeAssetName
            : "Release asset name is not unique: " + safeAssetName
        );
      }

      const asset = matches[0];
      if (asset.size === null) {
        throw new Error("Release asset size is unavailable; max_bytes cannot be enforced safely.");
      }
      if (asset.size > max_bytes) {
        throw new Error(
          "Release asset exceeds max_bytes before download: " +
          asset.size + " > " + max_bytes
        );
      }

      const finalPath = path.join(guarded.real, safeAssetName);
      if (!overwrite) {
        try {
          await fsp.access(finalPath);
          throw new Error("Destination already exists: " + finalPath);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }

      tempDirectory = await fsp.mkdtemp(path.join(guarded.real, ".lconnect-gh-"));
      await checkedGh(
        runGhRaw,
        [
          "release",
          "download",
          tag,
          "--repo",
          repo,
          "--pattern",
          safeAssetName,
          "--dir",
          tempDirectory,
          "--clobber",
        ],
        { timeout_seconds: 10, max_output_chars: 30000 }
      );

      const tempPath = path.join(tempDirectory, safeAssetName);
      const stat = await fsp.stat(tempPath);
      if (!stat.isFile()) {
        throw new Error("GitHub CLI did not produce the expected release asset file.");
      }
      if (stat.size > max_bytes) {
        throw new Error(
          "Downloaded release asset exceeds max_bytes: " +
          stat.size + " > " + max_bytes
        );
      }

      const hash = await sha256File(tempPath);
      if (hash.bytes !== stat.size) {
        throw new Error("Downloaded asset size changed while hashing.");
      }

      await fsp.rename(tempPath, finalPath);

      return textResult({
        downloaded: true,
        repo,
        tag,
        asset: {
          ...asset,
          observed_size: stat.size,
        },
        destination: finalPath,
        overwrite,
        max_bytes,
        sha256: hash.digest,
        bytes_hashed: hash.bytes,
        atomic_same_directory_stage: true,
      });
    } catch (error) {
      return textResult(redactGitHubSecrets(error.message), true);
    } finally {
      if (tempDirectory) {
        try {
          await fsp.rm(tempDirectory, { recursive: true, force: true });
        } catch {}
      }
    }
  });
}
