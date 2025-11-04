# Secure Web Product – 2025‑2026 Roadmap

## Q4 2025 – Foundations
- Feature: End‑to‑end encrypted messaging UI  
  - Scope: React component + Netlify Function that stores encrypted payloads only.  
  - Success metric: 95 % of messages stored with ≥ 128‑bit encryption.
- Compliance: Draft GDPR Data‑Processing Addendum (DPA) for beta testers.  
- Ops: Enable Netlify Edge‑Functions for geo‑based rate‑limiting.

## Q1 2026 – Consent & Transparency
- Feature: Global consent banner (CookieConsent + granular toggles).  
- Feature: User‑controlled data‑export & deletion endpoints (right‑to‑be‑forgotten).  
- Compliance: Conduct DPIA (Data‑Protection Impact Assessment) for the new export flow.  
- Metric: < 5 % of users opt‑out of analytics.

## Q2 2026 – Enterprise Hardening
- Feature: Role‑based access control (RBAC) integrated with SSO (SAML/OIDC).  
- Feature: Immutable audit‑log stored in Netlify’s KV store (tamper‑evident).  
- Compliance: Align with ISO 27701 (Privacy Information Management).  
- Metric: Zero audit‑log integrity failures in quarterly security review.

## Q3 2026 – Marketplace & Extensibility
- Feature: Plugin SDK allowing third‑party extensions to run in a sandboxed iframe.  
- Feature: Public API with OAuth 2.0 scopes for “read‑only‑profile”, “write‑messages”.  
- Compliance: Publish a Transparency Report covering API usage.  
- Metric: 30 % increase in developer sign‑ups while maintaining < 1 % breach risk score.
