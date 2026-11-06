# Data Protection Impact Assessment (DPIA)

**Project Name:** Secure Web Product  
**Date of Assessment:** 2026-04-10 (Original)  
**Last Updated:** 2026-11-06 (Post-Auth Security Overhaul)  
**Assessor:** Security Team & Legal Liaison  
**Review Status:** ✅ Completed (Original); 🔄 Re-assessed (2026-11-06)  
**Next Review:** Q2 2027 (Post-Penetration Testing)

## 1. Executive Summary
This DPIA evaluates the risks associated with the "Secure Web Product" platform, which implements a **Zero-Knowledge Architecture** for secure contact forms, authentication, and audit logging. The original assessment (2026-04-10) concluded that client-side encryption significantly mitigates the risk of unauthorized access, making residual risk **Low**. Following the **Auth Security Overhaul** completed November 2026 (CSRF protection, optional-MFA middleware, password re-authentication for erasure, atomic rate limiting), the assessment is reaffirmed: residual risk remains **Low**, with enhanced defenses against account takeover and session hijacking.

## 2. Nature, Scope, Context, and Purposes
- **Nature:** Processing of personal data (names, emails, messages) via a public-facing web form, plus authentication data (JWT sessions, MFA credentials, audit logs).
- **Scope:** Global users submitting data via the `SecureForm` component; authenticated users managing accounts and consent.
- **Context:** Production-ready Vite + React application hosted on Netlify with PostgreSQL backend and Upstash Redis for rate limiting.
- **Purpose:** To provide a secure channel for users to submit sensitive inquiries without exposing plaintext data to the service provider, combined with secure authentication and GDPR-compliant erasure.

## 3. Necessity and Proportionality
- **Data Minimisation:** The system collects only the minimum data required (Name, Email, Message for secure submissions; email for authentication). Consent timestamps stored as non-sensitive operational flags; no PII retained without explicit consent.
- **Encryption by Design:** The decision to use **AES-GCM 256-bit** encryption client-side (native Web Crypto API) ensures that the service provider cannot access the data, fulfilling the principle of "Data Protection by Design and Default" (GDPR Art. 25). **Note:** Zero-knowledge applies to `secure_data` submissions only; consent records are deliberately stored as plain booleans for legal proof (GDPR Art. 7), which is non-sensitive operational data.
- **Consent:** Explicit, granular consent is obtained via `ConsentBanner.tsx` before any non-essential tracking occurs. The consent flow is fail-open: if the consent check fails, the banner always displays — consent is never silently suppressed.

## 4. Risk Assessment

### Identified Risks
| Risk ID | Description | Likelihood | Impact | Initial Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| **R1** | **Brute-force attack on weak passwords** | Medium | High | **High** |
| **R2** | **Man-in-the-Middle (MitM) attack** | Low | High | **Medium** |
| **R3** | **Loss of user encryption key / MFA access** | Medium | High | **High** |
| **R4** | **Metadata leakage via audit logs** | Low | Medium | **Low** |
| **R5** | **Server-side compromise** | Low | Medium | **Low** |
| **R6** | **Session hijacking / CSRF attacks** (added Nov 2026) | Medium | High | **Medium** |
| **R7** | **Account deletion via stolen session cookie** (added Nov 2026) | Medium | High | **Medium** |

### Mitigation Strategies
| Risk ID | Mitigation Measure | Residual Risk |
| :--- | :--- | :--- |
| **R1** | Enforced **PBKDF2** with 100,000 iterations; Minimum 8-char password policy; **Atomic Redis rate limiting** (Upstash in production, mock in dev) including pre-auth IP limiter on login to defeat credential stuffing. | **Low** |
| **R2** | Mandatory **TLS 1.3**; HSTS headers; Content Security Policy (CSP); proxy all `/api/*` requests through Netlify to ensure first-party cookies (SameSite=Lax in production). | **Low** |
| **R3** | Generation of **12-character Argon2-hashed backup codes** during MFA setup (for MFA recovery ONLY — **NOT for encryption key recovery**); clear user warnings about encryption password loss. **Critical distinction:** Backup codes restore MFA access only; lost encryption passwords mean lost data (by design — zero-knowledge architecture). | **Medium** (User responsibility for encryption keys; Low for MFA access) |
| **R4** | Audit logs store **constraint-validated JSONB details** with database `CHECK` constraint (`chk_event_type_valid`) whitelisting event types; erasure-surviving records via `ON DELETE SET NULL` on the FK (erasure trail outlives the account). No plaintext PII stored or logged. | **Low** |
| **R5** | Data is encrypted before leaving the client (AES-GCM 256); server compromise yields only ciphertext. | **Low** |
| **R6** | **CSRF double-submit validation** on all state-changing endpoints (`_middleware/csrf-check`); HttpOnly, Secure cookies with documented attribute-parity contract across `login.js`, `logout.js`, `delete-user.js`. | **Low** |
| **R7** | **Password re-authentication required** for account erasure (`delete-user.js`) — a stolen session cookie alone cannot erase an account. **Typed confirmation phrase** ("DELETE") required in frontend (`DeleteAccountForm.tsx`). | **Low** |

## 5. Consultation & Stakeholder Input
- **Engineering Lead:** Confirmed implementation of Web Crypto API, memory clearing strategies, CSRF middleware, optional-MFA enforcement (`requireMFAIfEnrolled`), and cookie attribute-parity contract.
- **Legal / Compliance:** Verified alignment with GDPR Art. 32 (Security of Processing), Art. 35 (DPIA requirement), Art. 7 (Conditions for Consent), and Art. 17 (Right to Erasure). Regulatory Matrix updated 2026-11-06 to reflect actual implementation (removed "encrypted/immutable" overclaims; corrected consent storage description).
- **UX Designer:** Ensured consent flows are clear and not "dark patterns"; fail-open collection means consent is never silently suppressed.
- **Security Analyst:** Validated atomic rate limiting, password re-authentication for destructive actions, and pre-auth IP limiting on login.

## 6. Conclusion
The processing of personal data in the Secure Web Product is **lawful and proportionate**. The implementation of client-side encryption effectively neutralizes the primary risk of data exposure. The Auth Security Overhaul (November 2026) added substantial defenses against session hijacking, CSRF, credential stuffing, and account deletion via stolen sessions — strengthening the original posture.

**Original Residual Risk Rating (2026-04-10):** LOW  
**Reassessed Residual Risk Rating (2026-11-06):** LOW (enhanced defenses)

**Recommendation:** Proceed to production (original recommendation). Schedule penetration testing for Q1 2027 (was Q3 2026 — see Action Plan; the milestone slipped due to auth-overhaul prioritization). Pending the immutability trigger migration (in progress in Regulatory Matrix), consider upgrading to database-enforced audit log immutability for stronger CC7.1 evidence.

## 7. Action Plan
| Action Item | Owner | Original Deadline | Updated Deadline | Status |
| :--- | :--- | :--- | :--- | :--- |
| Implement automated password strength meter | Engineering | Q2 2026 | Q1 2027 | ⏳ Planned |
| Conduct third-party penetration test | Security Analyst | Q3 2026 | Q1 2027 | ⚠️ **Slipped** (pen-test now scheduled for Jan-Feb 2027, post-v1.2.0 release) |
| Update DPIA after pen-test results | Legal | Q4 2026 | Q2 2027 | ⏳ Planned |
| Finalize Data Portability feature | Product | Q3 2026 | Q3 2027 | ⏳ Planned |
| Database-enforced audit log immutability (BEFORE UPDATE/DELETE trigger) | Security Engineer | Not originally scoped | Q2 2027 | 🔄 In Progress (tracked in Regulatory Matrix) |
| Complete SOC 2 Type II readiness | Operations / DevOps | Q4 2026 | Q4 2027 | ⏳ Planned |

**Release Readiness (v1.2.0):** Following the November 2026 security overhaul, the v1.2.0 release checklist includes:
- Full CI suite green (lint, type-check, tests, build, security audit)
- Verification checklist passed (MFA end-to-end, cookie-parity logout check, erasure → `user_id = NULL` audit trail)
- Corrected documentation (README, Regulatory Matrix, DPIA)

## 8. Sign-off
**Original (2026-04-10):**
- **Data Protection Officer:** ____________________ (Date: 2026-04-10)
- **Product Manager:** Suman Jangili (Date: 2026-04-10)
- **Engineering Lead:** Suman Jangili (Date: 2026-04-10)

**Re-Assessment (2026-11-06):**
- **Data Protection Officer:** ____________________ (Date: ____________)
- **Product Manager:** Suman Jangili (Date: 2026-11-06)
- **Engineering Lead:** Suman Jangili (Date: 2026-11-06)
- **Legal / Compliance:** _______________ (Date: ____________)

---
*This document is part of the regulatory evidence repository. See `docs/regulatory-matrix.md` for cross-references.*  
*Document last synchronized with code base: 2026-11-06 (post-auth-security-overhaul verification session).*
