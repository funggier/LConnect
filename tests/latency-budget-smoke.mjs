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
  for (const item of result.content || []) {
    if (item?.type !== "text" || typeof item.text !== "string") continue;
    try {
      const value = JSON.parse(item.text);
      if (value?.latency_budget) return value.latency_budget;
    } catch {}
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
  fs.writeFileSync(statePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

try {
  await server.connect(pair[1]);
  await client.connect(pair[0]);

  const initial = await call("latency_budget_status");
  const initialJson = JSON.parse(textOf(initial));
  if (initialJson.mode !== "observe" || initialJson.round.status !== "not_started") {
    throw new Error("initial OBSERVE/not_started state failed");
  }
  if (
    initialJson.active_budget.failure_ceiling_ms !== null ||
    initialJson.active_budget.average_call_ms !== null ||
    initialJson.active_budget.safe_max_ms !== null ||
    initialJson.latency_budget.failure_ceiling_ms !== null ||
    initialJson.latency_budget.safe_max_ms !== null ||
    initialJson.latency_budget.predicted_next_ms !== null ||
    initialJson.latency_budget.remaining_ms !== null
  ) {
    throw new Error("uncalibrated latency budget null semantics failed");
  }

  const r1 = await call("latency_round_start");
  const r1Json = JSON.parse(textOf(r1));
  if (r1Json.latency_budget.round_id !== 1 || r1Json.latency_budget.current_round_ms !== 0) {
    throw new Error("round 1 did not start at zero");
  }

  const w1 = await call("fixture_work", { delay_ms: 5 });
  const m1 = latencyMeta(w1);
  if (!m1 || m1.round_id !== 1 || m1.calls_this_round !== 1 || m1.current_round_ms <= 0) {
    throw new Error("round 1 call metadata failed");
  }

  await call("fixture_work", { delay_ms: 5 });
  const beforeReset = controller.status().state.round.cumulative_latency_ms;
  if (beforeReset <= 0 || controller.status().state.round.call_count !== 2) {
    throw new Error("round 1 accumulation failed");
  }

  const r2 = await call("latency_round_start");
  const r2Json = JSON.parse(textOf(r2));
  if (
    r2Json.latency_budget.round_id !== 2 ||
    r2Json.latency_budget.calls_this_round !== 0 ||
    r2Json.latency_budget.current_round_ms !== 0
  ) {
    throw new Error("new round carried previous latency");
  }

  await call("fixture_work", { delay_ms: 7 });
  await call("fixture_work", { delay_ms: 7 });
  const failedRound = controller.status().state.round;
  const set1 = controller.setMaxFromCurrentRound("test-confirmed-retry-1");
  const expectedAverage = Math.round((failedRound.cumulative_latency_ms / failedRound.call_count) * 1000) / 1000;
  const expectedSafe = Math.round(Math.max(0, failedRound.cumulative_latency_ms - expectedAverage) * 1000) / 1000;

  if (
    set1.state.active_budget.confirmed_failure_round_id !== failedRound.id ||
    set1.state.active_budget.failure_ceiling_ms !== failedRound.cumulative_latency_ms ||
    set1.state.active_budget.average_call_ms !== expectedAverage ||
    set1.state.active_budget.safe_max_ms !== expectedSafe ||
    set1.state.mode !== "enforce"
  ) {
    throw new Error("SetMax formula/current-round-only behavior failed");
  }

  const executionsBeforeNoRound = executions;
  const noRound = await call("fixture_work", { delay_ms: 1 });
  if (!noRound.isError || !textOf(noRound).includes("ROUND_NOT_STARTED")) {
    throw new Error("ENFORCE did not reject work without a new round");
  }
  if (executions !== executionsBeforeNoRound) {
    throw new Error("ROUND_NOT_STARTED executed handler");
  }

  await call("latency_round_start");
  let seeded = readState();
  seeded.round.cumulative_latency_ms = Math.max(
    0,
    seeded.active_budget.safe_max_ms - seeded.active_budget.average_call_ms + 0.5
  );
  seeded.round.call_count = 1;
  writeState(seeded);

  const executionsBeforeBudgetBlock = executions;
  const blocked = await call("fixture_work", { delay_ms: 1 });
  if (!blocked.isError || !textOf(blocked).includes("LATENCY_BUDGET_EXCEEDED")) {
    throw new Error("predicted over-budget work was not blocked");
  }
  if (executions !== executionsBeforeBudgetBlock) {
    throw new Error("LATENCY_BUDGET_EXCEEDED executed handler");
  }

  await call("latency_round_start");
  const secondSeed = readState();
  secondSeed.round.call_count = 3;
  secondSeed.round.cumulative_latency_ms = 123;
  secondSeed.round.last_call_ms = 41;
  secondSeed.round.max_call_ms = 41;
  secondSeed.round.last_tool = "fixture_work";
  writeState(secondSeed);

  const secondFailed = controller.status().state.round;
  const previousCeiling = set1.state.active_budget.failure_ceiling_ms;
  const set2 = controller.setMaxFromCurrentRound("test-confirmed-retry-2");

  if (
    set2.state.active_budget.confirmed_failure_round_id !== secondFailed.id ||
    set2.state.active_budget.failure_ceiling_ms !== secondFailed.cumulative_latency_ms
  ) {
    throw new Error("second SetMax did not replace from latest round");
  }
  if (secondFailed.id === failedRound.id) {
    throw new Error("second failed round reused old round id");
  }
  if (
    set2.state.active_budget.source !== "test-confirmed-retry-2" ||
    set2.state.generation !== set1.state.generation + 1
  ) {
    throw new Error("second SetMax did not replace active generation");
  }
  if (
    previousCeiling === set2.state.active_budget.failure_ceiling_ms &&
    failedRound.call_count !== secondFailed.call_count
  ) {
    throw new Error("second SetMax appears to retain prior ceiling unexpectedly");
  }

  const reset = controller.resetMax("test-reset");
  if (
    reset.state.mode !== "observe" ||
    reset.state.active_budget.failure_ceiling_ms !== null ||
    reset.state.round.status !== "not_started"
  ) {
    throw new Error("ResetMax failed");
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
  if (externalRound.status !== "active" || externalRound.call_count !== 0) {
    throw new Error("external CMD/CLI state was not reloaded by controller");
  }

  const workAfterExternalReset = await call("fixture_work", { delay_ms: 1 });
  const externalMeta = latencyMeta(workAfterExternalReset);
  if (!externalMeta || externalMeta.round_id !== externalRound.id || !externalMeta.tracked) {
    throw new Error("external reset was not applied without restart");
  }

  for (const [name, action] of [
    ["ResetRound-LConnect.cmd", "reset-round"],
    ["SetMaxLatency-LConnect.cmd", "set-max"],
    ["ResetMaxLatency-LConnect.cmd", "reset-max"],
    ["StatusMaxLatency-LConnect.cmd", "status"],
  ]) {
    const cmdPath = path.join(root, name);
    if (!fs.existsSync(cmdPath)) throw new Error(name + " missing");
    const cmd = fs.readFileSync(cmdPath, "utf8");
    if (!cmd.includes("latency-budget-cli.mjs") || !cmd.includes(action)) {
      throw new Error(name + " does not invoke shared latency CLI action " + action);
    }
  }

  if (!fs.existsSync(historyPath)) {
    throw new Error("audit history file missing");
  }
  const history = fs.readFileSync(historyPath, "utf8");
  if (!history.includes("max_latency_set") || !history.includes("round_started")) {
    throw new Error("audit-only history evidence missing");
  }

  console.log("latency round reset starts at zero: PASS");
  console.log("latency never carries across rounds: PASS");
  console.log("SetMax uses current round only and exact formula: PASS");
  console.log("second SetMax replaces active ceiling: PASS");
  console.log("OBSERVE/ENFORCE transition: PASS");
  console.log("ROUND_NOT_STARTED guard before execution: PASS");
  console.log("LATENCY_BUDGET_EXCEEDED guard before execution: PASS");
  console.log("work-tool latency metadata: PASS");
  console.log("external CMD/CLI state reload without restart: PASS");
  console.log("Reset/Set/Status CMD wrappers use shared CLI: PASS");
  console.log("history audit-only evidence: PASS");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  await pair[0].close().catch(() => {});
  fs.rmSync(sandbox, { recursive: true, force: true });
  delete process.env.LCONNECT_LATENCY_STATE_PATH;
  delete process.env.LCONNECT_LATENCY_HISTORY_PATH;
}
