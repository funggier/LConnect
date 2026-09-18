import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadLConnectConfig } from "./modules/config.mjs";
import { registerFilesystemTools } from "./modules/filesystem.mjs";
import { registerShellTools } from "./modules/shell.mjs";
import { registerProcessTools } from "./modules/process.mjs";
import { registerSystemTools } from "./modules/system.mjs";

const config = loadLConnectConfig(import.meta.url);
const server = new McpServer({
  name: "LConnect",
  version: "0.1.0",
});

registerFilesystemTools(server, config);
registerShellTools(server, config);
registerProcessTools(server, config);
registerSystemTools(server, config);

console.error(
  `LConnect 0.1.0 starting; fullMachineAccess=${config.fullMachineAccess}; allowedDirectories=${config.allowedDirectories.join(";")}`
);

await server.connect(new StdioServerTransport());
