import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { isWithin, makeExistingPathGuard } from "./path-utils.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_PRESERVED_PATHS = [
  "mcp-conf.yaml",
  "node_modules",
  "logs",
  "runtime",
];

const HARD_MAX_TRACKED_FILES = 5000;
const HARD_MAX_FILE_BYTES = 1024 * 1024 * 1024;
const HARD_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
const HARD_MAX_REPORTED = 1000;
const HARD_MAX_OUTPUT_CHARS = 200000;

function boundedText(value, maxChars = 1000) {
  const text = String(value ?? "");
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "…";
}

function textResult(value, isError = false, maxOutputChars = 60000) {
  let text = JSON.stringify(value, null, 2);

  if (text.length > maxOutputChars) {
    const originalOutputChars = text.length;
    text = JSON.stringify({
      ok: value?.ok !== false,
      source_root: value?.source_root ?? null,
      installed_root: value?.installed_root ?? null,
      checks: value?.checks ?? null,
      tracked: value?.tracked
        ? {
            complete: value.tracked.complete,
            file_count: value.tracked.file_count,
            equal_count: value.tracked.equal_count,
            missing_installed_count: value.tracked.missing_installed_count,
            changed_count: value.tracked.changed_count,
            unstable_or_error_count: value.tracked.unstable_or_error_count,
            source_manifest_digest: value.tracked.source_manifest_digest,
            installed_manifest_digest: value.tracked.installed_manifest_digest,
            parity_equal: value.tracked.parity_equal,
          }
        : null,
      package: value?.package
        ? {
            source_version: value.package.source_version,
            installed_version: value.package.installed_version,
            version_equal: value.package.version_equal,
            dependency_declarations_equal:
              value.package.dependency_declarations_equal,
            installed_direct_dependency_count:
              value.package.installed_direct_dependency_count,
            missing_direct_dependencies:
              value.package.missing_direct_dependencies,
          }
        : null,
      preserved: value?.preserved
        ? {
            all_present: value.preserved.all_present,
            count: value.preserved.count,
            missing_count: value.preserved.missing_count,
          }
        : null,
      runtime: value?.runtime
        ? {
            version: value.runtime.version,
            process_id: value.runtime.process_id,
            runtime_started_at: value.runtime.runtime_started_at,
            working_directory: value.runtime.working_directory,
            tool_count: value.runtime.tool_count,
            tool_name_digest_sha256: value.runtime.tool_name_digest_sha256,
            working_directory_matches_installed:
              value.runtime.working_directory_matches_installed,
            version_matches_installed_package:
              value.runtime.version_matches_installed_package,
            expected_tool_count: value.runtime.expected_tool_count,
            expected_tool_count_matches:
              value.runtime.expected_tool_count_matches,
          }
        : null,
      output_bound: {
        max_output_chars: maxOutputChars,
        original_output_chars: originalOutputChars,
        details_omitted: true,
      },
      note:
        "Detailed tracked/dependency/preserved evidence was omitted to enforce max_output_chars.",
    }, null, 2);

    if (text.length > maxOutputChars) {
      text = JSON.stringify({
        ok: value?.ok !== false,
        checks: value?.checks ?? null,
        tracked: value?.tracked
          ? {
              file_count: value.tracked.file_count,
              equal_count: value.tracked.equal_count,
              missing_installed_count: value.tracked.missing_installed_count,
              changed_count: value.tracked.changed_count,
              unstable_or_error_count: value.tracked.unstable_or_error_count,
              parity_equal: value.tracked.parity_equal,
            }
          : null,
        package: value?.package
          ? {
              source_version: value.package.source_version,
              installed_version: value.package.installed_version,
              version_equal: value.package.version_equal,
            }
          : null,
        preserved: value?.preserved
          ? {
              all_present: value.preserved.all_present,
              missing_count: value.preserved.missing_count,
            }
          : null,
        runtime: value?.runtime
          ? {
              version: value.runtime.version,
              tool_count: value.runtime.tool_count,
              expected_tool_count: value.runtime.expected_tool_count,
              expected_tool_count_matches:
                value.runtime.expected_tool_count_matches,
            }
          : null,
        output_bound: {
          max_output_chars: maxOutputChars,
          original_output_chars: originalOutputChars,
          details_omitted: true,
          metadata_clipped: true,
        },
      }, null, 2);

      if (text.length > maxOutputChars) {
        text = JSON.stringify({
          ok: value?.ok !== false,
          tracked_parity_equal: value?.tracked?.parity_equal ?? null,
          tracked_file_count: value?.tracked?.file_count ?? null,
          source_version: value?.package?.source_version ?? null,
          installed_version: value?.package?.installed_version ?? null,
          preserved_paths_all_present:
            value?.preserved?.all_present ?? null,
          runtime_version: value?.runtime?.version ?? null,
          runtime_tool_count: value?.runtime?.tool_count ?? null,
          expected_tool_count: value?.runtime?.expected_tool_count ?? null,
          expected_tool_count_matches:
            value?.runtime?.expected_tool_count_matches ?? null,
          output_bound: {
            max_output_chars: maxOutputChars,
            original_output_chars: originalOutputChars,
            details_omitted: true,
            metadata_clipped: true,
            minimal_summary: true,
          },
        }, null, 2);
      }
    }
  }

  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function readBoundedJson(filePath, maxBytes = 2 * 1024 * 1024) {
  const handle = await fsp.open(filePath, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error("Path is not a regular file: " + filePath);
    }
    if (before.size > maxBytes) {
      throw new Error(
        "JSON file exceeds bound: " + before.size + " > " + maxBytes
      );
    }

    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < before.size) {
      const result = await handle.read(
        buffer,
        offset,
        before.size - offset,
        offset
      );
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }

    const after = await handle.stat();
    if (
      offset !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      throw new Error("JSON file changed during read: " + filePath);
    }

    let text = new TextDecoder("utf-8", { fatal: true }).decode(
      offset === buffer.length ? buffer : buffer.subarray(0, offset)
    );
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return JSON.parse(text);
  } finally {
    await handle.close();
  }
}

async function gitTrackedFiles(sourceRoot, maxFiles) {
  let stdout;
  try {
    const result = await execFileAsync(
      "git",
      ["-C", sourceRoot, "ls-files", "-z"],
      {
        encoding: "buffer",
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 8 * 1024 * 1024,
      }
    );
    stdout = result.stdout;
  } catch (error) {
    throw new Error(
      "git ls-files failed: " +
      boundedText(error?.stderr || error?.message || error, 1200)
    );
  }

  const text = Buffer.isBuffer(stdout)
    ? stdout.toString("utf8")
    : String(stdout || "");
  const files = text
    .split("\0")
    .filter(Boolean)
    .map((item) => item.replace(/\\/gu, "/"))
    .sort(compareText);

  if (files.length > maxFiles) {
    throw new Error(
      "TRACKED_FILE_LIMIT: " + files.length +
      " tracked files exceeds max_tracked_files=" + maxFiles + "."
    );
  }

  return files;
}

async function hashStableFile(filePath, maxFileBytes, remainingTotalBytes) {
  const handle = await fsp.open(filePath, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      const error = new Error("Path is not a regular file.");
      error.code = "NOT_REGULAR_FILE";
      throw error;
    }
    if (before.size > maxFileBytes) {
      const error = new Error(
        "File exceeds max_file_bytes: " + before.size + " > " + maxFileBytes
      );
      error.code = "FILE_TOO_LARGE";
      throw error;
    }
    if (before.size > remainingTotalBytes) {
      const error = new Error("Tracked bytes exceed max_total_bytes.");
      error.code = "TOTAL_BYTES_LIMIT";
      throw error;
    }

    const hash = createHash("sha256");
    let bytes = 0;
    const stream = handle.createReadStream({
      autoClose: false,
      highWaterMark: 1024 * 1024,
      start: 0,
    });

    for await (const chunk of stream) {
      hash.update(chunk);
      bytes += chunk.length;
    }

    const afterHandle = await handle.stat();
    let afterPath = null;
    try {
      afterPath = await fsp.stat(filePath);
    } catch {}

    const stable =
      bytes === before.size &&
      before.size === afterHandle.size &&
      before.mtimeMs === afterHandle.mtimeMs &&
      before.ctimeMs === afterHandle.ctimeMs &&
      afterPath !== null &&
      afterHandle.dev === afterPath.dev &&
      afterHandle.ino === afterPath.ino;

    return {
      size: before.size,
      digest: hash.digest("hex"),
      stable,
    };
  } finally {
    await handle.close();
  }
}

function manifestDigest(records) {
  const hash = createHash("sha256");
  hash.update("lconnect-deployment-tracked-manifest-v1\n");
  for (const item of records) {
    hash.update(JSON.stringify([
      item.relative_path,
      item.size,
      item.digest,
    ]));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function compareTrackedTree({
  sourceRoot,
  installedRoot,
  trackedFiles,
  maxFileBytes,
  maxTotalBytes,
  maxReportedDifferences,
}) {
  const sourceRecords = [];
  const installedRecords = [];
  const missingInstalled = [];
  const changed = [];
  const diagnostics = [];
  let equalCount = 0;
  let unstableOrErrorCount = 0;
  let sourceBytes = 0;
  let installedBytes = 0;
  let complete = true;

  for (const relativePath of trackedFiles) {
    const sourcePath = path.join(sourceRoot, ...relativePath.split("/"));
    const installedPath = path.join(installedRoot, ...relativePath.split("/"));

    let sourceReal;
    let installedReal;
    let sourceEvidence;
    let installedEvidence;

    try {
      const sourceLstat = await fsp.lstat(sourcePath);
      if (sourceLstat.isSymbolicLink()) {
        const error = new Error("Tracked source symlink is not hashed as a regular deployment file.");
        error.code = "SOURCE_SYMLINK";
        throw error;
      }
      sourceReal = await fsp.realpath(sourcePath);
      if (!isWithin(sourceReal, sourceRoot)) {
        throw new Error("Source tracked path resolves outside source root.");
      }
      sourceEvidence = await hashStableFile(
        sourceReal,
        maxFileBytes,
        maxTotalBytes - sourceBytes
      );
      sourceBytes += sourceEvidence.size;
      sourceRecords.push({
        relative_path: relativePath,
        size: sourceEvidence.size,
        digest: sourceEvidence.digest,
      });
    } catch (error) {
      complete = false;
      unstableOrErrorCount += 1;
      if (diagnostics.length < maxReportedDifferences) {
        diagnostics.push({
          side: "source",
          relative_path: relativePath,
          message: boundedText(error.message, 800),
        });
      }
      continue;
    }

    try {
      const installedLstat = await fsp.lstat(installedPath);
      if (installedLstat.isSymbolicLink()) {
        const error = new Error("Installed tracked path is a symlink, not a regular deployment file.");
        error.code = "INSTALLED_SYMLINK";
        throw error;
      }
      installedReal = await fsp.realpath(installedPath);
    } catch (error) {
      if (error?.code === "INSTALLED_SYMLINK") {
        complete = false;
        unstableOrErrorCount += 1;
        if (diagnostics.length < maxReportedDifferences) {
          diagnostics.push({
            side: "installed",
            relative_path: relativePath,
            message: error.message,
          });
        }
      } else {
        missingInstalled.push(relativePath);
      }
      continue;
    }

    if (!isWithin(installedReal, installedRoot)) {
      complete = false;
      unstableOrErrorCount += 1;
      if (diagnostics.length < maxReportedDifferences) {
        diagnostics.push({
          side: "installed",
          relative_path: relativePath,
          message: "Installed tracked path resolves outside installed root.",
        });
      }
      continue;
    }

    try {
      installedEvidence = await hashStableFile(
        installedReal,
        maxFileBytes,
        maxTotalBytes - installedBytes
      );
      installedBytes += installedEvidence.size;
    } catch (error) {
      complete = false;
      unstableOrErrorCount += 1;
      if (diagnostics.length < maxReportedDifferences) {
        diagnostics.push({
          side: "installed",
          relative_path: relativePath,
          message: boundedText(error.message, 800),
        });
      }
      continue;
    }

    installedRecords.push({
      relative_path: relativePath,
      size: installedEvidence.size,
      digest: installedEvidence.digest,
    });

    if (!sourceEvidence.stable || !installedEvidence.stable) {
      complete = false;
      unstableOrErrorCount += 1;
      if (diagnostics.length < maxReportedDifferences) {
        diagnostics.push({
          side: "both",
          relative_path: relativePath,
          message: "File changed or path identity changed during hashing.",
        });
      }
      continue;
    }

    if (
      sourceEvidence.size === installedEvidence.size &&
      sourceEvidence.digest === installedEvidence.digest
    ) {
      equalCount += 1;
    } else {
      changed.push({
        relative_path: relativePath,
        source: sourceEvidence,
        installed: installedEvidence,
      });
    }
  }

  sourceRecords.sort((a, b) => compareText(a.relative_path, b.relative_path));
  installedRecords.sort((a, b) => compareText(a.relative_path, b.relative_path));

  const parityEqual =
    complete &&
    missingInstalled.length === 0 &&
    changed.length === 0 &&
    equalCount === trackedFiles.length;

  return {
    complete,
    file_count: trackedFiles.length,
    equal_count: equalCount,
    missing_installed_count: missingInstalled.length,
    changed_count: changed.length,
    unstable_or_error_count: unstableOrErrorCount,
    source_bytes: sourceBytes,
    installed_bytes: installedBytes,
    source_manifest_digest: manifestDigest(sourceRecords),
    installed_manifest_digest: manifestDigest(installedRecords),
    parity_equal: parityEqual,
    missing_installed: missingInstalled.slice(0, maxReportedDifferences),
    changed: changed.slice(0, maxReportedDifferences),
    diagnostics: diagnostics.slice(0, maxReportedDifferences),
    truncated: {
      missing_installed:
        missingInstalled.length > maxReportedDifferences,
      changed: changed.length > maxReportedDifferences,
      diagnostics: diagnostics.length > maxReportedDifferences,
    },
  };
}

async function directDependencyEvidence(
  sourcePackage,
  installedPackage,
  installedRoot
) {
  const sourceDeps = sourcePackage?.dependencies || {};
  const installedDeps = installedPackage?.dependencies || {};
  const names = Object.keys(sourceDeps).sort(compareText);
  const evidence = [];
  let installedCount = 0;
  const missing = [];

  for (const name of names) {
    const parts = name.split("/");
    const packageJsonPath = path.join(
      installedRoot,
      "node_modules",
      ...parts,
      "package.json"
    );

    let installedVersion = null;
    let present = false;
    try {
      const pkg = await readBoundedJson(packageJsonPath, 1024 * 1024);
      present = true;
      installedVersion = pkg?.version ?? null;
      installedCount += 1;
    } catch {
      missing.push(name);
    }

    evidence.push({
      name,
      source_declared: sourceDeps[name] ?? null,
      installed_declared: installedDeps[name] ?? null,
      declaration_equal:
        (sourceDeps[name] ?? null) === (installedDeps[name] ?? null),
      node_modules_present: present,
      node_modules_version: installedVersion,
    });
  }

  return {
    source_dependencies: sourceDeps,
    installed_dependencies: installedDeps,
    dependency_declarations_equal:
      JSON.stringify(sourceDeps) === JSON.stringify(installedDeps),
    direct_dependencies: evidence,
    installed_direct_dependency_count: installedCount,
    missing_direct_dependencies: missing,
  };
}

async function preservedEvidence(installedRoot, preservedPaths) {
  const entries = [];

  for (const relative of preservedPaths) {
    const candidate = path.resolve(installedRoot, relative);
    if (!isWithin(candidate, installedRoot)) {
      entries.push({
        relative_path: relative,
        exists: false,
        kind: null,
        error: "Resolved preserved path is outside installed root.",
      });
      continue;
    }

    try {
      const stat = await fsp.lstat(candidate);
      let kind = "other";
      if (stat.isFile()) kind = "file";
      else if (stat.isDirectory()) kind = "directory";
      else if (stat.isSymbolicLink()) kind = "symlink";

      let real = null;
      try {
        real = await fsp.realpath(candidate);
      } catch {}

      entries.push({
        relative_path: relative,
        exists: true,
        kind,
        real_path: real,
      });
    } catch {
      entries.push({
        relative_path: relative,
        exists: false,
        kind: null,
        real_path: null,
      });
    }
  }

  const missing = entries.filter((item) => !item.exists);
  return {
    count: entries.length,
    all_present: missing.length === 0,
    missing_count: missing.length,
    entries,
  };
}

export function registerDeploymentVerificationTool(
  server,
  config,
  { runtimeCatalog } = {}
) {
  const resolveAllowedExisting = makeExistingPathGuard(config);

  server.tool(
    "deployment_verification_snapshot",
    "Return one bounded read-only deployment evidence snapshot: Git-tracked source↔installed parity, package/dependency evidence, preserved local paths, and the running runtime catalog identity. Does not copy, install, restart, refresh, fetch, or release.",
    {
      source_root: z.string().min(1),
      installed_root: z.string().min(1),
      expected_tool_count: z.number().int().min(1).max(10000).optional(),
      preserved_paths: z.array(z.string().min(1)).max(50).optional(),
      max_tracked_files: z.number().int().min(1).max(HARD_MAX_TRACKED_FILES).optional(),
      max_file_bytes: z.number().int().min(1).max(HARD_MAX_FILE_BYTES).optional(),
      max_total_bytes: z.number().int().min(1).max(HARD_MAX_TOTAL_BYTES).optional(),
      max_reported_differences: z.number().int().min(1).max(HARD_MAX_REPORTED).optional(),
      max_output_chars: z.number().int().min(1000).max(HARD_MAX_OUTPUT_CHARS).optional(),
    },
    async ({
      source_root,
      installed_root,
      expected_tool_count,
      preserved_paths = DEFAULT_PRESERVED_PATHS,
      max_tracked_files = 1000,
      max_file_bytes = 100 * 1024 * 1024,
      max_total_bytes = 1024 * 1024 * 1024,
      max_reported_differences = 100,
      max_output_chars = 60000,
    }) => {
      try {
        const sourceGuarded = await resolveAllowedExisting(source_root);
        const installedGuarded = await resolveAllowedExisting(installed_root);

        const sourceRoot = sourceGuarded.real;
        const installedRoot = installedGuarded.real;

        const sourceStat = await fsp.stat(sourceRoot);
        const installedStat = await fsp.stat(installedRoot);
        if (!sourceStat.isDirectory() || !installedStat.isDirectory()) {
          throw new Error("source_root and installed_root must both be directories.");
        }

        const trackedFiles = await gitTrackedFiles(
          sourceRoot,
          max_tracked_files
        );

        const tracked = await compareTrackedTree({
          sourceRoot,
          installedRoot,
          trackedFiles,
          maxFileBytes: max_file_bytes,
          maxTotalBytes: max_total_bytes,
          maxReportedDifferences: max_reported_differences,
        });

        const sourcePackage = await readBoundedJson(
          path.join(sourceRoot, "package.json")
        );
        const installedPackage = await readBoundedJson(
          path.join(installedRoot, "package.json")
        );

        const deps = await directDependencyEvidence(
          sourcePackage,
          installedPackage,
          installedRoot
        );

        const preserved = await preservedEvidence(
          installedRoot,
          preserved_paths
        );

        const runtimeSnapshot =
          runtimeCatalog && typeof runtimeCatalog.snapshot === "function"
            ? runtimeCatalog.snapshot({ includeNames: false })
            : null;

        const runtimeWorkingDirectory =
          runtimeSnapshot?.working_directory ?? null;
        let runtimeWorkingDirectoryMatchesInstalled = null;
        if (runtimeWorkingDirectory) {
          try {
            const runtimeReal = await fsp.realpath(runtimeWorkingDirectory);
            runtimeWorkingDirectoryMatchesInstalled =
              path.resolve(runtimeReal) === path.resolve(installedRoot);
          } catch {
            runtimeWorkingDirectoryMatchesInstalled = false;
          }
        }

        const sourceVersion = sourcePackage?.version ?? null;
        const installedVersion = installedPackage?.version ?? null;

        const runtime = runtimeSnapshot
          ? {
              ...runtimeSnapshot,
              working_directory_matches_installed:
                runtimeWorkingDirectoryMatchesInstalled,
              version_matches_installed_package:
                installedVersion !== null
                  ? runtimeSnapshot.version === installedVersion
                  : null,
              expected_tool_count: expected_tool_count ?? null,
              expected_tool_count_matches:
                expected_tool_count === undefined
                  ? null
                  : runtimeSnapshot.tool_count === expected_tool_count,
            }
          : {
              available: false,
              expected_tool_count: expected_tool_count ?? null,
              expected_tool_count_matches: null,
            };

        const packageEvidence = {
          source_version: sourceVersion,
          installed_version: installedVersion,
          version_equal: sourceVersion === installedVersion,
          ...deps,
        };

        const checks = {
          tracked_files_equal: tracked.parity_equal,
          package_version_equal: packageEvidence.version_equal,
          dependency_declarations_equal:
            packageEvidence.dependency_declarations_equal,
          all_direct_dependencies_present:
            packageEvidence.missing_direct_dependencies.length === 0,
          preserved_paths_all_present: preserved.all_present,
          runtime_catalog_available: Boolean(runtimeSnapshot),
          runtime_working_directory_matches_installed:
            runtimeWorkingDirectoryMatchesInstalled,
          runtime_version_matches_installed_package:
            runtimeSnapshot
              ? runtime.version_matches_installed_package
              : null,
          expected_tool_count_matches:
            runtimeSnapshot
              ? runtime.expected_tool_count_matches
              : null,
        };

        return textResult(
          {
            ok: true,
            source_root: sourceRoot,
            installed_root: installedRoot,
            source_requested_root: sourceGuarded.resolved,
            installed_requested_root: installedGuarded.resolved,
            checks,
            tracked,
            package: packageEvidence,
            preserved,
            runtime,
            bounds: {
              max_tracked_files,
              max_file_bytes,
              max_total_bytes,
              max_reported_differences,
              max_output_chars,
            },
            decision_boundary:
              "Evidence only. LConnect does not decide whether deployment/restart/release should proceed.",
          },
          false,
          max_output_chars
        );
      } catch (error) {
        return textResult(
          {
            ok: false,
            message: boundedText(error.message, 1600),
            source_root: path.resolve(source_root),
            installed_root: path.resolve(installed_root),
          },
          true,
          max_output_chars
        );
      }
    }
  );
}
