# Data Protection Impact Assessment (DPIA)

**Project Name:** Secure Web Product Starter Kit  
**Date of Assessment:** 2026-04-10  
**Assessor:** Security Team & Legal Liaison  
**Review Status:** ✅ Completed  
**Next Review:** Q3 2026 (Pre-Penetration Testing)

## 1. Executive Summary
This DPIA evaluates the risks associated with the "Secure Web Product" platform, which implements a **Zero-Knowledge Architecture** for secure contact forms and audit logging. The assessment concludes that while the system processes personal data, the implementation of **client-side encryption** significantly mitigates the risk of unauthorized access, making the residual risk **Low**.

## 2. Nature, Scope, Context, and Purposes
- **Nature:** Processing of personal data (names, emails, messages) via a public-facing web form.
- **Scope:** Global users submitting data via the `SecureForm` component.
- **Context:** A production-ready Vite + React application hosted on Netlify with a PostgreSQL backend.
- **Purpose:** To provide a secure channel for users to submit sensitive inquiries without exposing plaintext data to the service provider.

## 3. Necessity and Proportionality
- **Data Minimisation:** The system collects only the minimum data required (Name, Email, Message). No unnecessary metadata is stored.
- **Encryption by Design:** The decision to use **AES-GCM 256-bit** encryption client-side ensures that the service provider (us) cannot access the data, fulfilling the principle of "Data Protection by Design and Default" (GDPR Art. 25).
- **Consent:** Explicit, granular consent is obtained via `ConsentBanner.tsx` before any non-essential tracking occurs.

## 4. Risk Assessment

### Identified Risks
| Risk ID | Description | Likelihood | Impact | Initial Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| **R1** | **Brute-force attack on weak passwords** | Medium | High | **High** |
| **R2** | **Man-in-the-Middle (MitM) attack** | Low | High | **Medium** |
| **R3** | **Loss of user encryption key** | Medium | High | **High** |
| **R4** | **Metadata leakage via audit logs** | Low | Medium | **Low** |
| **R5** | **Server-side compromise** | Low | Medium | **Low** |

### Mitigation Strategies
| Risk ID | Mitigation Measure | Residual Risk |
| :--- | :--- | :--- |
| **R1** | Enforced **PBKDF2** with 100k iterations; Minimum 8-char password policy; Rate limiting on login. | **Low** |
| **R2** | Mandatory **TLS 1.3**; HSTS headers; Content Security Policy (CSP). | **Low** |
| **R3** | Generation of **12-character backup codes** during MFA setup; Clear user warnings about key loss. | **Medium** (User responsibility) |
| **R4** | Audit logs store only **blind index hints** (SHA-256 hashes) and metadata, not PII. | **Low** |
| **R5** | Data is encrypted before leaving the client; Server compromise yields only ciphertext. | **Low** |

## 5. Consultation & Stakeholder Input
- **Engineering Lead:** Confirmed implementation of Web Crypto API and memory clearing strategies.
- **Legal / Compliance:** Verified alignment with GDPR Art. 32 (Security of Processing) and Art. 35 (DPIA requirement).
- **UX Designer:** Ensured consent flows are clear and not "dark patterns."

## 6. Conclusion
The processing of personal data in the Secure Web Product is **lawful and proportionate**. The implementation of client-side encryption effectively neutralizes the primary risk of data exposure.

**Residual Risk Rating:** **LOW**  
**Recommendation:** Proceed to production. Schedule penetration testing for Q3 2026 to validate encryption implementation.

## 7. Action Plan
| Action Item | Owner | Deadline | Status |
| :--- | :--- | :--- | :--- |
| Implement automated password strength meter | Engineering | Q2 2026 | ⏳ Planned |
| Conduct third-party penetration test | Security Analyst | Q3 2026 | ⏳ Planned |
| Update DPIA after pen-test results | Legal | Q4 2026 | ⏳ Planned |
| Finalize Data Portability feature | Product | Q3 2026 | ⏳ Planned |

## 8. Sign-off
- **Data Protection Officer:** ____________________ (Date: 2026-04-10)
- **Product Manager:** ____________________ (Date: 2026-04-10)
- **Engineering Lead:** ____________________ (Date: 2026-04-10)

---
*This document is part of the regulatory evidence repository. See `docs/regulatory-matrix.md` for cross-references.*
