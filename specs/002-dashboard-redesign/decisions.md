# Decisions: 002-dashboard-redesign

## 2026-09-26 — Phase 2: Foundational (part 1/3) [T006-T013]
**Q:** T008 has to publish `assets/theme.js` from `themeScript()`, which T017 creates later (`src/render/theme-script.js` doesn't exist yet). Everything else in T008 is done and tested. How should T008 be finished?
**A:** Tick T008; T017 adds theme.js — T008 is ticked now. T017 also adds `assets/theme.js` to `renderSite` and tests it in `site.test.js`. Nothing is stubbed.
