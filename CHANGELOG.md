# Changelog

All notable changes to the **Secure Web Product** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

## [1.2.0] - 2026-11-06

### Added
- **MFA Flow**: Complete TOTP-based Multi-Factor Authentication implementation.
  - `mfa-setup-init`: Generate secrets and QR codes.
  - `mfa-setup-verify`: Verify codes and generate backup codes.
  - `verify-mfa`: Second-factor verification endpoint.
- **Backup Codes**: Automatic generation of 10 one-time-use recovery codes (12 hex characters, Argon2-hashed at rest) during MFA setup, with on-demand regeneration.
- **Optional MFA Middleware**: `requireMFAIfEnrolled` (`_middleware/require-mfa.js`) — blocks only users who enrolled in MFA but skipped verification this session; non-MFA users retain full access.
- **`mfaVerified` JWT Claim**: Issued only after successful TOTP/backup-code verification; enforced by sensitive endpoints.
- **Account Erasure**: `delete-user` function for GDPR-compliant data removal, now requiring password re-authentication — a stolen session cookie alone cannot erase an account.
- **Atomic Rate Limiting**: Redis-based limiters (Upstash in prod, mock in dev) on every endpoint, including a pre-auth IP limiter on login to defeat credential stuffing against unknown emails.
- **CSRF-Gated Mutations**: All state-changing endpoints validate via the CSRF double-submit pattern (`_middleware/csrf-check`).
- **Cookie Contract**: Shared cookie-parity contract across `login.js`, `logout.js`, and `delete-user.js` — deletion must match `Domain`, `SameSite`, and `Secure` attributes exactly to prevent "still logged in after logout" regressions.
- **Hybrid Redis Client**: `lib/redis.js` supporting both Upstash (Production) and Mock (Local Dev) modes to prevent timeouts.
- **Typed Error Helper**: `getErrorMessage()` in `fetch-helper.ts` — safely extracts human-readable messages from `ApiError` data payloads, replacing unsafe `{}`-typed casts across components.
- **Audit Event Constraint**: Database `CHECK` constraint (`chk_event_type_valid`) whitelists valid audit event types; audit logs survive user erasure via `ON DELETE SET NULL` (GDPR erasure trail outlives the account).
- **Frontend Components**:
  - `LoginForm.tsx`: Login, MFA prompts, backup-code steps, lockout UI, and token/cookie handling.
  - `MFASetup.tsx`: QR code scanning and backup code display.
  - `UserSettings.tsx`: Profile management, MFA toggles, and backup-code regeneration.
  - `DeleteAccountForm.tsx`: Destructive-action guard requiring password + typed confirmation phrase.
- **Security Headers**: Enhanced CSP and security headers in `netlify.toml`.
- **Documentation**:
  - Root `README.md` fully corrected and expanded (cookie contract section, env-var table, expanded verification checklist).
  - New short-form `frontend/README.md` aligned with actual code behavior.

### Changed
- **Request Validation Model**: Replaced the previously documented `x-audit-secret` header validation with CSRF double-submit validation on all mutating endpoints.
- **Consent Storage**: `save-consent.js` persists consent as plain booleans in an append-only `consent_records` model (no unique constraint on `user_id`; plain INSERT, newest-wins reads). Zero-knowledge encryption applies to `secure_data` only.
- **Audit Logging Semantics**: Clarified as append-oriented with erasure-surviving records (`FK ON DELETE SET NULL`) rather than cryptographically/enforced "immutable" logging.
- **Encryption Library**: Switched from `libsodium-wrappers` to **Native Web Crypto API** (AES-GCM 256 + PBKDF2, 100k iterations) for zero-dependency client-side encryption.
- **Database**: Migrated from mock data to **PostgreSQL** (`pg` driver) for persistent user storage and audit logs.
- **Authentication**: Upgraded from simple session checks to **JWT** sessions (HttpOnly, Secure cookies, 24h expiry) with Argon2id password hashing and the `mfaVerified` claim.
- **Error Handling**: TypeScript-typed error handling across all functions and frontend components.
- **Local Development**: Updated workflow to require dual-server setup (`netlify functions:serve` + `npm run dev`).

### Fixed
- **TypeScript Build Errors**: Resolved 3 build failures caused by `err.data?.error` being inferred as `{}` and rejected by `setError(string | null)`:
  - `DeleteAccountForm.tsx`: string type-guard fallback for deletion error messages.
  - `LoginForm.tsx`: type-guarded extraction in `handleApiError` (401 branch and generic branch).
  - Long-term fix: centralized `getErrorMessage()` helper in `fetch-helper.ts` (also covers `ConsentBanner` and `SecureForm`).
- **README Factual Errors**: Removed claims not matching the code — `x-audit-secret` header validation, "encrypted server consent record", and overstated "immutable audit logging"; fixed typos ("repsitory", "a all required secrets") and removed stale correction-note blocks.
- **404 Errors**: Resolved Netlify function routing issues by correcting `netlify.toml` paths (`../netlify/functions`).
- **Timeout Issues**: Eliminated 30-second hangs in local dev by implementing Mock Redis fallback when Upstash credentials are absent.
- **Environment Conflicts**: Fixed logic to prioritize Upstash credentials in production while safely ignoring them in local dev.
- **Retry Logic Skips Auth Failures**: Transient retry in `fetch-helper.ts` no longer retries `401`/`403` responses. Previously these were silently retried, delaying error feedback to the user and amplifying load against auth endpoints.
- **Base64url-Safe JWT Decoding**: `checkAuthStatus` in `fetch-helper.ts` now converts base64url characters (`-`/`_`) and restores missing padding before `atob`, fixing failures to decode unpadded JWT segments per RFC 7515.
- **ESLint Flat-Config Correction**: Added a TypeScript-scoped override in `eslint.config.js` disabling base `no-unused-vars`/`no-undef` rules for `*.ts`/`*.tsx` files, eliminating duplicate false positives on TypeScript sources.
- **ConsentBanner Test Suite Repair**: Converted the `fetch-helper` mock to a partial mock via `importOriginal` so the real `ApiError` and `getErrorMessage` exports remain available; error-path tests now reject with genuine `ApiError` instances, making `instanceof` branches execute correctly. Removed remaining `no-explicit-any` violations — suite passes 7/7 with zero unhandled rejections.

### Removed
- `libsodium-wrappers` dependency (replaced by native APIs).
- Old `audit_log.js` only flow (now integrated into full auth lifecycle).
- `backup.sql` and `data.sql` from Git tracking (moved to `.gitignore`).
- Stale "Key Corrections" editorial block from README (not project content).

### Security
- **CSRF Protection on All Mutations**: All state-changing endpoints (`login`, `mfa-setup-*`, `verify-mfa`, `save-consent`, `delete-user`, etc.) now validate requests via the CSRF double-submit pattern (`_middleware/csrf-check`). This replaces the previous undocumented header-based approach and closes cross-site request forgery vectors against authenticated sessions. *(Also logged under Added/Changed — see Request Validation Model.)*
- **Password Re-Authentication for Account Erasure**: GDPR erasure (`delete-user`) now requires the account's current password in addition to a valid session. Mitigates account takeover via stolen/hijacked session cookies (XSS, cookie exfiltration, shared machines) — session possession alone is no longer sufficient for destructive actions.
- **Cookie Attribute Parity Contract**: `login.js`, `logout.js`, and `delete-user.js` share a single, documented cookie contract (identical `Domain`, `SameSite=None; Secure` attributes on set and delete). Eliminates the class of regressions where logout/deletion leaves a live `auth_token`/`csrf_token` cookie due to attribute mismatches — a session-invalidation bypass.
- **Optional-MFA Enforcement Middleware**: `requireMFAIfEnrolled` ensures users who opted into MFA cannot reach sensitive endpoints without completing TOTP/backup-code verification this session (403 `requiresMFA`); the `mfaVerified` JWT claim is only issued after successful second-factor verification. Prevents MFA bypass by replaying a first-factor session token.
- **Pre-Authentication Rate Limiting**: Atomic Redis-based limiter applied to `/login` *before* credential validation, keyed on IP. Mitigates credential-stuffing and brute-force enumeration against both known and unknown email addresses; atomicity prevents TOCTOU races under concurrent requests.
- **Documentation Integrity**: Removed README claims describing security controls that do not exist in code (`x-audit-secret` header validation, enforced "immutable" audit logging, encrypted server-side consent storage). Accurate security documentation is itself an audit requirement — overstated controls create compliance exposure under GDPR Art. 5(1)(f) and ISO 27001 A.5 documentation expectations.

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

---

### Legend
- **Added**: New features.
- **Changed**: Changes in existing functionality.
- **Deprecated**: Soon-to-be removed features.
- **Removed**: Removed features.
- **Fixed**: Bug fixes.
- **Security**: Improvements related to security.
