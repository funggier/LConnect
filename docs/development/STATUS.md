# STATUS — LConnect Development

Last updated: 2026-09-19

## Overall

Current project state: **BASIC CORE STABLE / EXPANSION ROADMAP READY**

LConnect มี Core ที่ใช้งานจริงแล้วและผ่าน runtime acceptance บน Windows:

- filesystem
- shell
- process/session
- system diagnostics
- full-machine access by default
- tunnel-client updater/version gate
- timeout recovery baseline
- CI
- Thai documentation
- GitHub releases

Expansion phase ถัดไปมุ่งไปที่ System, Development, Observation และ Desktop/Browser automation

## Workstream status

| Workstream | Status | Task range | Notes |
|---|---|---:|---|
| Core / Tunnel | COMPLETE | LCN-001–006 | Baseline + recovery + coordination |
| System Foundation | READY | LCN-007–011 | Environment first |
| Developer Foundation | PLANNED | LCN-012–014 | Git / Development / HTTP |
| Observation | PLANNED | LCN-015–017 | Log / Watcher / Scheduled Tasks |
| Desktop Control | PLANNED | LCN-018–020 | Clipboard / Window / Input |
| Browser Automation | PLANNED | LCN-021–023 | Common browser layer + Firefox + Chrome |

## Completed baseline

### LCN-001 — Modular MCP Core
**COMPLETE**

25 tools exposed through one `main` MCP channel.

### LCN-002 — Full-machine access default
**COMPLETE**

Filesystem full-machine access by default; actual capability remains bounded by Windows account permissions.

### LCN-003 — Documentation / CI / v1.0.0 Basic
**COMPLETE**

Thai docs, install/start/status/stop scripts, Windows CI, first ZIP release.

### LCN-004 — Timeout recovery root cause
**COMPLETE**

Identified tunnel-client 0.0.12 shared-stdio recovery defect after response deadline.

### LCN-005 — v1.0.1 Basic Recovery
**COMPLETE**

Added tunnel-client updater and minimum version gate `>=0.0.14`.

### LCN-006 — v1.0.2 Status diagnostics
**COMPLETE**

Separated liveness/readiness/control-plane health; optional MCP health route no longer causes false failure.

## Next sequence

```text
LCN-007 Environment
  ↓
LCN-008 Process Advanced
  ↓
LCN-009 Windows Services
  ↓
LCN-010 Port / Network
  ↓
LCN-011 Hardware
  ↓
LCN-012 Git
  ↓
LCN-013 Development
  ↓
LCN-014 HTTP Client
  ↓
LCN-015 Log Tail
  ↓
LCN-016 File Watcher
  ↓
LCN-017 Scheduled Tasks
  ↓
LCN-018 Clipboard
  ↓
LCN-019 Window Control
  ↓
LCN-020 Keyboard / Mouse
  ↓
LCN-021 Browser Common Layer
  ↓
LCN-022 Firefox Adapter
  ↓
LCN-023 Chrome Adapter
```

## Current known constraints

- Tool calls that block too long can be cut by an upstream caller timeout; long-running work should use session/job-style patterns.
- `/readyz` is not proof that stdio MCP RPC is healthy.
- tunnel configuration remains local-only and must never be committed.
- Browser automation must not depend on Edge.
- Firefox is the primary browser target; Chrome is secondary.
