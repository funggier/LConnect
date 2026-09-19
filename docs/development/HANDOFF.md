# LConnect Session Handoff

Use this file when starting a new ChatGPT/agent session.

## Repository

```text
https://github.com/funggier/LConnect
```

Default branch:

```text
main
```

## Required first reads

```text
docs/development/ACTIVE.md
docs/development/STATUS.md
docs/development/ROADMAP.md
docs/development/DECISIONS.md
docs/development/TASK_INDEX.md
```

Then read the task referenced by `ACTIVE.md` and the latest file under:

```text
docs/development/reports/
```

## Working rule

GitHub/current repository state is authoritative.

Do not assume the SHA written in old task/report files is still current. Verify:

```text
git status --short --branch
git rev-parse HEAD
git fetch
git status -sb
```

## Current direction

The next expansion sequence begins with:

```text
Environment
Process Advanced
Windows Services
Port / Network
Hardware
Git
Development
HTTP
Log Tail
File Watcher
Scheduled Tasks
Clipboard
Window Control
Keyboard / Mouse
Browser Common Layer
Firefox
Chrome
```

Firefox is primary browser. Chrome is secondary. Edge is not required.

## Development expectations

- modular Core
- one main MCP channel
- structured tools instead of raw-shell wrappers where practical
- TDD/acceptance evidence
- long-running operations should use session/job patterns
- update task/status/history after meaningful work
- do not commit tunnel configuration or secrets
