# Secure Web Product Starter Kit  

A privacy‑first audit‑logging solution that also serves as a product‑management hub.  
It ships a minimal Vite + React front‑end, a Netlify serverless function for immutable logs, and a set of documentation artefacts (roadmap, regulatory matrix, stakeholder map).

---

## Features  

- **Docs** – Version‑controlled product‑management artefacts (`docs/`).  
- **Privacy‑first UX** – All data encrypted client‑side; no telemetry collected.  
- **Transparent Architecture** – Front‑end talks only to a Netlify serverless function that writes to an immutable log.  
- **Minimal Vite‑React UI** – Demonstrates privacy‑first components, client‑side cryptography, and audit‑log integration.  

---

## Installation  

Add the package to any Node project:

From npm
```bash
npm install @suman-jangili/secure-web-product

Or using the shorthand
npm i @suman-jangili/secure-web-product
Note: The package publishes its TypeScript declaration files (.d.ts) automatically, so consumers get full type safety out of the box.*

Development

If you want to work on the source code itself:
1. Clone the repository:
    git clone https://github.com/sumanjangili/secure-web-product.git

2. Navigate to the project directory:
   cd secure-web-product/frontend

3. Install front‑end dependencies:
   npm ci

4. Run the front‑end development server (Vite):
   npm run dev        # → http://localhost:5173

Scripts

SCRIPT	DESCRIPTION
dev	Starts the Vite dev server (localhost:5173).
build	Produces a production bundle in dist/.
lint	Runs ESLint over the codebase.
type-check	Executes tsc --noEmit to verify TypeScript types.
test	Runs Vitest unit tests.
generate-docs	Generates markdown docs from source (see scripts/).

Building & Publishing
When you’re ready to release a new version to npm:
1. Bump the version (patch/minor/major):
   npm version patch
  
2. Build the production assets:
   npm run build

3. Publish the package (public access):
   npm publish --access public

The npm version command automatically creates a Git tag, updates package.json, and commits the change.
Contributing

We welcome contributions! Please follow these steps:
1. Fork the repository.
2. Create a feature branch:
   git checkout -b feat/awesome-feature

3. Implement your change.
4. Run the test suite and linting:
   npm test
   npm run lint
5. Ensure TypeScript compiles without errors:
   npm run type-check
6. Open a Pull Request against the main branch.

Guidelines

Keep the public API stable.
Add documentation for any new endpoints or UI components.
Update the changelog (CHANGELOG.md) with a concise entry.

License

MIT © Suman Jangili. See the LICENSE file for full terms.
