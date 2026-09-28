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
  "pack-check": notImplemented("pack-check"),
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
