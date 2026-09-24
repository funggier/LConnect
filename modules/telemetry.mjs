import { z } from "zod";

const state = {
  enabled: true,
  maxEvents: 500,
  events: [],
  nextSeq: 1,
  droppedEvents: 0,
  startedAt: new Date().toISOString(),
  installed: false,
};

function normalizeMaxEvents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 500;
  return Math.min(5000, Math.max(10, Math.floor(parsed)));
}

export function configureToolTelemetry({
  enabled = true,
  maxEvents = 500,
} = {}) {
  state.enabled = enabled !== false;
  state.maxEvents = normalizeMaxEvents(maxEvents);

  while (state.events.length > state.maxEvents) {
    state.events.shift();
    state.droppedEvents += 1;
  }

  return getToolTelemetryState();
}

function estimateResultBytes(result) {
  let total = 0;

  if (Array.isArray(result?.content)) {
    for (const item of result.content) {
      if (item?.type === "text" && typeof item.text === "string") {
        total += Buffer.byteLength(item.text, "utf8");
      } else if (item?.type === "image" && typeof item.data === "string") {
        total += Buffer.byteLength(item.data, "utf8");
      } else if (item) {
        try {
          total += Buffer.byteLength(JSON.stringify(item), "utf8");
        } catch {}
      }
    }
  }

  if (result?.structuredContent !== undefined) {
    try {
      total += Buffer.byteLength(JSON.stringify(result.structuredContent), "utf8");
    } catch {}
  }

  return total;
}

function timeoutLike(result) {
  if (!result?.isError || !Array.isArray(result.content)) return false;
  for (const item of result.content) {
    if (item?.type !== "text" || typeof item.text !== "string") continue;
    const text = item.text.toLowerCase();
    if (
      text.includes("timed out") ||
      text.includes("timeout") ||
      text.includes("etimedout")
    ) {
      return true;
    }
  }
  return false;
}

function extractRequestId(handlerArgs) {
  for (let i = handlerArgs.length - 1; i >= 0; i -= 1) {
    const candidate = handlerArgs[i];
    if (
      candidate &&
      typeof candidate === "object" &&
      Object.prototype.hasOwnProperty.call(candidate, "requestId")
    ) {
      const value = candidate.requestId;
      return value === undefined || value === null ? null : String(value);
    }
  }
  return null;
}

function pushEvent(event) {
  if (!state.enabled) return;

  state.events.push({
    seq: state.nextSeq++,
    ...event,
  });

  while (state.events.length > state.maxEvents) {
    state.events.shift();
    state.droppedEvents += 1;
  }
}

export function installToolTelemetry(server, config = {}) {
  configureToolTelemetry(config);

  if (state.installed) return;
  state.installed = true;

  const originalTool = server.tool.bind(server);

  server.tool = (name, ...rest) => {
    const callbackIndex = rest.length - 1;
    const callback = rest[callbackIndex];

    if (name === "tool_telemetry" || typeof callback !== "function") {
      return originalTool(name, ...rest);
    }

    rest[callbackIndex] = async (...handlerArgs) => {
      const requestId = extractRequestId(handlerArgs);
      const startedAt = new Date().toISOString();
      const started = performance.now();

      try {
        const result = await callback(...handlerArgs);
        const completedAt = new Date().toISOString();

        pushEvent({
          request_id: requestId,
          tool_name: name,
          handler_started_at: startedAt,
          handler_completed_at: completedAt,
          handler_elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000,
          result_bytes: estimateResultBytes(result),
          is_error: Boolean(result?.isError),
          timed_out: timeoutLike(result),
          threw: false,
        });

        return result;
      } catch (error) {
        const completedAt = new Date().toISOString();

        pushEvent({
          request_id: requestId,
          tool_name: name,
          handler_started_at: startedAt,
          handler_completed_at: completedAt,
          handler_elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000,
          result_bytes: 0,
          is_error: true,
          timed_out: String(error?.code || "").toUpperCase() === "ETIMEDOUT" ||
            String(error?.message || "").toLowerCase().includes("timeout"),
          threw: true,
        });

        throw error;
      }
    };

    return originalTool(name, ...rest);
  };
}

export function getToolTelemetryState() {
  return {
    enabled: state.enabled,
    max_events: state.maxEvents,
    buffered_events: state.events.length,
    dropped_events: state.droppedEvents,
    next_seq: state.nextSeq,
    started_at: state.startedAt,
  };
}

function summarize(events) {
  const byTool = new Map();

  for (const event of events) {
    let row = byTool.get(event.tool_name);
    if (!row) {
      row = {
        tool_name: event.tool_name,
        count: 0,
        error_count: 0,
        timeout_count: 0,
        total_handler_ms: 0,
        max_handler_ms: 0,
        total_result_bytes: 0,
      };
      byTool.set(event.tool_name, row);
    }

    row.count += 1;
    if (event.is_error) row.error_count += 1;
    if (event.timed_out) row.timeout_count += 1;
    row.total_handler_ms += event.handler_elapsed_ms;
    row.max_handler_ms = Math.max(row.max_handler_ms, event.handler_elapsed_ms);
    row.total_result_bytes += event.result_bytes;
  }

  return [...byTool.values()]
    .map((row) => ({
      ...row,
      avg_handler_ms:
        row.count > 0
          ? Math.round((row.total_handler_ms / row.count) * 1000) / 1000
          : 0,
      avg_result_bytes:
        row.count > 0 ? Math.round(row.total_result_bytes / row.count) : 0,
      total_handler_ms: Math.round(row.total_handler_ms * 1000) / 1000,
    }))
    .sort((a, b) => b.total_handler_ms - a.total_handler_ms);
}

export function snapshotToolTelemetry({
  afterSeq = 0,
  limit = 100,
  toolName = null,
  includeEvents = true,
} = {}) {
  const filtered = state.events.filter(
    (event) =>
      event.seq > afterSeq &&
      (!toolName || event.tool_name === toolName)
  );

  const selected = filtered.slice(-Math.min(500, Math.max(1, limit)));

  return {
    ...getToolTelemetryState(),
    earliest_available_seq: state.events[0]?.seq ?? state.nextSeq,
    latest_available_seq: state.events.at(-1)?.seq ?? null,
    matched_events: filtered.length,
    returned_events: includeEvents ? selected.length : 0,
    summary: summarize(filtered),
    events: includeEvents ? selected : [],
  };
}

export function clearToolTelemetry() {
  const previousBuffered = state.events.length;
  const previousDropped = state.droppedEvents;
  state.events = [];
  state.droppedEvents = 0;

  return {
    cleared: true,
    previous_buffered_events: previousBuffered,
    previous_dropped_events: previousDropped,
    next_seq: state.nextSeq,
    cleared_at: new Date().toISOString(),
  };
}

export function registerToolTelemetryTool(server) {
  server.tool(
    "tool_telemetry",
    "Inspect or clear bounded metadata-only telemetry for LConnect tool handlers. Arguments, command text, file contents, environment values, and result contents are never recorded.",
    {
      action: z.enum(["snapshot", "clear"]).optional(),
      after_seq: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(500).optional(),
      tool_name: z.string().min(1).optional(),
      include_events: z.boolean().optional(),
    },
    async ({
      action = "snapshot",
      after_seq = 0,
      limit = 100,
      tool_name,
      include_events = true,
    }) => {
      const value =
        action === "clear"
          ? clearToolTelemetry()
          : snapshotToolTelemetry({
              afterSeq: after_seq,
              limit,
              toolName: tool_name || null,
              includeEvents: include_events,
            });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(value, null, 2),
          },
        ],
      };
    }
  );
}
