import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerFilesystemTools } from "../modules/filesystem.mjs";

const root = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-fs-"));
const outside = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-fs-outside-"));
const server = new McpServer({ name: "filesystem-smoke", version: "1.0.0" });
registerFilesystemTools(server, { fullMachineAccess: false, allowedDirectories: [root] });

const pair = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "filesystem-smoke", version: "1.0.0" }, { capabilities: {} });

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}
async function call(name, args, expectError = false) {
  const result = await client.callTool({ name, arguments: args });
  if (Boolean(result.isError) !== expectError) {
    throw new Error(`${name} expected isError=${expectError}, got ${Boolean(result.isError)}: ${textOf(result)}`);
  }
  return result;
}

try {
  await server.connect(pair[1]);
  await client.connect(pair[0]);

  const thaiDir = path.join(root, "ข้อมูล");
  await call("create_directory", { path: thaiDir });

  const original = path.join(thaiDir, "ทดสอบ.txt");
  const content = "สวัสดี LConnect\nline two\nบรรทัดสาม";
  await call("write_file", { path: original, content });

  const canonical = await call("read_text_file", { path: original });
  if (textOf(canonical) !== content) throw new Error("canonical text read mismatch");

  const alias = await call("read_file", { path: original });
  if (textOf(alias) !== content) throw new Error("deprecated alias read mismatch");

  const head = await call("read_text_file", { path: original, head: 1 });
  if (textOf(head) !== "สวัสดี LConnect") throw new Error("head read failed");
  const tail = await call("read_text_file", { path: original, tail: 1 });
  if (textOf(tail) !== "บรรทัดสาม") throw new Error("tail read failed");
  await call("read_text_file", { path: original, head: 1, tail: 1 }, true);

  const second = path.join(thaiDir, "สอง.txt");
  await call("write_file", { path: second, content: "second" });
  const multi = await call("read_multiple_files", { paths: [original, second] });
  if (!textOf(multi).includes("สวัสดี LConnect") || !textOf(multi).includes("second")) {
    throw new Error("multiple read failed");
  }

  const png = path.join(thaiDir, "tiny.png");
  await fsp.writeFile(png, Buffer.from([137,80,78,71,13,10,26,10]));
  const media = await call("read_media_file", { path: png });
  if (!media.content?.some((item) => item.type === "image" && item.mimeType === "image/png")) {
    throw new Error("media read failed");
  }

  const dry = await call("edit_file", {
    path: original,
    dryRun: true,
    edits: [{ oldText: "line two", newText: "DRY" }],
  });
  if (!textOf(dry).includes("DRY RUN")) throw new Error("edit dry-run evidence missing");
  if ((await fsp.readFile(original, "utf8")).includes("DRY")) throw new Error("dry run modified file");

  await call("edit_file", {
    path: original,
    edits: [{ oldText: "line two", newText: "line 2 edited" }],
  });
  if (!(await fsp.readFile(original, "utf8")).includes("line 2 edited")) throw new Error("edit failed");

  const moved = path.join(thaiDir, "ย้ายแล้ว.txt");
  await call("move_file", { source: second, destination: moved });
  if (!(await fsp.stat(moved)).isFile()) throw new Error("move failed");
  await call("move_file", { source: original, destination: moved }, true);

  const list = await call("list_directory", { path: thaiDir });
  if (!textOf(list).includes("ทดสอบ.txt") || !textOf(list).includes("ย้ายแล้ว.txt")) throw new Error("list failed");
  const sizes = await call("list_directory_with_sizes", { path: thaiDir });
  if (!textOf(sizes).includes("Combined shown file size")) throw new Error("sizes failed");
  const tree = await call("directory_tree", { path: root });
  if (!textOf(tree).includes('"ข้อมูล"')) throw new Error("tree failed");
  const search = await call("search_files", { path: root, pattern: "**/*.txt" });
  if (!textOf(search).includes("ทดสอบ.txt") || !textOf(search).includes("ย้ายแล้ว.txt")) throw new Error("search failed");
  const info = await call("get_file_info", { path: original });
  const parsedInfo = JSON.parse(textOf(info));
  if (parsedInfo.type !== "file" || parsedInfo.size <= 0) throw new Error("metadata failed");

  const boundedRead = await call("read_text_file", { path: original, max_chars: 5 });
  if (!textOf(boundedRead).includes("[truncated at 5 chars]")) throw new Error("text bound failed");
  const boundedMulti = await call("read_multiple_files", {
    paths: [original, moved],
    max_chars_per_file: 5,
    max_total_chars: 1000,
  });
  if (!textOf(boundedMulti).includes("[truncated at 5 chars]")) throw new Error("multiple-file bound failed");
  const boundedList = await call("list_directory", { path: thaiDir, max_entries: 1 });
  if (!textOf(boundedList).includes("[truncated: 1/")) throw new Error("list bound failed");
  const boundedSizes = await call("list_directory_with_sizes", { path: thaiDir, max_entries: 1 });
  if (!textOf(boundedSizes).includes("[truncated: 1/")) throw new Error("sizes bound failed");
  const boundedSearch = await call("search_files", { path: root, pattern: "**/*.txt", max_matches: 1 });
  if (!textOf(boundedSearch).includes("truncated: max_matches=1")) throw new Error("search match bound failed");

  const entryBoundedSearch = await call("search_files", {
    path: root,
    pattern: "**/*.txt",
    max_entries: 1,
    max_matches: 100,
  });
  if (!textOf(entryBoundedSearch).includes("truncated: max_entries=1")) {
    throw new Error("search traversal bound failed");
  }

  const depthBoundedSearch = await call("search_files", {
    path: root,
    pattern: "**/*.txt",
    max_depth: 0,
    max_matches: 100,
  });
  if (!textOf(depthBoundedSearch).includes("depth_limited: max_depth=0")) {
    throw new Error("search depth bound failed");
  }

  const outputBoundedSearch = await call("search_files", {
    path: root,
    pattern: "**/*.txt",
    max_output_chars: 1000,
  });
  if (textOf(outputBoundedSearch).length > 1100) {
    throw new Error("search output bound failed");
  }
  await call("directory_tree", { path: root, max_entries: 1 }, true);
  await call("read_media_file", { path: png, max_bytes: 1 }, true);

  await call("read_text_file", { path: path.join(outside, "blocked.txt") }, true);
  await call("write_file", { path: path.join(outside, "blocked.txt"), content: "blocked" }, true);
  await call("edit_file", { path: original, edits: [{ oldText: "missing-value", newText: "x" }] }, true);

  console.log("filesystem create/read/alias/multiple/media/write/edit/move/list/sizes/tree/search/metadata: PASS");
  console.log("filesystem Unicode/Thai paths/content: PASS");
  console.log("filesystem restricted-path and failure paths: PASS");
  console.log("filesystem bounded output/media/search traversal guards: PASS");
} finally {
  await pair[0].close().catch(() => {});
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.rm(outside, { recursive: true, force: true });
}
