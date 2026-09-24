import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.MCP_ENABLE_POWERSHELL = "false";

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
  { name: "lconnect-smoke-test", version: "1.1.0" },
  { capabilities: {} }
);

const requiredTools = [
  "list_allowed_directories",
  "list_directory",
  "read_text_file",
  "read_multiple_files",
  "write_file",
  "edit_file",
  "search_files",
  "get_file_info",
  "powershell_run",
  "command_run",
  "start_process",
  "read_process_output",
  "write_process_input",
  "terminate_process",
  "list_sessions",
  "system_info",
  "list_processes",
  "kill_process",
  "list_listening_ports",
  "env_get",
  "env_list",
  "env_set",
  "path_list",
  "which",
  "process_details",
  "process_tree",
  "find_process",
  "wait_process",
  "restart_process",
  "list_services",
  "get_service",
  "start_service",
  "stop_service",
  "restart_service",
  "set_service_startup",
  "tcp_connections",
  "udp_endpoints",
  "port_owner",
  "port_test",
  "dns_lookup",
  "network_interfaces",
  "ping_host",
  "cpu_info",
  "memory_info",
  "disk_info",
  "gpu_info",
  "storage_health",
  "battery_info",
  "git_status",
  "git_diff",
  "git_log",
  "git_branch",
  "git_commit",
  "git_fetch",
  "git_pull",
  "git_push",
  "git_worktree",
  "detect_project",
  "detect_build_system",
  "project_info",
  "install_dependencies",
  "run_build",
  "run_tests",
  "run_lint",
  "http_request",
  "http_probe",
  "http_headers",
  "http_download",
  "tail_file",
  "follow_log",
  "read_log_events",
  "search_log",
  "stop_log_follow",
  "watch_path",
  "watch_events",
  "watch_status",
  "stop_watch",
  "list_scheduled_tasks",
  "get_scheduled_task",
  "create_scheduled_task",
  "run_scheduled_task",
  "stop_scheduled_task",
  "enable_scheduled_task",
  "disable_scheduled_task",
  "delete_scheduled_task",
  "wait_session",
  "release_session",
  "prune_sessions",
  "refresh_state",
  "read_process_events",
  "tool_telemetry",
];

try {
  await client.connect(transport);

  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const missing = requiredTools.filter((name) => !names.has(name));

  if (missing.length) {
    throw new Error(`Missing tools: ${missing.join(", ")}`);
  }

  const allowed = await client.callTool({
    name: "list_allowed_directories",
    arguments: {},
  });
  if (allowed.isError) throw new Error("list_allowed_directories returned isError");

  const system = await client.callTool({
    name: "system_info",
    arguments: {},
  });
  if (system.isError) throw new Error("system_info returned isError");

  if (process.platform === "win32" && process.env.SystemRoot) {
    const outsideRepo = await client.callTool({
      name: "get_file_info",
      arguments: { path: process.env.SystemRoot },
    });
    if (outsideRepo.isError) {
      throw new Error("full-machine filesystem access test failed");
    }
  }

  console.log(`PASS tools=${listed.tools.length}`);
  console.log(`Required tools present: ${requiredTools.length}`);
  console.log("list_allowed_directories: PASS");
  console.log("system_info: PASS");
  if (process.platform === "win32") console.log("full-machine filesystem access: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  await transport.close();
}
