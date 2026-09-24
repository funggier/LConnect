import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { installRuntimeCatalog } from "../modules/runtime-catalog.mjs";

const server = new McpServer({
  name: "LConnect Runtime Catalog Test",
  version: "1.1.0",
});

const catalog = installRuntimeCatalog(server, {
  version: "1.1.0-test",
  startedAt: "2026-09-24T00:00:00.000Z",
});

server.tool("zeta_fixture", "fixture", {}, async () => ({
  content: [{ type: "text", text: "zeta" }],
}));

server.tool("alpha_fixture", "fixture", {
  value: z.string().optional(),
}, async () => ({
  content: [{ type: "text", text: "alpha" }],
}));

const beforeReady = catalog.snapshot({ includeNames: true });
if (beforeReady.catalog_ready !== false) {
  throw new Error("catalog should not be ready before markReady");
}
if (beforeReady.tool_count !== 3) {
  throw new Error("catalog tracking did not include runtime_catalog and fixtures");
}

const ready = catalog.markReady();
if (ready.catalog_ready !== true || ready.tool_count !== 3) {
  throw new Error("markReady state/count failed");
}

const pair = InMemoryTransport.createLinkedPair();
const client = new Client(
  { name: "lconnect-runtime-catalog-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

try {
  await server.connect(pair[1]);
  await client.connect(pair[0]);

  const compactResult = await client.callTool({
    name: "runtime_catalog",
    arguments: {},
  });
  if (compactResult.isError) throw new Error(textOf(compactResult));
  const compact = JSON.parse(textOf(compactResult));

  if (
    compact.version !== "1.1.0-test" ||
    compact.runtime_started_at !== "2026-09-24T00:00:00.000Z" ||
    compact.catalog_ready !== true ||
    compact.tool_count !== 3 ||
    typeof compact.process_id !== "number" ||
    typeof compact.working_directory !== "string" ||
    !/^[0-9a-f]{64}$/.test(compact.tool_name_digest_sha256)
  ) {
    throw new Error("compact runtime_catalog evidence failed");
  }
  if (Object.hasOwn(compact, "tool_names")) {
    throw new Error("default runtime_catalog should omit tool names");
  }

  const namesResult = await client.callTool({
    name: "runtime_catalog",
    arguments: { include_names: true },
  });
  if (namesResult.isError) throw new Error(textOf(namesResult));
  const withNames = JSON.parse(textOf(namesResult));

  const expectedNames = ["alpha_fixture", "runtime_catalog", "zeta_fixture"];
  if (JSON.stringify(withNames.tool_names) !== JSON.stringify(expectedNames)) {
    throw new Error("runtime_catalog names are not stable/sorted");
  }
  if (withNames.tool_name_digest_sha256 !== compact.tool_name_digest_sha256) {
    throw new Error("runtime_catalog digest changed when names were included");
  }

  const repeated = catalog.snapshot({ includeNames: false });
  if (repeated.tool_name_digest_sha256 !== compact.tool_name_digest_sha256) {
    throw new Error("runtime_catalog digest is not stable");
  }

  console.log("runtime_catalog tracks registered tools: PASS");
  console.log("runtime_catalog compact identity evidence: PASS");
  console.log("runtime_catalog stable SHA-256 digest: PASS");
  console.log("runtime_catalog optional sorted names: PASS");
} finally {
  await pair[0].close().catch(() => {});
}
