# Decisions

## 2026-09-24 — Package manager [all units]
**Q:** Which package manager should the project use? tasks.md mentions `npm install`, `npm ci`, and `package-lock.json`.
**A:** pnpm — The user wants pnpm as the main tool. Use `pnpm install` (creates `pnpm-lock.yaml`, not `package-lock.json`), `pnpm install --frozen-lockfile` in CI instead of `npm ci` (with `pnpm/action-setup` in the workflow), `pnpm test` / `pnpm run <script>`, and `pnpm exec` / `pnpm dlx` in place of `npx` for dev tooling in docs and scripts. End-user usage docs may still show `npx speckit-eye` as the zero-install path. The verifier test command is `pnpm test`.

## 2026-09-25 — Phase 3: User Story 1 (part 2/2) [T027-T034]
**Q:** T034 (owner gate): having seen the screenshots, what should clicking a tree item or grid square do, and at what size should the task grid switch to a fallback (and to what)?
**A:** Open in tree — Clicking a grid square opens its feature, phase and story in the tree and scrolls to the task. Tree items keep the native open/close behavior. Above 1,000 tasks, the grid shows one row per feature with smaller squares, and past that a bar per feature. No new pages are needed, and the tree still works without JavaScript. The owner has reviewed the screenshots, so T034 is resolved: record this in spec.md under Assumptions "Open design items" and append the implementation tasks after T070.

## 2026-09-25 — Phase 4: User Story 2 (part 2/2) [T043-T044]
**Q:** T043 needs the us2-live E2E tests run in the CI matrix (ubuntu, macOS, Windows) and once under WSL. The branch has never been pushed, and this machine isn't WSL. How should the results be gathered?
**A:** Push for CI — The orchestrator pushes branch 001-speckit-eye and reads the CI results with `gh run`. The WSL run is still to do and needs a human. T043 stays open until the CI and WSL results are recorded under R2 in research.md. Autopilot moves on to later units meanwhile; implementers must not work on T043.
