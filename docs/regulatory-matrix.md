# Regulatory Matrix

Compliance requirements and implementation status for secure-web-product.

> **Last Updated:** 2026-11-06  
> **Owner:** Legal / Compliance  
> **Next Review:** Q3 2026 (Pre-Penetration Testing)

---

## GDPR Compliance Matrix

| Article | Requirement | Implementation Status | Evidence Location |
| :--- | :--- | :--- | :--- |
| **Art. 5** | Data Minimisation | ✅ Implemented | `SecureForm.tsx` (only collects name/email) |
| **Art. 6** | Lawful Basis for Processing | ✅ Implemented | `ConsentBanner.tsx` (explicit consent) |
| **Art. 7** | Conditions for Consent | ✅ Implemented | `ConsentBanner.tsx` (granular), `ConsentManager.ts` (local/server sync), `save-consent.js` (append-only server record) |
| **Art. 12** | Transparent Information | ✅ Implemented | `docs/privacy-policy.md` |
| **Art. 15** | Right of Access | ⏳ Planned | Q3 2026 (Data Export Endpoint) |
| **Art. 16** | Right to Rectification | ⏳ Planned | Q3 2026 (User Profile Edit) |
| **Art. 17** | Right to Erasure | ✅ Implemented | `netlify/functions/delete-user.js` (password re-authentication + erasure-surviving audit trail) |
| **Art. 18** | Right to Restrict Processing | ⏳ Planned | Q4 2026 (Account Freeze Feature) |
| **Art. 20** | Right to Data Portability | ⏳ Planned | Q3 2026 (Export as JSON/CSV) |
| **Art. 25** | Data Protection by Design | ✅ Implemented | `crypto.ts` (E2EE for secure submissions by default) |
| **Art. 30** | Records of Processing | ✅ Implemented | Integrated audit lifecycle (`audit_logs` table: CHECK-constrained event types, erasure-surviving records via `ON DELETE SET NULL`) |
| **Art. 32** | Security of Processing | ✅ Implemented | `crypto.ts` (AES-GCM + PBKDF2), `_middleware/csrf-check` (CSRF double-submit), `_middleware/require-mfa.js`, atomic Redis rate limiting, cookie attribute parity |
| **Art. 33** | Breach Notification | ⏳ Planned | Q4 2026 (Incident Response Plan) |
| **Art. 35** | DPIA Required | ✅ Completed | `docs/dpia-report.md` |

---

## CCPA Compliance Matrix

| Section | Requirement | Implementation Status | Evidence Location |
| :--- | :--- | :--- | :--- |
| **§1798.100** | Notice at Collection | ✅ Implemented | `ConsentBanner.tsx` |
| **§1798.105** | Right to Delete | ✅ Implemented | `netlify/functions/delete-user.js` (password re-authentication) |
| **§1798.110** | Right to Know | ⏳ Planned | Q3 2026 (Data Access Endpoint) |
| **§1798.115** | Right to Opt-Out | ✅ Implemented | `ConsentBanner.tsx` (Reject Non-Essential) |
| **§1798.120** | Non-Discrimination | ✅ Implemented | All features available regardless of consent |
| **§1798.130** | Disclosure Requirements | ✅ Implemented | `docs/privacy-policy.md` |

---

## SOC 2 Type II Readiness

| Trust Service Criterion | Requirement | Implementation Status | Evidence Location |
| :--- | :--- | :--- | :--- |
| **CC1.1** | Control Environment | ✅ Implemented | `docs/stakeholder-map.md` |
| **CC2.1** | Communication & Information | ✅ Implemented | `docs/roadmap.md` |
| **CC3.1** | Risk Assessment | ✅ Implemented | `docs/risk-register.md` |
| **CC5.1** | Control Activities | ✅ Implemented | Integrated audit lifecycle (`audit_logs`: constraint-validated JSONB, append-oriented writes) |
| **CC6.1** | Logical Access Security | ✅ Implemented | `MFASetup.tsx`, `verify-mfa.js`, `_middleware/require-mfa.js` (optional-MFA enforcement), password re-authentication for destructive actions |
| **CC6.6** | Encryption | ✅ Implemented | `crypto.ts` (AES-GCM 256 + PBKDF2 100k iterations, native Web Crypto) |
| **CC7.1** | System Monitoring | ✅ Implemented | Integrated audit lifecycle (CHECK-constrained event types; erasure records survive account deletion) |
| **CC8.1** | Change Management | ✅ Implemented | `.github/workflows/ci.yml` |

---

## Implementation Notes

### GDPR Art. 5 - Data Minimisation
- **Requirement:** Collect only data necessary for specified purposes
- **Implementation:** 
  - `SecureForm.tsx` only collects name and email
  - Consent timestamps stored only; no PII retained without explicit consent
  - Secure submission data encrypted client-side before transmission
- **Verification:** Automated scan in CI pipeline checks for PII patterns

### GDPR Art. 7 - Conditions for Consent
- **Requirement:** Consent must be freely given, specific, informed, and unambiguous
- **Implementation:** 
  - `ConsentBanner.tsx` provides granular consent (Essential vs. Analytics)
  - Users can reject non-essential cookies without penalty
  - Banner is fail-open: if the consent check fails, it always displays — consent is never silently suppressed
  - **Local Storage:** Plain JSON flag for immediate UX responsiveness (non-sensitive).
  - **Server Record:** Append-only `consent_records` table storing consent flags (plain booleans, newest-wins reads) for legal proof of consent (GDPR Art. 7). Zero-knowledge encryption applies to `secure_data` submissions only; consent records are deliberately stored unencrypted as non-sensitive operational data.
- **Verification:** Manual testing of consent flow; audit log records consent events with timestamps.

### GDPR Art. 17 - Right to Erasure
- **Requirement:** Users may request deletion of personal information
- **Implementation:** 
  - `netlify/functions/delete-user.js` handles deletion requests
  - Requires password re-authentication in addition to the session — a stolen session cookie alone cannot erase an account. MFA is additionally enforced for users who enrolled (`requireMFAIfEnrolled`).
  - Frontend guard (`DeleteAccountForm.tsx`): typed confirmation phrase ("DELETE") required before submission
  - Cookie contract: deletion clears `auth_token` and `csrf_token` with attributes exactly matching login (attribute-parity rule shared with `login.js`/`logout.js`)
  - Audit logs survive erasure: `user_id` FK uses `ON DELETE SET NULL`, so the GDPR erasure trail outlives the account
  - Confirmation sent upon completion
- **SLA:** 30-day response window as per regulation
- **Verification:** Automated test suite validates deletion flow

### GDPR Art. 30 / Audit Logging
- **Requirement:** Records of processing activities
- **Implementation:** 
  - All sensitive events (login, MFA setup/rotation/verification, backup-code generation, consent changes, erasure) logged with constraint-validated JSONB details
  - Database `CHECK` constraint (`chk_event_type_valid`) whitelists valid event types
  - Append-oriented writes; erasure records survive via `FK ON DELETE SET NULL`
  - Mutating endpoints protected by CSRF double-submit validation, not header secrets
  - **Note:** Immutability is not currently enforced at the database level. A `BEFORE UPDATE OR DELETE` trigger raising an exception is the standard upgrade path and is under consideration (see Audit Trail below).
- **Verification:** Manual inspection of schema; event-type constraint enforced at insert time

### GDPR Art. 32 - Security of Processing
- **Requirement:** Appropriate technical measures to secure personal data
- **Implementation:** 
  - Client-side encryption using `crypto.ts` (AES-GCM 256 + PBKDF2, native Web Crypto API)
  - 100,000 PBKDF2 iterations for key derivation; unique salt and IV per encryption operation
  - Round-trip integrity check (decrypt-and-compare) before any network submission
  - CSRF double-submit validation on all state-changing endpoints (`_middleware/csrf-check`)
  - Optional TOTP MFA: `requireMFAIfEnrolled` middleware enforces verification for enrolled users; `mfaVerified` JWT claim issued only after successful second-factor verification. Password re-authentication required for destructive actions.
  - Atomic Redis rate limiting (Upstash in production, mock in dev) on every endpoint, including pre-auth IP limiting on login
  - JWT sessions in HttpOnly, Secure cookies with a documented cookie attribute-parity contract across `login.js`, `logout.js`, `delete-user.js`
- **Verification:** Third-party penetration testing scheduled Q3 2026

### CCPA §1798.105 - Right to Delete
- **Requirement:** Consumers may request deletion of personal information
- **Implementation:** Same endpoint as GDPR Art. 17 (`delete-user.js`), including password re-authentication
- **SLA:** 45-day response window as per regulation
- **Verification:** Automated test suite validates deletion flow

---

## Compliance Checklist

### Completed ✅
- [x] Annual privacy impact assessment (DPIA) - `docs/dpia-report.md`
- [x] Data processing agreement (DPA) with vendors
- [x] Employee privacy training completed
- [x] Consent mechanism implemented with granular options (fail-open collection; append-only server record)
- [x] Right to erasure endpoint implemented (password re-authentication; erasure-surviving audit trail)
- [x] Client-side end-to-end encryption for secure submissions (`secure_data`)
- [x] Optional MFA available for all user accounts with middleware enforcement for enrollees
- [x] CSRF double-submit validation on all mutating endpoints
- [x] Atomic rate limiting on every endpoint (including pre-auth login limiter)
- [x] Constraint-validated audit logging with erasure-surviving records

### In Progress 🔄
- [ ] SOC 2 Type II certification (Target: Q4 2026)
- [ ] Data portability endpoint (Target: Q3 2026)
- [ ] Incident response plan tested (Target: Q4 2026)
- [ ] Vendor risk assessment completed
- [ ] Database-enforced audit log immutability (trigger migration under evaluation)

### Planned ⏳
- [ ] Right to restrict processing feature (Target: Q4 2026)
- [ ] Automated DPIA tool integration
- [ ] Cross-border data transfer assessment
- [ ] Regular penetration testing schedule (Quarterly)

---

## Evidence Repository

| Document | Location | Last Updated |
| :--- | :--- | :--- |
| Privacy Policy | `docs/privacy-policy.md` | 2026-04-23 |
| DPIA Report | `docs/dpia-report.md` | 2026-04-10 |
| Risk Register | `docs/risk-register.md` | 2026-04-15 |
| Stakeholder Map | `docs/stakeholder-map.md` | 2026-04-17 |
| Roadmap | `docs/roadmap.md` | 2026-04-17 |
| Root README (auth architecture, cookie contract, verification checklist) | `README.md` | 2026-11-06 |
| Frontend README | `frontend/README.md` | 2026-11-06 |
| CSRF middleware | `netlify/functions/_middleware/csrf-check` | 2026-11-06 |
| MFA enforcement middleware | `netlify/functions/_middleware/require-mfa.js` | 2026-11-06 |
| Combined Documentation | `docs/COMBINED.md` | Auto-generated |

---

## Audit Trail

| Date | Action | Performed By | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-06 | Updated regulatory matrix | Legal / Compliance | Aligned with the Unreleased auth security overhaul: corrected consent storage description (append-only plain records, not encrypted), removed "immutable"/"encrypted" audit log overclaims (immutability not DB-enforced; added as in-progress trigger migration), corrected Art. 17/32 to reflect password re-authentication and optional MFA with `requireMFAIfEnrolled`, added CSRF middleware, rate limiting, and cookie-parity contract as Art. 32/CC6.1 evidence. Based on code verification session of 2026-11-06. |
| 2026-04-23 | Updated regulatory matrix | Legal / Compliance | Clarified consent storage mechanism (Local Plain vs. Server Encrypted) |
| 2026-04-21 | Updated regulatory matrix | Legal / Compliance | Added MFA, Right to Erasure implementations |
| 2026-04-17 | Initial matrix creation | Legal / Compliance | Baseline compliance documentation |
| 2026-04-10 | DPIA completed | Security Team | Identified 3 medium-risk items |

---

## Contact Information

| Role | Responsibility | Contact |
| :--- | :--- | :--- |
| Data Protection Officer | GDPR compliance oversight | hello@indoscient.in |
| Legal Liaison | Regulatory requirements | hello@indoscient.in |
| Security Engineer | Technical implementation | hello@indoscient.in |
| Product Manager | Feature prioritization | hello@indoscient.in |

---

*This document is version-controlled and should be reviewed quarterly or when significant changes are made to the product architecture or data processing activities.*
