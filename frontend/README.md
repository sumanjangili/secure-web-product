# Secure Web Product — Frontend

Client application for the Secure Web Product platform. Built with React +
TypeScript + Vite, with a security-first architecture: zero-trust session
handling, strict Content-Security-Policy with per-build nonces, and client-side
crypto implemented exclusively with the platform Web Crypto API.

---

### Table of Contents

1. [Quick Start](#quick-start)
2. [Core Features](#core-features)
3. [Configuration](#configuration)
4. [Scripts](#scripts)
5. [Cryptography Details](#cryptography-details)
6. [Project Structure](#project-structure)
7. [Deployment to Netlify](#deployment-to-netlify)
8. [Verification Checklist](#verification-checklist)
9. [Contributing](#contributing)
10. [License](#license)

---

### Quick Start

**Prerequisites:** Node.js ≥ 20, PostgreSQL, Redis (optional locally), Netlify CLI.

```bash
git clone https://github.com/sumanjangili/secure-web-product.git
cd secure-web-product/frontend && npm ci

# Backend (separate terminal, repo root):
cd ../netlify/functions && npm ci && cd ../..
netlify functions:serve   # http://localhost:9999

Terminal 1:
cd frontend && npm run dev   # http://localhost:5173
```
> Important: Ensure the root .env contains DATABASE_URL, JWT_SECRET.

---

### Core Features

- **Secure Authentication & MFA** — Argon2 password hashing (server-side), optional TOTP MFA with 12-char one-time backup codes, atomic Redis rate limiting with client-side Retry-After countdowns, HttpOnly JWT cookie sessions (24h).
- **Client-Side Encryption (Zero-Knowledge)** — AES-GCM 256 + PBKDF2 (100k iterations) via native Web Crypto. Only { ciphertext, salt, iv } is transmitted; the encryption password never leaves the browser and is wiped from React state on every exit path.
- **Privacy-First UX** — encrypted contact form (SecureForm), consent banner with rollback + fail-open collection, password-reconfirmed account deletion with type-to-confirm guard, lockout-aware login flow.
- **Audit Trail** — all sensitive events are logged server-side (append-only reads; erasure records survive account deletion via ON DELETE SET NULL). CSRF double-submit protects mutating requests.

---

### Configuration

Root .env(secure-web-product/.env):

- **VITE_SECURE_FETCH_DEBUG=**false # "true" enables verbose crypto error logging (dev only)
- **VITE_API_URL** is auto-detected via the /api/* proxy in netlify.toml.

---

### SCRIPTS

| Command | Description |
| :--- | :--- |
| npm run dev | Vite dev server (http://localhost:5173). |
| npm run build | Type-check + production bundle + CSP header generation. |
| npm run preview | Previews the production build. |
| npm run lint:fix | ESLint(+ auto-fix). |
| npm run type-check | Verifies TypeScript types (tsc --noEmit). |
| npm run test/test:coverage | Vitest |
| npm run format | Prettier |
| npm run gen-docs | Generates markdown docs from source. |
| npm run audit | Runs npm audit to check for vulnerabilities. |

---

### Cryptography Details

The src/lib/crypto.ts module handles all security operations:

1. **Key Derivation** — PBKDF2-SHA-256, 100,000 iterations, random 16-byte salt.
2. **Encryption** — AES-GCM 256 with a random 12-byte IV.
3. **Integrity** — every submission is decrypted-and-compared locally before any network request; mismatches abort the upload.
4. **Output** — { ciphertext, salt, iv }, all Base64.

> **Security practices:** secrets cleared from state on success/error/unmount, **VITE_SECURE_FETCH_DEBUG**-gated logging, no secrets exposed to the bundle.

---

### Project Structure

```txt
src/
├── components/        # React components (auth, MFA, settings, consent)
│   └── __tests__/     # Co-located Vitest suites
├── lib/               # Shared utilities (fetch-helper, consent-manager, crypto)
└── hooks/             # React hooks (useAnalytics, …)
scripts/
└── generate-csp.cjs   # Build-time CSP/nonce generation
```

---

### Deployment to Netlify

| Setting | Value |
| :--- | :--- |
| Base Directory | frontend |
| Build Command | npm run build |
| Publish Directory | frontend/dist |
| Functions Directory | netlify/functions (Auto-detected) |

> Set environment variables in **Site settings →Environment variables.**
> ⚠Never commit secrets or .env files. Configure them in Netlify's env-var management.

---

### Verification Checklist (Pre-Deploy)
- **VITE_SECURE_FETCH_DEBUG**=false in production
- Login → MFA (init → verify) works end-to-end; backup codes are 12 chars and redeemable.
- Logout clears auth_token/csrf_token (verify in DevTools — cookie attributes must match login).
- Consent banner shows for new users; saves persist; rollback works offline.
- Account deletion requires password + typed confirmation; cookies cleared; audit rows survive.
- No plaintext secrets in console logs.
- npm audit shows no high/critical vulnerabilities.

> See [VERIFY_CHECKLIST.md](VERIFY_CHECKLIST.md) for the full list.

---

### Contributing

1. Fork → feature branch (feat/awesome-feature).
2. npm test && npm run lint && npm run type-check must pass.
3. Update CHANGELOG.md and docs for new components/endpoints.
4. Open a PR against main.

---

### License

**MIT** — see **LICENSE** file.

---

#### What Changed vs. the Old README

| Change | Why |
| :--- | :--- |
| Removed x-audit-secret claim and "no update/delete permissions" immutability claim | Neither exists in the code — CSRF double-submit is the real request-validation model |
| "Encrypted server consent record" → plain consent persistence | save-consent.js stores plain booleans; zero-knowledge applies to secure_data only |
| Removed "password hashed client-side" sentence | False — passwords are sent to /login over TLS and hashed server-side; the encryption password is the client-only one |
| Project structure updated | Added fetch-helper.ts, consent-manager.ts, DeleteAccountForm.tsx (the files we built), fixed the broken tree glyphs |
| Kept short | The deep details (cookie contract, DB constraints, middleware) live in the root README, so they're not duplicated here

> Both type fixes should get npm run build green; if any other {}-typed spots surface in ConsentBanner or SecureForm, the getErrorMessage helper from fetch-helper.ts covers those too.

___

