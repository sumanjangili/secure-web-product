[![Sponsor me on GitHub](https://img.shields.io/badge/Sponsor-💖-orange)](https://github.com/sponsors/sumanjangili)  
[![Ko‑fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/G2G21S383T)  
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/sumanjangili/secure-web-product/blob/main/LICENSE)  
![Version](https://img.shields.io/github/v/tag/sumanjangili/secure-web-product?label=version)
[![Node.js ≥20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

## Secure Web Product - Backend (Netlify Functions)

> **A Privacy-First, Product Management, Zero-Knowledge Authentication & Audit Hub.**  
> A production-ready full-stack application featuring end-to-end encryption, TOTP-based MFA with backup codes, and comprehensive audit logging. Built with Vite, React, Netlify Functions, PostgreSQL, and Upstash Redis.

This backend (a collection of Node.js serverless functions) provides the API layer for the Secure Web Product frontend. It enforces strict security policies: **no plaintext user data is stored**, **rate limiting** prevents brute-force attacks, and **audit logs** track every sensitive action.

This repository serves as both a **functional secure application** and a **product management hub**. It demonstrates how to build a privacy-first system where sensitive data is encrypted in the browser, and all authentication events are logged.

---

### Table of Contents

1. [Core Features](#core-features)
2. [Getting Started Locally](#getting-started-locally)
3. [Scripts](#scripts)
4. [Deploying to Netlify](#deploying-to-netlify)
5. [CI & Security Pipeline](#ci--security-pipeline)
6. [Product Management Documents](#product-management-documents)
7. [Testing Locally](#testing-locally)
8. [Extending the Template](#extending-the-template)
9. [Verification Checklist](#verification-checklist)
10. [Contributing](#contributing)
11. [License](#license)

---

### Core Features

1. Secure Authentication & MFA
   - **Password Hashing**: Argon2 (memory-hard, resistant to GPU attacks).
   - **MFA (TOTP)**: Google Authenticator/Authy compatible 6-digit codes (RFC 6238, `issuer:account` labels, ±1 window tolerance).
   - **Backup Codes**: 10 one-time-use recovery codes (12 hex characters, Argon2-hashed at rest), generated during MFA setup or regenerated on demand.
   - **Optional MFA**: MFA is opt-in. Endpoints with `requireMFAIfEnrolled` block only users who *enabled* MFA but skipped verification this session — non-MFA users retain full access.
   - **`mfaVerified` JWT Claim**: MFA-enabled users receive a token marked `mfaVerified: true` only after TOTP/backup-code verification. Sensitive endpoints enforce this via `_middleware/require-mfa.js`.
   - **Rate Limiting**: Atomic Redis-based limiters (Upstash in prod, mock in dev) on every endpoint, including a pre-auth IP limiter on login to defeat credential stuffing against unknown emails.
   - **JWT Sessions**: HttpOnly, Secure cookies with 24h expiry; CSRF double-submit tokens on all state-changing endpoints.
   - **Password Re-Authentication**: Account deletion requires the current password — a stolen session cookie alone cannot erase an account.

2. Client-Side Encryption (Zero-Knowledge)
   - **Algorithm**: AES-GCM (256-bit) with PBKDF2 key derivation (100k iterations).
   - **Implementation**: Native Web Crypto API (no external crypto libraries).
   - **Workflow**:
     - Data (forms, notes) is encrypted locally with a per-submission round-trip integrity check.
     - Only `{ ciphertext, salt, iv }` is sent to the server.
     - **Passwords never leave the client**, and are wiped from component state on every exit path.

3. Audit Logging
   - All sensitive events (login, MFA setup/rotation/verification, backup-code generation, consent changes, erasure) are logged with constraint-validated JSONB details.
   - A database `CHECK` constraint whitelists valid event types, and logs survive user erasure via `ON DELETE SET NULL` — the GDPR erasure trail outlives the account.
   - Mutating endpoints are protected by CSRF validation, not header secrets.
   - **No plaintext user data** is ever stored or logged.

4. Privacy-First UX
   - **SecureForm**: Encrypted contact form with memory clearing on success/error/unmount; encryption password never transmitted.
   - **ConsentBanner**:
     - **Local Storage**: Stores consent flags as **plain JSON** for immediate UX responsiveness (non-sensitive data).
     - **Server Record**: Persists consent history (append-only rows) for legal proof of consent (GDPR Art. 7).
     - **Rollback Mechanism**: If server sync fails, local state reverts to ensure consistency.
     - **Fail-Open Collection**: If the consent check fails, the banner always shows — consent is never silently suppressed.
   - **UserSettings**: Manage MFA, regenerate backup codes, and account erasure (password-confirmed, type-to-confirm UI).
   - **DeleteAccountForm**: Destructive-action guard requiring a typed confirmation phrase before submission.

5. Product Management Hub
   - Includes version-controlled documentation artifacts (`docs/`) for roadmaps, regulatory matrices, stakeholder maps, privacy policies, DPIA reports, and risk registers.
   - Scripts to auto-generate documentation from source code.

> 💡 **Tip**: A quick-reference checklist is provided in [`VERIFY_CHECKLIST.md`](VERIFY_CHECKLIST.md). It covers repository sanity, CI validation, dependency hygiene, security verification, and smoke-test steps. Teams are encouraged to run through it before any release.

---

### Getting Started Locally

#### Prerequisites
- **Node.js 20+** (Required for CI and local development).
- **PostgreSQL** (Local or Cloud).
- **Redis** (Optional for local dev; Upstash used in production).
- **Netlify CLI** (Optional, for local function testing).
- **GitHub CLI** (Optional, for quick PR checks).

#### Installation
```bash
# 1. Clone the repository
git clone https://github.com/sumanjangili/secure-web-product.git
cd secure-web-product

# 2. Install Frontend Dependencies
cd frontend
npm ci

# 3. Install Backend Dependencies (Functions)
cd ../netlify/functions
npm ci
cd ../..
```

#### Local Development
You must run two servers simultaneously:

```bash
Terminal 1: Frontend (Vite)
cd frontend
npm run dev
# Runs on http://localhost:5173

Terminal 2: Backend (Netlify Functions)
# Ensure your .env file is in the root directory
netlify functions:serve
# Runs on http://localhost:9999
```

---

### Scripts
#### Frontend (cd frontend)

| Command | Description |
| :--- | :--- |
| npm run dev | Starts the Vite dev server (http://localhost:5173). |
| npm run build | Builds the production bundle and generates CSP headers. |
| npm run preview | Locally previews the production build. |
| npm run lint | Runs ESLint to check code quality. |
| npm run lint:fix | Automatically fixes linting errors. |
| npm run type-check | Verifies TypeScript types (tsc --noEmit). |
| npm run test | Runs unit tests with Vitest. |
| npm run test:coverage | Runs tests with coverage report. |
| npm run format | Formats code with Prettier. |
| npm run audit | Runs npm audit to check for vulnerabilities. |

#### Backend (cd netlify/functions)

| Command | Description |
| :--- | :--- |
| netlify functions:serve | Start local functions server (http://localhost:9999) |
| npm run build | (Optional) Pre-bundle functions if needed |

---

### Deploying to Netlify

This project is designed to be deployed on Netlify.

1. Connect Repository — connect your GitHub repository to Netlify.
   
2. Build Settings
   
| Setting | Value |
| :--- | :--- |
| Base Directory | frontend |
| Build Command | npm run build |
| Publish Directory | frontend/dist |
| Functions Directory | netlify/functions (Auto-detected or set in netlify.toml) |

3. Environment Variables
> Settings → Build & Deploy → Environment and a all required secrets.
   
> ⚠ **Security Warning**: Never commit secrets (like AUDIT_SECRET) to the repsitory. Use Netlify's environment variable management. 

4. **Deploy**: Push to the main branch.
**Cookie Contract (Important)**

login.js, logout.js, and delete-user.js share a single cookie contract: cookies set with Domain=.indoscient.in and SameSite=None; Secure in production must be deleted with the exact same attributes. If you change one file's cookie building, change all three in the same commit — attribute mismatches are the classic cause of "still logged in after logout" bugs.

---

### CI & Security Pipeline

The workflow defined in `.github/workflows/ci.yml` runs on every push and pull request to `main` and develop:

- **Frontend** – lint (`eslint`), unit tests (`vitest`), Vite build.  
- **Backend (Netlify functions)** – separate lint and dependency audit.  
- **Security Audits** – `npm audit --audit-level=high` flags high‑severity vulnerabilities.  
- **Optional SonarCloud** – static analysis and quality gate (requires a `SONAR_TOKEN` secret).

> **If any step fails** (e.g., a high‑severity vulnerability), the job aborts and the merge is blocked.

#### Workflow Summary
- **Triggers**: `push` and `pull_request` on `main` and `dev`. 
- **Jobs**: `lint`, `type-check`, `test`, `build`, `security-audit`, `deploy` (Netlify). 
- **Caching**: `actions/cache@v3` for `node_modules` and lockfiles. 
- **Fail‑fast**: each step aborts on error, preventing merges with broken builds.

--- 

### Product-Management Documents

All artefacts live under `docs/` and are version‑controlled alongside the code.

| Document | Purpose |
| :--- | :--- |
| `docs/roadmap.md` | Quarterly product roadmap with features, compliance milestones, and success metrics. |
| `docs/regulatory-matrix.md` | Live checklist mapping GDPR, CCPA, ISO 27701, etc., to implemented features. |
| `docs/stakeholder-map.md` | Roles, responsibilities, and deliverables for PM, Engineering, UX, Legal, Security, Ops. |
| `docs/privacy-policy.md` |  Transparent Information on data handling, consent storage, and user rights. |
| `docs/dpia-report.md` | Neutralizes the primary risk of data exposure. |
| `docs/risk-register.md` | Comprehensive risk assessment and mitigation strategies. |

> *Use these during sprint planning, stakeholder demos, and compliance reviews.*

---

### Testing Locally
 - **Unit Tests**: `npm test` (executes Vitest). 
 - **Linting**: `npm run lint` (Runs ESLint + Prettier).
 - **Type Checking**: `npm run type-check` (Runs tsc --noEmit).
 - **Security Audit**: `npm run security` (Runs npm audit and custom checks). 
> **Coverage Goal**: Aim for ≥80% coverage on critical modules (e.g., crypto.ts, ConsentManager.ts, UI components). Add --coverage to the test command to generate a report.

---

### Extending the Template

- **Add more Netlify functions**: drop additional files under `netlify/functions/`. Reuse the shared middleware (_middleware/csrf-check, _middleware/require-mfa) and the origin allowlist pattern.  
- **Swap Vite**: Update package.json scripts and CI build step if using another bundler.  
- **Persist audit logs**: integrate Netlify KV, or another datastore.  
- **Enable SonarCloud**: add the `SONAR_TOKEN` secret and uncomment the `sonarcloud` job.  
- **Make MFA mandatory**: switch requireMFAIfEnrolled to the strict requireMFA gate in sensitive endpoints, and force enrollment in the login flow.
- **Add extra compliance checks**: extend `regulatory-matrix.md` and create automated tests for them.

- See our [CONTRIBUTING.md](CONTRIBUTING.md) for how to submit PRs, run the CI locally, and sign the CLA.

---

### Verification checklist 

Before deploying to production:

- AUDIT_SECRET is set in Netlify env vars.
- DATABASE_URL points to production DB.
- JWT_SECRET is set and rotated from the default.
- ADMIN_USER_IDS contains valid admin UUIDs.
- UPSTASH credentials are set for Redis.
- No plaintext data is logged to console.

---

#### Database

- chk_event_type_valid constraint includes every event type emitted by the code (LOGIN_, ERASURE_, CONSENT_UPDATED, MFA_, BACKUP_CODES_, SECURE_TICKET_CREATED, DATA_ACCESS_GRANTED).
- audit_logs.user_id FK uses ON DELETE SET NULL (erasure trail survives account deletion).
- consent_records uses the append-only model (no unique constraint on user_id; plain INSERT, newest-wins reads).


#### Flows (end-to-end)

- Login → MFA (Init → Verify → Login) works; mfaVerified claim is issued only after verification.
- MFA-enabled user who skips MFA gets 403 (requiresMFA) on sensitive endpoints; non-MFA users are unaffected.
- First-time MFA enrollment is NOT blocked by the MFA middleware.
- Backup codes are 12 hex characters and redeemable at login.
- Logout actually clears auth_token and csrf_token (cookie attributes match login exactly — verify in DevTools).
- Account erasure requires password re-confirmation, clears both cookies, and audit rows survive with user_id = NULL.
- Consent flow: banner appears for users with no record; local storage is plain JSON; server record persists via plain INSERT (no ON CONFLICT); rollback works when the save fails.

#### Supply chain

- npm audit shows no critical or high vulnerabilities.

> Run through the automated checklist before any release: 👉 [Verification checklist → VERIFY_CHECKLIST.md](VERIFY_CHECKLIST.md)

---

### Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on:

- How to submit PRs.
- Running the CI locally.
- Signing the CLA.

---

### License

This project is released under the **MIT License** – feel free to fork, modify, and ship your own privacy‑first audit logging solution product.

---

> This project now accurately reflects **production-ready, secure, and functional** system aligned with GDPR and security best practices.

---



