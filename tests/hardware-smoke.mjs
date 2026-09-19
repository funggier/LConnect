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
  { name: "lconnect-hardware-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

async function callJson(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = textOf(result);
  if (result.isError) {
    throw new Error(`${name} returned isError: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${name} returned non-JSON output: ${text}\n${error.message}`);
  }
}

function assertAvailabilityShape(name, value, collectionKey) {
  if (typeof value.available !== "boolean") {
    throw new Error(`${name} did not return boolean available`);
  }
  if (!Array.isArray(value[collectionKey])) {
    throw new Error(`${name} did not return array ${collectionKey}`);
  }
  if (!value.available && value[collectionKey].length !== 0) {
    throw new Error(`${name} returned available=false with non-empty ${collectionKey}`);
  }
}

try {
  await client.connect(transport);

  const cpu = await callJson("cpu_info");
  if (!cpu.available) throw new Error("cpu_info unexpectedly reported unavailable");
  if (!Number.isInteger(cpu.logical_processor_count_node) || cpu.logical_processor_count_node < 1) {
    throw new Error("cpu_info did not report a logical processor count");
  }
  if (process.platform === "win32") {
    if (!Array.isArray(cpu.processors) || cpu.processors.length < 1) {
      throw new Error("cpu_info did not return Win32_Processor data");
    }
    if (!cpu.processors[0].name) throw new Error("cpu_info first processor has no name");
  }

  const memory = await callJson("memory_info");
  if (!memory.available) throw new Error("memory_info unexpectedly reported unavailable");
  const totalMemory =
    memory.total_visible_memory_bytes ??
    memory.total_memory_bytes ??
    memory.total_memory_bytes_node;
  if (!(Number(totalMemory) > 0)) {
    throw new Error("memory_info did not report positive total memory");
  }
  if (!Array.isArray(memory.modules)) {
    throw new Error("memory_info modules is not an array");
  }

  const disks = await callJson("disk_info");
  if (process.platform === "win32") {
    if (!disks.available) {
      throw new Error(`disk_info unexpectedly unavailable on Windows: ${disks.note ?? ""}`);
    }
    if (!Array.isArray(disks.logical_disks) || disks.logical_disks.length < 1) {
      throw new Error("disk_info returned no logical disks on Windows");
    }
    if (!Array.isArray(disks.physical_disks)) {
      throw new Error("disk_info physical_disks is not an array");
    }
  }

  const gpu = await callJson("gpu_info");
  assertAvailabilityShape("gpu_info", gpu, "adapters");
  if (!gpu.available && !gpu.note) {
    throw new Error("gpu_info unavailable result did not explain why");
  }

  const storage = await callJson("storage_health");
  assertAvailabilityShape("storage_health", storage, "disks");
  if (!storage.available && !storage.note) {
    throw new Error("storage_health unavailable result did not explain why");
  }
  if (storage.available && !storage.source) {
    throw new Error("storage_health available result did not report source");
  }

  const battery = await callJson("battery_info");
  assertAvailabilityShape("battery_info", battery, "batteries");
  if (!Number.isInteger(battery.count) || battery.count !== battery.batteries.length) {
    throw new Error("battery_info count does not match batteries length");
  }
  if (!battery.available && !battery.note) {
    throw new Error("battery_info unavailable result did not explain why");
  }

  console.log("cpu_info: PASS");
  console.log("memory_info: PASS");
  console.log("disk_info: PASS");
  console.log(`gpu_info: PASS (available=${gpu.available})`);
  console.log(`storage_health: PASS (available=${storage.available}, source=${storage.source ?? "none"})`);
  console.log(`battery_info: PASS (available=${battery.available}, count=${battery.count})`);
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close();
}
