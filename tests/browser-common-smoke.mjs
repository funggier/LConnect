import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCommonLayer } from "../modules/browser-common.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const calls = [];
const fullCaps = ["start","attach","stop","tabs","navigate","snapshot","click","type","screenshot"];
const fakeFirefox = {
  capabilities: fullCaps,
  async start(args) { calls.push(["start", args]); return { handle: { native: "ff-managed-1" }, product: "FakeFirefox", capabilities: fullCaps }; },
  async attach(args) { calls.push(["attach", args]); return { handle: { native: "ff-attached-1" }, attached: true }; },
  async stop(handle, args) { calls.push(["stop", handle, args]); return { stopped: handle.native }; },
  async tabs(handle) { calls.push(["tabs", handle]); return { tabs: [{ id: "tab-1", title: "Example", url: "https://example.test/" }] }; },
  async navigate(handle, args) { calls.push(["navigate", handle, args]); return { tab_id: args.tab_id ?? "tab-1", url: args.url, state: args.wait }; },
  async snapshot(handle, args) { calls.push(["snapshot", handle, args]); return { tab_id: args.tab_id ?? "tab-1", text: "hello browser" }; },
  async click(handle, args) { calls.push(["click", handle, args]); return { clicked: args.target, button: args.button, click_count: args.click_count }; },
  async type(handle, args) { calls.push(["type", handle, args]); return { target: args.target, chars: args.text.length, clear: args.clear }; },
  async screenshot(handle, args) { calls.push(["screenshot", handle, args]); return { mime_type: "image/png", data_base64: "ZmFrZQ==", bytes: 4 }; },
};

const layer = new BrowserCommonLayer({ maxSessions: 4, resultLimitChars: 50000 });
const registered = layer.registerAdapter("firefox", fakeFirefox);
assert(registered.browser === "firefox" && registered.capabilities.length === 9, "registerAdapter capability mismatch");
console.log("adapter registration/capabilities: PASS");

const started = await layer.start({ browser: "firefox", url: "https://example.test/", headless: true, options: { profile: "test" } });
const sid = started.session.browser_session_id;
assert(sid.startsWith("browser-"), "public browser session id missing");
assert(started.session.browser === "firefox" && started.session.mode === "managed", "managed session metadata mismatch");
assert(!JSON.stringify(started).includes("ff-managed-1"), "private backend handle leaked");
console.log("browser_start registry/private handle: PASS");

const tabs = await layer.tabs({ browser_session_id: sid });
assert(tabs.result.tabs[0].id === "tab-1", "tabs result mismatch");
const nav = await layer.navigate({ browser_session_id: sid, url: "https://example.test/next", wait: "interactive", timeout_ms: 9000 });
assert(nav.result.url.endsWith("/next") && nav.result.state === "interactive", "navigate result mismatch");
const snap = await layer.snapshot({ browser_session_id: sid, target: "main", max_chars: 5000 });
assert(snap.result.text === "hello browser", "snapshot result mismatch");
const click = await layer.click({ browser_session_id: sid, target: "#go", button: "left", click_count: 2 });
assert(click.result.clicked === "#go" && click.result.click_count === 2, "click result mismatch");
const typed = await layer.type({ browser_session_id: sid, target: "#q", text: "ไทย ✓", clear: true });
assert(typed.result.chars === 5 && typed.result.clear === true, "type result mismatch");
const shot = await layer.screenshot({ browser_session_id: sid, full_page: true, max_bytes: 4096 });
assert(shot.result.mime_type === "image/png" && shot.result.bytes === 4, "screenshot result mismatch");
console.log("tabs/navigate/snapshot/click/type/screenshot dispatch: PASS");

const attached = await layer.attach({ browser: "firefox", endpoint: "ws://127.0.0.1:9000", options: { reuse: true } });
assert(attached.session.mode === "attached" && attached.result.attached === true, "attach result mismatch");
await layer.stop({ browser_session_id: attached.session.browser_session_id });
console.log("browser_attach/browser_stop: PASS");

const wrongSession = await (async () => {
  try { await layer.tabs({ browser_session_id: "browser-missing" }); return null; }
  catch (error) { return error; }
})();
assert(wrongSession?.message.includes("BROWSER_SESSION_NOT_FOUND"), "missing session error mismatch");
console.log("missing session error: PASS");

const limited = new BrowserCommonLayer();
limited.registerAdapter("chrome", {
  capabilities: ["start","stop"],
  async start() { return { handle: "chrome-handle" }; },
  async stop() { return {}; },
});
const chrome = await limited.start({ browser: "chrome" });
let capabilityError = null;
try { await limited.navigate({ browser_session_id: chrome.session.browser_session_id, url: "https://example.test/" }); }
catch (error) { capabilityError = error; }
assert(capabilityError?.message.includes("BROWSER_CAPABILITY_UNAVAILABLE"), "capability guard mismatch");
console.log("capability negotiation guard: PASS");

const unavailable = new BrowserCommonLayer();
let unavailableError = null;
try { await unavailable.start({ browser: "firefox" }); }
catch (error) { unavailableError = error; }
assert(unavailableError?.message.includes("BROWSER_BACKEND_UNAVAILABLE"), "unavailable backend error mismatch");
console.log("unavailable backend error: PASS");

const bounded = new BrowserCommonLayer({ resultLimitChars: 200 });
bounded.registerAdapter("firefox", {
  capabilities: ["start","stop","snapshot"],
  async start() { return { handle: "bounded" }; },
  async stop() { return {}; },
  async snapshot() { return { text: "x".repeat(500) }; },
});
const boundedSession = await bounded.start({ browser: "firefox" });
let boundError = null;
try { await bounded.snapshot({ browser_session_id: boundedSession.session.browser_session_id, max_chars: 1000 }); }
catch (error) { boundError = error; }
assert(boundError?.message.includes("BROWSER_RESULT_TOO_LARGE"), "result bound guard mismatch");
console.log("bounded adapter result: PASS");

await layer.stop({ browser_session_id: sid });
assert(calls.some((entry) => entry[0] === "stop"), "stop was not dispatched");
console.log("session cleanup: PASS");

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(Object.entries(process.env).filter(([,v]) => typeof v === "string"));
const transport = new StdioClientTransport({ command: process.execPath, args: ["lconnect-mcp.mjs"], cwd: root, env, stderr: "pipe" });
const client = new Client({ name: "lconnect-browser-common-smoke", version: "1.0.0" }, { capabilities: {} });
let serverStderr = "";
transport.stderr?.on("data", (c) => { serverStderr += c.toString("utf8"); });

try {
  await client.connect(transport);
  const catalogResult = await client.callTool({ name: "runtime_catalog", arguments: { include_names: true } });
  const catalogText = catalogResult.content?.find((x) => x.type === "text")?.text ?? "{}";
  const catalog = JSON.parse(catalogText);
  const expected = ["browser_start","browser_attach","browser_stop","browser_tabs","browser_navigate","browser_snapshot","browser_click","browser_type","browser_screenshot"];
  assert(catalog.tool_count === 148, `catalog expected 148 tools, got ${catalog.tool_count}`);
  for (const name of expected) assert(catalog.tool_names.includes(name), `catalog missing ${name}`);
  console.log("MCP browser common registration/catalog: PASS");

  const firefoxRegistered = await client.callTool({ name: "browser_attach", arguments: { browser: "firefox" } });
  const firefoxRegisteredText = firefoxRegistered.content?.find((x) => x.type === "text")?.text ?? "";
  assert(firefoxRegistered.isError === true && firefoxRegisteredText.includes("FIREFOX_ATTACH_REQUIRES_ENDPOINT"), "production Firefox adapter registration contract mismatch");
  console.log("MCP Firefox adapter registration contract: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (serverStderr) console.error("\nServer stderr:\n" + serverStderr);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
}
