import http from "node:http";
import { once } from "node:events";
import { BrowserCommonLayer } from "../modules/browser-common.mjs";
import { FirefoxAdapter, registerFirefoxAdapter } from "../modules/browser-firefox.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sessionId = "mock-session";
const tabA = "tab-a";
const tabB = "tab-b";
let currentTab = tabA;
let currentUrl = "https://example.test/";
let typedText = "";
let clicked = false;

function json(res, status, value) {
  const body = JSON.stringify({ value });
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  let body = null;
  if (req.method !== "GET" && req.method !== "DELETE") {
    let raw = "";
    req.setEncoding("utf8");
    for await (const chunk of req) raw += chunk;
    body = raw ? JSON.parse(raw) : {};
  }

  const p = req.url;
  if (req.method === "GET" && p === `/session/${sessionId}/url`) return json(res, 200, currentUrl);
  if (req.method === "GET" && p === `/session/${sessionId}/window/handles`) return json(res, 200, [tabA, tabB]);
  if (req.method === "GET" && p === `/session/${sessionId}/window`) return json(res, 200, currentTab);
  if (req.method === "POST" && p === `/session/${sessionId}/window`) { currentTab = body.handle; return json(res, 200, null); }
  if (req.method === "GET" && p === `/session/${sessionId}/title`) return json(res, 200, currentTab === tabA ? "Alpha" : "Beta");
  if (req.method === "POST" && p === `/session/${sessionId}/timeouts`) return json(res, 200, null);
  if (req.method === "POST" && p === `/session/${sessionId}/url`) { currentUrl = body.url; return json(res, 200, null); }
  if (req.method === "POST" && p === `/session/${sessionId}/execute/sync`) {
    if (String(body.script).includes("document.readyState")) return json(res, 200, "complete");
    return json(res, 200, { url: currentUrl, title: "Mock", target: body.args[0] ?? null, text: "hello", html: "<main>hello</main>" });
  }
  if (req.method === "POST" && p === `/session/${sessionId}/element`) return json(res, 200, { "element-6066-11e4-a52e-4f735466cecf": "el-1" });
  if (req.method === "POST" && p === `/session/${sessionId}/element/el-1/click`) { clicked = true; return json(res, 200, null); }
  if (req.method === "POST" && p === `/session/${sessionId}/element/el-1/clear`) { typedText = ""; return json(res, 200, null); }
  if (req.method === "POST" && p === `/session/${sessionId}/element/el-1/value`) { typedText += body.text; return json(res, 200, null); }
  if (req.method === "GET" && p === `/session/${sessionId}/screenshot`) return json(res, 200, Buffer.from("fakepng").toString("base64"));
  if (req.method === "GET" && p === `/session/${sessionId}/moz/screenshot/full`) return json(res, 200, Buffer.from("fullpng").toString("base64"));
  if (req.method === "DELETE" && p === `/session/${sessionId}`) return json(res, 200, null);

  return json(res, 404, { error: "unknown command", message: `${req.method} ${p}` });
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
const endpoint = `http://127.0.0.1:${address.port}`;

try {
  const layer = new BrowserCommonLayer();
  const registration = registerFirefoxAdapter(layer);
  assert(registration.browser === "firefox" && registration.capabilities.length === 9, "Firefox registration mismatch");
  console.log("Firefox adapter registration/capabilities: PASS");

  const attached = await layer.attach({ browser: "firefox", endpoint, options: { session_id: sessionId } });
  const sid = attached.session.browser_session_id;
  assert(attached.result.attached === true && attached.result.tab_count === 2, "attach mismatch");
  assert(!JSON.stringify(attached).includes(sessionId), "private native Firefox session id leaked");
  console.log("Firefox deterministic attach/private handle: PASS");

  const tabs = await layer.tabs({ browser_session_id: sid });
  assert(tabs.result.tabs.length === 2 && tabs.result.tabs[0].active === true, "tabs mismatch");
  assert(currentTab === tabA, "tabs did not restore original tab");
  console.log("Firefox tabs + restore: PASS");

  const nav = await layer.navigate({ browser_session_id: sid, tab_id: tabB, url: "https://example.test/next", wait: "complete", timeout_ms: 5000 });
  assert(nav.result.url.endsWith("/next") && nav.result.ready_state === "complete", "navigate mismatch");
  console.log("Firefox navigate: PASS");

  const snap = await layer.snapshot({ browser_session_id: sid, target: "main", max_chars: 5000 });
  assert(snap.result.text === "hello" && snap.result.target === "main", "snapshot mismatch");
  console.log("Firefox snapshot: PASS");

  const click = await layer.click({ browser_session_id: sid, target: "#go" });
  assert(click.result.clicked === true && clicked, "click mismatch");
  console.log("Firefox click: PASS");

  const typed = await layer.type({ browser_session_id: sid, target: "#q", text: "ไทย ✓", clear: true });
  assert(typed.result.typed === true && typedText === "ไทย ✓", "type mismatch");
  console.log("Firefox Unicode type: PASS");

  const shot = await layer.screenshot({ browser_session_id: sid, max_bytes: 4096 });
  assert(shot.result.mime_type === "image/png" && shot.result.bytes === 7, "screenshot mismatch");
  const full = await layer.screenshot({ browser_session_id: sid, full_page: true, max_bytes: 4096 });
  assert(full.result.bytes === 7, "full screenshot mismatch");
  console.log("Firefox screenshot/full-page endpoint: PASS");

  let rightClickError = null;
  try { await layer.click({ browser_session_id: sid, target: "#go", button: "right" }); }
  catch (error) { rightClickError = error; }
  assert(rightClickError?.message.includes("FIREFOX_CAPABILITY_LIMIT"), "unsupported click guard mismatch");
  console.log("Firefox click capability guard: PASS");

  await layer.stop({ browser_session_id: sid });
  console.log("Firefox attached stop/detach: PASS");

  const remoteLayer = new BrowserCommonLayer();
  registerFirefoxAdapter(remoteLayer);
  let remoteError = null;
  try {
    await remoteLayer.attach({ browser: "firefox", endpoint: "http://192.0.2.1:4444", options: { session_id: "x" } });
  } catch (error) { remoteError = error; }
  assert(remoteError?.message.includes("FIREFOX_REMOTE_ENDPOINT_BLOCKED"), "remote endpoint guard mismatch");
  console.log("Firefox remote endpoint guard: PASS");

  const adapter = new FirefoxAdapter();
  let missingEndpoint = null;
  try { await adapter.attach({ options: { session_id: "x" } }); } catch (error) { missingEndpoint = error; }
  assert(missingEndpoint?.message.includes("FIREFOX_ATTACH_REQUIRES_ENDPOINT"), "attach endpoint guard mismatch");
  console.log("Firefox attach endpoint guard: PASS");
} finally {
  server.close();
}
