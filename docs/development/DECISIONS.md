# LConnect Design Decisions

This file records decisions that future sessions should preserve unless there is new evidence strong enough to reopen them.

---

## D-001 — One main MCP channel

**Decision:** Keep ordinary LConnect capabilities behind the existing `main` MCP channel.

**Why:** ChatGPT tool discovery becomes simpler and modules can grow without tunnel topology churn.

---

## D-002 — Modular Core

**Decision:** Capabilities are modules registered into `lconnect-mcp.mjs`.

**Why:** New capability should not require redesigning tunnel/bootstrap.

---

## D-003 — Full-machine access by default

**Decision:** Filesystem access defaults to all paths available to the Windows account running LConnect.

**Why:** The intended use is local development/administration, not a strict sandbox.

**Boundary:** LConnect does not bypass Windows ACL/UAC.

---

## D-004 — Tunnel configuration is local-only

**Decision:** Never commit Tunnel ID, `mcp-conf.yaml`, Runtime API key or organization-specific secrets.

**Why:** Source distribution and tunnel ownership must stay independent.

---

## D-005 — tunnel-client minimum 0.0.14

**Decision:** LConnect requires OpenAI tunnel-client `0.0.14` or newer.

**Why:** Runtime evidence on 0.0.12 showed response-deadline failure followed by repeated `502 client_internal` for `tools/call` and `initialize`. Newer stdio recovery fixed the observed failure class.

---

## D-006 — /readyz is not MCP proof

**Decision:** Treat `/readyz` as startup readiness only.

**Why:** A tunnel-client process can be live/ready while stdio RPC is broken.

---

## D-007 — Long operations use session/job patterns

**Decision:** Avoid holding one MCP request open for long-running work when a session/job abstraction is practical.

**Why:** Caller-side tool timeouts can occur before LConnect's configurable command timeout.

---

## D-008 — System/Development foundation before GUI automation

**Decision:** Build Environment, Process, Services, Network, Hardware, Git and development primitives before deep Desktop/Browser automation.

**Why:** They provide greater reliability/value per implementation effort and reduce debugging ambiguity later.

---

## D-009 — Firefox is primary browser

**Decision:** Firefox is first-class and primary browser backend.

**Backend direction:** WebDriver BiDi; geckodriver/Marionette where useful.

**Why:** Primary user workflow uses Firefox.

---

## D-010 — Chrome is secondary browser

**Decision:** Support Chrome as a second first-class backend through CDP.

**Why:** Useful for development/debugging and cross-browser testing.

---

## D-011 — Edge is not required

**Decision:** Do not make Microsoft Edge a dependency or baseline for initial browser automation.

**Why:** It is not part of the intended primary workflow.

---

## D-012 — Browser API above backend adapters

**Decision:** User-facing browser tools should share a common session API; Firefox and Chrome specifics stay behind adapters or explicit backend-specific escape hatches.

**Why:** Calling code should not need to rewrite workflows for every browser.

---

## D-013 — Input automation is fallback, not DOM strategy

**Decision:** Browser DOM interaction should prefer browser protocols. Keyboard/mouse coordinates are for desktop interaction and fallback cases.

**Why:** DOM/protocol automation is more deterministic than screen-coordinate automation.
