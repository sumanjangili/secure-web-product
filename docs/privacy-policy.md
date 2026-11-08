# Privacy Policy

**Version:** 1.2.0
**Effective Date:** 2026-11-06
**Last Updated:** 2026-11-08
**Controller:** Suman Jangili
**Contact:** info@indoscient.in

## 1. Introduction
Welcome to Secure Web Product. We are committed to protecting your privacy and ensuring the
highest level of security for your data. This policy explains how we collect, use, and safeguard
your information, with a specific focus on our **Zero-Knowledge Architecture**.

## 2. Data Collection & Zero-Knowledge Principle
Our platform applies a **Zero-Knowledge** model to the data you submit through encrypted forms
(`secure_data`). This means:
- **We do not see your form data.** Form submissions are encrypted **client-side** in your
  browser before they leave your device.
- **Encryption Standards:** We use **AES-GCM (256-bit)** encryption with **PBKDF2** key
  derivation (100,000 iterations) via the native Web Crypto API.
- **Key Ownership:** The encryption key is derived from a password that exists only in your
  browser and is wiped from application state on every exit path. We never receive this
  password or the derived key. (This is distinct from your **account login password**, which
  is sent over TLS to authenticate you and hashed server-side with **Argon2id** — see §3.A.)
- **What We Store:** For encrypted submissions, our servers only store encrypted blobs
  (`ciphertext`, `salt`, `iv`). Without your key, this data is mathematically unreadable to us
  and any third party.

## 3. Types of Data Processed
While we cannot read your encrypted form data, we process the following metadata and technical
data:

### A. Account & Authentication Data
- **Email Address:** Used for account identification and login.
- **Login Password:** Transmitted over TLS and hashed server-side with **Argon2id** before
  storage; the plaintext is never stored.
- **Authentication Tokens:** Temporary session tokens (JWT) stored in your browser as
  HttpOnly, Secure cookies (24h expiry) to maintain login state.
- **MFA Setup Data:** Your TOTP secret (used to display a QR code at setup) and backup codes
  (12-character hex, Argon2-hashed at rest).
- **MFA Status:** Whether Multi-Factor Authentication is enabled (stored as a flag, not the
  code itself).

### B. Audit & Security Logs
- **Event Metadata:** Timestamps and event types (e.g., `SECURE_TICKET_CREATED`) are logged to
  ensure system integrity and detect abuse. Audit records are append-only in normal operation,
  and survive account deletion in anonymized form (`ON DELETE SET NULL`).
- **IP Addresses:** Processed solely for fraud prevention, rate-limiting, and security
  monitoring (GDPR Art. 6(1)(f) — legitimate interests in cybersecurity). IP addresses are
  retained for a maximum of **30 days**, then automatically deleted. They are not used for
  profiling, marketing, or any secondary purpose.

### C. Consent Preferences
- **Local Storage:** Your cookie consent choices (Essential vs. Analytics) are stored locally in
  your browser as a **plain JSON flag** for immediate UX responsiveness. This local flag is
  not considered sensitive personal data.
- **Server Record:** Your official consent preference is simultaneously transmitted to our
  servers and persisted as **plain boolean values** in an append-only `consent_records` table
  (newest record wins on read). These records are **not encrypted** — but no personal data
  beyond the consent choice itself is recorded. Consent choices are never linked to any
  additional identifying data.

### D. MFA-Related Data
- **TOTP Secret:** Stored server-side so your authenticator app and the server stay in sync.
- **Backup Codes:** Ten 12-character one-time-use recovery codes, generated at MFA setup and
  Argon2-hashed at rest; regeneratable on demand from User Settings.

### E. Rate-Limiting Data
- **Rate-Limiter Counters:** Short-lived, IP-keyed counters in Redis (Upstash in production,
  mock/in-memory in local development), incremented atomically to prevent race conditions
  under concurrent requests. Counters expire automatically with their TTL windows and are
  never persisted beyond that. A pre-authentication limiter on `/login` is checked before
  credential validation to blunt credential-stuffing attacks against known and unknown email
  addresses alike.

## 4. How We Use Your Data
- **Service Delivery:** To authenticate you, encrypt, store, and allow you to retrieve your
  form data.
- **Security:** To monitor for suspicious activity, enforce rate limits (including
  credential-stuffing protection on `/login`), and prevent fraud.
- **Legal Compliance:** To fulfill obligations under GDPR (Right to Erasure) and CCPA.
- **Improvement:** Aggregated, anonymized metrics (e.g., "500 tickets submitted today") to
  improve system performance.

## 5. Data Retention
- **User Data:** Retained only while your account is active. If your account is inactive
  (no login) for **24 consecutive months**, we will delete your account data or notify you
  before deletion. Upon account closure or a verified erasure request, deletion completes
  within **30 days**. Encrypted blobs cannot be partially deleted; erasure removes the
  entire encrypted payload along with the key-derivation material (`salt`), rendering the
  ciphertext permanently unrecoverable.
- **Backups:** Residual copies, if any, may persist in encrypted backups for up to **30 days**
  after deletion, after which they are rotated out.
- **Audit Logs:** Retained for a maximum of **12 months** solely for security auditing,
  intrusion detection, and breach investigation purposes, then anonymized by irreversibly
  disassociating them from user identifiers (`ON DELETE SET NULL`). Audit records belonging
  to deleted accounts survive erasure in this anonymized form, as permitted for security
  and GDPR accountability purposes.
- **Session Tokens:** Expire automatically after 24 hours of inactivity.
- **IP Addresses:** Maximum of **30 days** (see §3.B/§3.E), then automatically deleted.
- **Consent Records:** Retained as long as your account is active to demonstrate compliance
  with your choices.

## 6. Your Rights (GDPR & CCPA)
You have the following rights regarding your data:

### Right to Erasure (Delete)
- Permanently delete your account and all associated data via **User Settings**. This action
  is **irreversible**, requires **password re-authentication** plus a typed confirmation
  phrase, and removes both the local consent flag and all server records. Audit trail
  entries survive in anonymized form (`ON DELETE SET NULL`), as required for security
  accountability. A stolen session cookie alone cannot erase your account.
- **Session/Cookie Invalidation:** Upon deletion or logout, all session and CSRF cookies are
  invalidated with identical attributes to those set at login (matching `Domain`, `SameSite`,
  and `Secure` flags — the "cookie parity contract"), ensuring a deleted session cannot be
  replayed.

### Other Rights
- **Right to Access:** You can view your encrypted data via the authenticated interface;
  decryption happens locally in your browser, so we see only ciphertext.
- **Right to Rectification:** Update your profile information via **User Settings**.
- **Right to Opt-Out:** Reject non-essential cookies at any time via the **Consent Banner**.
  This updates both your local flag and the server-side consent record immediately; the
  banner supports rollback of your choice before confirmation.
- **Right to Portability:** (Planned Q1 2027) Export your data in a structured format.

## 7. International Transfers
Our infrastructure is hosted on **Netlify** (US-based). Encrypted form data (`secure_data`)
is protected client-side before transmission, so its confidentiality does not depend on
server location. Non-encrypted account and metadata (e.g., email address, MFA status, consent
booleans) travels over **TLS 1.3** and may be processed in the United States. We rely on
standard contractual clauses for any necessary data transfers.

## 8. Security Measures
- **End-to-End Encryption (E2EE):** Form data is encrypted in the browser (AES-GCM 256 +
  PBKDF2, 100k iterations, native Web Crypto); only `ciphertext`, `salt`, and `iv` are
  transmitted.
- **Password Storage:** Argon2id server-side hashing of login passwords.
- **Transport Security:** All communications use TLS 1.3.
- **Multi-Factor Authentication (MFA):** Optional TOTP-based MFA with ten one-time-use backup
  codes (12 hex characters, Argon2-hashed at rest, regeneratable on demand). The
  `mfaVerified` JWT claim is issued only after successful second-factor verification and
  enforced on sensitive endpoints via the `requireMFAIfEnrolled` middleware — a first-factor
  session token alone cannot reach protected endpoints.
- **Rate Limiting:** Atomic Redis-based limiters (Upstash in production, mock in local
  development) on every endpoint, with client-side `Retry-After` countdowns, and a
  pre-authentication IP limiter on `/login` to defeat credential stuffing.
- **CSRF Protection:** Double-submit CSRF token validation on all state-changing endpoints
  (login, MFA setup/verification, consent, and account deletion).
- **Cookie Contract:** Identical `Domain`/`SameSite`/`Secure` attributes across login, logout,
  and account deletion, eliminating stale-cookie session-invalidation bypasses.
- **Account Erasure Protection:** Account deletion requires password re-authentication plus
  a typed confirmation phrase; session possession alone is insufficient for destructive
  actions.
- **Audit Trail:** All sensitive events are logged server-side (append-only reads; erasure
  records survive account deletion via `ON DELETE SET NULL`). A database `CHECK` constraint
  whitelists valid audit event types.
- **Security Headers:** Enhanced CSP and security headers configured in `netlify.toml`.

## 9. Changes to This Policy
We may update this policy periodically. Significant changes will be communicated via email
or a prominent notice on our platform. Continued use of the service constitutes acceptance of
the updated policy.

## 10. Contact Us
If you have questions about this policy or your data, please contact our Data Protection
Officer:
- **Email:** info@indoscient.in
- **Address:** Telangana State, India.

---
*This policy is version-controlled. See `docs/privacy-policy.md` for the latest revision.*
