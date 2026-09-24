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
    "Run up to 10 explicit allowlisted read-only LConnect inspections inside one MCP round trip. No shell/process/Git mutation, writes, network requests, autonomous branching, loops, or nested batches.",
    {
      operations: z.array(
        z.object({
          id: z.string().min(1).max(100).optional(),
          tool: z.string().min(1).max(100),
          arguments: z.record(z.any()).optional(),
        })
      ).min(1).max(10),
      stop_on_error: z.boolean().optional(),
      max_chars_per_result: z.number().int().min(200).max(12000).optional(),
      max_total_chars: z.number().int().min(1000).max(60000).optional(),
    },
    async (
      {
        operations,
        stop_on_error = false,
        max_chars_per_result = 4000,
        max_total_chars = 20000,
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

      const startedAt = new Date().toISOString();
      const started = performance.now();
      let usedChars = 0;
      let stoppedEarly = false;
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
            result_text: "",
          });

          if (stop_on_error) {
            stoppedEarly = true;
            break;
          }
          continue;
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
            ok: !result?.isError,
            is_error: Boolean(result?.isError),
            error_code: result?.isError ? "TOOL_RESULT_ERROR" : null,
            handler_elapsed_ms:
              Math.round((performance.now() - opStarted) * 1000) / 1000,
            result_bytes: resultBytes,
            result_chars: rawText.length,
            returned_chars: returnedText.length,
            truncated,
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
        returned_result_chars: usedChars,
        results,
      });
    }
  );
}

export function getBatchInspectionAllowlist() {
  return [...READ_ONLY_TOOLS].sort();
}
