#!/usr/bin/env bash
# ------------------------------------------------------------------
# load.env.sh – Zsh-Compatible Version
# ------------------------------------------------------------------

set -euo pipefail

# 1. Robust Path Resolution
# If BASH_SOURCE is empty (common in Zsh when sourcing), use PWD
if [[ -z "${BASH_SOURCE:-}" ]]; then
    # Fallback: Assume script is in 'scripts/' relative to current dir
    SCRIPT_DIR="$(pwd)/scripts"
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

# 2. Calculate Project Root (Go up one level from scripts/)
# We use 'cd' to resolve symlinks and relative paths safely
if [[ -d "${SCRIPT_DIR}" ]]; then
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
else
    # Fallback if script dir resolution failed
    PROJECT_ROOT="$(pwd)"
fi

ENV_FILE="${PROJECT_ROOT}/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { printf "${GREEN}[INFO]${NC} %s\n" "$1"; }
log_error() { printf "${RED}[ERROR]${NC} %s\n" "$1" >&2; }

die() {
    log_error "$1"
    exit 1
}

# Debug: Uncomment to see where it's looking
# echo "DEBUG: Looking for .env at: ${ENV_FILE}"

# 3. Verify .env exists
if [[ ! -f "${ENV_FILE}" ]]; then
    die ".env file not found at ${ENV_FILE}.\nPlease ensure .env is in the project root: ${PROJECT_ROOT}"
fi

# 4. Load variables
set -a
source "${ENV_FILE}"
set +a

# 5. Validate
missing_vars=()
[[ -z "${DB_USER:-}" ]] && missing_vars+=("DB_USER")
[[ -z "${DB_PASS:-}" ]] && missing_vars+=("DB_PASS")
[[ -z "${DB_NAME:-}" ]] && missing_vars+=("DB_NAME")

if (( ${#missing_vars[@]} )); then
    die "Missing required variable(s) in .env: ${missing_vars[*]}"
fi

# 6. Construct DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
    MASKED_PASS=$(echo "$DB_PASS" | sed 's/./•/g')
    log_info "Generated DATABASE_URL (masked):"
    log_info "  postgresql://${DB_USER}:${MASKED_PASS}@localhost:5432/${DB_NAME}"
else
    log_info "Using existing DATABASE_URL from .env"
fi

log_info "Environment loaded successfully for project: ${PROJECT_ROOT}"
