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

const CHROME_START_OPTIONS = new Set([
  "chrome_binary", "chrome_args", "user_data_dir", "unsafe_allow_external_profile",
  "startup_timeout_ms", "timeout_ms",
]);

function assertChromeStartOptions(options) {
  for (const key of Object.keys(options || {})) {
    if (!CHROME_START_OPTIONS.has(key)) {
      throw chromeError("CHROME_OPTION_UNSUPPORTED", `Chrome does not support browser_start option: ${key}.`);
    }
  }
  if (options.user_data_dir && options.unsafe_allow_external_profile !== true) {
    throw chromeError("CHROME_EXTERNAL_PROFILE_BLOCKED",
      "Caller-supplied user_data_dir requires unsafe_allow_external_profile=true. Managed Chrome uses an isolated temporary user-data directory by default.");
  }
  for (const raw of options.chrome_args || []) {
    const arg = String(raw).trim().toLowerCase();
    if (/^--(?:user-data-dir|profile-directory|remote-debugging-port|remote-debugging-address)(?:=|$)/.test(arg)) {
      throw chromeError("CHROME_RESERVED_ARGUMENT_BLOCKED", `LConnect owns Chrome profile/debugging arguments; blocked argument: ${raw}`);
    }
  }
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

function stopOwnedChrome(child) {
  if (!child?.pid) return { attempted: false, exited: true, forced: false, pid: null };
  const pid = child.pid;
  if (child.exitCode != null) return { attempted: false, exited: true, forced: false, pid, exit_code: child.exitCode };
  let forced = false;
  let taskkill_status = null;
  if (process.platform === "win32") {
    forced = true;
    try {
      const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      taskkill_status = result.status;
    } catch {
      taskkill_status = -1;
    }
  } else {
    try { child.kill("SIGKILL"); forced = true; } catch {}
  }
  return { attempted: true, exited: child.exitCode != null || taskkill_status === 0, forced, pid, exit_code: child.exitCode, taskkill_status };
}

function cleanupRoot(root, enabled = true) {
  const evidence = { attempted: Boolean(root && enabled), succeeded: null, path: root ?? null, residue_exists: null };
  if (!root || !enabled) return { ...evidence, succeeded: false, residue_exists: root ? fs.existsSync(root) : false };
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    evidence.succeeded = true;
  } catch (error) {
    evidence.succeeded = false;
    evidence.error = error.message;
  }
  evidence.residue_exists = fs.existsSync(root);
  if (evidence.residue_exists) evidence.succeeded = false;
  return evidence;
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

async function waitReadyState(connection, targetState = "complete", timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await evaluate(connection, "document.readyState");
    if (targetState === "interactive" && (state === "interactive" || state === "complete")) return state;
    if (targetState === "complete" && state === "complete") return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw chromeError("CHROME_NAVIGATION_TIMEOUT", `document.readyState did not reach ${targetState} within ${timeoutMs} ms (last=${state}).`);
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
    assertChromeStartOptions(options);
    const chromeBinary = resolveChromeBinary(options);
    const port = await this.freePortImpl();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw chromeError("CHROME_PORT_INVALID", `Invalid CDP port: ${port}`);

    const externalUserDataDir = Boolean(options.user_data_dir);
    const userDataDir = externalUserDataDir
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
          cleanupUserDataDir: !externalUserDataDir,
          timeoutMs: options.timeout_ms ?? 10000,
          defaultTargetId: primaryTarget?.id ?? null,
        },
        product: "Chrome",
        browser_version: String(version.Browser || "").replace(/^Chrome\//, "") || null,
        protocol_version: version["Protocol-Version"] ?? null,
        managed_profile: !externalUserDataDir,
        profile_mode: externalUserDataDir ? "external" : "temporary",
        profile_owned: !externalUserDataDir,
        profile_isolated: !externalUserDataDir,
        profile_cleanup_on_stop: !externalUserDataDir,
      };
    } catch (error) {
      stopOwnedChrome(child);
      cleanupRoot(userDataDir, !externalUserDataDir);
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
      managed_profile: false,
      profile_mode: "attached-external",
      profile_owned: false,
      profile_isolated: null,
      profile_cleanup_on_stop: false,
    };
  }

  async stop(handle, args = {}) {
    if (!handle.managed && args.close_remote_session !== true) {
      return {
        stopped: true,
        process_owned: false,
        detached_only: true,
        remote_session_closed: false,
        profile_cleanup: { attempted: false, succeeded: false, path: null, residue_exists: false },
      };
    }

    let closeAttempted = false;
    let closeSucceeded = false;
    let closeWarning = null;
    try {
      const version = await fetchJson(`${handle.endpoint}/json/version`, 2500);
      if (version?.webSocketDebuggerUrl) {
        closeAttempted = true;
        const browser = await CdpConnection.connect(version.webSocketDebuggerUrl, 2500);
        try {
          await browser.command("Browser.close", {}, 2500).catch((error) => {
            if (error?.code !== "CHROME_CDP_DISCONNECTED") throw error;
          });
          closeSucceeded = true;
        } finally {
          browser.close();
        }
      }
    } catch (error) {
      closeWarning = error.message;
      if (!handle.managed && args.close_remote_session === true) throw error;
    }

    if (!handle.managed) {
      return {
        stopped: true,
        process_owned: false,
        detached_only: false,
        remote_session_closed: closeSucceeded,
        remote_close_attempted: closeAttempted,
        ...(closeWarning ? { close_warning: closeWarning } : {}),
        profile_cleanup: { attempted: false, succeeded: false, path: null, residue_exists: false },
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
    const processCleanup = stopOwnedChrome(handle.chromeProcess);
    const profileCleanup = cleanupRoot(handle.userDataDir, handle.cleanupUserDataDir);
    return {
      stopped: true,
      process_owned: true,
      detached_only: false,
      remote_session_closed: null,
      browser_close_attempted: closeAttempted,
      browser_close_succeeded: closeSucceeded,
      process_cleanup: processCleanup,
      profile_cleanup: profileCleanup,
      ...(closeWarning ? { close_warning: closeWarning } : {}),
    };
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
      const wait = args.wait ?? "complete";
      const timeoutMs = args.timeout_ms ?? 30000;
      await connection.command("Page.enable");
      await connection.command("Page.navigate", { url: args.url }, timeoutMs);
      const ready = wait === "none" ? null : await waitReadyState(connection, wait, timeoutMs);
      if (wait === "none") {
        return { url: args.url, title: null, ready_state: null, wait, transport: "cdp" };
      }
      const [finalUrl, title] = await Promise.all([
        evaluate(connection, "location.href"),
        evaluate(connection, "document.title"),
      ]);
      return { url: finalUrl, title, ready_state: ready, wait, transport: "cdp" };
    });
  }

  async snapshot(handle, args = {}) {
    const maxChars = Math.max(1000, Math.min(200000, args.max_chars ?? 100000));
    const mode = args.mode ?? "dom";
    return await withTarget(handle, args.tab_id, async (connection) => {
      if (mode === "accessibility") {
        await connection.command("Accessibility.enable");
        let axResult;
        if (args.target) {
          const selector = jsString(args.target);
          const remote = await connection.command("Runtime.evaluate", {
            expression: `document.querySelector(${selector})`,
            returnByValue: false,
          });
          const objectId = remote.result?.objectId;
          if (!objectId) throw chromeError("CHROME_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
          try {
            axResult = await connection.command("Accessibility.getPartialAXTree", { objectId, fetchRelatives: false });
          } finally {
            await connection.command("Runtime.releaseObject", { objectId }).catch(() => {});
          }
        } else {
          axResult = await connection.command("Accessibility.getFullAXTree");
        }
        const maxNodes = Math.max(20, Math.min(500, Math.floor(maxChars / 260)));
        const nodes = (axResult.nodes || []).slice(0, maxNodes).map((node) => {
          const properties = {};
          for (const prop of node.properties || []) {
            if (["checked","disabled","expanded","focused","level","pressed","selected","required"].includes(prop.name)) {
              properties[prop.name] = prop.value?.value ?? null;
            }
          }
          return {
            node_id: node.nodeId ?? null,
            ignored: Boolean(node.ignored),
            role: node.role?.value ?? null,
            name: node.name?.value ?? null,
            value: node.value?.value ?? null,
            properties,
          };
        });
        return { mode: "accessibility", source: "cdp-accessibility", target: args.target ?? null, nodes };
      }

      const target = args.target ? jsString(args.target) : "null";
      const includeState = args.include_state !== false ? "true" : "false";
      const expression = `(()=>{const sel=${target};const el=sel?document.querySelector(sel):document.documentElement;if(!el)return null;const text=(sel?(el.innerText||el.textContent||""):(document.body?.innerText||"")).slice(0,${maxChars});const html=(sel?el.outerHTML:(document.documentElement?.outerHTML||"")).slice(0,${maxChars});let state=null;if(${includeState}){const subject=sel?el:document.activeElement;if(subject){const aria={};for(const a of subject.attributes||[]){if(a.name.startsWith("aria-"))aria[a.name]=a.value;}state={tag:subject.tagName,id:subject.id||null,value:("value"in subject?subject.value:null),checked:("checked"in subject?Boolean(subject.checked):null),selected:("selected"in subject?Boolean(subject.selected):null),disabled:("disabled"in subject?Boolean(subject.disabled):null),role:subject.getAttribute?.("role")||null,aria};}}return {mode:"dom",url:location.href,title:document.title,target:sel,tag:sel?el.tagName:null,text,html,state};})()`;
      const result = await evaluate(connection, expression);
      if (args.target && result == null) throw chromeError("CHROME_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
      return result ?? {};
    });
  }

  async click(handle, args = {}) {
    return await withTarget(handle, args.tab_id, async (connection) => {
      const selector = jsString(args.target);
      const point = await evaluate(connection, `(()=>{const el=document.querySelector(${selector});if(!el)return null;el.scrollIntoView({block:"center",inline:"center"});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,disabled:Boolean(el.disabled),tag:el.tagName};})()`);
      if (!point) throw chromeError("CHROME_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
      if (point.disabled) throw chromeError("CHROME_TARGET_DISABLED", `Target is disabled: ${args.target}`);
      const button = args.button ?? "left";
      const clickCount = args.click_count ?? 1;
      await connection.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none" });
      for (let i = 1; i <= clickCount; i += 1) {
        await connection.command("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button, clickCount: i });
        await connection.command("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button, clickCount: i });
      }
      return { clicked: true, target: args.target, button, click_count: clickCount, input_backend: "cdp-input", point: { x: point.x, y: point.y } };
    });
  }

  async type(handle, args = {}) {
    return await withTarget(handle, args.tab_id, async (connection) => {
      const selector = jsString(args.target);
      const prep = await evaluate(connection, `(()=>{const el=document.querySelector(${selector});if(!el)return {found:false};const editable=("value"in el)||el.isContentEditable;if(!editable)return {found:true,editable:false};el.focus();return {found:true,editable:true,tag:el.tagName};})()`);
      if (!prep?.found) throw chromeError("CHROME_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
      if (!prep.editable) throw chromeError("CHROME_TARGET_NOT_EDITABLE", `Element is not editable: ${args.target}`);

      if (args.clear) {
        await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, modifiers: 2 });
        await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
        await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
        await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, modifiers: 0 });
        await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      }
      if (args.text) await connection.command("Input.insertText", { text: args.text });
      const value = await evaluate(connection, `(()=>{const el=document.querySelector(${selector});return el?("value"in el?String(el.value??""):String(el.textContent??"")):null;})()`);
      return {
        typed: true,
        target: args.target,
        chars: Array.from(args.text).length,
        cleared: Boolean(args.clear),
        input_backend: "cdp-input",
        value,
      };
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
