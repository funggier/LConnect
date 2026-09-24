import fs from "node:fs";

export function readPackageVersion(importMetaUrl) {
  const packageUrl = new URL("./package.json", importMetaUrl);
  const packageJson = JSON.parse(fs.readFileSync(packageUrl, "utf8"));
  const version = String(packageJson?.version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Invalid or missing package version in package.json.");
  }
  return version;
}
