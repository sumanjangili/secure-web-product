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
| 2 | CI pipeline passes on a fresh branch | - [ ] *(v1.2.0 push CI failed — re-verify after corrected `ci.yml` is green)* |
| 3 | Lint, type-check, and tests all green | **auto** - [ ] <!-- gate:lint-tests · pending --> |
| 4 | No vulnerable dependencies (audit gate, moderate) | **auto** - [ ] <!-- gate:audit · pending --> |
| 5 | Secret scanning clean | - [ ] *(automated in `ci.yml` via Gitleaks — tick after first green run)* |
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
