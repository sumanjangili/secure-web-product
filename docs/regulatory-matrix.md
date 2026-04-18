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
