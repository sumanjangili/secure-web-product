
[![Sponsor me on GitHub](https://img.shields.io/badge/Sponsor-💖-orange)](https://github.com/sponsors/sumanjangili)  
[![Ko‑fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/G2G21S383T)  
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/sumanjangili/secure-web-product/blob/main/LICENSE)  
[![Node.js ≥20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

# Secure Web Product Starter Kit

"Secure Web Product maintains **product management artifacts** and serves as a **privacy-first audit logging solution**, offering a production-ready template for building privacy-first web applications that demonstrate a secure product vision, keep engineering aligned and integrate CI security checks.” The repo contains:

* 📄 Product‑management artefacts (roadmap, regulatory matrix, stakeholder map)  
* 🗂️ A React front‑end built with Vite  
* 🔐 End‑to‑end encryption utilities (`libsodium-wrappers`)  
* ⚙️ Netlify serverless function for an immutable audit‑log  
* 👷‍♀️ GitHub Actions workflow that lints, tests, builds, and runs security audits  

> **TL;DR** – Clone, set the required Netlify env vars, push to GitHub, and Netlify will build & deploy a live demo at `https://securewebproducts.netlify.app`.

---

## Table of Contents

1. [Project Overview & Goals](#project-overview--goals)  
2. [Getting Started Locally](#getting-started-locally)  
3. [Deploying to Netlify](#deploying-to-netlify)  
4. [CI & Security Pipeline](#ci--security-pipeline)  
5. [Product‑Management Documents](#product-management-documents)  
6. [Extending the Template](#extending-the-template)  
7. [License](#license)  

---

## Project Overview & Goals

Secure Web Products is a **privacy‑first** demo application built to showcase:

| Goal                     | Why it matters |
|--------------------------|----------------|
| **Privacy‑first UX**     | All data is encrypted client‑side; no telemetry is collected. |
| **Transparent architecture** | Front‑end talks only to a Netlify serverless function that writes to an immutable log (e.g., Cloudflare KV or AWS S3). |
| **CI security hardening**| Every commit runs static analysis, dependency scanning, and a custom security script (`npm run security`). |
| **Open collaboration**   | Clear contribution guidelines and a welcoming community space. |

The repo is deliberately minimal so newcomers can focus on the core concepts without being distracted by unrelated tooling.

---

## Getting Started Locally

### Prerequisites

* **Node 20** (or newer) – the CI workflow uses `setup-node@v3`.  
* **npm / pnpm / yarn** – whichever you prefer for installing dependencies.  
* **libsodium‑wrappers** – bundled via npm; no native compilation needed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sumanjangili/secure-web-product.git

2. Navigate to the project directory:

   cd secure-web-product/frontend

3. Install front‑end dependencies
npm ci   # or `pnpm install` / `yarn install`

### Generate a Sodium key pair (for local testing)

node -e "

  const sodium = require('libsodium-wrappers');
  
  (async () => {
  
    await sodium.ready;
    
    const kp = sodium.crypto\_box\_keypair();
    
    console.log('PUBLIC:', sodium.to\_base64(kp.publicKey));
    
    console.log('PRIVATE:', sodium.to\_base64(kp.privateKey));
    
  })();
  
"

Copy the printed keys into a local .env file:
VITE\_SERVER\_PUB\_KEY=<base64‑public‑key>
SERVER\_PRIV\_KEY=<base64‑private‑key>
Important: In production these variables belong in Netlify’s Build & Deploy → Environment settings, not in source control.

Run the development server
npm run dev
``\`

Open `http://localhost:5173` – you should see the demo UI with a consent banner and an encrypted form.

---

## Deploying to Netlify

1. **Create a Netlify site** (the free tier works fine).  
2. **Connect the site** to this GitHub repository.  

### Configure build settings

| Setting          | Value                         |
|------------------|-------------------------------|
| **Build command**| `npm run build`               |
| **Publish directory** | `dist` (Vite outputs here) |

### Add environment variables  
*(Settings → Build & Deploy → Environment)*

| Variable           | Description                                            |
|--------------------|--------------------------------------------------------|
| `SERVER_PRIV_KEY`  | Base64‑encoded private key for the function             |
| `VITE_SERVER_PUB_KEY` | Base64‑encoded public key (exposed to front‑end)   |

3. **Push a commit** – Netlify will trigger the CI pipeline, build the front‑end, and publish the site at `https://securewebproducts.netlify.app`.

---

## CI & Security Pipeline

The workflow defined in `.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **Frontend** – lint (`eslint`), unit tests (`vitest`), Vite build.  
- **Backend (Netlify functions)** – separate lint and dependency audit.  
- **Security Audits** – `npm audit --audit-level=high` flags high‑severity vulnerabilities.  
- **Optional SonarCloud** – static analysis and quality gate (requires a `SONAR_TOKEN` secret).

> **If any step fails** (e.g., a high‑severity vulnerability), the job aborts and the merge is blocked.

---

## Product-Management Documents

All artefacts live under `docs/` and are version‑controlled alongside the code.

| Document            | Purpose                                                                 |
|---------------------|-------------------------------------------------------------------------|
| `roadmap.md`        | Quarterly product roadmap with features, compliance milestones, and success metrics. |
| `regulatory-matrix.md` | Live checklist mapping GDPR, CCPA, ISO 27701, etc., to implemented features. |
| `stakeholder-map.md`   | Roles, responsibilities, and deliverables for PM, Engineering, UX, Legal, Security, Ops. |

*Use these during sprint planning, stakeholder demos, and compliance reviews.*

---

## Extending the Template

- **Add more Netlify functions** – drop additional files under `netlify/functions/`.  
- **Swap Vite for another bundler** – just update the `package.json` scripts and CI build step.  
- **Persist audit logs** – integrate Netlify KV, FaunaDB, Supabase, or another datastore.  
- **Enable SonarCloud** – add the `SONAR_TOKEN` secret and uncomment the `sonarcloud` job.  
- **Add extra compliance checks** – extend `regulatory-matrix.md` and create automated tests for them.

---

## License

This starter kit is released under the **MIT License** – feel free to fork, modify, and ship your own privacy‑first product.
