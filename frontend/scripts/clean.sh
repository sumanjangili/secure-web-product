#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------
# clean.sh – Safe cleanup of build artifacts and caches
#
# Usage:
#   ./clean.sh           # Perform cleanup
#   ./clean.sh --dry-run # Preview what would be deleted
#
# Safety:
#   - Does NOT delete .env, node_modules, or src/
#   - Requires confirmation if run from a directory containing 'src' or 'package.json'
# ------------------------------------------------------------------

DRY_RUN=false

# Parse arguments
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN MODE: No files will be deleted."
fi

# ------------------------------------------------------------------
# Safety Check: Ensure we are in a project root
# ------------------------------------------------------------------
if [[ ! -f "package.json" ]]; then
  echo "❌ ERROR: package.json not found. Are you in the project root?"
  exit 1
fi

# Optional: Prevent running in system directories
if [[ "$PWD" == "/" || "$PWD" == "/home" || "$PWD" == "/root" ]]; then
  echo "❌ ERROR: Refusing to run in system root directory."
  exit 1
fi

# ------------------------------------------------------------------
# Helper: Delete or List
# ------------------------------------------------------------------
safe_remove() {
  local target="$1"
  if [[ -e "$target" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      echo "🗑️  Would delete: $target"
    else
      rm -rf "$target"
      echo "✅ Deleted: $target"
    fi
  fi
}

# ------------------------------------------------------------------
# 1. Developer Caches (Safe to delete)
# ------------------------------------------------------------------
echo "🧹 Cleaning developer caches..."
safe_remove ".eslintcache"
safe_remove ".tsbuildinfo"
safe_remove "coverage"
safe_remove ".nyc_output"
safe_remove ".vitest"
safe_remove ".jest"
safe_remove "npm-debug.log"
safe_remove "yarn-error.log"

# ------------------------------------------------------------------
# 2. Build Output (COMMENTED OUT BY DEFAULT)
# ------------------------------------------------------------------
# ⚠️ UNCOMMENT ONLY IF YOU NEVER COMMIT BUILD ARTIFACTS
# If you deploy via Netlify/Vercel, they build from source, so 'dist' is not needed locally.
# safe_remove "dist"
# safe_remove "build"

# ------------------------------------------------------------------
# 3. OS & Editor Junk (Safe to delete)
# ------------------------------------------------------------------
echo "🧹 Cleaning OS/Editor junk..."

# Find files (limit depth to avoid deleting inside node_modules)
if [[ "$DRY_RUN" == true ]]; then
  find . -maxdepth 3 -type f \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*~' \) -print
else
  find . -maxdepth 3 -type f \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*~' \) -delete
fi

# Find directories (limit depth)
if [[ "$DRY_RUN" == true ]]; then
  find . -maxdepth 3 -type d \( -name '__pycache__' -o -name '.cache' -o -name '.idea' -o -name '.vscode' \) -print
else
  find . -maxdepth 3 -type d \( -name '__pycache__' -o -name '.cache' -o -name '.idea' -o -name '.vscode' \) -exec rm -rf {} +
fi

# ------------------------------------------------------------------
# 4. Summary
# ------------------------------------------------------------------
if [[ "$DRY_RUN" == true ]]; then
  echo "\n✅ Dry run complete. Review the list above."
else
  echo "\n✅ Cleanup completed successfully."
fi
