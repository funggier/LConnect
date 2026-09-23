import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function normalizeCompare(value) {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(candidate, root) {
  const c = normalizeCompare(candidate);
  const r = normalizeCompare(root);
  return c === r || c.startsWith(r + path.sep.toLowerCase());
}

function resolveAllowedPath(inputPath, config) {
  if (!inputPath || typeof inputPath !== "string") throw new Error("A destination path is required.");
  const resolved = path.resolve(inputPath);
  if (config.fullMachineAccess) return resolved;
  if (!config.allowedDirectories.some((root) => isWithin(resolved, root))) {
    throw new Error(`Access denied - path outside allowed directories: ${resolved}`);
  }
  return resolved;
}

function headersObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) out[key] = value;
  return out;
}

function redirectMode(value) {
  if (value === "manual" || value === "error") return value;
  return "follow";
}

function httpTimeoutError(timeoutMs, startedAt) {
  const wrapped = new Error(`HTTP request timed out after ${timeoutMs} ms`);
  wrapped.code = "ETIMEDOUT";
  wrapped.timeoutMs = timeoutMs;
  wrapped.localElapsedMs = Math.round(performance.now() - startedAt);
  wrapped.completedAt = new Date().toISOString();
  return wrapped;
}

async function withFetchDeadline(url, options, timeoutMs, consume) {
  const controller = new AbortController();
  const startedAt = performance.now();
  let deadlineExpired = false;
  let timer = null;

  const operation = (async () => {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return await consume(response);
  })();

  // If the outer timeout wins, the underlying fetch/body operation may reject a
  // moment later because of AbortSignal propagation. Mark it handled now so a
  // late rejection can never become an unhandled rejection after we already
  // returned the timeout result to MCP.
  operation.catch(() => {});

  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      deadlineExpired = true;
      try { controller.abort(); } catch {}
      // Settle the MCP-facing operation immediately at the deadline. Do not
      // depend on fetch/body readers observing AbortSignal before returning.
      reject(httpTimeoutError(timeoutMs, startedAt));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    if (deadlineExpired || error?.name === "AbortError") {
      if (error?.code === "ETIMEDOUT") throw error;
      throw httpTimeoutError(timeoutMs, startedAt);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBoundedBody(response, maxBytes) {
  if (!response.body) {
    return { bytes: Buffer.alloc(0), truncated: false, original_bytes_at_least: 0 };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      if (total + chunk.length <= maxBytes) {
        chunks.push(chunk);
        total += chunk.length;
      } else {
        const remain = Math.max(0, maxBytes - total);
        if (remain) chunks.push(chunk.subarray(0, remain));
        total += chunk.length;
        truncated = true;
        try { await reader.cancel(); } catch {}
        break;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return {
    bytes: Buffer.concat(chunks),
    truncated,
    original_bytes_at_least: truncated ? total : Buffer.concat(chunks).length,
  };
}

function decodeBody(buffer, contentType, mode) {
  const type = String(contentType || "").toLowerCase();
  const selected = mode === "auto"
    ? (type.includes("application/json") ? "json"
      : type.startsWith("text/") || type.includes("xml") || type.includes("javascript") || type.includes("x-www-form-urlencoded")
        ? "text"
        : "base64")
    : mode;

  if (selected === "base64") {
    return { body_mode: "base64", body: buffer.toString("base64") };
  }

  const text = buffer.toString("utf8");
  if (selected === "json") {
    if (!text) return { body_mode: "json", body: null };
    try {
      return { body_mode: "json", body: JSON.parse(text) };
    } catch (error) {
      return {
        body_mode: "text",
        body: text,
        json_parse_error: error.message,
      };
    }
  }
  return { body_mode: "text", body: text };
}

function buildRequestBody(bodyText, bodyJson, headers) {
  if (bodyText !== undefined && bodyJson !== undefined) {
    throw new Error("Use either body_text or body_json, not both.");
  }
  if (bodyJson !== undefined) {
    const h = new Headers(headers || {});
    if (!h.has("content-type")) h.set("content-type", "application/json");
    return { body: JSON.stringify(bodyJson), headers: Object.fromEntries(h.entries()) };
  }
  return { body: bodyText, headers: headers || {} };
}

async function requestData(args) {
  const {
    url,
    method = "GET",
    headers = {},
    body_text,
    body_json,
    timeout_ms = 10000,
    redirect = "follow",
    max_body_bytes = 120000,
    body_mode = "auto",
  } = args;
  const built = buildRequestBody(body_text, body_json, headers);
  const started = performance.now();
  return withFetchDeadline(url, {
    method,
    headers: built.headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : built.body,
    redirect: redirectMode(redirect),
  }, timeout_ms, async (response) => {
    const bounded = method === "HEAD"
      ? { bytes: Buffer.alloc(0), truncated: false, original_bytes_at_least: 0 }
      : await readBoundedBody(response, max_body_bytes);
    const decoded = decodeBody(bounded.bytes, response.headers.get("content-type"), body_mode);
    return {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText,
      url: response.url,
      redirected: response.redirected,
      elapsed_ms: Math.round(performance.now() - started),
      headers: headersObject(response.headers),
      bytes_returned: bounded.bytes.length,
      truncated: bounded.truncated,
      original_bytes_at_least: bounded.original_bytes_at_least,
      ...decoded,
    };
  });
}

async function streamDownload(url, destination, options, config) {
  const dest = resolveAllowedPath(destination, config);
  const timeoutMs = options.timeout_ms ?? 30000;
  const maxBytes = options.max_bytes ?? 1073741824;
  const overwrite = Boolean(options.overwrite);

  if (!overwrite && fs.existsSync(dest)) throw new Error(`Destination already exists: ${dest}`);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const temp = dest + `.lconnect-download-${process.pid}-${Date.now()}.tmp`;

  let response;
  let handle;
  let written = 0;
  try {
    return await withFetchDeadline(url, {
      method: "GET",
      headers: options.headers || {},
      redirect: redirectMode(options.redirect || "follow"),
    }, timeoutMs, async (activeResponse) => {
      response = activeResponse;
      if (!response.ok) {
        throw new Error(`HTTP download failed: ${response.status} ${response.statusText}`);
      }

      handle = await fsp.open(temp, "w");
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            written += chunk.length;
            if (written > maxBytes) {
              try { await reader.cancel(); } catch {}
              throw new Error(`Download exceeded max_bytes=${maxBytes}`);
            }
            await handle.write(chunk);
          }
        } finally {
          try { reader.releaseLock(); } catch {}
        }
      }
      await handle.close();
      handle = null;

      if (overwrite && fs.existsSync(dest)) await fsp.rm(dest, { force: true });
      await fsp.rename(temp, dest);

      return {
        downloaded: true,
        url: response.url,
        destination: dest,
        bytes_written: written,
        status: response.status,
        headers: headersObject(response.headers),
      };
    });
  } catch (error) {
    try { if (handle) await handle.close(); } catch {}
    try { await fsp.rm(temp, { force: true }); } catch {}
    throw error;
  }
}

export function registerHttpTools(server, config) {
  const maxRequestMs = Math.max(
    100,
    Math.floor(config.mcp.maxSynchronousRequestSeconds * 1000)
  );
  const boundedTimeoutMs = (value, fallback) =>
    Math.min(Number(value ?? fallback), maxRequestMs);

  const timingEvidence = (startedAt, requestedTimeoutMs, effectiveTimeoutMs, error = null) => ({
    timeout_requested_ms: requestedTimeoutMs,
    timeout_effective_ms: effectiveTimeoutMs,
    timeout_capped: effectiveTimeoutMs < requestedTimeoutMs,
    handler_elapsed_ms: Math.round(performance.now() - startedAt),
    deadline_elapsed_ms: error?.localElapsedMs ?? null,
    completed_at: error?.completedAt ?? new Date().toISOString(),
  });

  const errorPayload = (
    error,
    startedAt,
    requestedTimeoutMs,
    effectiveTimeoutMs,
    base = {}
  ) => ({
    ...base,
    error_code: error.code ?? null,
    error_message: error.message,
    ...timingEvidence(startedAt, requestedTimeoutMs, effectiveTimeoutMs, error),
  });

  const common = {
    url: z.string().url(),
    timeout_ms: z.number().int().min(100).max(60000).optional(),
    redirect: z.enum(["follow", "manual", "error"]).optional(),
  };

  server.tool("http_request", "Make a bounded HTTP request and return structured status, headers and body.", {
    ...common,
    method: z.enum(["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]).optional(),
    headers: z.record(z.string()).optional(),
    body_text: z.string().optional(),
    body_json: z.any().optional(),
    max_body_bytes: z.number().int().min(0).max(5000000).optional(),
    body_mode: z.enum(["auto","text","json","base64"]).optional(),
  }, async (args) => {
    const startedAt = performance.now();
    const requestedTimeoutMs = Number(args.timeout_ms ?? 10000);
    const effectiveTimeoutMs = boundedTimeoutMs(args.timeout_ms, 10000);
    try {
      const result = await requestData({
        ...args,
        timeout_ms: effectiveTimeoutMs,
      });
      return textResult({
        ...result,
        ...timingEvidence(startedAt, requestedTimeoutMs, effectiveTimeoutMs),
      });
    } catch (error) {
      return textResult(
        errorPayload(
          error,
          startedAt,
          requestedTimeoutMs,
          effectiveTimeoutMs,
          { ok: false }
        ),
        true
      );
    }
  });

  server.tool("http_probe", "Probe an HTTP endpoint with HEAD, optionally falling back to GET for 405/501.", {
    ...common,
    headers: z.record(z.string()).optional(),
    fallback_get: z.boolean().optional(),
  }, async ({ url, timeout_ms = 5000, redirect = "follow", headers = {}, fallback_get = true }) => {
    const startedAt = performance.now();
    const requestedTimeoutMs = Number(timeout_ms);
    const effectiveTimeoutMs = boundedTimeoutMs(timeout_ms, 5000);
    try {
      let result = await requestData({
        url, method: "HEAD", timeout_ms: effectiveTimeoutMs, redirect, headers, max_body_bytes: 0, body_mode: "text"
      });
      if (fallback_get && [405, 501].includes(result.status)) {
        result = await requestData({
          url, method: "GET", timeout_ms: effectiveTimeoutMs, redirect, headers, max_body_bytes: 1024, body_mode: "text"
        });
        result.fallback_method = "GET";
      }
      return textResult({
        ...result,
        ...timingEvidence(startedAt, requestedTimeoutMs, effectiveTimeoutMs),
      });
    } catch (error) {
      return textResult(
        errorPayload(
          error,
          startedAt,
          requestedTimeoutMs,
          effectiveTimeoutMs,
          { ok: false }
        ),
        true
      );
    }
  });

  server.tool("http_headers", "Read HTTP response headers with a bounded HEAD request.", {
    ...common,
    headers: z.record(z.string()).optional(),
  }, async ({ url, timeout_ms = 5000, redirect = "follow", headers = {} }) => {
    const startedAt = performance.now();
    const requestedTimeoutMs = Number(timeout_ms);
    const effectiveTimeoutMs = boundedTimeoutMs(timeout_ms, 5000);
    try {
      const result = await requestData({
        url, method: "HEAD", timeout_ms: effectiveTimeoutMs, redirect, headers, max_body_bytes: 0, body_mode: "text"
      });
      return textResult({
        ok: result.ok,
        status: result.status,
        status_text: result.status_text,
        url: result.url,
        redirected: result.redirected,
        elapsed_ms: result.elapsed_ms,
        headers: result.headers,
        ...timingEvidence(startedAt, requestedTimeoutMs, effectiveTimeoutMs),
      });
    } catch (error) {
      return textResult(
        errorPayload(
          error,
          startedAt,
          requestedTimeoutMs,
          effectiveTimeoutMs,
          { ok: false }
        ),
        true
      );
    }
  });

  server.tool("http_download", "Download an HTTP resource to a file with timeout, size limit and atomic temp-file replacement.", {
    ...common,
    destination: z.string().min(1),
    headers: z.record(z.string()).optional(),
    overwrite: z.boolean().optional(),
    max_bytes: z.number().int().min(1).max(5368709120).optional(),
  }, async ({ url, destination, timeout_ms, redirect, headers, overwrite, max_bytes }) => {
    const startedAt = performance.now();
    const requestedTimeoutMs = Number(timeout_ms ?? 30000);
    const effectiveTimeoutMs = boundedTimeoutMs(timeout_ms, 30000);
    try {
      const result = await streamDownload(url, destination, {
        timeout_ms: effectiveTimeoutMs, redirect, headers, overwrite, max_bytes
      }, config);
      return textResult({
        ...result,
        ...timingEvidence(startedAt, requestedTimeoutMs, effectiveTimeoutMs),
      });
    } catch (error) {
      return textResult(
        errorPayload(
          error,
          startedAt,
          requestedTimeoutMs,
          effectiveTimeoutMs,
          { downloaded: false }
        ),
        true
      );
    }
  });
}
