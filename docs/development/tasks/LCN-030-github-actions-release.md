# LCN-030 — GitHub Actions / Release Integration

Status: **PLANNED**

## Goal

เพิ่ม structured tools สำหรับ GitHub Actions และ GitHub Release common workflow เท่านั้น

## Why

งาน release ปัจจุบันใช้ `gh` CLI ผ่าน PowerShell สำหรับ list/view/wait/log/dispatch/release/download แล้วต้อง parse output และเขียน polling loop ซ้ำ

## Planned minimum capabilities

- `github_run_list`
- `github_run_view`
- `github_run_wait`
- `github_run_failed_logs`
- `github_workflow_dispatch`
- `github_release_view`
- `github_release_download`

## Authentication direction

First implementation should prefer reusing authenticated `gh` CLI if present.

Rules:

- LConnect does not create a new secret store
- do not echo auth tokens
- unauthenticated state must report prerequisite clearly
- future direct GitHub API backend may replace/augment implementation without changing public tool semantics

## Actions semantics

### github_run_wait

- bounded wait
- timeout does not cancel workflow
- repeatable
- terminal result idempotent
- structured jobs summary

### github_run_failed_logs

- failed jobs/steps only where practical
- bounded output
- preserve enough error context for diagnosis

### github_workflow_dispatch

Require:

- exact repository
- exact workflow identity
- explicit inputs

Return dispatch/correlation evidence available from GitHub.

## Release semantics

### github_release_view

Return:

- tag
- target commitish
- draft/prerelease
- published time
- URL
- assets
- asset sizes/digests when available

### github_release_download

- explicit tag/release + asset name
- filesystem scope enforced
- default no overwrite
- bounded max bytes
- atomic temp-file replacement
- return local SHA-256 after download where practical

## Non-goals

Not included:

- Issues
- PR authoring/review
- repo settings
- collaborators
- Actions secrets
- generic arbitrary GitHub REST mutation

## Tests

- safe fixture/test repository where practical
- list/view known run
- bounded run wait
- failed log bounds
- workflow dispatch with explicit inputs
- release metadata
- asset download + digest evidence
- unauthenticated diagnostic
- secret redaction

## Acceptance criteria

- common Actions/Release workflow can be done without raw `gh` parsing
- credentials never appear in MCP output
- Git tools remain independent
- npm check/test/audit PASS
- direct MCP runtime acceptance PASS
- GitHub CI PASS
- docs/status/report updated

## Scope rule

Keep this module narrow. Generic GitHub project management is explicitly deferred.
