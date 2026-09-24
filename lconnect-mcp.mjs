import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadLConnectConfig } from "./modules/config.mjs";
import { configureRuntime } from "./modules/runtime.mjs";
import { registerFilesystemTools } from "./modules/filesystem.mjs";
import { registerShellTools } from "./modules/shell.mjs";
import { registerProcessTools } from "./modules/process.mjs";
import { registerProcessAdvancedTools } from "./modules/process-advanced.mjs";
import { registerSystemTools } from "./modules/system.mjs";
import { registerServiceTools } from "./modules/services.mjs";
import { registerNetworkTools } from "./modules/network.mjs";
import { registerHardwareTools } from "./modules/hardware.mjs";
import { registerGitTools } from "./modules/git.mjs";
import { registerDevelopmentTools } from "./modules/development.mjs";
import { registerHttpTools } from "./modules/http.mjs";
import { registerLogTailTools } from "./modules/log-tail.mjs";
import { registerFileWatcherTools } from "./modules/file-watcher.mjs";
import { registerScheduledTaskTools } from "./modules/scheduled-tasks.mjs";
import { registerTransientStateTools } from "./modules/transient-state.mjs";
import { registerEnvironmentTools } from "./modules/environment.mjs";
import {
  installToolTelemetry,
  registerToolTelemetryTool,
} from "./modules/telemetry.mjs";

const config = loadLConnectConfig(import.meta.url);
configureRuntime({
  maxSynchronousRequestSeconds: config.mcp.maxSynchronousRequestSeconds,
});

const server = new McpServer({
  name: "LConnect",
  version: "1.1.0",
});

installToolTelemetry(server, config.telemetry);

registerFilesystemTools(server, config);
registerShellTools(server, config);
registerProcessTools(server, config);
registerProcessAdvancedTools(server, config);
registerSystemTools(server, config);
registerServiceTools(server, config);
registerNetworkTools(server, config);
registerHardwareTools(server, config);
registerGitTools(server, config);
registerDevelopmentTools(server, config);
registerHttpTools(server, config);
registerLogTailTools(server, config);
registerFileWatcherTools(server, config);
registerScheduledTaskTools(server, config);
registerTransientStateTools(server);
registerEnvironmentTools(server, config);
registerToolTelemetryTool(server);

console.error(
  `LConnect 1.1.0 starting; fullMachineAccess=${config.fullMachineAccess}; maxSyncRequestSeconds=${config.mcp.maxSynchronousRequestSeconds}; telemetryEnabled=${config.telemetry.enabled}; telemetryMaxEvents=${config.telemetry.maxEvents}; allowedDirectories=${config.allowedDirectories.join(";")}`
);

await server.connect(new StdioServerTransport());
