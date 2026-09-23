# LCN 2026-09-23 — LCN-031 MCP Request Timeout Containment

## Result

**PASS — TIMEOUT CONTAINMENT GREEN**

## Scope

This task addressed only timeout/reconnect behavior attributable to LConnect-side synchronous MCP work.

It did not:

- change ChatGPT/OpenAI frontend/backend timeout settings
- add another MCP channel
- add an autonomous workflow runtime
- start LCN-027
- add Desktop or Browser capability

The tunnel-facing architecture remains:

```text
ChatGPT
  -> OpenAI Tunnel
    -> main
      -> LConnect MCP
```

## Root-risk findings

### 1. Long synchronous child-process waits

Several structured tools ultimately use `runProcess` / `runPowerShell`. Their historical timeout could be much longer than desirable for an interactive MCP response.

### 2. Timeout still waited for child close

The old `runProcess` timeout killed the direct child but did not resolve until the Node child emitted `close`.

A descendant can retain inherited stdout/stderr handles, so `close` may be delayed even after the direct process is no longer useful. This could defeat the intended response timeout.

### 3. wait_session allowed long blocking waits

`wait_session` allowed one call to wait up to 30 seconds even though the managed process itself already had an independent lifecycle.

### 4. HTTP deadline ended too early

The previous HTTP helper cleared its abort timer once `fetch()` returned the response object. A server could return headers and then stall the body, leaving body/download consumption outside the intended timeout.

## Changes

### Configurable synchronous containment budget

Added:

```json
{
  "mcp": {
    "maxSynchronousRequestSeconds": 15
  }
}
```

Environment override:

```text
LCONNECT_MAX_SYNCHRONOUS_REQUEST_SECONDS
```

This is a local LConnect containment value. It is not an assertion about an undocumented OpenAI/ChatGPT delivery deadline.

### Child-process timeout return

`runProcess` now:

- caps requested synchronous timeout to the configured budget
- records requested/effective timeout evidence
- on deadline, requests child termination
- destroys local stdout/stderr handles
- returns the timeout result immediately instead of waiting for `close`

### Managed process semantics preserved

`start_process` remains outside the synchronous child-process containment path.

Long work remains:

```text
start_process
  -> session_id
  -> local process continues
  -> wait_session / read_process_events / read_process_output
```

A short `wait_session` timeout does not terminate the managed process.

### wait_session evidence

Added:

- `waited_ms`
- `return_reason`:
  - `already_completed`
  - `completed`
  - `timeout`

Default wait is short and maximum wait is derived from the configured LConnect synchronous budget.

### HTTP full-operation deadline

HTTP request/download deadlines now remain active while consuming the response body.

A regression fixture explicitly flushes HTTP response headers immediately and delays the body, proving timeout containment applies after headers arrive.

## TDD evidence

### RED

- Candidate: `d46ceeb81fd09a6bbee7585e4d84b649faed1db1`
- GitHub Actions run: `35881634042`
- Result: **FAIL**
- Failure stage: Runtime smoke tests

### GREEN

- Implementation candidate: `77592106c5d60ba5ff426df8ab1b4ae855195191`
- GitHub Actions run: `35881996747`
- Result: **PASS**
- PowerShell syntax: PASS
- Node syntax: PASS
- Runtime smoke tests: PASS
- Dependency audit: PASS

## Regression proof

The new timeout test verifies:

1. a synchronous PowerShell command requesting a longer timeout is contained by a 1-second test budget
2. a managed process returns a session promptly
3. a short `wait_session` expires without terminating that process
4. timeout returns explicit wait evidence
5. an HTTP server that sends headers but delays the body is still bounded
6. the previously timed-out managed process later reaches normal terminal completion

## Boundary

This change reduces timeout risk caused by LConnect holding an MCP call open too long.

It cannot guarantee that ChatGPT will never show:

- `Connection interrupted. Waiting for the complete answer`
- `Message delivery timed out. Please try again.`

Those can also originate in ChatGPT frontend/backend/network delivery layers outside LConnect.

The durable rule is:

> ChatGPT connection lifetime is not local managed-process lifetime.
