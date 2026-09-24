import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function parseBoundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function loadLConnectConfig(importMetaUrl) {
  const installRoot = path.dirname(fileURLToPath(importMetaUrl));
  const configPath = path.join(installRoot, "lconnect-config.json");

  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  const fullMachineAccess = parseBoolean(
    process.env.LCONNECT_FULL_MACHINE_ACCESS,
    config.fullMachineAccess !== false
  );

  const configured = Array.isArray(config.allowedDirectories) && config.allowedDirectories.length
    ? config.allowedDirectories
    : [".."];

  const envRoots = process.env.LCONNECT_ALLOWED_DIRECTORIES
    ? process.env.LCONNECT_ALLOWED_DIRECTORIES.split(path.delimiter).filter(Boolean)
    : [];

  const allowedDirectories = [...configured, ...envRoots].map((entry) =>
    path.resolve(installRoot, entry)
  );

  const maxSynchronousRequestSeconds = parseBoundedNumber(
    process.env.LCONNECT_MAX_SYNCHRONOUS_REQUEST_SECONDS ??
      config.mcp?.maxSynchronousRequestSeconds,
    15,
    1,
    120
  );

  const telemetryEnabled = parseBoolean(
    process.env.LCONNECT_TELEMETRY_ENABLED,
    config.telemetry?.enabled !== false
  );

  const telemetryMaxEvents = parseBoundedNumber(
    process.env.LCONNECT_TELEMETRY_MAX_EVENTS ??
      config.telemetry?.maxEvents,
    500,
    10,
    5000
  );

  return {
    installRoot,
    configPath,
    fullMachineAccess,
    allowedDirectories,
    shell: {
      enabled: config.shell?.enabled !== false,
      maxOutputChars: Number(config.shell?.maxOutputChars ?? 120000),
      defaultTimeoutSeconds: Number(config.shell?.defaultTimeoutSeconds ?? 60),
      maxTimeoutSeconds: Number(config.shell?.maxTimeoutSeconds ?? 600),
    },
    process: {
      maxBufferedOutputChars: Number(config.process?.maxBufferedOutputChars ?? 240000),
    },
    mcp: {
      maxSynchronousRequestSeconds,
    },
    telemetry: {
      enabled: telemetryEnabled,
      maxEvents: Math.floor(telemetryMaxEvents),
    },
  };
}
