import { createHash } from "node:crypto";
import { z } from "zod";
import { toolMetadata } from "./tool-surface.mjs";

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
  const duplicateNames = new Set();
  let ready = false;
  const originalTool = server.tool.bind(server);

  server.tool = (name, ...rest) => {
    if (typeof name === "string" && name) {
      if (registered.has(name)) duplicateNames.add(name);
      registered.add(name);
    }
    return originalTool(name, ...rest);
  };

  function buildSnapshot(includeNames = false, includeMetadata = false) {
    const names = [...registered].sort();
    const duplicates = [...duplicateNames].sort();
    return {
      version,
      process_id: process.pid,
      runtime_started_at: startedAt,
      working_directory: process.cwd(),
      catalog_ready: ready,
      tool_count: names.length,
      tool_name_digest_sha256: digestNames(names),
      duplicate_tool_names: duplicates,
      ...(includeNames ? { tool_names: names } : {}),
      ...(includeMetadata ? {
        tool_metadata: names.map((name) => toolMetadata(name) || {
          name,
          family: "unclassified",
          status: "unclassified",
          replacement: null,
          safety: "unclassified",
          long_running: false,
          platform: "unclassified",
        }),
      } : {}),
    };
  }

  server.tool(
    "runtime_catalog",
    "Report the catalog loaded by this running LConnect process: tool count, stable name digest, process identity and optional sorted tool names. Useful for distinguishing a restarted runtime from a stale client/plugin catalog.",
    {
      include_names: z.boolean().optional(),
      include_metadata: z.boolean().optional(),
    },
    async ({ include_names = false, include_metadata = false }) => {
      return textResult(buildSnapshot(include_names, include_metadata));
    }
  );

  return {
    markReady() {
      ready = true;
      return buildSnapshot(false);
    },
    snapshot({ includeNames = false, includeMetadata = false } = {}) {
      return buildSnapshot(includeNames, includeMetadata);
    },
  };
}
