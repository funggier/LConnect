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

let externalProfileError = null;
try { await adapter.start({ options: { user_data_dir: "C:\\unsafe-chrome-profile" } }); }
catch (error) { externalProfileError = error; }
assert(externalProfileError?.message.includes("CHROME_EXTERNAL_PROFILE_BLOCKED"), "external Chrome profile guard mismatch");

let reservedArgError = null;
try { await adapter.start({ options: { chrome_args: ["--user-data-dir=C:\\Users\\me\\Chrome"] } }); }
catch (error) { reservedArgError = error; }
assert(reservedArgError?.message.includes("CHROME_RESERVED_ARGUMENT_BLOCKED"), "reserved Chrome argument guard mismatch");

let crossBackendError = null;
try { await adapter.start({ options: { firefox_binary: "C:\\firefox.exe" } }); }
catch (error) { crossBackendError = error; }
assert(crossBackendError?.message.includes("CHROME_OPTION_UNSUPPORTED"), "cross-backend Chrome option guard mismatch");

console.log("Chrome profile/argument option guards: PASS");
