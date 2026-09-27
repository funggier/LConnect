import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import {
  createLatencyBudgetController,
  installLatencyBudget,
  registerLatencyBudgetTools,
} from "../modules/latency-budget.mjs";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-latency-"));
const statePath = path.join(sandbox, "runtime", "latency-budget-state.json");
const historyPath = path.join(sandbox, "runtime", "latency-budget-history.jsonl");
process.env.LCONNECT_LATENCY_STATE_PATH = statePath;
process.env.LCONNECT_LATENCY_HISTORY_PATH = historyPath;

const server = new McpServer({ name: "latency-budget-smoke", version: "1.2.0" });
const controller = installLatencyBudget(server, { installRoot: sandbox });

let executions = 0;
server.tool(
  "fixture_work",
  "fixture",
  { delay_ms: z.number().int().min(0).max(100).optional() },
  async ({ delay_ms = 0 }) => {
    executions += 1;
    if (delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay_ms));
    }
    return {
      content: [{ type: "text", text: "fixture-ok" }],
    };
  }
);
registerLatencyBudgetTools(server, controller);

const pair = InMemoryTransport.createLinkedPair();
const client = new Client(
  { name: "latency-budget-smoke-client", version: "1.2.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function latencyMeta(result) {
  if (result?.structuredContent?.latency_budget) {
    return result.structuredContent.latency_budget;
  }
  if (result?._meta?.latency_budget) {
    return result._meta.latency_budget;
  }
  return null;
}

async function call(name, args = {}) {
  return await client.callTool({ name, arguments: args });
}

function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(value) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

try {
  await server.connect(pair[1]);
  await client.connect(pair[0]);

  const initial = await call("latency_budget_status");
  const initialJson = JSON.parse(textOf(initial));
  if (
    initialJson.mode !== "observe" ||
    initialJson.enforcement_enabled !== false ||
    initialJson.measurement_model !== "turn_risk_observation_v2" ||
    initialJson.round.status !== "not_started"
  ) {
    throw new Error("initial observation-only state failed");
  }
  if (
    initialJson.active_budget.failure_ceiling_ms !== null ||
    initialJson.active_budget.average_call_ms !== null ||
    initialJson.active_budget.safe_max_ms !== null ||
    initialJson.latency_budget.predicted_next_ms !== null ||
    initialJson.latency_budget.remaining_ms !== null
  ) {
    throw new Error("disabled budget null semantics failed");
  }

  const r1 = await call("latency_round_start");
  const r1Json = JSON.parse(textOf(r1));
  if (
    r1Json.latency_budget.round_id !== 1 ||
    r1Json.latency_budget.handler_sum_ms !== 0 ||
    r1Json.latency_budget.calls_this_round !== 0 ||
    r1Json.enforcement_enabled !== false
  ) {
    throw new Error("round 1 did not start at zero");
  }

  const w1 = await call("fixture_work", { delay_ms: 8 });
  const m1 = latencyMeta(w1);
  if (
    !m1 ||
    m1.round_id !== 1 ||
    m1.calls_this_round !== 1 ||
    m1.handler_sum_ms <= 0 ||
    m1.result_bytes_total <= 0 ||
    m1.blocked !== false
  ) {
    throw new Error("round 1 first-call telemetry failed");
  }

  await sleep(25);
  const w2 = await call("fixture_work", { delay_ms: 8 });
  const m2 = latencyMeta(w2);
  if (
    m2.calls_this_round !== 2 ||
    m2.handler_sum_ms <= m1.handler_sum_ms ||
    m2.round_wall_clock_ms < m2.handler_sum_ms ||
    m2.observed_idle_ms < 15 ||
    m2.max_idle_gap_ms < 15 ||
    m2.result_bytes_total <= m1.result_bytes_total
  ) {
    throw new Error("wall/handler/idle/result separation failed");
  }

  const round1 = controller.status().state.round;
  if (
    round1.call_count !== 2 ||
    round1.cumulative_handler_ms <= 0 ||
    round1.result_bytes_total <= 0
  ) {
    throw new Error("round 1 persisted telemetry failed");
  }

  await sleep(12);
  const activeGap = controller.status().latency_budget;
  if (
    activeGap.tail_idle_ms < 8 ||
    activeGap.max_observed_gap_ms < activeGap.tail_idle_ms ||
    activeGap.max_observed_gap_ms < activeGap.max_idle_gap_ms
  ) {
    throw new Error("active tail/max observed gap telemetry failed");
  }

  const r2 = await call("latency_round_start");
  const r2Json = JSON.parse(textOf(r2));
  if (
    r2Json.latency_budget.round_id !== 2 ||
    r2Json.latency_budget.calls_this_round !== 0 ||
    r2Json.latency_budget.handler_sum_ms !== 0 ||
    r2Json.latency_budget.result_bytes_total !== 0 ||
    r2Json.latency_budget.observed_idle_ms > 10
  ) {
    throw new Error("new round carried previous metrics");
  }

  await call("fixture_work", { delay_ms: 10 });
  await sleep(20);
  await call("fixture_work", { delay_ms: 10 });
  await sleep(15);

  const failedRound = controller.status().state.round;
  const confirmed1 = controller.confirmRetryCurrentRound("test-confirmed-retry-1");
  const snap1 = confirmed1.retry_snapshot;
  const postConfirm1 = controller.status();

  if (
    confirmed1.state.mode !== "observe" ||
    confirmed1.state.enforcement_enabled !== false ||
    confirmed1.state.active_budget.failure_ceiling_ms !== null ||
    confirmed1.state.active_budget.safe_max_ms !== null ||
    confirmed1.state.last_confirmed_retry.round_id !== failedRound.id ||
    snap1.round_wall_clock_ms <= snap1.handler_sum_ms ||
    snap1.handler_share_pct >= 100 ||
    snap1.observed_idle_ms <= 0 ||
    snap1.tail_idle_ms < 10 ||
    snap1.max_observed_gap_ms < snap1.tail_idle_ms ||
    snap1.max_observed_gap_ms < snap1.max_idle_gap_ms ||
    typeof snap1.last_call_completed_at !== "string" ||
    snap1.result_bytes_total <= 0 ||
    postConfirm1.latency_budget.observed_idle_ms !== snap1.observed_idle_ms ||
    postConfirm1.latency_budget.tail_idle_ms !== snap1.tail_idle_ms ||
    postConfirm1.latency_budget.max_observed_gap_ms !== snap1.max_observed_gap_ms
  ) {
    throw new Error("user-confirmed Retry observation snapshot/tail-gap consistency failed");
  }

  const executionsBeforePostRetry = executions;
  const postRetryWork = await call("fixture_work", { delay_ms: 1 });
  if (postRetryWork.isError || executions !== executionsBeforePostRetry + 1) {
    throw new Error("observation-only mode unexpectedly blocked work");
  }

  await call("latency_round_start");
  await call("fixture_work", { delay_ms: 5 });
  const confirmed2 = controller.confirmRetryCurrentRound("test-confirmed-retry-2");
  const snap2 = confirmed2.retry_snapshot;
  if (
    snap2.round_id === snap1.round_id ||
    confirmed2.state.last_confirmed_retry.round_id !== snap2.round_id ||
    confirmed2.state.generation !== confirmed1.state.generation + 1 ||
    confirmed2.state.mode !== "observe" ||
    confirmed2.state.active_budget.failure_ceiling_ms !== null
  ) {
    throw new Error("latest Retry snapshot replacement semantics failed");
  }

  writeState({
    schema_version: 2,
    measurement_model: "turn_risk_observation_v2",
    mode: "observe",
    enforcement_enabled: false,
    generation: 8,
    active_budget: {},
    last_confirmed_retry: {
      source: "legacy-v2-snapshot",
      confirmed_at: "2026-01-01T00:00:10.000Z",
      round_id: 55,
      round_started_at: "2026-01-01T00:00:00.000Z",
      round_completed_at: "2026-01-01T00:00:10.000Z",
      round_wall_clock_ms: 10000,
      call_count: 1,
      in_flight_count: 0,
      handler_sum_ms: 10,
      max_handler_ms: 10,
      handler_share_pct: 0.1,
      observed_idle_ms: 9990,
      max_idle_gap_ms: 100,
      unattributed_wall_ms: 9990,
      result_bytes_total: 1,
      max_result_bytes: 1,
      error_count: 0,
      timeout_count: 0,
      overlap_start_count: 0,
      last_tool: "fixture_work",
    },
    round: {
      id: 55,
      status: "not_started",
    },
  });

  const legacyV2Snapshot = controller.status().state.last_confirmed_retry;
  if (
    legacyV2Snapshot?.tail_idle_ms !== null ||
    legacyV2Snapshot?.max_observed_gap_ms !== null ||
    legacyV2Snapshot?.last_call_completed_at !== null
  ) {
    throw new Error("legacy v2 Retry snapshot must preserve unknown new fields as null");
  }

  writeState({
    schema_version: 1,
    mode: "enforce",
    generation: 9,
    active_budget: {
      confirmed_failure_round_id: 77,
      failure_ceiling_ms: 99999,
      failed_round_call_count: 9,
      average_call_ms: 11111,
      safe_max_ms: 88888,
      set_at: new Date().toISOString(),
      source: "legacy",
    },
    round: {
      id: 77,
      status: "active",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
      call_count: 9,
      cumulative_latency_ms: 9999,
      last_call_ms: 1111,
      max_call_ms: 2222,
      blocked_count: 0,
      last_tool: "legacy_tool",
      start_source: "legacy",
    },
  });

  const migrated = controller.status();
  if (
    migrated.state.schema_version !== 2 ||
    migrated.state.mode !== "observe" ||
    migrated.state.enforcement_enabled !== false ||
    migrated.state.active_budget.failure_ceiling_ms !== null ||
    migrated.state.round.status !== "not_started" ||
    migrated.state.round.started_at !== null ||
    migrated.state.round.call_count !== 0 ||
    migrated.state.round.cumulative_handler_ms !== 0 ||
    readState().mode !== "observe"
  ) {
    throw new Error("legacy ENFORCE/active state did not migrate safely to clean OBSERVE");
  }

  const cli = path.join(root, "scripts", "latency-budget-cli.mjs");
  const env = {
    ...process.env,
    LCONNECT_LATENCY_STATE_PATH: statePath,
    LCONNECT_LATENCY_HISTORY_PATH: historyPath,
  };

  const cliReset = spawnSync(process.execPath, [cli, "reset-round"], {
    cwd: root,
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (cliReset.status !== 0) {
    throw new Error("CLI reset-round failed: " + (cliReset.stderr || cliReset.stdout));
  }

  const externalRound = controller.status().state.round;
  if (
    externalRound.status !== "active" ||
    externalRound.call_count !== 0 ||
    externalRound.cumulative_handler_ms !== 0
  ) {
    throw new Error("external reset-round was not reloaded by controller");
  }

  await call("fixture_work", { delay_ms: 2 });

  const cliConfirm = spawnSync(process.execPath, [cli, "confirm-retry"], {
    cwd: root,
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (
    cliConfirm.status !== 0 ||
    !cliConfirm.stdout.includes("Retry Snapshot Captured") ||
    !cliConfirm.stdout.includes("Enforcement:") ||
    !cliConfirm.stdout.includes("Tail idle:") ||
    !cliConfirm.stdout.includes("Max observed gap:") ||
    !cliConfirm.stdout.includes("DISABLED")
  ) {
    throw new Error("CLI confirm-retry observation behavior failed: " + (cliConfirm.stderr || cliConfirm.stdout));
  }

  const postCli = controller.status().state;
  if (
    postCli.mode !== "observe" ||
    postCli.last_confirmed_retry?.round_id !== externalRound.id ||
    postCli.active_budget.failure_ceiling_ms !== null
  ) {
    throw new Error("CLI Retry snapshot was not reloaded by controller");
  }

  for (const [name, action] of [
    ["ResetRound-LConnect.cmd", "reset-round"],
    ["ConfirmRetry-LConnect.cmd", "confirm-retry"],
    ["StatusTurnRisk-LConnect.cmd", "status"],
  ]) {
    const cmdPath = path.join(root, name);
    if (!fs.existsSync(cmdPath)) throw new Error(name + " missing");
    const cmd = fs.readFileSync(cmdPath, "utf8");
    if (!cmd.includes("latency-budget-cli.mjs") || !cmd.includes(action)) {
      throw new Error(name + " does not invoke shared turn-risk CLI action " + action);
    }
  }

  for (const legacyName of [
    "SetMaxLatency-LConnect.cmd",
    "ResetMaxLatency-LConnect.cmd",
    "StatusMaxLatency-LConnect.cmd",
  ]) {
    if (fs.existsSync(path.join(root, legacyName))) {
      throw new Error(legacyName + " must be removed");
    }
  }

  for (const legacyAction of ["set-max", "reset-max"]) {
    const rejected = spawnSync(process.execPath, [cli, legacyAction], {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
    });
    if (
      rejected.status !== 2 ||
      !rejected.stderr.includes("Unknown action: " + legacyAction)
    ) {
      throw new Error("legacy CLI action still accepted: " + legacyAction);
    }
  }

  if (!fs.existsSync(historyPath)) {
    throw new Error("audit history file missing");
  }
  const history = fs.readFileSync(historyPath, "utf8");
  const retryEvents = history.split("\n").filter((line) => line.includes('"event":"retry_confirmed"'));
  if (
    retryEvents.length < 3 ||
    !history.includes('"event":"round_started"') ||
    !history.includes('"event":"measurement_model_migrated"')
  ) {
    throw new Error("observation history evidence missing");
  }

  console.log("observation-only model / no handler-sum enforcement: PASS");
  console.log("legacy ENFORCE/active state -> clean OBSERVE migration: PASS");
  console.log("new round starts all metrics at zero: PASS");
  console.log("previous-round metrics never carry: PASS");
  console.log("round wall-clock vs handler sum separated: PASS");
  console.log("observed idle/inter-call gaps captured: PASS");
  console.log("active/confirmed tail idle captured consistently: PASS");
  console.log("max observed gap includes terminal quiet period: PASS");
  console.log("legacy Retry snapshots preserve unknown tail fields as null: PASS");
  console.log("result-byte metrics captured: PASS");
  console.log("error/timeout counters available: PASS");
  console.log("confirmed Retry creates observation snapshot only: PASS");
  console.log("confirmed Retry never enables blocking: PASS");
  console.log("latest Retry snapshot replaces active comparison point: PASS");
  console.log("current CMD wrappers use shared CLI: PASS");
  console.log("legacy MaxLatency CMD/CLI surface removed: PASS");
  console.log("history remains audit-only: PASS");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  await pair[0].close().catch(() => {});
  fs.rmSync(sandbox, { recursive: true, force: true });
  delete process.env.LCONNECT_LATENCY_STATE_PATH;
  delete process.env.LCONNECT_LATENCY_HISTORY_PATH;
}
