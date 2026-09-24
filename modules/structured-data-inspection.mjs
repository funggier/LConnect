import fsp from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { parseDocument as parseYamlDocument } from "yaml";
import { parse as parseToml } from "smol-toml";
import { makeExistingPathGuard } from "./path-utils.mjs";

const FORMATS = ["auto", "json", "yaml", "toml"];
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const HARD_MAX_FILE_BYTES = 20 * 1024 * 1024;

function boundedText(value, maxChars = 1000) {
  const text = String(value ?? "");
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "…";
}

function textResult(value, isError = false, maxOutputChars = 30000) {
  let payload = value;
  let text = JSON.stringify(payload, null, 2);

  if (text.length > maxOutputChars) {
    const originalOutputChars = text.length;
    payload = {
      ok: value?.ok !== false,
      path: value?.path ?? null,
      requested_path: value?.requested_path ?? null,
      format: value?.format ?? null,
      pointer: value?.pointer ?? "",
      selected_type: value?.selected_type ?? null,
      selected_summary: value?.selected_summary ?? null,
      truncation: {
        ...(value?.truncation || {}),
        final_output: true
      },
      output_bound: {
        max_output_chars: maxOutputChars,
        original_output_chars: originalOutputChars
      },
      note:
        "The structured value preview was omitted because the bounded final response would exceed max_output_chars. Query a narrower JSON Pointer or raise max_output_chars within the allowed bound."
    };
    text = JSON.stringify(payload, null, 2);

    if (text.length > maxOutputChars) {
      payload = {
        ok: value?.ok !== false,
        format: value?.format ?? null,
        pointer: boundedText(value?.pointer ?? "", 200),
        selected_type: value?.selected_type ?? null,
        truncation: {
          final_output: true
        },
        output_bound: {
          max_output_chars: maxOutputChars,
          original_output_chars: originalOutputChars,
          metadata_clipped: true
        },
        note:
          "Value preview and oversized metadata were omitted to enforce max_output_chars. Query a narrower JSON Pointer."
      };
      text = JSON.stringify(payload, null, 2);
    }
  }

  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {})
  };
}

function detectFormat(filePath, requested) {
  if (requested && requested !== "auto") return requested;

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  if (ext === ".toml") return "toml";

  throw new Error(
    "Unable to auto-detect structured data format from extension. Use format=json, yaml, or toml."
  );
}

async function readStableUtf8File(filePath, maxFileBytes) {
  const handle = await fsp.open(filePath, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error("Path is not a regular file: " + filePath);
    }
    if (before.size > maxFileBytes) {
      throw new Error(
        "FILE_TOO_LARGE: " + before.size +
        " bytes exceeds max_file_bytes=" + maxFileBytes + "."
      );
    }

    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < before.size) {
      const chunk = await handle.read(buffer, offset, before.size - offset, offset);
      if (!chunk.bytesRead) break;
      offset += chunk.bytesRead;
    }

    const after = await handle.stat();
    const stable =
      offset === before.size &&
      before.size === after.size &&
      before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs;

    if (!stable) {
      throw new Error(
        "FILE_CHANGED_DURING_READ: size/timestamps changed while structured data was being read."
      );
    }

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        offset === buffer.length ? buffer : buffer.subarray(0, offset)
      );
    } catch (error) {
      throw new Error("ENCODING_ERROR: expected valid UTF-8: " + error.message);
    }

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    return {
      text,
      size: before.size,
      modified_at: before.mtime.toISOString()
    };
  } finally {
    await handle.close();
  }
}

function parseStructured(text, format) {
  if (format === "json") {
    return JSON.parse(text);
  }

  if (format === "yaml") {
    const document = parseYamlDocument(text, {
      prettyErrors: true,
      strict: true,
      uniqueKeys: true
    });

    if (document.errors.length) {
      throw new Error(
        document.errors
          .slice(0, 3)
          .map((error) => boundedText(error.message, 800))
          .join(" | ")
      );
    }

    return document.toJS({
      maxAliasCount: 100,
      mapAsMap: false
    });
  }

  if (format === "toml") {
    return parseToml(text);
  }

  throw new Error("Unsupported structured data format: " + format);
}

function decodePointerSegment(segment) {
  if (/~(?![01])/u.test(segment)) {
    throw new Error(
      "INVALID_POINTER: JSON Pointer escape sequences may only use ~0 for ~ and ~1 for /."
    );
  }
  return segment.replace(/~1/gu, "/").replace(/~0/gu, "~");
}

function parsePointer(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new Error('INVALID_POINTER: JSON Pointer must be empty or start with "/".');
  }
  return pointer.slice(1).split("/").map(decodePointerSegment);
}

function nodeType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  return typeof value;
}

function encodePointerSegments(segments) {
  return "/" + segments
    .map((segment) => String(segment).replace(/~/gu, "~0").replace(/\//gu, "~1"))
    .join("/");
}

function resolvePointer(root, pointer) {
  const segments = parsePointer(pointer);
  let current = root;

  for (let index = 0; index < segments.length; index += 1) {
    const token = segments[index];
    const traversed = encodePointerSegments(segments.slice(0, index + 1));

    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/u.test(token)) {
        throw new Error(
          "POINTER_NOT_FOUND: " + traversed + " is not a valid array index."
        );
      }
      const arrayIndex = Number(token);
      if (!Number.isSafeInteger(arrayIndex) || arrayIndex >= current.length) {
        throw new Error(
          "POINTER_NOT_FOUND: " + traversed + " is outside the array."
        );
      }
      current = current[arrayIndex];
      continue;
    }

    if (current && typeof current === "object") {
      if (current instanceof Map) {
        if (!current.has(token)) {
          throw new Error(
            "POINTER_NOT_FOUND: " + traversed + " does not exist."
          );
        }
        current = current.get(token);
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        throw new Error(
          "POINTER_NOT_FOUND: " + traversed + " does not exist."
        );
      }
      current = current[token];
      continue;
    }

    throw new Error(
      "POINTER_NOT_FOUND: cannot traverse " + traversed +
      "; parent node is " + nodeType(current) + "."
    );
  }

  return current;
}

function objectEntries(value) {
  if (value instanceof Map) {
    return [...value.entries()].map(([key, child]) => [String(key), child]);
  }
  return Object.entries(value);
}

function previewValue(value, bounds, state, depth = 0) {
  const type = nodeType(value);

  if (value === null || type === "boolean") return value;
  if (type === "number") {
    return Number.isFinite(value) ? value : { $number: String(value) };
  }
  if (type === "bigint") return { $bigint: value.toString() };
  if (type === "undefined") return { $undefined: true };
  if (type === "date") return { $date: value.toISOString() };

  if (type === "string") {
    if (value.length <= bounds.maxStringChars) return value;
    state.strings += 1;
    return value.slice(0, bounds.maxStringChars) + "…";
  }

  if (depth >= bounds.maxDepth) {
    state.depth += 1;
    return {
      $truncated: "max_depth",
      type
    };
  }

  if (Array.isArray(value)) {
    const limit = Math.min(value.length, bounds.maxContainerItems);
    const output = [];
    for (let i = 0; i < limit; i += 1) {
      output.push(previewValue(value[i], bounds, state, depth + 1));
    }
    if (value.length > limit) {
      state.container_items += value.length - limit;
    }
    return output;
  }

  if (value instanceof Set) {
    return previewValue([...value], bounds, state, depth);
  }

  if (type === "object" || type === "map") {
    const entries = objectEntries(value).sort(([a], [b]) => a.localeCompare(b));
    const limit = Math.min(entries.length, bounds.maxContainerItems);
    const output = Object.create(null);
    for (let i = 0; i < limit; i += 1) {
      const [key, child] = entries[i];
      output[key] = previewValue(child, bounds, state, depth + 1);
    }
    if (entries.length > limit) {
      state.container_items += entries.length - limit;
    }
    return output;
  }

  return boundedText(String(value), bounds.maxStringChars);
}

function selectedSummary(value, maxKeys) {
  const type = nodeType(value);
  const summary = { type };

  if (Array.isArray(value)) {
    summary.length = value.length;
    return summary;
  }

  if (type === "object" || type === "map") {
    const keys = objectEntries(value).map(([key]) => key).sort();
    summary.key_count = keys.length;
    summary.keys = keys.slice(0, maxKeys);
    summary.keys_truncated = keys.length > maxKeys;
    return summary;
  }

  if (type === "string") {
    summary.length = value.length;
  }

  return summary;
}

function structuredError(error, evidence, maxOutputChars) {
  const rawMessage = String(error?.message || error);
  const prefix = rawMessage.split(":")[0];
  const code = /^[A-Z][A-Z0-9_]*$/u.test(prefix)
    ? prefix
    : "STRUCTURED_DATA_ERROR";

  return textResult(
    {
      ok: false,
      code,
      message: boundedText(rawMessage, 1200),
      ...evidence
    },
    true,
    maxOutputChars
  );
}

export function registerStructuredDataInspectionTool(server, config) {
  const resolveAllowedExisting = makeExistingPathGuard(config);

  server.tool(
    "structured_data_inspect",
    "Parse a bounded UTF-8 JSON, YAML, or TOML file and inspect one node using RFC 6901 JSON Pointer. Returns compact metadata plus a bounded structured value preview without modifying the file.",
    {
      path: z.string().min(1),
      format: z.enum(FORMATS).optional(),
      pointer: z.string().max(4000).optional(),
      max_file_bytes: z.number().int().min(1).max(HARD_MAX_FILE_BYTES).optional(),
      max_depth: z.number().int().min(1).max(20).optional(),
      max_container_items: z.number().int().min(1).max(500).optional(),
      max_string_chars: z.number().int().min(16).max(20000).optional(),
      max_output_chars: z.number().int().min(1000).max(100000).optional()
    },
    async ({
      path: inputPath,
      format: requestedFormat = "auto",
      pointer = "",
      max_file_bytes = DEFAULT_MAX_FILE_BYTES,
      max_depth = 6,
      max_container_items = 50,
      max_string_chars = 2000,
      max_output_chars = 30000
    }) => {
      let evidence = {
        requested_path: path.resolve(inputPath),
        path: null,
        format: requestedFormat,
        pointer
      };

      try {
        const guarded = await resolveAllowedExisting(inputPath);
        const filePath = guarded.real;
        const format = detectFormat(filePath, requestedFormat);
        evidence = {
          requested_path: guarded.resolved,
          path: filePath,
          resolved_path_changed: guarded.resolved !== filePath,
          format,
          pointer
        };

        const file = await readStableUtf8File(filePath, max_file_bytes);

        let parsed;
        try {
          parsed = parseStructured(file.text, format);
        } catch (error) {
          throw new Error("PARSE_ERROR: " + boundedText(error.message, 1000));
        }

        const selected = resolvePointer(parsed, pointer);
        const truncation = {
          depth: 0,
          container_items: 0,
          strings: 0,
          final_output: false
        };
        const bounds = {
          maxDepth: max_depth,
          maxContainerItems: max_container_items,
          maxStringChars: max_string_chars
        };
        const summary = selectedSummary(selected, max_container_items);
        const preview = previewValue(selected, bounds, truncation);

        return textResult(
          {
            ok: true,
            ...evidence,
            file: {
              size_bytes: file.size,
              modified_at: file.modified_at,
              encoding: "utf-8"
            },
            selected_type: nodeType(selected),
            selected_summary: summary,
            value_preview: preview,
            bounds: {
              max_file_bytes,
              max_depth,
              max_container_items,
              max_string_chars,
              max_output_chars
            },
            truncation
          },
          false,
          max_output_chars
        );
      } catch (error) {
        return structuredError(error, evidence, max_output_chars);
      }
    }
  );
}
