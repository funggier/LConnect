import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerDirectoryIntegrityTools } from "../modules/directory-integrity.mjs";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-dir-integrity-"));
const left = path.join(sandbox, "left");
const right = path.join(sandbox, "right");
const emptyA = path.join(sandbox, "empty-a");
const emptyB = path.join(sandbox, "empty-b");
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-dir-outside-"));

for (const dir of [left, right, emptyA, emptyB]) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.mkdirSync(path.join(left, "sub"), { recursive: true });
fs.mkdirSync(path.join(right, "sub"), { recursive: true });

fs.writeFileSync(path.join(left, "common.txt"), "same-content", "utf8");
fs.writeFileSync(path.join(right, "common.txt"), "same-content", "utf8");

fs.writeFileSync(path.join(left, "changed.txt"), "AAAA", "utf8");
fs.writeFileSync(path.join(right, "changed.txt"), "BBBB", "utf8");

fs.writeFileSync(path.join(left, "left-only.txt"), "left", "utf8");
fs.writeFileSync(path.join(right, "right-only.txt"), "right", "utf8");

fs.writeFileSync(path.join(left, "sub", "config.json"), '{"ok":true}', "utf8");
fs.writeFileSync(path.join(right, "sub", "config.json"), '{"ok":true}', "utf8");

fs.writeFileSync(path.join(left, "skip.tmp"), "left-skip", "utf8");
fs.writeFileSync(path.join(right, "skip.tmp"), "right-skip", "utf8");

fs.writeFileSync(path.join(left, "large.bin"), Buffer.alloc(128, 0x41));
fs.writeFileSync(path.join(right, "large.bin"), Buffer.alloc(128, 0x41));

fs.writeFileSync(path.join(outside, "outside.txt"), "outside", "utf8");

const server = new McpServer({
  name: "LConnect Directory Integrity Test",
  version: "1.1.0"
});
registerDirectoryIntegrityTools(server, {
  fullMachineAccess: false,
  allowedDirectories: [sandbox]
});

const pair = InMemoryTransport.createLinkedPair();
const client = new Client(
  { name: "lconnect-directory-integrity-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

async function call(name, args, expectError = false) {
  const result = await client.callTool({
    name,
    arguments: args
  });
  if (Boolean(result.isError) !== expectError) {
    throw new Error(
      "unexpected isError=" + Boolean(result.isError) +
      " for " + name + " " + JSON.stringify(args) + ": " + textOf(result)
    );
  }
  return {
    result,
    text: textOf(result),
    data: JSON.parse(textOf(result))
  };
}

try {
  await server.connect(pair[1]);
  await client.connect(pair[0]);

  const manifest1 = await call("directory_manifest", {
    path: left,
    exclude_patterns: ["*.tmp"]
  });
  const manifest2 = await call("directory_manifest", {
    path: left,
    exclude_patterns: ["*.tmp"]
  });

  if (
    manifest1.data.complete !== true ||
    manifest1.data.manifest_digest !== manifest2.data.manifest_digest ||
    manifest1.data.counts.selected_files !== manifest2.data.counts.selected_files
  ) {
    throw new Error("deterministic directory manifest failed");
  }
  const manifestPaths = manifest1.data.entries.map((entry) => entry.relative_path);
  const codeUnitSorted = [...manifestPaths].sort(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  );
  if (JSON.stringify(manifestPaths) !== JSON.stringify(codeUnitSorted)) {
    throw new Error("locale-independent manifest ordering failed");
  }

  const filtered = await call("directory_manifest", {
    path: left,
    include_patterns: ["sub/*.json"]
  });
  if (
    filtered.data.complete !== true ||
    filtered.data.counts.selected_files !== 1 ||
    filtered.data.entries[0]?.relative_path !== "sub/config.json"
  ) {
    throw new Error("include pattern failed");
  }

  const excluded = await call("compare_directories", {
    left,
    right,
    include_patterns: ["*.tmp"]
  });
  if (
    excluded.data.comparison_reliable !== true ||
    excluded.data.equal !== false ||
    excluded.data.counts.changed_files !== 1 ||
    excluded.data.differences.changed[0]?.relative_path !== "skip.tmp"
  ) {
    throw new Error("include-only comparison failed");
  }

  const sameTree = await call("compare_directories", {
    left,
    right: left,
    exclude_patterns: ["*.tmp"]
  });
  if (
    sameTree.data.comparison_reliable !== true ||
    sameTree.data.equal !== true ||
    sameTree.data.counts.changed_files !== 0 ||
    sameTree.data.counts.left_only_files !== 0 ||
    sameTree.data.counts.right_only_files !== 0
  ) {
    throw new Error("same-tree comparison failed");
  }

  const changed = await call("compare_directories", {
    left,
    right,
    exclude_patterns: ["*.tmp", "large.bin"]
  });

  if (
    changed.data.comparison_reliable !== true ||
    changed.data.equal !== false ||
    changed.data.counts.changed_files !== 1 ||
    changed.data.counts.left_only_files !== 1 ||
    changed.data.counts.right_only_files !== 1
  ) {
    throw new Error("directory difference counts failed");
  }

  const changedEntry = changed.data.differences.changed.find(
    (item) => item.relative_path === "changed.txt"
  );
  if (
    !changedEntry ||
    changedEntry.size_equal !== true ||
    changedEntry.digest_equal !== false
  ) {
    throw new Error("same-size content change detection failed");
  }

  if (
    !changed.data.differences.left_only.includes("left-only.txt") ||
    !changed.data.differences.right_only.includes("right-only.txt")
  ) {
    throw new Error("left-only/right-only detection failed");
  }

  const emptyManifestA = await call("directory_manifest", { path: emptyA });
  const emptyManifestB = await call("directory_manifest", { path: emptyB });
  if (
    emptyManifestA.data.complete !== true ||
    emptyManifestA.data.counts.selected_files !== 0 ||
    emptyManifestA.data.manifest_digest !== emptyManifestB.data.manifest_digest
  ) {
    throw new Error("empty directory manifest failed");
  }

  const emptyCompare = await call("compare_directories", {
    left: emptyA,
    right: emptyB
  });
  if (
    emptyCompare.data.comparison_reliable !== true ||
    emptyCompare.data.equal !== true
  ) {
    throw new Error("empty directory comparison failed");
  }

  const fileBound = await call("directory_manifest", {
    path: left,
    include_patterns: ["large.bin"],
    max_file_bytes: 16
  });
  if (
    fileBound.data.complete !== false ||
    fileBound.data.counts.too_large_skipped !== 1 ||
    fileBound.data.counts.selected_files !== 0
  ) {
    throw new Error("max_file_bytes bound failed");
  }

  const totalBound = await call("directory_manifest", {
    path: left,
    include_patterns: ["*.txt"],
    max_total_bytes: 4
  });
  if (
    totalBound.data.complete !== false ||
    totalBound.data.truncation.total_bytes !== true
  ) {
    throw new Error("max_total_bytes bound failed");
  }

  const fileCountBound = await call("directory_manifest", {
    path: left,
    include_patterns: ["*.txt"],
    max_files: 1
  });
  if (
    fileCountBound.data.complete !== false ||
    fileCountBound.data.truncation.files !== true
  ) {
    throw new Error("max_files bound failed");
  }

  const unreliableCompare = await call("compare_directories", {
    left,
    right: left,
    include_patterns: ["*.txt"],
    max_files: 1
  });
  if (
    unreliableCompare.data.comparison_reliable !== false ||
    unreliableCompare.data.equal !== null
  ) {
    throw new Error("incomplete equality must be unknown");
  }

  const walkBound = await call("directory_manifest", {
    path: left,
    max_walk_entries: 1
  });
  if (
    walkBound.data.complete !== false ||
    walkBound.data.truncation.walk !== true
  ) {
    throw new Error("walk-entry bound failed");
  }

  const outputBound = await call("directory_manifest", {
    path: left,
    max_output_chars: 1000,
    max_reported_entries: 200
  });
  if (
    outputBound.text.length > 1000 ||
    !outputBound.data.output_bound?.details_omitted
  ) {
    throw new Error("output bound failed");
  }

  const denied = await call("directory_manifest", {
    path: outside
  }, true);
  if (!denied.data.message.includes("Access denied")) {
    throw new Error("restricted path guard failed");
  }

  let symlinkSupported = false;
  try {
    const target = path.join(left, "common.txt");
    const link = path.join(left, "common-link.txt");
    fs.symlinkSync(target, link, "file");
    symlinkSupported = true;

    const symlinkManifest = await call("directory_manifest", {
      path: left,
      exclude_patterns: ["*.tmp", "large.bin"]
    });
    if (
      symlinkManifest.data.complete !== false ||
      symlinkManifest.data.counts.symlink_skipped < 1 ||
      !symlinkManifest.data.diagnostics.some(
        (item) => item.kind === "SYMLINK_SKIPPED"
      )
    ) {
      throw new Error("symlink skip diagnostic failed");
    }
    fs.unlinkSync(link);
  } catch (error) {
    if (symlinkSupported) throw error;
  }

  let junctionSupported = false;
  try {
    const junctionTarget = path.join(sandbox, "junction-target");
    const junctionLink = path.join(left, "junction-link");
    fs.mkdirSync(junctionTarget, { recursive: true });
    fs.writeFileSync(path.join(junctionTarget, "inside.txt"), "junction-target", "utf8");
    fs.symlinkSync(junctionTarget, junctionLink, "junction");
    junctionSupported = true;

    const junctionManifest = await call("directory_manifest", {
      path: left,
      exclude_patterns: ["*.tmp", "large.bin"]
    });
    if (
      junctionManifest.data.complete !== false ||
      junctionManifest.data.counts.symlink_skipped < 1 ||
      !junctionManifest.data.diagnostics.some(
        (item) => item.kind === "SYMLINK_SKIPPED" &&
          item.relative_path === "junction-link"
      )
    ) {
      throw new Error("junction skip diagnostic failed");
    }
    fs.unlinkSync(junctionLink);
  } catch (error) {
    if (junctionSupported) throw error;
  }

  console.log("directory_manifest deterministic digest/order: PASS");
  console.log("directory_manifest include/exclude patterns: PASS");
  console.log("compare_directories same-tree equality: PASS");
  console.log("compare_directories changed/missing/extra: PASS");
  console.log("compare_directories same-size content change: PASS");
  console.log("directory_manifest empty tree: PASS");
  console.log("directory_manifest file/total/file-count/walk bounds: PASS");
  console.log("compare_directories incomplete equality unknown: PASS");
  console.log("directory_manifest output bound: PASS");
  console.log("directory_manifest restricted path guard: PASS");
  console.log(
    "directory_manifest symlink skip: " + (symlinkSupported ? "PASS" : "SKIP (unsupported)")
  );
  console.log(
    "directory_manifest junction skip: " + (junctionSupported ? "PASS" : "SKIP (unsupported)")
  );
} finally {
  await pair[0].close().catch(() => {});
  fs.rmSync(sandbox, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}
