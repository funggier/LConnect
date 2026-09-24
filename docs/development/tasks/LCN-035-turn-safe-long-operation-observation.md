# LCN-035 — Turn-Safe Long Operation Observation

Status: **COMPLETE — LIVE VALIDATED**

## Goal

Reduce exposure to user-visible ChatGPT message-delivery timeouts during long-running local/GitHub operations without moving workflow ownership into LConnect.

## Incident basis

On 2026-09-24, a long assistant turn repeatedly called `wait_session` with ~10-second waits while a managed `gh run watch` process continued independently.

Evidence showed:

- LConnect handlers completed normally
- tunnel responses remained HTTP 200
- the assistant turn stopped issuing MCP calls before the managed process completed
- the managed process later completed successfully

The exact ChatGPT delivery component is outside LConnect and cannot be repaired locally, but LConnect can reduce turn duration, blocking time, round trips and response payloads.

## Changes

### 1. Non-blocking managed-session status

Add `session_status`:

- exact session ID
- immediate/non-blocking
- compact lifecycle metadata
- output omitted by default
- optional bounded output tail

### 2. Compact session listing

Change `list_sessions` so default output excludes buffered stdout/stderr.

Allow explicit `include_output=true` for compatibility when full buffered output is actually needed.

### 3. Short managed-session wait contract

For `wait_session`:

- default wait: 1 second
- maximum wait: 3 seconds
- output tail disabled by default
- explicit output tail remains available
- timeout never terminates managed work

Long-running work must remain in the managed session and be checked later instead of keeping one MCP call blocked.

### 4. GitHub wait containment

For `github_run_wait`:

- default wait: 1 second
- maximum wait: 3 seconds
- workflow is never cancelled on timeout
- repeated calls remain safe

### 5. GitHub auth readiness cache

Cache only a successful `gh auth status` readiness result for a short in-memory TTL.

Rules:

- do not cache a token
- do not cache auth output
- failed auth is never cached
- cache disappears on LConnect restart
- actual GitHub commands remain authoritative and can still fail independently

Purpose: avoid launching `gh auth status` before every GitHub tool call in one active session.

## Non-goals

Not included:

- changing OpenAI/ChatGPT frontend/backend timeout behavior
- retrying assistant messages
- background autonomous polling
- new MCP channels
- persistent workflow scheduler
- Desktop/Browser work

## Current evidence

- implementation: `ddab13a48a78e7ef217e153a6ba023cffd7ddd47`
- source catalog: 112 tools
- targeted process/GitHub/batch tests: PASS
- full local suite: PASS
- dependency audit: 0 vulnerabilities
- GitHub Actions: `35976569888` — PASS
- live pre-deploy baseline: recorded
- live post-deploy validation: PASS
- no-refresh catalog experiment: daemon/runtime 112 confirmed while ChatGPT-visible schema remained 111
- report: `../reports/LCN-20260924-035-turn-safe-long-operation-observation.md`

## Acceptance

- `session_status` is immediate and compact
- default `list_sessions` does not return buffered output
- explicit full-output list remains possible
- `wait_session` default/maximum contract is turn-safe
- `github_run_wait` default/maximum contract is turn-safe
- repeated GitHub tool calls reuse successful auth readiness within TTL
- unauthenticated diagnostics still work and redact secrets
- process/session regression suite PASS
- GitHub regression suite PASS
- full npm check/test/audit PASS
- GitHub CI PASS
- live post-deploy telemetry comparison recorded
