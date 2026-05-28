#!/usr/bin/env bash
# Module 12 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./lab12)
#
# Recreates the bundled fixtures in a working directory so the lab is fully
# self-contained and offline: a minimal OSCAL catalog (the Module-10 spine as
# data), a profile that selects a subset of it, a component-definition that
# implements a control and links it to the Module-09 policy via C2P, a
# deliberately broken catalog (control id removed), and the validator that is
# the EVALUATE/EVIDENCE core logic.
#
# No network, no trestle install, no schema download, no cloud. bash +
# coreutils only to stage; the validator runs under bun.
set -euo pipefail

DEST="${1:-./lab12}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DEST"

# Prefer copying the committed fixtures (single source of truth); fail loudly if
# this script is run detached from the repo.
if [ -d "$HERE/fixtures" ]; then
  cp "$HERE/fixtures/acme-catalog.json"        "$DEST/"
  cp "$HERE/fixtures/acme-profile.json"        "$DEST/"
  cp "$HERE/fixtures/acme-component.json"       "$DEST/"
  cp "$HERE/fixtures/acme-catalog-broken.json" "$DEST/"
  cp "$HERE/fixtures/validate-oscal.ts"        "$DEST/"
  echo "lab12 fixtures copied to $DEST/"
  exit 0
fi

echo "ERROR: fixtures directory not found next to setup.sh ($HERE/fixtures)" >&2
exit 1
