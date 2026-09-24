import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerStructuredDataInspectionTool } from "../modules/structured-data-inspection.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-structured-data-"));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-structured-outside-"));

const jsonPath = path.join(root, "fixture.json");
const yamlPath = path.join(root, "fixture.yaml");
const tomlPath = path.join(root, "fixture.toml");
const invalidPath = path.join(root, "invalid.json");
const outsidePath = path.join(outside, "outside.json");

fs.writeFileSync(jsonPath, JSON.stringify({
  server: {
    port: 8080,
    enabled: true,
    labels: {
      "a/b": "slash-value",
      "til~de": "tilde-value"
    }
  },
  items: [
    { name: "alpha", enabled: true },
    { name: "beta", enabled: false }
  ],
  long: "x".repeat(200),
  deep: {
    one: {
      two: {
        three: {
          value: "deep-value"
        }
      }
    }
  },
  many: {
    a: 1,
    b: 2,
    c: 3,
    d: 4
  },
  ["k".repeat(3000)]: "long-key-value"
}, null, 2), "utf8");

fs.writeFileSync(yamlPath, [
  "server:",
  "  port: 9090",
  "  enabled: true",
  "items:",
  "  - name: yaml-first",
  "    enabled: true",
  "  - name: yaml-second",
  "    enabled: false",
  ""
].join("\n"), "utf8");

fs.writeFileSync(tomlPath, [
  "[server]",
  "port = 7070",
  "enabled = true",
  "",
  "[[items]]",
  "name = \"toml-first\"",
  "",
  "[[items]]",
  "name = \"toml-second\"",
  "",
  "[numbers]",
  "nan = nan",
  "pos = inf",
  "neg = -inf",
  ""
].join("\n"), "utf8");

fs.writeFileSync(invalidPath, "{ invalid json", "utf8");
fs.writeFileSync(outsidePath, "{\"outside\":true}", "utf8");

const server = new McpServer({
  name: "LConnect Structured Data Test",
  version: "1.1.0"
});

registerStructuredDataInspectionTool(server, {
  fullMachineAccess: false,
  allowedDirectories: [root]
});

const pair = InMemoryTransport.createLinkedPair();
const client = new Client(
  { name: "lconnect-structured-data-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

async function call(args, expectError = false) {
  const result = await client.callTool({
    name: "structured_data_inspect",
    arguments: args
  });
  if (Boolean(result.isError) !== expectError) {
    throw new Error(
      "unexpected isError=" + Boolean(result.isError) +
      " for " + JSON.stringify(args) + ": " + textOf(result)
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

  const jsonNested = await call({
    path: jsonPath,
    pointer: "/server/port"
  });
  if (
    jsonNested.data.format !== "json" ||
    jsonNested.data.selected_type !== "number" ||
    jsonNested.data.value_preview !== 8080
  ) {
    throw new Error("JSON nested pointer failed");
  }

  const jsonArray = await call({
    path: jsonPath,
    pointer: "/items/0/name"
  });
  if (jsonArray.data.value_preview !== "alpha") {
    throw new Error("JSON array pointer failed");
  }

  const escapedSlash = await call({
    path: jsonPath,
    pointer: "/server/labels/a~1b"
  });
  if (escapedSlash.data.value_preview !== "slash-value") {
    throw new Error("JSON Pointer ~1 escape failed");
  }

  const escapedTilde = await call({
    path: jsonPath,
    pointer: "/server/labels/til~0de"
  });
  if (escapedTilde.data.value_preview !== "tilde-value") {
    throw new Error("JSON Pointer ~0 escape failed");
  }

  const yamlNested = await call({
    path: yamlPath,
    pointer: "/server/enabled"
  });
  if (
    yamlNested.data.format !== "yaml" ||
    yamlNested.data.value_preview !== true
  ) {
    throw new Error("YAML nested pointer failed");
  }

  const yamlArray = await call({
    path: yamlPath,
    pointer: "/items/1/name"
  });
  if (yamlArray.data.value_preview !== "yaml-second") {
    throw new Error("YAML array pointer failed");
  }

  const tomlNested = await call({
    path: tomlPath,
    pointer: "/server/port"
  });
  if (
    tomlNested.data.format !== "toml" ||
    tomlNested.data.value_preview !== 7070
  ) {
    throw new Error("TOML nested pointer failed");
  }

  const tomlArray = await call({
    path: tomlPath,
    pointer: "/items/0/name"
  });
  if (tomlArray.data.value_preview !== "toml-first") {
    throw new Error("TOML array pointer failed");
  }

  const tomlNan = await call({
    path: tomlPath,
    pointer: "/numbers/nan"
  });
  if (tomlNan.data.value_preview?.$number !== "NaN") {
    throw new Error("TOML non-finite number preservation failed");
  }

  const stringBound = await call({
    path: jsonPath,
    pointer: "/long",
    max_string_chars: 16
  });
  if (
    stringBound.data.truncation.strings !== 1 ||
    stringBound.data.value_preview !== "x".repeat(16) + "…"
  ) {
    throw new Error("string bound failed");
  }

  const containerBound = await call({
    path: jsonPath,
    pointer: "/many",
    max_container_items: 2
  });
  if (
    containerBound.data.selected_summary.key_count !== 4 ||
    containerBound.data.selected_summary.keys.length !== 2 ||
    containerBound.data.truncation.container_items !== 2 ||
    !containerBound.data.value_preview.$truncated
  ) {
    throw new Error("container bound failed");
  }

  const depthBound = await call({
    path: jsonPath,
    pointer: "/deep",
    max_depth: 2
  });
  if (depthBound.data.truncation.depth < 1) {
    throw new Error("depth bound failed");
  }

  const outputBound = await call({
    path: jsonPath,
    pointer: "",
    max_container_items: 50,
    max_string_chars: 200,
    max_output_chars: 1000
  });
  if (
    outputBound.text.length > 1000 ||
    outputBound.data.truncation.final_output !== true ||
    outputBound.data.output_bound?.metadata_clipped !== true
  ) {
    throw new Error("final output bound failed");
  }

  const invalidPointer = await call({
    path: jsonPath,
    pointer: "server/port"
  }, true);
  if (invalidPointer.data.code !== "INVALID_POINTER") {
    throw new Error("invalid pointer diagnostic failed");
  }

  const missingPointer = await call({
    path: jsonPath,
    pointer: "/server/missing"
  }, true);
  if (missingPointer.data.code !== "POINTER_NOT_FOUND") {
    throw new Error("missing pointer diagnostic failed");
  }

  const invalidSyntax = await call({
    path: invalidPath
  }, true);
  if (
    invalidSyntax.data.code !== "PARSE_ERROR" ||
    invalidSyntax.data.message.length > 1200
  ) {
    throw new Error("parse diagnostic failed");
  }

  const fileTooLarge = await call({
    path: jsonPath,
    max_file_bytes: 16
  }, true);
  if (fileTooLarge.data.code !== "FILE_TOO_LARGE") {
    throw new Error("file-size bound failed");
  }

  const denied = await call({
    path: outsidePath
  }, true);
  if (!denied.data.message.includes("Access denied")) {
    throw new Error("restricted path guard failed");
  }

  const explicitFormatPath = path.join(root, "config.data");
  fs.copyFileSync(jsonPath, explicitFormatPath);
  const explicitFormat = await call({
    path: explicitFormatPath,
    format: "json",
    pointer: "/server/enabled"
  });
  if (explicitFormat.data.value_preview !== true) {
    throw new Error("explicit format override failed");
  }

  const autoUnknown = await call({
    path: explicitFormatPath
  }, true);
  if (!autoUnknown.data.message.includes("Unable to auto-detect")) {
    throw new Error("unknown extension auto-detection diagnostic failed");
  }

  console.log("structured_data_inspect JSON nested pointer: PASS");
  console.log("structured_data_inspect YAML nested pointer: PASS");
  console.log("structured_data_inspect TOML nested pointer: PASS");
  console.log("structured_data_inspect TOML non-finite number preservation: PASS");
  console.log("structured_data_inspect arrays/escaped pointers: PASS");
  console.log("structured_data_inspect string/container/depth/output bounds: PASS");
  console.log("structured_data_inspect invalid pointer/missing node: PASS");
  console.log("structured_data_inspect parse diagnostic: PASS");
  console.log("structured_data_inspect file-size bound: PASS");
  console.log("structured_data_inspect restricted path guard: PASS");
  console.log("structured_data_inspect explicit format override: PASS");
} finally {
  await pair[0].close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}
