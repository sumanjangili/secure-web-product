# Risk Register

**Project:** Secure Web Product  
**Version:** 2.0  
**Last Updated:** 2026-11-06  
**Owner:** Security Analyst  
**Review Cycle:** Quarterly (Next: Q1 2027)

## Revision Note (v2.0, 2026-11-06)
This register was re-verified against the codebase following the Auth Security
Overhaul (see CHANGELOG `[Unreleased]` / v1.2.0). Several v1.0 entries claimed
controls that do not exist in code (`x-audit-secret` header validation,
"immutable" audit logging, "blind indexing", "encrypted consent storage") or
misattributed mitigations (backup codes presented as encryption-key recovery).
Those entries are corrected below. New risks identified during the overhaul
(CSRF/session hijacking, stolen-cookie deletion, documentation drift) are added.

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
| **CR-01** | **Weak Client-Side Passwords**<br>User chooses a weak encryption password, making the derived key vulnerable to brute-force attacks. | 3 | 5 | **15** | • **PBKDF2** with 100,000 iterations (`crypto.ts`).<br>• Minimum 8-char password enforcement (`SecureForm.tsx`).<br>• Atomic Redis rate limiting on endpoints. | **Low** | ✅ Active |
| **CR-02** | **Key Loss / Data Irrecoverability**<br>User loses their encryption password, rendering their encrypted data permanently inaccessible. **By design:** zero-knowledge architecture means no recovery path exists — no backdoor or master key. | 4 | 5 | **20** | • Clear UI warnings that lost encryption passwords mean unrecoverable data (`SecureForm.tsx` help text).<br>• Round-trip integrity check before submission reduces accidental corruption.<br>• **Note:** MFA backup codes recover *authentication*, NOT encryption keys — see new split risk CR-05 for the MFA-access dimension. | **Medium** (inherent to design; accepted by product) | ✅ Active |
| **CR-03** | **Algorithm Vulnerability**<br>Discovery of a critical flaw in AES-GCM or Web Crypto API implementation. | 1 | 5 | **5** | • Use of **Native Web Crypto API** (browser-vetted).<br>• Standard **AES-GCM 256-bit**.<br>• Dependency audits in CI (`npm audit --audit-level=high`). | **Low** | ✅ Active |
| **CR-04** | **Memory Scraping**<br>Malicious browser extension or malware extracting plaintext data from React state before encryption. | 2 | 5 | **10** | • **Explicit memory clearing**: `clearSensitiveData()` / `clearEncryptionSecret()` called on success, error, and unmount paths (`SecureForm.tsx`, `LoginForm.tsx`, `DeleteAccountForm.tsx`).<br>• No plaintext secrets stored in `localStorage` or cookies.<br>• Login password cleared before MFA step transition. | **Low** | ✅ Active |
| **CR-05** | **MFA Lockout / Backup Code Exhaustion** *(split from CR-02, 2026-11-06)*<br>User loses authenticator device and exhausts or loses all 10 backup codes, locking themselves out of the account. | 3 | 3 | **9** | • 10 one-time-use backup codes (12 hex chars, Argon2-hashed at rest) generated at enrollment and regenerable via `UserSettings.tsx`.<br>• Backup-code redemption flow at login (`LoginForm.tsx` backup-code step).<br>• Account recovery via support process (password + identity verification) as procedural fallback. | **Low** | ✅ Active |

### B. Infrastructure & Operational Risks

| ID | Risk Description | Likelihood | Impact | Score | Mitigation Controls (Implemented) | Residual Risk | Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **INF-01** | **Server-Side Data Breach**<br>Attacker compromises Netlify/PostgreSQL and accesses the database. | 2 | 5 | **10** | • **Zero-Knowledge Architecture**: only `{ ciphertext, salt, iv }` stored for secure submissions — server compromise yields ciphertext.<br>• **CSRF double-submit validation** on all mutating endpoints (`_middleware/csrf-check`); *(corrected 2026-11-06: no `x-audit-secret` header mechanism exists — v1.0 claim was inaccurate)*.<br>• Passwords hashed with Argon2id server-side. | **Low** | ✅ Active |
| **INF-02** | **Audit Log Tampering**<br>Admin or attacker modifies or deletes audit logs to cover tracks. | 1 | 4 | **4** | • **Append-oriented writes** with DB `CHECK` constraint (`chk_event_type_valid`) whitelisting event types.<br>• Erasure trail survives account deletion via `ON DELETE SET NULL` FK.<br>• **Known gap (honest disclosure):** immutability is NOT database-enforced. Mitigation upgrade — `BEFORE UPDATE OR DELETE` trigger raising an exception — is scoped for Q2 2027 (see FUT-03). *(Corrected 2026-11-06: v1.0 claimed "immutable" and "hash chaining planned for v2"; neither exists.)* | **Low-Medium** | 🔄 Mitigation Gap Tracked |
| **INF-03** | **Denial of Service (DoS)**<br>Attackers flood login, MFA, or form endpoints. | 3 | 3 | **9** | • **Atomic Redis rate limiting** (Upstash in production, mock in dev) on every endpoint, including a pre-auth IP limiter on login to defeat credential stuffing against unknown emails.<br>• 429 responses with parsed `Retry-After` headers and client-side countdown UI (`LoginForm.tsx`, `fetch-helper.ts`). | **Low** | ✅ Active |
| **INF-04** | **Session Hijacking / CSRF** *(added 2026-11-06)*<br>Cross-site request forgery or stolen-session attacks execute state-changing actions as the victim. | 3 | 5 | **15** | • **CSRF double-submit validation** on all state-changing endpoints (`_middleware/csrf-check`).<br>• HttpOnly, Secure JWT cookies; `/api/*` proxied through Netlify so cookies are first-party (avoids Safari ITP/partitioning issues).<br>• SameSite cookie attributes with a documented **attribute-parity contract** across `login.js` / `logout.js` / `delete-user.js`. | **Low** | ✅ Active |
| **INF-05** | **Logout/Erasure Cookie Invalidation Failure** *(added 2026-11-06)*<br>Cookie attribute mismatch causes "still logged in after logout" — an invalidated session remains live. | 2 | 4 | **8** | • **Cookie contract parity**: login/logout/delete must set and clear cookies with identical `Domain`/`SameSite`/`Secure` attributes, documented in root README; frontend DevTools verification included in release checklist.<br>• Stale-session detection on mount (`LoginForm.tsx` `checkAuthStatus`). | **Low** | ✅ Active |

### C. Compliance & Legal Risks

| ID | Risk Description | Likelihood | Impact | Score | Mitigation Controls (Implemented) | Residual Risk | Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| **COM-01** | **GDPR Right to Erasure Failure**<br>Inability to fully erase user data, or erasure performed without proper authorization. | 2 | 5 | **10** | • `delete-user.js` deletes user data; audit rows are anonymized (`user_id` set `NULL` via `ON DELETE SET NULL`) so the erasure trail survives as GDPR-required proof.<br>• **Password re-authentication required** — a stolen session cookie alone cannot erase an account. *(Corrected 2026-11-06: v1.0 claimed "MFA verification required"; MFA is optional and enforced only for enrolled users.)*<br>• Typed confirmation phrase ("DELETE") in `DeleteAccountForm.tsx` guards against accidental erasure.<br>• Automated test suite validates the deletion flow. | **Low** | ✅ Active |
| **COM-02** | **Inadequate Consent Management**<br>Users claim they did not consent to analytics, but no proof exists. | 2 | 4 | **8** | • **Append-only `consent_records`** table persists consent history (plain booleans, newest-wins reads) as legal proof (GDPR Art. 7). *(Corrected 2026-11-06: v1.0 claimed "encrypted consent storage"; records are deliberately unencrypted as non-sensitive operational data.)*<br>• Fail-open collection: if the consent check fails, the banner always shows — consent never silently suppressed.<br>• Audit log records consent events; rollback mechanism keeps local/server consistent.<br>• Single shared validator (`isValidConsent`) prevents malformed data on either path. | **Low** | ✅ Active |
| **COM-03** | **Cross-Border Data Transfer**<br>Data stored in US (Netlify) while users are in EU, violating GDPR Chapter V. | 3 | 3 | **9** | • **Encryption**: secure submission data is unreadable in transit and at rest (client-side AES-GCM).<br>• Standard Contractual Clauses (SCCs) signed with vendor.<br>• Transparency in `privacy-policy.md`. | **Low** | ✅ Active |
| **COM-04** | **Documentation Drift / Overclaimed Controls** *(added 2026-11-06)*<br>Compliance documents claim security controls that don't exist in code, creating audit exposure (GDPR Art. 5(1)(f) accuracy; ISO 27001 documentation). Found in README, Regulatory Matrix, and this register during the 2026-11-06 verification session. | 3 | 3 | **9** | • All compliance-facing docs re-verified against code and corrected (2026-11-06): root README, frontend README, Regulatory Matrix, DPIA, this register.<br>• **Process control:** doc-vs-code verification added to release checklist; review compliance docs each release cycle. | **Low** | ✅ Active |

### D. Future/Planned Risks

| ID | Risk Description | Likelihood | Impact | Score | Planned Mitigation | Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| **FUT-01** | **Penetration Test Findings**<br>Third-party audit reveals logic flaws in encryption or auth flows. | 3 | 4 | **12** | • Pen-test re-baselined to **Q1 2027** (slipped from Q3 2026 — auth-overhaul prioritization; now covers the final v1.2.0 auth stack).<br>• Dedicated remediation sprint buffer post-test.<br>• Bug Bounty program launch (under evaluation). | ⏳ Planned (Overdue — re-baselined) |
| **FUT-02** | **Data Portability Complexity**<br>Difficulty exporting encrypted data in a usable format for users. | 4 | 3 | **12** | • Develop `export-data` endpoint (Q3 2027).<br>• Provide client-side decryption tool for export. | ⏳ Planned |
| **FUT-03** | **Audit Log Immutability Upgrade** *(added 2026-11-06)*<br>Auditors require DB-enforced immutability for CC5.1/CC7.1 evidence; current append-orientation is procedural, not enforced. | 2 | 3 | **6** | • `BEFORE UPDATE OR DELETE` trigger raising an exception on `audit_logs`; erasure handled only via the `SET NULL` FK path (Q2 2027).<br>• Tracked in Regulatory Matrix (In Progress) and DPIA action plan. | 🔄 In Progress |

---

## 3. Risk Treatment Plan

### Immediate Actions (Critical/High)
- [x] **CR-01**: Enforce password complexity and PBKDF2 iterations (Done).
- [x] **CR-02**: Clear key-loss warnings in UI; integrity check before submission (Done). Backup-code flow verified to cover MFA recovery only — CR-05 split out (2026-11-06).
- [x] **INF-04**: CSRF double-submit middleware + cookie parity contract (Done, 2026-11-06).
- [x] **INF-01**: Remove `x-audit-secret` claim; document CSRF as the actual control (Done, 2026-11-06).
- [ ] **FUT-01**: Execute external penetration test (re-baselined Q1 2027; originally due June 2026).

### Monitoring Actions (Medium/Low)
- [ ] **INF-01**: Review Netlify security logs weekly.
- [ ] **COM-01**: Test `delete-user` flow monthly (password re-auth + `user_id = NULL` audit trail) to ensure erasure behaves as documented.
- [ ] **CR-04**: Monitor browser compatibility for Web Crypto API.
- [ ] **INF-02 / FUT-03**: Track trigger-migration progress; flip register language to "enforced immutable" when it ships.
- [ ] **COM-04**: Re-run doc-vs-code verification each release.

---

## 4. Approval & Sign-off

| Role | Name | Signature | Date |
| :--- | :--- | :--- | :--- |
| **Security Analyst** | Suman Jangili | __________________ | 2026-04-15 (v1.0) / ____________ (v2.0) |
| **Engineering Lead** | Suman Jangili | __________________ | 2026-04-15 (v1.0) / ____________ (v2.0) |
| **Product Manager** | Suman Jangili | __________________ | 2026-04-15 (v1.0) / ____________ (v2.0) |

---
*This register is linked to the `Regulatory Matrix`, `DPIA Report`, and `Roadmap`. Updates are triggered by code changes or audit findings. Last synchronized with code base: 2026-11-06 (post-auth-security-overhaul verification session).*
