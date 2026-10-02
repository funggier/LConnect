import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function collectMjs(dir) {
  const out = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collectMjs(abs));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) out.push(abs);
  }
  return out;
}

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

const candidates = [
  path.join(root, "lconnect-mcp.mjs"),
  ...await collectMjs(path.join(root, "modules")),
  ...await collectMjs(path.join(root, "scripts")),
  ...await collectMjs(path.join(root, "tests")),
].filter((p) => !p.endsWith(path.join("scripts", "run-checks.mjs")));

const files = [...new Set(candidates)].sort((a, b) => a.localeCompare(b));
for (const file of files) {
  await run(process.execPath, ["--check", file]);
}
console.log(`Syntax check: PASS files=${files.length}`);
