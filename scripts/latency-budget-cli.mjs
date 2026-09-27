import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLatencyBudgetController } from "../modules/latency-budget.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const installRoot = path.dirname(scriptDir);
const controller = createLatencyBudgetController({ installRoot });

const action = String(process.argv[2] || "status").trim().toLowerCase();

function line(label, value) {
  console.log(label.padEnd(30) + String(value));
}

function ms(value) {
  return value == null ? "none" : String(value) + " ms";
}

function bytes(value) {
  return String(value || 0) + " bytes";
}

function showStatus(title, value) {
  const meta = value.latency_budget;
  console.log(title);
  console.log("");
  line("Measurement model:", meta.measurement_model);
  line("Mode:", value.state.mode.toUpperCase());
  line("Enforcement:", "DISABLED");
  line("Generation:", value.state.generation);
  line("Round ID:", value.state.round.id);
  line("Round status:", value.state.round.status);
  line("Calls this round:", value.state.round.call_count);
  line("In-flight calls:", value.state.round.in_flight_count);
  line("Round wall-clock:", ms(meta.round_wall_clock_ms));
  line("Completed handler sum:", ms(meta.handler_sum_ms));
  line("Handler share:", String(meta.handler_share_pct) + "%");
  line("Observed idle time:", ms(meta.observed_idle_ms));
  line("Max idle gap:", ms(meta.max_idle_gap_ms));
  line("Unattributed wall time:", ms(meta.unattributed_wall_ms));
  line("Result bytes total:", bytes(value.state.round.result_bytes_total));
  line("Max result bytes:", bytes(value.state.round.max_result_bytes));
  line("Errors / local timeouts:", String(value.state.round.error_count) + " / " + String(value.state.round.timeout_count));
  line("Overlap starts:", value.state.round.overlap_start_count);
  line("Last tool:", value.state.round.last_tool || "none");
  console.log("");

  const retry = value.state.last_confirmed_retry;
  if (retry) {
    console.log("Latest user-confirmed Retry snapshot");
    line("Retry round:", retry.round_id);
    line("Confirmed at:", retry.confirmed_at || "unknown");
    line("Round wall-clock:", ms(retry.round_wall_clock_ms));
    line("Completed handler sum:", ms(retry.handler_sum_ms));
    line("Handler share:", String(retry.handler_share_pct) + "%");
    line("Observed idle time:", ms(retry.observed_idle_ms));
    line("Max idle gap:", ms(retry.max_idle_gap_ms));
    line("Unattributed wall time:", ms(retry.unattributed_wall_ms));
    line("Result bytes total:", bytes(retry.result_bytes_total));
    line("Max result bytes:", bytes(retry.max_result_bytes));
    line("Errors / local timeouts:", String(retry.error_count) + " / " + String(retry.timeout_count));
    line("In-flight at confirm:", retry.in_flight_count);
    console.log("");
  } else {
    line("Latest confirmed Retry:", "none");
    console.log("");
  }

  line("Failure ceiling:", "none (disabled)");
  line("Safe max:", "none (disabled)");
  line("Predicted next:", "none (disabled)");
  console.log("");
  line("State file:", controller.statePath);
  line("History file:", controller.historyPath);
}

function captureRetry(source) {
  const value = controller.confirmRetryCurrentRound(source);
  const retry = value.retry_snapshot;

  console.log("LConnect Retry Snapshot Captured");
  console.log("");
  line("Measurement model:", value.latency_budget.measurement_model);
  line("Mode:", "OBSERVE");
  line("Enforcement:", "DISABLED");
  line("Confirmed Retry round:", retry.round_id);
  line("Round wall-clock:", ms(retry.round_wall_clock_ms));
  line("Completed handler sum:", ms(retry.handler_sum_ms));
  line("Handler share:", String(retry.handler_share_pct) + "%");
  line("Observed idle time:", ms(retry.observed_idle_ms));
  line("Max idle gap:", ms(retry.max_idle_gap_ms));
  line("Unattributed wall time:", ms(retry.unattributed_wall_ms));
  line("Calls completed:", retry.call_count);
  line("In-flight at confirm:", retry.in_flight_count);
  line("Result bytes total:", bytes(retry.result_bytes_total));
  line("Max result bytes:", bytes(retry.max_result_bytes));
  line("Errors / local timeouts:", String(retry.error_count) + " / " + String(retry.timeout_count));
  console.log("");
  console.log("No latency ceiling was calculated and no enforcement was enabled.");
  console.log("This snapshot is observation evidence only; history is not combined into an active budget.");
}

try {
  if (action === "reset-round") {
    const value = controller.startRound("ResetRound-LConnect.cmd");
    showStatus("LConnect Turn-Risk Round Reset", {
      ...value,
      latency_budget: controller.status().latency_budget,
    });
  } else if (action === "confirm-retry") {
    captureRetry("ConfirmRetry-LConnect.cmd");
  } else if (action === "set-max") {
    captureRetry("SetMaxLatency-LConnect.cmd (compatibility alias)");
  } else if (action === "reset-max") {
    const value = controller.resetMax("ResetMaxLatency-LConnect.cmd");
    showStatus("LConnect Turn-Risk Observation Reset", value);
    console.log("");
    console.log("Observation state cleared. Enforcement remains disabled.");
  } else if (action === "status") {
    showStatus("LConnect Turn-Risk Telemetry", controller.status());
  } else {
    console.error("Unknown action: " + action);
    console.error("Supported: reset-round | confirm-retry | set-max | reset-max | status");
    process.exitCode = 2;
  }
} catch (error) {
  console.error("ERROR: " + error.message);
  if (error.code) console.error("Code: " + error.code);
  process.exitCode = 2;
}
