import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(Object.entries(process.env).filter(([,v]) => typeof v === "string"));
env.MCP_ENABLE_POWERSHELL = "true";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});
const client = new Client({ name: "lconnect-execution-smoke", version: "1.0.1" }, { capabilities: {} });

try {
  await client.connect(transport);

  const npm = await client.callTool({
    name: "command_run",
    arguments: { program: "npm.cmd", args: ["--version"], cwd: root, timeout_seconds: 30 },
  });
  if (npm.isError) throw new Error("command_run npm.cmd failed: " + JSON.stringify(npm.content));

  const ports = await client.callTool({
    name: "list_listening_ports",
    arguments: {},
  });
  if (ports.isError) throw new Error("list_listening_ports failed: " + JSON.stringify(ports.content));

  const sleeper = await client.callTool({
    name: "start_process",
    arguments: {
      program: "node.exe",
      args: ["-e", "setInterval(()=>{},1000)"],
      cwd: root,
    },
  });
  if (sleeper.isError) throw new Error("start_process failed: " + JSON.stringify(sleeper.content));
  const sleeperText = sleeper.content.find((item) => item.type === "text")?.text;
  const sleeperInfo = JSON.parse(sleeperText);

  const killed = await client.callTool({
    name: "kill_process",
    arguments: { pid: sleeperInfo.pid, force: true, tree: true },
  });
  if (killed.isError) throw new Error("kill_process failed: " + JSON.stringify(killed.content));

  await new Promise((resolve) => setTimeout(resolve, 500));
  const afterKill = await client.callTool({
    name: "read_process_output",
    arguments: { session_id: sleeperInfo.session_id },
  });
  if (afterKill.isError) throw new Error("read_process_output after kill failed");
  const afterText = afterKill.content.find((item) => item.type === "text")?.text;
  const afterInfo = JSON.parse(afterText);
  if (afterInfo.running) throw new Error("kill_process did not stop the test process");

  console.log("command_run npm.cmd: PASS");
  console.log("list_listening_ports: PASS");
  console.log("kill_process own test process: PASS");
} finally {
  await transport.close();
}
