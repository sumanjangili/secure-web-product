#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------
# Delete caches & temporary artefacts that are safe to discard.
# ------------------------------------------------------------------

# ESLint cache
rm -f .eslintcache

# TypeScript incremental build info
rm -f .tsbuildinfo

# Jest / Vitest coverage & temp dirs
rm -rf coverage .nyc_output .vitest .jest

# Build output – keep only if you *need* it for deployment
# Uncomment the line below if you never commit built bundles.
# rm -rf dist build

# Log files
rm -f npm-debug.log yarn-error.log

# OS / editor junk
find . -type f \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*~' \) -delete
find . -type d \( -name '__pycache__' -o -name '.cache' \) -exec rm -rf {} +

echo "✅ Clean‑up completed."
