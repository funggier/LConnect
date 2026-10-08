import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testDir = path.join(root, "tests");
const excluded = new Set(["chrome-physical-smoke.mjs", "firefox-physical-smoke.mjs"]);

function run(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: root, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${program} ${args.join(" ")} failed with code=${code} signal=${signal}`));
    });
  });
}

const tests = (await fsp.readdir(testDir))
  .filter((name) => name.endsWith("-smoke.mjs") || name === "smoke.mjs")
  .filter((name) => !excluded.has(name))
  .sort((a, b) => a.localeCompare(b));

for (const name of tests) {
  console.log(`\n=== ${name} ===`);
  await run(process.execPath, [path.join("tests", name)]);
}

const powershellTests =
  process.platform === "win32"
    ? (await fsp.readdir(testDir))
        .filter((name) => name.endsWith("-smoke.ps1"))
        .sort((a, b) => a.localeCompare(b))
    : [];

for (const name of powershellTests) {
  console.log(`\n=== ${name} ===`);
  await run("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", path.join("tests", name),
  ]);
}

console.log(`\nTest runner: PASS node_tests=${tests.length} powershell_tests=${powershellTests.length}`);
