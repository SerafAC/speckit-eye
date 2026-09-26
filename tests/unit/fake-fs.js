/** In-memory file system for build output tests (T053, T055). */

import path from "node:path";

/**
 * An in-memory `fs/promises`-like object: `files` maps absolute paths to
 * contents (strings, or `Uint8Array` copies for bytes), `dirs` holds
 * absolute folder paths, `encodings` the encoding each file was written with.
 * @param {Record<string, string>} [initial] absolute file path → content
 */
export function fakeFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  const dirs = new Set();
  const addParents = (p) => {
    for (let d = path.dirname(p); d !== path.dirname(d); d = path.dirname(d)) dirs.add(d);
    dirs.add(path.parse(p).root);
  };
  for (const f of files.keys()) addParents(f);
  const enoent = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
  const writes = [];
  /** @type {Map<string, string | null>} file → encoding passed to the last writeFile */
  const encodings = new Map();
  const fs = {
    files,
    encodings,
    dirs,
    writes,
    async readdir(dir) {
      if (files.has(dir)) throw Object.assign(new Error(`ENOTDIR: ${dir}`), { code: "ENOTDIR" });
      if (!dirs.has(dir)) throw enoent(dir);
      const names = new Set();
      for (const p of [...files.keys(), ...dirs]) {
        if (p !== dir && path.dirname(p) === dir) names.add(path.basename(p));
      }
      return [...names].sort();
    },
    async rm(p) {
      files.delete(p);
      for (const f of [...files.keys()]) if (f.startsWith(p + path.sep)) files.delete(f);
      dirs.delete(p);
      for (const d of [...dirs]) if (d.startsWith(p + path.sep)) dirs.delete(d);
    },
    async mkdir(dir) {
      if (files.has(dir)) throw Object.assign(new Error(`EEXIST: ${dir}`), { code: "EEXIST" });
      dirs.add(dir);
      addParents(dir);
    },
    async writeFile(file, data, encoding) {
      if (!dirs.has(path.dirname(file))) throw enoent(file);
      // Bytes are kept as a copy of the Uint8Array, text as a string.
      files.set(file, data instanceof Uint8Array ? new Uint8Array(data) : String(data));
      encodings.set(file, encoding ?? null);
      writes.push(file);
    },
  };
  return fs;
}
