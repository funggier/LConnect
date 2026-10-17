import { createHash } from "node:crypto";
import { z } from "zod";

const READ_ONLY_TOOLS = new Set([
  "list_allowed_directories",
  "list_directory",
  "list_directory_with_sizes",
  "directory_tree",
  "read_text_file",
  "read_multiple_files",
  "search_files",
  "search_text",
  "file_hash",
  "compare_files",
  "get_file_info",
  "list_sessions",
  "session_status",
  "runtime_catalog",
  "delivery_snapshot",
  "structured_data_inspect",
  "directory_manifest",
  "compare_directories",
  "system_info",
  "list_processes",
  "list_listening_ports",
  "process_details",
  "process_tree",
  "find_process",
  "list_services",
  "get_service",
  "tcp_connections",
  "udp_endpoints",
  "port_owner",
  "network_interfaces",
  "cpu_info",
  "memory_info",
  "disk_info",
  "gpu_info",
  "storage_health",
  "battery_info",
  "git_status",
  "git_sync_status",
  "git_diff",
  "git_log",
  "git_is_ancestor",
  "detect_project",
  "detect_build_system",
  "project_info",
  "tail_file",
  "read_log_events",
  "search_log",
  "watch_events",
  "watch_status",
  "list_scheduled_tasks",
  "get_scheduled_task",
  "path_list",
  "which",
]);

const RESULT_DIGEST_RE = /^[0-9a-f]{64}$/i;
const MAX_CACHE_ENTRIES = 256;
const MAX_CACHE_AGE_MS = 300000;
const digestCache = new Map();

function textResult(value, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

function extractText(result) {
  if (!Array.isArray(result?.content)) return "";

  const parts = [];
  for (const item of result.content) {
    if (item?.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item?.type) {
      parts.push(`[${item.type} content omitted by batch_inspect]`);
    }
  }
  return parts.join("\n");
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) out[key] = canonicalize(child);
    }
    return out;
  }

  return value;
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function operationCacheKey(toolName, args) {
  const canonical = JSON.stringify({
    tool: toolName,
    arguments: canonicalize(args ?? {}),
  });
  return sha256Text(canonical);
}

function readFreshDigestCache(cacheKey, maxAgeMs) {
  if (maxAgeMs <= 0) return null;

  const entry = digestCache.get(cacheKey);
  if (!entry) return null;

  const ageMs = Math.max(0, Date.now() - entry.checked_at_ms);
  if (ageMs > maxAgeMs) return null;

  digestCache.delete(cacheKey);
  digestCache.set(cacheKey, entry);
  return { ...entry, age_ms: ageMs };
}

function writeDigestCache(cacheKey, entry) {
  digestCache.delete(cacheKey);
  digestCache.set(cacheKey, entry);

  while (digestCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = digestCache.keys().next().value;
    if (oldestKey === undefined) break;
    digestCache.delete(oldestKey);
  }
}

function compactNotModifiedResult({
  index,
  operation,
  digest,
  resultBytes,
  resultChars,
  handlerElapsedMs,
  cacheHit,
  executionSkipped,
  cacheAgeMs = null,
}) {
  return {
    index,
    id: operation.id ?? null,
    tool: operation.tool,
    ok: true,
    is_error: false,
    error_code: null,
    handler_elapsed_ms: handlerElapsedMs,
    result_bytes: resultBytes,
    result_chars: resultChars,
    returned_chars: 0,
    truncated: false,
    result_digest_sha256: digest,
    not_modified: true,
    result_suppressed: true,
    cache_hit: cacheHit,
    execution_skipped: executionSkipped,
    cache_age_ms: cacheAgeMs,
    result_text: "",
  };
}

async function invokeRegisteredReadOnlyTool(server, toolName, args, extra) {
  const tool = server._registeredTools?.[toolName];
  if (!tool) {
    throw new Error(`Registered tool not found: ${toolName}`);
  }
  if (!tool.enabled) {
    throw new Error(`Tool is disabled: ${toolName}`);
  }

  const validated = await server.validateToolInput(
    tool,
    args ?? {},
    toolName
  );
  const result = await server.executeToolHandler(tool, validated, extra);
  await server.validateToolOutput(tool, result, toolName);
  return result;
}

export function registerBatchInspectionTool(server) {
  server.tool(
    "batch_inspect",
    "Run up to 10 explicit allowlisted read-only LConnect inspections inside one MCP round trip. Supports SHA-256 conditional results and a bounded digest-only cache so unchanged repeated reads can suppress duplicate payloads without storing result content. No shell/process/Git mutation, writes, network requests, autonomous branching, loops, or nested batches.",
    {
      operations: z.array(
        z.object({
          id: z.string().min(1).max(100).optional(),
          tool: z.string().min(1).max(100),
          arguments: z.record(z.any()).optional(),
          known_digest: z.string().regex(RESULT_DIGEST_RE).optional(),
          cache_max_age_ms: z.number().int().min(0).max(MAX_CACHE_AGE_MS).optional(),
        })
      ).min(1).max(10),
      stop_on_error: z.boolean().optional(),
      max_chars_per_result: z.number().int().min(200).max(12000).optional(),
      max_total_chars: z.number().int().min(1000).max(60000).optional(),
      cache_max_age_ms: z.number().int().min(0).max(MAX_CACHE_AGE_MS).optional(),
    },
    async (
      {
        operations,
        stop_on_error = false,
        max_chars_per_result = 4000,
        max_total_chars = 20000,
        cache_max_age_ms = 0,
      },
      extra
    ) => {
      const perResultLimit = boundedInteger(
        max_chars_per_result,
        4000,
        200,
        12000
      );
      const totalLimit = boundedInteger(
        max_total_chars,
        20000,
        1000,
        60000
      );
      const defaultCacheMaxAgeMs = boundedInteger(
        cache_max_age_ms,
        0,
        0,
        MAX_CACHE_AGE_MS
      );

      const startedAt = new Date().toISOString();
      const started = performance.now();
      let usedChars = 0;
      let stoppedEarly = false;
      let conditionalRequests = 0;
      let cacheShortCircuits = 0;
      let revalidatedNotModified = 0;
      let changedResults = 0;
      let estimatedSavedChars = 0;
      const results = [];

      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        const opStarted = performance.now();

        if (!READ_ONLY_TOOLS.has(operation.tool)) {
          results.push({
            index,
            id: operation.id ?? null,
            tool: operation.tool,
            ok: false,
            is_error: true,
            error_code: "TOOL_NOT_ALLOWED",
            error_message:
              "batch_inspect only permits explicitly allowlisted read-only tools.",
            handler_elapsed_ms: 0,
            result_bytes: 0,
            result_chars: 0,
            returned_chars: 0,
            truncated: false,
            result_digest_sha256: null,
            not_modified: false,
            result_suppressed: false,
            cache_hit: false,
            execution_skipped: false,
            cache_age_ms: null,
            result_text: "",
          });

          if (stop_on_error) {
            stoppedEarly = true;
            break;
          }
          continue;
        }

        const knownDigest = operation.known_digest?.toLowerCase() ?? null;
        const operationCacheMaxAgeMs = boundedInteger(
          operation.cache_max_age_ms,
          defaultCacheMaxAgeMs,
          0,
          MAX_CACHE_AGE_MS
        );
        const cacheKey = operationCacheKey(
          operation.tool,
          operation.arguments ?? {}
        );

        if (knownDigest) {
          conditionalRequests += 1;
          const cached = readFreshDigestCache(cacheKey, operationCacheMaxAgeMs);
          if (cached && cached.result_digest_sha256 === knownDigest) {
            cacheShortCircuits += 1;
            estimatedSavedChars += cached.result_chars;
            results.push(compactNotModifiedResult({
              index,
              operation,
              digest: cached.result_digest_sha256,
              resultBytes: cached.result_bytes,
              resultChars: cached.result_chars,
              handlerElapsedMs:
                Math.round((performance.now() - opStarted) * 1000) / 1000,
              cacheHit: true,
              executionSkipped: true,
              cacheAgeMs: cached.age_ms,
            }));
            continue;
          }
        }

        try {
          const result = await invokeRegisteredReadOnlyTool(
            server,
            operation.tool,
            operation.arguments ?? {},
            extra
          );

          const rawText = extractText(result);
          const resultBytes = Buffer.byteLength(rawText, "utf8");
          const resultDigest = sha256Text(rawText);
          const isError = Boolean(result?.isError);

          if (!isError) {
            writeDigestCache(cacheKey, {
              result_digest_sha256: resultDigest,
              result_bytes: resultBytes,
              result_chars: rawText.length,
              checked_at_ms: Date.now(),
            });
          }

          if (!isError && knownDigest === resultDigest) {
            revalidatedNotModified += 1;
            estimatedSavedChars += rawText.length;
            results.push(compactNotModifiedResult({
              index,
              operation,
              digest: resultDigest,
              resultBytes,
              resultChars: rawText.length,
              handlerElapsedMs:
                Math.round((performance.now() - opStarted) * 1000) / 1000,
              cacheHit: false,
              executionSkipped: false,
            }));
            continue;
          }

          if (knownDigest && !isError) changedResults += 1;

          const remaining = Math.max(0, totalLimit - usedChars);
          const allowedChars = Math.min(perResultLimit, remaining);
          const returnedText =
            allowedChars > 0 ? rawText.slice(0, allowedChars) : "";
          const truncated = returnedText.length < rawText.length;
          usedChars += returnedText.length;

          const item = {
            index,
            id: operation.id ?? null,
            tool: operation.tool,
            ok: !isError,
            is_error: isError,
            error_code: isError ? "TOOL_RESULT_ERROR" : null,
            handler_elapsed_ms:
              Math.round((performance.now() - opStarted) * 1000) / 1000,
            result_bytes: resultBytes,
            result_chars: rawText.length,
            returned_chars: returnedText.length,
            truncated,
            result_digest_sha256: resultDigest,
            not_modified: false,
            result_suppressed: false,
            cache_hit: false,
            execution_skipped: false,
            cache_age_ms: null,
            result_text: returnedText,
          };
          results.push(item);

          if (item.is_error && stop_on_error) {
            stoppedEarly = true;
            break;
          }
        } catch (error) {
          results.push({
            index,
            id: operation.id ?? null,
            tool: operation.tool,
            ok: false,
            is_error: true,
            error_code: error?.code ?? "BATCH_OPERATION_ERROR",
            error_message: error?.message ?? String(error),
            handler_elapsed_ms:
              Math.round((performance.now() - opStarted) * 1000) / 1000,
            result_bytes: 0,
            result_chars: 0,
            returned_chars: 0,
            truncated: false,
            result_digest_sha256: null,
            not_modified: false,
            result_suppressed: false,
            cache_hit: false,
            execution_skipped: false,
            cache_age_ms: null,
            result_text: "",
          });

          if (stop_on_error) {
            stoppedEarly = true;
            break;
          }
        }
      }

      return textResult({
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        handler_elapsed_ms:
          Math.round((performance.now() - started) * 1000) / 1000,
        requested_operations: operations.length,
        completed_operations: results.length,
        stopped_early: stoppedEarly,
        max_chars_per_result: perResultLimit,
        max_total_chars: totalLimit,
        cache_max_age_ms: defaultCacheMaxAgeMs,
        returned_result_chars: usedChars,
        conditional_cache: {
          digest_algorithm: "sha256",
          content_retained: false,
          max_entries: MAX_CACHE_ENTRIES,
          entries: digestCache.size,
          conditional_requests: conditionalRequests,
          cache_short_circuits: cacheShortCircuits,
          revalidated_not_modified: revalidatedNotModified,
          changed_results: changedResults,
          estimated_saved_chars: estimatedSavedChars,
        },
        results,
      });
    }
  );
}

export function getBatchInspectionAllowlist() {
  return [...READ_ONLY_TOOLS].sort();
}

export function clearBatchInspectionDigestCache() {
  const previousEntries = digestCache.size;
  digestCache.clear();
  return { cleared: true, previous_entries: previousEntries };
}
