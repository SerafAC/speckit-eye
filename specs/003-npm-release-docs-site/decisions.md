# Decisions — 003-npm-release-docs-site

## 2026-09-28 — Phase 8: Polish & Cross-Cutting Concerns [T045-T051]
**Q:** T049–T051 are maintainer-only (CoC contact, npm/GitHub settings, first release after merge). How should autopilot handle them?
**A:** Provide CoC contact now — `seraf_ac@hotmail.com`, "for security private reporting" too. It replaces `[INSERT CONTACT METHOD]` in CODE_OF_CONDUCT.md and is added to SECURITY.md as the email fallback for private reports (GitHub private vulnerability reporting stays the primary channel). The rest of T049 (one-time npm/GitHub setup), plus T050 and T051, stay open for the maintainer after merge.
