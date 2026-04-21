## Secure Web Product Starter Kit

> "
> **A Privacy-First Audit Logging & Product Management Hub**.  
> A production-ready Vite + React frontend demonstrating end-to-end client-side encryption, secure audit logging, and privacy-preserving UX patterns.
> "

This frontend is the client component of the Secure Web Product ecosystem. It implements a zero-knowledge architecture where all sensitive data is encrypted in the browser before being sent to the Netlify backend for immutable logging.

---

### Table of Contents

1. [Quick Start](#quick-start)
2. [Core Features](#core-features)
3. [Installation & Configuration](#installation--configuration)
4. [Usage Examples](#usage-examples)
5. [Scripts](#scripts)
6. [Cryptography Details](#cryptography-details)
7. [Project Structure](#project-structure)
8. [Deployment to Netlify](#deployment-to-netlify)
9. [Contributing](#contributing)
10. [License](#license)
11. [Verification Checklist](#verification-checklist)

---

### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/sumanjangili/secure-web-product.git
cd secure-web-product/frontend

# 2. Install dependencies
npm ci

# 3. Start the development server
npm run dev
```
The app will be available at http://localhost:5173.

---

### Core Features

1. Client-Side Encryption (Zero-Knowledge)
- **Algorithm**: AES-GCM (256-bit) with PBKDF2 key derivation (100k iterations).
- **Implementation**: Native Web Crypto API (no external crypto libraries required).
- **Workflow**:
     - Users enter data (forms, consent) and a password.
     - Data is encrypted locally into { ciphertext, salt, iv }.
     - **Only** the encrypted blob is sent to the server. The password never leaves the client.
- **Memory Safety**: Sensitive data (passwords, form inputs) is explicitly cleared from React state immediately after processing.

2. Secure Audit Logging Integration
- The frontend sends encrypted payloads to the Netlify serverless function (/api/audit-log).
- The backend validates requests via a secret header (x-audit-secret) and writes to an immutable log.
- **No plaintext data** ever traverses the network or touches the server disk.

3. Privacy-First UX Components
- **SecureForm**: A contact form that validates input, encrypts data, verifies round-trip integrity, and clears memory on success/failure.
- **ConsentBanner**: Stores user consent in localStorage in an encrypted format, preventing plain-text leakage of privacy preferences.

4. Product Management Hub
- Includes version-controlled documentation artifacts (docs/) for roadmaps, regulatory matrices, and stakeholder maps.
- Scripts to auto-generate documentation from source code.

---

### Installation & Configuration
#### Prerequisites
- **Node.js** ≥ 20.x
- **npm**
- **Netlify CLI** (optional, for local function testing)

#### Environment Variables
Create a .env file in the frontend directory for local development:
```js
# Local Development
VITE_API_URL=http://localhost:8888
VITE_AUDIT_LOG_ENDPOINT=/api/audit-log

# Note: In production, these are set in Netlify's Environment Variables.
# Do not commit .env files to git.
```
Add the package to any Node project from npm:
```bash
npm install @suman-jangili/secure-web-product
```
**OR** using the shorthand
```bash
npm i @suman-jangili/secure-web-product
```
**Note:** The package publishes its TypeScript declaration files (.d.ts) automatically, so consumers get full type safety out of the box.*

#### Dependencies
- **Core**: react, react-dom
- **Dev**: vite, typescript, vitest, eslint, prettier, husky
- **Crypto**: Uses native Web Crypto API (no libsodium or external crypto packages needed).

---

### Usage Examples
1. **Secure Contact Form**

The SecureForm component demonstrates:
- User input validation.
- Password-based encryption.
- Round-trip verification (encrypt -> decrypt -> compare).
- Immediate memory clearing of sensitive data.

How it works:
> 1. Enter a name, email, and a strong password (min 8 chars).
> 2. Click "Send securely".
> 3. The form encrypts the data locally.
> 4. It verifies the encryption by decrypting it immediately.
> 5. On success, it clears the password and form fields from memory.

2. **Encrypted Consent Banner**

The ConsentBanner component demonstrates:
- Checking for existing encrypted consent in localStorage.
- Encrypting the consent decision ("accepted") before saving.
- Using a derived key (note: currently uses a demo password for illustration).

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
- **Randomness**: Uses crypto.getRandomValues() for salts and IVs.
- **Error Handling**: Generic error messages to the user; detailed errors logged only to the console.
- **Memory Clearing**: Passwords and form data are wiped from state immediately after use.
- **Header Validation**: The backend requires a secret header (x-audit-secret) to accept logs.

---

### Project Structure
```js
frontend/
├── src/
│   ├── components/
│   │   ├── SecureForm.tsx      # Encrypted contact form demo
│   │   └── ConsentBanner.tsx   # Encrypted consent storage demo
│   ├── lib/
│   │   └── crypto.ts           # Web Crypto API implementation (AES-GCM + PBKDF2)
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   ├── generate-csp.cjs        # CSP header generation
│   ├── generate-docs.ts        # Documentation generator
│   └── encrypt-demo.ts         # Standalone encryption test
├── netlify/
│   └── functions/              # (Referenced) Backend functions
│       └── audit_log.js        # Immutable log writer
├── docs/                       # Product management artifacts
│   ├── roadmap.md
│   ├── regulatory-matrix.md
│   └── stakeholder-map.md
├── .env.example
├── package.json
├── tsconfig.json
└── vite.config.ts
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

3. Environment Variables
*(Settings → Build & Deploy → Environment and add)*

| Variable | Description |
| :--- | :--- |
| `AUDIT_SECRET` | Critical: The shared secret for the backend function. Must match the frontend's expectation (if configured) or be used solely by the backend. |
| `VITE_API_URL` | (Optional) Production API base URL. |
| `VITE_AUDIT_LOG_ENDPOINT` | (Optional) Production audit log endpoint path. |

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
Before releasing, ensure:

-  AUDIT_SECRET is set in Netlify environment variables.
-  No plaintext data is logged to the console in production.
-  npm audit shows no high/critical vulnerabilities.
-  Encryption/Decryption round-trip tests pass.
-  Memory clearing logic is verified in SecureForm and ConsentBanner.
For a detailed checklist, see [VERIFY_CHECKLIST.md](VERIFY_CHECKLIST.md)

---

