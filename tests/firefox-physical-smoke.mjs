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
  console.log(`managed Firefox start + BiDi: PASS version=${started.result.browser_version}`);

  const tabs = await layer.tabs({ browser_session_id: sid });
  assert(tabs.result.tabs.length >= 1 && tabs.result.tabs.some((x) => x.url === url), "fixture tab missing");
  console.log("physical tabs: PASS");

  const snap = await layer.snapshot({ browser_session_id: sid, target: "#main", max_chars: 10000 });
  assert(snap.result.text.includes("Firefox physical fixture"), "fixture snapshot mismatch");
  console.log("physical DOM snapshot: PASS");

  const typed = await layer.type({ browser_session_id: sid, target: "#q", text: "ภาษาไทย ✓", clear: true });
  assert(typed.result.typed === true, "physical type failed");
  console.log("physical Unicode type: PASS");

  const clicked = await layer.click({ browser_session_id: sid, target: "#go" });
  assert(clicked.result.clicked === true, "physical click failed");
  console.log("physical DOM click: PASS");

  const out = await layer.snapshot({ browser_session_id: sid, target: "#out", max_chars: 5000 });
  assert(out.result.text === "ภาษาไทย ✓", `post-click output mismatch: ${out.result.text}`);
  console.log("physical DOM state verification: PASS");

  const shot = await layer.screenshot({ browser_session_id: sid, max_bytes: 1500000 });
  assert(shot.result.mime_type === "image/png" && shot.result.bytes > 1000, "physical screenshot mismatch");
  console.log(`physical screenshot: PASS bytes=${shot.result.bytes}`);

  const nav = await layer.navigate({ browser_session_id: sid, url, wait: "complete", timeout_ms: 30000 });
  assert(nav.result.ready_state === "complete" && nav.result.title === "LConnect Firefox Fixture", "physical navigate mismatch");
  console.log("physical navigate/readyState: PASS");
} finally {
  if (sid) {
    try {
      const stopped = await layer.stop({ browser_session_id: sid });
      console.log(`physical stop: PASS deleted=${stopped.result.webdriver_session_deleted}`);
    } catch (error) {
      console.error("physical stop: FAIL", error);
      process.exitCode = 1;
    }
  }
  server.close();
}
