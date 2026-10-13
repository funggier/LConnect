# LCN-061 — Godot Development Support & Operator Console Hold UX

Status: **ACTIVE**

Activated: 2026-10-13

## Goal

Add first-class Godot project awareness/execution to the existing Development Module without expanding the public MCP tool count, and make the user-facing Status/Stop CMD windows reliably remain readable after completion.

## Authoritative baseline

- repository: `funggier/LConnect`
- branch: `main`
- activation HEAD: `31e311286398d0fee510689f54d1b751b4066df3`
- source/runtime version: 1.3.1
- live runtime: 1.3.1 / 154 tools
- worktree: clean; `main == origin/main`
- Godot executable on current machine: not found in PATH/common locations at activation
- `Status-LConnect.cmd` and `Stop-LConnect.cmd`: both already contain plain `pause`; user reports their launched windows still close too quickly to read

## Godot scope

- detect a Godot project from `project.godot`
- report Godot as a supported build/development system
- expose Godot metadata in `project_info`
- keep public tool names unchanged
- extend `run_build`:
  - default Godot mode: headless import/validation
  - optional release/debug export with explicit preset + output path
- extend `run_tests`:
  - execute an explicit Godot test runner script through `--script`
  - no assumption that Godot core provides a project-level test framework
- extend `run_lint`:
  - perform headless project import/validation
- support explicit `godot_program`; otherwise use `GODOT_BIN` or PATH lookup name
- all execution remains managed-session based and bounded by existing process controls

Official CLI basis:
- `--path`, `--headless`, `--import`, `--script`, `--check-only`
- `--export-release` / `--export-debug` require export preset/output

## Operator CMD scope

Replace the fragile plain `pause` boundary in Status/Stop wrappers with a reusable hold helper:

- minimum delay before accepting a close key
- drain already-buffered key presses
- wait for an explicit key when console input is interactive
- fallback timed hold when console input is unavailable/redirection prevents key reads
- `--no-hold` wrapper option for automation/non-interactive use
- preserve the PowerShell script exit code
- Start/Refresh/restart behavior must remain unaffected

## Non-goals

- do not install Godot automatically
- do not assume an export preset or test framework
- do not move/overwrite v1.3.1, v1.3.0 or v1.2.2 tags/releases
- no force push/reset/clean
- no public MCP tool-count increase

## Qualification required

- Godot detection/project-info fixture
- Godot managed build/import fixture
- Godot explicit export argument contract
- Godot test-script managed session fixture
- Godot lint/validation fixture
- Node Development Module regression coverage
- Status/Stop wrapper no-hold + hold behavior fixture
- full local test suite + audit + diff check
- exact-commit CI
- tracked-only deployment preserving local state
- runtime restart because Development Module changes
- live 1.3.1 / 154 tools, no duplicates
- installed/live Godot detection acceptance with fixture
- installed Status/Stop operator wrapper acceptance
- source/install parity
