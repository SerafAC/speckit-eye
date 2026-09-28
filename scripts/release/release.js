// Release rules for the Bump and Release workflows (contracts/release-cli.md).
// Development-only: not part of the published package. All rules are pure,
// exported functions; `main(argv, io)` wires them to injected I/O so it can be
// unit tested with fakes. Run from the repository root:
//   node scripts/release/release.js <command> [options]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export const USAGE = `Usage: node scripts/release/release.js <command> [options]

Commands:
  bump <kind> [--preid <id>] | bump --version <X.Y.Z>
  verify --tag <vX.Y.Z>
  notes --version <X.Y.Z>
  release-commit --version <X.Y.Z> --head-ref <branch> --tag-exists <true|false>
  pack-check <file-list.json>
`;

const OPTIONS = {
  preid: { type: "string" },
  version: { type: "string" },
  tag: { type: "string" },
  "head-ref": { type: "string" },
  "tag-exists": { type: "string" },
};

// MAJOR.MINOR.PATCH with an optional `-<id>.<n>` pre-release; no leading
// zeros, no build metadata (data-model Version).
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([A-Za-z][0-9A-Za-z-]*)\.(0|[1-9]\d*))?$/;

/**
 * Parses a release version.
 *
 * @param {string} text for example `1.2.3` or `1.3.0-rc.1`
 * @returns {{major: number, minor: number, patch: number, pre: {id: string, n: number} | null} | null}
 *   `null` when `text` is not a valid release version.
 */
export function parseVersion(text) {
  const m = VERSION.exec(String(text));
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] === undefined ? null : { id: m[4], n: Number(m[5]) },
  };
}

/**
 * Formats a version returned by `parseVersion`.
 *
 * @param {{major: number, minor: number, patch: number, pre: {id: string, n: number} | null}} v
 * @returns {string}
 */
export function formatVersion(v) {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  return v.pre ? `${base}-${v.pre.id}.${v.pre.n}` : base;
}

/** Fixed files every package must contain (FR-002). */
export const PACK_REQUIRED = ["package.json", "README.md", "CHANGELOG.md", "LICENSE", "bin/speckit-eye.js", "dist/styles.css"];

/**
 * Whether a packed path is allowed in the published package (FR-002):
 * the fixed files, `src/**\/*.js` except `src/styles/**`, the fonts and
 * their licences.
 *
 * @param {string} p a `/`-separated path relative to the package root
 * @returns {boolean}
 */
function isAllowedPackPath(p) {
  if (PACK_REQUIRED.includes(p)) return true;
  if (p.startsWith("src/") && p.endsWith(".js") && !p.startsWith("src/styles/")) return true;
  return /^dist\/fonts\/[^/]+\.woff2$/.test(p) || /^dist\/fonts\/OFL-[^/]+\.txt$/.test(p);
}

/**
 * Checks the file list of a packed tarball against the allowed and required
 * files (contracts/release-cli.md "pack-check").
 *
 * @param {string[]} paths the packed paths, relative to the package root
 * @returns {{unexpected: string[], missing: string[]}} both sorted; empty when the package is right
 */
export function checkPackFiles(paths) {
  const files = paths.map((p) => String(p).replace(/\\/g, "/").replace(/^package\//, ""));
  const unexpected = files.filter((p) => !isAllowedPackPath(p)).sort();
  const missing = PACK_REQUIRED.filter((p) => !files.includes(p));
  if (!files.some((p) => p.startsWith("src/") && isAllowedPackPath(p))) missing.push("src/**/*.js");
  if (!files.some((p) => /^dist\/fonts\/[^/]+\.woff2$/.test(p))) missing.push("dist/fonts/*.woff2");
  return { unexpected, missing };
}

/**
 * Reads the packed paths from `npm pack --dry-run --json` (an array of
 * packages, `[{files: [{path}]}]`) or `pnpm pack --json` (one object,
 * `{files: [{path}]}`). Lines that lifecycle scripts (`prepack`) print before
 * the JSON on the same stdout are skipped.
 *
 * @param {string} text
 * @returns {string[] | null} `null` when the text holds no such file list
 */
export function parsePackFileList(text) {
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*[[{]/.test(lines[i])) continue;
    let data;
    try {
      data = JSON.parse(lines.slice(i).join("\n"));
    } catch {
      continue;
    }
    const packs = Array.isArray(data) ? data : [data];
    if (packs.length === 0 || !packs.every((pk) => pk && Array.isArray(pk.files))) return null;
    const paths = packs.flatMap((pk) => pk.files.map((f) => f?.path));
    return paths.every((p) => typeof p === "string") ? paths : null;
  }
  return null;
}

/** `pack-check <file-list.json>`: exit 1 and list every wrong path on stderr. */
function packCheck(args, _options, io) {
  if (args.length !== 1) {
    io.stderr(`pack-check needs exactly one <file-list.json>\n${USAGE}`);
    return 2;
  }
  let text;
  try {
    text = io.readFile(args[0]);
  } catch (error) {
    io.stderr(`pack-check: cannot read ${args[0]}: ${error.message}\n`);
    return 1;
  }
  const paths = parsePackFileList(text);
  if (!paths) {
    io.stderr(`pack-check: ${args[0]} is not the JSON of npm pack --json or pnpm pack --json\n`);
    return 1;
  }
  const { unexpected, missing } = checkPackFiles(paths);
  for (const p of unexpected) io.stderr(`unexpected file in package: ${p}\n`);
  for (const p of missing) io.stderr(`missing from package: ${p}\n`);
  if (unexpected.length || missing.length) return 1;
  io.stdout(`pack-check: ${paths.length} files OK\n`);
  return 0;
}

/** Placeholder for a command whose story task has not been done yet. */
function notImplemented(name) {
  return (_args, _options, io) => {
    io.stderr(`${name}: not implemented\n`);
    return 1;
  };
}

/** The commands, by name: `(positionals, options, io) => exit code`. */
const COMMANDS = {
  bump: notImplemented("bump"),
  verify: notImplemented("verify"),
  notes: notImplemented("notes"),
  "release-commit": notImplemented("release-commit"),
  "pack-check": packCheck,
};

/**
 * Runs one command.
 *
 * @param {string[]} argv the arguments after the script path
 * @param {{readFile: (p: string) => string, writeFile: (p: string, s: string) => void,
 *   stdout: (s: string) => void, stderr: (s: string) => void, now: () => Date}} io
 * @returns {number} the exit code: 0 success, 1 failed check, 2 bad usage
 */
export function main(argv, io) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    io.stderr(`${error.message}\n${USAGE}`);
    return 2;
  }
  const [command, ...rest] = parsed.positionals;
  if (!Object.hasOwn(COMMANDS, command ?? "")) {
    io.stderr(command === undefined ? USAGE : `Unknown command: ${command}\n${USAGE}`);
    return 2;
  }
  return COMMANDS[command](rest, parsed.values, io);
}

/** Real I/O, relative to the current directory. */
export const nodeIo = {
  readFile: (p) => fs.readFileSync(p, "utf8"),
  writeFile: (p, s) => fs.writeFileSync(p, s),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  now: () => new Date(),
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), nodeIo);
