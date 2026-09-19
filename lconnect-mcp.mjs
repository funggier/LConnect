import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadLConnectConfig } from "./modules/config.mjs";
import { registerFilesystemTools } from "./modules/filesystem.mjs";
import { registerShellTools } from "./modules/shell.mjs";
import { registerProcessTools } from "./modules/process.mjs";
import { registerProcessAdvancedTools } from "./modules/process-advanced.mjs";
import { registerSystemTools } from "./modules/system.mjs";
import { registerServiceTools } from "./modules/services.mjs";
import { registerNetworkTools } from "./modules/network.mjs";
import { registerHardwareTools } from "./modules/hardware.mjs";
import { registerGitTools } from "./modules/git.mjs";
import { registerEnvironmentTools } from "./modules/environment.mjs";

const config = loadLConnectConfig(import.meta.url);
const server = new McpServer({
  name: "LConnect",
  version: "1.0.2",
});

registerFilesystemTools(server, config);
registerShellTools(server, config);
registerProcessTools(server, config);
registerProcessAdvancedTools(server, config);
registerSystemTools(server, config);
registerServiceTools(server, config);
registerNetworkTools(server, config);
registerHardwareTools(server, config);
registerGitTools(server, config);
registerEnvironmentTools(server, config);

console.error(
  `LConnect 1.0.2 starting; fullMachineAccess=${config.fullMachineAccess}; allowedDirectories=${config.allowedDirectories.join(";")}`
);

await server.connect(new StdioServerTransport());
