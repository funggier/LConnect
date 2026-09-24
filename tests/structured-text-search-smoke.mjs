import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-search-text-"));
const src = path.join(fixture, "src");
await fsp.mkdir(src, { recursive: true });
await fsp.writeFile(path.join(src, "alpha.txt"), "Alpha one\nไทย ทดสอบ\nneedle here\nnext context\n", "utf8");
await fsp.writeFile(path.join(src, "beta.js"), "const Needle = 1;\nconst other = 'needle2';\n", "utf8");
await fsp.writeFile(path.join(src, "skip.log"), "needle skipped\n", "utf8");
await fsp.writeFile(path.join(src, "binary.bin"), Buffer.from([0x41, 0x00, 0x42, 0x43]));
await fsp.writeFile(path.join(src, "large.txt"), "x".repeat(4096) + "needle", "utf8");

const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.LCONNECT_FULL_MACHINE_ACCESS = "true";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

const client = new Client(
  { name: "lconnect-structured-text-search-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

async function call(args) {
  const result = await client.callTool({ name: "search_text", arguments: args });
  if (result.isError) throw new Error(textOf(result) || "search_text failed");
  return jsonOf(result);
}

try {
  await client.connect(transport);

  const literal = await call({
    path: src,
    query: "needle",
    include_patterns: ["*.txt", "*.js"],
    exclude_patterns: ["skip*"],
    context_lines: 1,
    max_file_bytes: 2048,
  });

  if (literal.match_count !== 3) {
    throw new Error("literal expected 3 matches, got " + literal.match_count);
  }
  if (!literal.matches.some((m) =>
    m.relative_path === "alpha.txt" &&
    m.line === 3 &&
    m.column === 1 &&
    m.context_before.some((c) => c.line === 2) &&
    m.context_after.some((c) => c.line === 4)
  )) {
    throw new Error("literal path/line/column/context evidence missing");
  }
  if (!literal.matches.some((m) => m.relative_path === "beta.js")) {
    throw new Error("include pattern or case-insensitive literal failed");
  }
  if (!literal.diagnostics.some((d) =>
    d.kind === "FILE_TOO_LARGE" && d.relative_path === "large.txt"
  )) {
    throw new Error("large-file bound evidence missing");
  }

  const regex = await call({
    path: src,
    query: "needle\\d",
    regex: true,
    case_sensitive: true,
    include_patterns: ["*.js"],
  });
  if (regex.match_count !== 1 || regex.matches[0].match !== "needle2") {
    throw new Error("regex mode failed");
  }

  const unicode = await call({
    path: path.join(src, "alpha.txt"),
    query: "ทดสอบ",
    case_sensitive: true,
  });
  if (
    unicode.match_count !== 1 ||
    unicode.matches[0].line !== 2 ||
    unicode.matches[0].column !== 5
  ) {
    throw new Error("Unicode/Thai evidence failed");
  }

  const binary = await call({
    path: src,
    query: "A",
    include_patterns: ["*.bin"],
  });
  if (
    binary.skipped.binary !== 1 ||
    !binary.diagnostics.some((d) => d.kind === "BINARY_SKIPPED")
  ) {
    throw new Error("binary skip/report failed");
  }

  const bounded = await call({
    path: src,
    query: "needle",
    max_matches: 1,
  });
  if (bounded.match_count !== 1 || bounded.truncated.matches !== true) {
    throw new Error("match bound failed");
  }

  const invalidRegex = await client.callTool({
    name: "search_text",
    arguments: { path: src, query: "(", regex: true },
  });
  if (!invalidRegex.isError) throw new Error("invalid regex should return isError");

  console.log("search_text literal: PASS");
  console.log("search_text regex: PASS");
  console.log("search_text Unicode/Thai: PASS");
  console.log("search_text include/exclude/context: PASS");
  console.log("search_text binary/large bounds: PASS");
  console.log("search_text match bounds: PASS");
  console.log("search_text invalid regex: PASS");
} finally {
  await transport.close();
  await fsp.rm(fixture, { recursive: true, force: true });
}

const restrictedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
restrictedEnv.LCONNECT_FULL_MACHINE_ACCESS = "false";
restrictedEnv.LCONNECT_ALLOWED_DIRECTORIES = fixture;

const restrictedTransport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env: restrictedEnv,
  stderr: "pipe",
});
const restrictedClient = new Client(
  { name: "lconnect-structured-text-search-restricted-smoke", version: "1.1.0" },
  { capabilities: {} }
);

try {
  await restrictedClient.connect(restrictedTransport);
  const outsidePath = process.platform === "win32"
    ? (process.env.SystemRoot || "C:\\Windows")
    : "/etc";
  const denied = await restrictedClient.callTool({
    name: "search_text",
    arguments: { path: outsidePath, query: "x" },
  });
  if (!denied.isError || !textOf(denied).includes("Access denied")) {
    throw new Error("restricted path should be denied");
  }
  console.log("search_text restricted path: PASS");
} finally {
  await restrictedTransport.close();
}
