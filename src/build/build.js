/**
 * Build mode output (contracts/cli.md "Build", FR-033): writes the site map
 * from `render/site.js` to the `--out` folder. The file system is injected
 * (an `fs/promises`-like object) so unit tests use an in-memory fake.
 */

import path from "node:path";

/** Name of the marker file that identifies a folder written by this tool. */
export const MARKER = ".speckit-eye-build";

/**
 * @typedef {object} BuildFs
 * @property {(dir: string) => Promise<string[]>} readdir
 * @property {(p: string, options: {recursive: true, force: true}) => Promise<void>} rm
 * @property {(dir: string, options: {recursive: true}) => Promise<unknown>} mkdir
 * @property {(file: string, data: string) => Promise<void>} writeFile
 */

/**
 * @param {string} parent
 * @param {string} child
 * @returns {boolean} whether `child` is `parent` or inside it
 */
function within(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Lists `dir`, or returns null when it does not exist.
 * @param {BuildFs} fs
 * @param {string} dir
 * @returns {Promise<string[] | null>}
 */
async function listOrNull(fs, dir) {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    if (/** @type {{code?: string}} */ (err)?.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Writes every page and asset of `site` under `out`, then the marker.
 * Nothing is written when `out` is refused (usage error, exit code 2).
 * @param {object} options
 * @param {import("../render/site.js").Site} options.site
 * @param {string} options.out absolute output folder
 * @param {string} options.projectRoot absolute project folder
 * @param {BuildFs} options.fs
 * @returns {Promise<{pages: number} | {error: string, code: 1 | 2}>}
 */
export async function writeSite({ site, out, projectRoot, fs }) {
  const target = path.resolve(out);
  const root = path.resolve(projectRoot);
  if (target === root) {
    return { error: `--out must not be the project folder itself (${target})`, code: 2 };
  }
  for (const name of ["specs", ".specify"]) {
    if (within(path.join(root, name), target)) {
      return { error: `--out must not be inside ${name}/ of the project (${target})`, code: 2 };
    }
  }

  let entries;
  try {
    entries = await listOrNull(fs, target);
  } catch (err) {
    const code = /** @type {{code?: string}} */ (err)?.code;
    if (code === "ENOTDIR") return { error: `--out is not a folder: ${target}`, code: 2 };
    return { error: `cannot read ${target}: ${/** @type {Error} */ (err)?.message ?? String(err)}`, code: 1 };
  }
  if (entries && entries.length > 0 && !entries.includes(MARKER)) {
    return {
      error: `${target} is not empty and was not written by speckit-eye (no ${MARKER} file); nothing was written`,
      code: 2,
    };
  }

  let pages = 0;
  try {
    // A previous build of this tool: remove everything but the marker so no
    // stale page stays and an interrupted build can still be replaced.
    for (const name of (entries ?? []).filter((n) => n !== MARKER)) {
      await fs.rm(path.join(target, name), { recursive: true, force: true });
    }
    await fs.mkdir(target, { recursive: true });
    for (const [key, { body }] of site) {
      const file = path.join(target, ...key.split("/"));
      if (!within(target, file) || file === target) throw new Error(`refusing to write outside --out: ${key}`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
      if (key.endsWith(".html")) pages += 1;
    }
    await fs.writeFile(path.join(target, MARKER), "This folder was written by speckit-eye --build and is replaced on the next build.\n");
  } catch (err) {
    return { error: `cannot write ${target}: ${/** @type {Error} */ (err)?.message ?? String(err)}`, code: 1 };
  }
  return { pages };
}
