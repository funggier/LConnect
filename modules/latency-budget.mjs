import fs from "node:fs";
import path from "node:path";

const CONTROL_TOOLS = new Set([
  "latency_round_start",
  "latency_budget_status",
]);

const MEASUREMENT_MODEL = "turn_risk_observation_v2";

function nowIso() {
  return new Date().toISOString();
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clampNonNegative(value) {
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

function normalizeNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function emptyActiveBudget() {
  return {
    confirmed_failure_round_id: null,
    failure_ceiling_ms: null,
    failed_round_call_count: null,
    average_call_ms: null,
    safe_max_ms: null,
    set_at: null,
    source: null,
  };
}

function emptyRound(id = 0) {
  return {
    id,
    status: "not_started",
    started_at: null,
    completed_at: null,
    call_count: 0,
    cumulative_handler_ms: 0,
    last_handler_ms: null,
    max_handler_ms: 0,
    result_bytes_total: 0,
    max_result_bytes: 0,
    error_count: 0,
    timeout_count: 0,
    in_flight_count: 0,
    overlap_start_count: 0,
    first_call_started_at: null,
    last_call_started_at: null,
    last_call_completed_at: null,
    idle_gap_total_ms: 0,
    max_idle_gap_ms: 0,
    last_tool: null,
    start_source: null,
  };
}

function defaultState() {
  return {
    schema_version: 2,
    measurement_model: MEASUREMENT_MODEL,
    mode: "observe",
    enforcement_enabled: false,
    generation: 0,
    active_budget: emptyActiveBudget(),
    last_confirmed_retry: null,
    round: emptyRound(0),
    updated_at: nowIso(),
  };
}

function normalizeRetrySnapshot(value) {
  if (!value || typeof value !== "object") return null;
  return {
    source: typeof value.source === "string" ? value.source : null,
    confirmed_at: typeof value.confirmed_at === "string" ? value.confirmed_at : null,
    round_id: Math.max(0, Math.floor(normalizeNumber(value.round_id, 0))),
    round_started_at: typeof value.round_started_at === "string" ? value.round_started_at : null,
    round_completed_at: typeof value.round_completed_at === "string" ? value.round_completed_at : null,
    round_wall_clock_ms: clampNonNegative(normalizeNumber(value.round_wall_clock_ms, 0)),
    call_count: Math.max(0, Math.floor(normalizeNumber(value.call_count, 0))),
    in_flight_count: Math.max(0, Math.floor(normalizeNumber(value.in_flight_count, 0))),
    handler_sum_ms: clampNonNegative(normalizeNumber(value.handler_sum_ms, 0)),
    max_handler_ms: clampNonNegative(normalizeNumber(value.max_handler_ms, 0)),
    handler_share_pct: clampNonNegative(normalizeNumber(value.handler_share_pct, 0)),
    observed_idle_ms: clampNonNegative(normalizeNumber(value.observed_idle_ms, 0)),
    tail_idle_ms:
      value.tail_idle_ms == null
        ? null
        : clampNonNegative(normalizeNumber(value.tail_idle_ms, 0)),
    max_idle_gap_ms: clampNonNegative(normalizeNumber(value.max_idle_gap_ms, 0)),
    max_observed_gap_ms:
      value.max_observed_gap_ms == null
        ? null
        : clampNonNegative(normalizeNumber(value.max_observed_gap_ms, 0)),
    unattributed_wall_ms: clampNonNegative(normalizeNumber(value.unattributed_wall_ms, 0)),
    result_bytes_total: Math.max(0, Math.floor(normalizeNumber(value.result_bytes_total, 0))),
    max_result_bytes: Math.max(0, Math.floor(normalizeNumber(value.max_result_bytes, 0))),
    error_count: Math.max(0, Math.floor(normalizeNumber(value.error_count, 0))),
    timeout_count: Math.max(0, Math.floor(normalizeNumber(value.timeout_count, 0))),
    overlap_start_count: Math.max(0, Math.floor(normalizeNumber(value.overlap_start_count, 0))),
    last_call_completed_at:
      typeof value.last_call_completed_at === "string" ? value.last_call_completed_at : null,
    last_tool: typeof value.last_tool === "string" ? value.last_tool : null,
  };
}

function normalizeRound(round = {}) {
  const legacyHandlerSum =
    round.cumulative_handler_ms ??
    round.cumulative_latency_ms ??
    0;
  const status = ["not_started", "active", "confirmed_retry", "closed"].includes(round.status)
    ? round.status
    : "not_started";

  return {
    id: Math.max(0, Math.floor(normalizeNumber(round.id, 0))),
    status,
    started_at: typeof round.started_at === "string" ? round.started_at : null,
    completed_at: typeof round.completed_at === "string" ? round.completed_at : null,
    call_count: Math.max(0, Math.floor(normalizeNumber(round.call_count, 0))),
    cumulative_handler_ms: clampNonNegative(normalizeNumber(legacyHandlerSum, 0)),
    last_handler_ms:
      round.last_handler_ms != null
        ? clampNonNegative(normalizeNumber(round.last_handler_ms, 0))
        : round.last_call_ms != null
          ? clampNonNegative(normalizeNumber(round.last_call_ms, 0))
          : null,
    max_handler_ms: clampNonNegative(
      normalizeNumber(round.max_handler_ms ?? round.max_call_ms, 0)
    ),
    result_bytes_total: Math.max(0, Math.floor(normalizeNumber(round.result_bytes_total, 0))),
    max_result_bytes: Math.max(0, Math.floor(normalizeNumber(round.max_result_bytes, 0))),
    error_count: Math.max(0, Math.floor(normalizeNumber(round.error_count, 0))),
    timeout_count: Math.max(0, Math.floor(normalizeNumber(round.timeout_count, 0))),
    in_flight_count: Math.max(0, Math.floor(normalizeNumber(round.in_flight_count, 0))),
    overlap_start_count: Math.max(0, Math.floor(normalizeNumber(round.overlap_start_count, 0))),
    first_call_started_at:
      typeof round.first_call_started_at === "string" ? round.first_call_started_at : null,
    last_call_started_at:
      typeof round.last_call_started_at === "string" ? round.last_call_started_at : null,
    last_call_completed_at:
      typeof round.last_call_completed_at === "string" ? round.last_call_completed_at : null,
    idle_gap_total_ms: clampNonNegative(normalizeNumber(round.idle_gap_total_ms, 0)),
    max_idle_gap_ms: clampNonNegative(normalizeNumber(round.max_idle_gap_ms, 0)),
    last_tool: typeof round.last_tool === "string" ? round.last_tool : null,
    start_source: typeof round.start_source === "string" ? round.start_source : null,
  };
}

function normalizeState(value) {
  const base = defaultState();
  if (!value || typeof value !== "object") return base;

  const incomingSchemaVersion = Math.max(
    1,
    Math.floor(normalizeNumber(value.schema_version, 1))
  );
  const normalizedRound = normalizeRound(value.round || {});
  const round =
    incomingSchemaVersion === 2
      ? normalizedRound
      : emptyRound(normalizedRound.id);

  return {
    schema_version: 2,
    measurement_model: MEASUREMENT_MODEL,
    mode: "observe",
    enforcement_enabled: false,
    generation: Math.max(0, Math.floor(normalizeNumber(value.generation, 0))),
    active_budget: emptyActiveBudget(),
    last_confirmed_retry:
      incomingSchemaVersion === 2
        ? normalizeRetrySnapshot(value.last_confirmed_retry)
        : null,
    round,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : nowIso(),
  };
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { state: defaultState(), error: null };
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const migratedFromSchema = Number(raw?.schema_version || 1);
    return {
      state: normalizeState(raw),
      error: null,
      migrated_from_schema: migratedFromSchema,
      migrated_from_mode: raw?.mode || null,
      legacy_round:
        migratedFromSchema === 2 ? null : normalizeRound(raw?.round || {}),
    };
  } catch (error) {
    return {
      state: defaultState(),
      error: "LATENCY_STATE_READ_FAILED: " + error.message,
      migrated_from_schema: null,
      migrated_from_mode: null,
    };
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = normalizeState({
    ...value,
    updated_at: nowIso(),
  });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  return normalized;
}

function appendHistory(historyPath, event) {
  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.appendFileSync(
      historyPath,
      JSON.stringify({
        at: nowIso(),
        ...event,
      }) + "\n",
      "utf8"
    );
  } catch {}
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

function timeoutLike(result, error) {
  if (error) {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || "").toLowerCase();
    return code === "ETIMEDOUT" || message.includes("timed out") || message.includes("timeout");
  }

  if (!result?.isError || !Array.isArray(result.content)) return false;
  for (const item of result.content) {
    if (item?.type !== "text" || typeof item.text !== "string") continue;
    const text = item.text.toLowerCase();
    if (text.includes("timed out") || text.includes("timeout") || text.includes("etimedout")) {
      return true;
    }
  }
  return false;
}

function isoDiffMs(later, earlier) {
  if (!later || !earlier) return 0;
  const a = Date.parse(later);
  const b = Date.parse(earlier);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, a - b);
}

function currentRoundView(round, at = nowIso()) {
  const endpoint = round.completed_at || at;
  const wall =
    round.status === "not_started" || !round.started_at
      ? 0
      : isoDiffMs(endpoint, round.started_at);

  let tailIdle = 0;
  if (
    round.status !== "not_started" &&
    round.started_at &&
    round.in_flight_count === 0
  ) {
    const anchor = round.last_call_completed_at || round.started_at;
    tailIdle = isoDiffMs(endpoint, anchor);
  }

  const observedIdle = round3(round.idle_gap_total_ms + tailIdle);
  const handlerSum = round3(round.cumulative_handler_ms);
  const unattributed = round3(Math.max(0, wall - handlerSum));
  const handlerShare =
    wall > 0 ? round3(Math.min(100, (handlerSum / wall) * 100)) : 0;
  const maxIdleGap = round3(round.max_idle_gap_ms);
  const tailIdleRounded = round3(tailIdle);

  return {
    round_wall_clock_ms: round3(wall),
    handler_sum_ms: handlerSum,
    handler_share_pct: handlerShare,
    observed_idle_ms: observedIdle,
    tail_idle_ms: tailIdleRounded,
    max_idle_gap_ms: maxIdleGap,
    max_observed_gap_ms: round3(Math.max(maxIdleGap, tailIdleRounded)),
    unattributed_wall_ms: unattributed,
  };
}

function retrySnapshot(round, source, confirmedAt) {
  const view = currentRoundView(
    {
      ...round,
      completed_at: confirmedAt,
    },
    confirmedAt
  );

  return {
    source,
    confirmed_at: confirmedAt,
    round_id: round.id,
    round_started_at: round.started_at,
    round_completed_at: confirmedAt,
    round_wall_clock_ms: view.round_wall_clock_ms,
    call_count: round.call_count,
    in_flight_count: round.in_flight_count,
    handler_sum_ms: view.handler_sum_ms,
    max_handler_ms: round3(round.max_handler_ms),
    handler_share_pct: view.handler_share_pct,
    observed_idle_ms: view.observed_idle_ms,
    tail_idle_ms: view.tail_idle_ms,
    max_idle_gap_ms: view.max_idle_gap_ms,
    max_observed_gap_ms: view.max_observed_gap_ms,
    unattributed_wall_ms: view.unattributed_wall_ms,
    result_bytes_total: round.result_bytes_total,
    max_result_bytes: round.max_result_bytes,
    error_count: round.error_count,
    timeout_count: round.timeout_count,
    overlap_start_count: round.overlap_start_count,
    last_call_completed_at: round.last_call_completed_at,
    last_tool: round.last_tool,
  };
}

function budgetMetadata(state, {
  callMs = null,
  callResultBytes = null,
  tracked = false,
  stateError = null,
} = {}) {
  const view = currentRoundView(state.round);
  return {
    measurement_model: MEASUREMENT_MODEL,
    mode: "observe",
    enforcement_enabled: false,
    generation: state.generation,
    round_id: state.round.id,
    round_status: state.round.status,
    calls_this_round: state.round.call_count,
    round_wall_clock_ms: view.round_wall_clock_ms,
    handler_sum_ms: view.handler_sum_ms,
    current_round_ms: view.handler_sum_ms,
    handler_share_pct: view.handler_share_pct,
    observed_idle_ms: view.observed_idle_ms,
    tail_idle_ms: view.tail_idle_ms,
    max_idle_gap_ms: view.max_idle_gap_ms,
    max_observed_gap_ms: view.max_observed_gap_ms,
    unattributed_wall_ms: view.unattributed_wall_ms,
    result_bytes_total: state.round.result_bytes_total,
    max_result_bytes: state.round.max_result_bytes,
    error_count: state.round.error_count,
    timeout_count: state.round.timeout_count,
    in_flight_count: state.round.in_flight_count,
    overlap_start_count: state.round.overlap_start_count,
    call_ms: callMs == null ? null : round3(callMs),
    call_result_bytes:
      callResultBytes == null ? null : Math.max(0, Math.floor(callResultBytes)),
    failure_ceiling_ms: null,
    safe_max_ms: null,
    predicted_next_ms: null,
    remaining_ms: null,
    last_confirmed_retry_round_id: state.last_confirmed_retry?.round_id ?? null,
    tracked,
    blocked: false,
    ...(stateError ? { state_warning: stateError } : {}),
  };
}

function appendMetadata(result, metadata) {
  const base =
    result && typeof result === "object"
      ? { ...result }
      : { content: [{ type: "text", text: String(result ?? "") }] };

  const existingStructured = base.structuredContent;
  if (
    existingStructured &&
    typeof existingStructured === "object" &&
    !Array.isArray(existingStructured)
  ) {
    base.structuredContent = {
      ...existingStructured,
      latency_budget: metadata,
    };
  } else if (existingStructured === undefined) {
    base.structuredContent = {
      latency_budget: metadata,
    };
  } else {
    base.structuredContent = {
      value: existingStructured,
      latency_budget: metadata,
    };
  }

  base._meta = {
    ...(base._meta && typeof base._meta === "object" ? base._meta : {}),
    latency_budget: metadata,
  };

  return base;
}

export function createLatencyBudgetController(config = {}) {
  const installRoot = config.installRoot || process.cwd();
  const statePath =
    process.env.LCONNECT_LATENCY_STATE_PATH ||
    path.join(installRoot, "runtime", "latency-budget-state.json");
  const historyPath =
    process.env.LCONNECT_LATENCY_HISTORY_PATH ||
    path.join(installRoot, "runtime", "latency-budget-history.jsonl");

  function read() {
    return safeReadJson(statePath);
  }

  function ensurePersisted() {
    const loaded = read();
    const mustRewrite =
      !fs.existsSync(statePath) ||
      loaded.error ||
      loaded.migrated_from_schema !== 2 ||
      loaded.migrated_from_mode === "enforce";

    if (mustRewrite) {
      const saved = writeJson(statePath, loaded.state);
      if (loaded.migrated_from_schema !== null && loaded.migrated_from_schema !== 2) {
        appendHistory(historyPath, {
          event: "measurement_model_migrated",
          from_schema_version: loaded.migrated_from_schema,
          from_mode: loaded.migrated_from_mode,
          to_schema_version: 2,
          to_mode: "observe",
          measurement_model: MEASUREMENT_MODEL,
          enforcement_enabled: false,
          legacy_round: loaded.legacy_round,
          migration_rule:
            "Legacy round telemetry is audit-only and is not carried into schema v2 because v1 lacks the timestamps/result counters required by the v2 measurement model.",
        });
      }
      return {
        state: saved,
        error: loaded.error,
      };
    }

    return {
      state: loaded.state,
      error: loaded.error,
    };
  }

  function startRound(source = "mcp") {
    const loaded = ensurePersisted();
    const previous = loaded.state;

    if (
      previous.round.status !== "not_started" ||
      previous.round.call_count > 0 ||
      previous.round.in_flight_count > 0
    ) {
      appendHistory(historyPath, {
        event: "round_replaced",
        source,
        round: previous.round,
        round_view: currentRoundView(previous.round),
        mode: "observe",
        generation: previous.generation,
      });
    }

    const next = {
      ...previous,
      mode: "observe",
      enforcement_enabled: false,
      active_budget: emptyActiveBudget(),
      round: {
        ...emptyRound(previous.round.id + 1),
        status: "active",
        started_at: nowIso(),
        start_source: source,
      },
    };

    const saved = writeJson(statePath, next);
    appendHistory(historyPath, {
      event: "round_started",
      source,
      round_id: saved.round.id,
      mode: "observe",
      generation: saved.generation,
      measurement_model: MEASUREMENT_MODEL,
    });

    return {
      state: saved,
      state_error: loaded.error,
      state_path: statePath,
      history_path: historyPath,
    };
  }

  function status() {
    const loaded = ensurePersisted();
    return {
      state: loaded.state,
      state_error: loaded.error,
      state_path: statePath,
      history_path: historyPath,
      latency_budget: budgetMetadata(loaded.state, {
        tracked: loaded.state.round.status === "active",
        stateError: loaded.error,
      }),
    };
  }

  function confirmRetryCurrentRound(source = "user_confirmed_retry") {
    const loaded = ensurePersisted();
    const state = loaded.state;

    if (state.round.status !== "active") {
      const error = new Error(
        "NO_ACTIVE_ROUND: Run ResetRound-LConnect.cmd before a deliberate observation round, or let the AI call latency_round_start."
      );
      error.code = "NO_ACTIVE_ROUND";
      throw error;
    }

    if (state.round.call_count + state.round.in_flight_count < 1) {
      const error = new Error(
        "ROUND_HAS_NO_CALLS: The current round has no observed LConnect work to associate with this Retry."
      );
      error.code = "ROUND_HAS_NO_CALLS";
      throw error;
    }

    const confirmedAt = nowIso();
    const snapshot = retrySnapshot(state.round, source, confirmedAt);
    const next = {
      ...state,
      mode: "observe",
      enforcement_enabled: false,
      generation: state.generation + 1,
      active_budget: emptyActiveBudget(),
      last_confirmed_retry: snapshot,
      round: {
        ...state.round,
        status: "confirmed_retry",
        completed_at: confirmedAt,
      },
    };

    const saved = writeJson(statePath, next);
    appendHistory(historyPath, {
      event: "retry_confirmed",
      source,
      generation: saved.generation,
      measurement_model: MEASUREMENT_MODEL,
      enforcement_enabled: false,
      snapshot,
    });

    return {
      state: saved,
      state_error: loaded.error,
      retry_snapshot: snapshot,
      latency_budget: budgetMetadata(saved, {
        tracked: false,
        stateError: loaded.error,
      }),
    };
  }

  function beforeTool(toolName) {
    const loaded = ensurePersisted();
    let state = loaded.state;
    const startedAt = nowIso();
    let autoStartedAfterRetry = false;

    if (state.round.status === "confirmed_retry") {
      const previousRetryRoundId = state.round.id;
      state = {
        ...state,
        mode: "observe",
        enforcement_enabled: false,
        active_budget: emptyActiveBudget(),
        round: {
          ...emptyRound(previousRetryRoundId + 1),
          status: "active",
          started_at: startedAt,
          start_source: "post_retry_first_work_tool",
        },
      };
      state = writeJson(statePath, state);
      appendHistory(historyPath, {
        event: "round_started",
        source: "post_retry_first_work_tool",
        round_id: state.round.id,
        previous_retry_round_id: previousRetryRoundId,
        auto_started_after_retry: true,
        mode: "observe",
        generation: state.generation,
        measurement_model: MEASUREMENT_MODEL,
      });
      autoStartedAfterRetry = true;
    }

    const track = state.round.status === "active";
    let idleGapMs = 0;

    if (track) {
      if (state.round.in_flight_count === 0) {
        const anchor = state.round.last_call_completed_at || state.round.started_at;
        idleGapMs = isoDiffMs(startedAt, anchor);
        state.round.idle_gap_total_ms =
          round3(state.round.idle_gap_total_ms + idleGapMs);
        state.round.max_idle_gap_ms =
          round3(Math.max(state.round.max_idle_gap_ms, idleGapMs));
      } else {
        state.round.overlap_start_count += 1;
      }

      state.round.in_flight_count += 1;
      if (!state.round.first_call_started_at) {
        state.round.first_call_started_at = startedAt;
      }
      state.round.last_call_started_at = startedAt;
      state.round.last_tool = toolName;
      state = writeJson(statePath, state);
    }

    return {
      allowed: true,
      track,
      round_id: state.round.id,
      state_error: loaded.error,
      started_at_ms: performance.now(),
      started_at: startedAt,
      idle_gap_ms: idleGapMs,
      auto_started_after_retry: autoStartedAfterRetry,
    };
  }

  function afterTool(decision, toolName, { result = null, error = null } = {}) {
    const callMs = performance.now() - decision.started_at_ms;
    const completedAt = nowIso();
    const resultBytes = result ? estimateResultBytes(result) : 0;
    const isError = Boolean(error || result?.isError);
    const timedOut = timeoutLike(result, error);

    const loaded = ensurePersisted();
    let state = loaded.state;
    let tracked = false;

    if (
      decision.track &&
      state.round.status === "active" &&
      state.round.id === decision.round_id
    ) {
      state.round.in_flight_count = Math.max(0, state.round.in_flight_count - 1);
      state.round.call_count += 1;
      state.round.cumulative_handler_ms =
        round3(state.round.cumulative_handler_ms + callMs);
      state.round.last_handler_ms = round3(callMs);
      state.round.max_handler_ms =
        round3(Math.max(state.round.max_handler_ms, callMs));
      state.round.result_bytes_total += resultBytes;
      state.round.max_result_bytes =
        Math.max(state.round.max_result_bytes, resultBytes);
      if (isError) state.round.error_count += 1;
      if (timedOut) state.round.timeout_count += 1;
      state.round.last_call_completed_at = completedAt;
      state.round.last_tool = toolName;
      state = writeJson(statePath, state);
      tracked = true;
    }

    return budgetMetadata(state, {
      callMs,
      callResultBytes: resultBytes,
      tracked,
      stateError: loaded.error || decision.state_error,
    });
  }

  return {
    statePath,
    historyPath,
    startRound,
    status,
    confirmRetryCurrentRound,
    beforeTool,
    afterTool,
  };
}

export function installLatencyBudget(server, config = {}) {
  const controller = createLatencyBudgetController(config);
  controller.status();

  const originalTool = server.tool.bind(server);

  server.tool = (name, ...rest) => {
    const callbackIndex = rest.length - 1;
    const callback = rest[callbackIndex];

    if (CONTROL_TOOLS.has(name) || typeof callback !== "function") {
      return originalTool(name, ...rest);
    }

    rest[callbackIndex] = async (...handlerArgs) => {
      const decision = controller.beforeTool(name);

      try {
        const result = await callback(...handlerArgs);
        const metadata = controller.afterTool(decision, name, { result });
        return appendMetadata(result, metadata);
      } catch (error) {
        controller.afterTool(decision, name, { error });
        throw error;
      }
    };

    return originalTool(name, ...rest);
  };

  return controller;
}

export function registerLatencyBudgetTools(server, controller) {
  server.tool(
    "latency_round_start",
    "Start a fresh observation-only LConnect turn-risk round at zero. Previous-round measurements never carry into the new round.",
    {},
    async () => {
      const started = controller.startRound("mcp_latency_round_start");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                action: "round_started",
                measurement_model: MEASUREMENT_MODEL,
                enforcement_enabled: false,
                latency_budget: budgetMetadata(started.state, {
                  tracked: true,
                  stateError: started.state_error,
                }),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "latency_budget_status",
    "Read observation-only LConnect turn-risk telemetry. Compatibility name retained; no handler-sum-derived ceiling or blocking policy is enforced.",
    {},
    async () => {
      const value = controller.status();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                measurement_model: MEASUREMENT_MODEL,
                mode: value.state.mode,
                enforcement_enabled: false,
                generation: value.state.generation,
                active_budget: value.state.active_budget,
                last_confirmed_retry: value.state.last_confirmed_retry,
                round: value.state.round,
                round_view: currentRoundView(value.state.round),
                latency_budget: value.latency_budget,
                state_path: value.state_path,
                history_path: value.history_path,
                next_work_tool_auto_starts_round:
                  value.state.round.status === "confirmed_retry",
                ...(value.state_error
                  ? { state_warning: value.state_error }
                  : {}),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
