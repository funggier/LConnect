import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-file-integrity-"));

const abc = path.join(fixture, "abc.txt");
const empty = path.join(fixture, "empty.bin");
const large = path.join(fixture, "large.bin");
const source = path.join(fixture, "source.txt");
const installed = path.join(fixture, "installed.txt");
const changed = path.join(fixture, "changed.txt");
const sameSizeDifferent = path.join(fixture, "same-size-different.txt");

await fsp.writeFile(abc, "abc", "utf8");
await fsp.writeFile(empty, Buffer.alloc(0));
await fsp.writeFile(large, Buffer.alloc(4 * 1024 * 1024, 0x5a));
await fsp.writeFile(source, "source parity fixture\n", "utf8");
await fsp.copyFile(source, installed);
await fsp.writeFile(changed, "different content\n", "utf8");
await fsp.writeFile(sameSizeDifferent, "source parity fixturX\n", "utf8");

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
  { name: "lconnect-file-integrity-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(textOf(result) || name + " failed");
  return jsonOf(result);
}

try {
  await client.connect(transport);

  const abcHash = await call("file_hash", { path: abc });
  if (
    abcHash.algorithm !== "sha256" ||
    abcHash.digest !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" ||
    abcHash.size !== 3 ||
    abcHash.bytes_hashed !== 3
  ) {
    throw new Error("known SHA-256 digest failed");
  }
  if (!abcHash.stability || abcHash.stability.stable_observed !== true) {
    throw new Error("hash stability evidence missing");
  }

  const emptyHash = await call("file_hash", { path: empty });
  if (
    emptyHash.digest !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ||
    emptyHash.size !== 0
  ) {
    throw new Error("empty file digest failed");
  }

  const largeHash = await call("file_hash", { path: large, algorithm: "sha512" });
  if (
    largeHash.algorithm !== "sha512" ||
    largeHash.size !== 4 * 1024 * 1024 ||
    largeHash.bytes_hashed !== largeHash.size ||
    typeof largeHash.digest !== "string" ||
    largeHash.digest.length !== 128
  ) {
    throw new Error("large streaming hash failed");
  }

  const equal = await call("compare_files", { left: source, right: installed });
  if (
    equal.equal !== true ||
    equal.size_equal !== true ||
    equal.digest_equal !== true ||
    equal.comparison_reliable !== true
  ) {
    throw new Error("equal/source-installed comparison failed");
  }

  const unequal = await call("compare_files", { left: source, right: changed });
  if (unequal.equal !== false || unequal.digest_equal !== false) {
    throw new Error("unequal comparison failed");
  }

  const sameSize = await call("compare_files", {
    left: source,
    right: sameSizeDifferent,
  });
  if (
    sameSize.size_equal !== true ||
    sameSize.digest_equal !== false ||
    sameSize.equal !== false
  ) {
    throw new Error("same-size unequal comparison failed");
  }

  const directoryError = await client.callTool({
    name: "file_hash",
    arguments: { path: fixture },
  });
  if (!directoryError.isError || !textOf(directoryError).includes("not a regular file")) {
    throw new Error("directory hashing should fail explicitly");
  }

  console.log("file_hash known SHA-256: PASS");
  console.log("file_hash empty file: PASS");
  console.log("file_hash large streaming file: PASS");
  console.log("compare_files source/installed equal: PASS");
  console.log("compare_files unequal: PASS");
  console.log("compare_files same-size unequal: PASS");
  console.log("file_hash non-file error: PASS");
} finally {
  await transport.close();
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
  { name: "lconnect-file-integrity-restricted-smoke", version: "1.1.0" },
  { capabilities: {} }
);

try {
  await restrictedClient.connect(restrictedTransport);
  const outsidePath = process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\\Windows", "notepad.exe")
    : "/etc/hosts";
  const denied = await restrictedClient.callTool({
    name: "file_hash",
    arguments: { path: outsidePath },
  });
  if (!denied.isError || !textOf(denied).includes("Access denied")) {
    throw new Error("restricted path should be denied");
  }
  console.log("file_hash restricted path: PASS");
} finally {
  await restrictedTransport.close();
  await fsp.rm(fixture, { recursive: true, force: true });
}
