import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const SUPPORTED_BACKENDS = new Set(["firefox", "chrome"]);
const OPERATIONS = new Set(["start", "attach", "stop", "tabs", "navigate", "snapshot", "click", "type", "screenshot"]);
const DEFAULT_RESULT_LIMIT = 250000;
const MAX_OPTIONS_CHARS = 32768;
const MAX_SESSIONS = 32;

function browserError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function jsonCloneBounded(value, maxChars = DEFAULT_RESULT_LIMIT, label = "browser result") {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (error) {
    throw browserError("BROWSER_ADAPTER_PROTOCOL_ERROR", `${label} is not JSON-serializable: ${error.message}`);
  }
  if (raw === undefined) {
    throw browserError("BROWSER_ADAPTER_PROTOCOL_ERROR", `${label} must be JSON-serializable.`);
  }
  if (raw.length > maxChars) {
    throw browserError("BROWSER_RESULT_TOO_LARGE", `${label} exceeded ${maxChars} JSON characters (actual ${raw.length}).`);
  }
  return JSON.parse(raw);
}

function assertOptionsBounded(options) {
  if (options == null) return {};
  return jsonCloneBounded(options, MAX_OPTIONS_CHARS, "browser options");
}

function screenshotFileResult(record, result, args) {
  if (!result || typeof result.data_base64 !== "string") {
    throw browserError("BROWSER_SCREENSHOT_PROTOCOL_ERROR", "Browser adapter did not return screenshot base64 data.");
  }
  const data = Buffer.from(result.data_base64, "base64");
  const expectedBytes = Number(result.bytes);
  if (Number.isFinite(expectedBytes) && expectedBytes !== data.length) {
    throw browserError("BROWSER_SCREENSHOT_PROTOCOL_ERROR", `Screenshot byte count mismatch: adapter=${expectedBytes} decoded=${data.length}.`);
  }
  const destination = args.output_path
    ? path.resolve(args.output_path)
    : path.join(os.tmpdir(), "lconnect-browser-screenshots", `${record.browser}-${Date.now()}-${randomUUID()}.png`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination) && args.overwrite !== true) {
    throw browserError("BROWSER_SCREENSHOT_EXISTS", `Screenshot output already exists: ${destination}`);
  }
  fs.writeFileSync(destination, data);
  return {
    mime_type: result.mime_type || "image/png",
    bytes: data.length,
    path: destination,
    sha256: createHash("sha256").update(data).digest("hex"),
    result_mode: "file",
  };
}

function normalizeBackend(browser) {
  const value = String(browser || "").trim().toLowerCase();
  if (!SUPPORTED_BACKENDS.has(value)) {
    throw browserError("BROWSER_BACKEND_UNSUPPORTED", `Unsupported browser backend: ${browser}. Supported backends: firefox, chrome.`);
  }
  return value;
}

function normalizeCapabilities(capabilities, backend) {
  if (!Array.isArray(capabilities)) {
    throw browserError("BROWSER_ADAPTER_PROTOCOL_ERROR", `Adapter ${backend} must declare a capabilities array.`);
  }
  const out = [];
  for (const capability of capabilities) {
    const name = String(capability);
    if (!OPERATIONS.has(name)) {
      throw browserError("BROWSER_ADAPTER_PROTOCOL_ERROR", `Adapter ${backend} declared unknown capability: ${name}.`);
    }
    if (!out.includes(name)) out.push(name);
  }
  return out.sort();
}

function methodFor(capability) {
  return capability;
}

function publicSession(record) {
  return {
    browser_session_id: record.id,
    browser: record.browser,
    mode: record.mode,
    created_at: record.createdAt,
    capabilities: [...record.capabilities],
  };
}

export class BrowserCommonLayer {
  constructor({ maxSessions = MAX_SESSIONS, resultLimitChars = DEFAULT_RESULT_LIMIT } = {}) {
    this.maxSessions = maxSessions;
    this.resultLimitChars = resultLimitChars;
    this.adapters = new Map();
    this.sessions = new Map();
  }

  registerAdapter(browser, adapter) {
    const backend = normalizeBackend(browser);
    if (!adapter || typeof adapter !== "object") {
      throw browserError("BROWSER_ADAPTER_PROTOCOL_ERROR", `Adapter ${backend} must be an object.`);
    }
    const capabilities = normalizeCapabilities(adapter.capabilities, backend);
    for (const capability of capabilities) {
      const method = methodFor(capability);
      if (typeof adapter[method] !== "function") {
        throw browserError("BROWSER_ADAPTER_PROTOCOL_ERROR", `Adapter ${backend} declares ${capability} but does not implement ${method}().`);
      }
    }
    this.adapters.set(backend, { backend, adapter, capabilities });
    return { browser: backend, capabilities: [...capabilities] };
  }

  unregisterAdapter(browser) {
    const backend = normalizeBackend(browser);
    for (const session of this.sessions.values()) {
      if (session.browser === backend) {
        throw browserError("BROWSER_BACKEND_IN_USE", `Cannot unregister ${backend} while browser session ${session.id} is active.`);
      }
    }
    return this.adapters.delete(backend);
  }

  adapterStatus(browser) {
    const backend = normalizeBackend(browser);
    const entry = this.adapters.get(backend);
    return entry
      ? { browser: backend, available: true, capabilities: [...entry.capabilities] }
      : { browser: backend, available: false, capabilities: [] };
  }

  _requireAdapter(browser, capability) {
    const backend = normalizeBackend(browser);
    const entry = this.adapters.get(backend);
    if (!entry) {
      throw browserError("BROWSER_BACKEND_UNAVAILABLE", `Browser backend ${backend} is not registered. Complete/install its adapter first.`);
    }
    if (!entry.capabilities.includes(capability)) {
      throw browserError("BROWSER_CAPABILITY_UNAVAILABLE", `Browser backend ${backend} does not provide capability ${capability}.`);
    }
    return entry;
  }

  _requireSession(sessionId, capability) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw browserError("BROWSER_SESSION_NOT_FOUND", `Unknown browser_session_id: ${sessionId}.`);
    }
    if (!record.capabilities.includes(capability)) {
      throw browserError("BROWSER_CAPABILITY_UNAVAILABLE", `Browser session ${sessionId} does not provide capability ${capability}.`);
    }
    const entry = this.adapters.get(record.browser);
    if (!entry) {
      throw browserError("BROWSER_BACKEND_UNAVAILABLE", `Browser backend ${record.browser} is no longer registered.`);
    }
    return { record, entry };
  }

  _makeSession(browser, mode, entry, backendResult) {
    if (this.sessions.size >= this.maxSessions) {
      throw browserError("BROWSER_SESSION_LIMIT", `Browser session limit reached (${this.maxSessions}).`);
    }
    if (!backendResult || typeof backendResult !== "object" || !Object.hasOwn(backendResult, "handle")) {
      throw browserError("BROWSER_ADAPTER_PROTOCOL_ERROR", `Adapter ${browser} ${mode}() must return an object containing private handle.`);
    }
    const requestedCaps = backendResult.capabilities == null
      ? entry.capabilities
      : normalizeCapabilities(backendResult.capabilities, browser);
    const capabilities = requestedCaps.filter((cap) => entry.capabilities.includes(cap));
    const id = `browser-${randomUUID()}`;
    const record = {
      id,
      browser,
      mode,
      createdAt: new Date().toISOString(),
      capabilities,
      handle: backendResult.handle,
    };
    this.sessions.set(id, record);
    const { handle: _privateHandle, capabilities: _sessionCaps, ...publicResult } = backendResult;
    return {
      ok: true,
      session: publicSession(record),
      result: jsonCloneBounded(publicResult, this.resultLimitChars, `${browser} ${mode} result`),
    };
  }

  async start({ browser, url = null, headless = false, options = {} }) {
    const backend = normalizeBackend(browser);
    const entry = this._requireAdapter(backend, "start");
    const safeOptions = assertOptionsBounded(options);
    const backendResult = await entry.adapter.start({ url, headless: Boolean(headless), options: safeOptions });
    return this._makeSession(backend, "managed", entry, backendResult);
  }

  async attach({ browser, endpoint = null, options = {} }) {
    const backend = normalizeBackend(browser);
    const entry = this._requireAdapter(backend, "attach");
    const safeOptions = assertOptionsBounded(options);
    const backendResult = await entry.adapter.attach({ endpoint, options: safeOptions });
    return this._makeSession(backend, "attached", entry, backendResult);
  }

  async stop({ browser_session_id, close_remote_session = false }) {
    const { record, entry } = this._requireSession(browser_session_id, "stop");
    const result = await entry.adapter.stop(record.handle, {
      browser_session_id,
      close_remote_session: Boolean(close_remote_session),
    });
    this.sessions.delete(browser_session_id);
    return {
      ok: true,
      browser_session_id,
      browser: record.browser,
      result: jsonCloneBounded(result ?? {}, this.resultLimitChars, "browser stop result"),
    };
  }

  async _dispatch(browser_session_id, capability, args = {}, resultLimitChars = this.resultLimitChars) {
    const { record, entry } = this._requireSession(browser_session_id, capability);
    const method = methodFor(capability);
    const result = await entry.adapter[method](record.handle, { ...args, browser_session_id });
    return {
      ok: true,
      browser_session_id,
      browser: record.browser,
      result: jsonCloneBounded(result ?? {}, resultLimitChars, `browser ${capability} result`),
    };
  }

  tabs(args) { return this._dispatch(args.browser_session_id, "tabs", {}); }
  navigate(args) {
    return this._dispatch(args.browser_session_id, "navigate", {
      url: args.url,
      tab_id: args.tab_id ?? null,
      wait: args.wait ?? "complete",
      timeout_ms: args.timeout_ms ?? 30000,
    });
  }
  snapshot(args) {
    return this._dispatch(args.browser_session_id, "snapshot", {
      tab_id: args.tab_id ?? null,
      target: args.target ?? null,
      max_chars: args.max_chars ?? 100000,
      mode: args.mode ?? "dom",
      include_state: args.include_state ?? true,
    }, Math.min(this.resultLimitChars, (args.max_chars ?? 100000) + 50000));
  }
  click(args) {
    return this._dispatch(args.browser_session_id, "click", {
      tab_id: args.tab_id ?? null,
      target: args.target,
      button: args.button ?? "left",
      click_count: args.click_count ?? 1,
    });
  }
  type(args) {
    return this._dispatch(args.browser_session_id, "type", {
      tab_id: args.tab_id ?? null,
      target: args.target,
      text: args.text,
      clear: args.clear ?? false,
    });
  }
  async screenshot(args) {
    const { record, entry } = this._requireSession(args.browser_session_id, "screenshot");
    const maxBytes = args.max_bytes ?? 1000000;
    const resultMode = args.result_mode ?? "file";
    const adapterResult = await entry.adapter.screenshot(record.handle, {
      browser_session_id: args.browser_session_id,
      tab_id: args.tab_id ?? null,
      full_page: args.full_page ?? false,
      max_bytes: maxBytes,
    });
    const result = resultMode === "inline"
      ? { ...adapterResult, result_mode: "inline" }
      : screenshotFileResult(record, adapterResult, args);
    const jsonLimit = resultMode === "inline"
      ? Math.min(6000000, Math.max(this.resultLimitChars, Math.ceil(maxBytes * 1.45) + 32768))
      : this.resultLimitChars;
    return {
      ok: true,
      browser_session_id: args.browser_session_id,
      browser: record.browser,
      result: jsonCloneBounded(result, jsonLimit, "browser screenshot result"),
    };
  }
}

export const defaultBrowserCommonLayer = new BrowserCommonLayer();

const browserSchema = z.enum(["firefox", "chrome"]);
const sessionSchema = z.string().min(1).max(128);
const tabSchema = z.string().min(1).max(512).optional();
const targetSchema = z.string().min(1).max(4096);
const urlSchema = z.string().url().max(8192);
const primitivePreferenceSchema = z.union([z.string(), z.number(), z.boolean()]);
const browserStartOptionsSchema = z.object({
  firefox_binary: z.string().min(1).max(32767).optional(),
  geckodriver_path: z.string().min(1).max(32767).optional(),
  firefox_args: z.array(z.string().max(1024)).max(32).optional(),
  preferences: z.record(primitivePreferenceSchema).optional(),
  profile_root: z.string().min(1).max(32767).optional(),
  chrome_binary: z.string().min(1).max(32767).optional(),
  chrome_args: z.array(z.string().max(1024)).max(32).optional(),
  user_data_dir: z.string().min(1).max(32767).optional(),
  unsafe_allow_external_profile: z.boolean().optional(),
  startup_timeout_ms: z.number().int().min(100).max(120000).optional(),
  session_timeout_ms: z.number().int().min(100).max(120000).optional(),
  navigation_timeout_ms: z.number().int().min(100).max(120000).optional(),
  timeout_ms: z.number().int().min(100).max(120000).optional(),
  log_level: z.string().min(1).max(32).optional(),
}).strict().optional();

const browserAttachOptionsSchema = z.object({
  session_id: z.string().min(1).max(512).optional(),
  web_socket_url: z.string().min(1).max(8192).optional(),
  timeout_ms: z.number().int().min(100).max(120000).optional(),
  allow_remote_endpoint: z.boolean().optional(),
}).strict().optional();

export function registerBrowserCommonTools(server, _config, layer = defaultBrowserCommonLayer) {
  server.tool("browser_start", "Start an isolated managed browser session. Normal user profiles are never reused unless the caller explicitly opts into an external profile.", {
    browser: browserSchema,
    url: urlSchema.optional(),
    headless: z.boolean().optional(),
    options: browserStartOptionsSchema,
  }, async ({ browser, url, headless = false, options = {} }) => {
    try { return textResult(await layer.start({ browser, url, headless, options })); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_attach", "Attach to an explicitly automation-enabled browser endpoint. This never discovers or enables automation on a normal live profile.", {
    browser: browserSchema,
    endpoint: z.string().min(1).max(8192).optional(),
    options: browserAttachOptionsSchema,
  }, async ({ browser, endpoint, options = {} }) => {
    try { return textResult(await layer.attach({ browser, endpoint, options })); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_stop", "Stop a managed session or detach an attached session. Attached remote sessions are left running unless close_remote_session=true is explicitly requested.", {
    browser_session_id: sessionSchema,
    close_remote_session: z.boolean().optional(),
  }, async ({ browser_session_id, close_remote_session = false }) => {
    try { return textResult(await layer.stop({ browser_session_id, close_remote_session })); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_tabs", "List tabs/contexts through the browser session's registered adapter.", {
    browser_session_id: sessionSchema,
  }, async ({ browser_session_id }) => {
    try { return textResult(await layer.tabs({ browser_session_id })); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_navigate", "Navigate a browser tab using the common adapter-neutral API.", {
    browser_session_id: sessionSchema,
    url: urlSchema,
    tab_id: tabSchema,
    wait: z.enum(["none", "interactive", "complete"]).optional(),
    timeout_ms: z.number().int().min(100).max(120000).optional(),
  }, async (args) => {
    try { return textResult(await layer.navigate(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_snapshot", "Return a bounded DOM snapshot or accessibility-oriented snapshot through the active backend.", {
    browser_session_id: sessionSchema,
    tab_id: tabSchema,
    target: z.string().min(1).max(4096).optional(),
    max_chars: z.number().int().min(1000).max(200000).optional(),
    mode: z.enum(["dom", "accessibility"]).optional(),
    include_state: z.boolean().optional(),
  }, async (args) => {
    try { return textResult(await layer.snapshot(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_click", "Click a DOM target through the browser backend; native mouse fallback is not automatic.", {
    browser_session_id: sessionSchema,
    tab_id: tabSchema,
    target: targetSchema,
    button: z.enum(["left", "right", "middle"]).optional(),
    click_count: z.number().int().min(1).max(3).optional(),
  }, async (args) => {
    try { return textResult(await layer.click(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_type", "Type text into a DOM target through the browser backend; native keyboard fallback is not automatic.", {
    browser_session_id: sessionSchema,
    tab_id: tabSchema,
    target: targetSchema,
    text: z.string().max(200000),
    clear: z.boolean().optional(),
  }, async (args) => {
    try { return textResult(await layer.type(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_screenshot", "Capture a bounded screenshot. File-backed output is the default to avoid large MCP payloads; inline base64 is opt-in.", {
    browser_session_id: sessionSchema,
    tab_id: tabSchema,
    full_page: z.boolean().optional(),
    max_bytes: z.number().int().min(1024).max(4000000).optional(),
    result_mode: z.enum(["file", "inline"]).optional(),
    output_path: z.string().min(1).max(32767).optional(),
    overwrite: z.boolean().optional(),
  }, async (args) => {
    try { return textResult(await layer.screenshot(args)); }
    catch (error) { return textResult(error.message, true); }
  });
}
