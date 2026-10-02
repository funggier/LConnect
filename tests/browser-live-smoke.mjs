import { BrowserLiveLayer } from "../modules/browser-live.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const calls = [];
const runner = async (operation, payload) => {
  calls.push([operation, payload]);
  if (operation === "attach") {
    return {
      pid: payload.pid || 4242,
      hwnd: "0x1234",
      title: "Fixture Browser",
      process_name: payload.browser,
      backend: "windows-uia",
      remote_automation: false,
      profile_access: "none",
    };
  }
  if (operation === "tabs") {
    return { count: 2, tabs: [
      { index: 0, name: "One", selected: true, enabled: true, automation_id: "" },
      { index: 1, name: "Two", selected: false, enabled: true, automation_id: "" },
    ] };
  }
  if (operation === "snapshot") {
    return { pid: payload.pid, title: "Fixture Browser", returned: 1, truncated: false, elements: [
      { control_type: "Button", name: "Go", automation_id: "go", enabled: true },
    ] };
  }
  if (operation === "click") {
    return { clicked: true, action: "invoke", name: payload.name, automation_id: payload.automation_id || "" };
  }
  if (operation === "type") {
    return { typed: true, name: payload.name, chars: payload.text.length, cleared: payload.clear, value: payload.text };
  }
  throw new Error("unexpected operation " + operation);
};

const layer = new BrowserLiveLayer({ runner, maxSessions: 2 });
const attached = await layer.attach({ browser: "firefox", pid: 4242 });
const sid = attached.session.browser_live_session_id;

assert(sid.startsWith("browser-live-"), "live session id missing");
assert(attached.session.mode === "live", "live mode missing");
assert(attached.session.backend === "windows-uia", "live backend mismatch");
assert(attached.session.remote_automation === false, "live mode must never enable remote automation");
assert(attached.session.profile_access === "none", "live mode must not access browser profile");
assert(!JSON.stringify(attached).includes("webdriver"), "live attach leaked WebDriver concept");
console.log("browser_live_attach safety metadata: PASS");

const tabs = await layer.tabs({ browser_live_session_id: sid });
assert(tabs.result.count === 2 && tabs.result.tabs[0].selected === true, "live tabs mismatch");
console.log("browser_live_tabs: PASS");

const snapshot = await layer.snapshot({ browser_live_session_id: sid, max_elements: 20, name_contains: "Go" });
assert(snapshot.result.elements[0].name === "Go", "live snapshot mismatch");
console.log("browser_live_snapshot: PASS");

const clicked = await layer.click({
  browser_live_session_id: sid,
  name: "Go",
  control_type: "Button",
  exact: true,
});
assert(clicked.result.clicked === true && clicked.result.action === "invoke", "live click mismatch");
console.log("browser_live_click: PASS");

const typed = await layer.type({
  browser_live_session_id: sid,
  name: "Search",
  control_type: "Edit",
  text: "ภาษาไทย ✓",
  clear: true,
});
assert(typed.result.typed === true && typed.result.value === "ภาษาไทย ✓", "live type mismatch");
console.log("browser_live_type: PASS");

const stopped = layer.stop({ browser_live_session_id: sid });
assert(stopped.result.detached_only === true, "live stop must detach only");
assert(stopped.result.browser_process_untouched === true, "live stop must not close browser");
console.log("browser_live_stop non-destructive: PASS");

let missing = null;
try { await layer.tabs({ browser_live_session_id: sid }); }
catch (error) { missing = error; }
assert(missing?.message.includes("LIVE_BROWSER_SESSION_NOT_FOUND"), "live missing-session guard mismatch");

for (const [operation, payload] of calls) {
  assert(!Object.hasOwn(payload, "endpoint"), operation + " unexpectedly received endpoint");
  assert(!Object.hasOwn(payload, "profile"), operation + " unexpectedly received profile");
  assert(!Object.hasOwn(payload, "user_data_dir"), operation + " unexpectedly received user_data_dir");
}
console.log("live safety boundary/no endpoint-profile state: PASS");
