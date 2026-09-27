// US4 — Choose a light, dark or system theme (spec.md, User Story 4).
// Every test drives the real CLI in serve mode against a temporary copy of
// the `mixed` fixture (tests/fixtures/projects/README.md: 002-beta active,
// next task T011, T018 blocked by T011). Colors are read from computed
// styles; there are no screenshot comparisons (SC-009).

import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { copyFixture, startServe, featurePagePath } from "./helpers.js";

/** Live updates must show within this time (FR-026, SC-002). */
const LIVE_MS = 2_000;

/** `--bg` of each theme (src/styles/input.css), as computed colors. */
const BG = { light: "rgb(244, 243, 239)", dark: "rgb(14, 16, 19)" };

/** The next-task orange, the same in both themes (FR-047). */
const NEXT = "rgb(194, 65, 12)";

/** @type {import("./helpers.js").ServeHandle | null} */
let server = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
});

async function serveMixed() {
  const dir = await copyFixture("mixed");
  server = await startServe(dir);
  return { dir, url: server.url };
}

const html = (page) => page.locator("html");
const switchButton = (page, choice) =>
  page.locator(`[data-region="sidebar"] [data-theme-choice="${choice}"], [data-region="rail"] [data-theme-choice="${choice}"]`);
const upNext = (page) => page.locator('[data-region="up-next"]');
const tooltip = (page) => page.locator('[data-region="tooltip"]');
const square = (page, key) => page.locator(`[data-region="taskmap"] a[data-key="${key}"]`);
const summary = (page) => page.locator('[data-stat="percent"] [data-part="detail"]');

/** The computed background of `<html>` (the page's `--bg`). */
const pageBg = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

/** Which switch button is pressed. */
async function pressed(page) {
  const buttons = page.locator('[data-region="sidebar"] [data-theme-choice], [data-region="rail"] [data-theme-choice]');
  await expect(buttons.first()).toBeVisible();
  const on = await buttons.evaluateAll((els) =>
    els.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("data-theme-choice")),
  );
  return on;
}

/** Relative luminance of an `rgb()`/`rgba()` color (WCAG 2). */
function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two opaque colors. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * For every visible element in `selector` that has its own text, the text
 * color and the effective (composited) background behind it, as [r, g, b].
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
function textColors(page, selector) {
  return page.evaluate((sel) => {
    /** Parses rgb()/rgba()/color(srgb …) into [r, g, b, a] (0–255, 0–1). */
    const parse = (value) => {
      const probe = document.createElement("canvas").getContext("2d");
      probe.fillStyle = "#000";
      probe.fillStyle = value;
      probe.clearRect(0, 0, 1, 1);
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top, bottom) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
    };
    const background = (el) => {
      /** @type {number[][]} */
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let result = [255, 255, 255, 1];
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== "");
        if (!own) continue;
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        if (style.visibility === "hidden" || style.display === "none" || box.width === 0 || box.height === 0) continue;
        if (el.closest("[hidden], [aria-hidden='true'], script, style, svg")) continue;
        const bg = background(el);
        const fg = over(parse(style.color), bg);
        out.push({ text: el.textContent.trim().slice(0, 40), tag: el.tagName, fg: fg.slice(0, 3), bg: bg.slice(0, 3) });
      }
    }
    return out;
  }, selector);
}

test("US4 FR-045 first visit shows System and follows the OS scheme", async ({ page }) => {
  const { url } = await serveMixed();
  for (const scheme of /** @type {const} */ (["light", "dark"])) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(url);
    await expect(html(page)).not.toHaveAttribute("data-theme");
    expect(await pressed(page)).toEqual(["system"]);
    expect(await pageBg(page)).toBe(BG[scheme]);
  }
});

test("US4 FR-045 System follows an OS switch without reload", async ({ page }) => {
  const { url } = await serveMixed();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);
  expect(await pageBg(page)).toBe(BG.light);
  await page.evaluate(() => (/** @type {any} */ (window).__sameDocument = true));
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => pageBg(page)).toBe(BG.dark);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => pageBg(page)).toBe(BG.light);
  // Still the same document: nothing reloaded.
  expect(await page.evaluate(() => /** @type {any} */ (window).__sameDocument)).toBe(true);
  expect(await pressed(page)).toEqual(["system"]);
});

test("US4 FR-046 SC-005 Dark applies from first paint on another page and after reload", async ({ page }) => {
  const { url } = await serveMixed();
  await page.emulateMedia({ colorScheme: "light" });
  // Records, before any module script or DOMContentLoaded handler runs, the
  // theme when <body> is parsed and the page background of every frame until
  // the page has loaded.
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__first = { themeAtBody: undefined, frames: [], loaded: false };
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      w.__first.themeAtBody = document.documentElement.getAttribute("data-theme");
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
    const sample = () => {
      w.__first.frames.push(getComputedStyle(document.documentElement).backgroundColor);
      if (!w.__first.loaded || w.__first.frames.length < 3) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    window.addEventListener("load", () => (w.__first.loaded = true));
  });

  await page.goto(url);
  await switchButton(page, "dark").click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  const firstPaint = async () => {
    await page.waitForFunction(() => {
      const f = /** @type {any} */ (window).__first;
      return f.loaded && f.frames.length >= 3;
    });
    const f = await page.evaluate(() => /** @type {any} */ (window).__first);
    expect(f.themeAtBody).toBe("dark");
    const painted = f.frames.filter((/** @type {string} */ c) => c !== "rgba(0, 0, 0, 0)");
    expect(painted.length).toBeGreaterThan(0);
    expect(painted).not.toContain(BG.light);
    expect(painted[0]).toBe(BG.dark);
  };

  for (const target of [featurePagePath("002-beta"), "features/002-beta/plan.html", "index.html"]) {
    await page.goto(`${url}${target}`);
    await firstPaint();
    expect(await pressed(page)).toEqual(["dark"]);
  }
  await page.reload();
  await firstPaint();
  expect(await pressed(page)).toEqual(["dark"]);
});

test("US4 FR-046 theme survives a live update", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await page.emulateMedia({ colorScheme: "light" });
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
  await switchButton(page, "dark").click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  const file = path.join(dir, "specs", "002-beta", "tasks.md");
  const text = await readFile(file, "utf8");
  await writeFile(file, text.replace(/^- \[ \] T011\b/m, "- [x] T011"));
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });

  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  expect(await pressed(page)).toEqual(["dark"]);
  expect(await pageBg(page)).toBe(BG.dark);
});

test("US4 FR-047 sidebar, Up next bar and tooltip are dark and next orange is identical in both themes", async ({ page }) => {
  const { url } = await serveMixed();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);

  /** @type {Record<string, string>} */
  const orange = {};
  for (const theme of ["light", "dark"]) {
    await switchButton(page, theme).click();
    await expect(html(page)).toHaveAttribute("data-theme", theme);
    expect(await pageBg(page)).toBe(BG[theme]);

    for (const [name, locator] of [
      ["sidebar", page.locator('[data-region="sidebar"]')],
      ["Up next bar", upNext(page)],
    ]) {
      const bg = await locator.evaluate((el) => getComputedStyle(el).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g).map(Number);
      expect(luminance([r, g, b]), `${name} in ${theme}`).toBeLessThan(0.05);
      expect(await locator.evaluate((el) => getComputedStyle(el).colorScheme), `${name} in ${theme}`).toBe("dark");
    }

    await square(page, "002-beta/T011").focus();
    await expect(tooltip(page)).toBeVisible();
    const tipBg = await tooltip(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = tipBg.match(/\d+/g).map(Number);
    expect(luminance([r, g, b]), `tooltip in ${theme}`).toBeLessThan(0.05);
    await square(page, "002-beta/T011").blur();

    orange[theme] = await upNext(page)
      .locator('[data-part="id"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  }
  expect(orange.light).toBe(NEXT);
  expect(orange.dark).toBe(NEXT);
});

test("US4 FR-046 storage refused: the switch changes the current page and the next page is System", async ({ page }) => {
  const { url } = await serveMixed();
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(url);
  expect(await pressed(page)).toEqual(["system"]);
  await switchButton(page, "dark").click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  expect(await pageBg(page)).toBe(BG.dark);
  expect(await pressed(page)).toEqual(["dark"]);

  await page.goto(`${url}${featurePagePath("002-beta")}`);
  await expect(html(page)).not.toHaveAttribute("data-theme");
  expect(await pressed(page)).toEqual(["system"]);
  expect(await pageBg(page)).toBe(BG.light);
  expect(errors).toEqual([]);
});

test("US4 SC-010 body text contrast ≥ 4.5:1 in both themes on overview, feature and document pages", async ({ page }) => {
  test.setTimeout(60_000);
  const { url } = await serveMixed();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);

  const pages = [
    ["overview", "index.html"],
    ["feature", `${featurePagePath("002-beta")}#task-002-beta-T018`],
    ["document", "features/002-beta/plan.html"],
    ["constitution", "constitution.html"],
  ];
  for (const theme of ["light", "dark"]) {
    await page.goto(url);
    await switchButton(page, theme).click();
    await expect(html(page)).toHaveAttribute("data-theme", theme);
    for (const [kind, target] of pages) {
      await page.goto(`${url}${target}`);
      await expect(html(page)).toHaveAttribute("data-theme", theme);
      if (kind === "feature") {
        // The rose "Blocked" pill of T018 in the detail panel.
        const pill = page.locator('[data-region="detail"] [data-part="status"]');
        await expect(pill).toHaveAttribute("data-status", "blocked");
        await expect(pill).toBeVisible();
      }
      const samples = await textColors(page, "main");
      expect(samples.length, `${kind} ${theme} has text`).toBeGreaterThan(3);
      const low = samples
        .map((s) => ({ ...s, ratio: Math.round(contrast(s.fg, s.bg) * 100) / 100 }))
        .filter((s) => s.ratio < 4.5);
      expect(low, `${kind} page in ${theme}`).toEqual([]);
      if (kind === "feature") {
        const rose = samples.filter((s) => s.text === "Blocked");
        expect(rose.length, `rose pill in ${theme}`).toBeGreaterThan(0);
      }
    }
  }
});
