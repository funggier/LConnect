import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserCommonLayer } from "../modules/browser-common.mjs";
import { ChromeAdapter, registerChromeAdapter, resolveChromeBinary } from "../modules/browser-chrome.mjs";

function assert(condition, message) { if (!condition) throw new Error(message); }

const layer = new BrowserCommonLayer();
const registration = registerChromeAdapter(layer);
assert(registration.browser === "chrome" && registration.capabilities.length === 9, "Chrome registration mismatch");
console.log("Chrome adapter registration/capabilities: PASS");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-chrome-smoke-"));
try {
  const fake = path.join(tempDir, "chrome.exe");
  fs.writeFileSync(fake, "x");
  assert(resolveChromeBinary({ chrome_binary: fake }) === path.resolve(fake), "explicit Chrome binary resolution mismatch");
  console.log("Chrome explicit binary resolution: PASS");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const adapter = new ChromeAdapter();

let missingEndpoint = null;
try { await adapter.attach({}); } catch (error) { missingEndpoint = error; }
assert(missingEndpoint?.message.includes("CHROME_ATTACH_REQUIRES_ENDPOINT"), "missing endpoint guard mismatch");
console.log("Chrome attach endpoint guard: PASS");

let remoteError = null;
try { await adapter.attach({ endpoint: "http://192.0.2.1:9222" }); } catch (error) { remoteError = error; }
assert(remoteError?.message.includes("CHROME_REMOTE_ENDPOINT_BLOCKED"), "remote endpoint guard mismatch");
console.log("Chrome remote endpoint guard: PASS");

let schemeError = null;
try { await adapter.attach({ endpoint: "file:///tmp/cdp" }); } catch (error) { schemeError = error; }
assert(schemeError?.message.includes("CHROME_ENDPOINT_INVALID"), "scheme guard mismatch");
console.log("Chrome endpoint scheme guard: PASS");

let clickGuard = null;
try { await adapter.click({ endpoint: "http://127.0.0.1:1", timeoutMs: 100 }, { target: "#x", button: "right", click_count: 1 }); }
catch (error) { clickGuard = error; }
assert(clickGuard?.message.includes("CHROME_CAPABILITY_LIMIT"), "click guard mismatch");
console.log("Chrome click capability guard: PASS");
