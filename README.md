[![Sponsor me on GitHub](https://img.shields.io/badge/Sponsor-💖-orange)](https://github.com/sponsors/sumanjangili)  
[![Ko‑fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/G2G21S383T)  
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/sumanjangili/secure-web-product/blob/main/LICENSE)  
![Version](https://img.shields.io/github/v/tag/sumanjangili/secure-web-product?label=version)
[![Node.js ≥20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

## Secure Web Product Starter Kit

> **Privacy-First Audit Logging Solution**  
> A production-ready template for building privacy-first web applications that demonstrate a secure product vision, keep engineering aligned, and integrate CI security checks.

This repository maintains **product management artifacts** and serves as a **privacy-first audit logging solution**. It includes:

* 📄 **Product Management Artifacts**: Roadmap, regulatory matrix, stakeholder map.
* 🗂️ **React Frontend**: Built with Vite, TypeScript, and ESLint.
* 🔐 **End-to-End Encryption**: All cryptographic operations happen in the browser using `libsodium-wrappers`.
* 🛡️ **Immutable Audit Logs**: Netlify functions receive only encrypted blobs and write to an immutable log.
* 👷‍♀️ **CI/CD Pipeline**: GitHub Actions for linting, testing, building, and security audits.

> **Security Note**: No plaintext data ever leaves the client. The Netlify function only receives already-encrypted blobs. Review `netlify/functions/audit-log.js` for input sanitization and secret handling.

Clone, set the required Netlify env vars, push to GitHub, and Netlify will build & deploy a live demo at [https://securewebproducts.netlify.app](https://securewebproducts.netlify.app).

---

### Table of Contents

1. [Project Overview & Goals](#project-overview--goals)
2. [Getting Started Locally](#getting-started-locally)
3. [Deploying to Netlify](#deploying-to-netlify)
4. [CI & Security Pipeline](#ci--security-pipeline)
5. [Product Management Documents](#product-management-documents)
6. [Testing Locally](#testing-locally)
7. [Extending the Template](#extending-the-template)
8. [Verification Checklist](#verification-checklist)
9. [Contributing](#contributing)
10. [License](#license)

---

### Project Overview & Goals

**Secure Web Products** is a privacy-first demo application built to showcase:

| Goal | Why it matters |
| :--- | :--- |
| **Privacy-First UX** | All data is encrypted client-side; no telemetry is collected. |
| **Transparent Architecture** | Front-end talks only to a Netlify serverless function that writes to an immutable log (e.g., Cloudflare KV or AWS S3). |
| **Open Collaboration** | Clear contribution guidelines and a welcoming community space. |

The repo is deliberately minimal so newcomers can focus on the core concepts without being distracted by unrelated tooling.

> 💡 **Tip**: A quick-reference checklist is provided in [`VERIFY_CHECKLIST.md`](VERIFY_CHECKLIST.md). It covers repository sanity, CI validation, dependency hygiene, security verification, and smoke-test steps. Teams are encouraged to run through it before any release.

---

### Getting Started Locally

#### Prerequisites
* **Node.js 20+** (Required for CI and local development).
* **npm** (or `pnpm`/`yarn`).
* **Netlify CLI** (Optional, for local function testing).
* **GitHub CLI** (Optional, for quick PR checks).

#### Installation
```bash
git clone https://github.com/sumanjangili/secure-web-product.git
cd secure-web-product/frontend
npm ci
```    
#### Generate a Sodium key pair (local testing)
Run this command to generate your encryption keys:
```js
  node -e "
const sodium = require('libsodium-wrappers');
(async () => {
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  console.log('PUBLIC:', sodium.to_base64(kp.publicKey));
  console.log('PRIVATE:', sodium.to_base64(kp.privateKey));
})();
"
```
Copy the printed keys into a local .env file:
```js 
VITE_SERVER_PUB_KEY=<base64-public-key>
SERVER_PRIV_KEY=<base64-private-key>
VITE_API_URL=http://localhost:8888
VITE_AUDIT_LOG_ENDPOINT=/api/audit-log
``` 
> **⚠️ Important:** In production, these variables belong in Netlify's Build & Deploy → Environment settings, not in source control.

#### Run the development server
```bash
npm run dev
```
Open http://localhost:5173 – you should see the demo UI with a consent banner and an encrypted form.

---

### Deploying to Netlify

1. **Create a Netlify site** (the free tier works fine).  
2. **Connect the site** to this GitHub repository.  

#### Configure build settings

| Setting | Value |
| :--- | :--- |
| **Base Directory** | frontend |
| **Build command** | `npm run build` |
| **Publish directory** | frontend/dist |

#### Add environment variables  
*(Settings → Build & Deploy → Environment and add)*

| Variable | Description |
| :--- | :--- |
| `SERVER_PRIV_KEY` | Base64-encoded private key for the function. |
| `VITE_SERVER_PUB_KEY` | Base64‑encoded public key (exposed to front‑end). |
| `VITE_API_URL` | API endpoint used by the front‑end (if any). |
| `VITE_AUDIT_LOG_ENDPOINT` | Endpoint for the audit log function. |

3. **Push a commit** – Netlify will trigger the CI pipeline, build the front‑end, and publish the site at [https://securewebproducts.netlify.app](https://securewebproducts.netlify.app).

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
| `scripsts/generate-docs.ts` | Generates up‑to‑date markdown from source data (`npm run gen-docs`). |

> *Use these during sprint planning, stakeholder demos, and compliance reviews.*

---

### Testing Locally
 - **Unit Tests**: `npm test` (executes Vitest). 
 - **Linting**: `npm run lint` (Runs ESLint + Prettier).
 - **Type Checking**: `npm run type-check` (Runs tsc --noEmit).
 - **Security Audit**: `npm run security` (Runs npm audit and custom checks). 
> **Coverage Goal**: Aim for ≥80% coverage on critical modules (e.g., crypto.ts, UI components). Add --coverage to the test command to generate a report.

---

### Extending the Template

- **Add more Netlify functions**: drop additional files under `netlify/functions/`.  
- **Swap Vite**: Update package.json scripts and CI build step if using another bundler.  
- **Persist audit logs**: integrate Netlify KV, FaunaDB, Supabase, or another datastore.  
- **Enable SonarCloud**: add the `SONAR_TOKEN` secret and uncomment the `sonarcloud` job.  
- **Add extra compliance checks**: extend `regulatory-matrix.md` and create automated tests for them.

- See our [CONTRIBUTING.md](CONTRIBUTING.md) for how to submit PRs, run the CI locally, and sign the CLA.

---

### Verification checklist 

Run through the automated checklist before any release: 👉 [Verification checklist → VERIFY_CHECKLIST.md](VERIFY_CHECKLIST.md)

---

### Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on:

- How to submit PRs.
- Running the CI locally.
- Signing the CLA.

---

### License

This starter kit is released under the **MIT License** – feel free to fork, modify, and ship your own privacy‑first audit logging solution product.

