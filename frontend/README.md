## Secure Web Product

> "
> **A Privacy-First, Product Management, Zero-Knowledge Authentication & Audit Hub**.  
> A production-ready Vite + React frontend demonstrating end-to-end client-side encryption, secure MFA flows, and privacy-preserving UX patterns backed by Netlify Serverless Functions.
> "
> This application implements a **zero-knowledge architecture** where sensitive data is encrypted in the browser before transmission. It features a complete authentication system with **TOTP-based MFA**, **backup codes**, and **immutable audit logging**.

This frontend is the client component of the Secure Web Product ecosystem.

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
9. [License](#license)
10. [Verification Checklist](#verification-checklist)

---

### Quick Start
#### Prerequisites
- **Node.js** ≥ 20.x
- **PostgreSQL** (local or cloud)
- **Redis** (optional for local dev; Upstash used in production)
- **Netlify CLI** (for local function testing)

```bash
# 1. Clone the repository
git clone https://github.com/sumanjangili/secure-web-product.git
cd secure-web-product

# 2. Install dependencies
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
```
```bash
Terminal 2: Backend (Netlify Functions)
# Ensure your .env file is in the root directory
netlify functions:serve
# Runs on http://localhost:9999
```
> Note: Ensure your .env file in the root contains DATABASE_URL, JWT_SECRET, and AUDIT_SECRET.

---

### Core Features
1. Secure Authentication & MFA
- **Password Hashing**: Argon2id (memory-hard, resistant to GPU attacks).
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

3. Immutable Audit Logging Integration
- All authentication events (Login, MFA, Logout, Erasure) are logged to an immutable database.
- Backend validates requests via x-audit-secret header.
- No plaintext user data is ever stored or logged.

4. Privacy-First UX Components
- **SecureForm**: Encrypted contact form with memory clearing.
- **ConsentBanner**: Encrypted consent storage in localStorage.
- **UserSettings**: Manage MFA, regenerate backup codes, and account erasure.

5. Product Management Hub
- Includes version-controlled documentation artifacts (docs/) for roadmaps, regulatory matrices, and stakeholder maps.
- Scripts to auto-generate documentation from source code.

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
VITE_API_URL=http://localhost:9999/.netlify/functions
VITE_AUDIT_LOG_ENDPOINT=http://localhost:9999/.netlify/functions/audit_log
```
#### Production (Netlify)
Set these variables in Netlify Dashboard > Site Settings > Environment Variables:

- DATABASE_URL (Production DB)
- JWT_SECRET
- AUDIT_SECRET
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN

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
| npm run encrypt-demo | Runs a standalone script to test encryption logic. |
| npm run audit | Runs npm audit to check for vulnerabilities. |
| netlify functions:serve | Start local functions server (http://localhost:9999) |

---

### Cryptography Details

The src/lib/crypto.ts module handles all security operations:

1. **Key Derivation**: Uses **PBKDF2** with SHA-256 and 100,000 iterations to derive a key from the user's password.
2. **Encryption**: Uses **AES-GCM** with a randomly generated 12-byte IV and 16-byte salt.
3. **Output**: Returns an object containing:
```js
{
  ciphertext: string; // Base64 encoded encrypted data
  salt: string;       // Base64 encoded salt used for key derivation
  iv: string;         // Base64 encoded Initialization Vector
}
```
4. **Decryption**: Requires the password, salt, and IV to reconstruct the key and decrypt the data.

#### Security Best Practices Implemented
- **Memory Safety**: Sensitive strings (passwords, tokens) are explicitly cleared from React state and variables after use.
- **No Secrets**:  JWT_SECRET and DATABASE_URL are never exposed to the browser.
- **Rate Limiting**: Prevents brute-force attacks on login and MFA endpoints. 
- **Immutable Logs**: Audit events are written to a separate table with no update/delete permissions.

---

### Project Structure
```js
secure-web-product/
├── frontend/                 # Vite + React Application
│   ├── src/
│   │  ├── components/
│   │  │   ├── LoginForm.tsx      # Login & MFA entry
│    │    ├── MFASetup.tsx       # QR Code & Backup Code generation
│   │  │   ├── SecureForm.tsx     # Encrypted contact form
│   │    └── UserSettings.tsx   # Profile & MFA management
│    │ ├── lib/
│   │   │   ├── crypto.ts          # AES-GCM + PBKDF2 implementation
│   │   │   ├── mfa.ts             # TOTP logic (client-side)
│   │   │   └── session-utils.ts   # Token storage & validation
│   │  ├── hooks/
│   │   │   └── useAnalytics.ts    # Privacy-safe analytics
│   │   └── main.tsx
│   ├── netlify/
│   │   └── functions/             # (Shared) Backend functions
│   └── package.json
├── netlify/functions/        # Serverless Functions (Node.js)
│   ├── lib/
│   │   └── redis.js           # Hybrid Upstash/Mock Redis client
│   ├── login.js               # Auth & Rate Limiting
│   ├── verify-mfa.js          # MFA Code Verification
│   ├── mfa-setup-init.js      # Generate Secret & QR
│   ├── mfa-setup-verify.js    # Enable MFA & Gen Backup Codes
│   ├─save-secure-data.js    # Store Encrypted Blobs
│   ├── delete-user.js         # Account Erasure (GDPR)
│   └─audit_log.js           # Immutable Log Writer
├─docs/                     # Regulatory & Product Docs
├── .env                      # (GitIgnored) Local Environment Vars
├── netlify.toml              # Deployment Config
└── package.json

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
| Functions Directory | netlify/functions (Auto-detected or set in netlify.toml) |

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

### License
MIT © Suman Jangili. See the LICENSE file for full terms.

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
-  npm audit shows no critical vulnerabilities.
For a detailed checklist, see [VERIFY_CHECKLIST.md](VERIFY_CHECKLIST.md)

---

#### Key Changes Made
1.  **Removed `npm publish`**: This is an app, not a library. Publishing it would break the build process and expose secrets.
2.  **Updated "Quick Start"**: Added the dual-terminal requirement (`netlify functions:serve` + `npm run dev`).
3.  **Added MFA Section**: Explicitly documented the MFA flow, backup codes, and rate limiting.
4.  **Fixed Environment Variables**: Added `JWT_SECRET` and `DATABASE_URL` which are critical for the new functions.
5.  **Corrected Project Structure**: Listed the actual files you created (`MFASetup.tsx`, `redis.js`, etc.).
6.  **Security Warnings**: Emphasized not committing SQL files or `.env`.

___
