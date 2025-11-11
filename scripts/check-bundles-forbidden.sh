#!/usr/bin/env bash
set -euo pipefail

# Simple CI check script that scans built bundle files for forbidden runtime tokens
# that indicate un-transformed core runtime code slipped into a Worker bundle.
#
# Usage:
#   ./check-bundles-forbidden.sh [paths...]
#
# If no paths are provided, the script will look for common build output dirs:
#   dist build out .vercel .wrangler .svelte-kit packages/*/dist
#
# The script prints any matches and exits with non-zero status if forbidden tokens
# are found (so CI can fail the build).

PROG_NAME="$(basename "$0")"

readonly DEFAULT_PATHS=(dist build out .vercel .wrangler .svelte-kit packages/*/dist)

# Forbidden tokens to search for (literal strings).
# Adjust or extend as needed.
readonly TOKENS=(
  "dehydrateWorkflowArguments("
  "(0, eval)("
  "runInContext("
  "workflowEntrypoint("
  "(0, eval)"
  "(0,eval)"
  "(0, eval)("
  "(0,eval)("
  "(0, eval )("
  "(0,eval )("
  # Also include plain eval invocation which is a strong indicator (but noisy)
  "(0, eval"
  "(0,eval"
)

usage() {
  cat <<EOF
Usage: $PROG_NAME [paths...]
Scans the given paths (recursively) for forbidden tokens that indicate core runtime
or eval/runInContext usage leaked into built Worker bundles.

If no paths are provided the script scans these defaults:
  ${DEFAULT_PATHS[*]}

Returns:
  0 - nothing found
  1 - forbidden tokens found
  2 - usage / error
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

# Build the list of paths to inspect (expand globs)
paths=()
if [ "$#" -gt 0 ]; then
  for p in "$@"; do
    # expand glob if it matches; otherwise keep literal if exists
    shopt -s nullglob
    for m in $p; do
      paths+=("$m")
    done
    shopt -u nullglob
    # If glob didn't expand and the literal exists, include it
    if [ ${#paths[@]} -eq 0 ] && [ -e "$p" ]; then
      paths+=("$p")
    fi
  done
fi

if [ "${#paths[@]}" -eq 0 ]; then
  # Expand DEFAULT_PATHS globs
  for p in "${DEFAULT_PATHS[@]}"; do
    shopt -s nullglob
    for m in $p; do
      paths+=("$m")
    done
    shopt -u nullglob
  done
fi

# If nothing to scan, warn and exit 0 (nothing to check)
if [ "${#paths[@]}" -eq 0 ]; then
  echo "[$PROG_NAME] No build paths found to scan. Provide paths as arguments or ensure build outputs exist."
  exit 0
fi

# Prepare grep include/exclude flags
# Only scan likely JS/TS output files to reduce noise.
GREP_INCLUDES=(--include=*.js --include=*.cjs --include=*.mjs --include=*.ts --include=*.mjs.map --include=*.js.map)
GREP_EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv --exclude-dir=dist/node_modules)

total_matches=0

echo "[$PROG_NAME] Scanning paths: ${paths[*]}"
echo "[$PROG_NAME] Looking for forbidden tokens..."

for token in "${TOKENS[@]}"; do
  # Use fixed-string search (-F) to avoid regex pitfalls
  # Use -nH to show filename:line matches
  # Suppress grep exit non-zero when no matches by using || true
  matches="$(grep -nH -F "${GREP_INCLUDES[@]}" "${GREP_EXCLUDES[@]}" -R -- "$token" "${paths[@]}" 2>/dev/null || true)"
  if [ -n "$matches" ]; then
    echo ""
    echo "==== FORBIDDEN TOKEN FOUND: \"$token\" ===="
    echo "$matches"
    total_matches=$((total_matches + $(printf '%s\n' "$matches" | wc -l)))
  fi
done

if [ "$total_matches" -gt 0 ]; then
  echo ""
  echo "[$PROG_NAME] ERROR: Found ${total_matches} forbidden token occurrence(s) in build artifacts."
  echo "Possible causes:"
  echo "  - A Worker bundle imported runtime-only modules (node:vm, eval-based serializer) and wasn't transformed."
  echo "  - The Vite plugin/virtual-shim did not run or did not cover all import paths."
  echo ""
  echo "Suggested actions:"
  echo "  - Ensure you run the bindings Vite plugin that injects the virtual shim and rewrites generated entrypoints."
  echo "  - Make sure the plugin is registered in your vite.config and runs with 'enforce: pre'."
  echo "  - Avoid dynamic runtime imports for workflow runtime internals; add CI checks to catch them early."
  echo ""
  exit 1
fi

echo "[$PROG_NAME] OK: No forbidden tokens found in scanned paths."
exit 0
