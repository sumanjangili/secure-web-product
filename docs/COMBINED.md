# Combined Documentation

## Table of Contents

- [Regulatory Matrix](#regulatory-matrix)
- [Roadmap](#roadmap)
- [Stakeholder Map](#stakeholder-map)

## Regulatory Matrix

# Regulatory Matrix

Compliance requirements and implementation status for secure-web-product.

| Regulation | Requirement | Implementation | Status |
|------------|-------------|----------------|--------|
| GDPR Art. 5 | Data minimisation | Only store consent timestamps | ✅ Implemented |
| GDPR Art. 17 | Right to erasure | API endpoint `/delete-data` | 🔄 In Progress |
| CCPA §1798.105 | Right to delete | API endpoint `/delete-data` | ✅ Implemented |
| CCPA §1798.130 | Disclosure requirements | Privacy policy page | ✅ Implemented |
| SOC 2 Type II | Audit logging | `netlify/functions/audit_log.js` | 🔄 Planned |

## Implementation Notes

### GDPR Art. 5 - Data Minimisation
- **Requirement:** Collect only data necessary for specified purposes
- **Implementation:** Consent timestamps stored only; no PII retained without explicit consent
- **Verification:** Automated scan in CI pipeline checks for PII patterns

### CCPA §1798.105 - Right to Delete
- **Requirement:** Consumers may request deletion of personal information
- **Implementation:** REST endpoint `DELETE /api/delete-data` with authentication
- **SLA:** 45-day response window as per regulation

## Compliance Checklist

- [ ] Annual privacy impact assessment (DPIA)
- [ ] Data processing agreement (DPA) with vendors
- [ ] Employee privacy training completed
- [ ] Incident response plan tested

---

*Last Updated: 2026-04-17 | Owner: Legal / Compliance*

## Roadmap

# Roadmap

Development milestones and ownership for secure-web-product.

| Quarter | Milestone | Owner | Status | Dependencies |
|---------|-----------|-------|--------|--------------|
| Q4 2025 | Release MVP (this repo) | Front-end lead | ✅ Complete | None |
| Q1 2026 | Add multi-factor auth flow | Security engineer | 🔄 In Progress | OAuth provider integration |
| Q2 2026 | GDPR compliance audit | Legal liaison | ⏳ Planned | MFA completion |
| Q3 2026 | Penetration testing | Security analyst | ⏳ Planned | Audit completion |
| Q4 2026 | SOC 2 Type II certification | Operations / DevOps | ⏳ Planned | Pen-test clearance |

## Milestone Details

### Q4 2025 - MVP Release
- **Deliverables:** Core encryption, consent UI, basic API
- **Success Criteria:** 100+ beta users, zero critical vulnerabilities
- **Risks:** Timeline compression due to regulatory deadlines

### Q1 2026 - Multi-Factor Authentication
- **Deliverables:** TOTP support, backup codes, recovery flow
- **Success Criteria:** 95% user adoption rate
- **Risks:** UX friction during onboarding

### Q2 2026 - GDPR Compliance Audit
- **Deliverables:** Third-party audit report, remediation plan
- **Success Criteria:** No major non-conformities
- **Risks:** Audit findings requiring architectural changes

## Blockers & Risks

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Regulatory changes | High | Monthly legal review | Legal liaison |
| Key personnel turnover | Medium | Documentation redundancy | Engineering Lead |
| Third-party API limits | Medium | Rate limiting, caching | Operations / DevOps |

---

*Last Updated: 2026-04-17 | Owner: Product Manager*

## Stakeholder Map

# Stakeholder Map

Roles, responsibilities, and key deliverables for secure-web-product.

| Role | Primary Responsibility | Key Deliverables | Contact |
|------|------------------------|------------------|---------|
| Product Manager | Vision, roadmap, regulatory alignment, KPI definition | Roadmap, Regulatory Matrix, Release Notes | pm@company.com |
| Engineering Lead | Architecture, implementation, CI/CD pipelines | Secure code, automated tests, audit-log function | eng-lead@company.com |
| UX Designer | Consent UI, accessibility, user-flow for data-rights | Mockups, usability test reports | ux@company.com |
| Legal / Compliance | Review DPA, DPIA, audit-log retention policies | Legal sign-off, compliance checklist | legal@company.com |
| Security Analyst | Threat modelling, pen-testing, incident response | Threat model doc, security scan reports | security@company.com |
| Operations / DevOps | Netlify deployment, secret management, monitoring | CI/CD config, observability dashboards | devops@company.com |

## Escalation Paths

### Security Incidents
1. **Level 1:** Security Analyst → Incident Response
2. **Level 2:** Engineering Lead → Architecture Review
3. **Level 3:** Product Manager → Executive Team

### Compliance Issues
1. **Level 1:** Legal / Compliance → Remediation Plan
2. **Level 2:** Product Manager → Regulatory Authority Notification
3. **Level 3:** Executive Team → External Counsel

## Communication Channels

| Channel | Purpose | Frequency |
|---------|---------|-----------|
| Slack #security | Incident alerts, threat intel | Real-time |
| Slack #compliance | Regulatory updates, audit prep | Weekly |
| Email | Formal approvals, legal notices | As needed |
| Jira | Task tracking, sprint planning | Daily |

## Decision Rights

| Decision Area | Primary Owner | Consult | Approve |
|---------------|---------------|---------|---------|
| Feature prioritization | Product Manager | Engineering Lead | Product Manager |
| Security architecture | Security Analyst | Engineering Lead | Security Analyst |
| Compliance approach | Legal / Compliance | Product Manager | Legal / Compliance |
| Deployment schedule | Operations / DevOps | Engineering Lead | Product Manager |

---

*Last Updated: 2026-04-17 | Owner: Product Manager*