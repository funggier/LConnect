import fs from "node:fs";
import http from "node:http";
import { once } from "node:events";
import { BrowserCommonLayer } from "../modules/browser-common.mjs";
import { registerChromeAdapter } from "../modules/browser-chrome.mjs";

function assert(condition, message) { if (!condition) throw new Error(message); }

const server = http.createServer((req, res) => {
  const html = `<!doctype html><html><head><title>LConnect Chrome Fixture</title></head><body>
  <main id="main"><h1>Chrome physical fixture</h1>
    <input id="q" value="old">
    <button id="go" onclick="document.querySelector('#out').textContent=document.querySelector('#q').value">Copy</button>
    <div id="out">pending</div>
  </main></body></html>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html) });
  res.end(html);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const port = server.address().port;
const url = `http://127.0.0.1:${port}/fixture`;

const layer = new BrowserCommonLayer();
registerChromeAdapter(layer);
let sid = null;
try {
  const started = await layer.start({
    browser: "chrome",
    url,
    headless: true,
    options: {
      chrome_binary: process.env.LCONNECT_CHROME_BINARY,
      startup_timeout_ms: 20000,
      timeout_ms: 10000,
    },
  });
  sid = started.session.browser_session_id;
  assert(started.result.product === "Chrome", "product mismatch");
  assert(started.result.managed_profile === true, "managed profile flag missing");
  assert(started.result.profile_mode === "temporary" && started.result.profile_owned === true, "Chrome profile ownership metadata mismatch");
  assert(started.result.profile_isolated === true && started.result.profile_cleanup_on_stop === true, "Chrome profile isolation metadata mismatch");
  console.log(`managed Chrome CDP/private profile start: PASS version=${started.result.browser_version} protocol=${started.result.protocol_version}`);

  const tabs = await layer.tabs({ browser_session_id: sid });
  assert(tabs.result.tabs.length >= 1 && tabs.result.tabs.some((x) => x.url === url), "fixture tab missing");
  console.log("physical Chrome tabs: PASS");

  const snap = await layer.snapshot({ browser_session_id: sid, target: "#main", max_chars: 10000 });
  assert(snap.result.mode === "dom" && snap.result.text.includes("Chrome physical fixture"), "snapshot mismatch");
  const ax = await layer.snapshot({ browser_session_id: sid, target: "#main", max_chars: 10000, mode: "accessibility" });
  assert(ax.result.mode === "accessibility" && ax.result.source === "cdp-accessibility" && Array.isArray(ax.result.nodes), "Chrome accessibility snapshot mismatch");
  console.log("physical Chrome DOM/accessibility snapshot: PASS");

  const typed = await layer.type({ browser_session_id: sid, target: "#q", text: "ภาษาไทย ✓", clear: true });
  assert(typed.result.input_backend === "cdp-input" && typed.result.value === "ภาษาไทย ✓", "Chrome CDP input typing mismatch");
  const inputState = await layer.snapshot({ browser_session_id: sid, target: "#q", max_chars: 5000 });
  assert(inputState.result.state?.value === "ภาษาไทย ✓", "Chrome live input state mismatch");
  console.log("physical Chrome Unicode CDP input + live state: PASS");

  const clicked = await layer.click({ browser_session_id: sid, target: "#go" });
  assert(clicked.result.input_backend === "cdp-input", "Chrome click did not use CDP Input");
  const out = await layer.snapshot({ browser_session_id: sid, target: "#out", max_chars: 5000 });
  assert(out.result.text === "ภาษาไทย ✓", `post-click output mismatch: ${out.result.text}`);
  console.log("physical Chrome CDP click/state: PASS");

  const shot = await layer.screenshot({ browser_session_id: sid, max_bytes: 1500000 });
  assert(shot.result.mime_type === "image/png" && shot.result.bytes > 1000 && shot.result.result_mode === "file", "screenshot mismatch");
  assert(fs.existsSync(shot.result.path) && shot.result.sha256.length === 64, "Chrome screenshot file/hash missing");
  fs.rmSync(shot.result.path, { force: true });
  console.log(`physical Chrome file-backed screenshot: PASS bytes=${shot.result.bytes}`);

  const full = await layer.screenshot({ browser_session_id: sid, full_page: true, max_bytes: 1500000, result_mode: "inline" });
  assert(full.result.bytes > 1000 && full.result.result_mode === "inline" && typeof full.result.data_base64 === "string", "full-page screenshot mismatch");
  console.log(`physical Chrome inline full-page screenshot: PASS bytes=${full.result.bytes}`);

  const noneNav = await layer.navigate({ browser_session_id: sid, url: url + "?none=1", wait: "none", timeout_ms: 30000 });
  assert(noneNav.result.ready_state === null && noneNav.result.wait === "none", "Chrome wait=none mismatch");
  const interactiveNav = await layer.navigate({ browser_session_id: sid, url: url + "?interactive=1", wait: "interactive", timeout_ms: 30000 });
  assert(["interactive","complete"].includes(interactiveNav.result.ready_state), "Chrome wait=interactive mismatch");
  const nav = await layer.navigate({ browser_session_id: sid, url, wait: "complete", timeout_ms: 30000 });
  assert(nav.result.ready_state === "complete" && nav.result.title === "LConnect Chrome Fixture", "navigate mismatch");
  console.log("physical Chrome navigate none/interactive/complete: PASS");
} finally {
  if (sid) {
    try {
      const stopped = await layer.stop({ browser_session_id: sid });
      assert(stopped.result.process_owned === true, "managed Chrome ownership mismatch");
      assert(stopped.result.profile_cleanup?.succeeded === true && stopped.result.profile_cleanup?.residue_exists === false, "Chrome profile cleanup evidence mismatch");
      console.log(`physical Chrome stop/cleanup: PASS owned=${stopped.result.process_owned}`);
    } catch (error) {
      console.error("physical Chrome stop: FAIL", error);
      process.exitCode = 1;
    }
  }
  server.close();
}
