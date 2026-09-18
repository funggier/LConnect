import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

function normalizeCompare(value) {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(candidate, root) {
  const c = normalizeCompare(candidate);
  const r = normalizeCompare(root);
  return c === r || c.startsWith(r + path.sep.toLowerCase());
}

function makePathGuard(fullMachineAccess, allowedDirectories) {
  return function resolveAllowed(inputPath) {
    if (!inputPath || typeof inputPath !== "string") {
      throw new Error("A path is required.");
    }

    const resolved = path.resolve(inputPath);

    if (fullMachineAccess) {
      return resolved;
    }

    if (!allowedDirectories.some((root) => isWithin(resolved, root))) {
      throw new Error(`Access denied - path outside allowed directories: ${resolved}`);
    }

    return resolved;
  };
}

function textResult(text, isError = false) {
  return { content: [{ type: "text", text: String(text) }], ...(isError ? { isError: true } : {}) };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function globToRegExp(pattern) {
  let out = "^";
  const normalized = pattern.replace(/\\/g, "/");
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      out += ".*";
      i++;
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else if ("\\.^$+{}()|[]".includes(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out, process.platform === "win32" ? "i" : "");
}

function matchesAny(relativePath, patterns = []) {
  const p = relativePath.replace(/\\/g, "/");
  return patterns.some((pattern) => globToRegExp(pattern).test(p));
}

async function walk(root, excludePatterns, visitor, relative = "") {
  const current = relative ? path.join(root, relative) : root;
  const entries = await fsp.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    const relSlash = rel.replace(/\\/g, "/");
    if (matchesAny(relSlash, excludePatterns)) continue;
    const abs = path.join(root, rel);
    await visitor(entry, abs, relSlash);
    if (entry.isDirectory()) {
      await walk(root, excludePatterns, visitor, rel);
    }
  }
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const table = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".pdf": "application/pdf",
  };
  return table[ext] || "application/octet-stream";
}

export function registerFilesystemTools(server, config) {
  const resolveAllowed = makePathGuard(config.fullMachineAccess, config.allowedDirectories);

  server.tool("list_allowed_directories", "Returns the current LConnect filesystem access scope.", {}, async () =>
    textResult(
      config.fullMachineAccess
        ? "Full machine access: enabled\nFilesystem scope: every path accessible to the Windows account running LConnect."
        : "Full machine access: disabled\nAllowed directories:\n" + config.allowedDirectories.join("\n")
    )
  );

  const readTextHandler = async ({ path: inputPath, head, tail }) => {
    try {
      if (head && tail) throw new Error("Use either head or tail, not both.");
      const filePath = resolveAllowed(inputPath);
      const text = await fsp.readFile(filePath, "utf8");
      if (head) return textResult(text.split(/\r?\n/).slice(0, head).join("\n"));
      if (tail) return textResult(text.split(/\r?\n/).slice(-tail).join("\n"));
      return textResult(text);
    } catch (error) {
      return textResult(error.message, true);
    }
  };

  const readSchema = {
    path: z.string().min(1),
    head: z.number().int().min(1).optional(),
    tail: z.number().int().min(1).optional(),
  };

  server.tool("read_text_file", "Read a text file. Supports optional head or tail line limits.", readSchema, readTextHandler);
  server.tool("read_file", "Deprecated alias of read_text_file.", readSchema, readTextHandler);

  server.tool("read_multiple_files", "Read multiple text files in one call.", {
    paths: z.array(z.string().min(1)).min(1),
  }, async ({ paths }) => {
    const blocks = [];
    for (const inputPath of paths) {
      try {
        const filePath = resolveAllowed(inputPath);
        const content = await fsp.readFile(filePath, "utf8");
        blocks.push(`${filePath}:\n${content}`);
      } catch (error) {
        blocks.push(`${inputPath}:\nERROR: ${error.message}`);
      }
    }
    return textResult(blocks.join("\n\n---\n"));
  });

  server.tool("read_media_file", "Read an image/audio/other file as base64 content.", {
    path: z.string().min(1),
  }, async ({ path: inputPath }) => {
    try {
      const filePath = resolveAllowed(inputPath);
      const data = await fsp.readFile(filePath);
      const mimeType = mimeFor(filePath);
      const base64 = data.toString("base64");
      if (mimeType.startsWith("image/")) {
        return { content: [{ type: "image", data: base64, mimeType }] };
      }
      if (mimeType.startsWith("audio/")) {
        return { content: [{ type: "audio", data: base64, mimeType }] };
      }
      return {
        content: [{
          type: "resource",
          resource: { uri: pathToFileURL(filePath).href, mimeType, blob: base64 },
        }],
      };
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("write_file", "Create or overwrite a text file.", {
    path: z.string().min(1),
    content: z.string(),
  }, async ({ path: inputPath, content }) => {
    try {
      const filePath = resolveAllowed(inputPath);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, content, "utf8");
      return textResult(`Successfully wrote ${content.length} characters to ${filePath}`);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("edit_file", "Replace exact text sequences in a text file and return a compact diff.", {
    path: z.string().min(1),
    edits: z.array(z.object({
      oldText: z.string(),
      newText: z.string(),
    })).min(1),
    dryRun: z.boolean().optional(),
  }, async ({ path: inputPath, edits, dryRun }) => {
    try {
      const filePath = resolveAllowed(inputPath);
      const before = await fsp.readFile(filePath, "utf8");
      let after = before;
      const changes = [];
      for (const edit of edits) {
        const index = after.indexOf(edit.oldText);
        if (index < 0) throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
        after = after.slice(0, index) + edit.newText + after.slice(index + edit.oldText.length);
        changes.push(`- ${edit.oldText}\n+ ${edit.newText}`);
      }
      if (!dryRun) await fsp.writeFile(filePath, after, "utf8");
      return textResult(`File: ${filePath}\n${dryRun ? "DRY RUN\n" : ""}${changes.join("\n\n")}`);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("create_directory", "Create a directory recursively if needed.", {
    path: z.string().min(1),
  }, async ({ path: inputPath }) => {
    try {
      const dirPath = resolveAllowed(inputPath);
      await fsp.mkdir(dirPath, { recursive: true });
      return textResult(`Directory ready: ${dirPath}`);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("list_directory", "List files and directories in one directory.", {
    path: z.string().min(1),
  }, async ({ path: inputPath }) => {
    try {
      const dirPath = resolveAllowed(inputPath);
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return textResult(entries.map((e) => `[${e.isDirectory() ? "DIR" : "FILE"}] ${e.name}`).join("\n"));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("list_directory_with_sizes", "List directory entries with file sizes.", {
    path: z.string().min(1),
    sortBy: z.enum(["name", "size"]).optional(),
  }, async ({ path: inputPath, sortBy }) => {
    try {
      const dirPath = resolveAllowed(inputPath);
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      const rows = await Promise.all(entries.map(async (entry) => {
        const abs = path.join(dirPath, entry.name);
        const stat = await fsp.stat(abs);
        return { entry, size: entry.isDirectory() ? 0 : stat.size };
      }));
      rows.sort((a, b) => sortBy === "size"
        ? b.size - a.size || a.entry.name.localeCompare(b.entry.name)
        : a.entry.name.localeCompare(b.entry.name));
      let total = 0;
      const lines = rows.map(({ entry, size }) => {
        total += size;
        return `[${entry.isDirectory() ? "DIR" : "FILE"}] ${entry.name}${entry.isDirectory() ? "" : "  " + formatBytes(size)}`;
      });
      lines.push("", `Total: ${rows.length} entries`, `Combined file size: ${formatBytes(total)}`);
      return textResult(lines.join("\n"));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("directory_tree", "Return a recursive JSON directory tree.", {
    path: z.string().min(1),
    excludePatterns: z.array(z.string()).optional(),
  }, async ({ path: inputPath, excludePatterns }) => {
    try {
      const root = resolveAllowed(inputPath);
      async function build(dir, rel = "") {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        const result = [];
        for (const entry of entries) {
          const childRel = rel ? `${rel}/${entry.name}` : entry.name;
          if (matchesAny(childRel, excludePatterns || [])) continue;
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            result.push({ name: entry.name, type: "directory", children: await build(abs, childRel) });
          } else {
            result.push({ name: entry.name, type: "file" });
          }
        }
        return result;
      }
      return textResult(JSON.stringify(await build(root), null, 2));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("move_file", "Move or rename a file or directory.", {
    source: z.string().min(1),
    destination: z.string().min(1),
  }, async ({ source, destination }) => {
    try {
      const src = resolveAllowed(source);
      const dst = resolveAllowed(destination);
      if (fs.existsSync(dst)) throw new Error(`Destination already exists: ${dst}`);
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.rename(src, dst);
      return textResult(`Moved ${src} -> ${dst}`);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("search_files", "Recursively search for files/directories using glob-style patterns.", {
    path: z.string().min(1),
    pattern: z.string().min(1),
    excludePatterns: z.array(z.string()).optional(),
  }, async ({ path: inputPath, pattern, excludePatterns }) => {
    try {
      const root = resolveAllowed(inputPath);
      const regex = globToRegExp(pattern);
      const found = [];
      await walk(root, excludePatterns || [], async (_entry, abs, rel) => {
        if (regex.test(rel)) found.push(abs);
      });
      return textResult(found.length ? found.join("\n") : "No matches found.");
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("get_file_info", "Return metadata for a file or directory.", {
    path: z.string().min(1),
  }, async ({ path: inputPath }) => {
    try {
      const filePath = resolveAllowed(inputPath);
      const stat = await fsp.stat(filePath);
      const info = {
        path: filePath,
        type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
        size: stat.size,
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        accessed: stat.atime.toISOString(),
        mode: stat.mode,
      };
      return textResult(JSON.stringify(info, null, 2));
    } catch (error) {
      return textResult(error.message, true);
    }
  });
}
