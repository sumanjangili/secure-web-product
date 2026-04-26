# Risk Register

**Project:** Secure Web Product Starter Kit  
**Version:** 1.0  
**Last Updated:** 2026-04-15  
**Owner:** Security Analyst  
**Review Cycle:** Quarterly (Next: Q3 2026)

## 1. Risk Methodology
Risks are assessed based on **Likelihood** (1-5) and **Impact** (1-5).  
**Risk Score = Likelihood × Impact**.  
- **Critical (20-25):** Immediate action required.
- **High (15-19):** Action required within 30 days.
- **Medium (10-14):** Action required within 90 days.
- **Low (<10):** Monitor and accept.

---

## 2. Risk Inventory

### A. Cryptographic & Data Security Risks

| ID | Risk Description | Likelihood | Impact | Score | Mitigation Controls (Implemented) | Residual Risk | Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **CR-01** | **Weak Client-Side Passwords**<br>User chooses a weak password, making the derived encryption key vulnerable to brute-force attacks. | 3 | 5 | **15** | • **PBKDF2** with 100,000 iterations.<br>• Minimum 8-char password enforcement (`SecureForm.tsx`).<br>• Rate limiting on login attempts. | **Low** | ✅ Active |
| **CR-02** | **Key Loss / Data Irrecoverability**<br>User loses their password or session key, rendering their encrypted data permanently inaccessible. | 4 | 5 | **20** | • **Backup Codes** generated during MFA setup (`MFASetup.tsx`).<br>• Clear UI warnings about key loss.<br>• No "backdoor" or master key exists. | **Medium** | ✅ Active |
| **CR-03** | **Algorithm Vulnerability**<br>Discovery of a critical flaw in AES-GCM or Web Crypto API implementation. | 1 | 5 | **5** | • Use of **Native Web Crypto API** (browser-vetted).<br>• Standard **AES-GCM 256-bit**.<br>• Quarterly dependency audits. | **Low** | ✅ Active |
| **CR-04** | **Memory Scraping**<br>Malicious browser extension or malware extracting plaintext data from React state before encryption. | 2 | 5 | **10** | • **Explicit Memory Clearing**: `clearSensitiveData()` called immediately after encryption.<br>• No plaintext stored in `localStorage` or cookies. | **Low** | ✅ Active |

### B. Infrastructure & Operational Risks

| ID | Risk Description | Likelihood | Impact | Score | Mitigation Controls (Implemented) | Residual Risk | Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **INF-01** | **Server-Side Data Breach**<br>Attacker compromises Netlify/PostgreSQL and accesses the database. | 2 | 5 | **10** | • **Zero-Knowledge Architecture**: Only ciphertext stored.<br>• **Blind Indexing**: Hashes used for search, not PII.<br>• `x-audit-secret` header validation. | **Low** | ✅ Active |
| **INF-02** | **Audit Log Tampering**<br>Admin or attacker modifies audit logs to cover tracks. | 1 | 4 | **4** | • **Immutable Logging**: Logs written to append-only structure.<br>• Separate `audit_logs` table with restricted write access.<br>• Hash chaining (planned for v2). | **Low** | ✅ Active |
| **INF-03** | **Denial of Service (DoS)**<br>Attackers flood the `/api/audit-log` or login endpoints. | 3 | 3 | **9** | • **Rate Limiting**: 429 responses with `retryAfter` headers.<br>• Netlify Edge Functions for traffic filtering.<br>• Input validation on JSON payloads. | **Low** | ✅ Active |

### C. Compliance & Legal Risks

| ID | Risk Description | Likelihood | Impact | Score | Mitigation Controls (Implemented) | Residual Risk | Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **COM-01** | **GDPR Right to Erasure Failure**<br>Inability to delete user data due to encryption key loss or database constraints. | 2 | 5 | **10** | • `delete-user.js` function deletes the **entire row** (ciphertext + metadata).<br>• Key destruction renders remaining data useless.<br>• MFA verification required for deletion. | **Low** | ✅ Active |
| **COM-02** | **Inadequate Consent Management**<br>Users claim they did not consent to analytics, but no proof exists. | 2 | 4 | **8** | • **Encrypted Consent Storage**: `ConsentBanner.tsx` stores timestamp/version in `localStorage`.<br>• Audit log records consent events. | **Low** | ✅ Active |
| **COM-03** | **Cross-Border Data Transfer**<br>Data stored in US (Netlify) while users are in EU, violating GDPR Chapter V. | 3 | 3 | **9** | • **Encryption**: Data is unreadable in transit and at rest.<br>• Standard Contractual Clauses (SCCs) signed with vendor.<br>• Transparency in `privacy-policy.md`. | **Low** | ✅ Active |

### D. Future/Planned Risks (Q3-Q4 2026)

| ID | Risk Description | Likelihood | Impact | Score | Planned Mitigation | Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| **FUT-01** | **Penetration Test Findings**<br>Third-party audit reveals logic flaws in encryption flow. | 3 | 4 | **12** | • Scheduled Pen-Test (Q3 2026).<br>• Bug Bounty program launch. | ⏳ Planned |
| **FUT-02** | **Data Portability Complexity**<br>Difficulty exporting encrypted data in a usable format for users. | 4 | 3 | **12** | • Develop `export-data` endpoint (Q3 2026).<br>• Provide client-side decryption tool for export. | ⏳ Planned |

---

## 3. Risk Treatment Plan

### Immediate Actions (Critical/High)
- [x] **CR-01**: Enforce password complexity and PBKDF2 iterations (Done).
- [x] **CR-02**: Implement backup code generation flow (Done).
- [ ] **FUT-01**: Schedule external penetration test by June 2026.

### Monitoring Actions (Medium/Low)
- [ ] **INF-01**: Review Netlify security logs weekly.
- [ ] **COM-01**: Test `delete-user` flow monthly to ensure data is actually removed.
- [ ] **CR-04**: Monitor browser compatibility for Web Crypto API.

---

## 4. Approval & Sign-off

| Role | Name | Signature | Date |
| :--- | :--- | :--- | :--- |
| **Security Analyst** | [Name] | __________________ | 2026-04-15 |
| **Engineering Lead** | [Name] | __________________ | 2026-04-15 |
| **Product Manager** | [Name] | __________________ | 2026-04-15 |

---
*This register is linked to the `Regulatory Matrix` and `DPIA Report`. Updates are triggered by code changes or audit findings.*
