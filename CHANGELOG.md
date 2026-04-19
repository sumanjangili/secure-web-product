# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project skeleton with TypeScript, ESLint, and Vitest configuration.
- `ConsentBanner` component for GDPR/CCPA compliance.
- Serverless `audit-log` Netlify function for tracking user interactions.
- GitHub Actions CI pipeline for linting, testing, and building.
- Automated verification checklist workflow (`VERIFY_CHECKLIST.md`).

### Changed
- Upgraded build process to use custom paths (`frontend` and `netlify/functions`).
- Standardized dependency management to resolve peer dependency conflicts (Vite 7.x).

### Fixed
- Resolved `ERESOLVE` error between `vite@8` and `@vitejs/plugin-react` by downgrading to `vite@^7.0.0`.
- Fixed YAML syntax errors in `.github/workflows/checklist.yml` (replaced `//` with `#`).
- Corrected checkbox formatting in `VERIFY_CHECKLIST.md` for automation compatibility.

### Security
- Enabled secret scanning and branch protection rules on `main`.

## [0.1.0] – 2025-11-01

### Added
- First public release of the secure web product.
- Basic project structure and core dependencies.
