# Decisions: 002-dashboard-redesign

## 2026-09-26 — Phase 2: Foundational (part 1/3) [T006-T013]
**Q:** T008 has to publish `assets/theme.js` from `themeScript()`, which T017 creates later (`src/render/theme-script.js` doesn't exist yet). Everything else in T008 is done and tested. How should T008 be finished?
**A:** Tick T008; T017 adds theme.js — T008 is ticked now. T017 also adds `assets/theme.js` to `renderSite` and tests it in `site.test.js`. Nothing is stubbed.

## 2026-09-26 — Phase 2: Foundational [T022-T023]
**Q:** The E2E test "US3 SC-004 every artifact page reachable in 2 clicks" fails because the new shell has no Menu (T018 removed it). The second and later documents of each assessment (e.g. `assessments/idea-x/decision.html`, `notes.html`) aren't linked from anywhere, since the sidebar links only each assessment's first document. The document list that fixes this comes in T061 (US5). How should T023 keep the suite green?
**A:** Interim document list — Add a small list of sibling documents to assessment and constitution document pages in `src/render/artifact.js` now; T061 replaces it later. SC-004 stays fully asserted, and no page is unreachable in the meantime.

## 2026-09-26 — Phase 3: User Story 1 (part 2/2) [T032-T034]
**Q:** In T033, the E2E test "US1 SC-002 View task shows the next task's full text and files in one click" can't pass until US3: the feature page gets its task list in T048 and the fixture gets file paths in T052. How should T033 handle it?
**A:** Keep it as test.fixme until T052 — The full-strength test stays in `tests/e2e/us1-overview.spec.js` as `test.fixme`, next to a passing "any task is two clicks from the map" test. T033 is ticked now. T052 MUST remove the `fixme` and make the test pass.

## 2026-09-27 — Phase 8: User Story 6 [T067-T072]
**Q:** The search-index contract contradicts itself. Its table and T067 say `terms` = label + detail, but its JSON example indexes only the label for features and headings. The implementation follows the example. Which is right?
**A:** Label only (keep as built) — There are fewer false hits: "done" doesn't match every finished feature. Tasks and documents search `label + " " + detail`; features and headings search only their `label`. The contract table and T067 wording were corrected to match.
