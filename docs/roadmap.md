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
