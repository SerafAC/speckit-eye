// Copies the bundled fonts into dist/fonts/ (research D4): only the Latin and
// Latin-extended woff2 files of the three @fontsource packages, plus each
// package's licence as OFL-<family>.txt. Build-time only (`build:assets`);
// not part of the published package.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The font packages to copy from, in output order. */
export const FONT_PACKAGES = [
  "@fontsource-variable/geist",
  "@fontsource-variable/geist-mono",
  "@fontsource/instrument-serif",
];

/** Output folder, relative to the repository root. */
export const FONTS_DIR = "dist/fonts";

const VARIABLE_FONT = /^[a-z0-9-]+-latin(-ext)?-wght-normal\.woff2$/;
const STATIC_FONT = /^[a-z0-9-]+-latin(-ext)?-400-(normal|italic)\.woff2$/;

/**
 * Chooses the files to copy from the font packages.
 *
 * @param {{package: string, files: string[]}[]} entries one listing per
 *   package; `files` are paths relative to the package folder, for example
 *   `LICENSE` or `files/geist-latin-wght-normal.woff2`.
 * @returns {{from: string, to: string}[]} `from` is `<package>/<file>`
 *   (relative to `node_modules/`), `to` is a path under `dist/fonts/`;
 *   sorted by `to`.
 */
export function selectFontFiles(entries) {
  const pairs = [];
  for (const entry of entries) {
    const family = entry.package.split("/").pop();
    const variable = entry.package.startsWith("@fontsource-variable/");
    for (const file of entry.files) {
      const name = file.split("/").pop();
      let to = null;
      if (file === "LICENSE") {
        to = `OFL-${family}.txt`;
      } else if (file.startsWith("files/") && (variable ? VARIABLE_FONT : STATIC_FONT).test(name)) {
        to = name;
      }
      if (to) pairs.push({ from: `${entry.package}/${file}`, to: `${FONTS_DIR}/${to}` });
    }
  }
  return pairs.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
}

/** Lists the packages, then copies the selected files into dist/fonts/. */
function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const modules = path.join(root, "node_modules");
  const entries = FONT_PACKAGES.map((pkg) => ({
    package: pkg,
    files: [
      ...fs.readdirSync(path.join(modules, pkg)),
      ...fs.readdirSync(path.join(modules, pkg, "files")).map((f) => `files/${f}`),
    ],
  }));
  const pairs = selectFontFiles(entries);
  fs.mkdirSync(path.join(root, FONTS_DIR), { recursive: true });
  for (const { from, to } of pairs) fs.copyFileSync(path.join(modules, from), path.join(root, to));
  console.log(`Copied ${pairs.length} font files to ${FONTS_DIR}/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
