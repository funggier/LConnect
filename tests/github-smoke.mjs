import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerGitHubTools } from "../modules/github.mjs";

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-github-"));
const assetBytes = Buffer.from("LCONNECT-GITHUB-ASSET\n", "utf8");
const assetSha256 = createHash("sha256").update(assetBytes).digest("hex");
const tokenLike = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
const dispatchSecret = "super-secret-input";

const config = {
  fullMachineAccess: false,
  allowedDirectories: [fixture],
  shell: {
    enabled: true,
    maxOutputChars: 120000,
    defaultTimeoutSeconds: 60,
    maxTimeoutSeconds: 600,
  },
};

let wait43Calls = 0;
let authCalls = 0;
let lastWaitStatusTimeout = null;
let lastDispatchArgs = null;

function runJson(id, status, conclusion, jobs = []) {
  return {
    databaseId: id,
    number: id,
    workflowName: "LConnect CI",
    displayTitle: "fixture run " + id,
    event: "workflow_dispatch",
    headBranch: "main",
    headSha: "0123456789abcdef0123456789abcdef01234567",
    status,
    conclusion,
    createdAt: "2026-09-24T00:00:00Z",
    startedAt: "2026-09-24T00:00:01Z",
    updatedAt: "2026-09-24T00:00:02Z",
    url: "https://example.invalid/run/" + id,
    jobs,
  };
}

const failedJobs = [{
  databaseId: 501,
  name: "windows",
  status: "completed",
  conclusion: "failure",
  startedAt: "2026-09-24T00:00:01Z",
  completedAt: "2026-09-24T00:00:02Z",
  url: "https://example.invalid/job/501",
  steps: [
    { number: 1, name: "setup", status: "completed", conclusion: "success" },
    { number: 2, name: "test", status: "completed", conclusion: "failure" },
  ],
}];

function ok(stdout = "", stderr = "") {
  return {
    code: 0,
    stdout,
    stderr,
    timedOut: false,
    error: null,
  };
}

async function fakeGh(args, options = {}) {
  if (args[0] === "auth" && args[1] === "status") {
    authCalls += 1;
    return ok("authenticated");
  }

  if (args[0] === "run" && args[1] === "list") {
    return ok(JSON.stringify([
      runJson(42, "completed", "failure"),
      runJson(43, "in_progress", null),
    ]));
  }

  if (args[0] === "run" && args[1] === "view" && args.includes("--log-failed")) {
    return ok(
      "windows test failed\nAuthorization: Bearer " + tokenLike + "\n" +
      "detail " + "x".repeat(4000)
    );
  }

  if (args[0] === "run" && args[1] === "view") {
    const id = Number(args[2]);
    if (id === 42) return ok(JSON.stringify(runJson(42, "completed", "failure", failedJobs)));
    if (id === 43) {
      wait43Calls += 1;
      return ok(JSON.stringify(
        wait43Calls >= 2
          ? runJson(43, "completed", "success", [{
              databaseId: 502,
              name: "windows",
              status: "completed",
              conclusion: "success",
              steps: [],
            }])
          : runJson(43, "in_progress", null, [])
      ));
    }
    if (id === 44) return ok(JSON.stringify(runJson(44, "in_progress", null, [])));
    if (id === 45) {
      lastWaitStatusTimeout = options.timeout_seconds ?? null;
      if (Number(options.timeout_seconds) < 2) {
        return { code: null, stdout: "", stderr: "", timedOut: true, error: null };
      }
      return ok(JSON.stringify(runJson(45, "in_progress", null, [])));
    }
    return { code: 1, stdout: "", stderr: "run not found", timedOut: false, error: null };
  }

  if (args[0] === "workflow" && args[1] === "run") {
    lastDispatchArgs = [...args];
    return ok("dispatch accepted " + args.join(" "));
  }

  if (args[0] === "release" && args[1] === "view") {
    const tag = args[2];
    if (tag === "v-large") {
      return ok(JSON.stringify({
        tagName: tag,
        name: "Large",
        targetCommitish: "main",
        isDraft: false,
        isPrerelease: false,
        publishedAt: "2026-09-24T00:00:00Z",
        createdAt: "2026-09-24T00:00:00Z",
        url: "https://example.invalid/release/v-large",
        assets: [{ id: 8, name: "large.zip", size: 9999999 }],
      }));
    }
    return ok(JSON.stringify({
      tagName: "v-test",
      name: "Fixture Release",
      targetCommitish: "main",
      isDraft: false,
      isPrerelease: false,
      publishedAt: "2026-09-24T00:00:00Z",
      createdAt: "2026-09-24T00:00:00Z",
      url: "https://example.invalid/release/v-test",
      assets: [{
        id: 7,
        name: "asset.zip",
        size: assetBytes.length,
        digest: "sha256:" + assetSha256,
        state: "uploaded",
        url: "https://example.invalid/asset/7",
      }],
    }));
  }

  if (args[0] === "release" && args[1] === "download") {
    const dirIndex = args.indexOf("--dir");
    const patternIndex = args.indexOf("--pattern");
    if (dirIndex < 0 || patternIndex < 0) {
      return { code: 2, stdout: "", stderr: "missing download args", timedOut: false, error: null };
    }
    const destination = args[dirIndex + 1];
    const assetName = args[patternIndex + 1];
    fs.writeFileSync(path.join(destination, assetName), assetBytes);
    return ok("downloaded");
  }

  return {
    code: 2,
    stdout: "",
    stderr: "unexpected fake gh args: " + JSON.stringify(args),
    timedOut: false,
    error: null,
  };
}

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(textOf(result) || name + " failed");
  return jsonOf(result);
}

async function makeClient(runGhRaw) {
  const server = new McpServer({
    name: "LConnect GitHub Test",
    version: "1.1.0",
  });
  registerGitHubTools(server, config, {
    runGhRaw,
    sleep: async () => {},
  });

  const pair = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "lconnect-github-smoke", version: "1.1.0" },
    { capabilities: {} }
  );
  await server.connect(pair[1]);
  await client.connect(pair[0]);
  return { client, server, transport: pair[0] };
}

let connection;
try {
  connection = await makeClient(fakeGh);
  const client = connection.client;

  const list = await call(client, "github_run_list", {
    repo: "funggier/LConnect",
    limit: 2,
  });
  if (
    list.count !== 2 ||
    list.runs[0].id !== 42 ||
    list.runs[0].workflow_name !== "LConnect CI"
  ) {
    throw new Error("github_run_list structured output failed");
  }

  const view = await call(client, "github_run_view", {
    repo: "funggier/LConnect",
    run_id: 42,
  });
  if (authCalls !== 1) {
    throw new Error("GitHub auth readiness was not reused from the short in-memory cache");
  }
  if (
    view.run.id !== 42 ||
    view.run.jobs[0]?.name !== "windows" ||
    view.run.jobs[0]?.steps[1]?.conclusion !== "failure"
  ) {
    throw new Error("github_run_view jobs/steps failed");
  }

  wait43Calls = 0;
  const waited = await call(client, "github_run_wait", {
    repo: "funggier/LConnect",
    run_id: 43,
    poll_interval_ms: 100,
  });
  if (
    waited.completed !== true ||
    waited.timed_out !== false ||
    waited.requested_wait_ms !== 1000 ||
    waited.effective_wait_ms > 1000 ||
    waited.run.conclusion !== "success"
  ) {
    throw new Error("github_run_wait completion failed");
  }

  const timed = await call(client, "github_run_wait", {
    repo: "funggier/LConnect",
    run_id: 44,
    wait_seconds: 0,
  });
  if (
    timed.completed !== false ||
    timed.timed_out !== true ||
    timed.return_reason !== "timeout"
  ) {
    throw new Error("github_run_wait bounded timeout failed");
  }

  lastWaitStatusTimeout = null;
  const slowStatus = await call(client, "github_run_wait", {
    repo: "funggier/LConnect",
    run_id: 45,
    wait_seconds: 0,
  });
  if (
    slowStatus.completed !== false ||
    slowStatus.timed_out !== true ||
    slowStatus.return_reason !== "timeout" ||
    slowStatus.status_checks !== 1 ||
    slowStatus.status_fetch_timeout_seconds !== 5 ||
    Number(lastWaitStatusTimeout) < 2
  ) {
    throw new Error(
      "github_run_wait status-fetch budget was incorrectly coupled to wait window"
    );
  }

  const overLimitWait = await client.callTool({
    name: "github_run_wait",
    arguments: {
      repo: "funggier/LConnect",
      run_id: 44,
      wait_seconds: 4,
    },
  });
  if (!overLimitWait.isError) {
    throw new Error("github_run_wait accepted a wait longer than 3 seconds");
  }

  const failed = await call(client, "github_run_failed_logs", {
    repo: "funggier/LConnect",
    run_id: 42,
    max_chars: 1000,
  });
  if (
    failed.failed_jobs[0]?.failed_steps[0]?.name !== "test" ||
    failed.truncated !== true ||
    failed.logs.includes(tokenLike) ||
    !failed.logs.includes("[REDACTED_GITHUB_TOKEN]")
  ) {
    throw new Error("github_run_failed_logs bounds/redaction failed");
  }

  const dispatch = await call(client, "github_workflow_dispatch", {
    repo: "funggier/LConnect",
    workflow: "ci.yml",
    ref: "main",
    inputs: {
      mode: "smoke",
      secret: dispatchSecret,
    },
  });
  if (
    dispatch.dispatched !== true ||
    dispatch.correlation.run_id !== null ||
    dispatch.input_keys.join(",") !== "mode,secret" ||
    JSON.stringify(dispatch).includes(dispatchSecret)
  ) {
    throw new Error("github_workflow_dispatch evidence/redaction failed");
  }
  if (!lastDispatchArgs.some((arg) => arg === "secret=" + dispatchSecret)) {
    throw new Error("workflow dispatch did not pass explicit input to gh");
  }

  const release = await call(client, "github_release_view", {
    repo: "funggier/LConnect",
    tag: "v-test",
  });
  if (
    release.release.tag !== "v-test" ||
    release.release.assets[0]?.name !== "asset.zip" ||
    release.release.assets[0]?.digest !== "sha256:" + assetSha256
  ) {
    throw new Error("github_release_view metadata failed");
  }

  const download = await call(client, "github_release_download", {
    repo: "funggier/LConnect",
    tag: "v-test",
    asset_name: "asset.zip",
    destination_directory: fixture,
    max_bytes: 1024,
  });
  if (
    download.downloaded !== true ||
    download.sha256 !== assetSha256 ||
    download.asset.observed_size !== assetBytes.length ||
    !fs.existsSync(download.destination)
  ) {
    throw new Error("github_release_download digest/atomic staging failed");
  }

  const noOverwrite = await client.callTool({
    name: "github_release_download",
    arguments: {
      repo: "funggier/LConnect",
      tag: "v-test",
      asset_name: "asset.zip",
      destination_directory: fixture,
      max_bytes: 1024,
    },
  });
  if (!noOverwrite.isError || !textOf(noOverwrite).includes("Destination already exists")) {
    throw new Error("release download default no-overwrite failed");
  }

  const tooLarge = await client.callTool({
    name: "github_release_download",
    arguments: {
      repo: "funggier/LConnect",
      tag: "v-large",
      asset_name: "large.zip",
      destination_directory: fixture,
      max_bytes: 1024,
    },
  });
  if (!tooLarge.isError || !textOf(tooLarge).includes("exceeds max_bytes")) {
    throw new Error("release download metadata size bound failed");
  }

  const outside = process.platform === "win32"
    ? (process.env.SystemRoot || "C:\\Windows")
    : "/etc";
  const denied = await client.callTool({
    name: "github_release_download",
    arguments: {
      repo: "funggier/LConnect",
      tag: "v-test",
      asset_name: "asset.zip",
      destination_directory: outside,
      max_bytes: 1024,
    },
  });
  if (!denied.isError || !textOf(denied).includes("Access denied")) {
    throw new Error("release download filesystem scope failed");
  }

  console.log("github_run_list structured: PASS");
  console.log("github_run_view jobs/steps: PASS");
  if (authCalls !== 1) {
    throw new Error("GitHub auth readiness cache did not suppress repeated auth probes");
  }

  console.log("github auth readiness cache: PASS");
  console.log("github_run_wait 1s default / 3s maximum: PASS");
  console.log("github_run_wait status-fetch/wait budget separation: PASS");
  console.log("github_run_wait completion/timeout: PASS");
  console.log("github_run_failed_logs bounds/redaction: PASS");
  console.log("github_workflow_dispatch explicit inputs/redaction: PASS");
  console.log("github_release_view metadata/assets: PASS");
  console.log("github_release_download digest/bounds/no-overwrite/scope: PASS");
} finally {
  if (connection) {
    await connection.transport.close().catch(() => {});
  }
}

let unauthConnection;
try {
  unauthConnection = await makeClient(async (args) => {
    if (args[0] === "auth" && args[1] === "status") {
      return {
        code: 1,
        stdout: "",
        stderr: "token " + tokenLike,
        timedOut: false,
        error: null,
      };
    }
    return ok();
  });

  const result = await unauthConnection.client.callTool({
    name: "github_run_list",
    arguments: { repo: "funggier/LConnect" },
  });
  if (
    !result.isError ||
    !textOf(result).includes("not authenticated") ||
    textOf(result).includes(tokenLike)
  ) {
    throw new Error("unauthenticated prerequisite/redaction failed");
  }
  console.log("github unauthenticated diagnostic/redaction: PASS");
} finally {
  if (unauthConnection) {
    await unauthConnection.transport.close().catch(() => {});
  }
  try { fs.rmSync(fixture, { recursive: true, force: true }); } catch {}
}
