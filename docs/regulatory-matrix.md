# Regulatory Matrix

Compliance requirements and implementation status for secure-web-product.

> **Last Updated:** 2026-04-21  
> **Owner:** Legal / Compliance  
> **Next Review:** Q3 2026 (Pre-Penetration Testing)

---

## GDPR Compliance Matrix

| Article | Requirement | Implementation Status | Evidence Location |
| :--- | :--- | :--- | :--- |
| **Art. 5** | Data Minimisation | ✅ Implemented | `SecureForm.tsx` (only collects name/email) |
| **Art. 6** | Lawful Basis for Processing | ✅ Implemented | `ConsentBanner.tsx` (explicit consent) |
| **Art. 7** | Conditions for Consent | ✅ Implemented | `ConsentBanner.tsx` (granular, revocable) |
| **Art. 12** | Transparent Information | ✅ Implemented | `docs/privacy-policy.md` |
| **Art. 15** | Right of Access | ⏳ Planned | Q3 2026 (Data Export Endpoint) |
| **Art. 16** | Right to Rectification | ⏳ Planned | Q3 2026 (User Profile Edit) |
| **Art. 17** | Right to Erasure | ✅ Implemented | `netlify/functions/delete-user.js` |
| **Art. 18** | Right to Restrict Processing | ⏳ Planned | Q4 2026 (Account Freeze Feature) |
| **Art. 20** | Right to Data Portability | ⏳ Planned | Q3 2026 (Export as JSON/CSV) |
| **Art. 25** | Data Protection by Design | ✅ Implemented | `crypto.ts` (E2EE by default) |
| **Art. 30** | Records of Processing | ✅ Implemented | `audit_log.js` (Encrypted immutable logs) |
| **Art. 32** | Security of Processing | ✅ Implemented | `crypto.ts` (AES-GCM + PBKDF2) |
| **Art. 33** | Breach Notification | ⏳ Planned | Q4 2026 (Incident Response Plan) |
| **Art. 35** | DPIA Required | ✅ Completed | `docs/dpia-report.md` |

---

## CCPA Compliance Matrix

| Section | Requirement | Implementation Status | Evidence Location |
| :--- | :--- | :--- | :--- |
| **§1798.100** | Notice at Collection | ✅ Implemented | `ConsentBanner.tsx` |
| **§1798.105** | Right to Delete | ✅ Implemented | `netlify/functions/delete-user.js` |
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
| **CC5.1** | Control Activities | ✅ Implemented | `netlify/functions/audit_log.js` |
| **CC6.1** | Logical Access Security | ✅ Implemented | `MFASetup.tsx`, `verify-mfa.js` |
| **CC6.6** | Encryption | ✅ Implemented | `crypto.ts` (AES-GCM + PBKDF2) |
| **CC7.1** | System Monitoring | ✅ Implemented | `audit_log.js` (Immutable logs) |
| **CC8.1** | Change Management | ✅ Implemented | `.github/workflows/ci.yml` |

---

## Implementation Notes

### GDPR Art. 5 - Data Minimisation
- **Requirement:** Collect only data necessary for specified purposes
- **Implementation:** 
  - `SecureForm.tsx` only collects name and email
  - Consent timestamps stored only; no PII retained without explicit consent
  - User data encrypted client-side before transmission
- **Verification:** Automated scan in CI pipeline checks for PII patterns

### GDPR Art. 7 - Conditions for Consent
- **Requirement:** Consent must be freely given, specific, informed, and unambiguous
- **Implementation:** 
  - `ConsentBanner.tsx` provides granular consent (Essential vs. Analytics)
  - Users can reject non-essential cookies without penalty
  - Consent stored encrypted with timestamp and version
- **Verification:** Manual testing of consent flow; audit log records consent events

### GDPR Art. 17 - Right to Erasure
- **Requirement:** Users may request deletion of personal information
- **Implementation:** 
  - `netlify/functions/delete-user.js` handles deletion requests
  - Requires MFA verification before processing
  - Audit logs anonymized (PII redacted, keys destroyed)
  - Confirmation sent upon completion
- **SLA:** 30-day response window as per regulation
- **Verification:** Automated test suite validates deletion flow

### GDPR Art. 32 - Security of Processing
- **Requirement:** Appropriate technical measures to secure personal data
- **Implementation:** 
  - Client-side encryption using `crypto.ts` (AES-GCM + PBKDF2)
  - 100,000 PBKDF2 iterations for key derivation
  - Unique salt and IV per encryption operation
  - MFA required for sensitive operations
- **Verification:** Third-party penetration testing scheduled Q3 2026

### CCPA §1798.105 - Right to Delete
- **Requirement:** Consumers may request deletion of personal information
- **Implementation:** Same endpoint as GDPR Art. 17 (`delete-user.js`)
- **SLA:** 45-day response window as per regulation
- **Verification:** Automated test suite validates deletion flow

---

## Compliance Checklist

### Completed ✅
- [x] Annual privacy impact assessment (DPIA) - `docs/dpia-report.md`
- [x] Data processing agreement (DPA) with vendors
- [x] Employee privacy training completed
- [x] Consent mechanism implemented with granular options
- [x] Right to erasure endpoint implemented
- [x] End-to-end encryption for all user data
- [x] MFA available for all user accounts
- [x] Immutable audit logging system

### In Progress 🔄
- [ ] SOC 2 Type II certification (Target: Q4 2026)
- [ ] Data portability endpoint (Target: Q3 2026)
- [ ] Incident response plan tested (Target: Q4 2026)
- [ ] Vendor risk assessment completed

### Planned ⏳
- [ ] Right to restrict processing feature (Target: Q4 2026)
- [ ] Automated DPIA tool integration
- [ ] Cross-border data transfer assessment
- [ ] Regular penetration testing schedule (Quarterly)

---

## Evidence Repository

| Document | Location | Last Updated |
| :--- | :--- | :--- |
| Privacy Policy | `docs/privacy-policy.md` | 2026-04-17 |
| DPIA Report | `docs/dpia-report.md` | 2026-04-10 |
| Risk Register | `docs/risk-register.md` | 2026-04-15 |
| Stakeholder Map | `docs/stakeholder-map.md` | 2026-04-17 |
| Roadmap | `docs/roadmap.md` | 2026-04-17 |
| Combined Documentation | `docs/COMBINED.md` | Auto-generated |

---

## Audit Trail

| Date | Action | Performed By | Notes |
| :--- | :--- | :--- | :--- |
| 2026-04-21 | Updated regulatory matrix | Legal / Compliance | Added MFA, Right to Erasure implementations |
| 2026-04-17 | Initial matrix creation | Legal / Compliance | Baseline compliance documentation |
| 2026-04-10 | DPIA completed | Security Team | Identified 3 medium-risk items |

---

## Contact Information

| Role | Responsibility | Contact |
| :--- | :--- | :--- |
| Data Protection Officer | GDPR compliance oversight | dpo@securewebproducts.com |
| Legal Liaison | Regulatory requirements | legal@securewebproducts.com |
| Security Engineer | Technical implementation | security@securewebproducts.com |
| Product Manager | Feature prioritization | pm@securewebproducts.com |

---

*This document is version-controlled and should be reviewed quarterly or when significant changes are made to the product architecture or data processing activities.*

