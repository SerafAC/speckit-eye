# Contract: Documentation site layout and build

## Build command

`pnpm run docs:build` → `node scripts/build-site.js`:

1. Remove `site/` if it exists.
2. `docmd build` (config `docmd.config.js`, source `docs/`, output `site/`).
3. `node bin/speckit-eye.js --build . --out site/status --base <P>status/ --home <H>`
   where `H` = `package.json` `homepage` (with trailing `/`) and `P` = its URL path
   (`https://serafac.github.io/speckit-eye/` → `P` = `/speckit-eye/`).
4. Exit non-zero if either build fails (nothing is deployed, FR-024).

`site/` is added to `.gitignore`. `pnpm exec docmd validate` is the link check (FR-023).

## URL layout

See [data-model.md → Documentation site](../data-model.md#documentation-site). Page addresses
follow docmd's defaults (`docs/usage.md` → `/usage/`).

## Home page (`docs/index.md`) must contain

- One-paragraph description and the screenshot (`assets/screenshot.png`, dark variant optional).
- Install / quick start: `npx speckit-eye --serve .`.
- A link labeled "Project status & live demo" to `<H>status/` (FR-026).
- Links to the npm package (`https://www.npmjs.com/package/speckit-eye`) and the repository.
- Links to every guide (Usage, Hosting a snapshot, Architecture, Releasing) and to
  `CONTRIBUTING.md` / `DEVELOPMENT.md` / `CHANGELOG.md` on GitHub.

## README must contain

- Badges: CI (`actions/workflows/ci.yml/badge.svg`), npm version (shields.io), license.
- A "Documentation" link to `<H>` and a "Project status & live demo" link to `<H>status/`.
- Everything already required by constitution §VIII.
