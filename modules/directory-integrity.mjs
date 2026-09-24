import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { isWithin, makeExistingPathGuard, matchesAny } from "./path-utils.mjs";

const ALGORITHMS = ["sha256", "sha384", "sha512"];
const HARD_MAX_FILES = 10000;
const HARD_MAX_FILE_BYTES = 1024 * 1024 * 1024;
const HARD_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
const HARD_MAX_WALK_ENTRIES = 100000;
const HARD_MAX_DIAGNOSTICS = 1000;
const HARD_MAX_REPORTED = 2000;
const HARD_MAX_OUTPUT_CHARS = 200000;

function boundedText(value, maxChars = 1000) {
  const text = String(value ?? "");
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "…";
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function textResult(value, isError = false, maxOutputChars = 60000) {
  let text = JSON.stringify(value, null, 2);
  if (text.length > maxOutputChars) {
    const originalOutputChars = text.length;
    text = JSON.stringify({
      ok: value?.ok !== false,
      equal: value?.equal ?? null,
      comparison_reliable: value?.comparison_reliable ?? null,
      complete: value?.complete ?? null,
      root: value?.root ? boundedText(value.root, 300) : null,
      left_root: value?.left_root ? boundedText(value.left_root, 300) : null,
      right_root: value?.right_root ? boundedText(value.right_root, 300) : null,
      algorithm: value?.algorithm ?? null,
      manifest_digest: value?.manifest_digest ?? null,
      left_manifest_digest: value?.left_manifest_digest ?? null,
      right_manifest_digest: value?.right_manifest_digest ?? null,
      counts: value?.counts ?? null,
      diagnostics_count: value?.diagnostics_count ?? null,
      output_bound: {
        max_output_chars: maxOutputChars,
        original_output_chars: originalOutputChars,
        details_omitted: true
      },
      note:
        "Detailed file/difference evidence was omitted to enforce max_output_chars. Lower max_reported_entries or narrow include_patterns."
    }, null, 2);

    if (text.length > maxOutputChars) {
      text = JSON.stringify({
        ok: value?.ok !== false,
        equal: value?.equal ?? null,
        comparison_reliable: value?.comparison_reliable ?? null,
        complete: value?.complete ?? null,
        algorithm: value?.algorithm ?? null,
        manifest_digest: value?.manifest_digest ?? null,
        left_manifest_digest: value?.left_manifest_digest ?? null,
        right_manifest_digest: value?.right_manifest_digest ?? null,
        counts: value?.counts ?? null,
        output_bound: {
          max_output_chars: maxOutputChars,
          original_output_chars: originalOutputChars,
          details_omitted: true,
          metadata_clipped: true
        }
      }, null, 2);
    }
  }
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {})
  };
}

function sameIdentity(left, right) {
  if (!left || !right) return false;
  return left.dev === right.dev && left.ino === right.ino;
}

function sameDirectoryWindow(before, after) {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  );
}

function pushDiagnostic(state, item, maxDiagnostics) {
  state.diagnostics_count += 1;
  if (state.diagnostics.length < maxDiagnostics) {
    state.diagnostics.push(item);
  } else {
    state.diagnostics_truncated = true;
  }
}

function normalizedRelative(root, absolute) {
  return path.relative(root, absolute).replace(/\\/gu, "/");
}

async function hashFileStable(
  filePath,
  relativePath,
  algorithm,
  maxFileBytes,
  remainingTotalBytes
) {
  const handle = await fsp.open(filePath, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      const error = new Error("Path is not a regular file.");
      error.code = "FILE_TYPE_CHANGED";
      throw error;
    }
    if (before.size > maxFileBytes) {
      const error = new Error(
        "File size " + before.size + " exceeds max_file_bytes=" + maxFileBytes + "."
      );
      error.code = "FILE_TOO_LARGE";
      error.observed_size = before.size;
      throw error;
    }
    if (before.size > remainingTotalBytes) {
      const error = new Error(
        "File size " + before.size +
        " exceeds remaining max_total_bytes budget=" + remainingTotalBytes + "."
      );
      error.code = "TOTAL_BYTES_LIMIT";
      error.observed_size = before.size;
      throw error;
    }

    const hash = createHash(algorithm);
    let bytesHashed = 0;
    const stream = handle.createReadStream({
      autoClose: false,
      highWaterMark: 1024 * 1024,
      start: 0
    });

    for await (const chunk of stream) {
      hash.update(chunk);
      bytesHashed += chunk.length;
    }

    const digest = hash.digest("hex");
    const afterHandle = await handle.stat();

    let afterPath = null;
    try {
      afterPath = await fsp.stat(filePath);
    } catch {}

    const contentWindowStable =
      before.size === afterHandle.size &&
      before.mtimeMs === afterHandle.mtimeMs &&
      before.ctimeMs === afterHandle.ctimeMs &&
      bytesHashed === before.size;

    const pathIdentityStable =
      afterPath !== null && sameIdentity(afterHandle, afterPath);

    return {
      relative_path: relativePath,
      size: before.size,
      digest,
      stable_observed: contentWindowStable && pathIdentityStable
    };
  } finally {
    await handle.close();
  }
}

async function collectCandidates(root, {
  includePatterns,
  excludePatterns,
  maxFiles,
  maxWalkEntries,
  maxDiagnostics
}, state) {
  const files = [];

  async function visitDirectory(dir, relativeDir) {
    if (state.walk_truncated || state.files_truncated) return;

    let before;
    try {
      before = await fsp.stat(dir);
      if (!before.isDirectory()) {
        pushDiagnostic(state, {
          kind: "DIRECTORY_TYPE_CHANGED",
          relative_path: relativeDir
        }, maxDiagnostics);
        state.complete = false;
        return;
      }
    } catch (error) {
      pushDiagnostic(state, {
        kind: "DIRECTORY_STAT_ERROR",
        relative_path: relativeDir,
        message: boundedText(error.message, 600)
      }, maxDiagnostics);
      state.complete = false;
      return;
    }

    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
      pushDiagnostic(state, {
        kind: "READ_DIRECTORY_ERROR",
        relative_path: relativeDir,
        message: boundedText(error.message, 600)
      }, maxDiagnostics);
      state.complete = false;
      return;
    }

    entries.sort((a, b) => compareText(a.name, b.name));

    for (const entry of entries) {
      if (state.walk_entries >= maxWalkEntries) {
        state.walk_truncated = true;
        state.complete = false;
        break;
      }
      state.walk_entries += 1;

      const relative = relativeDir
        ? relativeDir + "/" + entry.name
        : entry.name;

      if (matchesAny(relative, excludePatterns)) {
        state.excluded_count += 1;
        continue;
      }

      const absolute = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        state.symlink_skipped += 1;
        state.complete = false;
        pushDiagnostic(state, {
          kind: "SYMLINK_SKIPPED",
          relative_path: relative
        }, maxDiagnostics);
        continue;
      }

      if (entry.isDirectory()) {
        await visitDirectory(absolute, relative);
        if (state.walk_truncated || state.files_truncated) break;
        continue;
      }

      if (!entry.isFile()) {
        state.special_skipped += 1;
        state.complete = false;
        pushDiagnostic(state, {
          kind: "SPECIAL_ENTRY_SKIPPED",
          relative_path: relative
        }, maxDiagnostics);
        continue;
      }

      if (includePatterns.length && !matchesAny(relative, includePatterns)) {
        continue;
      }

      if (files.length >= maxFiles) {
        state.files_truncated = true;
        state.complete = false;
        break;
      }

      files.push({
        absolute,
        relative
      });
    }

    try {
      const after = await fsp.stat(dir);
      if (!sameDirectoryWindow(before, after)) {
        state.directory_changes += 1;
        state.complete = false;
        pushDiagnostic(state, {
          kind: "DIRECTORY_CHANGED_DURING_SCAN",
          relative_path: relativeDir
        }, maxDiagnostics);
      }
    } catch (error) {
      state.directory_changes += 1;
      state.complete = false;
      pushDiagnostic(state, {
        kind: "DIRECTORY_POST_STAT_ERROR",
        relative_path: relativeDir,
        message: boundedText(error.message, 600)
      }, maxDiagnostics);
    }
  }

  await visitDirectory(root, "");
  files.sort((a, b) => compareText(a.relative, b.relative));
  return files;
}

function manifestDigest(entries, algorithm) {
  const hash = createHash(algorithm);
  hash.update("lconnect-directory-manifest-v1\n");
  hash.update("algorithm=" + algorithm + "\n");
  for (const entry of entries) {
    hash.update(JSON.stringify([
      entry.relative_path,
      entry.size,
      entry.digest
    ]));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function buildManifest(inputRoot, options, config, resolveAllowedExisting) {
  const guarded = await resolveAllowedExisting(inputRoot);
  const root = guarded.real;
  const rootStat = await fsp.stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error("Root must be a directory: " + root);
  }

  const state = {
    complete: true,
    diagnostics: [],
    diagnostics_count: 0,
    diagnostics_truncated: false,
    excluded_count: 0,
    symlink_skipped: 0,
    special_skipped: 0,
    directory_changes: 0,
    walk_entries: 0,
    walk_truncated: false,
    files_truncated: false,
    too_large_skipped: 0,
    total_bytes_truncated: false,
    unstable_files: 0
  };

  const candidates = await collectCandidates(root, options, state);

  const entries = [];
  let totalBytes = 0;

  for (const candidate of candidates) {
    let real;
    let stat;
    try {
      real = await fsp.realpath(candidate.absolute);
      if (!isWithin(real, root)) {
        state.complete = false;
        pushDiagnostic(state, {
          kind: "RESOLVED_PATH_OUTSIDE_ROOT",
          relative_path: candidate.relative
        }, options.maxDiagnostics);
        continue;
      }

      stat = await fsp.stat(real);
    } catch (error) {
      state.complete = false;
      pushDiagnostic(state, {
        kind: "FILE_STAT_ERROR",
        relative_path: candidate.relative,
        message: boundedText(error.message, 600)
      }, options.maxDiagnostics);
      continue;
    }

    if (!stat.isFile()) {
      state.complete = false;
      pushDiagnostic(state, {
        kind: "FILE_TYPE_CHANGED",
        relative_path: candidate.relative
      }, options.maxDiagnostics);
      continue;
    }

    if (stat.size > options.maxFileBytes) {
      state.too_large_skipped += 1;
      state.complete = false;
      pushDiagnostic(state, {
        kind: "FILE_TOO_LARGE",
        relative_path: candidate.relative,
        size: stat.size,
        max_file_bytes: options.maxFileBytes
      }, options.maxDiagnostics);
      continue;
    }

    if (totalBytes + stat.size > options.maxTotalBytes) {
      state.total_bytes_truncated = true;
      state.complete = false;
      break;
    }

    try {
      const evidence = await hashFileStable(
        real,
        candidate.relative,
        options.algorithm,
        options.maxFileBytes,
        options.maxTotalBytes - totalBytes
      );
      entries.push(evidence);
      totalBytes += evidence.size;
      if (!evidence.stable_observed) {
        state.unstable_files += 1;
        state.complete = false;
        pushDiagnostic(state, {
          kind: "FILE_CHANGED_DURING_HASH",
          relative_path: candidate.relative
        }, options.maxDiagnostics);
      }
    } catch (error) {
      state.complete = false;

      if (error.code === "TOTAL_BYTES_LIMIT") {
        state.total_bytes_truncated = true;
        break;
      }

      if (error.code === "FILE_TOO_LARGE") {
        state.too_large_skipped += 1;
        pushDiagnostic(state, {
          kind: "FILE_TOO_LARGE",
          relative_path: candidate.relative,
          size: error.observed_size ?? null,
          max_file_bytes: options.maxFileBytes
        }, options.maxDiagnostics);
        continue;
      }

      pushDiagnostic(state, {
        kind: error.code === "FILE_TYPE_CHANGED"
          ? "FILE_TYPE_CHANGED"
          : "HASH_ERROR",
        relative_path: candidate.relative,
        message: boundedText(error.message, 600)
      }, options.maxDiagnostics);
    }
  }

  entries.sort((a, b) => compareText(a.relative_path, b.relative_path));

  return {
    requested_root: guarded.resolved,
    root,
    resolved_root_changed: guarded.resolved !== root,
    algorithm: options.algorithm,
    manifest_digest: manifestDigest(entries, options.algorithm),
    complete: state.complete,
    counts: {
      selected_files: entries.length,
      selected_bytes: totalBytes,
      walk_entries: state.walk_entries,
      excluded: state.excluded_count,
      symlink_skipped: state.symlink_skipped,
      special_skipped: state.special_skipped,
      directory_changes: state.directory_changes,
      too_large_skipped: state.too_large_skipped,
      unstable_files: state.unstable_files
    },
    bounds: {
      max_files: options.maxFiles,
      max_file_bytes: options.maxFileBytes,
      max_total_bytes: options.maxTotalBytes,
      max_walk_entries: options.maxWalkEntries,
      max_diagnostics: options.maxDiagnostics,
      max_reported_entries: options.maxReportedEntries,
      max_output_chars: options.maxOutputChars
    },
    truncation: {
      walk: state.walk_truncated,
      files: state.files_truncated,
      total_bytes: state.total_bytes_truncated,
      diagnostics: state.diagnostics_truncated,
      reported_entries: entries.length > options.maxReportedEntries
    },
    diagnostics_count: state.diagnostics_count,
    diagnostics: state.diagnostics,
    entries
  };
}

function publicManifest(manifest, maxReportedEntries) {
  return {
    ok: true,
    requested_root: manifest.requested_root,
    root: manifest.root,
    resolved_root_changed: manifest.resolved_root_changed,
    algorithm: manifest.algorithm,
    manifest_digest: manifest.manifest_digest,
    complete: manifest.complete,
    counts: manifest.counts,
    bounds: manifest.bounds,
    truncation: manifest.truncation,
    diagnostics_count: manifest.diagnostics_count,
    diagnostics: manifest.diagnostics,
    entries: manifest.entries.slice(0, maxReportedEntries)
  };
}

function compareManifestData(left, right, maxReportedEntries) {
  const leftMap = new Map(left.entries.map((entry) => [entry.relative_path, entry]));
  const rightMap = new Map(right.entries.map((entry) => [entry.relative_path, entry]));

  const leftOnly = [];
  const rightOnly = [];
  const changed = [];
  let equalFiles = 0;

  const allPaths = [...new Set([...leftMap.keys(), ...rightMap.keys()])]
    .sort(compareText);

  for (const relativePath of allPaths) {
    const l = leftMap.get(relativePath);
    const r = rightMap.get(relativePath);

    if (!l) {
      rightOnly.push(relativePath);
      continue;
    }
    if (!r) {
      leftOnly.push(relativePath);
      continue;
    }

    if (l.size === r.size && l.digest === r.digest) {
      equalFiles += 1;
      continue;
    }

    changed.push({
      relative_path: relativePath,
      left: {
        size: l.size,
        digest: l.digest
      },
      right: {
        size: r.size,
        digest: r.digest
      },
      size_equal: l.size === r.size,
      digest_equal: l.digest === r.digest
    });
  }

  const reliable = left.complete && right.complete;
  const computedEqual =
    leftOnly.length === 0 &&
    rightOnly.length === 0 &&
    changed.length === 0;

  return {
    ok: true,
    equal: reliable ? computedEqual : null,
    comparison_reliable: reliable,
    uncertainty: reliable
      ? null
      : "At least one directory manifest is incomplete or unstable; equality is unknown until the returned diagnostics/bounds are resolved.",
    algorithm: left.algorithm,
    left_root: left.root,
    right_root: right.root,
    left_manifest_digest: left.manifest_digest,
    right_manifest_digest: right.manifest_digest,
    counts: {
      left_files: left.entries.length,
      right_files: right.entries.length,
      common_equal_files: equalFiles,
      changed_files: changed.length,
      left_only_files: leftOnly.length,
      right_only_files: rightOnly.length
    },
    differences: {
      left_only: leftOnly.slice(0, maxReportedEntries),
      right_only: rightOnly.slice(0, maxReportedEntries),
      changed: changed.slice(0, maxReportedEntries)
    },
    truncation: {
      left_only: leftOnly.length > maxReportedEntries,
      right_only: rightOnly.length > maxReportedEntries,
      changed: changed.length > maxReportedEntries
    },
    left: {
      complete: left.complete,
      counts: left.counts,
      truncation: left.truncation,
      diagnostics_count: left.diagnostics_count,
      diagnostics: left.diagnostics
    },
    right: {
      complete: right.complete,
      counts: right.counts,
      truncation: right.truncation,
      diagnostics_count: right.diagnostics_count,
      diagnostics: right.diagnostics
    }
  };
}

function optionSchema() {
  return {
    algorithm: z.enum(ALGORITHMS).optional(),
    include_patterns: z.array(z.string().min(1)).max(100).optional(),
    exclude_patterns: z.array(z.string().min(1)).max(100).optional(),
    max_files: z.number().int().min(1).max(HARD_MAX_FILES).optional(),
    max_file_bytes: z.number().int().min(1).max(HARD_MAX_FILE_BYTES).optional(),
    max_total_bytes: z.number().int().min(1).max(HARD_MAX_TOTAL_BYTES).optional(),
    max_walk_entries: z.number().int().min(1).max(HARD_MAX_WALK_ENTRIES).optional(),
    max_diagnostics: z.number().int().min(1).max(HARD_MAX_DIAGNOSTICS).optional(),
    max_reported_entries: z.number().int().min(1).max(HARD_MAX_REPORTED).optional(),
    max_output_chars: z.number().int().min(1000).max(HARD_MAX_OUTPUT_CHARS).optional()
  };
}

function normalizeOptions(args) {
  return {
    algorithm: args.algorithm ?? "sha256",
    includePatterns: args.include_patterns ?? [],
    excludePatterns: args.exclude_patterns ?? [],
    maxFiles: args.max_files ?? 500,
    maxFileBytes: args.max_file_bytes ?? 100 * 1024 * 1024,
    maxTotalBytes: args.max_total_bytes ?? 500 * 1024 * 1024,
    maxWalkEntries: args.max_walk_entries ?? 10000,
    maxDiagnostics: args.max_diagnostics ?? 100,
    maxReportedEntries: args.max_reported_entries ?? 200,
    maxOutputChars: args.max_output_chars ?? 60000
  };
}

export function registerDirectoryIntegrityTools(server, config) {
  const resolveAllowedExisting = makeExistingPathGuard(config);

  server.tool(
    "directory_manifest",
    "Recursively stream-hash a bounded selected directory tree and return a deterministic relative-path manifest digest plus bounded file evidence. Symlinks/junctions are not followed.",
    {
      path: z.string().min(1),
      ...optionSchema()
    },
    async (args) => {
      const options = normalizeOptions(args);
      try {
        const manifest = await buildManifest(
          args.path,
          options,
          config,
          resolveAllowedExisting
        );
        return textResult(
          publicManifest(manifest, options.maxReportedEntries),
          false,
          options.maxOutputChars
        );
      } catch (error) {
        return textResult({
          ok: false,
          message: boundedText(error.message, 1200),
          requested_root: path.resolve(args.path)
        }, true, options.maxOutputChars);
      }
    }
  );

  server.tool(
    "compare_directories",
    "Compare two bounded directory manifests by relative path, size, and streamed digest. Returns missing/extra/changed evidence; equality is null when either side is incomplete or unstable.",
    {
      left: z.string().min(1),
      right: z.string().min(1),
      ...optionSchema()
    },
    async (args) => {
      const options = normalizeOptions(args);
      try {
        const left = await buildManifest(
          args.left,
          options,
          config,
          resolveAllowedExisting
        );
        const right = await buildManifest(
          args.right,
          options,
          config,
          resolveAllowedExisting
        );

        return textResult(
          compareManifestData(left, right, options.maxReportedEntries),
          false,
          options.maxOutputChars
        );
      } catch (error) {
        return textResult({
          ok: false,
          message: boundedText(error.message, 1200),
          left_root: path.resolve(args.left),
          right_root: path.resolve(args.right)
        }, true, options.maxOutputChars);
      }
    }
  );
}
