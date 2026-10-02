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

function killDriver(child) {
  if (!child || child.exitCode != null) return;
  try { child.kill(); } catch {}
}

function cleanupRoot(root) {
  if (!root) return;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
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
    const geckodriver = resolveGeckodriver(options);
    const firefoxBinary = resolveFirefoxBinary(options);
    const port = options.port ?? await this.freePortImpl();
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw firefoxError("FIREFOX_PORT_INVALID", `Invalid geckodriver port: ${port}`);
    }

    const profileRoot = options.profile_root
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
        cleanupProfileRoot: !options.profile_root,
        bidiUrl: caps.webSocketUrl ?? null,
      };

      if (url) await webdriver(handle, "POST", sessionPath(handle, "/url"), { url }, options.navigation_timeout_ms ?? 30000);

      return {
        handle,
        product: "Firefox",
        browser_version: caps.browserVersion ?? null,
        platform_name: caps.platformName ?? null,
        bidi_available: Boolean(handle.bidiUrl),
        managed_profile: true,
      };
    } catch (error) {
      killDriver(child);
      if (!options.profile_root) cleanupRoot(profileRoot);
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
    };
  }

  async stop(handle) {
    let deleted = false;
    let deleteError = null;
    try {
      await webdriver(handle, "DELETE", sessionPath(handle), undefined, 10000);
      deleted = true;
    } catch (error) {
      deleteError = error;
      if (!handle.managed) throw error;
    } finally {
      if (handle.managed) {
        killDriver(handle.driverProcess);
        if (handle.cleanupProfileRoot) cleanupRoot(handle.profileRoot);
      }
    }
    return {
      stopped: true,
      webdriver_session_deleted: deleted,
      driver_owned: Boolean(handle.managed),
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
    if (args.timeout_ms) {
      await webdriver(handle, "POST", sessionPath(handle, "/timeouts"), { pageLoad: args.timeout_ms }, 5000);
    }
    await webdriver(handle, "POST", sessionPath(handle, "/url"), { url: args.url }, args.timeout_ms ?? 30000);
    const [finalUrl, title, readyState] = await Promise.all([
      webdriver(handle, "GET", sessionPath(handle, "/url")),
      webdriver(handle, "GET", sessionPath(handle, "/title")),
      webdriver(handle, "POST", sessionPath(handle, "/execute/sync"), {
        script: "return document.readyState;",
        args: [],
      }),
    ]);
    return { url: finalUrl, title, ready_state: readyState, wait: args.wait ?? "complete" };
  }

  async snapshot(handle, args = {}) {
    await selectTab(handle, args.tab_id);
    const maxChars = Math.max(1000, Math.min(200000, args.max_chars ?? 100000));
    const script = args.target
      ? `const el=document.querySelector(arguments[0]); if(!el) return null; return {url:location.href,title:document.title,target:arguments[0],tag:el.tagName,text:(el.innerText||el.textContent||"").slice(0,arguments[1]),html:el.outerHTML.slice(0,arguments[1])};`
      : `return {url:location.href,title:document.title,target:null,text:(document.body?.innerText||"").slice(0,arguments[0]),html:(document.documentElement?.outerHTML||"").slice(0,arguments[0])};`;
    const scriptArgs = args.target ? [args.target, maxChars] : [maxChars];
    const result = await webdriver(handle, "POST", sessionPath(handle, "/execute/sync"), { script, args: scriptArgs });
    if (args.target && result == null) {
      throw firefoxError("FIREFOX_TARGET_NOT_FOUND", `No element matched CSS selector: ${args.target}`);
    }
    return result ?? {};
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
