# Roadmap

Development milestones and ownership for secure-web-product.

> **Last Updated:** 2026-04-29  
> **Owner:** Product Manager  
> **Next Review:** Q3 2026 (Pre-Penetration Testing)

---

## Quarterly Milestones

| Quarter | Milestone | Owner | Status | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **Q4 2025** | Release MVP (Core Encryption & Consent) | Front-end Lead | ✅ **Complete** | None |
| **Q1 2026** | **Full Auth & MFA System** (PostgreSQL, JWT, TOTP) | Security Engineer | ✅ **Complete** | MVP Stability |
| **Q2 2026** | **GDPR/CCPA Compliance Audit** & Remediation | Legal Liaison | 🔄 **In Progress** | MFA Completion, DPIA |
| **Q3 2026** | **Penetration Testing** & Data Portability | Security Analyst | ⏳ **Planned** | Audit Clearance |
| **Q4 2026** | **SOC 2 Type II Certification** | Operations / DevOps | ⏳ **Planned** | Pen-test Clearance |

---

## Milestone Details

### Q4 2025 - MVP Release (Completed)
- **Deliverables:** Core client-side encryption (AES-GCM), consent UI, basic API structure.
- **Success Criteria:** 100+ beta users, zero critical vulnerabilities in initial scan.
- **Status:** Successfully deployed; foundation for subsequent auth layers.

### Q1 2026 - Full Auth & MFA System (Completed)
- **Deliverables:** 
  - TOTP-based Multi-Factor Authentication (Google Authenticator/Authy compatible).
  - Backup code generation and recovery flow.
  - Migration to PostgreSQL for persistent user data.
  - JWT session management with Argon2id hashing.
  - Hybrid Redis implementation (Upstash for prod, Mock for local dev).
- **Success Criteria:** 95% user adoption of MFA, successful end-to-end login flow, zero timeout issues in local dev.
- **Key Achievement:** Transitioned from demo architecture to production-ready zero-knowledge system.

### Q2 2026 - GDPR/CCPA Compliance Audit (In Progress)
- **Deliverables:** 
  - Completion of Data Protection Impact Assessment (DPIA).
  - Implementation of Right to Access (Data Export) and Right to Rectification.
  - Third-party audit report and remediation plan.
- **Success Criteria:** No major non-conformities; 100% of "Implemented" items in Regulatory Matrix verified.
- **Current Focus:** Finalizing `delete-user.js` SLA verification and preparing for Q3 pen-test.

### Q3 2026 - Penetration Testing & Data Portability (Planned)
- **Deliverables:** 
  - External third-party penetration test (scheduled pre-Q3 end).
  - Implementation of Data Portability (JSON/CSV export endpoint).
  - Automated DPIA tool integration.
- **Success Criteria:** All critical/high vulnerabilities resolved; successful data export flow.
- **Dependencies:** Completion of Q2 audit remediation.

### Q4 2026 - SOC 2 Type II Certification (Planned)
- **Deliverables:** 
  - Full SOC 2 Type II audit engagement.
  - Incident Response Plan testing.
  - Vendor risk assessment completion.
- **Success Criteria:** Issuance of SOC 2 Type II report.
- **Dependencies:** Successful Q3 penetration test and 6 months of continuous control monitoring.

---

## Blockers & Risks

| Risk | Impact | Mitigation | Owner |
| :--- | :--- | :--- | :--- |
| **Regulatory Changes** | High | Monthly legal review; agile adaptation of compliance matrix. | Legal Liaison |
| **Key Personnel Turnover** | Medium | Comprehensive documentation (README, Changelog); cross-training. | Engineering Lead |
| **Third-Party API Limits** (Upstash/DB) | Medium | Hybrid Mock Redis for local dev; rate limiting and caching strategies. | Operations / DevOps |
| **Pen-Test Findings** | High | Dedicated sprint buffer in Q3 for immediate remediation. | Security Analyst |

---

*This document is version-controlled and should be reviewed quarterly or when significant changes are made to the product architecture or data processing activities.*
