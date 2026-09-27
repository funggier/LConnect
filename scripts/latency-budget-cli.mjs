import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLatencyBudgetController } from "../modules/latency-budget.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const installRoot = path.dirname(scriptDir);
const controller = createLatencyBudgetController({ installRoot });

const action = String(process.argv[2] || "status").trim().toLowerCase();

function line(label, value) {
  console.log(label.padEnd(28) + String(value));
}

function showStatus(title, value) {
  console.log(title);
  console.log("");
  line("Mode:", value.state.mode.toUpperCase());
  line("Generation:", value.state.generation);
  line("Round ID:", value.state.round.id);
  line("Round status:", value.state.round.status);
  line("Calls this round:", value.state.round.call_count);
  line("Current round latency:", String(value.state.round.cumulative_latency_ms) + " ms");
  line("Last call:", value.state.round.last_call_ms == null ? "none" : String(value.state.round.last_call_ms) + " ms");
  line("Blocked calls:", value.state.round.blocked_count);
  line(
    "Failure ceiling:",
    value.state.active_budget.failure_ceiling_ms == null
      ? "none"
      : String(value.state.active_budget.failure_ceiling_ms) + " ms"
  );
  line(
    "Failed-round average:",
    value.state.active_budget.average_call_ms == null
      ? "none"
      : String(value.state.active_budget.average_call_ms) + " ms"
  );
  line(
    "Safe max:",
    value.state.active_budget.safe_max_ms == null
      ? "none"
      : String(value.state.active_budget.safe_max_ms) + " ms"
  );
  line(
    "Remaining:",
    value.latency_budget.remaining_ms == null
      ? "unbounded"
      : String(value.latency_budget.remaining_ms) + " ms"
  );
  console.log("");
  line("State file:", controller.statePath);
  line("History file:", controller.historyPath);
}

try {
  if (action === "reset-round") {
    const value = controller.startRound("ResetRound-LConnect.cmd");
    showStatus("LConnect Latency Round Reset", {
      ...value,
      latency_budget: controller.status().latency_budget,
    });
  } else if (action === "set-max") {
    const value = controller.setMaxFromCurrentRound("SetMaxLatency-LConnect.cmd");
    console.log("LConnect Max Latency Set");
    console.log("");
    line("Confirmed failed round:", value.state.round.id);
    line("Calls in failed round:", value.state.active_budget.failed_round_call_count);
    line("Failure ceiling:", String(value.state.active_budget.failure_ceiling_ms) + " ms");
    line("Failed-round average:", String(value.state.active_budget.average_call_ms) + " ms");
    line("Safe max:", String(value.state.active_budget.safe_max_ms) + " ms");
    line("Generation:", value.state.generation);
    line("Mode:", value.state.mode.toUpperCase());
    console.log("");
    console.log("Only this confirmed round was used. Historical rounds were not included.");
  } else if (action === "reset-max") {
    const value = controller.resetMax("ResetMaxLatency-LConnect.cmd");
    showStatus("LConnect Max Latency Reset", value);
    console.log("");
    console.log("Mode returned to OBSERVE. Run ResetRound-LConnect.cmd before a new calibration round.");
  } else if (action === "status") {
    showStatus("LConnect Adaptive Latency Budget", controller.status());
  } else {
    console.error("Unknown action: " + action);
    console.error("Supported: reset-round | set-max | reset-max | status");
    process.exitCode = 2;
  }
} catch (error) {
  console.error("ERROR: " + error.message);
  if (error.code) console.error("Code: " + error.code);
  process.exitCode = 2;
}
