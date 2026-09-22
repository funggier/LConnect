# LConnect Agent Operations Reliability Plan

Last updated: 2026-09-22

## Scope

แผนนี้กำหนดงานพัฒนาชุดเล็กถัดไปของ LConnect หลัง baseline v1.1.0 / 91 tools

เป้าหมายคือเพิ่ม **6 capability groups เท่านั้น** ก่อนกลับไปทำ Desktop Control และ Browser Automation:

1. LCN-025 — Managed Session Completion
2. LCN-026 — Incremental Process Output Cursor
3. LCN-027 — Structured Text Search
4. LCN-028 — File Integrity
5. LCN-029 — Exact Git Ref / Ancestry Safety
6. LCN-030 — GitHub Actions / Release Integration

งานนอก 6 กลุ่มนี้ เช่น Event Log, archive management, registry, screenshot, desktop automation และ browser automation **ไม่อยู่ใน scope ของ phase นี้**

---

# Why this phase is needed

LConnect v1.1.0 มีพื้นฐานที่ใช้ทำงานจริงได้แล้ว:

- filesystem
- PowerShell / direct command execution
- managed process sessions
- process tree / process identity
- Windows Services
- ports/network
- hardware
- Git
- project/build/test helpers
- HTTP
- log followers
- filesystem watchers
- Scheduled Tasks

จากการใช้งานจริงกับงานพัฒนาและ release ที่กินเวลานาน พบว่า limitation หลักตอนนี้ไม่ใช่ "ทำอะไรไม่ได้" แต่คือบาง workflow ยังต้องกลับไปใช้ raw PowerShell หรือ CLI เพื่อประกอบ orchestration ซ้ำ ๆ

ตัวอย่างที่พบจริง:

- process ยาวหลายสิบนาทีต้อง poll ด้วย `Start-Sleep -> read_process_output` ซ้ำหลายครั้ง
- process output มี `clear=true/false` แต่ยังไม่มี cursor/sequence semantics
- ค้นข้อความใน source ต้องใช้ `Select-String` หรือ external command
- เปรียบเทียบ source กับ installed payload ต้องใช้ `Get-FileHash` ผ่าน PowerShell
- release flow ต้องใช้ raw Git เพื่อพิสูจน์ `ls-remote`, ancestry และ exact ref
- GitHub Actions/Release ต้องใช้ `gh` CLI แล้ว parse output เอง
- upstream tool/UI timeout อาจเกิดขึ้นในขณะที่ process บนเครื่องยังทำงานต่อปกติ

ดังนั้นก่อนเพิ่ม GUI automation ควรทำให้ execution/release foundation มี semantics ที่ structured, bounded, resumable และพิสูจน์ผลได้ดีกว่านี้

---

# Product objective

LConnect ควรทำหน้าที่เป็น:

> direct MCP Plugin / general local-computer capability layer ที่ช่วยให้ AI ภายนอก เช่น ChatGPT, CogentNexus หรือ Zooid สามารถ inspect, act, wait, verify และติดตาม local operation ที่ใช้เวลานานได้อย่างมีโครงสร้าง

LConnect ควรช่วยให้ AI ทำงานยาวต่อเนื่องได้ โดยทำให้ operation ที่ AI สั่ง:

- เริ่มแล้วคืน control กลับได้เร็ว
- ทำงานต่อได้แม้ MCP request นั้นจบ
- รอผลแบบ bounded ได้
- อ่าน output ใหม่แบบ incremental ได้
- ตรวจสถานะซ้ำได้โดยไม่เสีย evidence
- terminate/cancel ได้อย่าง explicit

LConnect ไม่ควรกลายเป็น:

- autonomous agent runtime
- workflow/ticket orchestrator
- planner
- persistent task memory
- continuation engine ที่เลือกงานถัดไปเอง
- wrapper เฉพาะ CogentNexus
- wrapper เฉพาะ OpenClaw
- command collection ที่ duplicate shell โดยไม่มี structured semantics เพิ่ม
- secret store
- system ที่ซ่อน destructive behavior หลัง convenience API
- GUI automation stack ที่เพิ่มก่อน execution foundation เสถียรพอ

AI/caller เป็นผู้ตัดสินใจว่า “ทำอะไรต่อ” ส่วน LConnect มีหน้าที่ทำให้ operation ที่ถูกสั่งมี lifecycle/evidence ที่เชื่อถือได้

Raw shell ยังคงอยู่เป็น escape hatch แต่ operation ที่ใช้ซ้ำบ่อยและมี contract ที่ชัดควรมี structured tool

---

# Architecture direction

```text
ChatGPT / Agent
      |
OpenAI Tunnel
      |
main MCP channel
      |
LConnect Core
      |
      +-- Filesystem
      +-- Shell
      +-- Managed Process Sessions
      +-- System / Network / Hardware
      +-- Git / Development / HTTP
      +-- Observation
      |
      +-- Agent Operations Reliability
      |     +-- session completion
      |     +-- incremental process output
      |     +-- structured text search
      |     +-- file integrity
      |     +-- exact Git refs / ancestry
      |     +-- GitHub Actions / Release
      |
      +-- Desktop Control        (after this phase)
      +-- Browser Automation    (after this phase)
```

Phase นี้ต้อง reuse Core/runtime/session registry ที่มีอยู่เดิม ไม่สร้าง tunnel channel ใหม่ และไม่สร้าง lifecycle model ซ้ำโดยไม่จำเป็น

---

# Cross-cutting requirements

ทุก task LCN-025–030 ต้องรักษากฎต่อไปนี้

## Structured output

ผลลัพธ์ที่ agent ต้องนำไปตัดสินใจต่อควรเป็น machine-readable structure ไม่ใช่ human text อย่างเดียว

## Bounded by default

ทุก wait/search/read/output/remote request ต้องมีขอบเขต:

- timeout
- max events
- max matches
- max bytes
- bounded output tail

ห้ามแก้ timeout problem ด้วยการเพิ่ม timeout อย่างเดียว

## Local operation outlives one MCP request

MCP request lifetime ไม่ใช่ lifecycle authority ของ local process

รูปแบบที่ต้องการคือ:

```text
AI starts explicit local operation
  -> LConnect returns session identity quickly
  -> local process continues independently of that one MCP request
  -> AI calls bounded wait/read again when useful
  -> LConnect returns terminal status/evidence
  -> AI decides the next action
```

Session identity เป็น handle ของ direct Plugin operation ไม่ใช่ autonomous workflow/job graph

LConnect ไม่เลือกขั้นตอนถัดไปเอง และไม่ต้องมี planner หรือ durable task memory เพื่อให้ AI ทำงานยาวขึ้น

## Exact identity before mutation

ตัวอย่าง identity ที่มีอยู่แล้ว:

- process = PID + creation time
- Windows service = exact service Name
- Scheduled Task = exact task path + task name

Git/GitHub capability ใหม่ต้องใช้หลักเดียวกัน เช่น exact ref/SHA และ explicit target

## No hidden force

- no implicit force push
- no wildcard destructive ref target
- no silent overwrite
- no hidden credential persistence
- no automatic privilege escalation

## Preserve root cause

failure ต้องเก็บข้อมูลที่ช่วย diagnosis เช่น exit code, stderr summary, HTTP status, Git stderr หรือ GitHub API message โดยไม่ทำให้ output unbounded

## Backward compatibility

ของใหม่ต้องเสริมของเดิม:

- `read_process_output` ยังคงใช้งานได้
- `git_push` ยังคง non-force
- filesystem scope ยัง apply กับ tools ใหม่
- tunnel profile / API key ยัง local-only
- existing 91-tool baseline ต้องไม่ regression

---

# Development order

```text
LCN-025 Managed Session Completion
  ↓
LCN-026 Incremental Process Output Cursor
  ↓
LCN-027 Structured Text Search
  ↓
LCN-028 File Integrity
  ↓
LCN-029 Exact Git Ref / Ancestry Safety
  ↓
LCN-030 GitHub Actions / Release Integration
  ↓
return to LCN-018–023 Desktop / Browser roadmap
```

เหตุผลที่เริ่มจาก process/session ก่อน เพราะ LCN-030 และ workflow automation ภายหลังจะได้ใช้ completion/cursor semantics ที่ผ่านการพิสูจน์แล้ว

---

# LCN-025 — Managed Session Completion

## Problem

`start_process` ทำให้ LConnect เริ่มงานยาวโดยไม่ block MCP call ได้แล้ว แต่ caller ยังต้องเขียน polling loop เองเพื่อรอ terminal result

รูปแบบปัจจุบัน:

```text
start_process
  -> sleep
  -> read_process_output
  -> sleep
  -> read_process_output
  -> ...
```

ปัญหา:

- ใช้ tool calls มาก
- orchestration ซ้ำ
- เพิ่มโอกาส UI/request timeout
- caller ต้องนิยาม timeout semantics เอง
- terminal result อาจถูกตรวจช้ากว่าที่จำเป็น

## Proposed primary tool

`wait_session`

Suggested input:

```json
{
  "session_id": "proc-...",
  "timeout_seconds": 30,
  "poll_interval_ms": 500,
  "include_output_tail": true,
  "output_tail_chars": 20000
}
```

Suggested result:

```json
{
  "session_id": "proc-...",
  "running": false,
  "completed": true,
  "timed_out": false,
  "exit_code": 0,
  "signal": null,
  "elapsed_ms": 8123,
  "stdout_tail": "...",
  "stderr_tail": ""
}
```

## Required semantics

- wait ต่อ call ต้อง bounded
- wait timeout ห้าม terminate child
- session ต้องทำงานต่อหลัง caller timeout
- caller เรียก wait ซ้ำได้
- terminal session query ต้อง idempotent
- unknown/expired session ต้อง error ชัด
- output tail bounded
- ไม่แทนที่ `terminate_process`
- ไม่เปลี่ยน `start_process` contract โดยไม่จำเป็น

## Acceptance

- zero-exit process
- nonzero exit preserved
- timeout while child remains alive
- repeated wait observes eventual completion
- terminal session query repeatable
- stdin session compatibility
- existing process tests remain green

---

# LCN-026 — Incremental Process Output Cursor

## Problem

`read_process_output(clear=true/false)` ใช้งานได้ แต่ evidence-heavy workflow ยังไม่ดีเท่า cursor model ของ Log Tail / File Watcher

ปัญหา:

- `clear=true` consume evidence
- `clear=false` อ่านข้อมูลซ้ำ
- ไม่มี stable sequence cursor
- stdout/stderr ordering ข้ามหลาย reads พิสูจน์ยาก
- ไม่มี overflow metadata

## Proposed primary tool

`read_process_events`

Optional status helper ถ้าจำเป็น:

`process_session_status`

Suggested event:

```json
{
  "seq": 42,
  "stream": "stdout",
  "text": "Gateway healthy\n",
  "observed_at": "2026-09-22T10:15:20.000Z"
}
```

Suggested read result:

```json
{
  "session_id": "proc-...",
  "after_seq": 38,
  "last_seq": 45,
  "events": [],
  "running": true,
  "exit_code": null,
  "overflowed": false,
  "dropped_through_seq": null
}
```

## Architecture

Reuse semantics จาก:

- `read_log_events`
- `watch_events`

Process session registry ควรมี bounded ring buffer พร้อม monotonically increasing sequence

`read_process_output` ต้องยังคงอยู่เพื่อ compatibility

## Acceptance

- sequence เพิ่มเสมอ
- cursor read ไม่ repeat event
- stdout/stderr identity preserved
- output ordering deterministic ตาม observation order
- overflow explicit
- child exit status ไม่สูญหาย
- memory bounded under large output
- existing API remains usable

---

# LCN-027 — Structured Text Search

## Problem

`search_files` ค้น path/name ได้ แต่ code diagnosis ต้องค้น content บ่อยมาก เช่น symbol, error text, config key หรือ function name

ปัจจุบันต้องกลับไปใช้:

- `Select-String`
- `findstr`
- `rg`

ทำให้ caller ต้องประกอบ shell command และ parse human output เอง

## Proposed primary tool

`search_text`

Suggested input:

```json
{
  "path": "T:\\project",
  "query": "gateway_health",
  "regex": false,
  "case_sensitive": false,
  "file_glob": "**/*.py",
  "exclude_patterns": ["node_modules/**", ".git/**"],
  "context_lines": 3,
  "max_matches": 100,
  "max_file_bytes": 5242880,
  "max_total_bytes": 52428800
}
```

Suggested match:

```json
{
  "path": "skills/example.py",
  "line": 123,
  "column": 7,
  "text": "gateway_health()",
  "before": [],
  "after": []
}
```

## Required semantics

- literal/regex modes explicit
- case sensitivity explicit
- include/exclude filtering
- bounded matches and bytes
- binary files skipped/reported
- Unicode/Thai safe
- per-file read/encoding failure visible
- filesystem access policy enforced
- external ripgrep may be optimization but must not become required runtime dependency unless explicitly decided

## Acceptance

- literal search
- regex search
- Unicode/Thai fixture
- case-sensitive and insensitive
- glob include/exclude
- context lines
- binary skip
- truncation/limit metadata
- restricted path rejection

---

# LCN-028 — File Integrity

## Problem

deployment/release/recovery flows ต้องพิสูจน์ file identity บ่อย:

- source vs installed
- before vs after repair
- release archive
- downloaded asset
- backup parity

ปัจจุบันต้องใช้ `Get-FileHash` ผ่าน PowerShell ซ้ำ

## Proposed tools

- `file_hash`
- `compare_files`

## file_hash result

ควรมีอย่างน้อย:

- path
- algorithm
- file size
- digest
- modified time

Default algorithm: SHA-256

## compare_files result

ควรมี:

- equal
- size_equal
- digest_equal
- left evidence
- right evidence

## Required semantics

- stream file; ไม่โหลด large file ทั้งก้อน
- SHA-256 default
- filesystem scope enforced
- no weak digest as default
- symbolic link / reparse behavior documented
- missing file error clear
- file changed during hashing ควรถูกรายงานเป็น uncertainty ถ้าตรวจได้

## Acceptance

- known SHA-256 fixture
- empty file
- large streamed file
- same content = equal
- different content = unequal
- same-size different-content
- source/installed fixture
- restricted path rejection

---

# LCN-029 — Exact Git Ref / Ancestry Safety

## Problem

Git module ปัจจุบันครอบคลุม common workflow แล้ว แต่ release flow ยังต้องกลับไป raw Git สำหรับ:

- remote exact ref lookup
- exact tag/branch SHA proof
- ancestry proof
- exact ref fast-forward
- source SHA -> destination ref push

ตัวอย่าง command ที่ยังต้องใช้:

```text
git ls-remote
git merge-base --is-ancestor
git push origin <sha>:refs/heads/main
```

## Proposed tools

Minimum capability set:

- `git_remote_ref`
- `git_is_ancestor`
- `git_push_ref`

### git_remote_ref

อ่าน exact remote ref เช่น:

```text
refs/heads/main
refs/tags/v0.9.6
```

ต้องไม่ใช้ wildcard mutation

### git_is_ancestor

รับ exact commit-ish สองตัวและคืน structured boolean + resolved SHAs

### git_push_ref

ใช้สำหรับ explicit source -> destination ref

ตัวอย่าง:

```json
{
  "repo_path": "...",
  "remote": "origin",
  "source": "abc123...",
  "destination": "refs/heads/main",
  "require_fast_forward": true
}
```

## Safety contract

- no force option ใน first contract
- destination ต้องเป็น full explicit ref
- default require fast-forward
- return before/after remote SHA
- reject ambiguous source
- tag mutationควร read-only ใน first version เว้นแต่แยก contract ชัดเจนในอนาคต
- preserve existing `git_push`

## Acceptance

- local bare remote fixture
- remote ref read
- ancestor true/false
- fast-forward exact SHA push
- non-fast-forward rejection
- invalid/ambiguous ref rejection
- remote SHA before/after evidence
- no force path

---

# LCN-030 — GitHub Actions / Release Integration

## Problem

งาน release ปัจจุบันต้องใช้ `gh` ผ่าน PowerShell เพื่อ:

- list Actions runs
- inspect run/jobs
- wait for terminal state
- retrieve failed logs
- dispatch workflow
- inspect GitHub Release
- download release assets
- verify release metadata

แม้ `gh` CLI จะใช้ได้ดี แต่ agent ต้องสร้าง command, parse JSON/text และจัด polling loopเองทุกครั้ง

## Goal

เพิ่ม structured GitHub capability สำหรับ **Actions + Release เท่านั้น** ใน phase นี้

ไม่ขยายเป็น generic GitHub management API ทั้งหมด

## Proposed minimum tools

- `github_run_list`
- `github_run_view`
- `github_run_wait`
- `github_run_failed_logs`
- `github_workflow_dispatch`
- `github_release_view`
- `github_release_download`

## Authentication model

Preferred first implementation:

- reuse authenticated `gh` CLI if available
- LConnect ไม่เก็บ GitHub token ใหม่เอง
- tool ต้อง report authentication prerequisite ชัดเจน
- ห้าม echo token/credential
- future direct GitHub API backend สามารถเพิ่มได้ภายหลังโดยคง tool contract

## github_run_wait

ควรเป็น bounded wait semantics เช่นเดียวกับ LCN-025:

- timeout ไม่ cancel workflow
- caller เรียกซ้ำได้
- terminal result idempotent
- jobs summary structured

## github_workflow_dispatch

ต้อง require:

- exact repository
- exact workflow identity
- explicit inputs

หลัง dispatch ควรคืน run correlation evidence เท่าที่ GitHub API/CLI ให้ได้

## github_release_view

ควรคืน:

- tag
- target commitish
- draft/prerelease
- published time
- URL
- asset names/sizes/digests

## github_release_download

ควร:

- require explicit release/tag + asset name
- obey LConnect filesystem scope
- default no overwrite
- bounded maximum size
- atomic temp-file replacement
- optionally return SHA-256 after download

## Non-goals

ไม่ทำใน LCN-030:

- issues
- pull request authoring
- repository settings
- collaborator management
- secret management
- generic arbitrary GitHub REST mutation

## Acceptance

- use disposable/test repository or safe fixture path where practical
- list/view known run
- bounded wait terminal success/failure
- failed-log bounded output
- workflow dispatch with explicit inputs
- release metadata read
- asset download + digest evidence
- unauthenticated state reports clear prerequisite
- credentials never appear in MCP output
- existing Git tools remain independent

---

# Testing strategy

## Unit / contract tests

แต่ละ task ต้องทดสอบ:

- input validation
- bounds
- stable structured output
- error preservation
- identity semantics
- no hidden mutation

## Disposable integration tests

ใช้ disposable process/files/repository เพื่อพิสูจน์ behavior จริง

ห้ามให้ CI tests destructive ต่อ user repository จริง

## Windows runtime acceptance

หลัง implementation แต่ละ task:

1. `npm run check`
2. focused smoke test
3. full `npm test`
4. `npm audit --audit-level=moderate`
5. restart LConnect
6. refresh tool catalog
7. direct MCP call acceptance บนเครื่องจริง
8. GitHub CI PASS
9. update task/status/report with exact commit and evidence

## Regression rule

ถ้า tool ใหม่แก้ shared runtime/session registry ต้อง rerun existing session/process/development tests ที่เกี่ยวข้อง ไม่ใช่เฉพาะ test ของ tool ใหม่

---

# Documentation requirements

เมื่อแต่ละ task เสร็จต้องอัปเดต:

- `docs/TOOLS_TH.md`
- `docs/DEVELOPMENT_TH.md` ถ้า architecture/extension rule เปลี่ยน
- `docs/development/ACTIVE.md`
- `docs/development/STATUS.md`
- `docs/development/TASK_INDEX.md`
- task file
- completion report

ถ้าเกิด architecture decision ใหม่ให้เพิ่ม `DECISIONS.md`

---

# Definition of Done for this phase

Agent Operations Reliability phase ถือว่า COMPLETE เมื่อ:

- LCN-025–030 COMPLETE ทุก task
- tool catalog ผ่าน full MCP discovery
- existing tools ไม่ regression
- long-running process workflow ใช้ bounded wait/cursor ได้โดยไม่ต้องสร้าง sleep loop ซ้ำ
- source search ไม่ต้องพึ่ง shell สำหรับ common case
- file parity/hash มี structured primitive
- exact Git ancestry/ref release workflow ไม่ต้องพึ่ง raw Git สำหรับ common case
- GitHub Actions/Release common workflow ไม่ต้องพึ่ง raw `gh` parsing สำหรับ common case
- Windows runtime acceptance PASS
- GitHub CI PASS
- documentation/current handoff สอดคล้อง

หลังจากนั้น roadmap จึงกลับไป:

```text
LCN-018 Clipboard
LCN-019 Window Control
LCN-020 Keyboard / Mouse
LCN-021 Browser Common Layer
LCN-022 Firefox Adapter
LCN-023 Chrome Adapter
```

---

# Final direction test

ก่อนเพิ่ม capability ใน phase นี้ ให้ถามว่า:

> สิ่งนี้ช่วยให้ AI ที่ใช้ LConnect ทำ operation ยาวได้ต่อเนื่องขึ้น รอ/อ่านผลได้ดีขึ้น รักษาหลักฐานได้ดีขึ้น หรือ reduce raw-shell orchestration โดยที่ LConnect ยังเป็น direct Plugin อยู่หรือไม่?

ถ้าความสามารถนั้นต้องการให้ LConnect วางแผนงาน, เลือก next step, เก็บ workflow graph หรือ resume task autonomously ให้ย้าย responsibility นั้นไป caller/controller layer แทน

ถ้าไม่ใช่ dependency ของ LCN-025–030 ให้แยกเป็น future task แทนการขยาย scope ของ phase นี้
