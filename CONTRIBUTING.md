# Contributing to Secure Web Products

Thank you for considering a contribution! This guide helps you get set up quickly and ensures that all changes keep the repository secure and privacy‑focused.

---

## Table of Contents
- [Getting Started](#getting-started)
- [Branch Protection Rules](#branch-protection-rules)
- [Running the Security Scan Locally](#running-the-security-scan-locally)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Reporting Issues](#reporting-issues)

---

## Getting Started

1. **Fork** the repository and **clone** your fork.
2. Install dependencies with `npm ci`.
3. Set up the Netlify dev environment (`npm run dev`) to verify everything works locally.

---

## Branch Protection Rules

| Rule | Description |
|------|-------------|
| **Require pull request reviews** | At least one approved review before merging. |
| **Require status checks** | All CI jobs (tests, lint, `npm run security`) must pass. |
| **Require signed commits** | Use GPG or SSH signing (`git commit -S`). |
| **No force pushes** | Keeps the history clean and auditable. |

These rules are enforced on the `main` branch via GitHub settings.

---

## Running the Security Scan Locally

Our CI pipeline includes a custom security script that checks for:

- Known vulnerable npm packages (via `npm audit`)
- Hard‑coded secrets (via `gitleaks`)
- Dependency licensing issues

To run the same checks locally:

```bash
npm run security
