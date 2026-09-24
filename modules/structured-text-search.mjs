import fsp from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { makeExistingPathGuard, matchesAny } from "./path-utils.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
}

function compileMatcher(query, regexMode, caseSensitive) {
  const source = regexMode ? query : escapeRegExp(query);
  try {
    return new RegExp(source, caseSensitive ? "gu" : "giu");
  } catch (error) {
    throw new Error("Invalid regular expression: " + error.message);
  }
}

function advanceZeroLength(regex, line, index) {
  if (index >= line.length) {
    regex.lastIndex = line.length + 1;
    return;
  }
  const codePoint = line.codePointAt(index);
  regex.lastIndex = index + (codePoint > 0xffff ? 2 : 1);
}

function codePointColumn(line, codeUnitIndex) {
  return Array.from(line.slice(0, codeUnitIndex)).length + 1;
}

function clipLine(value, maxChars) {
  const text = String(value);
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

async function readBoundedFile(filePath, size) {
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const read = await handle.read(buffer, offset, size - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    return offset === size ? buffer : buffer.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function pushDiagnostic(state, item, maxDiagnostics) {
  state.diagnostic_count += 1;
  if (state.diagnostics.length < maxDiagnostics) state.diagnostics.push(item);
  else state.diagnostics_truncated = true;
}

async function collectFiles(rootPath, rootStat, includePatterns, excludePatterns, state, bounds) {
  const files = [];
  const rootBase = path.basename(rootPath);

  if (rootStat.isFile()) {
    const relative = rootBase;
    if (
      (!includePatterns.length || matchesAny(relative, includePatterns)) &&
      !matchesAny(relative, excludePatterns)
    ) {
      files.push({ path: rootPath, relative });
    }
    return files;
  }

  if (!rootStat.isDirectory()) {
    throw new Error("search_text path must be a file or directory.");
  }

  const stack = [{ dir: rootPath, relative: "" }];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current.dir, { withFileTypes: true });
    } catch (error) {
      pushDiagnostic(state, {
        path: current.dir,
        kind: "READ_DIRECTORY_ERROR",
        message: error.message,
      }, bounds.max_diagnostics);
      continue;
    }

    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      const relative = current.relative
        ? current.relative + "/" + entry.name
        : entry.name;

      if (matchesAny(relative, excludePatterns)) {
        state.excluded_count += 1;
        continue;
      }

      const absolute = path.join(current.dir, entry.name);
      if (entry.isSymbolicLink()) {
        state.symlink_skipped += 1;
        pushDiagnostic(state, {
          path: absolute,
          relative_path: relative,
          kind: "SYMLINK_SKIPPED",
        }, bounds.max_diagnostics);
        continue;
      }

      if (entry.isDirectory()) {
        stack.push({ dir: absolute, relative });
        continue;
      }
      if (!entry.isFile()) continue;

      if (includePatterns.length && !matchesAny(relative, includePatterns)) continue;
      files.push({ path: absolute, relative });
      if (files.length >= bounds.max_files) {
        state.files_truncated = true;
        return files;
      }
    }
  }

  files.sort((a, b) => a.relative.localeCompare(b.relative));
  return files;
}

export function registerStructuredTextSearchTool(server, config) {
  const resolveAllowedExisting = makeExistingPathGuard(config);

  server.tool(
    "search_text",
    "Search UTF-8 text content recursively with literal/regex modes, path/line/column evidence, context, binary/error reporting, and hard files/bytes/matches/output bounds.",
    {
      path: z.string().min(1),
      query: z.string().min(1),
      regex: z.boolean().optional(),
      case_sensitive: z.boolean().optional(),
      include_patterns: z.array(z.string().min(1)).max(100).optional(),
      exclude_patterns: z.array(z.string().min(1)).max(100).optional(),
      context_lines: z.number().int().min(0).max(20).optional(),
      max_files: z.number().int().min(1).max(10000).optional(),
      max_file_bytes: z.number().int().min(1).max(100 * 1024 * 1024).optional(),
      max_total_bytes: z.number().int().min(1).max(500 * 1024 * 1024).optional(),
      max_matches: z.number().int().min(1).max(10000).optional(),
      max_output_chars: z.number().int().min(1000).max(500000).optional(),
      max_line_chars: z.number().int().min(100).max(10000).optional(),
      max_diagnostics: z.number().int().min(1).max(1000).optional(),
    },
    async ({
      path: inputPath,
      query,
      regex = false,
      case_sensitive = false,
      include_patterns = [],
      exclude_patterns = [],
      context_lines = 0,
      max_files = 500,
      max_file_bytes = 2 * 1024 * 1024,
      max_total_bytes = 10 * 1024 * 1024,
      max_matches = 200,
      max_output_chars = 60000,
      max_line_chars = 1200,
      max_diagnostics = 100,
    }) => {
      try {
        const guarded = await resolveAllowedExisting(inputPath);
        const root = guarded.real;
        const rootStat = await fsp.stat(root);
        const matcher = compileMatcher(query, regex, case_sensitive);

        const state = {
          diagnostics: [],
          diagnostic_count: 0,
          diagnostics_truncated: false,
          excluded_count: 0,
          symlink_skipped: 0,
          binary_skipped: 0,
          too_large_skipped: 0,
          files_truncated: false,
          bytes_truncated: false,
          matches_truncated: false,
          output_truncated: false,
        };
        const bounds = {
          max_files,
          max_file_bytes,
          max_total_bytes,
          max_matches,
          max_output_chars,
          max_line_chars,
          max_diagnostics,
        };

        const candidates = await collectFiles(
          root,
          rootStat,
          include_patterns,
          exclude_patterns,
          state,
          bounds
        );

        let scannedFiles = 0;
        let scannedBytes = 0;
        const matchedFileSet = new Set();
        let outputChars = 0;
        const matches = [];

        outer:
        for (const candidate of candidates) {
          let stat;
          try {
            stat = await fsp.stat(candidate.path);
          } catch (error) {
            pushDiagnostic(state, {
              path: candidate.path,
              relative_path: candidate.relative,
              kind: "STAT_ERROR",
              message: error.message,
            }, max_diagnostics);
            continue;
          }

          if (!stat.isFile()) continue;
          if (stat.size > max_file_bytes) {
            state.too_large_skipped += 1;
            pushDiagnostic(state, {
              path: candidate.path,
              relative_path: candidate.relative,
              kind: "FILE_TOO_LARGE",
              size: stat.size,
              max_file_bytes,
            }, max_diagnostics);
            continue;
          }
          if (scannedBytes + stat.size > max_total_bytes) {
            state.bytes_truncated = true;
            break;
          }

          let buffer;
          try {
            buffer = await readBoundedFile(candidate.path, stat.size);
          } catch (error) {
            pushDiagnostic(state, {
              path: candidate.path,
              relative_path: candidate.relative,
              kind: "READ_ERROR",
              message: error.message,
            }, max_diagnostics);
            continue;
          }

          scannedFiles += 1;
          scannedBytes += buffer.length;

          if (looksBinary(buffer)) {
            state.binary_skipped += 1;
            pushDiagnostic(state, {
              path: candidate.path,
              relative_path: candidate.relative,
              kind: "BINARY_SKIPPED",
              size: buffer.length,
            }, max_diagnostics);
            continue;
          }

          let text;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
          } catch (error) {
            pushDiagnostic(state, {
              path: candidate.path,
              relative_path: candidate.relative,
              kind: "ENCODING_ERROR",
              encoding: "utf-8",
              message: error.message,
            }, max_diagnostics);
            continue;
          }

          const lines = text.split(/\r?\n/);
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const line = lines[lineIndex];
            matcher.lastIndex = 0;
            let found;

            while ((found = matcher.exec(line)) !== null) {
              const clipped = clipLine(line, max_line_chars);
              const before = [];
              const after = [];

              for (let i = Math.max(0, lineIndex - context_lines); i < lineIndex; i += 1) {
                const item = clipLine(lines[i], max_line_chars);
                before.push({ line: i + 1, text: item.text, truncated: item.truncated });
              }
              for (
                let i = lineIndex + 1;
                i <= Math.min(lines.length - 1, lineIndex + context_lines);
                i += 1
              ) {
                const item = clipLine(lines[i], max_line_chars);
                after.push({ line: i + 1, text: item.text, truncated: item.truncated });
              }

              const column = codePointColumn(line, found.index);
              const matchedCodePoints = Array.from(found[0]).length;
              const item = {
                path: candidate.path,
                relative_path: candidate.relative,
                line: lineIndex + 1,
                column,
                end_column: column + Math.max(0, matchedCodePoints - 1),
                match: found[0],
                line_text: clipped.text,
                line_truncated: clipped.truncated,
                context_before: before,
                context_after: after,
              };

              const itemChars = JSON.stringify(item).length;
              if (outputChars + itemChars > max_output_chars) {
                state.output_truncated = true;
                break outer;
              }

              matches.push(item);
              outputChars += itemChars;
              matchedFileSet.add(candidate.path);

              if (matches.length >= max_matches) {
                state.matches_truncated = true;
                break outer;
              }

              if (found[0] === "") advanceZeroLength(matcher, line, found.index);
            }
          }
        }

        return textResult({
          root,
          query,
          mode: regex ? "regex" : "literal",
          case_sensitive,
          include_patterns,
          exclude_patterns,
          context_lines,
          bounds,
          scanned_files: scannedFiles,
          scanned_bytes: scannedBytes,
          matched_files: matchedFileSet.size,
          match_count: matches.length,
          matches,
          diagnostics: state.diagnostics,
          diagnostic_count: state.diagnostic_count,
          skipped: {
            excluded: state.excluded_count,
            symlink: state.symlink_skipped,
            binary: state.binary_skipped,
            too_large: state.too_large_skipped,
          },
          truncated: {
            files: state.files_truncated,
            bytes: state.bytes_truncated,
            matches: state.matches_truncated,
            output: state.output_truncated,
            diagnostics: state.diagnostics_truncated,
          },
        });
      } catch (error) {
        return textResult(error.message, true);
      }
    }
  );
}
