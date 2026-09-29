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

/** The `bump` kinds (data-model "Next version"). */
export const BUMP_KINDS = ["patch", "minor", "major", "prepatch", "preminor", "premajor", "prerelease"];

/**
 * Computes the next version (data-model "Next version" table).
 *
 * @param {string} current the current version, e.g. `1.2.3` or `1.3.0-rc.1`
 * @param {string} kind one of `BUMP_KINDS`
 * @param {string} [preid] the pre-release id, `rc` by default
 * @returns {string}
 * @throws {Error} on an invalid current version, unknown kind or invalid pre-release id
 */
export function nextVersion(current, kind, preid = "rc") {
  const v = parseVersion(current);
  if (!v) throw new Error(`invalid version ${current}`);
  if (!BUMP_KINDS.includes(kind)) throw new Error(`unknown bump kind ${kind}`);
  const { major, minor, patch, pre } = v;
  const pre0 = { id: preid, n: 0 };
  let next;
  switch (kind) {
    case "patch":
      next = pre ? { major, minor, patch, pre: null } : { major, minor, patch: patch + 1, pre: null };
      break;
    case "minor":
      next = pre && patch === 0 ? { major, minor, patch, pre: null } : { major, minor: minor + 1, patch: 0, pre: null };
      break;
    case "major":
      next = pre && minor === 0 && patch === 0 ? { major, minor, patch, pre: null } : { major: major + 1, minor: 0, patch: 0, pre: null };
      break;
    case "prepatch":
      next = { major, minor, patch: patch + 1, pre: pre0 };
      break;
    case "preminor":
      next = { major, minor: minor + 1, patch: 0, pre: pre0 };
      break;
    case "premajor":
      next = { major: major + 1, minor: 0, patch: 0, pre: pre0 };
      break;
    default: // prerelease
      if (!pre) next = { major, minor, patch: patch + 1, pre: pre0 };
      else if (pre.id === preid) next = { major, minor, patch, pre: { id: preid, n: pre.n + 1 } };
      else next = { major, minor, patch, pre: pre0 };
  }
  const text = formatVersion(next);
  if (!parseVersion(text)) throw new Error(`invalid pre-release id ${preid}`);
  return text;
}

const SECTION_HEADING = /^## \[([^\]]+)\](?:\s+-\s+(\S+))?\s*$/;
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S/;

/**
 * Splits a Keep a Changelog file (data-model "Changelog section").
 *
 * @param {string} text
 * @returns {{head: string, unreleased: {body: string}, sections: {version: string, date: string | null, heading: string, body: string}[], links: string[]}}
 *   `head` is everything before `## [Unreleased]`; each `body` is the raw text
 *   under its heading; `links` are the trailing link definition lines.
 * @throws {Error} `malformed changelog` without `# Changelog` or `## [Unreleased]`
 */
export function parseChangelog(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  if (!lines.some((l) => /^# Changelog\s*$/.test(l))) throw new Error("malformed changelog: no # Changelog heading");
  const start = lines.findIndex((l) => /^## \[Unreleased\]\s*$/.test(l));
  if (start === -1) throw new Error("malformed changelog: no ## [Unreleased] section");
  // Trailing link definitions (and blank lines between them).
  let end = lines.length;
  while (end > start + 1 && (lines[end - 1].trim() === "" || LINK_DEFINITION.test(lines[end - 1]))) end--;
  const links = lines.slice(end).filter((l) => LINK_DEFINITION.test(l));
  const blocks = [];
  for (let i = start; i < end; i++) {
    const m = SECTION_HEADING.exec(lines[i]);
    if (m) blocks.push({ version: m[1], date: m[2] ?? null, heading: lines[i], lines: [] });
    else blocks[blocks.length - 1].lines.push(lines[i]);
  }
  const [unreleased, ...rest] = blocks;
  return {
    head: lines.slice(0, start).join("\n"),
    unreleased: { body: unreleased.lines.join("\n") },
    sections: rest.map((b) => ({ version: b.version, date: b.date, heading: b.heading, body: b.lines.join("\n") })),
    links,
  };
}

/**
 * Whether a changelog section body has at least one entry (a line starting `- `).
 *
 * @param {string} body
 * @returns {boolean}
 */
export function hasEntries(body) {
  return String(body)
    .split(/\r?\n/)
    .some((l) => l.startsWith("- "));
}

/**
 * The repository web URL from `package.json` `repository`, without `git+` and `.git`.
 *
 * @param {{repository?: string | {url?: string}}} pkg
 * @returns {string}
 * @throws {Error} when `package.json` has no repository URL
 */
export function repoUrlFrom(pkg) {
  const url = typeof pkg?.repository === "string" ? pkg.repository : pkg?.repository?.url;
  if (typeof url !== "string" || url === "") throw new Error("package.json has no repository.url");
  return url.replace(/^git\+/, "").replace(/\.git$/, "").replace(/\/$/, "");
}

/**
 * Moves the Unreleased entries under a new dated version section and rewrites
 * the link definitions (FR-006, data-model "Changelog section").
 *
 * @param {string} text the current changelog
 * @param {{version: string, date: string, repoUrl: string}} release
 * @returns {string} the new changelog
 */
export function releaseChangelog(text, { version, date, repoUrl }) {
  const log = parseChangelog(text);
  const versions = [version, ...log.sections.map((s) => s.version)];
  const own = new Set(["unreleased", ...versions.map((v) => v.toLowerCase())]);
  const otherLinks = log.links.filter((l) => !own.has(/^\[([^\]]+)\]/.exec(l)[1].toLowerCase()));
  const links = [
    `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD`,
    ...versions.map((v, i) =>
      i < versions.length - 1 ? `[${v}]: ${repoUrl}/compare/v${versions[i + 1]}...v${v}` : `[${v}]: ${repoUrl}/releases/tag/v${v}`,
    ),
    ...otherLinks,
  ];
  const parts = [
    log.head.trimEnd(),
    "## [Unreleased]",
    `## [${version}] - ${date}\n\n${log.unreleased.body.trim()}`,
    ...log.sections.map((s) => `${s.heading}\n\n${s.body.trim()}`.trimEnd()),
    links.join("\n"),
  ];
  return `${parts.join("\n\n")}\n`;
}

/**
 * The release notes of one version: its section body, trimmed (FR-015).
 *
 * @param {string} text the changelog
 * @param {string} version
 * @returns {string}
 * @throws {Error} when the changelog has no section for `version`
 */
export function sectionNotes(text, version) {
  const section = parseChangelog(text).sections.find((s) => s.version === version);
  if (!section) throw new Error(`no changelog section for ${version}`);
  return section.body.trim();
}

/**
 * Checks that a tag, `package.json` and the newest changelog section name the
 * same, non-empty release (FR-010) and derives the dist-tag (FR-016).
 *
 * @param {{tag: string, pkg: {version?: string}, changelog: string}} input
 * @returns {{version: string, tag: string, prerelease: boolean, distTag: "latest" | "next"}}
 * @throws {Error} naming the failed check
 */
export function verifyRelease({ tag, pkg, changelog }) {
  const m = /^v(.*)$/.exec(String(tag));
  if (!m || !parseVersion(m[1])) throw new Error(`invalid tag ${tag}`);
  const version = m[1];
  if (pkg?.version !== version) throw new Error(`tag ${tag} does not match package.json version ${pkg?.version}`);
  const newest = parseChangelog(changelog).sections[0];
  if (!newest || newest.version !== version) throw new Error(`newest changelog section is ${newest ? newest.version : "missing"}, not ${version}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newest.date ?? "") || Number.isNaN(Date.parse(`${newest.date}T00:00:00Z`))) {
    throw new Error(`changelog section ${version} has no valid date`);
  }
  if (!hasEntries(newest.body)) throw new Error(`changelog section ${version} has no entries`);
  const prerelease = version.includes("-");
  return { version, tag, prerelease, distTag: prerelease ? "next" : "latest" };
}

/**
 * Decides whether a push to `main` is a release commit (research R10).
 *
 * @param {{version: string, headRef: string, tagExists: boolean, changelog: string}} input
 * @returns {{release: true} | {release: false, reason: string}}
 */
export function releaseCommitDecision({ version, headRef, tagExists, changelog }) {
  if (headRef !== "release/next") return { release: false, reason: "not merged from release/next" };
  if (tagExists) return { release: false, reason: `tag v${version} already exists` };
  let sections;
  try {
    sections = parseChangelog(changelog).sections;
  } catch (error) {
    return { release: false, reason: error.message };
  }
  if (!sections.some((s) => s.version === version)) return { release: false, reason: `no changelog section for ${version}` };
  return { release: true };
}

/** Reads and parses `package.json` and reads `CHANGELOG.md`. */
function readReleaseFiles(io) {
  const pkgText = io.readFile("package.json");
  let pkg;
  try {
    pkg = JSON.parse(pkgText);
  } catch (error) {
    throw new Error(`package.json is not valid JSON: ${error.message}`);
  }
  return { pkg, changelog: io.readFile("CHANGELOG.md") };
}

/** Runs a check; an error becomes `<command>: <message>` on stderr and exit 1. */
function guarded(command, io, fn) {
  try {
    return fn();
  } catch (error) {
    io.stderr(`${command}: ${error.message}\n`);
    return 1;
  }
}

/** `bump <kind> [--preid <id>] | bump --version <X.Y.Z>` (FR-005, FR-006, FR-008). */
function bump(args, options, io) {
  const hasKind = args.length > 0;
  const hasVersion = options.version !== undefined;
  if (args.length > 1 || hasKind === hasVersion || (hasVersion && options.preid !== undefined)) {
    io.stderr(`bump needs exactly one of <kind> and --version (--preid only with <kind>)\n${USAGE}`);
    return 2;
  }
  return guarded("bump", io, () => {
    const { pkg, changelog } = readReleaseFiles(io);
    const log = parseChangelog(changelog);
    let version;
    if (hasVersion) {
      if (!parseVersion(options.version)) throw new Error(`invalid version ${options.version}`);
      version = options.version;
    } else {
      version = nextVersion(pkg.version, args[0], options.preid ?? "rc");
    }
    if (!hasEntries(log.unreleased.body)) throw new Error("the Unreleased section of CHANGELOG.md has no entries");
    if (log.sections.some((s) => s.version === version)) throw new Error(`CHANGELOG.md already has a section for ${version}`);
    const date = io.now().toISOString().slice(0, 10);
    const newChangelog = releaseChangelog(changelog, { version, date, repoUrl: repoUrlFrom(pkg) });
    io.writeFile("package.json", `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
    io.writeFile("CHANGELOG.md", newChangelog);
    io.stdout(`${version}\n`);
    return 0;
  });
}

/** `verify --tag <vX.Y.Z>`: prints `key=value` lines for `$GITHUB_OUTPUT` (FR-010, FR-016). */
function verify(args, options, io) {
  if (args.length || options.tag === undefined) {
    io.stderr(`verify needs --tag <vX.Y.Z>\n${USAGE}`);
    return 2;
  }
  return guarded("verify", io, () => {
    const { pkg, changelog } = readReleaseFiles(io);
    const r = verifyRelease({ tag: options.tag, pkg, changelog });
    io.stdout(`version=${r.version}\ntag=${r.tag}\nprerelease=${r.prerelease}\ndist-tag=${r.distTag}\n`);
    return 0;
  });
}

/** `notes --version <X.Y.Z>`: prints that version's changelog section (FR-015). */
function notes(args, options, io) {
  if (args.length || options.version === undefined) {
    io.stderr(`notes needs --version <X.Y.Z>\n${USAGE}`);
    return 2;
  }
  return guarded("notes", io, () => {
    io.stdout(`${sectionNotes(io.readFile("CHANGELOG.md"), options.version)}\n`);
    return 0;
  });
}

/** `release-commit --version <X.Y.Z> --head-ref <ref> --tag-exists <true|false>`: always exit 0 on valid usage. */
function releaseCommit(args, options, io) {
  const tagExists = options["tag-exists"];
  if (args.length || options.version === undefined || options["head-ref"] === undefined || !["true", "false"].includes(tagExists)) {
    io.stderr(`release-commit needs --version <X.Y.Z> --head-ref <ref> --tag-exists <true|false>\n${USAGE}`);
    return 2;
  }
  let changelog;
  try {
    changelog = io.readFile("CHANGELOG.md");
  } catch {
    changelog = "";
  }
  const decision = releaseCommitDecision({
    version: options.version,
    headRef: options["head-ref"],
    tagExists: tagExists === "true",
    changelog,
  });
  io.stdout(decision.release ? "release=true\n" : `release=false\nreason=${decision.reason}\n`);
  return 0;
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

/** The commands, by name: `(positionals, options, io) => exit code`. */
const COMMANDS = {
  bump,
  verify,
  notes,
  "release-commit": releaseCommit,
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
