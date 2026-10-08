import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  PUBLIC_TOOL_NAMES,
  buildToolMetadataCatalog,
  validateToolMetadataCatalog,
} from "../modules/tool-surface.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === "string"));
env.MCP_ENABLE_POWERSHELL = "false";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});
const client = new Client({ name: "tool-surface-smoke", version: "1.0.0" }, { capabilities: {} });

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

try {
  const staticValidation = validateToolMetadataCatalog();
  if (!staticValidation.ok || staticValidation.tool_count !== 154) {
    throw new Error(`metadata registry invalid: ${JSON.stringify(staticValidation)}`);
  }

  const metadata = buildToolMetadataCatalog();
  if (metadata.some((item) => !item || !item.module || !item.family || !item.status || !item.safety || !item.platform)) {
    throw new Error("metadata completeness failed");
  }
  const readFile = metadata.find((item) => item.name === "read_file");
  if (readFile?.status !== "deprecated" || readFile.replacement !== "read_text_file") {
    throw new Error("read_file deprecation metadata failed");
  }
  const legacyOutput = metadata.find((item) => item.name === "read_process_output");
  if (legacyOutput?.status !== "compatibility" || legacyOutput.replacement !== "read_process_events") {
    throw new Error("read_process_output compatibility metadata failed");
  }

  await client.connect(transport);
  const listed = await client.listTools();
  const actual = listed.tools.map((tool) => tool.name).sort();
  const expected = [...PUBLIC_TOOL_NAMES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    throw new Error(`catalog mismatch missing=${expected.filter((x) => !actualSet.has(x)).join(",")} extra=${actual.filter((x) => !expectedSet.has(x)).join(",")}`);
  }

  const runtimeResult = await client.callTool({
    name: "runtime_catalog",
    arguments: { include_names: true, include_metadata: true },
  });
  if (runtimeResult.isError) throw new Error(textOf(runtimeResult));
  const runtime = JSON.parse(textOf(runtimeResult));
  if (runtime.tool_count !== 154) throw new Error(`runtime tool_count=${runtime.tool_count}`);
  if (runtime.duplicate_tool_names?.length) throw new Error(`duplicate tools: ${runtime.duplicate_tool_names.join(",")}`);
  if (runtime.tool_metadata?.length !== 154) throw new Error("runtime metadata count mismatch");
  if (runtime.tool_metadata.some((item) => item.status === "unclassified")) {
    throw new Error("runtime metadata contains unclassified tool");
  }

  const toolsDoc = await fsp.readFile(path.join(root, "docs", "TOOLS_TH.md"), "utf8");
  if (!/v1\.3\.1 source\/runtime expose \*\*154 tools\*\*/.test(toolsDoc)) {
    throw new Error("TOOLS_TH v1.3.1 release candidate count is not 154");
  }

  const policyDoc = await fsp.readFile(path.join(root, "docs", "TOOL_SURFACE_POLICY.md"), "utf8");
  if (!/Current release target: \*\*v1\.3\.1 \/ 154 tools\*\*/.test(policyDoc)) {
    throw new Error("Tool-surface policy current v1.3.1 target is not documented as 154 tools");
  }
  if (!/Previous immutable published release: \*\*v1\.3\.0 \/ 154 tools\*\*/.test(policyDoc)) {
    throw new Error("Tool-surface policy previous immutable v1.3.0 release is not documented as 154 tools");
  }
  if (!/Historical immutable baseline: \*\*v1\.2\.2 \/ 122 tools\*\*/.test(policyDoc)) {
    throw new Error("Tool-surface policy historical v1.2.2 baseline is not documented as 122 tools");
  }

  console.log("tool metadata registry completeness: PASS");
  console.log("source expected catalog == live source catalog: PASS tools=154");
  console.log("duplicate public tool names: PASS none");
  console.log("canonical/compatibility/deprecation metadata: PASS");
  console.log("current docs catalog-count guard: PASS");
  console.log("module/family/safety metadata completeness: PASS");
} finally {
  await transport.close().catch(() => {});
}
