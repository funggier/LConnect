import http from "node:http";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

const client = new Client(
  { name: "lconnect-http-smoke", version: "1.0.2" },
  { capabilities: {} }
);

let server;
let tempRoot;

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

async function callJson(name, args = {}, allowError = false) {
  const result = await client.callTool({ name, arguments: args });
  const text = textOf(result);
  if (result.isError && !allowError) {
    throw new Error(`${name} returned isError: ${text}`);
  }
  try {
    return { data: JSON.parse(text), isError: Boolean(result.isError) };
  } catch (error) {
    throw new Error(`${name} returned non-JSON output: ${text}\n${error.message}`);
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-http-smoke-"));

  server = http.createServer((req, res) => {
    if (req.url === "/json") {
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "content-type": "application/json",
          "x-lconnect-test": "headers-ok",
        });
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "application/json",
        "x-lconnect-test": "json-ok",
      });
      res.end(JSON.stringify({ ok: true, method: req.method }));
      return;
    }

    if (req.url === "/echo" && req.method === "POST") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        res.end(JSON.stringify({ body, parsed }));
      });
      return;
    }

    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/json" });
      res.end();
      return;
    }

    if (req.url === "/probe-fallback") {
      if (req.method === "HEAD") {
        res.writeHead(405, { allow: "GET" });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("probe-get-ok");
      }
      return;
    }

    if (req.url === "/large") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("x".repeat(4096));
      return;
    }

    if (req.url === "/binary") {
      const data = Buffer.from([0,1,2,3,4,5,6,7,8,9]);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(data.length),
      });
      res.end(data);
      return;
    }

    if (req.url === "/slow") {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("late");
      }, 1000);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });

  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;

  await client.connect(transport);

  const json = await callJson("http_request", {
    url: base + "/json",
    body_mode: "json",
  });
  if (!json.data.ok || json.data.status !== 200 || json.data.body?.ok !== true) {
    throw new Error(`http_request JSON failed: ${JSON.stringify(json.data)}`);
  }

  const echo = await callJson("http_request", {
    url: base + "/echo",
    method: "POST",
    body_json: { hello: "world" },
    body_mode: "json",
  });
  if (echo.data.body?.parsed?.hello !== "world") {
    throw new Error("http_request body_json POST failed");
  }

  const redirect = await callJson("http_request", {
    url: base + "/redirect",
    redirect: "manual",
    body_mode: "text",
  });
  if (redirect.data.status !== 302 || redirect.data.redirected) {
    throw new Error("http_request manual redirect behavior failed");
  }

  const bounded = await callJson("http_request", {
    url: base + "/large",
    max_body_bytes: 100,
    body_mode: "text",
  });
  if (!bounded.data.truncated || bounded.data.bytes_returned !== 100 || bounded.data.body.length !== 100) {
    throw new Error(`http_request body bound failed: ${JSON.stringify(bounded.data)}`);
  }

  const probe = await callJson("http_probe", {
    url: base + "/probe-fallback",
    fallback_get: true,
  });
  if (!probe.data.ok || probe.data.status !== 200 || probe.data.fallback_method !== "GET") {
    throw new Error(`http_probe fallback failed: ${JSON.stringify(probe.data)}`);
  }

  const headers = await callJson("http_headers", {
    url: base + "/json",
  });
  if (headers.data.headers["x-lconnect-test"] !== "headers-ok") {
    throw new Error("http_headers did not return expected header");
  }

  const timed = await callJson("http_request", {
    url: base + "/slow",
    timeout_ms: 100,
  }, true);
  if (!timed.isError || timed.data.error_code !== "ETIMEDOUT") {
    throw new Error(`http_request timeout contract failed: ${JSON.stringify(timed)}`);
  }

  const destination = path.join(tempRoot, "download.bin");
  const download = await callJson("http_download", {
    url: base + "/binary",
    destination,
    max_bytes: 100,
  });
  if (!download.data.downloaded || download.data.bytes_written !== 10) {
    throw new Error("http_download failed");
  }
  const bytes = await fsp.readFile(destination);
  if (bytes.length !== 10 || bytes[9] !== 9) {
    throw new Error("http_download file contents mismatch");
  }

  const exists = await callJson("http_download", {
    url: base + "/binary",
    destination,
  }, true);
  if (!exists.isError || !String(exists.data.error_message).includes("Destination already exists")) {
    throw new Error("http_download overwrite protection failed");
  }

  const limitedPath = path.join(tempRoot, "limited.bin");
  const limited = await callJson("http_download", {
    url: base + "/large",
    destination: limitedPath,
    max_bytes: 100,
  }, true);
  if (!limited.isError || !String(limited.data.error_message).includes("max_bytes")) {
    throw new Error("http_download max_bytes guard failed");
  }
  await fsp.access(limitedPath).then(
    () => { throw new Error("http_download left a destination after max_bytes failure"); },
    () => {}
  );

  console.log("http_request JSON/POST: PASS");
  console.log("http_request redirect/bounded body/timeout: PASS");
  console.log("http_probe HEAD->GET fallback: PASS");
  console.log("http_headers: PASS");
  console.log("http_download atomic/overwrite/size guard: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
