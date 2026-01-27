# Verification & Smoke‑Test Checklist

This document tracks the verification steps for the current change set.  
Each item should be checked off once it has been completed and verified.  
Add a brief note (or PR link) next to the checkbox to create an audit trail.

| # | Item | Status |
|---|------|--------|
| 1️⃣ | Repo structure reviewed | - [ ] |
| 2️⃣ | CI pipeline passes on a fresh branch | - [x] <!-- CI run --> |
| 3️⃣ | Lint, type‑check, and tests all green | - [x] <!-- Lint & tests passed on feature/smoke-test --> |
| 4️⃣ | No vulnerable dependencies reported | - [x] <!-- npm audit clean --> |
| 5️⃣ | Secret scanning clean | - [ ] |
| 6️⃣ | Docs up‑to‑date and include contribution steps | - [ ] |
| 7️⃣ | Production build succeeds and deploys to a staging URL | - [ ] |
| 8️⃣ | Netlify function behaves as expected | - [ ] |
| 9️⃣ | Branch protection & permissions verified | - [ ] |
| 🔟 | All reviewers sign‑off | - [ ] |

## How to use

1. **Copy** the block above into `VERIFY_CHECKLIST.md` at the root of the repository.  
2. As each verification step completes, replace `- [ ]` with `- [x]`.  
3. Add a short comment (e.g., a PR number, a link to a CI run, or a ticket ID) after the checkbox to document *when* and *how* the item was satisfied, for example:

```markdown
- [x] <!-- PR #1234 – repo layout validated -->
- [x] <!-- CI run https://github.com/sumanjangili/secure-web-product/actions/runs/987654321 -->
- [x] <!-- Lint & tests passed on `feature/smoke‑test` -->
