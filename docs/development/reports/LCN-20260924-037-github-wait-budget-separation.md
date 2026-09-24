# LCN 2026-09-24 — LCN-037 GitHub Wait Budget Separation

## Result

**PASS — GITHUB WAIT BUDGET SEPARATION LIVE VALIDATED**

## Trigger

A live call to `github_run_wait` against GitHub Actions returned:

`GitHub CLI command timed out.`

This occurred after LCN-035 reduced the default wait window to one second.

## Root cause

The implementation coupled two independent concepts:

1. how long LConnect should observe/wait for workflow state changes
2. how long one required `gh run view` subprocess is allowed to take

The old code derived:

`readTimeoutSeconds`

from the remaining `wait_seconds` deadline.

With default `wait_seconds=1`, a real `gh run view` that normally needs approximately 1.5–2+ seconds could be killed before it returned current workflow state.

That transformed a normal non-terminal workflow observation into a tool error.

## Repair

The new contract separates:

- overall MCP request budget
- auth readiness timeout
- status-fetch timeout
- short observation/wait window

Current bounded values:

- wait window default: 1 second
- wait window maximum: 3 seconds
- auth readiness timeout: 3 seconds
- one status fetch timeout: 5 seconds
- overall MCP synchronous budget remains authoritative

The implementation always performs one bounded status fetch first.

If the run is non-terminal:

- `wait_seconds=0` returns current structured state immediately
- a positive wait window can perform bounded follow-up observations
- before sleeping or launching another status fetch, the implementation reserves enough MCP budget for the fetch
- if there is insufficient overall request budget, it returns `return_reason=request_budget` instead of launching a doomed subprocess

The GitHub workflow is never cancelled.

## Evidence fields

`github_run_wait` now returns:

- `requested_wait_ms`
- `effective_wait_ms`
- `request_budget_ms`
- `status_fetch_timeout_seconds`
- `status_checks`
- `return_reason`

These make the active timeout layer explicit.

## Regression test

A new fixture run simulates a GitHub status fetch that fails if its subprocess timeout is below two seconds.

The test calls:

`github_run_wait(wait_seconds=0)`

Expected:

- one status fetch still receives its independent five-second fetch budget
- current non-terminal state is returned
- `completed=false`
- `timed_out=true`
- `return_reason=timeout`
- no `GitHub CLI command timed out` error

Result: **PASS**

## Targeted validation

- GitHub structured list/view: PASS
- auth readiness cache: PASS
- 1s default / 3s maximum wait: PASS
- status-fetch / wait-budget separation: PASS
- completion / structured timeout: PASS
- failed-log bounds/redaction: PASS
- workflow dispatch: PASS
- release view/download: PASS
- unauthenticated diagnostics: PASS
- syntax check: PASS
- source smoke: `PASS tools=113`
- dependency audit: 0 vulnerabilities

## Full validation

Full local suite: **PASS** (`PASS tools=113`, approximately 42.9 seconds)

GitHub Actions: **PASS** — run `35980718759`

Live source-candidate requalification: **PASS**

A direct stdio call against the real in-progress GitHub Actions run `35980718759` used `github_run_wait(wait_seconds=0)` and returned:

- caller wall: approximately 1992 ms
- `is_error=false`
- `completed=false`
- `timed_out=true`
- `return_reason=timeout`
- `status_fetch_timeout_seconds=5`
- `status_checks=1`
- real run state: `in_progress`

This reproduces the exact live timing class that failed before repair while confirming the candidate now returns structured state instead of `GitHub CLI command timed out`.

Pre-deploy file-integrity evidence:

- source candidate `modules/github.mjs` SHA-256: `20c2885512bf6199f01b0ddc80fefef658e4b6ea2b92191710f9ee4031fd7ade`
- installed pre-LCN-037 `modules/github.mjs` SHA-256: `3b2e175ab07847c91e77ec95a6a6074b866d31bd7cb2efe0bcae3fbd761ee30c`

## Live installed-runtime requalification

After restart, the installed runtime was tested directly against completed GitHub Actions run `35981046103` with `github_run_wait(wait_seconds=0)`.

Observed:

- caller wall: 4123 ms
- handler: 1525.596 ms
- `completed=true`
- `timed_out=false`
- `return_reason=completed`
- `status_fetch_timeout_seconds=5`
- `status_checks=1`
- result size: 4079 bytes
- no tool error

This is the same >1-second status-fetch timing class that previously failed when the fetch timeout was coupled to the one-second observation window.

The repair therefore passes installed live requalification.

The difference between caller wall and local handler in this sample is approximately 2597 ms, reinforcing the existing evidence that material latency remains outside the LConnect handler.

## Final result

**PASS — GITHUB WAIT BUDGET SEPARATION LIVE VALIDATED**
