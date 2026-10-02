import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_TOOL_NAMES, buildToolMetadataCatalog, validateToolMetadataCatalog } from "../modules/tool-surface.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testsDir = path.join(root, "tests");
const testFiles = (await fsp.readdir(testsDir))
  .filter((name) => name.endsWith(".mjs") || name.endsWith(".ps1"))
  .sort();

const testTexts = new Map();
for (const name of testFiles) {
  testTexts.set(name, await fsp.readFile(path.join(testsDir, name), "utf8"));
}

const metadata = buildToolMetadataCatalog();
const inventory = metadata.map((item) => {
  const direct = [];
  for (const [file, text] of testTexts) {
    if (text.includes(item.name)) direct.push(file);
  }
  return {
    ...item,
    direct_test_reference_files: direct,
    direct_test_reference_count: direct.length,
  };
});

const validation = validateToolMetadataCatalog();
const zeroDirect = inventory.filter((item) => item.direct_test_reference_count === 0).map((item) => item.name);
const summary = {
  ok: validation.ok,
  tool_count: PUBLIC_TOOL_NAMES.length,
  status_counts: Object.fromEntries(
    [...new Set(inventory.map((x) => x.status))].sort().map((status) => [
      status,
      inventory.filter((x) => x.status === status).length,
    ])
  ),
  family_counts: Object.fromEntries(
    [...new Set(inventory.map((x) => x.family))].sort().map((family) => [
      family,
      inventory.filter((x) => x.family === family).length,
    ])
  ),
  zero_direct_test_reference_count: zeroDirect.length,
  zero_direct_test_reference_tools: zeroDirect,
  validation,
  inventory,
};

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
