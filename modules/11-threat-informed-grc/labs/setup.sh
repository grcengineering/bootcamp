#!/usr/bin/env bash
# Module 11 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./work)
#
# Stages the bundled fixtures into a working directory so the lab is fully self-contained
# and offline:
#   - prioritized-threats.txt : the team's OWNED top-threat list (left column of the map)
#   - controls-in-scope.txt   : the controls the team runs (right column — each must earn its place)
#   - coverage-map.csv         : a seed threat->control map with honest mitigation labels, containing
#                                ONE deliberate coverage gap (T-1486 with no control) and engineered
#                                so one in-scope control (CTRL-DLP-AGENT-04) maps to NOTHING
#   - validate-coverage.ts     : the reference validator (run under bun)
#
# No network, no cloud, no external account. bash + coreutils only to stage.
set -euo pipefail

DEST="${1:-./work}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DEST"

# Prefer copying the committed fixtures (single source of truth); fall back to an explicit error
# if this script is somehow detached from the repo, rather than silently generating drift.
if [ -d "$HERE/fixtures" ]; then
  cp "$HERE/fixtures/prioritized-threats.txt" "$DEST/"
  cp "$HERE/fixtures/controls-in-scope.txt"   "$DEST/"
  cp "$HERE/fixtures/coverage-map.csv"        "$DEST/"
  cp "$HERE/validate-coverage.ts"             "$DEST/" 2>/dev/null || true
  echo "Module 11 fixtures staged in $DEST/ (prioritized-threats.txt, controls-in-scope.txt, coverage-map.csv)"
  exit 0
fi

echo "ERROR: fixtures directory not found next to setup.sh ($HERE/fixtures)" >&2
exit 1
