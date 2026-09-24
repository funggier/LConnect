import fsp from "node:fs/promises";
import path from "node:path";

function normalizeCompare(value) {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isWithin(candidate, root) {
  const c = normalizeCompare(candidate);
  const r = normalizeCompare(root);
  return c === r || c.startsWith(r + path.sep.toLowerCase());
}

export function globToRegExp(pattern) {
  let out = "^";
  const normalized = String(pattern).replace(/\\/g, "/");
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      out += ".*";
      i += 1;
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

export function matchesAny(relativePath, patterns = []) {
  const normalized = String(relativePath).replace(/\\/g, "/");
  const base = path.posix.basename(normalized);
  return patterns.some((pattern) => {
    const regex = globToRegExp(pattern);
    return regex.test(normalized) || (!String(pattern).includes("/") && regex.test(base));
  });
}

export function makeExistingPathGuard(config) {
  const configuredRoots = (config.allowedDirectories || []).map((entry) => path.resolve(entry));
  let realRootsPromise;

  async function realRoots() {
    if (!realRootsPromise) {
      realRootsPromise = Promise.all(
        configuredRoots.map(async (root) => {
          try {
            return await fsp.realpath(root);
          } catch {
            return root;
          }
        })
      );
    }
    return realRootsPromise;
  }

  return async function resolveAllowedExisting(inputPath) {
    if (!inputPath || typeof inputPath !== "string") {
      throw new Error("A path is required.");
    }

    const resolved = path.resolve(inputPath);
    if (!config.fullMachineAccess && !configuredRoots.some((root) => isWithin(resolved, root))) {
      throw new Error("Access denied - path outside allowed directories: " + resolved);
    }

    const real = await fsp.realpath(resolved);
    if (!config.fullMachineAccess) {
      const roots = await realRoots();
      if (!roots.some((root) => isWithin(real, root))) {
        throw new Error("Access denied - resolved path outside allowed directories: " + real);
      }
    }

    return { resolved, real };
  };
}
