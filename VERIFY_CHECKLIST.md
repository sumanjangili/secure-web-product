# Verification & Smoke-Test Checklist

This document tracks the verification steps for the current change set (**release v1.2.0**).

**How to use:**
1. Rows marked **auto** are owned by the *Update VERIFY_CHECKLIST* workflow
   (`.github/workflows/update_verify_checklist.yml`) and are overwritten on every
   push to `main` — do not hand-edit them.
2. Hand-editable rows: replace `- [ ]` with `- [x]` and append a brief note or
   PR/CI link to document *when* and *how* the item was satisfied.

| # | Item | Status |
|---|------|--------|
| 1 | Repo structure reviewed | - [ ] |
| 2 | CI pipeline passes on a fresh branch | - [x] *(green run 42596127779 on main, 2026-11-09 — https://github.com/sumanjangili/secure-web-product/actions/runs/42596127779)* |
| 3 | Lint, type-check, and tests all green | **auto** - [x] <!-- gate:lint-tests · passed 2026-11-09 10:13 UTC --> |
| 4 | No vulnerable dependencies (audit gate, moderate) | **auto** - [x] <!-- gate:audit · passed 2026-11-09 10:13 UTC --> |
| 5 | Secret scanning clean | - [x] *(Gitleaks clean in CI run 42596127779, 2026-11-09)* |
| 6 | Docs up-to-date and include contribution steps | - [ ] |
| 7 | Production build succeeds and deploys to a staging URL | - [ ] |
| 8 | Netlify function behaves as expected | - [ ] |
| 9 | Branch protection & permissions verified | - [ ] |
| 10 | All reviewers sign-off | - [ ] |

**Local-gate evidence (pre-release, 2026-11-08):** lint clean (frontend + functions);
`tsc --noEmit` clean; 2 files / 7 tests green (`test:frontend`), functions wiring proof
green (`--passWithNoTests`); `audit:frontend` clean at `--moderate` (audit-ci);
`audit:functions` clean; production build with CSP nonce generation verified.
Component-level coverage only — explicitly not browser end-to-end.
