# LCN 2026-09-24 — LCN-043 Exact Commit GitHub CI Correlation

## Result

**IMPLEMENTATION GREEN — INSTALLED LIVE VALIDATION PENDING**

## Goal

Collapse the repeated post-push GitHub Actions observation sequence:

1. list recent runs,
2. locate the run matching one implementation commit,
3. extract the run ID,
4. call run view to obtain jobs/steps.

A normal `batch_inspect` call cannot safely feed a run ID discovered by one operation into the next operation.

## Tool

Added:

`github_commit_run_status`

Source catalog:

`118 → 119 tools`

## Exact commit contract

The tool requires one exact 40-hex commit SHA.

It calls:

`gh run list --commit <sha>`

Optional filters reuse existing validation:

- workflow
- branch
- status
- event

The returned rows are defensively filtered again so each candidate `head_sha` must exactly match the requested commit.

Short or malformed SHAs are rejected.

## Deterministic selection

When multiple exact-commit candidates are returned:

1. newest `created_at` wins;
2. run ID is used as the deterministic tie-breaker.

The selected run ID is then passed internally to the existing `readRun()` helper.

The response therefore contains:

- bounded candidate summaries,
- selected run ID,
- selection evidence,
- full selected run metadata,
- jobs,
- steps.

If no run exists for the exact commit:

- `found=false`
- `match_count=0`
- `selected_run_id=null`
- `run=null`

This is normal observation evidence and not an MCP error.

## Batch boundary

The tool is read-only but network-backed.

It is intentionally **not** allowlisted in `batch_inspect` because the batch contract excludes network requests and is intended for bounded local inspections.

Regression confirms `batch_inspect` rejects `github_commit_run_status` with `TOOL_NOT_ALLOWED` before the GitHub handler/network path executes.

The direct tool itself performs list→select→view correlation inside one bounded MCP call.

## Auth / redaction

The implementation reuses:

- existing GitHub CLI auth readiness cache,
- existing `checkedGh()` error handling,
- existing GitHub secret redaction,
- existing normalized run/job/step structures.

No new credential path exists.

## Targeted mock validation

PASS:

- exact `--commit` argument emitted
- workflow filter forwarded
- branch filter forwarded
- status filter forwarded
- event filter forwarded
- exact SHA defensive re-filter
- wrong-SHA row excluded
- multiple same-commit candidates
- deterministic latest selection
- selected run jobs/steps expansion
- missing commit run returns `found=false`
- short SHA rejected
- auth readiness cache remains reused
- existing secret-safe unauthenticated diagnostic remains PASS
- batch rejects network-backed tool
- syntax check
- source smoke: `PASS tools=119`

## Real GitHub candidate validation

The source candidate was executed against the live GitHub repository for the known LCN-042 implementation commit:

`1f83e23450b6c773358920dea53d6555a4f60e15`

Inputs:

- repo: `funggier/LConnect`
- workflow: `LConnect CI`
- event: `push`
- limit: 10

Observed:

- found: true
- match count: 1
- selected run ID: `35996073922`
- selected run number: 107
- workflow: `LConnect CI`
- head SHA: exact requested commit
- status: completed
- conclusion: success
- jobs returned: 1
- job: `windows`
- full steps returned, including Runtime smoke tests and Dependency audit

This exactly matches the previously independently observed LCN-042 CI run, proving the new tool can discover and expand the correct run from only the commit SHA and filters.

## Pre-deploy source↔installed evidence

Before deployment, a bounded local snapshot confirmed:

- repository coordination HEAD: `616a60f379879a81d145d77ff932bf72986a3cbe`
- exact remote sync state: `equal`
- working tree: clean
- running daemon: 118 tools
- source modules: 28 files
- installed modules: 28 files
- common equal: 27
- changed: 1
- source-only: 0
- installed-only: 0
- only changed module: `github.mjs`
- source module digest: `187026405a2ae7d54ec84556a5529acf1f93929790eed72e2bbff00b36275956`
- installed module digest: `20c2885512bf6199f01b0ddc80fefef658e4b6ea2b92191710f9ee4031fd7ade`
- comparison reliable: true

This is the expected pre-deploy drift for LCN-043.

## Dependency audit

`npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**

## Full validation

Full local suite: **PASS** (`PASS tools=119`, approximately 51.6 seconds)

## Self-correlation after implementation push

Implementation commit:

`3684ca90b027a9dff4f083bad1aedfa13141a4a3`

Immediately after push, the **source candidate of `github_commit_run_status` itself** was called with that exact SHA. No preceding `github_run_list` call was used.

It discovered:

- found: true
- match count: 1
- selected run ID: `35998083970`
- run number: 112
- workflow: `LConnect CI`
- event: `push`
- exact head SHA: `3684ca90b027a9dff4f083bad1aedfa13141a4a3`
- status at observation: `in_progress`
- job: `windows`
- expanded step state already available

This is direct end-to-end evidence that the new primitive eliminates the former list→extract ID→view sequence for exact implementation commits.

GitHub Actions: **PASS** — run `35998083970`

## Pre-restart installed deployment evidence

Tracked source was synchronized to the installed runtime.

Installed validation:

- syntax check: PASS
- GitHub smoke/regression: PASS
- source smoke: `PASS tools=119`
- source/install `modules/github.mjs` SHA-256 parity: PASS
- `github.mjs` digest: `187026405a2ae7d54ec84556a5529acf1f93929790eed72e2bbff00b36275956`
- source↔installed `modules` comparison: reliable + equal=true
- module files: 28 / 28 equal
- changed/source-only/installed-only: 0 / 0 / 0
- source/install manifest digest: `3e8be07b821717ad1ee7b2d5719d9f7dc817479266039e5900f7f52d66fc66de`

The active daemon before restart remained the prior catalog:

- process ID: `19372`
- runtime start: `2026-09-24T12:05:38.935Z`
- tool count: 118
- catalog digest: `3a4b6651ee0c2cdab802907f5a5ac7609e958579bee5a0a39c982a7ac3ae28a8`

Unlike LCN-040–042, the new tool is network-backed and intentionally not exposed through `batch_inspect`. Therefore final direct live validation requires:

1. restart/reconnect LConnect so the daemon registers 119 tools;
2. refresh the ChatGPT plugin schema so `github_commit_run_status` becomes directly callable;
3. invoke the direct tool against an exact known commit and verify run/jobs/steps evidence.

Restarted installed live validation: **PENDING**
