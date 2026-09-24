# Decisions

## 2026-09-24 — Package manager [all units]
**Q:** Which package manager should the project use? tasks.md mentions `npm install`, `npm ci`, and `package-lock.json`.
**A:** pnpm — The user wants pnpm as the main tool. Use `pnpm install` (creates `pnpm-lock.yaml`, not `package-lock.json`), `pnpm install --frozen-lockfile` in CI instead of `npm ci` (with `pnpm/action-setup` in the workflow), `pnpm test` / `pnpm run <script>`, and `pnpm exec` / `pnpm dlx` in place of `npx` for dev tooling in docs and scripts. End-user usage docs may still show `npx speckit-eye` as the zero-install path. The verifier test command is `pnpm test`.
