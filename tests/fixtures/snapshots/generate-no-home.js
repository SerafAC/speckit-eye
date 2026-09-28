/**
 * Writes the "no --home" page snapshots used by tests/unit/layout.test.js and
 * tests/unit/site.test.js (003 T031): the pages as rendered before `--home`
 * existed. Pages rendered without `home` must stay byte-identical to these.
 * Only rerun on purpose, when a deliberate layout change updates every page:
 *   node tests/fixtures/snapshots/generate-no-home.js
 */

import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { renderPage } from "../../../src/render/layout.js";
import { renderSite } from "../../../src/render/site.js";
import { buildModel } from "../../../src/model/build-model.js";
import { scan } from "../../../src/project/scan.js";
import { createFakeReader } from "../../unit/fake-reader.js";
import { SNAPSHOT_FILES, SNAPSHOT_ASSETS, layoutCases, siteCases } from "./no-home-cases.js";

const project = buildModel(await scan(createFakeReader(SNAPSHOT_FILES), "my-proj"));

/** @type {Record<string, string>} */
const layout = {};
for (const [name, opts] of Object.entries(layoutCases(project))) layout[name] = renderPage(opts);

/** SHA-256 of every HTML page of the site (the full pages are in no-home-layout.json). */
/** @type {Record<string, string>} */
const site = {};
for (const [name, opts] of Object.entries(siteCases())) {
  for (const [key, entry] of renderSite(project, { ...opts, assets: SNAPSHOT_ASSETS })) {
    if (key.endsWith(".html")) site[`${name}:${key}`] = createHash("sha256").update(/** @type {string} */ (entry.body)).digest("hex");
  }
}

await writeFile(new URL("no-home-layout.json", import.meta.url), `${JSON.stringify(layout, null, 2)}\n`);
await writeFile(new URL("no-home-site.json", import.meta.url), `${JSON.stringify(site, null, 2)}\n`);
