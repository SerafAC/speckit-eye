import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { selectFontFiles, FONT_PACKAGES } from "../../scripts/copy-assets.js";

const listing = (pkg, names) => ({
  package: pkg,
  files: ["LICENSE", "README.md", "package.json", "index.css", "wght.css", ...names.map((n) => `files/${n}`)],
});

const geist = listing("@fontsource-variable/geist", [
  "geist-cyrillic-wght-normal.woff2",
  "geist-latin-ext-wght-italic.woff2",
  "geist-latin-ext-wght-normal.woff2",
  "geist-latin-wght-italic.woff2",
  "geist-latin-wght-normal.woff2",
  "geist-vietnamese-wght-normal.woff2",
]);
const geistMono = listing("@fontsource-variable/geist-mono", [
  "geist-mono-latin-ext-wght-normal.woff2",
  "geist-mono-latin-wght-normal.woff2",
  "geist-mono-symbols2-wght-normal.woff2",
]);
const serif = listing("@fontsource/instrument-serif", [
  "instrument-serif-latin-400-italic.woff",
  "instrument-serif-latin-400-italic.woff2",
  "instrument-serif-latin-400-normal.woff",
  "instrument-serif-latin-400-normal.woff2",
  "instrument-serif-latin-ext-400-italic.woff2",
  "instrument-serif-latin-ext-400-normal.woff2",
  "instrument-serif-cyrillic-400-normal.woff2",
]);

describe("selectFontFiles", () => {
  test("lists the three font packages", () => {
    assert.deepEqual(FONT_PACKAGES, [
      "@fontsource-variable/geist",
      "@fontsource-variable/geist-mono",
      "@fontsource/instrument-serif",
    ]);
  });

  test("keeps Latin and Latin-ext woff2 files and the licences, sorted by target path", () => {
    assert.deepEqual(selectFontFiles([geist, geistMono, serif]), [
      { from: "@fontsource-variable/geist-mono/LICENSE", to: "dist/fonts/OFL-geist-mono.txt" },
      { from: "@fontsource-variable/geist/LICENSE", to: "dist/fonts/OFL-geist.txt" },
      { from: "@fontsource/instrument-serif/LICENSE", to: "dist/fonts/OFL-instrument-serif.txt" },
      {
        from: "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2",
        to: "dist/fonts/geist-latin-ext-wght-normal.woff2",
      },
      {
        from: "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
        to: "dist/fonts/geist-latin-wght-normal.woff2",
      },
      {
        from: "@fontsource-variable/geist-mono/files/geist-mono-latin-ext-wght-normal.woff2",
        to: "dist/fonts/geist-mono-latin-ext-wght-normal.woff2",
      },
      {
        from: "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
        to: "dist/fonts/geist-mono-latin-wght-normal.woff2",
      },
      {
        from: "@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
        to: "dist/fonts/instrument-serif-latin-400-italic.woff2",
      },
      {
        from: "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
        to: "dist/fonts/instrument-serif-latin-400-normal.woff2",
      },
      {
        from: "@fontsource/instrument-serif/files/instrument-serif-latin-ext-400-italic.woff2",
        to: "dist/fonts/instrument-serif-latin-ext-400-italic.woff2",
      },
      {
        from: "@fontsource/instrument-serif/files/instrument-serif-latin-ext-400-normal.woff2",
        to: "dist/fonts/instrument-serif-latin-ext-400-normal.woff2",
      },
    ]);
  });

  test("drops other subsets, italic variable files and .woff files", () => {
    const names = selectFontFiles([geist, geistMono, serif]).map((p) => p.to);
    for (const dropped of ["cyrillic", "vietnamese", "symbols2", "wght-italic"]) {
      assert.ok(!names.some((n) => n.includes(dropped)), dropped);
    }
    assert.ok(names.every((n) => n.endsWith(".woff2") || n.endsWith(".txt")));
  });

  test("ignores files outside files/ and other package files", () => {
    const pairs = selectFontFiles([
      { package: "@fontsource-variable/geist", files: ["geist-latin-wght-normal.woff2", "README.md", "scss/mixins.scss"] },
    ]);
    assert.deepEqual(pairs, []);
  });

  test("the order does not depend on the listing order", () => {
    const shuffled = [serif, geistMono, { ...geist, files: [...geist.files].reverse() }];
    assert.deepEqual(selectFontFiles(shuffled), selectFontFiles([geist, geistMono, serif]));
  });

  test("empty input → no files", () => {
    assert.deepEqual(selectFontFiles([]), []);
  });
});
