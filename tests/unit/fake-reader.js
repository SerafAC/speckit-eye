/**
 * In-memory ProjectReader for unit tests (same interface as createReader).
 *
 * `files` maps project-relative POSIX paths to their content, or to an Error
 * that `read` throws. Folders are implied by the paths.
 *
 * @example
 *   createFakeReader({ "specs/001-x/spec.md": "# Feature Specification: X", "bad.md": new Error("EIO") },
 *                    { gitHead: "ref: refs/heads/001-x" })
 */

/**
 * @param {string} p
 * @returns {string}
 */
function normalize(p) {
  return String(p)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "")
    .replace(/^\.$/, "");
}

/**
 * @param {Record<string, string | Error>} files
 * @param {{ gitHead?: string | { gitDir: string, head: string } | null }} [options]
 * @returns {import("../../src/project/reader.js").ProjectReader}
 */
export function createFakeReader(files, { gitHead = null } = {}) {
  const entries = new Map(Object.entries(files).map(([k, v]) => [normalize(k), v]));

  /** @param {string} rel */
  function isDir(rel) {
    if (rel === "") return true;
    const prefix = `${rel}/`;
    for (const key of entries.keys()) if (key.startsWith(prefix)) return true;
    return false;
  }

  return {
    async list(relDir) {
      const dir = normalize(relDir);
      const prefix = dir === "" ? "" : `${dir}/`;
      /** @type {Map<string, boolean>} */
      const children = new Map();
      for (const key of entries.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) {
          if (!children.has(rest)) children.set(rest, false);
        } else {
          children.set(rest.slice(0, slash), true);
        }
      }
      return [...children].map(([name, dirFlag]) => ({ name, isDir: dirFlag }));
    },

    async read(relPath) {
      const key = normalize(relPath);
      if (!entries.has(key)) {
        throw Object.assign(new Error(`ENOENT: ${key}`), { code: "ENOENT" });
      }
      const value = entries.get(key);
      if (value instanceof Error) throw value;
      return /** @type {string} */ (value);
    },

    async exists(relPath) {
      const key = normalize(relPath);
      return entries.has(key) || isDir(key);
    },

    async readGitHead() {
      if (gitHead === null || gitHead === undefined) return null;
      if (typeof gitHead === "string") return { gitDir: "/fake/.git", head: gitHead };
      return gitHead;
    },
  };
}
