# Hosting a snapshot

`speckit-eye --build` writes the same overview, feature pages and document
pages as serve mode, as plain static files. Any static host can serve them:
there is no server-side logic, pages open directly by their address, the tree,
phases, task rows and document sections open and close without JavaScript,
and nothing is loaded from other servers. The stylesheet, the bundled fonts,
the browser scripts and the search index are written into `assets/` beside the
pages, so the theme switch, task map, filters, reader and search work the same
as in serve mode. A hosted snapshot has no live updates; each page footer
shows when it was generated.

```sh
npx speckit-eye --build . --out _site --base /my-repo/
```

- `--out` is the folder to write. It is created if missing. It must not be the
  project folder itself or lie inside `specs/` or `.specify/`.
- `--base` is the URL path the site is served under (default `/`). For GitHub
  Pages project sites this is `/<repository name>/`. Every link, script and
  the search index use this path; the fonts are referenced relative to the
  stylesheet, so they load under any base.
- `--home <url>` (optional) adds a "Home" link to `<url>` on every page, for
  a snapshot that is part of a larger site. It must be an absolute `http://`
  or `https://` address. For example, a dashboard published under `status/`
  of a docs site that links back to the docs home:

  ```sh
  npx speckit-eye --build . --out site/status --base /my-repo/status/ --home https://example.github.io/my-repo/
  ```

  speckit-eye's own documentation site does exactly this: its
  [project status page](https://serafac.github.io/speckit-eye/status/) is this
  repository's dashboard, with a Home link back to the docs.
- A second build into the same folder replaces the previous one, with no stale
  pages left behind. The tool recognizes its own output by the
  `.speckit-eye-build` file it writes there. It refuses to write into any other
  folder that is not empty, and changes nothing in it (exit code 2).

If you build locally into a folder inside your repository, add that folder
(for example `_site/`) to `.gitignore`.

## What a hosted build exposes

> [!WARNING]
> **A hosted build publishes every document of the project.** The site contains
> every spec, plan, research note, data model, contract, checklist, the
> constitution and every idea assessment under `.specify/assessments/`.
> **Anyone who can reach the site can read all of it, unless your host
> restricts access.** GitHub Pages sites of public repositories are public;
> check your host's access settings before you publish a private project.
> There is no option to leave documents out.

The build prints the same reminder when it finishes.

## GitHub Pages

Add this workflow as `.github/workflows/speckit-eye.yml`, then set
**Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Each
push to `main` builds the snapshot and publishes it at
`https://<user or org>.github.io/<repository>/` within the same run.

> [!WARNING]
> This job makes the specs, research, constitution and assessments readable by
> anyone who can reach the Pages site unless the host restricts access (see
> [What a hosted build exposes](#what-a-hosted-build-exposes)).

```yaml
name: speckit-eye snapshot

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx speckit-eye --build . --out _site --base /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

For a user or organization site (`<user>.github.io`) or a custom domain, the
site is served at the root: use `--base /` instead.

### Which feature is active in CI

The overview opens the active feature (see
[What is active](usage.md#what-is-active)). In CI this is usually not the
feature you are working on locally:

- `.specify/feature.json` is git-ignored by Spec Kit, so it is not in the
  checkout.
- `actions/checkout` checks out `main` for a push and a detached HEAD for a
  pull request, and these rarely match a feature folder name.

So a hosted snapshot normally opens the first feature (in folder order) that
still has open tasks. Everything else on the page is the same as locally.

## Netlify

Set the build command to `npx speckit-eye --build . --out _site` and the
publish directory to `_site`. A Netlify site is served at the root of its
domain, so the default base `/` fits. Use Netlify's access controls (for
example password protection) if the snapshot must not be public.

## Other hosts

Build with `--base` set to the path the site will be served under, and upload
the `--out` folder as it is. The host needs no rewrite rules: every page is a
real `.html` file, and `index.html` is the overview.
