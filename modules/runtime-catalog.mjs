import { createHash } from "node:crypto";
import { z } from "zod";

function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function digestNames(names) {
  return createHash("sha256")
    .update(names.join("\n"), "utf8")
    .digest("hex");
}

export function installRuntimeCatalog(server, {
  version = "unknown",
  startedAt = new Date().toISOString(),
} = {}) {
  const registered = new Set();
  let ready = false;
  const originalTool = server.tool.bind(server);

  server.tool = (name, ...rest) => {
    if (typeof name === "string" && name) registered.add(name);
    return originalTool(name, ...rest);
  };

  function buildSnapshot(includeNames = false) {
    const names = [...registered].sort();
    return {
      version,
      process_id: process.pid,
      runtime_started_at: startedAt,
      working_directory: process.cwd(),
      catalog_ready: ready,
      tool_count: names.length,
      tool_name_digest_sha256: digestNames(names),
      ...(includeNames ? { tool_names: names } : {}),
    };
  }

  server.tool(
    "runtime_catalog",
    "Report the catalog loaded by this running LConnect process: tool count, stable name digest, process identity and optional sorted tool names. Useful for distinguishing a restarted runtime from a stale client/plugin catalog.",
    {
      include_names: z.boolean().optional(),
    },
    async ({ include_names = false }) => {
      return textResult(buildSnapshot(include_names));
    }
  );

  return {
    markReady() {
      ready = true;
      return buildSnapshot(false);
    },
    snapshot({ includeNames = false } = {}) {
      return buildSnapshot(includeNames);
    },
  };
}
