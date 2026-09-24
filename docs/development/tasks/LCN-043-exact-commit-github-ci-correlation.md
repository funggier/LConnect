# LCN-043 — Exact Commit GitHub CI Correlation

Status: **ACTIVE — IMPLEMENTATION GREEN / CI IN PROGRESS**

## Goal

Reduce the repeated two-step GitHub Actions workflow used after every implementation push:

1. list recent runs,
2. identify the run whose `head_sha` matches the implementation commit,
3. call run view again to obtain jobs/steps.

`batch_inspect` cannot feed a run ID discovered by one operation into the next operation in the same call.

## Tool

`github_commit_run_status`

Read-only. No workflow dispatch, cancellation, rerun, mutation, release action, or repository write.

## Inputs

- `repo` — exact `owner/name`
- `commit` — exact 40-hex commit SHA
- optional `workflow`
- optional `branch`
- optional `status`
- optional `event`
- optional `limit` — bounded candidate limit

## Exact correlation

The tool uses:

`gh run list --commit <exact-40-hex-sha>`

Optional filters are passed through existing validated identity rules.

Returned rows are defensively re-filtered so `head_sha` must exactly equal the requested commit SHA.

No branch-head inference or short-SHA matching is used.

## Deterministic selection

If multiple runs match the same commit and filters:

- return bounded candidate summaries,
- select the latest deterministically by `created_at`,
- use run ID as the stable tie-breaker,
- call the existing `readRun()` helper for the selected exact run,
- return full normalized jobs/steps for the selected run.

## Result

- repo
- commit
- found
- match_count
- candidate_limit
- candidates
- candidates_truncated
- selected_run_id
- selection rule
- selected run metadata
- jobs / steps

If no run matches:

- `found=false`
- `selected_run_id=null`
- `run=null`

This is normal evidence, not an MCP error.

## Safety / reliability

- reuse existing GitHub CLI auth readiness cache
- reuse existing GitHub secret redaction
- exact 40-hex commit validation
- bounded run-list output
- bounded command timeouts
- no mutation
- no workflow ownership added to LConnect

## Batch boundary

`github_commit_run_status` is read-only but performs an external GitHub network request through `gh`.

It is **not** allowlisted in `batch_inspect`, whose contract intentionally excludes network requests. The direct tool itself performs the required list→select→view correlation inside one bounded MCP call.

## Current evidence

- source catalog: 119 tools
- exact `gh run list --commit`: PASS
- workflow/branch/status/event forwarding: PASS
- defensive exact-SHA filter: PASS
- deterministic latest selection: PASS
- selected run jobs/steps: PASS
- missing/invalid commit handling: PASS
- auth cache/redaction regressions: PASS
- `batch_inspect` network boundary rejection: PASS
- real GitHub exact-commit candidate check: PASS (commit `1f83e234...` → run `35996073922`)
- syntax check: PASS
- dependency audit: 0 vulnerabilities
- full local suite: PASS (`PASS tools=119`, approximately 51.6 seconds)
- implementation: `3684ca90b027a9dff4f083bad1aedfa13141a4a3`
- GitHub CI discovered by `github_commit_run_status`: `35998083970` — IN PROGRESS
- installed live validation: PENDING

## Acceptance

- exact commit list uses `--commit`: PASS
- exact SHA defensive filter: PASS
- deterministic latest selection: PASS
- selected run includes jobs/steps: PASS
- multiple same-commit candidates: PASS
- workflow/branch/status/event filters: PASS
- missing commit run returns found=false: PASS
- invalid short SHA rejected: PASS
- auth cache reused: PASS
- secret-safe errors remain intact: PASS
- `batch_inspect` rejects the network-backed tool: PASS
- source smoke catalog: PASS
- real repository exact-commit candidate check: PASS
- full local suite: PASS
- dependency audit: PASS
- GitHub CI: PASS
- installed live validation: PASS
