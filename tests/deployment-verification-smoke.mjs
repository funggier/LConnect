import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { installRuntimeCatalog } from "../modules/runtime-catalog.mjs";
import { registerDeploymentVerificationTool } from "../modules/deployment-verification.mjs";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-deployment-"));
const source = path.join(sandbox, "source");
const installed = path.join(sandbox, "installed");
fs.mkdirSync(source, { recursive: true });
fs.mkdirSync(installed, { recursive: true });

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      "git " + args.join(" ") + " failed:\n" + (result.stderr || result.stdout || "")
    );
  }
  return (result.stdout || "").trim();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

git(source, ["init"]);
git(source, ["config", "user.name", "LConnect Test"]);
git(source, ["config", "user.email", "lconnect@example.invalid"]);

const packageJson = {
  name: "fixture-lconnect",
  version: "1.2.0",
  dependencies: {
    alpha: "1.0.0",
    beta: "^2.0.0"
  }
};

writeJson(path.join(source, "package.json"), packageJson);
fs.writeFileSync(path.join(source, "app.txt"), "hello\n", "utf8");
fs.mkdirSync(path.join(source, "sub"), { recursive: true });
fs.writeFileSync(path.join(source, "sub", "config.txt"), "config\n", "utf8");

git(source, ["add", "."]);
git(source, ["commit", "-m", "fixture"]);

for (const relative of ["package.json", "app.txt", "sub/config.txt"]) {
  const src = path.join(source, ...relative.split("/"));
  const dst = path.join(installed, ...relative.split("/"));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

for (const relative of ["mcp-conf.yaml", "logs", "runtime", "node_modules"]) {
  const full = path.join(installed, relative);
  if (relative.endsWith(".yaml")) {
    fs.writeFileSync(full, "fixture: true\n", "utf8");
  } else {
    fs.mkdirSync(full, { recursive: true });
  }
}

writeJson(path.join(installed, "node_modules", "alpha", "package.json"), {
  name: "alpha",
  version: "1.0.0"
});
writeJson(path.join(installed, "node_modules", "beta", "package.json"), {
  name: "beta",
  version: "2.4.1"
});

const server = new McpServer({
  name: "LConnect Deployment Verification Test",
  version: "1.2.0"
});
const runtimeCatalog = installRuntimeCatalog(server, {
  version: "1.2.0",
  startedAt: "2026-09-24T00:00:00.000Z"
});
registerDeploymentVerificationTool(
  server,
  {
    fullMachineAccess: false,
    allowedDirectories: [sandbox]
  },
  { runtimeCatalog }
);
const runtimeState = runtimeCatalog.markReady();

const pair = InMemoryTransport.createLinkedPair();
const client = new Client(
  { name: "lconnect-deployment-smoke", version: "1.2.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

async function call(args, expectError = false) {
  const result = await client.callTool({
    name: "deployment_verification_snapshot",
    arguments: args
  });
  if (Boolean(result.isError) !== expectError) {
    throw new Error(
      "unexpected isError=" + Boolean(result.isError) +
      " for " + JSON.stringify(args) + ": " + textOf(result)
    );
  }
  const text = textOf(result);
  return {
    result,
    text,
    data: JSON.parse(text)
  };
}

try {
  await server.connect(pair[1]);
  await client.connect(pair[0]);

  const clean = await call({
    source_root: source,
    installed_root: installed,
    expected_tool_count: runtimeState.tool_count
  });

  if (
    clean.data.checks.tracked_files_equal !== true ||
    clean.data.tracked.file_count !== 3 ||
    clean.data.tracked.equal_count !== 3 ||
    clean.data.tracked.changed_count !== 0 ||
    clean.data.tracked.missing_installed_count !== 0 ||
    clean.data.package.source_version !== "1.2.0" ||
    clean.data.package.installed_version !== "1.2.0" ||
    clean.data.package.version_equal !== true ||
    clean.data.package.dependency_declarations_equal !== true ||
    clean.data.package.installed_direct_dependency_count !== 2 ||
    clean.data.package.missing_direct_dependencies.length !== 0 ||
    clean.data.preserved.all_present !== true ||
    clean.data.runtime.version !== "1.2.0" ||
    clean.data.runtime.expected_tool_count_matches !== true ||
    clean.data.runtime.version_matches_installed_package !== true
  ) {
    throw new Error("clean deployment snapshot failed");
  }

  const alpha = clean.data.package.direct_dependencies.find(
    (item) => item.name === "alpha"
  );
  const beta = clean.data.package.direct_dependencies.find(
    (item) => item.name === "beta"
  );
  if (
    alpha?.node_modules_version !== "1.0.0" ||
    beta?.node_modules_version !== "2.4.1"
  ) {
    throw new Error("direct dependency evidence failed");
  }

  fs.writeFileSync(path.join(installed, "app.txt"), "HELLO\n", "utf8");
  const changed = await call({
    source_root: source,
    installed_root: installed,
    expected_tool_count: runtimeState.tool_count
  });
  if (
    changed.data.checks.tracked_files_equal !== false ||
    changed.data.tracked.changed_count !== 1 ||
    changed.data.tracked.changed[0]?.relative_path !== "app.txt"
  ) {
    throw new Error("changed tracked file detection failed");
  }
  fs.copyFileSync(path.join(source, "app.txt"), path.join(installed, "app.txt"));

  fs.unlinkSync(path.join(installed, "sub", "config.txt"));
  const missing = await call({
    source_root: source,
    installed_root: installed
  });
  if (
    missing.data.checks.tracked_files_equal !== false ||
    missing.data.tracked.missing_installed_count !== 1 ||
    !missing.data.tracked.missing_installed.includes("sub/config.txt")
  ) {
    throw new Error("missing installed tracked file detection failed");
  }
  fs.copyFileSync(
    path.join(source, "sub", "config.txt"),
    path.join(installed, "sub", "config.txt")
  );

  fs.rmSync(path.join(installed, "logs"), { recursive: true, force: true });
  const preservedMissing = await call({
    source_root: source,
    installed_root: installed
  });
  if (
    preservedMissing.data.preserved.all_present !== false ||
    preservedMissing.data.preserved.missing_count !== 1 ||
    preservedMissing.data.checks.tracked_files_equal !== true
  ) {
    throw new Error("preserved-path evidence independence failed");
  }
  fs.mkdirSync(path.join(installed, "logs"), { recursive: true });

  fs.rmSync(path.join(installed, "node_modules", "beta"), {
    recursive: true,
    force: true
  });
  const depMissing = await call({
    source_root: source,
    installed_root: installed
  });
  if (
    depMissing.data.checks.all_direct_dependencies_present !== false ||
    !depMissing.data.package.missing_direct_dependencies.includes("beta")
  ) {
    throw new Error("missing direct dependency detection failed");
  }
  writeJson(path.join(installed, "node_modules", "beta", "package.json"), {
    name: "beta",
    version: "2.4.1"
  });

  const wrongCount = await call({
    source_root: source,
    installed_root: installed,
    expected_tool_count: runtimeState.tool_count + 1
  });
  if (wrongCount.data.runtime.expected_tool_count_matches !== false) {
    throw new Error("expected tool-count mismatch failed");
  }

  const bounded = await call({
    source_root: source,
    installed_root: installed,
    max_output_chars: 1000
  });
  if (
    bounded.text.length > 1000 ||
    bounded.data.output_bound?.details_omitted !== true
  ) {
    throw new Error("final output bound failed");
  }

  const fileLimit = await call({
    source_root: source,
    installed_root: installed,
    max_tracked_files: 1
  }, true);
  if (!fileLimit.data.message.includes("TRACKED_FILE_LIMIT")) {
    throw new Error("tracked-file bound failed");
  }

  const deniedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-deploy-denied-"));
  try {
    const denied = await call({
      source_root: source,
      installed_root: deniedRoot
    }, true);
    if (!denied.data.message.includes("Access denied")) {
      throw new Error("restricted path guard failed");
    }
  } finally {
    fs.rmSync(deniedRoot, { recursive: true, force: true });
  }

  console.log("deployment_verification_snapshot clean parity: PASS");
  console.log("deployment_verification_snapshot changed tracked file: PASS");
  console.log("deployment_verification_snapshot missing tracked file: PASS");
  console.log("deployment_verification_snapshot preserved paths: PASS");
  console.log("deployment_verification_snapshot dependencies: PASS");
  console.log("deployment_verification_snapshot runtime/version/catalog: PASS");
  console.log("deployment_verification_snapshot bounds/path guard: PASS");
} finally {
  await pair[0].close().catch(() => {});
  fs.rmSync(sandbox, { recursive: true, force: true });
}
