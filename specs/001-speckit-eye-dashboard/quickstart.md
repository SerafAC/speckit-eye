# Quickstart & Validation Guide: speckit-eye

These are runnable scenarios that show the feature works end to end. Each one maps to a user story or success criterion. The automated versions live in `tests/e2e/` (see [plan.md](./plan.md)). Interfaces are defined in [contracts/](./contracts/), and the model in [data-model.md](./data-model.md).

## Prerequisites

- Node.js ≥ 22 (research R1). Development uses pnpm (decisions.md, "Package manager").
- A Spec Kit project. For development, use this repository itself or a fixture under `tests/fixtures/projects/`.
- Development only: `pnpm install --frozen-lockfile`, then `pnpm run build:css` (Tailwind → `dist/styles.css`), then `pnpm exec playwright install chromium` for the E2E tests.

## Scenario 1: Overview at a glance (US1, SC-001, SC-005, SC-007)

```bash
# published package
npx speckit-eye --serve ./path/to/speckit-project
# from a checkout, on a copy of the fixture (Scenario 2 edits it)
cp -r tests/fixtures/projects/mixed /tmp/eye-mixed
node bin/speckit-eye.js --serve /tmp/eye-mixed
```

Expected:
- The command prints `Local: http://127.0.0.1:<port>/` within a few seconds (port 4747 unless it is taken) (M7: about 1 minute from nothing, including the `npx` download).
- The page shows the project name, links to the constitution and assessments, the overall bar, and the counters `specs x / y`, `phases x / y`, `tasks x / y`.
- For the `mixed` fixture (10/20, 0/15, 30/30 tasks) the overall bar reads 40 / 65 (62 %), and the task counts in the tree match `grep -c` over the fixture checkboxes.
- The tree shows the complete feature collapsed with a check mark, the active feature expanded and highlighted, and the not-started feature in dark grey. The grid shows 65 squares, and hovering one names the task and highlights its parents in the tree.
- `git status` in the target project shows no changes (FR-006).

## Scenario 2: Live updates (US2, SC-002)

With Scenario 1 running and the overview open:

```bash
sed -i '0,/- \[ \] T/s//- [x] T/' /tmp/eye-mixed/specs/002-*/tasks.md   # tick the first open task (GNU sed)
```

Expected: within ≤ 2 s the counters and bars update and animate, the changed items flash briefly, and any extra feature you had expanded stays expanded at the same scroll position. Stop the server: a "Live updates paused" banner appears. Start it again on the same port: the banner goes away and the page catches up.

## Scenario 3: Artifacts in two steps or fewer (US3, SC-004)

Expected: from the overview, expand a feature (step 1), then click `plan` (step 2), and the rendered plan opens. The constitution and assessments open from the header in one step. Serve `tests/fixtures/projects/artifacts`: its `001-full` plan contains `<script>alert(1)</script>`, which is shown as escaped text, and no dialog opens. `curl -i --path-as-is http://127.0.0.1:<port>/../package.json` and `curl -i http://127.0.0.1:<port>/specs/001-alpha/spec.md` both return 404 (`--path-as-is` stops curl from removing the `..` itself).

## Scenario 4: Static build for hosting (US4, SC-003)

```bash
node bin/speckit-eye.js --build tests/fixtures/projects/mixed --out /tmp/eye-site --base /my-repo/
mkdir -p /tmp/eye-root && ln -sfn /tmp/eye-site /tmp/eye-root/my-repo
python3 -m http.server -d /tmp/eye-root 8080     # or: pnpm dlx http-server /tmp/eye-root -p 8080
```

Expected: `http://localhost:8080/my-repo/` shows the same overview as serve mode, plus a "generated at" footer. Deep links such as `/my-repo/features/001-alpha/plan.html` load directly. Expand and collapse work with JavaScript disabled. There are no requests to `__events`. Running the build again replaces the output. Building into a non-empty folder without the marker file exits with code 2 and leaves the folder untouched. The CLI prints the public-exposure note.

The CI sample for GitHub Pages is in `docs/hosting.md`. Pushing a commit updates the site when that workflow run finishes (SC-003).

## Scenario 5: Non-standard tasks.md (FR-013)

Serve `tests/fixtures/projects/nonstandard`. Expected: the tool keeps running, the affected feature shows a warning badge listing the W-codes and lines from [contracts/tasks-md-format.md](./contracts/tasks-md-format.md), the same warnings appear on stderr, and the totals still equal the number of checkboxes.

## Scenario 6: Scale (SC-010)

```bash
node tests/fixtures/generate-large.js /tmp/eye-large   # 50 features × 40 tasks
node bin/speckit-eye.js --serve /tmp/eye-large
```

Expected: the overview loads in ≤ 2 s, a checkbox change shows up in ≤ 2 s, and `--build` finishes in ≤ 30 s.

## Automated suites

```bash
pnpm test               # unit tests (node:test), no file system or network access
pnpm run test:coverage  # unit tests with a coverage report
pnpm run test:e2e       # Playwright E2E tests; names carry USn / FR-xxx ids
```

Scenario 3's 404 checks, the CSP headers and the read-only guarantee are automated in `tests/e2e/security.spec.js`, Scenario 6 in `tests/e2e/scale.spec.js`, and the SC-005 count check against this repository in `tests/e2e/self-counts.spec.js`.
