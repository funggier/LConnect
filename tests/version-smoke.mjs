import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageVersion } from "../modules/version.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(testDir);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
const version = readPackageVersion(
  new URL("../lconnect-mcp.mjs", import.meta.url).href
);

if (version !== packageJson.version) {
  throw new Error(
    "Runtime version source does not match package.json: " +
    version + " !== " + packageJson.version
  );
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("Runtime package version is not valid semver-like text.");
}

console.log("package/runtime version source-of-truth: PASS (" + version + ")");
