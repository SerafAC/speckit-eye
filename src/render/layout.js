/**
 * Shared page shell (contracts/routes.md "Page shell", FR-005–FR-009). Pure.
 * All internal links are absolute and start with `base` (research R10).
 *
 * Overview and feature pages get the dark sidebar; document pages get the
 * narrow icon rail. Every page also has a `<details>` mobile menu with the same
 * navigation, so narrow screens can navigate without JavaScript (FR-009).
 * Controls that need scripts (search, theme) are rendered `hidden` and shown
 * by `assets/app.js` (FR-053).
 */

import { html, raw } from "./html.js";
import { icon } from "./icons.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("./html.js").Raw} Raw */
/** @typedef {"overview" | "feature" | "document"} PageKind */

/**
 * @typedef {object} Destination
 * @property {string} label
 * @property {string} url page path without the base
 * @property {string} icon icon name for the rail
 * @property {string} key identifies the destination for `current`
 */

/**
 * Overview, the constitution when present, and one entry per assessment with
 * artifacts ("Assessment: <slug>", linking to its first artifact).
 * @param {Project} project
 * @returns {Destination[]}
 */
function mainDestinations(project) {
  /** @type {Destination[]} */
  const out = [{ label: "Overview", url: "index.html", icon: "grid", key: "overview" }];
  if (project.constitution) {
    out.push({ label: "Constitution", url: project.constitution.url, icon: "shield", key: "constitution" });
  }
  for (const a of project.assessments) {
    const first = a.artifacts[0];
    if (first) out.push({ label: `Assessment: ${a.slug}`, url: first.url, icon: "layers", key: `assessment:${a.slug}` });
  }
  return out;
}

/**
 * Features in the sidebar order: "In progress first", i.e. `ranks.progress`
 * from src/model/ranks.js (FR-006, FR-012); folder order only for a partial
 * model without ranks.
 * @param {Feature[]} features
 * @returns {Feature[]}
 */
export function sidebarOrder(features) {
  const rank = (/** @type {Feature} */ f) => f.ranks?.progress;
  if (!features.every((f) => typeof rank(f) === "number")) return [...features];
  return [...features].sort((a, b) => rank(a) - rank(b));
}

/**
 * @param {Feature} f
 * @returns {string}
 */
function statusOfFeature(f) {
  return f.status ?? "no-tasks";
}

/**
 * @param {boolean} on
 * @returns {Raw | ""}
 */
function ariaCurrent(on) {
  return on ? raw(' aria-current="page"') : "";
}

/**
 * @param {object} options
 * @param {Project} options.project
 * @param {(url: string) => string} options.link
 * @param {string | null} options.current
 * @returns {Raw}
 */
function mainNav({ project, link, current }) {
  return html`<nav aria-label="Main"><ul>${mainDestinations(project).map(
    (d) =>
      html`<li><a href="${link(d.url)}"${ariaCurrent(current === d.key)}>${icon(d.icon)}<span>${d.label}</span></a></li>`,
  )}</ul></nav>`;
}

/**
 * The Features list with its "Features N / M done" heading.
 * @param {object} options
 * @param {Project} options.project
 * @param {(url: string) => string} options.link
 * @param {string | null} options.current
 * @param {boolean} [options.mobile] the copy in the mobile menu: no `data-key`,
 *   `data-sig` or `data-keep-scroll`, so live updates track the sidebar only.
 *   Both copies carry `data-live`, so `live.js` replaces them after a change.
 * @returns {Raw}
 */
function featuresNav({ project, link, current, mobile = false }) {
  const done = project.features.filter((f) => statusOfFeature(f) === "done").length;
  const items = sidebarOrder(project.features).map((f) => {
    const status = statusOfFeature(f);
    const open = f.counts?.open ?? 0;
    const end =
      status === "done"
        ? html`<span data-part="count">${icon("check", { label: "Complete" })}</span>`
        : html`<span data-part="count">${open > 0 ? String(open) : ""}</span>`;
    const track = mobile ? "" : html` data-key="side:${f.dir}" data-sig="${f.sig ?? ""}"`;
    return html`<li><a${track} data-status="${status}" href="${link(`features/${f.dir}/index.html`)}"${ariaCurrent(
      current === f.dir,
    )}><span data-part="dot" data-status="${status}"></span><span data-part="name" title="${f.title}">${f.title}</span>${end}</a></li>`;
  });
  const track = mobile
    ? html` data-live="menu-features"`
    : html` data-live="sidebar-features" data-key="side:features" data-sig="${done}/${project.features.length}"`;
  return html`<nav aria-label="Features" data-part="features"${track}><h2>Features <span data-part="features-count">${done} / ${project.features.length} done</span></h2><ul${mobile ? "" : raw(' data-keep-scroll="sidebar"')}>${items}</ul></nav>`;
}

/**
 * @param {boolean} rail icon-only buttons in the rail
 * @returns {Raw}
 */
function searchButton(rail) {
  return rail
    ? html`<button type="button" data-part="search" aria-label="Search" title="Search (⌘K)" hidden>${icon("search")}</button>`
    : html`<button type="button" data-part="search" hidden>${icon("search")}<span>Search tasks, specs…</span><kbd>⌘K</kbd></button>`;
}

/** @returns {Raw} */
function themeGroup() {
  const choices = [
    ["light", "sun", "Light"],
    ["dark", "moon", "Dark"],
    ["system", "monitor", "System"],
  ];
  return html`<div role="group" aria-label="Theme" data-part="theme" hidden>${choices.map(
    ([value, name, label]) =>
      html`<button type="button" aria-pressed="false" data-theme-choice="${value}" aria-label="${label}" title="${label}">${icon(name)}</button>`,
  )}</div>`;
}

/**
 * @param {object} options
 * @param {string} options.mode
 * @param {string} options.version
 * @param {string | null} options.generatedAt
 * @returns {Raw}
 */
function footer({ mode, version, generatedAt }) {
  const time =
    mode !== "serve" && generatedAt ? html` · generated <time datetime="${generatedAt}">${generatedAt}</time>` : "";
  return html`<footer data-live="footer" data-key="footer" data-sig="${version}">speckit-eye ${version}${time}</footer>`;
}

/**
 * @param {object} options
 * @param {string} options.title page title (plain text)
 * @param {string} options.base normalized base path with leading and trailing `/`
 * @param {"serve" | "static"} options.mode
 * @param {Project} options.project
 * @param {PageKind} [options.page]
 * @param {string | null} [options.current] the feature `dir` on feature pages;
 *   `"overview"`, `"constitution"` or `"assessment:<slug>"` for main destinations
 * @param {string | Raw} options.main trusted inner HTML of `<main>`
 * @param {string} options.version
 * @param {string | null} [options.generatedAt] ISO time of the build, shown in
 *   the static mode footer (FR-031)
 * @param {string | null} [options.home] absolute URL of the "Home" link
 *   (`--home`, 003 contracts/cli-home.md); `null` renders no link and leaves
 *   the page exactly as before the option existed
 * @returns {string} a complete HTML document
 */
export function renderPage({
  title,
  base,
  mode,
  project,
  page = "overview",
  current = null,
  main,
  version,
  generatedAt = null,
  home = null,
}) {
  const link = (/** @type {string} */ url) => `${base}${url}`;
  const serve = mode === "serve";
  const here = current ?? (page === "overview" ? "overview" : null);
  const nav = { project, link, current: here };
  const foot = footer({ mode, version, generatedAt });

  const brand = html`<a href="${link("index.html")}" data-part="brand">${icon("eye")}<span>speckit-eye</span></a>`;
  // The "Home" link of `--home`: each placement brings its own line break, so
  // pages without it are unchanged.
  const homeLink = home ? html`<a href="${home}" data-part="home">${icon("house")}<span>Home</span></a>\n` : "";
  const homeIcon = home
    ? html`<a href="${home}" data-part="home" aria-label="Home" title="Home">${icon("house")}</a>\n`
    : "";

  const side =
    page === "document"
      ? html`<nav data-region="rail" class="always-dark" aria-label="Rail">
<a href="${link("index.html")}" data-part="brand" aria-label="speckit-eye" title="speckit-eye">${icon("eye")}</a>
${homeIcon}${searchButton(true)}
<ul>${mainDestinations(project).map(
          (d) =>
            html`<li><a href="${link(d.url)}" aria-label="${d.label}" title="${d.label}"${ariaCurrent(here === d.key)}>${icon(
              d.icon,
            )}</a></li>`,
        )}</ul>
${themeGroup()}
</nav>`
      : html`<aside data-region="sidebar" class="always-dark">
${brand}
<p data-part="project-name">${project.name}</p>
${homeLink}${searchButton(false)}
${mainNav(nav)}
${featuresNav(nav)}
${themeGroup()}
${foot}
</aside>`;

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script src="${link("assets/theme.js")}"></script>
<link rel="stylesheet" href="${link("assets/styles.css")}">
<script type="module" src="${link("assets/app.js")}"></script>
${serve ? html`<script type="module" src="${link("assets/live.js")}"></script>\n` : ""}</head>
<body data-mode="${mode}" data-version="${version}" data-page="${page}" data-base="${base}">
<details data-region="mobile-menu">
<summary aria-label="Menu">${icon("menu")}<span>${project.name}</span></summary>
${homeLink}${mainNav(nav)}
${featuresNav({ ...nav, mobile: true })}
</details>
${side}
<main>${raw(main)}</main>
${page === "document" ? html`${foot}\n` : ""}${serve ? html`<div data-region="live-status" hidden>Live updates paused — reconnecting…</div>\n` : ""}<dialog data-region="search" aria-label="Search"></dialog>
${page === "overview" ? html`<div data-region="tooltip" class="always-dark" role="tooltip" hidden></div>\n` : ""}</body>
</html>
`.value;
}
