import dns from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import { z } from "zod";
import { runPowerShell } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function parseEndpoint(value) {
  if (!value) return { address: null, port: null };
  if (value === "*:*") return { address: "*", port: null };

  if (value.startsWith("[")) {
    const close = value.lastIndexOf("]");
    if (close >= 0 && value[close + 1] === ":") {
      const portText = value.slice(close + 2);
      return {
        address: value.slice(1, close),
        port: /^\d+$/.test(portText) ? Number(portText) : null,
      };
    }
  }

  const colon = value.lastIndexOf(":");
  if (colon < 0) return { address: value, port: null };

  const portText = value.slice(colon + 1);
  return {
    address: value.slice(0, colon),
    port: /^\d+$/.test(portText) ? Number(portText) : null,
  };
}

function parseNetstat(stdout, protocol) {
  const rows = [];

  for (const rawLine of String(stdout || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts[0]?.toUpperCase() !== protocol.toUpperCase()) continue;

    if (protocol.toUpperCase() === "TCP") {
      if (parts.length < 5) continue;
      const local = parseEndpoint(parts[1]);
      const remote = parseEndpoint(parts[2]);
      const pid = Number(parts[4]);
      if (!Number.isInteger(pid)) continue;

      rows.push({
        protocol: "tcp",
        local_address: local.address,
        local_port: local.port,
        remote_address: remote.address,
        remote_port: remote.port,
        state: String(parts[3] || "").toUpperCase(),
        pid,
      });
    } else {
      if (parts.length < 4) continue;
      const local = parseEndpoint(parts[1]);
      const remote = parseEndpoint(parts[2]);
      const pid = Number(parts[3]);
      if (!Number.isInteger(pid)) continue;

      rows.push({
        protocol: "udp",
        local_address: local.address,
        local_port: local.port,
        remote_address: remote.address,
        remote_port: remote.port,
        pid,
      });
    }
  }

  return rows;
}

async function runNetstat(protocol, config) {
  const proto = protocol.toLowerCase() === "udp" ? "udp" : "tcp";
  const script = [
    `& "$env:SystemRoot\\System32\\netstat.exe" -ano -p ${proto}`,
    "if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
  ].join("; ");

  const result = await runPowerShell(script, {
    timeoutSeconds: 30,
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error) throw new Error(`Failed to launch netstat: ${result.error}`);
  if (result.timedOut) throw new Error("netstat timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`netstat failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }

  return parseNetstat(result.stdout, proto.toUpperCase());
}

function matchesAddress(actual, wanted) {
  return String(actual || "").toLowerCase() === String(wanted || "").toLowerCase();
}

function filterTcp(rows, filters) {
  const matched = rows.filter((row) => {
    if (filters.state && row.state !== String(filters.state).toUpperCase()) return false;
    if (filters.local_port != null && row.local_port !== filters.local_port) return false;
    if (filters.remote_port != null && row.remote_port !== filters.remote_port) return false;
    if (filters.pid != null && row.pid !== filters.pid) return false;
    if (filters.local_address && !matchesAddress(row.local_address, filters.local_address)) return false;
    if (filters.remote_address && !matchesAddress(row.remote_address, filters.remote_address)) return false;
    return true;
  });

  const limit = filters.limit ?? 500;
  return {
    count: Math.min(matched.length, limit),
    truncated: matched.length > limit,
    connections: matched.slice(0, limit),
  };
}

function filterUdp(rows, filters) {
  const matched = rows.filter((row) => {
    if (filters.local_port != null && row.local_port !== filters.local_port) return false;
    if (filters.pid != null && row.pid !== filters.pid) return false;
    if (filters.local_address && !matchesAddress(row.local_address, filters.local_address)) return false;
    return true;
  });

  const limit = filters.limit ?? 500;
  return {
    count: Math.min(matched.length, limit),
    truncated: matched.length > limit,
    endpoints: matched.slice(0, limit),
  };
}

async function processInfoForPids(pids, config) {
  const ids = [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
  if (!ids.length) return new Map();

  const idText = ids.join(",");
  const script = [
    `$ids = @(${idText})`,
    "$items = @(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object {",
    "  [pscustomobject]@{ pid = [int]$_.Id; process_name = [string]$_.ProcessName; executable_path = if ($null -eq $_.Path) { $null } else { [string]$_.Path } }",
    "})",
    "ConvertTo-Json -InputObject $items -Compress",
  ].join("\n");

  const result = await runPowerShell(script, {
    timeoutSeconds: 20,
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error || result.timedOut || result.code) return new Map();

  const raw = (result.stdout || "").trim();
  if (!raw) return new Map();

  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return new Map(items.map((item) => [item.pid, item]));
  } catch {
    return new Map();
  }
}

function connectPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const started = performance.now();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve({
        host,
        port,
        timeout_ms: timeoutMs,
        elapsed_ms: Math.round(performance.now() - started),
        ...result,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      finish({
        reachable: true,
        local_address: socket.localAddress ?? null,
        local_port: socket.localPort ?? null,
        remote_address: socket.remoteAddress ?? null,
        remote_port: socket.remotePort ?? null,
      });
    });

    socket.once("timeout", () => {
      finish({
        reachable: false,
        timed_out: true,
        error_code: "ETIMEDOUT",
        error_message: "Connection attempt timed out.",
      });
    });

    socket.once("error", (error) => {
      finish({
        reachable: false,
        timed_out: false,
        error_code: error.code ?? null,
        error_message: error.message,
      });
    });

    socket.connect({ host, port });
  });
}

async function pingWithDotNet(host, count, timeoutMs, config) {
  const hostLiteral = psLiteral(host);
  const script = [
    `$hostName = ${hostLiteral}`,
    `$count = ${count}`,
    `$timeout = ${timeoutMs}`,
    "$ping = New-Object System.Net.NetworkInformation.Ping",
    "$items = @()",
    "for ($i = 0; $i -lt $count; $i++) {",
    "  try {",
    "    $reply = $ping.Send($hostName, $timeout)",
    "    $items += [pscustomobject]@{",
    "      sequence = $i + 1",
    "      success = ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success)",
    "      status = [string]$reply.Status",
    "      address = if ($null -eq $reply.Address) { $null } else { $reply.Address.ToString() }",
    "      roundtrip_time_ms = if ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) { [long]$reply.RoundtripTime } else { $null }",
    "      buffer_size = if ($null -eq $reply.Buffer) { 0 } else { [int]$reply.Buffer.Length }",
    "    }",
    "  } catch {",
    "    $items += [pscustomobject]@{ sequence = $i + 1; success = $false; status = 'Exception'; address = $null; roundtrip_time_ms = $null; buffer_size = 0; error = $_.Exception.Message }",
    "  }",
    "}",
    "$ping.Dispose()",
    "$successes = @($items | Where-Object { $_.success })",
    "$avg = if ($successes.Count -gt 0) { [math]::Round((($successes | Measure-Object -Property roundtrip_time_ms -Average).Average), 2) } else { $null }",
    "[pscustomobject]@{ host = $hostName; count = $count; success_count = $successes.Count; success = ($successes.Count -gt 0); average_roundtrip_time_ms = $avg; replies = $items } | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");

  const totalSeconds = Math.ceil((count * timeoutMs) / 1000) + 10;
  const result = await runPowerShell(script, {
    timeoutSeconds: Math.min(config.shell.maxTimeoutSeconds, totalSeconds),
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error) throw new Error(`Failed to launch ping operation: ${result.error}`);
  if (result.timedOut) throw new Error("Ping operation timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Ping operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }

  const raw = (result.stdout || "").trim();
  if (!raw) return { host, count, success_count: 0, success: false, replies: [] };
  return JSON.parse(raw);
}

export function registerNetworkTools(server, config) {
  const executionEnabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  server.tool("tcp_connections", "List structured local TCP connections using lightweight netstat parsing.", {
    state: z.string().min(1).optional(),
    local_address: z.string().min(1).optional(),
    local_port: z.number().int().min(0).max(65535).optional(),
    remote_address: z.string().min(1).optional(),
    remote_port: z.number().int().min(0).max(65535).optional(),
    pid: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
  }, async (filters) => {
    try {
      if (!executionEnabled) throw new Error("TCP inspection requires shell execution to be enabled.");
      return textResult(filterTcp(await runNetstat("tcp", config), filters));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("udp_endpoints", "List structured local UDP endpoints using lightweight netstat parsing.", {
    local_address: z.string().min(1).optional(),
    local_port: z.number().int().min(0).max(65535).optional(),
    pid: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
  }, async (filters) => {
    try {
      if (!executionEnabled) throw new Error("UDP inspection requires shell execution to be enabled.");
      return textResult(filterUdp(await runNetstat("udp", config), filters));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("port_owner", "Find local TCP/UDP endpoints using a port and correlate owning PIDs with process metadata.", {
    port: z.number().int().min(0).max(65535),
    protocol: z.enum(["tcp", "udp", "both"]).optional(),
    local_address: z.string().min(1).optional(),
  }, async ({ port, protocol = "both", local_address }) => {
    try {
      if (!executionEnabled) throw new Error("Port ownership inspection requires shell execution to be enabled.");

      const rows = [];
      if (protocol === "tcp" || protocol === "both") {
        rows.push(...(await runNetstat("tcp", config)).filter((row) =>
          row.local_port === port && (!local_address || matchesAddress(row.local_address, local_address))
        ));
      }
      if (protocol === "udp" || protocol === "both") {
        rows.push(...(await runNetstat("udp", config)).filter((row) =>
          row.local_port === port && (!local_address || matchesAddress(row.local_address, local_address))
        ));
      }

      const processMap = await processInfoForPids(rows.map((row) => row.pid), config);
      const endpoints = rows.map((row) => ({
        ...row,
        process: processMap.get(row.pid) ?? null,
      }));

      return textResult({
        port,
        protocol,
        local_address: local_address ?? null,
        count: endpoints.length,
        endpoints,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("port_test", "Test a TCP connection to a host/port with a bounded timeout.", {
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    timeout_ms: z.number().int().min(100).max(30000).optional(),
  }, async ({ host, port, timeout_ms = 3000 }) => {
    try {
      return textResult(await connectPort(host, port, timeout_ms));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("dns_lookup", "Resolve a hostname using the operating system resolver.", {
    host: z.string().min(1),
    family: z.enum(["any", "ipv4", "ipv6"]).optional(),
  }, async ({ host, family = "any" }) => {
    try {
      const familyNumber = family === "ipv4" ? 4 : family === "ipv6" ? 6 : 0;
      const addresses = await dns.lookup(host, {
        all: true,
        family: familyNumber,
        verbatim: true,
      });
      return textResult({
        host,
        family,
        found: addresses.length > 0,
        addresses: addresses.map((item) => ({
          address: item.address,
          family: item.family === 6 ? "ipv6" : "ipv4",
        })),
      });
    } catch (error) {
      return textResult({
        host,
        family,
        found: false,
        addresses: [],
        error_code: error.code ?? null,
        error_message: error.message,
      });
    }
  });

  server.tool("network_interfaces", "Return structured local network interface addresses from Node/OS APIs.", {}, async () => {
    try {
      const interfaces = [];
      for (const [name, entries] of Object.entries(os.networkInterfaces())) {
        for (const item of entries || []) {
          interfaces.push({
            name,
            address: item.address,
            family: item.family,
            netmask: item.netmask,
            mac: item.mac,
            internal: item.internal,
            cidr: item.cidr ?? null,
            scopeid: item.scopeid ?? null,
          });
        }
      }

      interfaces.sort((a, b) =>
        a.name.localeCompare(b.name) || String(a.address).localeCompare(String(b.address))
      );

      return textResult({ count: interfaces.length, interfaces });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("ping_host", "Send bounded ICMP echo requests using .NET Ping and return structured replies.", {
    host: z.string().min(1),
    count: z.number().int().min(1).max(5).optional(),
    timeout_ms: z.number().int().min(100).max(5000).optional(),
  }, async ({ host, count = 1, timeout_ms = 1000 }) => {
    try {
      if (!executionEnabled) throw new Error("Ping requires shell execution to be enabled.");
      return textResult(await pingWithDotNet(host, count, timeout_ms, config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });
}
