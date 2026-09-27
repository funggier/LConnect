# LCN-046 Full Session Handoff — User-Confirmed Adaptive Turn Latency Budget

Date: 2026-09-27
Status: **LIVE GREEN — NEW-SESSION CONNECTOR/DIRECT-TOOL VALIDATION PENDING**

## Session transition instruction

The user will open a new ChatGPT session and reconnect LConnect before continuing.

**Do not resume from the earlier df66e72 implementation checkpoint.** The authoritative live state has advanced beyond that point.

At the start of the new session:

1. Reconnect LConnect.
2. Read this handoff first.
3. Verify GitHub/runtime live state before changing anything.
4. Count ChatGPT-visible LConnect tools.
5. Expect the running daemon to expose 122 tools.
6. If the ChatGPT connector still exposes 120 tools, refresh/reconnect the connector/plugin once.
7. Direct-call `latency_budget_status` and `latency_round_start`.
8. If both direct tools are visible and correct, close LCN-046; do not redo implementation/deployment.

---

## Authoritative repository state

- Repository: `funggier/LConnect`
- Branch: `main`
- Current HEAD at handoff creation: `e796cf86a12aa418a6c0d309e502b0bffb551dd4`
- HEAD subject: `Record LCN-046 live deployment checkpoint`
- Local/remote sync before handoff: `equal`
- Working tree before handoff document: clean
- Source version: `1.2.0`
- Source catalog: **122 tools**

Important predecessor commits:

- `df66e72ba28f70ef0ed595c3be70bb9863ee5679` — `Add user-confirmed adaptive turn latency budget`
- `500b7cb0cad669b087cf8242e5f84d114af2e5fd` — `Fix uncalibrated latency budget null semantics`
- `e796cf86a12aa418a6c0d309e502b0bffb551dd4` — `Record LCN-046 live deployment checkpoint`

Exact CI evidence:

- implementation CI: run `36318144473` / #123 — PASS
- null-semantics corrective CI: run `36318612471` / #124 — PASS
- live-checkpoint CI: run `36318986517` / #125 — PASS

All steps in #124 and #125 completed successfully, including Runtime smoke tests and Dependency audit.

---

## Current installed/runtime state

Installed root:

`T:\Sanbox\openclawspace\tunnel-mcp-ok`

Source root:

`T:\Sanbox\openclawspace\LConnect-github`

Running daemon at handoff:

- version: `1.2.0`
- PID: `13148`
- runtime started: `2026-09-27T12:22:53.742Z`
- working directory: `T:\Sanbox\openclawspace\tunnel-mcp-ok`
- tool count: **122**
- catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`

Deployment verification immediately before handoff:

- tracked files: `187`
- equal: `187`
- missing installed: `0`
- changed: `0`
- unstable/error: `0`
- source/install manifest digest: `809540e52f336963353871cb64c604607c932d229a44e602813456cc44b40f94`
- package source/install: `1.2.0 / 1.2.0`
- direct dependency declarations: equal
- installed direct dependencies: `4/4` present
- preserved paths: PASS — `mcp-conf.yaml`, `node_modules`, `logs`, `runtime`
- runtime root/version/expected tool count checks: PASS

Do not redeploy unless this evidence changes.

---

## ChatGPT client/schema state at handoff

The current session still exposes **120 direct LConnect tools** even though the running daemon exposes 122.

This is the expected remaining client-schema refresh gap.

New tools that must become directly visible after reconnect/refresh:

- `latency_round_start`
- `latency_budget_status`

The new session should treat **122 ChatGPT-visible tools** as the expected final schema.

---

## Current latency-budget state

`StatusMaxLatency` / shared CLI evidence immediately before handoff:

- mode: `OBSERVE`
- generation: `1`
- round ID: `1`
- round status: `not_started`
- calls this round: `0`
- current round latency: `0 ms`
- last call: none
- blocked calls: `0`
- failure ceiling: none
- failed-round average: none
- safe max: none
- remaining: unbounded

State files:

- `runtime/latency-budget-state.json`
- `runtime/latency-budget-history.jsonl`

Both are local-only runtime state. History is audit-only.

Uncalibrated nullable semantics are intentionally:

- `failure_ceiling_ms = null`
- `average_call_ms = null`
- `safe_max_ms = null`
- `predicted_next_ms = null`
- `remaining_ms = null` / CLI `unbounded`

Do not convert these uncalibrated values to zero.

---

## LCN-046 design contract

### Hard invariant — round scoped

Latency from previous rounds MUST NOT be added to the current round.

A new round starts at:

- call count = 0
- cumulative latency = 0

### Retry confirmation

LConnect does not claim to detect the ChatGPT retry itself.

The user confirms a retry by running:

`SetMaxLatency-LConnect.cmd`

SetMaxLatency uses only the **current/latest round**.

Historical rounds MUST NOT be used for active average, minimum, maximum, EWMA or ceiling calculations.

A later Set operation replaces the previous active ceiling.

### Safe-max formula

`average_call_ms = failed_round_total_ms / failed_round_call_count`

`safe_max_ms = failed_round_total_ms - average_call_ms`

### Modes

- before a confirmed retry: `OBSERVE`
- after SetMaxLatency: `ENFORCE`

OBSERVE does not hard-block work.

### Normal use after calibration

The user should not need to press ResetRound for every request.

After MaxLatency has been calibrated, the AI must call:

`latency_round_start`

before the first LConnect work tool in each new user turn.

This is the authoritative round boundary for normal use.

Do not infer turns from MCP request ID or idle-time gaps. Live connector evidence showed `request_id="0"` across calls.

### ENFORCE guards

If ENFORCE is active and no active round exists:

`ROUND_NOT_STARTED`

If:

`current_round_ms + predicted_next_ms > safe_max_ms`

the work tool must not execute and LConnect returns:

`LATENCY_BUDGET_EXCEEDED`

`predicted_next_ms` uses the average call latency from the latest user-confirmed failed round only.

---

## Added user controls

- `ResetRound-LConnect.cmd` — manually force a new round at zero while preserving active max
- `SetMaxLatency-LConnect.cmd` — confirm retry for current round and replace active ceiling/safe max
- `ResetMaxLatency-LConnect.cmd` — clear active max and return to OBSERVE
- `StatusMaxLatency-LConnect.cmd` — show current state

All four wrappers call the shared Node implementation:

`scripts/latency-budget-cli.mjs`

Do not duplicate the formula in PowerShell/CMD.

---

## Added MCP tools

### `latency_round_start`

AI-owned explicit new-round boundary. Starts the next round at zero and preserves any active calibrated max.

### `latency_budget_status`

Read-only structured status for:

- mode/generation
- round ID/status
- calls/current-round latency
- active failure ceiling
- failed-round average
- safe max
- remaining budget

---

## Middleware / metadata behavior

Latency middleware wraps tools centrally; individual 120 existing tools were not edited one by one.

Successful/error work-tool payload text must remain compatible with existing tools.

Latency metadata is exposed through:

- `structuredContent.latency_budget`
- MCP `_meta.latency_budget`

Do not append latency metadata as an extra text content item.

Reason: the initial implementation did that and broke `batch_inspect` JSON payload preservation.

---

## Problems found and already repaired

### 1. Text metadata broke batch_inspect

Initial latency metadata was appended as a second text block. `batch_inspect` concatenates nested text content, so JSON became two concatenated documents.

Repair:

- moved metadata to `structuredContent` / `_meta`
- targeted batch regression PASS

Do not reintroduce text-appended latency metadata.

### 2. Timing-dependent replacement test

Real delayed calls under an existing enforced budget could be blocked by scheduler variance and leave no measured calls for SetMax.

Repair:

- second failure/replacement semantics seeded deterministically
- repeated latency smoke ×3 PASS

### 3. Uncalibrated null normalization

First live deployment exposed uncalibrated latency values as `0` instead of `null`.

Root cause:

`Number(null) === 0` in generic numeric normalization.

Repair commit:

`500b7cb0cad669b087cf8242e5f84d114af2e5fd`

Correct live behavior now preserves null/unbounded semantics.

---

## Validation already complete — do not repeat unless state changed

Local:

- `npm run check`: PASS
- latency-budget targeted smoke: PASS
- latency smoke concurrent ×3: PASS
- batch-inspect regression: PASS
- source smoke: `PASS tools=122`
- full `npm test`: PASS (~52.5s)
- dependency audit: 0 vulnerabilities
- `git diff --check`: PASS

GitHub:

- #123 PASS
- #124 PASS
- #125 PASS

Installed/live:

- source↔installed parity: PASS 187/187
- installed syntax/smoke: PASS before activation
- daemon restart/activation: PASS
- runtime 1.2.0 / 122: PASS
- null semantics live: PASS
- shared CLI state: PASS

---

## Exact next steps in the new session

### Step 1 — reconnect

The user said the new session will reconnect LConnect first.

After reconnect, inspect the available LConnect tool count.

Expected: **122**.

If still 120, refresh/reconnect the connector/plugin once and re-check.

### Step 2 — direct client-schema validation

Direct-call:

`latency_budget_status`

Expected initial evidence should remain OBSERVE and uncalibrated. Exact round ID may advance only if a manual/reset/start action has occurred, but historical latency must not appear in the current round.

Then direct-call:

`latency_round_start`

Expected:

- successful result
- round status becomes `active`
- calls/current-round latency start at zero
- active max remains unchanged (currently none)

Then call `latency_budget_status` again and verify the new round.

### Step 3 — close LCN-046 if direct validation passes

Update:

- `docs/development/tasks/LCN-046-user-confirmed-adaptive-turn-latency-budget.md` → COMPLETE
- `docs/development/reports/LCN-20260927-046-user-confirmed-adaptive-turn-latency-budget.md` → final PASS with direct-tool evidence
- `docs/development/ACTIVE.md` → no active development task (unless user opens another task)
- `docs/development/STATUS.md` → ChatGPT-visible catalog 122; Delivery/Turn Reliability follow-up complete at current need
- `docs/development/TASK_INDEX.md` → LCN-046 COMPLETE
- `docs/development/ROADMAP.md` → Phase 4C COMPLETE AT CURRENT NEED

Commit/push the docs-only closure.

Sync the changed tracked docs into installed root so source↔installed parity remains exact. No daemon restart is needed for docs-only closure.

Run `deployment_verification_snapshot` after sync and require exact parity.

### Step 4 — calibration is NOT part of task closure

Do not invent a MaxLatency value just to close LCN-046.

Calibration should happen later during real use:

1. user runs `ResetRound-LConnect.cmd` before a deliberate measurement round
2. use LConnect normally
3. if the user actually sees Retry/message-delivery failure, user runs `SetMaxLatency-LConnect.cmd`
4. subsequent normal turns use AI-called `latency_round_start`

Without a real user-confirmed retry, remaining in OBSERVE with no ceiling is correct.

---

## Stable v1.2.0 release baseline

Published release remains:

`v1.2.0 — Reliability & Verification`

Release tag target:

`043a669a7f421db21586e4fb5cd3645ef0f44c60`

Published release catalog is 120 tools. LCN-046 is currently post-release `main` work and has not been published as a new release.

Do not move or recreate the v1.2.0 tag as part of LCN-046.

Release asset naming already finalized:

- program: `LConnect-v1.2.0-Reliability-Verification.zip`
- release checksum manifest: `LConnect-v1.2.0-SHA256.txt`
- documentation assets: `Doc-v1.2.0-*`

---

## Important operational invariants

- GitHub/runtime are authoritative; verify them before relying on handoff prose.
- Use only MCP `main` channel.
- Full-machine filesystem access is intentional/default.
- `Refresh-LConnect.cmd` is offline/hard cleanup after Stop, not normal reconnect/source sync.
- Preserve `mcp-conf.yaml`, `node_modules`, `logs`, `runtime` during tracked-source deployment.
- Network-backed GitHub tools remain outside `batch_inspect` allowlist.
- AI owns workflow/decision; LConnect owns execution/observation/evidence.
- Do not turn the latency budget into automatic inference of ChatGPT/platform failure.

---

## New-session short instruction

Reconnect LConnect, read this handoff, verify `main`/runtime live state, make sure ChatGPT sees 122 LConnect tools, direct-call `latency_budget_status` and `latency_round_start`, then close LCN-046 if both pass. Do not redo implementation, CI, deployment, restart or calibration unless live evidence has changed.