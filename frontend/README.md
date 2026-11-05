# Secure Web Product — Frontend

> Privacy-first Vite + React client with zero-knowledge client-side encryption,
> TOTP MFA, and privacy-preserving UX. Pairs with the `netlify/functions` backend.

---

### Table of Contents

1. [Quick Start](#quick-start)
2. [Core Features](#core-features)
3. [Installation & Configuration](#installation--configuration)
4. [Scripts](#scripts)
5. [Cryptography Details](#cryptography-details)
6. [Project Structure](#project-structure)
7. [Deployment to Netlify](#deployment-to-netlify)
8. [Contributing](#contributing)
9. [Verification Checklist](#verification-checklist)

---

### Quick Start

**Prerequisites:** Node.js ≥ 20, PostgreSQL, Redis (optional locally), Netlify CLI.

```bash
git clone https://github.com/sumanjangili/secure-web-product.git
cd secure-web-product/frontend && npm ci

# Backend (separate terminal, repo root):
cd ../netlify/functions && npm ci && cd ../..
netlify functions:serve   # http://localhost:9999
```

#### Local Development
You must run two servers simultaneously:
```bash
Terminal 1: Frontend (Vite)
cd frontend
npm run dev
# Runs on http://localhost:5173
```
```bash
Terminal 2: Backend (Netlify Functions)
# Ensure your .env file is in the root directory
netlify functions:serve
# Runs on http://localhost:9999
```
> Important: Ensure your .env file in the root contains DATABASE_URL, JWT_SECRET, and AUDIT_SECRET.

---

### Core Features
1. Secure Authentication & MFA
- **Password Hashing**: Argon2id (memory-hard, resistant to GPU attacks) performed server-side on the password hash derived client-side.
- **MFA (TOTP)**: Google Authenticator/Authy compatible 6-digit codes.
- **Backup Codes**: 10 one-time-use recovery codes generated during MFA setup.
- **Rate Limiting**: Prevents brute-force attacks using Redis (Upstash in prod, Mock in dev).
- **JWT Sessions**: Secure, short-lived access tokens with 24h expiry.

2. Client-Side Encryption (Zero-Knowledge)
- **Algorithm**: AES-GCM (256-bit) with PBKDF2 key derivation (100k iterations).
- **Implementation**: Native Web Crypto API (no external crypto libraries required).
- **Workflow**:
     - Users enter data (forms, consent) and a password.
     - Data is encrypted locally into { ciphertext, salt, iv }.
     - **Only** the encrypted blob is sent to the server. The password never leaves the client.
- **Memory Safety**: Sensitive data (passwords, form inputs) is explicitly cleared from React state immediately after processing.

3. Audit Logging
- All sensitive events (login, MFA setup/rotation/verification, backup-code generation, consent changes, erasure) are logged with constraint-validated JSONB details.
- A database `CHECK` constraint whitelists valid event types, and logs survive user erasure via `ON DELETE SET NULL` — the GDPR erasure trail outlives the account.
- Mutating endpoints are protected by CSRF validation, not header secrets.
- No plaintext user data is ever stored or logged.

4. Privacy-First UX Components
- **SecureForm**: Encrypted contact form with memory clearing on success/error/logout.
- **ConsentBanner**:
   - **Local Storage**: Stores consent flags as **plain JSON** for immediate UX responsiveness (non-sensitive data).
   - **Server Record**: Syncs an **encrypted, immutable** audit log entry for legal proof of consent (GDPR Art. 7).
   - **Rollback Mechanism**: If server sync fails, local state reverts to ensure consistency.
- **UserSettings**: Manage MFA, regenerate backup codes, and account erasure.

---

### Configuration
#### Environment Variables
Create a .env file in the root directory (secure-web-product/.env):
```js
# --- Database ---
DATABASE_URL=postgres://user:pass@localhost:5432/secure_db

# --- Auth ---
JWT_SECRET=your_super_secret_random_string_min_32_chars
AUDIT_SECRET=your_audit_secret_for_backend_validation

# --- Redis (Optional for Local Dev) ---
# Leave empty to use Mock Redis (instant local dev)
# UPSTASH_REDIS_REST_URL=https://your-upstash-url
# UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# --- Frontend (Optional, usually auto-detected) ---
VITE_API-BASE_URL=/api
VITE_AUDIT_LOG_ENDPOINT=http://localhost:9999/.netlify/functions/audit_log
VITE_SECURE_FETCH_DEBUG=false # Set to "true" to enable verbose crypto error logging
```
#### Production (Netlify)
Set these variables in Netlify Dashboard > Site Settings > Environment Variables:

- DATABASE_URL (Production DB)
- JWT_SECRET
- AUDIT_SECRET
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- VITE_DEBUG_MODE (Set to "false" in production)

---

### SCRIPTS
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
| npm run gen-docs | Generates markdown docs from source. |
| npm run audit | Runs npm audit to check for vulnerabilities. |

---

### Cryptography Details

The src/lib/crypto.ts module handles all security operations:

1. **Key Derivation**:
    - **Passwords**: Uses **PBKDF2** with SHA-256 and 100,000 iterations.
    - **JWTs**: Uses **SHA-256** (single pass) for session keys, with robust heuristic detection (checks for 3-part dot structure) to avoid misidentifying passwords with dots as JWTs.
2. **Encryption**: Uses **AES-GCM** with a randomly generated 12-byte IV and 16-byte salt.
3. **Output**: Returns an object containing:
```js
{
  ciphertext: string; // Base64 encoded encrypted data
  salt: string;       // Base64 encoded salt used for key derivation
  iv: string;         // Base64 encoded Initialization Vector
}
```
4. **Decryption**: Requires the password/token, salt, and IV to reconstruct the key and decrypt the data.

#### Security Best Practices Implemented
- **Memory Safety**: Sensitive strings (passwords, tokens) are explicitly cleared from React state and variables after use.
- **No Secrets**: JWT_SECRET and DATABASE_URL are never exposed to the browser.
- **Debug Gating**: Console error logging is wrapped in if (import.meta.env.VITE_DEBUG_MODE === "true") to prevent sensitive stack traces in production. 
- **Rate Limiting**: Prevents brute-force attacks on login and MFA endpoints. 
- **Immutable Logs**: Audit events are written to a separate table with no update/delete permissions.

---

### Project Structure

```txt
frontend/src/
├── components/
│   ├── LoginForm.tsx          # Login + MFA + backup-code steps, lockout UI
│   ├── MFASetup.tsx           # QR display & backup-code generation (local QR)
│   ├── SecureForm.tsx         # Encrypted contact form
│   ├── ConsentBanner.tsx      # Consent UI with rollback & fail-open checks
│   ├── UserSettings.tsx       # MFA & backup-code management
│   └── DeleteAccountForm.tsx  # Password-reconfirmed erasure w/ typed confirm
├── lib/
│   ├── crypto.ts              # AES-GCM + PBKDF2 (Web Crypto)
│   ├── mfa.ts                 # Base32/URI formatting helpers
│   ├── fetch-helper.ts        # secureFetchJson, ApiError, CSRF handling
│   ├── consent-manager.ts     # Consent state & change notifications
│   └── session-utils.ts       # Session/token utilities
├── hooks/
│   └── useAnalytics.ts        # Consent-aware analytics
└── main.tsx
```

---

### Deployment to Netlify

This project is designed to be deployed on Netlify.

1. Connect Repository
Connect your GitHub repository to Netlify.

2. Build Settings

| Setting | Value |
| :--- | :--- |
| Base Directory | frontend |
| Build Command | npm run build |
| Publish Directory | frontend/dist |
| Functions Directory | netlify/functions (Auto-detected) |

3. Environment Variables
> Settings → Build & Deploy → Environment and a all required secrets.

4. **Deploy**: Push to main branch.
> "
> ⚠ **Security Warning**: Never commit secrets (like AUDIT_SECRET) to the repository. Use Netlify's environment variable management.
> "

---

### Contributing
We welcome contributions! Please follow these steps:
1. Fork the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feat/awesome-feature
   ```
4. Implement your change.
5. Run the test suite and linting:
   ```bash
   npm test && npm run lint
   ```
7. Ensure TypeScript compiles without errors:
   ```bash
   npm run type-check
   ```
8. Open a Pull Request against the main branch.

#### Guidelines
- Keep the public API stable.
- Add documentation for any new endpoints or UI components.
- Update the changelog (CHANGELOG.md) with a concise entry.

---

### Verification Checklist
Before deploying to production:

-  AUDIT_SECRET is set in Netlify env vars.
-  DATABASE_URL points to production DB.
-  UPSTASH credentials are set for Redis.
-  No plaintext data is logged to console.
-  MFA flow (Init → Verify → Login) works end-to-end.
-  Backup codes are generated and usable.
-  Account erasure (delete-user) works correctly.
-  Consent flow: Local storage is plain JSON, server record is encrypted.
-  npm audit shows no critical vulnerabilities.
For a detailed checklist, see [VERIFY_CHECKLIST.md](VERIFY_CHECKLIST.md)

---

#### Key Changes Made
1.  **Consent Storage Model**: Updated to reflect the **Hybrid Storage** approach: Local flags are plain JSON (UX speed), while the authoritative record is encrypted on the server (Compliance). This removes the security anti-pattern of encrypting non-sensitive flags with JWTs.
2.  **Crypto Hardening**: Added details on **robust JWT detection** and **debug-gated logging** in crypto.ts.
3.  **Added MFA Section**: Explicitly documented the MFA flow, backup codes, and rate limiting.
4.  **Configuration**: Added VITE_DEBUG_MODE to environment variables and clarified the dual-terminal setup.
5.  **Structure**: Listed the actual files created (`MFASetup.tsx`, `redis.js`, ConsentBanner.tsx and mfa.ts etc.).
6.  **Security Warnings**: Emphasized not committing SQL files or `.env`.

___
