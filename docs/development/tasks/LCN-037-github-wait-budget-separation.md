# LCN-037 — GitHub Wait Budget Separation

Status: **ACTIVE**

## Goal

Repair the live `github_run_wait` regression discovered after LCN-035.

A short wait/observation window must never be reused as the subprocess timeout for one required `gh run view` status fetch.

## Live defect

Observed against real GitHub Actions:

- `github_run_view` normally requires roughly 1.5–2+ seconds locally
- LCN-035 changed `github_run_wait` default `wait_seconds` to 1 second
- implementation derived `readRun(... timeoutSeconds)` from the remaining one-second wait deadline
- live default call returned `GitHub CLI command timed out.` instead of a bounded non-terminal run status

The timeout layers were incorrectly coupled.

## Correct contract

Separate three budgets:

1. MCP synchronous request budget
2. GitHub CLI status-fetch budget
3. Optional run observation/wait window

Rules:

- `wait_seconds` remains default 1s, max 3s
- a `gh run view` fetch receives its own bounded status-fetch timeout
- auth readiness receives its own bounded timeout
- status fetches still remain inside the overall MCP request budget
- if there is insufficient MCP budget for another safe status fetch, return structured timeout evidence instead of starting a doomed subprocess
- GitHub workflow is never cancelled
- no background polling is added

## Acceptance

- live-defect regression: a status fetch needing >1s no longer fails because wait_seconds=1
- wait_seconds=0 still performs one status fetch and returns structured current state
- terminal run still returns completed
- non-terminal run returns bounded timeout/request-budget evidence
- >3s wait rejected by schema
- full GitHub smoke PASS
- full npm check/test/audit PASS
- GitHub CI PASS
- live requalification against a real run PASS
