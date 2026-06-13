#!/usr/bin/env bash
# Module 09 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./lab09)
#
# Recreates the bundled fixtures in a working directory so the lab is fully
# self-contained and offline:
#   - access-clean.csv      : a clean access export (no legacy-admin grant)
#   - access-violation.csv  : an export with a forbidden legacy-admin grant
#   - policy.cedar          : the control as a Cedar forbid statement
#   - policy.rego           : the same control as a Rego deny rule
#   - check.sh              : the engine-agnostic verdict-function (EVALUATE core)
#   - run-policy-gate.sh    : the CI gate (runs check.sh + emits evidence)
#   - rotted-policy.txt     : the policy-rot drill fixture
#   - evidence-store/       : the starter versioned evidence store
#
# No network, no policy-engine install, no cloud. bash + coreutils only.
set -euo pipefail

DEST="${1:-./lab09}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DEST"

# Prefer copying the committed fixtures (single source of truth); fall back to
# erroring loudly if this script is run detached from the repo.
if [ -d "$HERE/fixtures" ]; then
  cp "$HERE/fixtures/access-clean.csv"     "$DEST/"
  cp "$HERE/fixtures/access-violation.csv" "$DEST/"
  cp "$HERE/fixtures/policy.cedar"         "$DEST/"
  cp "$HERE/fixtures/policy.rego"          "$DEST/"
  cp "$HERE/fixtures/check.sh"             "$DEST/"
  cp "$HERE/fixtures/run-policy-gate.sh"   "$DEST/"
  cp "$HERE/fixtures/rotted-policy.txt"    "$DEST/"
  chmod +x "$DEST/check.sh" "$DEST/run-policy-gate.sh"
  mkdir -p "$DEST/evidence-store"
  echo "lab09 fixtures copied to $DEST/ (evidence-store/ ready)"
  exit 0
fi

echo "ERROR: fixtures directory not found next to setup.sh ($HERE/fixtures)" >&2
exit 1
