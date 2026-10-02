import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const WD_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const CAPABILITIES = ["start","attach","stop","tabs","navigate","snapshot","click","type","screenshot"];

function firefoxError(code, message, cause = null) {
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

const FIREFOX_START_OPTIONS = new Set([
  "firefox_binary", "geckodriver_path", "firefox_args", "preferences", "profile_root",
  "unsafe_allow_external_profile", "startup_timeout_ms", "session_timeout_ms",
  "navigation_timeout_ms", "timeout_ms", "log_level",
]);

function assertFirefoxStartOptions(options) {
  for (const key of Object.keys(options || {})) {
    if (!FIREFOX_START_OPTIONS.has(key)) {
      throw firefoxError("FIREFOX_OPTION_UNSUPPORTED", `Firefox does not support browser_start option: ${key}.`);
    }
  }
  if (options.profile_root && options.unsafe_allow_external_profile !== true) {
    throw firefoxError("FIREFOX_EXTERNAL_PROFILE_ROOT_BLOCKED",
      "Caller-supplied profile_root requires unsafe_allow_external_profile=true. Managed Firefox uses a private temporary profile root by default.");
  }
  for (const raw of options.firefox_args || []) {
    const arg = String(raw).trim().toLowerCase();
    if (/^(?:--?profile(?:=|$)|-p$|--?profilemanager(?:=|$)|--?marionette(?:=|$)|--?remote-debugging-port(?:=|$)|--?start-debugger-server(?:=|$))/.test(arg)) {
      throw firefoxError("FIREFOX_RESERVED_ARGUMENT_BLOCKED", `LConnect owns Firefox profile/automation arguments; blocked argument: ${raw}`);
    }
  }
}

export function resolveGeckodriver(options = {}) {
  const candidates = [
    options.geckodriver_path,
    process.env.LCONNECT_GECKODRIVER,
    path.join(process.cwd(), "runtime", "browser-drivers", "geckodriver.exe"),
    path.join(process.cwd(), "browser-drivers", "geckodriver.exe"),
    firstPathFromWhere("geckodriver.exe"),
  ];
  const found = candidates.find(existsFile);
  if (!found) {
    throw firefoxError("FIREFOX_DRIVER_NOT_FOUND",
      "geckodriver.exe was not found. Provide options.geckodriver_path, LCONNECT_GECKODRIVER, runtime/browser-drivers/geckodriver.exe, or PATH.");
  }
  return path.resolve(found);
}

export function resolveFirefoxBinary(options = {}) {
  const candidates = [
    options.firefox_binary,
    process.env.LCONNECT_FIREFOX_BINARY,
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
    firstPathFromWhere("firefox.exe"),
  ];
  const found = candidates.find(existsFile);
  if (!found) {
    throw firefoxError("FIREFOX_BINARY_NOT_FOUND",
      "Firefox executable was not found. Provide options.firefox_binary, LCONNECT_FIREFOX_BINARY, a standard Windows install, or PATH.");
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

async function fetchWithTimeout(url, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw firefoxError("FIREFOX_WEBDRIVER_TIMEOUT", `WebDriver request timed out after ${timeoutMs} ms: ${url}`, error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch {
    throw firefoxError("FIREFOX_ENDPOINT_INVALID", `Invalid WebDriver endpoint: ${endpoint}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw firefoxError("FIREFOX_ENDPOINT_INVALID", "WebDriver endpoint must use http or https.");
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

async function webdriver(handle, method, pathname, body = undefined, timeoutMs = 15000) {
  const url = `${handle.endpoint}${pathname}`;
  const init = { method, headers: { "content-type": "application/json; charset=utf-8" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  let response;
  try {
    response = await fetchWithTimeout(url, init, timeoutMs);
  } catch (error) {
    if (error?.code) throw error;
    throw firefoxError("FIREFOX_WEBDRIVER_REQUEST_FAILED", `${method} ${pathname} failed.`, error);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch (error) {
      throw firefoxError("FIREFOX_WEBDRIVER_PROTOCOL_ERROR", `Non-JSON response from ${method} ${pathname} (HTTP ${response.status}).`, error);
    }
  }

  const value = payload?.value;
  if (!response.ok || (value && typeof value === "object" && value.error)) {
    const wdCode = value?.error || `HTTP_${response.status}`;
    const message = value?.message || response.statusText || "WebDriver error";
    throw firefoxError("FIREFOX_WEBDRIVER_ERROR", `${wdCode}: ${message}`);
  }
  return value;
}

async function waitDriverReady(endpoint, processHandle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (processHandle.exitCode != null) {
      throw firefoxError("FIREFOX_DRIVER_EXITED", `geckodriver exited before readiness with code ${processHandle.exitCode}.`);
    }
    try {
      const response = await fetchWithTimeout(`${endpoint}/status`, { method: "GET" }, Math.min(1500, timeoutMs));
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.value?.ready !== false) return payload?.value ?? {};
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw firefoxError("FIREFOX_DRIVER_NOT_READY", `geckodriver did not become ready within ${timeoutMs} ms.`, lastError);
}

async function stopOwnedProcess(child, timeoutMs = 2000) {
  if (!child) return { attempted: false, exited: true, forced: false, pid: null };
  if (child.exitCode != null) return { attempted: false, exited: true, forced: false, pid: child.pid ?? null, exit_code: child.exitCode };
  const pid = child.pid ?? null;
  let forced = false;
  try { child.kill(); } catch {}
  const deadline = Date.now() + timeoutMs;
  while (child.exitCode == null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (child.exitCode == null && pid && process.platform === "win32") {
    forced = true;
    try { spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { attempted: true, exited: child.exitCode != null, forced, pid, exit_code: child.exitCode };
}

function firefoxProcessesForProfileRoot(profileRoot) {
  if (process.platform !== "win32" || !profileRoot) return [];
  const script = [
    "$ErrorActionPreference='Stop'",
    "$target=$env:LCONNECT_FIREFOX_PROFILE_ROOT",
    "$rows=@(Get-CimInstance Win32_Process -Filter \"Name='firefox.exe'\" | Where-Object {",
    "  $null -ne $_.CommandLine -and $_.CommandLine.IndexOf($target,[StringComparison]::OrdinalIgnoreCase) -ge 0",
    "} | Select-Object ProcessId,ParentProcessId,CommandLine)",
    "$rows | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync("powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, LCONNECT_FIREFOX_PROFILE_ROOT: path.resolve(profileRoot) },
      timeout: 5000,
    });
  if (result.status !== 0 || !String(result.stdout || "").trim()) return [];
  try {
    const parsed = JSON.parse(String(result.stdout).trim());
    return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
      pid: Number(row.ProcessId),
      parent_pid: Number(row.ParentProcessId),
      command_line: String(row.CommandLine || ""),
    })).filter((row) => Number.isInteger(row.pid) && row.pid > 0);
  } catch {
    return [];
  }
}

function cleanupFirefoxProfileProcesses(profileRoot) {
  const before = firefoxProcessesForProfileRoot(profileRoot);
  if (!before.length) {
    return { attempted: false, matched_before: 0, root_pids: [], killed_root_pids: [], matched_after: 0, succeeded: true };
  }
  const matchedIds = new Set(before.map((row) => row.pid));
  const rootPids = before
    .filter((row) => !matchedIds.has(row.parent_pid))
    .map((row) => row.pid);
  const killedRootPids = [];
  const errors = [];
  for (const pid of rootPids) {
    const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 5000,
    });
    if (result.status === 0) killedRootPids.push(pid);
    else errors.push({ pid, status: result.status, message: String(result.stderr || result.stdout || "").trim() });
  }
  const after = firefoxProcessesForProfileRoot(profileRoot);
  return {
    attempted: true,
    matched_before: before.length,
    root_pids: rootPids,
    killed_root_pids: killedRootPids,
    matched_after: after.length,
    succeeded: after.length === 0,
    ...(errors.length ? { errors } : {}),
  };
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

function sessionPath(handle, suffix = "") {
  return `/session/${encodeURIComponent(handle.sessionId)}${suffix}`;
}

async function selectTab(handle, tabId) {
  if (!tabId) return;
  await webdriver(handle, "POST", sessionPath(handle, "/window"), { handle: tabId });
}

async function findElement(handle, selector) {
  const value = await webdriver(handle, "POST", sessionPath(handle, "/element"), {
    using: "css selector",
    value: selector,
  });
  const id = value?.[WD_ELEMENT];
  if (!id) throw firefoxError("FIREFOX_WEBDRIVER_PROTOCOL_ERROR", "Find Element returned no W3C element id.");
  return id;
}

function decodeScreenshot(base64, maxBytes) {
  if (typeof base64 !== "string") {
    throw firefoxError("FIREFOX_WEBDRIVER_PROTOCOL_ERROR", "Screenshot response was not base64 text.");
  }
  const bytes = Buffer.byteLength(base64, "base64");
  if (bytes > maxBytes) {
    throw firefoxError("FIREFOX_SCREENSHOT_TOO_LARGE", `Screenshot is ${bytes} bytes; max_bytes is ${maxBytes}.`);
  }
  return { mime_type: "image/png", data_base64: base64, bytes };
}

export class FirefoxAdapter {
  constructor({ spawnImpl = spawn, freePortImpl = freeLoopbackPort } = {}) {
    this.capabilities = [...CAPABILITIES];
    this.spawnImpl = spawnImpl;
    this.freePortImpl = freePortImpl;
  }

  async start({ url = null, headless = false, options = {} } = {}) {
    assertFirefoxStartOptions(options);
    const geckodriver = resolveGeckodriver(options);
    const firefoxBinary = resolveFirefoxBinary(options);
    const port = await this.freePortImpl();
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw firefoxError("FIREFOX_PORT_INVALID", `Invalid geckodriver port: ${port}`);
    }

    const externalProfileRoot = Boolean(options.profile_root);
    const profileRoot = externalProfileRoot
      ? path.resolve(options.profile_root)
      : fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-firefox-"));
    fs.mkdirSync(profileRoot, { recursive: true });

    const endpoint = `http://127.0.0.1:${port}`;
    const driverArgs = ["--host", "127.0.0.1", "--port", String(port), "--profile-root", profileRoot];
    if (options.log_level) driverArgs.push("--log", String(options.log_level));

    const child = this.spawnImpl(geckodriver, driverArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
    });
    child.stdout?.resume();
    child.stderr?.resume();

    try {
      await waitDriverReady(endpoint, child, options.startup_timeout_ms ?? 15000);
      const firefoxArgs = [];
      if (headless) firefoxArgs.push("-headless");
      if (Array.isArray(options.firefox_args)) {
        for (const arg of options.firefox_args.slice(0, 32)) firefoxArgs.push(String(arg));
      }

      const prefs = {
        "browser.shell.checkDefaultBrowser": false,
        "browser.startup.page": 0,
        ...(options.preferences && typeof options.preferences === "object" ? options.preferences : {}),
      };

      const session = await webdriver({ endpoint }, "POST", "/session", {
        capabilities: {
          alwaysMatch: {
            browserName: "firefox",
            webSocketUrl: true,
            pageLoadStrategy: "none",
            "moz:firefoxOptions": {
              binary: firefoxBinary,
              args: firefoxArgs,
              prefs,
            },
          },
        },
      }, options.session_timeout_ms ?? 30000);

      const sessionId = session?.sessionId;
      const caps = session?.capabilities ?? {};
      if (!sessionId) {
        throw firefoxError("FIREFOX_WEBDRIVER_PROTOCOL_ERROR", "New Session response contained no sessionId.");
      }

      const handle = {
        endpoint,
        sessionId,
        driverProcess: child,
        managed: true,
        profileRoot,
        cleanupProfileRoot: !externalProfileRoot,
        bidiUrl: caps.webSocketUrl ?? null,
        pageLoadStrategy: "none",
      };

      if (url) {
        await this.navigate(handle, {
          url,
          wait: "complete",
          timeout_ms: options.navigation_timeout_ms ?? 30000,
        });
      }

      return {
        handle,
        product: "Firefox",
        browser_version: caps.browserVersion ?? null,
        platform_name: caps.platformName ?? null,
        bidi_available: Boolean(handle.bidiUrl),
        managed_profile: !externalProfileRoot,
        profile_mode: externalProfileRoot ? "external-root" : "temporary",
        profile_owned: !externalProfileRoot,
        profile_isolated: true,
        profile_cleanup_on_stop: !externalProfileRoot,
      };
    } catch (error) {
      await stopOwnedProcess(child).catch(() => {});
      cleanupFirefoxProfileProcesses(profileRoot);
      cleanupRoot(profileRoot, !externalProfileRoot);
      throw error?.code ? error : firefoxError("FIREFOX_START_FAILED", "Failed to start managed Firefox session.", error);
    }
  }

  async attach({ endpoint, options = {} } = {}) {
    if (!endpoint) {
      throw firefoxError("FIREFOX_ATTACH_REQUIRES_ENDPOINT", "Firefox attach requires an explicit WebDriver endpoint.");
    }
    const normalized = normalizeEndpoint(endpoint);
    const parsed = new URL(normalized);
    if (!isLoopbackHost(parsed.hostname) && options.allow_remote_endpoint !== true) {
      throw firefoxError("FIREFOX_REMOTE_ENDPOINT_BLOCKED", "Remote WebDriver endpoint requires options.allow_remote_endpoint=true.");
    }
    const sessionId = String(options.session_id || "").trim();
    if (!sessionId) {
      throw firefoxError("FIREFOX_ATTACH_REQUIRES_SESSION", "Firefox attach requires options.session_id.");
    }
    const handle = {
      endpoint: normalized,
      sessionId,
      driverProcess: null,
      managed: false,
      profileRoot: null,
      cleanupProfileRoot: false,
      bidiUrl: options.web_socket_url ?? null,
    };
    const currentUrl = await webdriver(handle, "GET", sessionPath(handle, "/url"), undefined, options.timeout_ms ?? 10000);
    const caps = await webdriver(handle, "GET", sessionPath(handle, "/window/handles"), undefined, options.timeout_ms ?? 10000);
    return {
      handle,
      attached: true,
      current_url: currentUrl,
      tab_count: Array.isArray(caps) ? caps.length : null,
      bidi_available: Boolean(handle.bidiUrl),
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
        detached_only: true,
        remote_session_closed: false,
        driver_owned: false,
        profile_cleanup: { attempted: false, succeeded: false, path: null, residue_exists: false },
      };
    }

    let deleted = false;
    let deleteError = null;
    try {
      await webdriver(handle, "DELETE", sessionPath(handle), undefined, 10000);
      deleted = true;
    } catch (error) {
      deleteError = error;
      if (!handle.managed) throw error;
    }

    const processCleanup = handle.managed
      ? await stopOwnedProcess(handle.driverProcess).catch((error) => ({ attempted: true, exited: false, forced: false, error: error.message }))
      : { attempted: false, exited: null, forced: false, pid: null };
    const browserProcessCleanup = handle.managed
      ? cleanupFirefoxProfileProcesses(handle.profileRoot)
      : { attempted: false, matched_before: 0, root_pids: [], killed_root_pids: [], matched_after: 0, succeeded: true };
    const profileCleanup = handle.managed
      ? cleanupRoot(handle.profileRoot, handle.cleanupProfileRoot)
      : { attempted: false, succeeded: false, path: null, residue_exists: false };

    return {
      stopped: true,
      detached_only: false,
      webdriver_session_deleted: deleted,
      remote_session_closed: !handle.managed ? deleted : null,
      driver_owned: Boolean(handle.managed),
      process_cleanup: processCleanup,
      browser_process_cleanup: browserProcessCleanup,
      profile_cleanup: profileCleanup,
      ...(deleteError ? { delete_warning: deleteError.message } : {}),
    };
  }

  async tabs(handle) {
    const original = await webdriver(handle, "GET", sessionPath(handle, "/window"));
    const handles = await webdriver(handle, "GET", sessionPath(handle, "/window/handles"));
    const tabs = [];
    try {
      for (const tabId of handles ?? []) {
        await selectTab(handle, tabId);
        const [url, title] = await Promise.all([
          webdriver(handle, "GET", sessionPath(handle, "/url")),
          webdriver(handle, "GET", sessionPath(handle, "/title")),
        ]);
        tabs.push({ id: tabId, url, title, active: tabId === original });
      }
    } finally {
      if (original && (handles ?? []).includes(original)) {
        await selectTab(handle, original).catch(() => {});
      }
    }
    return { tabs };
  }

  async navigate(handle, args = {}) {
    await selectTab(handle, args.tab_id);
    const wait = args.wait ?? "complete";
    const timeoutMs = args.timeout_ms ?? 30000;

    if (!handle.managed && wait !== "complete") {
      throw firefoxError("FIREFOX_WAIT_MODE_UNAVAILABLE",
        `Attached Firefox sessions without LConnect-owned pageLoadStrategy only support wait=complete; requested wait=${wait}.`);
    }

    if (args.timeout_ms) {
      await webdriver(handle, "POST", sessionPath(handle, "/timeouts"), { pageLoad: timeoutMs, script: Math.min(timeoutMs, 10000) }, 5000);
    }
    await webdriver(handle, "POST", sessionPath(handle, "/url"), { url: args.url }, timeoutMs);

    if (wait !== "none") {
      const deadline = Date.now() + timeoutMs;
      let readyState = null;
      while (Date.now() < deadline) {
        try {
          readyState = await webdriver(handle, "POST", sessionPath(handle, "/execute/sync"), {
            script: "return document.readyState;",
            args: [],
          }, Math.min(5000, timeoutMs));
          if (wait === "interactive" && (readyState === "interactive" || readyState === "complete")) break;
          if (wait === "complete" && readyState === "complete") break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (wait === "complete" && readyState !== "complete") {
        throw firefoxError("FIREFOX_NAVIGATION_TIMEOUT", `document.readyState did not reach complete within ${timeoutMs} ms (last=${readyState}).`);
      }
      if (wait === "interactive" && readyState !== "interactive" && readyState !== "complete") {
        throw firefoxError("FIREFOX_NAVIGATION_TIMEOUT", `document.readyState did not reach interactive within ${timeoutMs} ms (last=${readyState}).`);
      }
    }

    if (wait === "none") {
      return { url: args.url, title: null, ready_state: null, wait, transport: "webdriver-classic/pageLoadStrategy-none" };
    }

    const [finalUrl, title, readyState] = await Promise.all([
      webdriver(handle, "GET", sessionPath(handle, "/url")),
      webdriver(handle, "GET", sessionPath(handle, "/title")),
      webdriver(handle, "POST", sessionPath(handle, "/execute/sync"), {
        script: "return document.readyState;",
        args: [],
      }),
    ]);
    return { url: finalUrl, title, ready_state: readyState, wait, transport: "webdriver-classic/pageLoadStrategy-none" };
  }

  async snapshot(handle, args = {}) {
    await selectTab(handle, args.tab_id);
    const maxChars = Math.max(1000, Math.min(200000, args.max_chars ?? 100000));
    const mode = args.mode ?? "dom";

    if (mode === "accessibility") {
      const maxNodes = Math.max(20, Math.min(500, Math.floor(maxChars / 240)));
      const script = "const root=arguments[0]?document.querySelector(arguments[0]):document.body;if(!root)return null;const max=arguments[1];const roleOf=(el)=>el.getAttribute('role')||({A:'link',BUTTON:'button',TEXTAREA:'textbox',SELECT:'combobox',OPTION:'option',IMG:'img',H1:'heading',H2:'heading',H3:'heading',H4:'heading',H5:'heading',H6:'heading'}[el.tagName]||(el.tagName==='INPUT'?(el.type==='checkbox'?'checkbox':el.type==='radio'?'radio':'textbox'):null));const nameOf=(el)=>el.getAttribute('aria-label')||el.getAttribute('alt')||el.getAttribute('title')||((el.innerText||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,240));const nodes=[];for(const el of [root,...root.querySelectorAll('*')]){const role=roleOf(el);const name=nameOf(el);if(!role&&!name)continue;const item={tag:el.tagName,role,name};if('value'in el)item.value=String(el.value??'').slice(0,500);if('checked'in el)item.checked=Boolean(el.checked);if('selected'in el)item.selected=Boolean(el.selected);if('disabled'in el)item.disabled=Boolean(el.disabled);for(const k of ['aria-expanded','aria-pressed','aria-selected','aria-checked','aria-current','aria-level']){const v=el.getAttribute(k);if(v!==null)item[k]=v;}nodes.push(item);if(nodes.length>=max)break;}return {url:location.href,title:document.title,target:arguments[0]||null,nodes};";
      const result = await webdriver(handle, "POST", sessionPath(handle, "/execute/sync"), {
        script,
        args: [args.target ?? null, maxNodes],
      });
      if (args.target && result == null) {
        throw firefoxError("FIREFOX_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
      }
      return { mode: "accessibility", source: "dom-accessibility-projection", ...(result ?? { nodes: [] }) };
    }

    const targetScript = "const el=document.querySelector(arguments[0]);if(!el)return null;const aria={};for(const a of el.attributes||[]){if(a.name.startsWith('aria-'))aria[a.name]=a.value;}const state=arguments[2]?{value:('value'in el?el.value:null),checked:('checked'in el?Boolean(el.checked):null),selected:('selected'in el?Boolean(el.selected):null),disabled:('disabled'in el?Boolean(el.disabled):null),role:el.getAttribute('role'),aria}:null;return {url:location.href,title:document.title,target:arguments[0],tag:el.tagName,text:(el.innerText||el.textContent||'').slice(0,arguments[1]),html:el.outerHTML.slice(0,arguments[1]),state};";
    const pageScript = "const active=document.activeElement;const state=arguments[1]&&active?{tag:active.tagName,id:active.id||null,value:('value'in active?active.value:null),checked:('checked'in active?Boolean(active.checked):null),disabled:('disabled'in active?Boolean(active.disabled):null)}:null;return {url:location.href,title:document.title,target:null,text:(document.body?.innerText||'').slice(0,arguments[0]),html:(document.documentElement?.outerHTML||'').slice(0,arguments[0]),active_element:state};";
    const script = args.target ? targetScript : pageScript;
    const scriptArgs = args.target
      ? [args.target, maxChars, args.include_state !== false]
      : [maxChars, args.include_state !== false];
    const result = await webdriver(handle, "POST", sessionPath(handle, "/execute/sync"), { script, args: scriptArgs });
    if (args.target && result == null) {
      throw firefoxError("FIREFOX_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
    }
    return { mode: "dom", ...(result ?? {}) };
  }

  async click(handle, args = {}) {
    await selectTab(handle, args.tab_id);
    if (args.button !== "left") {
      throw firefoxError("FIREFOX_CAPABILITY_LIMIT", "browser_click currently supports left-button DOM clicks only for Firefox.");
    }
    if ((args.click_count ?? 1) !== 1) {
      throw firefoxError("FIREFOX_CAPABILITY_LIMIT", "browser_click currently supports click_count=1 only for Firefox.");
    }
    const elementId = await findElement(handle, args.target);
    await webdriver(handle, "POST", sessionPath(handle, `/element/${encodeURIComponent(elementId)}/click`), {});
    return { clicked: true, target: args.target };
  }

  async type(handle, args = {}) {
    await selectTab(handle, args.tab_id);
    const elementId = await findElement(handle, args.target);
    const elementPath = sessionPath(handle, `/element/${encodeURIComponent(elementId)}`);
    if (args.clear) await webdriver(handle, "POST", `${elementPath}/clear`, {});
    await webdriver(handle, "POST", `${elementPath}/value`, { text: args.text, value: Array.from(args.text) });
    return { typed: true, target: args.target, chars: Array.from(args.text).length, cleared: Boolean(args.clear) };
  }

  async screenshot(handle, args = {}) {
    await selectTab(handle, args.tab_id);
    const maxBytes = Math.max(1024, Math.min(4000000, args.max_bytes ?? 1000000));
    const pathname = args.full_page
      ? sessionPath(handle, "/moz/screenshot/full")
      : sessionPath(handle, "/screenshot");
    const base64 = await webdriver(handle, "GET", pathname, undefined, 30000);
    return decodeScreenshot(base64, maxBytes);
  }
}

export function registerFirefoxAdapter(layer) {
  const adapter = new FirefoxAdapter();
  return layer.registerAdapter("firefox", adapter);
}
