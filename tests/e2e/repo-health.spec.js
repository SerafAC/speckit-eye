// 003 US5 — Contribute to an open-source project with clear rules (spec 003,
// User Story 5). File checks only: the community files, the issue and pull
// request templates, the README badges, Dependabot, and the pinning and
// permissions rules of the GitHub Actions workflows (FR-014).
// The YAML files are read line by line: the checks need only top-level keys
// and a few values, which does not justify a YAML parser dependency (§I).

import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./helpers.js";

const GITHUB_DIR = path.join(REPO_ROOT, ".github");
const WORKFLOWS_DIR = path.join(GITHUB_DIR, "workflows");
const ADVISORY_URL = "https://github.com/SerafAC/speckit-eye/security/advisories/new";

/** @param {...string} parts path relative to the repository root */
const read = (...parts) => readFile(path.join(REPO_ROOT, ...parts), "utf8");

/**
 * The value of a top-level `key: value` line of a YAML file, or undefined.
 * @param {string} yaml
 * @param {string} key
 */
function topLevel(yaml, key) {
  const match = yaml.match(new RegExp(`^${key}:(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

/**
 * The `id:` values of an issue form's `body` items, in order.
 * @param {string} yaml
 */
function formIds(yaml) {
  return [...yaml.matchAll(/^\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
}

test("003 US5 FR-028 contribution guidelines, code of conduct and security policy exist and are linked from README", async () => {
  const readme = await read("README.md");
  for (const file of ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md"]) {
    expect((await read(file)).length, file).toBeGreaterThan(0);
    expect(readme, `README links ${file}`).toContain(`](${file})`);
  }

  const contributing = await read("CONTRIBUTING.md");
  expect(contributing).toContain("DEVELOPMENT.md");
  expect(contributing).toContain(".specify/memory/constitution.md");
  expect(contributing).toContain("docs/releasing.md");

  expect(await read("CODE_OF_CONDUCT.md")).toContain("Contributor Covenant");

  const security = await read("SECURITY.md");
  expect(security).toContain(ADVISORY_URL);
  expect(security).toMatch(/Supported versions/i);
  expect(security).toContain("1.x");
});

test("003 US5 FR-029 issue templates for bugs and features and a PR template with the quality gates exist", async () => {
  const templates = path.join(".github", "ISSUE_TEMPLATE");

  const bug = await read(templates, "bug_report.yml");
  expect(topLevel(bug, "name")).toBe("Bug report");
  expect(topLevel(bug, "body")).toBe("");
  expect(formIds(bug)).toEqual(["version", "node", "os", "command", "actual", "expected", "excerpt"]);

  const feature = await read(templates, "feature_request.yml");
  expect(topLevel(feature, "name")).toBe("Feature request");
  expect(topLevel(feature, "body")).toBe("");
  expect(formIds(feature)).toEqual(["problem", "solution", "alternatives"]);

  const config = await read(templates, "config.yml");
  expect(topLevel(config, "blank_issues_enabled")).toBe("false");
  expect(config).toContain(`url: ${ADVISORY_URL}`);
  expect(config).toContain("url: https://serafac.github.io/speckit-eye/");

  const pr = await read(".github", "pull_request_template.md");
  expect(pr).toContain("CHANGELOG.md");
  expect(pr).toContain("pnpm test");
  expect(pr).toMatch(/E2E tests/);
  expect(pr.match(/^- \[ \] /gm)).toHaveLength(5);
});

test("003 US5 FR-030 README shows CI, npm and license badges", async () => {
  const readme = await read("README.md");
  const badges = readme.split("\n").slice(0, 6).join("\n");
  expect(badges).toContain(
    "[![CI](https://github.com/SerafAC/speckit-eye/actions/workflows/ci.yml/badge.svg)](https://github.com/SerafAC/speckit-eye/actions/workflows/ci.yml)",
  );
  expect(badges).toContain("(https://img.shields.io/npm/v/speckit-eye)](https://www.npmjs.com/package/speckit-eye)");
  expect(badges).toContain("(https://img.shields.io/npm/l/speckit-eye)](LICENSE)");
});

test("003 US5 FR-031 Dependabot watches npm and GitHub Actions", async () => {
  const yaml = await read(".github", "dependabot.yml");
  expect(topLevel(yaml, "version")).toBe("2");
  const entries = yaml.split(/^\s+- package-ecosystem:/m).slice(1);
  const ecosystems = entries.map((entry) => entry.split("\n")[0].trim());
  expect(ecosystems.sort()).toEqual(["github-actions", "npm"]);
  for (const entry of entries) {
    expect(entry).toMatch(/^\s+directory: \/\s*$/m);
    expect(entry).toMatch(/^\s+interval: weekly\s*$/m);
    expect(entry).toMatch(/^\s+- minor\s*$/m);
    expect(entry).toMatch(/^\s+- patch\s*$/m);
  }
});

test("003 US5 FR-014 every third-party action in .github/workflows is pinned to a commit SHA and every workflow sets top-level permissions", async () => {
  const files = (await readdir(WORKFLOWS_DIR)).filter((f) => /\.ya?ml$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  let uses = 0;
  for (const file of files) {
    const yaml = await readFile(path.join(WORKFLOWS_DIR, file), "utf8");
    expect(topLevel(yaml, "permissions"), `${file} sets top-level permissions`).toBeDefined();
    for (const [, ref] of yaml.matchAll(/^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)/gm)) {
      uses += 1;
      const allowed = ref.startsWith("./") || /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ref);
      expect(allowed, `${file}: ${ref} is a local path or pinned to a 40-hex commit SHA`).toBe(true);
    }
  }
  expect(uses).toBeGreaterThan(0);
});
