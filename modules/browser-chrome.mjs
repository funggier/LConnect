import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const CAPABILITIES = ["start","attach","stop","tabs","navigate","snapshot","click","type","screenshot"];

function chromeError(code, message, cause = null) {
  const detail = cause?.message ? ` Cause: ${cause.message}` : "";
  const error = new Error(`${code}: ${message}${detail}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function existsFile(p) {
  try { return Boolean(p) && fs.statSync(p).isFile(); } catch { return false; }
}

function firstPathFromWhere(command) {
  if (process.platform !== "win32") return null;
  const result = spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map((x) => x.trim()).find(existsFile) ?? null;
}

export function resolveChromeBinary(options = {}) {
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    options.chrome_binary,
    process.env.LCONNECT_CHROME_BINARY,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    localAppData ? path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe") : null,
    firstPathFromWhere("chrome.exe"),
  ];
  const found = candidates.find(existsFile);
  if (!found) {
    throw chromeError("CHROME_BINARY_NOT_FOUND",
      "Chrome executable was not found. Provide options.chrome_binary, LCONNECT_CHROME_BINARY, a standard Windows install, or PATH.");
  }
  return path.resolve(found);
}

async function freeLoopbackPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function normalizeEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch {
    throw chromeError("CHROME_ENDPOINT_INVALID", `Invalid CDP endpoint: ${endpoint}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw chromeError("CHROME_ENDPOINT_INVALID", "CDP endpoint must use http or https.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function isLoopbackHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; }
    catch (error) {
      throw chromeError("CHROME_CDP_PROTOCOL_ERROR", `Non-JSON response from ${url} (HTTP ${response.status}).`, error);
    }
    if (!response.ok) {
      throw chromeError("CHROME_CDP_HTTP_ERROR", `HTTP ${response.status} from ${url}.`);
    }
    return payload;
  } catch (error) {
    if (error?.code) throw error;
    if (error?.name === "AbortError") throw chromeError("CHROME_CDP_TIMEOUT", `CDP HTTP request timed out: ${url}`, error);
    throw chromeError("CHROME_CDP_REQUEST_FAILED", `Failed CDP HTTP request: ${url}`, error);
  } finally {
    clearTimeout(timer);
  }
}

async function waitCdpReady(endpoint, processHandle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (processHandle?.exitCode != null) {
      throw chromeError("CHROME_PROCESS_EXITED", `Chrome exited before CDP readiness with code ${processHandle.exitCode}.`);
    }
    try {
      const version = await fetchJson(`${endpoint}/json/version`, Math.min(1500, timeoutMs));
      if (version?.webSocketDebuggerUrl) return version;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw chromeError("CHROME_CDP_NOT_READY", `Chrome CDP did not become ready within ${timeoutMs} ms.`, lastError);
}

function killOwnedChrome(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    try { spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); return; } catch {}
  }
  try { child.kill("SIGKILL"); } catch {}
}

function cleanupRoot(root) {
  if (!root) return;
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}

class CdpConnection {
  constructor(ws, timeoutMs = 10000) {
    this.ws = ws;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(chromeError("CHROME_CDP_ERROR", `${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    };
    ws.onclose = () => {
      this.closed = true;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(chromeError("CHROME_CDP_DISCONNECTED", "CDP WebSocket closed."));
        this.pending.delete(id);
      }
    };
  }

  static async connect(url, timeoutMs = 10000) {
    let ws;
    try { ws = new WebSocket(url); }
    catch (error) { throw chromeError("CHROME_CDP_CONNECT_FAILED", `Invalid CDP WebSocket URL: ${url}`, error); }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        reject(chromeError("CHROME_CDP_TIMEOUT", `Timed out connecting to CDP WebSocket: ${url}`));
      }, timeoutMs);
      timer.unref?.();
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(chromeError("CHROME_CDP_CONNECT_FAILED", `Could not connect to CDP WebSocket: ${url}`)); };
    });
    return new CdpConnection(ws, timeoutMs);
  }

  command(method, params = {}, timeoutMs = this.timeoutMs) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(chromeError("CHROME_CDP_DISCONNECTED", "CDP WebSocket is not open."));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(chromeError("CHROME_CDP_TIMEOUT", `CDP command timed out: ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function listTargets(endpoint, timeoutMs = 8000) {
  const targets = await fetchJson(`${endpoint}/json/list`, timeoutMs);
  return Array.isArray(targets) ? targets.filter((x) => x?.type === "page" && x.webSocketDebuggerUrl) : [];
}

async function chooseTarget(handle, tabId = null) {
  const targets = await listTargets(handle.endpoint, handle.timeoutMs);
  const wantedId = tabId || handle.defaultTargetId || null;
  let target = wantedId ? targets.find((x) => x.id === wantedId) : null;
  if (!target && !tabId) target = targets.find((x) => !String(x.url || "").startsWith("chrome://")) ?? targets[0];
  if (!target) {
    throw chromeError(tabId ? "CHROME_TAB_NOT_FOUND" : "CHROME_NO_PAGE_TARGET",
      tabId ? `No Chrome page target matched tab_id=${tabId}` : "Chrome has no page target.");
  }
  if (!tabId) handle.defaultTargetId = target.id;
  return target;
}

async function withTarget(handle, tabId, fn) {
  const target = await chooseTarget(handle, tabId);
  const connection = await CdpConnection.connect(target.webSocketDebuggerUrl, handle.timeoutMs);
  try { return await fn(connection, target); }
  finally { connection.close(); }
}

async function evaluate(connection, expression, { awaitPromise = true, returnByValue = true } = {}) {
  const result = await connection.command("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || result.result?.description || "Runtime.evaluate exception";
    throw chromeError("CHROME_RUNTIME_EXCEPTION", text);
  }
  return result.result?.value;
}

function jsString(value) {
  return JSON.stringify(String(value));
}

async function waitReadyState(connection, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await evaluate(connection, "document.readyState");
    if (state === "complete") return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw chromeError("CHROME_NAVIGATION_TIMEOUT", `document.readyState did not reach complete within ${timeoutMs} ms (last=${state}).`);
}

function screenshotResult(base64, maxBytes) {
  if (typeof base64 !== "string") throw chromeError("CHROME_CDP_PROTOCOL_ERROR", "Page.captureScreenshot returned no base64 data.");
  const bytes = Buffer.byteLength(base64, "base64");
  if (bytes > maxBytes) throw chromeError("CHROME_SCREENSHOT_TOO_LARGE", `Screenshot is ${bytes} bytes; max_bytes is ${maxBytes}.`);
  return { mime_type: "image/png", data_base64: base64, bytes };
}

export class ChromeAdapter {
  constructor({ spawnImpl = spawn, freePortImpl = freeLoopbackPort } = {}) {
    this.capabilities = [...CAPABILITIES];
    this.spawnImpl = spawnImpl;
    this.freePortImpl = freePortImpl;
  }

  async start({ url = null, headless = false, options = {} } = {}) {
    const chromeBinary = resolveChromeBinary(options);
    const port = options.port ?? await this.freePortImpl();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw chromeError("CHROME_PORT_INVALID", `Invalid CDP port: ${port}`);

    const userDataDir = options.user_data_dir
      ? path.resolve(options.user_data_dir)
      : fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-chrome-"));
    fs.mkdirSync(userDataDir, { recursive: true });

    const endpoint = `http://127.0.0.1:${port}`;
    const args = [
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
    ];
    if (headless) args.push("--headless=new", "--disable-gpu");
    if (Array.isArray(options.chrome_args)) {
      for (const arg of options.chrome_args.slice(0, 32)) args.push(String(arg));
    }
    args.push(url || "about:blank");

    const child = this.spawnImpl(chromeBinary, args, { stdio: "ignore", windowsHide: true, env: process.env });
    try {
      const version = await waitCdpReady(endpoint, child, options.startup_timeout_ms ?? 15000);
      const initialTargets = await listTargets(endpoint, options.timeout_ms ?? 10000);
      const primaryTarget = (url ? initialTargets.find((x) => x.url === url) : null)
        ?? initialTargets.find((x) => !String(x.url || "").startsWith("chrome://"))
        ?? initialTargets[0]
        ?? null;
      return {
        handle: {
          endpoint,
          managed: true,
          chromeProcess: child,
          userDataDir,
          cleanupUserDataDir: !options.user_data_dir,
          timeoutMs: options.timeout_ms ?? 10000,
          defaultTargetId: primaryTarget?.id ?? null,
        },
        product: "Chrome",
        browser_version: String(version.Browser || "").replace(/^Chrome\//, "") || null,
        protocol_version: version["Protocol-Version"] ?? null,
        managed_profile: true,
      };
    } catch (error) {
      killOwnedChrome(child);
      if (!options.user_data_dir) cleanupRoot(userDataDir);
      throw error?.code ? error : chromeError("CHROME_START_FAILED", "Failed to start managed Chrome CDP session.", error);
    }
  }

  async attach({ endpoint, options = {} } = {}) {
    if (!endpoint) throw chromeError("CHROME_ATTACH_REQUIRES_ENDPOINT", "Chrome attach requires an explicit CDP HTTP endpoint.");
    const normalized = normalizeEndpoint(endpoint);
    const parsed = new URL(normalized);
    if (!isLoopbackHost(parsed.hostname) && options.allow_remote_endpoint !== true) {
      throw chromeError("CHROME_REMOTE_ENDPOINT_BLOCKED", "Remote CDP endpoint requires options.allow_remote_endpoint=true.");
    }
    const version = await fetchJson(`${normalized}/json/version`, options.timeout_ms ?? 8000);
    if (!version?.webSocketDebuggerUrl) throw chromeError("CHROME_CDP_PROTOCOL_ERROR", "CDP version endpoint did not expose webSocketDebuggerUrl.");
    const targets = await listTargets(normalized, options.timeout_ms ?? 8000);
    return {
      handle: {
        endpoint: normalized,
        managed: false,
        chromeProcess: null,
        userDataDir: null,
        cleanupUserDataDir: false,
        timeoutMs: options.timeout_ms ?? 10000,
        defaultTargetId: targets[0]?.id ?? null,
      },
      attached: true,
      product: version.Browser ?? null,
      protocol_version: version["Protocol-Version"] ?? null,
      tab_count: targets.length,
    };
  }

  async stop(handle) {
    if (handle.managed) {
      try {
        const version = await fetchJson(`${handle.endpoint}/json/version`, 2500);
        if (version?.webSocketDebuggerUrl) {
          const browser = await CdpConnection.connect(version.webSocketDebuggerUrl, 2500);
          try { await browser.command("Browser.close", {}, 2500).catch(() => {}); }
          finally { browser.close(); }
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
      killOwnedChrome(handle.chromeProcess);
      if (handle.cleanupUserDataDir) cleanupRoot(handle.userDataDir);
    }
    return { stopped: true, process_owned: Boolean(handle.managed), detached_only: !handle.managed };
  }

  async tabs(handle) {
    const targets = await listTargets(handle.endpoint, handle.timeoutMs);
    return {
      tabs: targets.map((x, index) => ({
        id: x.id,
        url: x.url ?? null,
        title: x.title ?? null,
        active: x.id === (handle.defaultTargetId || targets[0]?.id),
      })),
    };
  }

  async navigate(handle, args = {}) {
    return await withTarget(handle, args.tab_id, async (connection) => {
      await connection.command("Page.enable");
      await connection.command("Page.navigate", { url: args.url }, args.timeout_ms ?? 30000);
      const ready = args.wait === "none" ? null : await waitReadyState(connection, args.timeout_ms ?? 30000);
      const [finalUrl, title] = await Promise.all([
        evaluate(connection, "location.href"),
        evaluate(connection, "document.title"),
      ]);
      return { url: finalUrl, title, ready_state: ready, wait: args.wait ?? "complete" };
    });
  }

  async snapshot(handle, args = {}) {
    const maxChars = Math.max(1000, Math.min(200000, args.max_chars ?? 100000));
    return await withTarget(handle, args.tab_id, async (connection) => {
      const target = args.target ? jsString(args.target) : "null";
      const expression = `(()=>{const sel=${target};const el=sel?document.querySelector(sel):document.documentElement;if(!el)return null;const text=(sel?(el.innerText||el.textContent||""):(document.body?.innerText||"")).slice(0,${maxChars});const html=(sel?el.outerHTML:(document.documentElement?.outerHTML||"")).slice(0,${maxChars});return {url:location.href,title:document.title,target:sel,tag:sel?el.tagName:null,text,html};})()`;
      const result = await evaluate(connection, expression);
      if (args.target && result == null) throw chromeError("CHROME_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
      return result ?? {};
    });
  }

  async click(handle, args = {}) {
    if (args.button !== "left") throw chromeError("CHROME_CAPABILITY_LIMIT", "browser_click currently supports left-button DOM clicks only for Chrome.");
    if ((args.click_count ?? 1) !== 1) throw chromeError("CHROME_CAPABILITY_LIMIT", "browser_click currently supports click_count=1 only for Chrome.");
    return await withTarget(handle, args.tab_id, async (connection) => {
      const selector = jsString(args.target);
      const result = await evaluate(connection, `(()=>{const el=document.querySelector(${selector});if(!el)return false;el.click();return true;})()`);
      if (!result) throw chromeError("CHROME_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
      return { clicked: true, target: args.target };
    });
  }

  async type(handle, args = {}) {
    return await withTarget(handle, args.tab_id, async (connection) => {
      const selector = jsString(args.target);
      const text = jsString(args.text);
      const clear = args.clear ? "true" : "false";
      const result = await evaluate(connection, `(()=>{const el=document.querySelector(${selector});if(!el)return false;el.focus();const incoming=${text};const clear=${clear};if("value" in el){el.value=clear?incoming:String(el.value||"")+incoming;}else if(el.isContentEditable){el.textContent=clear?incoming:String(el.textContent||"")+incoming;}else{return null;}el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true;})()`);
      if (result === false) throw chromeError("CHROME_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
      if (result == null) throw chromeError("CHROME_TARGET_NOT_EDITABLE", `Element is not editable: ${args.target}`);
      return { typed: true, target: args.target, chars: Array.from(args.text).length, cleared: Boolean(args.clear) };
    });
  }

  async screenshot(handle, args = {}) {
    const maxBytes = Math.max(1024, Math.min(4000000, args.max_bytes ?? 1000000));
    return await withTarget(handle, args.tab_id, async (connection) => {
      await connection.command("Page.enable");
      let params = { format: "png", fromSurface: true, captureBeyondViewport: Boolean(args.full_page) };
      if (args.full_page) {
        const metrics = await connection.command("Page.getLayoutMetrics");
        const size = metrics.cssContentSize || metrics.contentSize;
        if (size?.width && size?.height) {
          params = { ...params, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } };
        }
      }
      const result = await connection.command("Page.captureScreenshot", params, 30000);
      return screenshotResult(result.data, maxBytes);
    });
  }
}

export function registerChromeAdapter(layer) {
  const adapter = new ChromeAdapter();
  return layer.registerAdapter("chrome", adapter);
}
