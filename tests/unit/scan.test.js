import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scan, isSpecKitProject, MSG_W9, MSG_W10, MSG_W11 } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

const codes = (warnings) => warnings.map((w) => `${w.code} ${w.file}`);

describe("isSpecKitProject", () => {
  test("true when specs/ exists", async () => {
    assert.equal(await isSpecKitProject(createFakeReader({ "specs/001-x/spec.md": "" })), true);
  });
  test("true when .specify/ exists", async () => {
    assert.equal(await isSpecKitProject(createFakeReader({ ".specify/memory/constitution.md": "" })), true);
  });
  test("false otherwise", async () => {
    assert.equal(await isSpecKitProject(createFakeReader({ "README.md": "" })), false);
  });
});

describe("scan", () => {
  test("collects features in plain string order with every *.md recursively", async () => {
    const reader = createFakeReader({
      "specs/010-b/spec.md": "b",
      "specs/002-a/tasks.md": "tasks",
      "specs/002-a/spec.md": "spec",
      "specs/002-a/contracts/cli.md": "cli",
      "specs/002-a/contracts/deep/api.md": "api",
      "specs/002-a/diagram.png": "binary",
      "specs/B-upper/spec.md": "u",
      "specs/README.md": "not a feature",
    });
    const result = await scan(reader, "proj");
    assert.equal(result.name, "proj");
    assert.deepEqual(result.features.map((f) => f.dir), ["002-a", "010-b", "B-upper"]);
    const a = result.features[0].files;
    assert.ok(a instanceof Map);
    assert.deepEqual([...a.keys()].sort(), ["contracts/cli.md", "contracts/deep/api.md", "spec.md", "tasks.md"]);
    assert.equal(a.get("contracts/deep/api.md"), "api");
    assert.deepEqual(result.warnings, []);
  });

  test("missing specs/ gives no features and no error", async () => {
    const result = await scan(createFakeReader({ ".specify/memory/constitution.md": "# C" }), "p");
    assert.deepEqual(result.features, []);
    assert.deepEqual(result.constitution, { source: ".specify/memory/constitution.md", content: "# C" });
    assert.deepEqual(result.assessments, []);
    assert.equal(result.featureDirectory, null);
    assert.equal(result.gitBranch, null);
    assert.equal(result.gitDir, null);
  });

  test("skips bad folder and file names with W11", async () => {
    const reader = createFakeReader({
      "specs/001 bad/spec.md": "x",
      "specs/002-ok/my notes.md": "x",
      "specs/002-ok/sub dir/a.md": "x",
      "specs/002-ok/spec.md": "ok",
      "specs/002-ok/weird name.png": "ignored silently",
    });
    const result = await scan(reader, "p");
    assert.deepEqual(result.features.map((f) => f.dir), ["002-ok"]);
    assert.deepEqual([...result.features[0].files.keys()], ["spec.md"]);
    assert.deepEqual(codes(result.warnings).sort(), [
      "W11 specs/001 bad",
      "W11 specs/002-ok/my notes.md",
      "W11 specs/002-ok/sub dir",
    ]);
    assert.ok(result.warnings.every((w) => w.message === MSG_W11 && w.line === null));
  });

  test("skips unreadable files with W9", async () => {
    const reader = createFakeReader({
      "specs/001-x/spec.md": "ok",
      "specs/001-x/plan.md": new Error("EIO"),
      ".specify/memory/constitution.md": new TypeError("The encoded data was not valid for encoding utf-8"),
    });
    const result = await scan(reader, "p");
    assert.deepEqual([...result.features[0].files.keys()], ["spec.md"]);
    assert.equal(result.constitution, null);
    assert.deepEqual(result.warnings, [
      { code: "W9", file: "specs/001-x/plan.md", line: null, message: MSG_W9 },
      { code: "W9", file: ".specify/memory/constitution.md", line: null, message: MSG_W9 },
    ]);
  });

  test("collects assessments sorted by slug", async () => {
    const reader = createFakeReader({
      ".specify/assessments/b-2/intake.md": "i",
      ".specify/assessments/a-1/decision.md": "d",
      ".specify/assessments/a-1/notes/extra.md": "e",
      ".specify/assessments/loose.md": "not an assessment",
    });
    const result = await scan(reader, "p");
    assert.deepEqual(result.assessments.map((a) => a.slug), ["a-1", "b-2"]);
    assert.deepEqual([...result.assessments[0].files.keys()], ["decision.md", "notes/extra.md"]);
  });

  describe("feature.json", () => {
    const files = { "specs/001-x/spec.md": "", "specs/002-y/spec.md": "" };

    test("takes the basename of feature_directory when it names a feature", async () => {
      const reader = createFakeReader({ ...files, ".specify/feature.json": '{"feature_directory": "specs/002-y"}' });
      const result = await scan(reader, "p");
      assert.equal(result.featureDirectory, "002-y");
      assert.deepEqual(result.warnings, []);
    });

    test("accepts absolute, Windows-style and trailing-slash paths", async () => {
      for (const value of ["/abs/proj/specs/001-x", "specs\\\\001-x", "specs/001-x/", "001-x"]) {
        const reader = createFakeReader({ ...files, ".specify/feature.json": `{"feature_directory": "${value}"}` });
        assert.equal((await scan(reader, "p")).featureDirectory, "001-x", value);
      }
    });

    test("W10 when it names a missing feature", async () => {
      const reader = createFakeReader({ ...files, ".specify/feature.json": '{"feature_directory": "specs/999-z"}' });
      const result = await scan(reader, "p");
      assert.equal(result.featureDirectory, null);
      assert.deepEqual(result.warnings, [{ code: "W10", file: ".specify/feature.json", line: null, message: MSG_W10 }]);
    });

    test("W10 when it is invalid JSON, lacks the field, or cannot be read", async () => {
      for (const content of ["{not json", '{"other": 1}', '{"feature_directory": 5}', "null", new Error("EIO")]) {
        const reader = createFakeReader({ ...files, ".specify/feature.json": content });
        const result = await scan(reader, "p");
        assert.equal(result.featureDirectory, null);
        assert.deepEqual(codes(result.warnings), ["W10 .specify/feature.json"], String(content));
      }
    });

    test("no warning when the file does not exist", async () => {
      const result = await scan(createFakeReader(files), "p");
      assert.equal(result.featureDirectory, null);
      assert.deepEqual(result.warnings, []);
    });
  });

  describe("git HEAD", () => {
    test("reads the branch from a normal repository", async () => {
      const reader = createFakeReader(
        { "specs/001-x/spec.md": "" },
        { gitHead: { gitDir: "/p/.git", head: "ref: refs/heads/001-x" } },
      );
      const result = await scan(reader, "p");
      assert.equal(result.gitBranch, "001-x");
      assert.equal(result.gitDir, "/p/.git");
    });

    test("reads the branch from a worktree gitdir", async () => {
      const reader = createFakeReader(
        { "specs/001-x/spec.md": "", ".git": "gitdir: /main/.git/worktrees/p" },
        { gitHead: { gitDir: "/main/.git/worktrees/p", head: "ref: refs/heads/feature/nested" } },
      );
      const result = await scan(reader, "p");
      assert.equal(result.gitBranch, "feature/nested");
      assert.equal(result.gitDir, "/main/.git/worktrees/p");
    });

    test("detached HEAD gives a null branch but keeps gitDir", async () => {
      const reader = createFakeReader(
        { "specs/001-x/spec.md": "" },
        { gitHead: { gitDir: "/p/.git", head: "3f2a9c0d1e2b3a4f5c6d7e8f9a0b1c2d3e4f5a6b" } },
      );
      const result = await scan(reader, "p");
      assert.equal(result.gitBranch, null);
      assert.equal(result.gitDir, "/p/.git");
    });

    test("no repository gives null branch and gitDir", async () => {
      const result = await scan(createFakeReader({ "specs/001-x/spec.md": "" }), "p");
      assert.equal(result.gitBranch, null);
      assert.equal(result.gitDir, null);
    });
  });
});
