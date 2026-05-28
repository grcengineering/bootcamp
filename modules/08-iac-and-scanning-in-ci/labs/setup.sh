#!/usr/bin/env bash
# Module 08 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./lab08)
#
# Recreates the bundled fixtures in a working directory so the lab is fully
# self-contained and offline: two Checkov-shaped scan results (one for a
# deliberately non-compliant Terraform change, one for the compliant
# remediation), the Terraform snippets they correspond to, the gate decision
# script (the EVALUATE core logic), and the check_id -> control map.
#
# No network, no scanner install, no cloud. bash + coreutils only.
set -euo pipefail

DEST="${1:-./lab08}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DEST"

# Prefer copying the committed fixtures (single source of truth); fall back to
# regenerating them inline if this script is run detached from the repo.
if [ -d "$HERE/fixtures" ]; then
  cp "$HERE/fixtures/checkov-noncompliant.json" "$DEST/"
  cp "$HERE/fixtures/checkov-compliant.json"    "$DEST/"
  cp "$HERE/fixtures/control-map.csv"           "$DEST/"
  cp "$HERE/fixtures/main-noncompliant.tf"      "$DEST/"
  cp "$HERE/fixtures/main-compliant.tf"         "$DEST/"
  cp "$HERE/fixtures/gate.sh"                   "$DEST/"
  chmod +x "$DEST/gate.sh"
  echo "lab08 fixtures copied to $DEST/"
  exit 0
fi

echo "ERROR: fixtures directory not found next to setup.sh ($HERE/fixtures)" >&2
exit 1
