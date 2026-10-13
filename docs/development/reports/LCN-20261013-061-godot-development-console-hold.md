# LCN-061 — Godot Development Support & Operator Console Hold UX

Date: 2026-10-13

Status: **COMPLETE / DEPLOYED / LIVE GREEN**

## Summary

LCN-061 extends the existing Development Module with Godot project awareness and managed execution while keeping the public MCP catalog unchanged at 154 tools. It also replaces the fragile plain `pause` boundary in `Status-LConnect.cmd` and `Stop-LConnect.cmd` with an explicit console-hold helper plus an automation-safe `--no-hold` mode.

## Implementation

Exact implementation commit:

`60f29eae79da3205161bffdf75cb5feefe7e6d4d`

Godot support:

- `project.godot` is first-class detection evidence
- optional `export_presets.cfg` evidence is reported
- `detect_build_system` reports Godot execution support
- `project_info` reports name, version, main scene, feature tags, export preset presence and .NET project evidence
- `run_build` defaults to headless import/validation
- `run_build` supports explicit release/debug export with preset + output path
- `run_tests` requires an explicit Godot script runner instead of assuming a built-in project test framework
- `run_lint` uses headless import/validation
- executable selection supports explicit `godot_program`, process `GODOT_BIN`, then PATH/default
- all execution continues through the managed process-session registry

Operator CMD support:

- added `scripts/Hold-LConnectConsole.ps1`
- Status/Stop wrappers no longer use plain `pause`
- minimum hold prevents an already-buffered key from instantly dismissing the result
- buffered keys are drained before waiting
- interactive consoles wait for an explicit key
- redirected/unavailable console input uses a timed fallback hold
- `--no-hold` returns immediately for automation
- original PowerShell exit code is preserved

## Qualification

Local full qualification:

- syntax check: PASS, 85 files
- full test runner: PASS, 40 Node + 3 PowerShell suites
- Godot detection/build-system/project-info: PASS
- Godot import/build managed session: PASS
- Godot release export argument contract: PASS
- Godot explicit test-runner contract: PASS
- Godot lint/import validation: PASS
- Status `--no-hold` + exit-code preservation: PASS
- Stop `--no-hold`: PASS
- default result-hold boundary: PASS
- redirected-input fallback hold: PASS
- public catalog: 154 tools, duplicate names none
- npm audit: 0 vulnerabilities
- git diff check: PASS

Exact-commit GitHub CI:

- LConnect CI #186
- run: `38326334790`
- exact SHA: `60f29eae79da3205161bffdf75cb5feefe7e6d4d`
- Windows Runtime smoke tests: SUCCESS
- Dependency audit: SUCCESS
- overall: SUCCESS

## Installed and live acceptance

Tracked-only deployment copied 268 tracked files with zero mismatch.

Installed targeted qualification:

- Godot Development smoke: PASS
- operator CMD smoke: PASS
- tool-surface smoke: PASS, 154 tools / no duplicates
- npm audit: 0 vulnerabilities

Physical installed Status acceptance:

- `Status-LConnect.cmd --no-hold`: exit code 0
- liveness/readiness/control-plane health: PASS
- default Status wrapper remained alive past 14 seconds
- non-interactive route explicitly reported a 15-second fallback hold
- wrapper then exited cleanly with code 0

Secure runtime restart:

- restart log: `logs/restart-20261013-071954.log`
- readiness: PASS
- live runtime qualification PID: 18340
- runtime: 1.3.1 / 154 tools
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- duplicate public tool names: none

Live Godot connector acceptance:

- disposable `project.godot` detected as primary type `godot`
- build system reported import/release/debug export operations
- project metadata parsed correctly
- process-only `GODOT_BIN` was temporarily pointed to a disposable fake CLI because Godot itself is not installed on this machine
- live `run_build(project_path)` executed the managed command:
  `--headless --path <project> --import`
- managed session exit code: 0
- temporary `GODOT_BIN` removed after acceptance
- disposable Godot fixture removed after acceptance

## Deployment integrity

Final implementation deployment snapshot before closure docs:

- source/install tracked parity: 268/268 exact
- manifest digest: `36ea87c2729811af4a8393e8b936d30bd439c9b33fa87391cdcf4e1c3d2a90a9`
- source/installed package version: 1.3.1
- preserved local paths: 6/6
- encrypted credential SHA-256 unchanged: `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`
- credential size: 880 bytes
- default `\LConnect Autostart`: absent

## Connector schema note

The user refreshed the connector before LCN-061 changed the Development tool schemas. The current conversation therefore may still display the older `run_build/run_tests/run_lint` argument schemas even though the restarted runtime is already running the new implementation. Refreshing the LConnect connector again exposes the new Godot-specific fields such as `godot_program`, export options and `godot_script`.

## Release integrity

LCN-061 is post-v1.3.1 mainline work. It does not move or replace v1.3.1, v1.3.0 or v1.2.2 tags/releases.
