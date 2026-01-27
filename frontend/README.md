## Secure Web Product Starter Kit

*A privacy‑first audit‑logging solution that also serves as a product‑management hub*.  
It ships a minimal Vite + React front‑end, a Netlify serverless function for immutable logs, and a set of documentation artefacts (roadmap, regulatory matrix, stakeholder map).

---

### Features

- **Docs** – Version‑controlled product‑management artefacts (`docs/`).
- **Privacy‑first UX** – All data encrypted client‑side; no telemetry collected.
- **Transparent Architecture** – Front‑end talks only to a Netlify serverless function that writes to an immutable log.
- **Minimal Vite‑React UI** – Demonstrates privacy‑first components, client‑side cryptography, and audit‑log integration.

---

### Installation
Add the package to any Node project from npm:
```bash
npm install @suman-jangili/secure-web-product
```
**OR** using the shorthand
```bash
npm i @suman-jangili/secure-web-product
```
**Note:** The package publishes its TypeScript declaration files (.d.ts) automatically, so consumers get full type safety out of the box.*

---

#### Development
If you want to work on the source code itself:
1. Clone the repository:
   ```bash
   git clone https://github.com/sumanjangili/secure-web-product.git
   ```
3. Navigate to the project directory:
   ```bash
   cd secure-web-product/frontend
   ```
5. Install front‑end dependencies:
   ```bash
    npm ci
   ```
6. Run the front‑end development server (Vite):
   ```bash
   npm run dev        # → http://localhost:5173
   ```
---

#### SCRIPTS
*SCRIPT DESCRIPTION*
- **dev** Starts the Vite dev server (localhost:5173).
- **build**	Produces a production bundle in dist/.
- **lint** Runs ESLint over the codebase.
- **type-check** Executes tsc --noEmit to verify TypeScript types.
- **test** Runs Vitest unit tests.
- **generate-docs** Generates markdown docs from source (see scripts/).

---

#### Building & Publishing
When you’re ready to release a new version to npm:
1. Bump the version (patch/minor/major):
   ```bash
   npm version patch
   ```
3. Build the production assets:
   ```bash
   npm run build
   ```
5. Publish the package (public access):
   ```bash
   npm publish --access public
   ```
The npm version command automatically creates a Git tag, updates package.json, and commits the change.

---

#### Contributing
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

---

#### Guidelines
- Keep the public API stable.
- Add documentation for any new endpoints or UI components.
- Update the changelog (CHANGELOG.md) with a concise entry.

---

#### License
MIT © Suman Jangili. See the LICENSE file for full terms.

---
