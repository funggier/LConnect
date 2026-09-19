import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.MCP_ENABLE_POWERSHELL = "true";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

const client = new Client(
  { name: "lconnect-network-smoke", version: "1.0.2" },
  { capabilities: {} }
);

const cleanupPids = new Set();

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function parseJsonResult(result, toolName) {
  const text = textOf(result);
  if (result.isError) {
    throw new Error(`${toolName} returned isError: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${toolName} returned non-JSON output: ${text}\n${error.message}`);
  }
}

async function callJson(name, args = {}) {
  return parseJsonResult(
    await client.callTool({ name, arguments: args }),
    name
  );
}

async function startNodeFixture(code) {
  const info = await callJson("start_process", {
    program: process.execPath,
    args: ["-e", code],
    cwd: root,
  });
  cleanupPids.add(info.pid);
  return info;
}

async function waitForPrintedPort(sessionId, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const info = await callJson("read_process_output", { session_id: sessionId });
    const match = (info.stdout || "").match(/PORT=(\d+)/);
    if (match) return Number(match[1]);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for fixture port from ${sessionId}`);
}

async function killBestEffort(pid) {
  try {
    await client.callTool({
      name: "kill_process",
      arguments: { pid, force: true, tree: true },
    });
  } catch {}
}

try {
  await client.connect(transport);

  const tcpFixture = await startNodeFixture(
    "const net=require('node:net'); const s=net.createServer((c)=>c.end()); s.listen(0,'127.0.0.1',()=>console.log('PORT='+s.address().port)); setInterval(()=>{},1000);"
  );
  const tcpPort = await waitForPrintedPort(tcpFixture.session_id);

  const udpFixture = await startNodeFixture(
    "const d=require('node:dgram').createSocket('udp4'); d.bind(0,'127.0.0.1',()=>console.log('PORT='+d.address().port)); setInterval(()=>{},1000);"
  );
  const udpPort = await waitForPrintedPort(udpFixture.session_id);

  const tcp = await callJson("tcp_connections", {
    local_port: tcpPort,
    state: "LISTENING",
    limit: 20,
  });
  if (!tcp.connections.some((item) => item.pid === tcpFixture.pid && item.local_port === tcpPort)) {
    throw new Error(`tcp_connections did not find fixture listener: ${JSON.stringify(tcp)}`);
  }

  const owner = await callJson("port_owner", {
    port: tcpPort,
    protocol: "tcp",
  });
  const ownerEntry = owner.endpoints.find((item) => item.pid === tcpFixture.pid);
  if (!ownerEntry) {
    throw new Error(`port_owner did not correlate fixture PID: ${JSON.stringify(owner)}`);
  }

  const portTest = await callJson("port_test", {
    host: "127.0.0.1",
    port: tcpPort,
    timeout_ms: 2000,
  });
  if (!portTest.reachable) {
    throw new Error(`port_test could not connect to fixture listener: ${JSON.stringify(portTest)}`);
  }

  const udp = await callJson("udp_endpoints", {
    local_port: udpPort,
    limit: 20,
  });
  if (!udp.endpoints.some((item) => item.pid === udpFixture.pid && item.local_port === udpPort)) {
    throw new Error(`udp_endpoints did not find fixture socket: ${JSON.stringify(udp)}`);
  }

  const dns = await callJson("dns_lookup", { host: "localhost" });
  if (!dns.found || !Array.isArray(dns.addresses) || dns.addresses.length === 0) {
    throw new Error(`dns_lookup localhost failed: ${JSON.stringify(dns)}`);
  }

  const interfaces = await callJson("network_interfaces");
  if (!Array.isArray(interfaces.interfaces) || interfaces.interfaces.length === 0) {
    throw new Error("network_interfaces returned no interface addresses");
  }

  const ping = await callJson("ping_host", {
    host: "127.0.0.1",
    count: 1,
    timeout_ms: 1000,
  });
  if (!ping.success || ping.success_count < 1) {
    throw new Error(`ping_host loopback failed: ${JSON.stringify(ping)}`);
  }

  console.log("tcp_connections fixture listener: PASS");
  console.log("port_owner PID correlation: PASS");
  console.log("port_test local listener: PASS");
  console.log("udp_endpoints fixture socket: PASS");
  console.log("dns_lookup localhost: PASS");
  console.log("network_interfaces: PASS");
  console.log("ping_host loopback: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  for (const pid of cleanupPids) {
    await killBestEffort(pid);
  }
  await transport.close();
}
