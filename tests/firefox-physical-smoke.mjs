import fs from "node:fs";
import http from "node:http";
import { once } from "node:events";
import { BrowserCommonLayer } from "../modules/browser-common.mjs";
import { registerFirefoxAdapter } from "../modules/browser-firefox.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = http.createServer((req, res) => {
  const html = `<!doctype html><html><head><title>LConnect Firefox Fixture</title></head><body>
  <main id="main"><h1>Firefox physical fixture</h1>
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
registerFirefoxAdapter(layer);
let sid = null;

try {
  const started = await layer.start({
    browser: "firefox",
    url,
    headless: true,
    options: {
      geckodriver_path: process.env.LCONNECT_GECKODRIVER,
      firefox_binary: process.env.LCONNECT_FIREFOX_BINARY,
      startup_timeout_ms: 20000,
      session_timeout_ms: 30000,
      navigation_timeout_ms: 30000,
    },
  });
  sid = started.session.browser_session_id;
  assert(started.result.product === "Firefox", "product mismatch");
  assert(started.result.bidi_available === true, "WebDriver BiDi webSocketUrl was not negotiated");
  assert(started.result.managed_profile === true, "managed profile flag missing");
  assert(started.result.profile_mode === "temporary" && started.result.profile_owned === true, "Firefox profile ownership metadata mismatch");
  assert(started.result.profile_isolated === true && started.result.profile_cleanup_on_stop === true, "Firefox profile isolation metadata mismatch");
  console.log(`managed Firefox start + BiDi/private profile: PASS version=${started.result.browser_version}`);

  const tabs = await layer.tabs({ browser_session_id: sid });
  assert(tabs.result.tabs.length >= 1 && tabs.result.tabs.some((x) => x.url === url), "fixture tab missing");
  console.log("physical tabs: PASS");

  const snap = await layer.snapshot({ browser_session_id: sid, target: "#main", max_chars: 10000 });
  assert(snap.result.mode === "dom" && snap.result.text.includes("Firefox physical fixture"), "fixture snapshot mismatch");
  const ax = await layer.snapshot({ browser_session_id: sid, target: "#main", max_chars: 10000, mode: "accessibility" });
  assert(ax.result.mode === "accessibility" && ax.result.source === "dom-accessibility-projection" && Array.isArray(ax.result.nodes), "Firefox accessibility snapshot mismatch");
  console.log("physical DOM/accessibility snapshot: PASS");

  const typed = await layer.type({ browser_session_id: sid, target: "#q", text: "ภาษาไทย ✓", clear: true });
  assert(typed.result.typed === true, "physical type failed");
  const inputState = await layer.snapshot({ browser_session_id: sid, target: "#q", max_chars: 5000 });
  assert(inputState.result.state?.value === "ภาษาไทย ✓", "Firefox live input state mismatch");
  console.log("physical Unicode type + live state: PASS");

  const clicked = await layer.click({ browser_session_id: sid, target: "#go" });
  assert(clicked.result.clicked === true, "physical click failed");
  console.log("physical DOM click: PASS");

  const out = await layer.snapshot({ browser_session_id: sid, target: "#out", max_chars: 5000 });
  assert(out.result.text === "ภาษาไทย ✓", `post-click output mismatch: ${out.result.text}`);
  console.log("physical DOM state verification: PASS");

  const shot = await layer.screenshot({ browser_session_id: sid, max_bytes: 1500000 });
  assert(shot.result.mime_type === "image/png" && shot.result.bytes > 1000 && shot.result.result_mode === "file", "physical screenshot mismatch");
  assert(fs.existsSync(shot.result.path) && shot.result.sha256.length === 64, "physical screenshot file/hash missing");
  fs.rmSync(shot.result.path, { force: true });
  console.log(`physical file-backed screenshot: PASS bytes=${shot.result.bytes}`);

  const noneNav = await layer.navigate({ browser_session_id: sid, url: url + "?none=1", wait: "none", timeout_ms: 30000 });
  assert(noneNav.result.ready_state === null && noneNav.result.wait === "none", "Firefox wait=none mismatch");
  const interactiveNav = await layer.navigate({ browser_session_id: sid, url: url + "?interactive=1", wait: "interactive", timeout_ms: 30000 });
  assert(["interactive","complete"].includes(interactiveNav.result.ready_state), "Firefox wait=interactive mismatch");
  const nav = await layer.navigate({ browser_session_id: sid, url, wait: "complete", timeout_ms: 30000 });
  assert(nav.result.ready_state === "complete" && nav.result.title === "LConnect Firefox Fixture", "physical navigate mismatch");
  console.log("physical navigate none/interactive/complete semantics: PASS");
} finally {
  if (sid) {
    try {
      const stopped = await layer.stop({ browser_session_id: sid });
      assert(stopped.result.webdriver_session_deleted === true, "managed Firefox session was not deleted");
      assert(stopped.result.profile_cleanup?.succeeded === true && stopped.result.profile_cleanup?.residue_exists === false, "Firefox profile cleanup evidence mismatch");
      console.log(`physical stop/cleanup: PASS deleted=${stopped.result.webdriver_session_deleted}`);
    } catch (error) {
      console.error("physical stop: FAIL", error);
      process.exitCode = 1;
    }
  }
  server.close();
}
