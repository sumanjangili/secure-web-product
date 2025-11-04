# Mapping Regulations → Features

Regulation        Requirement           Corresponding Feature          Owner
GDPR Art. 5    Data‑minimisation   Only encrypted payload stored; no plaintext logs   Backend Engineer
GDPR Art. 15   Right‑to‑access     Export endpoint (/api/export)   PM / Backend
GDPR Art. 17   Right‑to‑erasure    Delete endpoint (/api/delete)   PM / Backend
CCPA §1798.105 Opt‑out of saleConsent banner toggle “Share data with partners?”UX Designer
ISO 27001 A.12.3Cryptographic key managementRotate server private key every 90 days (CI secret rotation)DevOps
SOC 2 CC6.1    Incident response  Automated alert on decryption failure > 5 times/min Security Lead
