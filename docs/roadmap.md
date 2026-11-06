# Roadmap

Development milestones and ownership for secure-web-product.

> **Last Updated:** 2026-11-06  
> **Owner:** Product Manager  
> **Next Review:** Q4 2026 (Pre-SOC 2 Evidence Collection)

---

## Quarterly Milestones

| Quarter | Milestone | Owner | Status | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **Q4 2025** | Release MVP (Core Encryption & Consent) | Front-end Lead | ✅ **Complete** | None |
| **Q1 2026** | **Auth Foundation** (PostgreSQL, JWT, Argon2id, audit logging, CI) — *shipped as v1.1.0* | Security Engineer | ✅ **Complete** | MVP Stability |
| **Q2 2026** | **GDPR/CCPA Compliance Audit** & Remediation | Legal Liaison | 🔄 **In Progress** | Auth Security Overhaul, DPIA |
| **Q3 2026** | **Penetration Testing** & Data Portability | Security Analyst | ⚠️ **Slipped** (was Planned for Q3; not yet executed as of Nov 2026) | Audit Clearance |
| **Q4 2026** | **Auth Security Overhaul** (CSRF, optional-MFA middleware, password re-auth erasure, rate limiting, cookie parity) — *code-complete, shipping as v1.2.0* | Security Engineer | ✅ **Code Complete** (pending release) | Auth Foundation |
| **Q4 2026** | **SOC 2 Type II Certification** | Operations / DevOps | ⏳ **Planned** | Pen-test Clearance, v1.2.0 release |

---

## Milestone Details

### Q4 2025 - MVP Release (Completed)
- **Deliverables:** Core client-side encryption (AES-GCM), consent UI, basic API structure.
- **Success Criteria:** 100+ beta users, zero critical vulnerabilities in initial scan.
- **Status:** Successfully deployed; foundation for subsequent auth layers.

### Q1 2026 - Auth Foundation (Completed — shipped as v1.1.0, 2026-04-28)
- **Deliverables:** 
  - Migration to PostgreSQL for persistent user data and audit logs.
  - JWT session management with Argon2id password hashing.
  - Initial audit logging (`audit_log.js`) and CI/CD pipeline (lint, test, security audit).
  - Monorepo structure (Vite frontend + Netlify Functions).
- **Scope correction (2026-11-06):** The original entry claimed the full MFA system and "zero local-dev timeout issues" were delivered here. Per the changelog, TOTP MFA, backup codes, Mock Redis timeout elimination, and rate limiting landed in the later Auth Security Overhaul, not Q1. Status and deliverables adjusted accordingly.
- **Success Criteria:** Stable production deployment; CI green; audit logging operational.
- **Key Achievement:** Transitioned from demo architecture to a production-ready foundation.

### Q2 2026 - GDPR/CCPA Compliance Audit (In Progress)
- **Deliverables:** 
  - Completion of Data Protection Impact Assessment (DPIA).
  - Implementation of Right to Access (Data Export) and Right to Rectification.
  - Third-party audit report and remediation plan.
- **Success Criteria:** No major non-conformities; 100% of "Implemented" items in Regulatory Matrix verified against code.
- **Progress (2026-11-06):** Regulatory Matrix fully corrected and aligned with the actual implementation (consent storage, audit logging semantics, erasure controls) following a code-verification session. Documentation overclaims (encrypted consent records, immutable audit logs, MFA-required deletion) resolved.
- **Current Focus:** Verifying the corrected `delete-user.js` flow end-to-end (password re-auth, cookie parity, erasure-surviving audit trail) and closing out the audit remediation plan.

### Q3 2026 → slipped - Penetration Testing & Data Portability (Not yet executed)
- **Deliverables:** 
  - External third-party penetration test.
  - Implementation of Data Portability (JSON/CSV export endpoint).
  - Automated DPIA tool integration.
- **Success Criteria:** All critical/high vulnerabilities resolved; successful data export flow.
- **Dependencies:** Completion of Q2 audit remediation; recommend scheduling immediately after the v1.2.0 release so the pen-test covers the final auth stack.
- **Status note (2026-11-06):** Original target was Q3; the milestone has slipped into Q4. Re-baseline the date at the next planning session.

### Q4 2026 - Auth Security Overhaul (Code Complete — shipping as v1.2.0)
- **Deliverables:**
  - CSRF double-submit validation on all mutating endpoints (`_middleware/csrf-check`).
  - Optional-MFA enforcement (`requireMFAIfEnrolled` middleware; `mfaVerified` JWT claim).
  - Full TOTP MFA flow with 12-char Argon2-hashed backup codes.
  - Password re-authentication for GDPR account erasure (`delete-user`).
  - Atomic Redis rate limiting on every endpoint, including pre-auth login limiter.
  - Cookie attribute-parity contract across `login.js` / `logout.js` / `delete-user.js`.
  - Hybrid Redis client (Upstash prod / Mock dev); local-dev timeout fixes.
  - Typed error handling with centralized `getErrorMessage` helper; 3 TS build errors resolved.
  - Corrected root README, new frontend README, corrected Regulatory Matrix.
- **Success Criteria:** Full CI suite green (lint, type-check, tests, build, audit); verification checklist passed (MFA end-to-end, cookie-parity logout check, erasure → `user_id = NULL` audit trail).
- **Dependencies:** Auth Foundation (v1.1.0).

### Q4 2026 - SOC 2 Type II Certification (Planned)
- **Deliverables:** 
  - Full SOC 2 Type II audit engagement.
  - Incident Response Plan testing.
  - Vendor risk assessment completion.
  - Database-enforced audit log immutability (trigger migration) — strengthens CC5.1/CC7.1 evidence.
- **Success Criteria:** Issuance of SOC 2 Type II report.
- **Dependencies:** Successful penetration test and 6 months of continuous control monitoring; v1.2.0 release (auditors will assess the shipped auth stack).

---

## Blockers & Risks

| Risk | Impact | Mitigation | Owner |
| :--- | :--- | :--- | :--- |
| **Regulatory Changes** | High | Monthly legal review; agile adaptation of compliance matrix. | Legal Liaison |
| **Key Personnel Turnover** | Medium | Comprehensive documentation (README, Changelog); cross-training. | Engineering Lead |
| **Third-Party API Limits** (Upstash/DB) | Medium | Hybrid Mock Redis for local dev; rate limiting and caching strategies. | Operations / DevOps |
| **Pen-Test Findings** | High | Dedicated sprint buffer post-pen-test for immediate remediation. | Security Analyst |
| **Pen-Test Schedule Slip** (occurred Q3) | Medium | Re-baseline at next planning session; pen-test before SOC 2 evidence window. | Product Manager |
| **Documentation Drift** | Medium | Docs overclaimed controls (found & fixed 2026-11-06 in README + Regulatory Matrix). Mitigation: verify compliance-facing docs against code each release; include in release checklist. | Product Manager |
| **Audit Log Immutability Gap** | Low-Medium | Immutability not DB-enforced; trigger migration tracked in Regulatory Matrix (In Progress) and scoped into SOC 2 prep. | Security Engineer |

---

*This document is version-controlled and should be reviewed quarterly or when significant changes are made to the product architecture or data processing activities.*
