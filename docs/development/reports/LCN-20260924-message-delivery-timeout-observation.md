# 2026-09-24 — Message Delivery Timeout Observation During LCN-030

## Status

**EVIDENCE ONLY — NO LATENCY DEVELOPMENT TASK OPENED**

This report records the live incident because latency/timeout expansion is intentionally deferred.

## User-visible symptom

The ChatGPT UI reported:

\`Message delivery timed out. Please try again.\`

The exact frontend timeout timestamp is not available from LConnect.

## Work state recovered after the incident

The work itself was not lost.

Repository state after reconnect/re-entry:

- branch: \`main\`
- HEAD: \`ba740c75ed29d2b14b52a42c88db448e159d0488\`
- upstream: \`origin/main\`
- ahead: 0
- behind: 0
- working tree: clean

LCN-030 implementation had already been committed/pushed.

The managed GitHub CI watcher:

- session label: \`LCN-030 GitHub CI\`
- started: 2026-09-24 13:50:59 +07:00
- completed: 2026-09-24 13:53:24 +07:00
- exit code: 0
- GitHub Actions run: \`35966485027\`
- result: PASS

## LConnect telemetry around the cut point

After the CI watcher was started, the turn repeatedly called \`wait_session\` with a 10-second bounded wait.

Observed wait handler completions included approximately:

- 13:51:06 → 13:51:16
- 13:51:25 → 13:51:35
- 13:51:44 → 13:51:54
- 13:52:02 → 13:52:12
- 13:52:19 → 13:52:29
- 13:52:43 → 13:52:53

All recorded LConnect telemetry events completed without handler error or LConnect timeout.

The last MCP command from that turn was forwarded by tunnel-client at approximately:

\`13:52:53 +07:00\`

No additional MCP command was forwarded during 13:53, while the already-running managed \`gh\` process continued independently and completed successfully at 13:53:24.

This is strong evidence that the assistant turn stopped progressing before the managed process itself finished.

## Tunnel evidence

Active tunnel log:

\`tunnel-20260924-130126.out.log\`

During the 13:50–13:52 window it records repeated:

\`dispatcher forwarded command to MCP server\`

There is no tunnel log \`error\` entry in the incident window.

The corresponding stderr log contains only the normal LConnect startup line.

At post-incident observation time, cumulative tunnel metrics showed:

- \`POST /v1/tunnels/.../response\` status 200 count: 205
- no other response status count line was present for that endpoint
- \`tools/call\` metrics were reported with \`tunnel_service_status="200"\`

For \`tools/call\` poll-to-response latency:

- total observed: 200
- <=10 seconds: 175
- >10 seconds: 25

The >10-second population is consistent with long bounded wait operations plus transport overhead; it does not indicate that the local LConnect handler crashed.

## Comparison with earlier LCN-033/034 evidence

Earlier LCN-033 established that most sampled caller wall time was outside local handlers.

LCN-034 then reduced a representative five-read sequence from:

- 9963 ms across five MCP calls
- to 2667 ms through one bounded \`batch_inspect\`

The current incident adds a different but compatible observation:

- individual LConnect/tunnel calls continued to complete
- tunnel response traffic remained HTTP 200
- the long assistant turn stopped before the managed external CI process completed
- the managed process itself remained healthy and finished successfully

## Current localization

What the evidence supports:

1. LConnect did not crash.
2. The GitHub CI managed process did not fail.
3. The tunnel remained live/readable.
4. LConnect handlers around the cut point completed.
5. Tunnel response metrics show successful HTTP 200 response posting cumulatively.
6. The assistant turn stopped issuing new MCP calls about 31 seconds before the managed CI watcher completed.

The exact ChatGPT frontend/backend component that emitted the user-visible timeout cannot be proven from local LConnect logs.

The strongest current localization is therefore:

\`after LConnect handler execution / after tunnel response handling, at the longer-lived assistant turn or message-delivery layer\`

## Operational mitigation while latency work is deferred

Without adding new latency features:

- avoid repeated 10-second polling loops inside one long assistant turn
- prefer one bounded status check and preserve the managed process/session for later inspection
- use structured GitHub run tools after the installed runtime is refreshed to the 111-tool source catalog
- keep checkpoint state in Git so a delivery timeout does not lose completed work
- do not treat a UI message timeout as evidence that the local managed process failed

## Deferred

No new latency/timeout implementation task is opened by this report.

Further transport/message-delivery optimization remains deferred until the project explicitly resumes that workstream.
