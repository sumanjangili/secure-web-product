# Combined Documentation

## Table of Contents

- [Regulatory Matrix](#regulatory-matrix)
- [Roadmap](#roadmap)
- [Stakeholder Map](#stakeholder-map)

## Regulatory Matrix

# Regulatory Matrix

| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| GDPR Art. 5 | Data minimisation | Only store consent timestamps |
| CCPA §1798.105 | Right to delete | Provide API endpoint `/delete-data` |

## Roadmap

# Roadmap

| Quarter | Milestone | Owner |
|---------|-----------|-------|
| Q4 2025 | Release MVP (this repo) | Front‑end lead |
| Q1 2026 | Add multi‑factor auth flow | Security engineer |
| Q2 2026 | GDPR compliance audit | Legal liaison |

## Stakeholder Map

# Stakeholder Map

| Role               | Primary Responsibility                               | Key Deliverables |
|--------------------|------------------------------------------------------|------------------|
| Product Manager | Vision, roadmap, regulatory alignment, KPI definition | Roadmap, Regulatory Matrix, Release Notes |
| Engineering Lead | Architecture, implementation, CI/CD pipelines | Secure code, automated tests, audit‑log function |
| UX Designer    | Consent UI, accessibility, user‑flow for data‑rights | Mockups, usability test reports |
| Legal / Compliance | Review DPA, DPIA, audit‑log retention policies | Legal sign‑off, compliance checklist |
| Security Analyst | Threat modelling, pen‑testing, incident response | Threat model doc, security scan reports |
| Operations / DevOps | Netlify deployment, secret management, monitoring | CI/CD config, observability dashboards |