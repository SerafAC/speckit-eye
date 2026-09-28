import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  main,
  parseVersion,
  formatVersion,
  checkPackFiles,
  parsePackFileList,
  nextVersion,
  parseChangelog,
  hasEntries,
  releaseChangelog,
  sectionNotes,
  repoUrlFrom,
  verifyRelease,
  releaseCommitDecision,
  USAGE,
} from "../../scripts/release/release.js";

/** Fake I/O: in-memory files, captured output, fixed clock. */
function fakeIo(files = {}) {
  const io = {
    files: { ...files },
    out: "",
    err: "",
    readFile: (p) => {
      if (!Object.hasOwn(io.files, p)) throw new Error(`ENOENT: ${p}`);
      return io.files[p];
    },
    writeFile: (p, s) => {
      io.files[p] = s;
    },
    stdout: (s) => {
      io.out += s;
    },
    stderr: (s) => {
      io.err += s;
    },
    now: () => new Date("2026-09-28T12:00:00Z"),
  };
  return io;
}

describe("main dispatch", () => {
  test("no command prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main([], io), 2);
    assert.equal(io.err, USAGE);
    assert.equal(io.out, "");
  });

  test("an unknown command prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main(["publish"], io), 2);
    assert.match(io.err, /Unknown command: publish/);
    assert.ok(io.err.includes(USAGE));
  });

  test("an unknown option prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main(["verify", "--bogus", "x"], io), 2);
    assert.match(io.err, /bogus/);
    assert.ok(io.err.includes(USAGE));
  });

  test("an option without its value prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main(["verify", "--tag"], io), 2);
    assert.ok(io.err.includes(USAGE));
  });

  test("an inherited property name is not a command", () => {
    const io = fakeIo();
    assert.equal(main(["toString"], io), 2);
    assert.match(io.err, /Unknown command: toString/);
  });

  for (const command of ["bump", "verify", "notes", "release-commit"]) {
    test(`${command} without its options is a usage error (exit 2, nothing written)`, () => {
      const io = fakeIo({ "package.json": "{}\n" });
      assert.equal(main([command], io), 2);
      assert.ok(io.err.includes(USAGE));
      assert.deepEqual(io.files, { "package.json": "{}\n" });
    });
  }

  test("known options are accepted", () => {
    const io = fakeIo();
    const code = main(
      ["release-commit", "--version", "1.0.0", "--head-ref", "", "--tag-exists", "false"],
      io,
    );
    assert.notEqual(code, 2);
  });
});

describe("parseVersion", () => {
  test("parses MAJOR.MINOR.PATCH", () => {
    assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3, pre: null });
    assert.deepEqual(parseVersion("0.0.0"), { major: 0, minor: 0, patch: 0, pre: null });
    assert.deepEqual(parseVersion("10.20.30"), { major: 10, minor: 20, patch: 30, pre: null });
  });

  test("parses a -<id>.<n> pre-release", () => {
    assert.deepEqual(parseVersion("1.0.0-rc.1"), { major: 1, minor: 0, patch: 0, pre: { id: "rc", n: 1 } });
    assert.deepEqual(parseVersion("2.0.0-beta.0"), {
      major: 2,
      minor: 0,
      patch: 0,
      pre: { id: "beta", n: 0 },
    });
  });

  for (const text of [
    "1.0",
    "1",
    "01.0.0",
    "1.00.0",
    "1.0.01",
    "1.0.0+build",
    "1.0.0-rc.1+build",
    "1.0.0-rc",
    "1.0.0-rc.01",
    "1.0.0-rc.1.2",
    "1.0.0-1.0",
    "v1.0.0",
    " 1.0.0",
    "1.0.0 ",
    "",
    "1.0.0-",
  ]) {
    test(`rejects ${JSON.stringify(text)}`, () => {
      assert.equal(parseVersion(text), null);
    });
  }
});

describe("formatVersion", () => {
  test("formats a release version", () => {
    assert.equal(formatVersion({ major: 1, minor: 2, patch: 3, pre: null }), "1.2.3");
  });

  test("formats a pre-release", () => {
    assert.equal(formatVersion({ major: 1, minor: 3, patch: 0, pre: { id: "rc", n: 2 } }), "1.3.0-rc.2");
  });

  test("round-trips parseVersion", () => {
    for (const text of ["0.1.0", "1.0.0", "1.0.0-rc.0", "12.4.7-next.13"]) {
      assert.equal(formatVersion(parseVersion(text)), text);
    }
  });
});

/** Exactly the allowed files of a correct package (contracts/release-cli.md). */
const GOOD_PACK = [
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "bin/speckit-eye.js",
  "src/cli/main.js",
  "src/render/layout.js",
  "dist/styles.css",
  "dist/fonts/geist-latin-wght-normal.woff2",
  "dist/fonts/OFL-geist.txt",
];

describe("checkPackFiles", () => {
  test("the exact allowed set passes", () => {
    assert.deepEqual(checkPackFiles(GOOD_PACK), { unexpected: [], missing: [] });
  });

  for (const bad of [
    "tests/unit/release.test.js",
    "specs/003-npm-release-docs-site/spec.md",
    "src/styles/input.css",
    "src/styles/theme.js",
    "src/client/notes.md",
    "docs/x.md",
    ".github/workflows/ci.yml",
    "scripts/release/release.js",
    "dist/other.css",
    "dist/fonts/sub/x.woff2",
    "dist/fonts/readme.txt",
    "bin/other.js",
    "pnpm-lock.yaml",
  ]) {
    test(`rejects ${bad}`, () => {
      assert.deepEqual(checkPackFiles([...GOOD_PACK, bad]), { unexpected: [bad], missing: [] });
    });
  }

  test("reports a missing LICENSE", () => {
    assert.deepEqual(checkPackFiles(GOOD_PACK.filter((p) => p !== "LICENSE")), { unexpected: [], missing: ["LICENSE"] });
  });

  test("reports a package without any .woff2", () => {
    const { missing } = checkPackFiles(GOOD_PACK.filter((p) => !p.endsWith(".woff2")));
    assert.deepEqual(missing, ["dist/fonts/*.woff2"]);
  });

  test("reports a package without any src/ file", () => {
    const { missing } = checkPackFiles(GOOD_PACK.filter((p) => !p.startsWith("src/")));
    assert.deepEqual(missing, ["src/**/*.js"]);
  });

  test("reports every missing fixed file of an empty package", () => {
    assert.deepEqual(checkPackFiles([]).missing, [
      "package.json",
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
      "bin/speckit-eye.js",
      "dist/styles.css",
      "src/**/*.js",
      "dist/fonts/*.woff2",
    ]);
  });

  test("lists unexpected files sorted", () => {
    assert.deepEqual(checkPackFiles([...GOOD_PACK, "tests/b.js", "docs/a.md"]).unexpected, ["docs/a.md", "tests/b.js"]);
  });
});

describe("parsePackFileList", () => {
  const files = GOOD_PACK.map((path) => ({ path }));

  test("reads the npm pack --dry-run --json array form", () => {
    assert.deepEqual(parsePackFileList(JSON.stringify([{ id: "x@1.0.0", files }], null, 2)), GOOD_PACK);
  });

  test("reads the pnpm pack --json object form", () => {
    assert.deepEqual(parsePackFileList(JSON.stringify({ name: "x", files }, null, 2)), GOOD_PACK);
  });

  test("skips lifecycle script output printed before the JSON", () => {
    const text = `Copied 11 font files to dist/fonts/\n[warn] {not json\n${JSON.stringify({ files }, null, 2)}\n`;
    assert.deepEqual(parsePackFileList(text), GOOD_PACK);
  });

  for (const [label, text] of [
    ["empty text", ""],
    ["not JSON", "hello"],
    ["no files", JSON.stringify({ name: "x" })],
    ["empty array", "[]"],
    ["a path that is not a string", JSON.stringify({ files: [{ path: 1 }] })],
  ]) {
    test(`returns null for ${label}`, () => {
      assert.equal(parsePackFileList(text), null);
    });
  }
});

describe("pack-check command", () => {
  const files = GOOD_PACK.map((path) => ({ path }));

  test("exits 0 for a correct npm file list", () => {
    const io = fakeIo({ "files.json": JSON.stringify([{ files }]) });
    assert.equal(main(["pack-check", "files.json"], io), 0);
    assert.equal(io.err, "");
  });

  test("exits 0 for a correct pnpm file list", () => {
    const io = fakeIo({ "files.json": JSON.stringify({ files }) });
    assert.equal(main(["pack-check", "files.json"], io), 0);
  });

  test("exits 1 and names every unexpected and missing file", () => {
    const bad = [...GOOD_PACK.filter((p) => p !== "LICENSE"), "tests/x.test.js", ".github/workflows/ci.yml"];
    const io = fakeIo({ "files.json": JSON.stringify({ files: bad.map((path) => ({ path })) }) });
    assert.equal(main(["pack-check", "files.json"], io), 1);
    assert.match(io.err, /unexpected file in package: tests\/x\.test\.js/);
    assert.match(io.err, /unexpected file in package: \.github\/workflows\/ci\.yml/);
    assert.match(io.err, /missing from package: LICENSE/);
  });

  test("exits 1 when the file cannot be read", () => {
    const io = fakeIo();
    assert.equal(main(["pack-check", "nope.json"], io), 1);
    assert.match(io.err, /cannot read nope\.json/);
  });

  test("exits 1 when the file is not a pack file list", () => {
    const io = fakeIo({ "files.json": "{}" });
    assert.equal(main(["pack-check", "files.json"], io), 1);
    assert.match(io.err, /not the JSON/);
  });

  test("exits 2 without a file argument", () => {
    const io = fakeIo();
    assert.equal(main(["pack-check"], io), 2);
    assert.ok(io.err.includes(USAGE));
  });

  test("writes nothing", () => {
    const io = fakeIo({ "files.json": JSON.stringify({ files }) });
    main(["pack-check", "files.json"], io);
    assert.deepEqual(Object.keys(io.files), ["files.json"]);
  });
});

describe("nextVersion", () => {
  // data-model "Next version": [kind, from 1.2.3, from 1.3.0-rc.1]
  for (const [kind, fromStable, fromPre] of [
    ["patch", "1.2.4", "1.3.0"],
    ["minor", "1.3.0", "1.3.0"],
    ["major", "2.0.0", "2.0.0"],
    ["prepatch", "1.2.4-rc.0", "1.3.1-rc.0"],
    ["preminor", "1.3.0-rc.0", "1.4.0-rc.0"],
    ["premajor", "2.0.0-rc.0", "2.0.0-rc.0"],
    ["prerelease", "1.2.4-rc.0", "1.3.0-rc.2"],
  ]) {
    test(`${kind}: 1.2.3 -> ${fromStable}`, () => {
      assert.equal(nextVersion("1.2.3", kind), fromStable);
    });
    test(`${kind}: 1.3.0-rc.1 -> ${fromPre}`, () => {
      assert.equal(nextVersion("1.3.0-rc.1", kind), fromPre);
    });
  }

  test("prerelease with a different id starts at 0", () => {
    assert.equal(nextVersion("1.0.0-beta.2", "prerelease", "rc"), "1.0.0-rc.0");
  });

  test("minor from a patch pre-release does not finish it", () => {
    assert.equal(nextVersion("1.3.1-rc.0", "minor"), "1.4.0");
  });

  test("major from a minor pre-release does not finish it", () => {
    assert.equal(nextVersion("1.4.0-rc.0", "major"), "2.0.0");
  });

  test("uses the given pre-release id", () => {
    assert.equal(nextVersion("1.2.3", "preminor", "beta"), "1.3.0-beta.0");
  });

  test("throws on an unknown kind", () => {
    assert.throws(() => nextVersion("1.2.3", "micro"), /unknown bump kind micro/);
  });

  test("throws on an invalid current version", () => {
    assert.throws(() => nextVersion("1.2", "patch"), /invalid version/);
  });

  test("throws on an invalid pre-release id", () => {
    assert.throws(() => nextVersion("1.2.3", "prepatch", "1x"), /invalid pre-release id/);
  });
});

const REPO = "https://github.com/SerafAC/speckit-eye";

/** The head of the real CHANGELOG.md with an Unreleased section, before the first release. */
const FIRST = `# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Serve mode.
- Static build mode.

### Changed

- Colors.

[Unreleased]: ${REPO}/commits/main
`;

describe("parseChangelog", () => {
  test("splits head, Unreleased, sections and links", () => {
    const log = parseChangelog(FIRST);
    assert.match(log.head, /^# Changelog\n/);
    assert.ok(!log.head.includes("## [Unreleased]"));
    assert.match(log.unreleased.body, /### Added\n\n- Serve mode\.\n- Static build mode\.\n\n### Changed\n\n- Colors\./);
    assert.ok(!log.unreleased.body.includes("[Unreleased]:"));
    assert.deepEqual(log.sections, []);
    assert.deepEqual(log.links, [`[Unreleased]: ${REPO}/commits/main`]);
  });

  test("reads released sections with their dates", () => {
    const text = releaseChangelog(FIRST, { version: "1.0.0", date: "2026-09-28", repoUrl: REPO });
    const log = parseChangelog(text);
    assert.equal(log.unreleased.body.trim(), "");
    assert.equal(log.sections.length, 1);
    assert.equal(log.sections[0].version, "1.0.0");
    assert.equal(log.sections[0].date, "2026-09-28");
  });

  test("throws without # Changelog", () => {
    assert.throws(() => parseChangelog("## [Unreleased]\n- x\n"), /malformed changelog/);
  });

  test("throws without ## [Unreleased]", () => {
    assert.throws(() => parseChangelog("# Changelog\n\n## [1.0.0] - 2026-01-01\n- x\n"), /malformed changelog/);
  });
});

describe("hasEntries", () => {
  test("true with a - line", () => assert.equal(hasEntries("### Added\n\n- x\n"), true));
  test("false with only sub-headings", () => assert.equal(hasEntries("\n### Added\n\n"), false));
  test("false when empty", () => assert.equal(hasEntries(""), false));
  test("an indented continuation line is not an entry", () => assert.equal(hasEntries("  - nested\n"), false));
});

describe("repoUrlFrom", () => {
  test("strips git+ and .git", () => {
    assert.equal(repoUrlFrom({ repository: { type: "git", url: `git+${REPO}.git` } }), REPO);
  });
  test("accepts a plain URL string", () => {
    assert.equal(repoUrlFrom({ repository: REPO }), REPO);
  });
  test("throws without a repository", () => {
    assert.throws(() => repoUrlFrom({}), /no repository\.url/);
  });
});

describe("releaseChangelog", () => {
  test("first release: entries move under the dated version, links rewritten", () => {
    const text = releaseChangelog(FIRST, { version: "1.0.0", date: "2026-09-28", repoUrl: REPO });
    assert.ok(text.startsWith("# Changelog\n\nAll notable changes"));
    assert.match(
      text,
      /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-09-28\n\n### Added\n\n- Serve mode\.\n- Static build mode\.\n\n### Changed\n\n- Colors\.\n\n\[Unreleased\]/,
    );
    assert.ok(
      text.endsWith(`[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`),
      text,
    );
    assert.ok(!text.includes("commits/main"));
  });

  test("second release: older section kept, compare links per version", () => {
    const first = releaseChangelog(FIRST, { version: "1.0.0", date: "2026-09-28", repoUrl: REPO });
    const withEntry = first.replace("## [Unreleased]\n", "## [Unreleased]\n\n### Fixed\n\n- A bug.\n");
    const second = releaseChangelog(withEntry, { version: "1.0.1", date: "2026-10-01", repoUrl: REPO });
    assert.match(second, /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-01\n\n### Fixed\n\n- A bug\.\n\n## \[1\.0\.0\] - 2026-09-28\n\n### Added/);
    assert.ok(
      second.endsWith(
        `[Unreleased]: ${REPO}/compare/v1.0.1...HEAD\n` +
          `[1.0.1]: ${REPO}/compare/v1.0.0...v1.0.1\n` +
          `[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`,
      ),
      second,
    );
    assert.equal(sectionNotes(second, "1.0.0"), sectionNotes(first, "1.0.0"));
  });

  test("keeps unrelated link definitions", () => {
    const text = releaseChangelog(FIRST.replace("[Unreleased]:", "[docs]: https://example.com\n[Unreleased]:"), {
      version: "1.0.0",
      date: "2026-09-28",
      repoUrl: REPO,
    });
    assert.ok(text.includes("[docs]: https://example.com\n"));
    assert.equal(text.match(/^\[Unreleased\]:/gm).length, 1);
  });

  test("an empty Unreleased gives an empty version section", () => {
    const empty = FIRST.replace(/## \[Unreleased\][\s\S]*?\n\[Unreleased\]/, "## [Unreleased]\n\n[Unreleased]");
    const text = releaseChangelog(empty, { version: "1.0.0", date: "2026-09-28", repoUrl: REPO });
    assert.equal(hasEntries(parseChangelog(text).sections[0].body), false);
  });
});

/**
 * Inline copy of the real CHANGELOG.md's shape before the first release: its
 * head, its first entries (wrapped over several lines, with inline code), its
 * sub-headings and the trailing link line. Kept inline so the test never reads
 * the real file (§IV) and keeps passing after real releases.
 */
const REAL_SHAPE = `# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Serve mode: \`speckit-eye --serve <dir>\` serves the dashboard of a Spec Kit
  project on your own machine (\`127.0.0.1\`), with the overview, a page per
  feature and a page per document.
- Live updates in serve mode: open pages follow file changes within
  about 2 seconds, keep scroll position and expanded items, highlight what
  changed, and show a banner while the connection to the tool is lost.

### Changed

- Redesigned every page: a dark sidebar replaces the header, a stats card,
  Up next bar and task map replace the progress bar, counters and task grid,
  and documents open in a reader layout.

### Removed

- The feature's list of documents inside the overview tree: the feature page
  tabs and the reader's document list replace it.

[Unreleased]: ${REPO}/commits/main
`;

describe("the real CHANGELOG.md shape (T020)", () => {
  test("parses: no released sections, the commits/main link line", () => {
    const log = parseChangelog(REAL_SHAPE);
    assert.deepEqual(log.sections, []);
    assert.deepEqual(log.links, [`[Unreleased]: ${REPO}/commits/main`]);
    assert.equal(hasEntries(log.unreleased.body), true);
    assert.ok(!log.unreleased.body.includes("[Unreleased]:"));
  });

  test("first release 1.0.0: wrapped entries and sub-headings move intact, links rewritten", () => {
    const before = parseChangelog(REAL_SHAPE);
    const text = releaseChangelog(REAL_SHAPE, { version: "1.0.0", date: "2026-09-28", repoUrl: REPO });
    const after = parseChangelog(text);
    assert.equal(after.head, before.head);
    assert.equal(after.unreleased.body.trim(), "");
    assert.equal(after.sections.length, 1);
    assert.equal(after.sections[0].heading, "## [1.0.0] - 2026-09-28");
    assert.equal(after.sections[0].body.trim(), before.unreleased.body.trim());
    assert.equal(sectionNotes(text, "1.0.0"), before.unreleased.body.trim());
    assert.deepEqual(after.links, [`[Unreleased]: ${REPO}/compare/v1.0.0...HEAD`, `[1.0.0]: ${REPO}/releases/tag/v1.0.0`]);
    assert.ok(!text.includes("commits/main"));
    assert.ok(text.endsWith(`[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`));
  });
});

describe("sectionNotes", () => {
  const released = releaseChangelog(FIRST, { version: "1.0.0", date: "2026-09-28", repoUrl: REPO });

  test("returns the trimmed body of the section", () => {
    assert.equal(sectionNotes(released, "1.0.0"), "### Added\n\n- Serve mode.\n- Static build mode.\n\n### Changed\n\n- Colors.");
  });

  test("throws for a missing version", () => {
    assert.throws(() => sectionNotes(released, "2.0.0"), /no changelog section for 2\.0\.0/);
  });
});

/** A changelog released at `version`. */
function releasedAt(version, date = "2026-09-28") {
  return releaseChangelog(FIRST, { version, date, repoUrl: REPO });
}

describe("verifyRelease", () => {
  test("a matching stable release gets the latest dist-tag", () => {
    assert.deepEqual(verifyRelease({ tag: "v1.0.0", pkg: { version: "1.0.0" }, changelog: releasedAt("1.0.0") }), {
      version: "1.0.0",
      tag: "v1.0.0",
      prerelease: false,
      distTag: "latest",
    });
  });

  test("a pre-release gets the next dist-tag", () => {
    assert.deepEqual(verifyRelease({ tag: "v1.1.0-rc.0", pkg: { version: "1.1.0-rc.0" }, changelog: releasedAt("1.1.0-rc.0") }), {
      version: "1.1.0-rc.0",
      tag: "v1.1.0-rc.0",
      prerelease: true,
      distTag: "next",
    });
  });

  for (const tag of ["1.0.0", "v1.0", "vx", "v1.0.0+b", ""]) {
    test(`rejects the tag ${JSON.stringify(tag)}`, () => {
      assert.throws(() => verifyRelease({ tag, pkg: { version: "1.0.0" }, changelog: releasedAt("1.0.0") }), /invalid tag/);
    });
  }

  test("rejects a tag that does not match package.json", () => {
    assert.throws(
      () => verifyRelease({ tag: "v1.2.0", pkg: { version: "1.1.0" }, changelog: releasedAt("1.1.0") }),
      { message: "tag v1.2.0 does not match package.json version 1.1.0" },
    );
  });

  test("rejects when the newest changelog section is another version", () => {
    assert.throws(
      () => verifyRelease({ tag: "v1.2.0", pkg: { version: "1.2.0" }, changelog: releasedAt("1.1.0") }),
      { message: "newest changelog section is 1.1.0, not 1.2.0" },
    );
  });

  test("rejects when there is no released section", () => {
    assert.throws(() => verifyRelease({ tag: "v1.0.0", pkg: { version: "1.0.0" }, changelog: FIRST }), /newest changelog section is missing, not 1\.0\.0/);
  });

  test("rejects an empty newest section", () => {
    const changelog = `${FIRST.replace("## [Unreleased]", "## [Unreleased]\n\n## [1.2.0] - 2026-09-28\n\n### Added\n\n## [1.1.0] - 2026-09-01")}`;
    assert.throws(() => verifyRelease({ tag: "v1.2.0", pkg: { version: "1.2.0" }, changelog }), {
      message: "changelog section 1.2.0 has no entries",
    });
  });

  test("rejects a section without a valid date", () => {
    const changelog = releasedAt("1.0.0").replace("## [1.0.0] - 2026-09-28", "## [1.0.0] - soon");
    assert.throws(() => verifyRelease({ tag: "v1.0.0", pkg: { version: "1.0.0" }, changelog }), /no valid date/);
  });
});

describe("releaseCommitDecision", () => {
  const changelog = releasedAt("1.0.0");

  test("a merge from release/next with a new tag and a section releases", () => {
    assert.deepEqual(releaseCommitDecision({ version: "1.0.0", headRef: "release/next", tagExists: false, changelog }), { release: true });
  });

  test("not merged from release/next", () => {
    for (const headRef of ["", "main", "feature/x"]) {
      assert.deepEqual(releaseCommitDecision({ version: "1.0.0", headRef, tagExists: false, changelog }), {
        release: false,
        reason: "not merged from release/next",
      });
    }
  });

  test("the tag already exists", () => {
    assert.deepEqual(releaseCommitDecision({ version: "1.0.0", headRef: "release/next", tagExists: true, changelog }), {
      release: false,
      reason: "tag v1.0.0 already exists",
    });
  });

  test("no changelog section for the version", () => {
    assert.deepEqual(releaseCommitDecision({ version: "1.0.1", headRef: "release/next", tagExists: false, changelog }), {
      release: false,
      reason: "no changelog section for 1.0.1",
    });
  });
});

const PKG = `${JSON.stringify(
  { name: "speckit-eye", version: "1.0.0", description: "d", repository: { type: "git", url: `git+${REPO}.git` }, license: "MIT" },
  null,
  2,
)}\n`;

describe("bump command", () => {
  test("first release --version 1.0.0 writes both files and prints the version", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    assert.equal(main(["bump", "--version", "1.0.0"], io), 0, io.err);
    assert.equal(io.out, "1.0.0\n");
    assert.equal(io.files["package.json"], PKG);
    assert.equal(io.files["CHANGELOG.md"], releasedAt("1.0.0", "2026-09-28"));
  });

  test("a kind bump changes only the version, keeping key order", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    assert.equal(main(["bump", "minor"], io), 0, io.err);
    assert.equal(io.out, "1.1.0\n");
    assert.equal(io.files["package.json"], PKG.replace('"version": "1.0.0"', '"version": "1.1.0"'));
    assert.match(io.files["CHANGELOG.md"], /## \[1\.1\.0\] - 2026-09-28/);
  });

  test("--preid sets the pre-release id", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    assert.equal(main(["bump", "premajor", "--preid", "beta"], io), 0, io.err);
    assert.equal(io.out, "2.0.0-beta.0\n");
  });

  test("uses the UTC date", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    io.now = () => new Date("2026-09-28T23:30:00-05:00");
    assert.equal(main(["bump", "patch"], io), 0, io.err);
    assert.match(io.files["CHANGELOG.md"], /## \[1\.0\.1\] - 2026-09-29/);
  });

  test("an empty Unreleased section writes nothing", () => {
    const released = releasedAt("1.0.0");
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": released });
    assert.equal(main(["bump", "patch"], io), 1);
    assert.match(io.err, /Unreleased section of CHANGELOG\.md has no entries/);
    assert.equal(io.out, "");
    assert.deepEqual(io.files, { "package.json": PKG, "CHANGELOG.md": released });
  });

  test("a version that already has a section is refused", () => {
    const released = releasedAt("1.0.0").replace("## [Unreleased]\n", "## [Unreleased]\n\n- more\n");
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": released });
    assert.equal(main(["bump", "--version", "1.0.0"], io), 1);
    assert.match(io.err, /already has a section for 1\.0\.0/);
    assert.deepEqual(io.files, { "package.json": PKG, "CHANGELOG.md": released });
  });

  test("an invalid explicit version is refused", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    assert.equal(main(["bump", "--version", "1.0"], io), 1);
    assert.match(io.err, /invalid version 1\.0/);
    assert.equal(io.files["CHANGELOG.md"], FIRST);
  });

  test("an unknown kind is refused", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    assert.equal(main(["bump", "micro"], io), 1);
    assert.match(io.err, /unknown bump kind micro/);
    assert.equal(io.files["package.json"], PKG);
  });

  test("a malformed changelog is refused", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": "# Notes\n- x\n" });
    assert.equal(main(["bump", "patch"], io), 1);
    assert.match(io.err, /malformed changelog/);
    assert.equal(io.files["package.json"], PKG);
  });

  test("both <kind> and --version are rejected", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    assert.equal(main(["bump", "patch", "--version", "1.0.1"], io), 2);
    assert.ok(io.err.includes(USAGE));
    assert.deepEqual(io.files, { "package.json": PKG, "CHANGELOG.md": FIRST });
  });

  test("--preid with --version is rejected", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": FIRST });
    assert.equal(main(["bump", "--version", "1.0.1", "--preid", "rc"], io), 2);
  });
});

describe("verify command", () => {
  test("prints key=value lines for a stable release", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": releasedAt("1.0.0") });
    assert.equal(main(["verify", "--tag", "v1.0.0"], io), 0, io.err);
    assert.equal(io.out, "version=1.0.0\ntag=v1.0.0\nprerelease=false\ndist-tag=latest\n");
  });

  test("prints dist-tag=next for a pre-release", () => {
    const pkg = PKG.replace('"1.0.0"', '"1.1.0-rc.0"');
    const io = fakeIo({ "package.json": pkg, "CHANGELOG.md": releasedAt("1.1.0-rc.0") });
    assert.equal(main(["verify", "--tag", "v1.1.0-rc.0"], io), 0, io.err);
    assert.equal(io.out, "version=1.1.0-rc.0\ntag=v1.1.0-rc.0\nprerelease=true\ndist-tag=next\n");
  });

  test("exits 1 and names the mismatch", () => {
    const io = fakeIo({ "package.json": PKG, "CHANGELOG.md": releasedAt("1.0.0") });
    assert.equal(main(["verify", "--tag", "v1.2.0"], io), 1);
    assert.equal(io.err, "verify: tag v1.2.0 does not match package.json version 1.0.0\n");
    assert.equal(io.out, "");
  });
});

describe("notes command", () => {
  test("prints the section body", () => {
    const io = fakeIo({ "CHANGELOG.md": releasedAt("1.0.0") });
    assert.equal(main(["notes", "--version", "1.0.0"], io), 0, io.err);
    assert.equal(io.out, `${sectionNotes(releasedAt("1.0.0"), "1.0.0")}\n`);
  });

  test("exits 1 for a missing section", () => {
    const io = fakeIo({ "CHANGELOG.md": releasedAt("1.0.0") });
    assert.equal(main(["notes", "--version", "9.9.9"], io), 1);
    assert.match(io.err, /no changelog section for 9\.9\.9/);
  });
});

describe("release-commit command", () => {
  const files = { "CHANGELOG.md": releasedAt("1.0.0") };

  test("prints release=true", () => {
    const io = fakeIo(files);
    assert.equal(main(["release-commit", "--version", "1.0.0", "--head-ref", "release/next", "--tag-exists", "false"], io), 0);
    assert.equal(io.out, "release=true\n");
  });

  test("prints release=false and the reason, exit 0", () => {
    const io = fakeIo(files);
    assert.equal(main(["release-commit", "--version", "1.0.0", "--head-ref", "", "--tag-exists", "false"], io), 0);
    assert.equal(io.out, "release=false\nreason=not merged from release/next\n");
  });

  test("a bad --tag-exists value is a usage error", () => {
    const io = fakeIo(files);
    assert.equal(main(["release-commit", "--version", "1.0.0", "--head-ref", "release/next", "--tag-exists", "yes"], io), 2);
  });
});
