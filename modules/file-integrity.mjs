import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { makeExistingPathGuard } from "./path-utils.mjs";

const ALGORITHMS = ["sha256", "sha384", "sha512"];

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function sameStatIdentity(left, right) {
  if (!left || !right) return null;
  if (typeof left.dev !== "number" || typeof left.ino !== "number") return null;
  if (typeof right.dev !== "number" || typeof right.ino !== "number") return null;
  return left.dev === right.dev && left.ino === right.ino;
}

function statSnapshot(stat) {
  return {
    size: stat.size,
    modified_at: stat.mtime.toISOString(),
    changed_at: stat.ctime.toISOString(),
    dev: typeof stat.dev === "number" ? stat.dev : null,
    ino: typeof stat.ino === "number" ? stat.ino : null,
  };
}

async function hashOne(inputPath, algorithm, resolveAllowedExisting) {
  const requested = path.resolve(inputPath);
  const guarded = await resolveAllowedExisting(inputPath);
  const filePath = guarded.real;
  const handle = await fsp.open(filePath, "r");

  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error("Path is not a regular file: " + filePath);
    }

    const hash = createHash(algorithm);
    let bytesHashed = 0;
    const stream = handle.createReadStream({
      autoClose: false,
      highWaterMark: 1024 * 1024,
      start: 0,
    });

    for await (const chunk of stream) {
      hash.update(chunk);
      bytesHashed += chunk.length;
    }

    const digest = hash.digest("hex");
    const afterHandle = await handle.stat();

    let afterPath = null;
    try {
      afterPath = await fsp.stat(filePath);
    } catch {}

    const contentWindowStable =
      before.size === afterHandle.size &&
      before.mtimeMs === afterHandle.mtimeMs &&
      before.ctimeMs === afterHandle.ctimeMs &&
      bytesHashed === before.size;

    const pathIdentityStable = afterPath ? sameStatIdentity(afterHandle, afterPath) : false;
    const stableObserved = contentWindowStable && pathIdentityStable !== false;

    return {
      requested_path: requested,
      path: filePath,
      resolved_path_changed: requested !== filePath,
      algorithm,
      size: before.size,
      bytes_hashed: bytesHashed,
      digest,
      modified_at: before.mtime.toISOString(),
      stability: {
        stable_observed: stableObserved,
        content_window_stable: contentWindowStable,
        path_identity_stable: pathIdentityStable,
        before: statSnapshot(before),
        after_handle: statSnapshot(afterHandle),
        after_path: afterPath ? statSnapshot(afterPath) : null,
        note:
          "Stability evidence compares size/timestamps on the open handle and path identity after hashing. It cannot prove absence of an in-place same-size mutation that preserves observable metadata.",
      },
    };
  } finally {
    await handle.close();
  }
}

export function registerFileIntegrityTools(server, config) {
  const resolveAllowedExisting = makeExistingPathGuard(config);

  server.tool(
    "file_hash",
    "Stream a file and return deterministic cryptographic digest evidence without loading the whole file into memory. SHA-256 is the default.",
    {
      path: z.string().min(1),
      algorithm: z.enum(ALGORITHMS).optional(),
    },
    async ({ path: inputPath, algorithm = "sha256" }) => {
      try {
        return textResult(await hashOne(inputPath, algorithm, resolveAllowedExisting));
      } catch (error) {
        return textResult(error.message, true);
      }
    }
  );

  server.tool(
    "compare_files",
    "Compare two files using size plus a streaming cryptographic digest and return evidence for both sides. SHA-256 is the default.",
    {
      left: z.string().min(1),
      right: z.string().min(1),
      algorithm: z.enum(ALGORITHMS).optional(),
    },
    async ({ left, right, algorithm = "sha256" }) => {
      try {
        const leftEvidence = await hashOne(left, algorithm, resolveAllowedExisting);
        const rightEvidence = await hashOne(right, algorithm, resolveAllowedExisting);
        const sizeEqual = leftEvidence.size === rightEvidence.size;
        const digestEqual = leftEvidence.digest === rightEvidence.digest;
        const reliable =
          leftEvidence.stability.stable_observed &&
          rightEvidence.stability.stable_observed;

        return textResult({
          equal: sizeEqual && digestEqual,
          size_equal: sizeEqual,
          digest_equal: digestEqual,
          algorithm,
          comparison_reliable: reliable,
          uncertainty: reliable
            ? null
            : "At least one file changed or could not retain stable path identity during hashing; compare the returned stability evidence before relying on equality.",
          left: leftEvidence,
          right: rightEvidence,
        });
      } catch (error) {
        return textResult(error.message, true);
      }
    }
  );
}
