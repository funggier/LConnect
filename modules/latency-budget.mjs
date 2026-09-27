import fs from "node:fs";
import path from "node:path";

const CONTROL_TOOLS = new Set([
  "latency_round_start",
  "latency_budget_status",
]);

function nowIso() {
  return new Date().toISOString();
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function defaultState() {
  return {
    schema_version: 1,
    mode: "observe",
    generation: 0,
    active_budget: {
      confirmed_failure_round_id: null,
      failure_ceiling_ms: null,
      failed_round_call_count: null,
      average_call_ms: null,
      safe_max_ms: null,
      set_at: null,
      source: null,
    },
    round: {
      id: 0,
      status: "not_started",
      started_at: null,
      completed_at: null,
      call_count: 0,
      cumulative_latency_ms: 0,
      last_call_ms: null,
      max_call_ms: 0,
      blocked_count: 0,
      last_tool: null,
      start_source: null,
    },
    updated_at: nowIso(),
  };
}

function normalizeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeState(value) {
  const base = defaultState();
  if (!value || typeof value !== "object") return base;

  const mode = value.mode === "enforce" ? "enforce" : "observe";
  const active = value.active_budget && typeof value.active_budget === "object"
    ? value.active_budget
    : {};
  const round = value.round && typeof value.round === "object"
    ? value.round
    : {};

  return {
    schema_version: 1,
    mode,
    generation: Math.max(0, Math.floor(normalizeNumber(value.generation, 0))),
    active_budget: {
      confirmed_failure_round_id:
        active.confirmed_failure_round_id == null
          ? null
          : Math.max(0, Math.floor(normalizeNumber(active.confirmed_failure_round_id, 0))),
      failure_ceiling_ms: normalizeNumber(active.failure_ceiling_ms, null),
      failed_round_call_count:
        active.failed_round_call_count == null
          ? null
          : Math.max(0, Math.floor(normalizeNumber(active.failed_round_call_count, 0))),
      average_call_ms: normalizeNumber(active.average_call_ms, null),
      safe_max_ms: normalizeNumber(active.safe_max_ms, null),
      set_at: typeof active.set_at === "string" ? active.set_at : null,
      source: typeof active.source === "string" ? active.source : null,
    },
    round: {
      id: Math.max(0, Math.floor(normalizeNumber(round.id, 0))),
      status: ["not_started", "active", "confirmed_retry", "closed"].includes(round.status)
        ? round.status
        : "not_started",
      started_at: typeof round.started_at === "string" ? round.started_at : null,
      completed_at: typeof round.completed_at === "string" ? round.completed_at : null,
      call_count: Math.max(0, Math.floor(normalizeNumber(round.call_count, 0))),
      cumulative_latency_ms: Math.max(0, normalizeNumber(round.cumulative_latency_ms, 0)),
      last_call_ms:
        round.last_call_ms == null ? null : Math.max(0, normalizeNumber(round.last_call_ms, 0)),
      max_call_ms: Math.max(0, normalizeNumber(round.max_call_ms, 0)),
      blocked_count: Math.max(0, Math.floor(normalizeNumber(round.blocked_count, 0))),
      last_tool: typeof round.last_tool === "string" ? round.last_tool : null,
      start_source: typeof round.start_source === "string" ? round.start_source : null,
    },
    updated_at: typeof value.updated_at === "string" ? value.updated_at : nowIso(),
  };
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { state: defaultState(), error: null };
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { state: normalizeState(value), error: null };
  } catch (error) {
    return {
      state: defaultState(),
      error: "LATENCY_STATE_READ_FAILED: " + error.message,
    };
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = {
    ...value,
    updated_at: nowIso(),
  };
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
  } catch {
  }
}

function budgetMetadata(state, {
  callMs = null,
  tracked = false,
  blocked = false,
  errorCode = null,
  stateError = null,
} = {}) {
  const failure = state.active_budget.failure_ceiling_ms;
  const safe = state.active_budget.safe_max_ms;
  const predicted = state.active_budget.average_call_ms;
  const current = round3(state.round.cumulative_latency_ms);
  const remaining =
    Number.isFinite(safe) ? round3(Math.max(0, safe - current)) : null;

  return {
    mode: state.mode,
    generation: state.generation,
    round_id: state.round.id,
    round_status: state.round.status,
    calls_this_round: state.round.call_count,
    current_round_ms: current,
    call_ms: callMs == null ? null : round3(callMs),
    failure_ceiling_ms: Number.isFinite(failure) ? round3(failure) : null,
    safe_max_ms: Number.isFinite(safe) ? round3(safe) : null,
    predicted_next_ms: Number.isFinite(predicted) ? round3(predicted) : null,
    remaining_ms: remaining,
    tracked,
    blocked,
    ...(errorCode ? { error_code: errorCode } : {}),
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

function blockedResult(errorCode, message, metadata) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ok: false,
            error_code: errorCode,
            message,
            latency_budget: metadata,
          },
          null,
          2
        ),
      },
    ],
  };
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
    if (!fs.existsSync(statePath) || loaded.error) {
      return {
        state: writeJson(statePath, loaded.state),
        error: loaded.error,
      };
    }
    return loaded;
  }

  function startRound(source = "mcp") {
    const loaded = ensurePersisted();
    const previous = loaded.state;

    if (
      previous.round.status !== "not_started" ||
      previous.round.call_count > 0 ||
      previous.round.blocked_count > 0
    ) {
      appendHistory(historyPath, {
        event: "round_replaced",
        source,
        round: previous.round,
        mode: previous.mode,
        generation: previous.generation,
      });
    }

    const next = {
      ...previous,
      round: {
        id: previous.round.id + 1,
        status: "active",
        started_at: nowIso(),
        completed_at: null,
        call_count: 0,
        cumulative_latency_ms: 0,
        last_call_ms: null,
        max_call_ms: 0,
        blocked_count: 0,
        last_tool: null,
        start_source: source,
      },
    };
    const saved = writeJson(statePath, next);
    appendHistory(historyPath, {
      event: "round_started",
      source,
      round_id: saved.round.id,
      mode: saved.mode,
      generation: saved.generation,
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

  function setMaxFromCurrentRound(source = "user_confirmed_retry") {
    const loaded = ensurePersisted();
    const state = loaded.state;

    if (state.round.status !== "active") {
      const error = new Error(
        "NO_ACTIVE_ROUND: Run ResetRound-LConnect.cmd before calibration, or wait for the AI to start a round."
      );
      error.code = "NO_ACTIVE_ROUND";
      throw error;
    }

    if (state.round.call_count < 1 || state.round.cumulative_latency_ms <= 0) {
      const error = new Error(
        "ROUND_HAS_NO_CALLS: The current round has no measured work-tool latency to calibrate."
      );
      error.code = "ROUND_HAS_NO_CALLS";
      throw error;
    }

    const failureCeiling = round3(state.round.cumulative_latency_ms);
    const averageCall = round3(failureCeiling / state.round.call_count);
    const safeMax = round3(Math.max(0, failureCeiling - averageCall));
    const setAt = nowIso();

    const next = {
      ...state,
      mode: "enforce",
      generation: state.generation + 1,
      active_budget: {
        confirmed_failure_round_id: state.round.id,
        failure_ceiling_ms: failureCeiling,
        failed_round_call_count: state.round.call_count,
        average_call_ms: averageCall,
        safe_max_ms: safeMax,
        set_at: setAt,
        source,
      },
      round: {
        ...state.round,
        status: "confirmed_retry",
        completed_at: setAt,
      },
    };

    const saved = writeJson(statePath, next);
    appendHistory(historyPath, {
      event: "max_latency_set",
      source,
      generation: saved.generation,
      confirmed_failure_round_id: saved.round.id,
      failure_ceiling_ms: failureCeiling,
      failed_round_call_count: saved.round.call_count,
      average_call_ms: averageCall,
      safe_max_ms: safeMax,
      round: saved.round,
    });

    return {
      state: saved,
      state_error: loaded.error,
      latency_budget: budgetMetadata(saved, {
        tracked: false,
        stateError: loaded.error,
      }),
    };
  }

  function resetMax(source = "manual_reset") {
    const loaded = ensurePersisted();
    const state = loaded.state;
    const next = defaultState();

    next.generation = state.generation + 1;
    next.round.id = state.round.id;
    next.updated_at = nowIso();

    const saved = writeJson(statePath, next);
    appendHistory(historyPath, {
      event: "max_latency_reset",
      source,
      previous_generation: state.generation,
      generation: saved.generation,
      previous_active_budget: state.active_budget,
      previous_round: state.round,
    });

    return {
      state: saved,
      state_error: loaded.error,
      latency_budget: budgetMetadata(saved, {
        tracked: false,
        stateError: loaded.error,
      }),
    };
  }

  function beforeTool(toolName) {
    const loaded = ensurePersisted();
    const state = loaded.state;

    if (state.mode === "enforce" && state.round.status !== "active") {
      const metadata = budgetMetadata(state, {
        blocked: true,
        errorCode: "ROUND_NOT_STARTED",
        stateError: loaded.error,
      });
      return {
        allowed: false,
        error_code: "ROUND_NOT_STARTED",
        message:
          "Latency budget is ENFORCE but no active round exists. Call latency_round_start before the first LConnect work tool of this user turn.",
        metadata,
      };
    }

    const track = state.round.status === "active";

    if (state.mode === "enforce" && track) {
      const predicted = state.active_budget.average_call_ms;
      const safe = state.active_budget.safe_max_ms;
      const current = state.round.cumulative_latency_ms;

      if (
        Number.isFinite(predicted) &&
        Number.isFinite(safe) &&
        current + predicted > safe
      ) {
        state.round.blocked_count += 1;
        state.round.last_tool = toolName;
        const saved = writeJson(statePath, state);
        const metadata = budgetMetadata(saved, {
          blocked: true,
          errorCode: "LATENCY_BUDGET_EXCEEDED",
          stateError: loaded.error,
        });
        appendHistory(historyPath, {
          event: "tool_blocked",
          tool_name: toolName,
          round_id: saved.round.id,
          current_round_ms: round3(saved.round.cumulative_latency_ms),
          predicted_next_ms: round3(predicted),
          safe_max_ms: round3(safe),
        });
        return {
          allowed: false,
          error_code: "LATENCY_BUDGET_EXCEEDED",
          message:
            "Tool was not executed because the predicted next-call latency would exceed the active safe round budget. Continue in a new user turn/round.",
          metadata,
        };
      }
    }

    return {
      allowed: true,
      track,
      round_id: state.round.id,
      state_error: loaded.error,
      started_at_ms: performance.now(),
    };
  }

  function afterTool(decision, toolName) {
    const callMs = performance.now() - decision.started_at_ms;
    const loaded = ensurePersisted();
    let state = loaded.state;
    let tracked = false;

    if (
      decision.track &&
      state.round.status === "active" &&
      state.round.id === decision.round_id
    ) {
      state.round.call_count += 1;
      state.round.cumulative_latency_ms =
        round3(state.round.cumulative_latency_ms + callMs);
      state.round.last_call_ms = round3(callMs);
      state.round.max_call_ms = round3(Math.max(state.round.max_call_ms, callMs));
      state.round.last_tool = toolName;
      state = writeJson(statePath, state);
      tracked = true;
    }

    return budgetMetadata(state, {
      callMs,
      tracked,
      stateError: loaded.error || decision.state_error,
    });
  }

  return {
    statePath,
    historyPath,
    startRound,
    status,
    setMaxFromCurrentRound,
    resetMax,
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

    if (
      CONTROL_TOOLS.has(name) ||
      typeof callback !== "function"
    ) {
      return originalTool(name, ...rest);
    }

    rest[callbackIndex] = async (...handlerArgs) => {
      const decision = controller.beforeTool(name);

      if (!decision.allowed) {
        return blockedResult(
          decision.error_code,
          decision.message,
          decision.metadata
        );
      }

      try {
        const result = await callback(...handlerArgs);
        const metadata = controller.afterTool(decision, name);
        return appendMetadata(result, metadata);
      } catch (error) {
        controller.afterTool(decision, name);
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
    "Start a fresh LConnect latency round at zero. When an active max is configured, call this before the first LConnect work tool in each new user turn. Previous-round latency is never carried into the new round.",
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
    "Read the current user-confirmed adaptive latency-budget state, active round counters, safe max, and remaining budget. Read-only; historical rounds never affect active calculations.",
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
                mode: value.state.mode,
                generation: value.state.generation,
                active_budget: value.state.active_budget,
                round: value.state.round,
                latency_budget: value.latency_budget,
                state_path: value.state_path,
                history_path: value.history_path,
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
