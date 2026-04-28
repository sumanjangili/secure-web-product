# Changelog

All notable changes to the **Secure Web Product** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **MFA Flow**: Complete TOTP-based Multi-Factor Authentication implementation.
  - `mfa-setup-init`: Generate secrets and QR codes.
  - `mfa-setup-verify`: Verify codes and generate backup codes.
  - `verify-mfa`: Second-factor verification endpoint.
- **Backup Codes**: Automatic generation of 10 one-time-use recovery codes during MFA setup.
- **Account Erasure**: `delete-user` function for GDPR-compliant data removal.
- **Hybrid Redis Client**: `lib/redis.js` supporting both Upstash (Production) and Mock (Local Dev) modes to prevent timeouts.
- **Frontend Components**:
  - `LoginForm.tsx`: Handles login, MFA prompts, and token storage.
  - `MFASetup.tsx`: QR code scanning and backup code display.
  - `UserSettings.tsx`: Profile management and MFA toggles.
- **Security Headers**: Enhanced CSP and security headers in `netlify.toml`.

### Changed
- **Encryption Library**: Switched from `libsodium-wrappers` to **Native Web Crypto API** (AES-GCM + PBKDF2) for zero-dependency client-side encryption.
- **Database**: Migrated from mock data to **PostgreSQL** (`pg` driver) for persistent user storage and audit logs.
- **Authentication**: Upgraded from simple session checks to **JWT** (JSON Web Tokens) with Argon2id password hashing.
- **Local Development**: Updated workflow to require dual-server setup (`netlify functions:serve` + `npm run dev`).

### Fixed
- **404 Errors**: Resolved Netlify function routing issues by correcting `netlify.toml` paths (`../netlify/functions`).
- **Timeout Issues**: Eliminated 30-second hangs in local dev by implementing Mock Redis fallback when Upstash credentials are absent.
- **Environment Conflicts**: Fixed logic to prioritize Upstash credentials in production while safely ignoring them in local dev.

### Removed
- `libsodium-wrappers` dependency (replaced by native APIs).
- Old `audit_log.js` only flow (now integrated into full auth lifecycle).
- `backup.sql` and `data.sql` from Git tracking (moved to `.gitignore`).

---

## [1.1.0] - 2026-04-28

### Added
- Initial implementation of **Secure Web Product** core architecture.
- **Client-Side Encryption**: AES-GCM encryption for form data and consent banners.
- **Immutable Audit Logging**: `audit_log.js` function with secret header validation.
- **Product Management Artifacts**: Roadmap, regulatory matrix, and stakeholder maps in `docs/`.
- **CI/CD Pipeline**: GitHub Actions for linting, testing, and security audits.

### Changed
- Updated `netlify.toml` to support Vite frontend and Netlify Functions in a monorepo structure.
- Refactored `crypto.ts` to use native Web Crypto API.

### Fixed
- Fixed CSP header generation script.
- Resolved TypeScript compilation errors in `SecureForm.tsx`.

---

## [1.0.0] - 2026-04-20

### Added
- Initial release of the **Secure Web Product Starter Kit**.
- Basic Vite + React frontend with TypeScript.
- `SecureForm` component for encrypted data submission.
- `ConsentBanner` component for encrypted privacy preferences.
- Basic `netlify.toml` configuration for deployment.

### Changed
- N/A

### Fixed
- N/A

---

### Legend
- **Added**: New features.
- **Changed**: Changes in existing functionality.
- **Deprecated**: Soon-to-be removed features.
- **Removed**: Removed features.
- **Fixed**: Bug fixes.
- **Security**: Improvements related to security.
