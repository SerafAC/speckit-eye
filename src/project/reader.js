/**
 * ProjectReader: the only place that reads input files (plan.md, research R7/R9).
 *
 * All paths are project-relative, POSIX-style strings. Every read goes through
 * `resolveInside`, so nothing outside the project root is ever read, with one
 * narrow exception: `readGitHead()` may read exactly the file `HEAD` inside a
 * worktree's gitdir (research R9).
 */

import path from "node:path";
import * as nodeFs from "node:fs/promises";

/**
 * @typedef {object} ReaderFs
 * @property {(p: string, o: {withFileTypes: true}) => Promise<{name: string, isDirectory(): boolean}[]>} readdir
 * @property {(p: string) => Promise<Uint8Array>} readFile
 * @property {(p: string) => Promise<{isDirectory(): boolean, isFile(): boolean}>} stat
 */

/**
 * @typedef {object} ProjectReader
 * @property {(relDir: string) => Promise<{name: string, isDir: boolean}[]>} list
 * @property {(relPath: string) => Promise<string>} read
 * @property {(relPath: string) => Promise<boolean>} exists
 * @property {() => Promise<{gitDir: string, head: string} | null>} readGitHead
 */

/**
 * Resolves `relPath` against `root` and throws when the result leaves `root`.
 * @param {string} root
 * @param {string} relPath
 * @returns {string} absolute path inside root
 */
export function resolveInside(root, relPath) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relPath);
  const rel = path.relative(base, resolved);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`path leaves the project root: ${relPath}`);
  }
  return resolved;
}

/** @param {unknown} err */
function isMissing(err) {
  const code = /** @type {{code?: string}} */ (err)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * @param {string} root
 * @param {ReaderFs} [fs]
 * @returns {ProjectReader}
 */
export function createReader(root, fs = /** @type {ReaderFs} */ (/** @type {unknown} */ (nodeFs))) {
  const base = path.resolve(root);

  /** @param {string} abs */
  async function readText(abs) {
    const bytes = await fs.readFile(abs);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  /** @param {string} abs */
  async function statOrNull(abs) {
    try {
      return await fs.stat(abs);
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  return {
    async list(relDir) {
      const abs = resolveInside(base, relDir);
      try {
        const entries = await fs.readdir(abs, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
      } catch (err) {
        if (isMissing(err)) return [];
        throw err;
      }
    },

    async read(relPath) {
      return readText(resolveInside(base, relPath));
    },

    async exists(relPath) {
      try {
        return (await statOrNull(resolveInside(base, relPath))) !== null;
      } catch {
        return false;
      }
    },

    async readGitHead() {
      try {
        const dotGit = resolveInside(base, ".git");
        const st = await statOrNull(dotGit);
        if (!st) return null;
        let gitDir;
        if (st.isDirectory()) {
          gitDir = dotGit;
        } else {
          const match = /^gitdir:\s*(.+?)\s*$/m.exec(await readText(dotGit));
          if (!match) return null;
          gitDir = path.resolve(base, match[1]);
        }
        // The only read allowed outside root: exactly `<gitDir>/HEAD`.
        const head = await readText(path.join(gitDir, "HEAD"));
        return { gitDir, head: head.trim() };
      } catch {
        return null;
      }
    },
  };
}
