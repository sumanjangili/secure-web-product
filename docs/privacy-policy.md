# Privacy Policy

**Effective Date:** 2026-04-23  
**Last Updated:** 2026-04-23  
**Controller:** Secure Web Product Team  
**Contact:** dpo@securewebproducts.com

## 1. Introduction
Welcome to Secure Web Product. We are committed to protecting your privacy and ensuring the highest level of security for your data. This policy explains how we collect, use, and safeguard your information, with a specific focus on our **Zero-Knowledge Architecture**.

## 2. Data Collection & Zero-Knowledge Principle
Our platform operates on a **Zero-Knowledge** model. This means:
- **We do not see your data.** All sensitive information (names, emails, messages, consent preferences) is encrypted **client-side** in your browser before it leaves your device.
- **Encryption Standards:** We use **AES-GCM (256-bit)** encryption with **PBKDF2** key derivation (100,000 iterations).
- **Key Ownership:** The encryption key is derived from your password or session token. **We never receive, store, or have access to your password or decryption key.**
- **What We Store:** Our servers only store encrypted blobs (`ciphertext`, `salt`, `iv`). Without your key, this data is mathematically unreadable to us and any third party.

## 3. Types of Data Processed
While we cannot read your encrypted content, we process the following metadata and technical data:

### A. Account & Authentication Data
- **Email Address:** Used for account identification and login.
- **Authentication Tokens:** Temporary session tokens (JWT) stored in your browser to maintain login state.
- **MFA Status:** Whether Multi-Factor Authentication is enabled (stored as a flag, not the code itself).

### B. Audit & Security Logs
- **Event Metadata:** Timestamps, event types (e.g., `SECURE_TICKET_CREATED`), and blind index hints (hashes of encrypted data) are logged to ensure system integrity and detect abuse.
- **IP Addresses:** Logged temporarily for rate-limiting and security monitoring (retained for 30 days).

### C. Consent Preferences
- **Cookie Consent:** Your choices regarding analytics cookies are stored locally in an encrypted format. We do not track you unless you explicitly opt-in.

## 4. How We Use Your Data
- **Service Delivery:** To encrypt, store, and allow you to retrieve your data.
- **Security:** To monitor for suspicious activity, enforce rate limits, and prevent fraud.
- **Legal Compliance:** To fulfill obligations under GDPR (Right to Erasure) and CCPA.
- **Improvement:** Aggregated, anonymized metrics (e.g., "500 tickets submitted today") to improve system performance.

## 5. Data Retention
- **User Data:** Retained indefinitely until you request deletion or close your account. Because we cannot decrypt it, we cannot selectively delete parts of your data; deletion removes the entire encrypted blob.
- **Audit Logs:** Retained for **12 months** for security auditing, then anonymized.
- **Session Tokens:** Expire automatically after 24 hours of inactivity.

## 6. Your Rights (GDPR & CCPA)
You have the following rights regarding your data:
- **Right to Access:** You can view your encrypted data via your dashboard. (Note: You must decrypt it locally).
- **Right to Rectification:** Update your profile information.
- **Right to Erasure (Delete):** You can permanently delete your account and all associated data via the **User Settings** page. This action is irreversible.
- **Right to Opt-Out:** You can reject non-essential cookies at any time via the **Consent Banner**.
- **Right to Portability:** (Coming Q3 2026) Export your data in a structured format.

## 7. International Transfers
Our infrastructure is hosted on **Netlify** (US-based). However, because your data is encrypted client-side before transmission, it remains protected regardless of where the server is located. We rely on standard contractual clauses for any necessary data transfers.

## 8. Security Measures
- **End-to-End Encryption (E2EE):** Data is encrypted in the browser.
- **Transport Security:** All communications use TLS 1.3.
- **Multi-Factor Authentication (MFA):** Optional but recommended for account protection.
- **Immutable Logs:** Audit trails cannot be altered by administrators.

## 9. Changes to This Policy
We may update this policy periodically. Significant changes will be communicated via email or a prominent notice on our platform. Continued use of the service constitutes acceptance of the updated policy.

## 10. Contact Us
If you have questions about this policy or your data, please contact our Data Protection Officer:
- **Email:** dpo@securewebproducts.com
- **Address:** [Insert Physical Address]

---
*This policy is version-controlled. See `docs/privacy-policy.md` for the latest revision.*
