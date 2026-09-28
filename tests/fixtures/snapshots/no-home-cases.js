/**
 * Inputs of the "no --home" page snapshots (003 T031), shared by the
 * generator and the unit tests so both render exactly the same pages.
 */

import { html } from "../../../src/render/html.js";

const tasks = (n, done) =>
  ["## Phase 1: P", ...Array.from({ length: n }, (_, i) => `- [${i < done ? "x" : " "}] T${String(i + 1).padStart(3, "0")} t`)].join("\n");

/** Four features (complete, in progress, ready, spec only), a constitution and an assessment. */
export const SNAPSHOT_FILES = {
  ".specify/memory/constitution.md": "# Constitution",
  ".specify/assessments/dash/intake.md": "# Intake",
  ".specify/assessments/dash/decision.md": "# Decision",
  "specs/001-alpha/spec.md": "# Feature Specification: Alpha",
  "specs/001-alpha/tasks.md": tasks(3, 3),
  "specs/002-beta/spec.md": "# Feature Specification: Beta <b>",
  "specs/002-beta/tasks.md": tasks(4, 2),
  "specs/003-gamma/tasks.md": tasks(2, 0),
  "specs/004-delta/spec.md": "# Feature Specification: Delta",
};

export const SNAPSHOT_ASSETS = {
  styles: "body{color:red}",
  modules: { "app.js": "export const app = 1;", "live.js": "export const live = 1;" },
  fonts: {},
};

/**
 * `renderPage` options per page type, without `home`.
 * @param {import("../../../src/model/build-model.js").Project} project
 */
export function layoutCases(project) {
  const common = { project, version: "1.2.3", main: html`<section data-region="stats">x</section>` };
  return {
    overview: { ...common, title: "Overview", base: "/", mode: "serve", page: "overview" },
    feature: {
      ...common,
      title: "Beta",
      base: "/repo/",
      mode: "static",
      page: "feature",
      current: "002-beta",
      generatedAt: "2026-01-02T03:04:05.000Z",
    },
    document: {
      ...common,
      title: "Constitution",
      base: "/repo/",
      mode: "static",
      page: "document",
      current: "constitution",
      generatedAt: "2026-01-02T03:04:05.000Z",
    },
  };
}

/** `renderSite` options per mode, without `home` and `assets`. */
export function siteCases() {
  return {
    serve: { base: "/", mode: "serve", version: "9.9.9" },
    static: { base: "/repo/", mode: "static", version: "9.9.9", generatedAt: "2026-01-02T03:04:05.000Z" },
  };
}
