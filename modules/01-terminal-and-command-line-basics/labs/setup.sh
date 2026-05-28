#!/usr/bin/env bash
# Module 01 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./lab01)
# Produces an access export with deliberately messy rows and one malformed (no-delimiter) line.
set -euo pipefail
DEST="${1:-./lab01}"
mkdir -p "$DEST"
cat > "$DEST/access-export.csv" <<'CSV'
user,role
alice,admin
bob,viewer
carol,legacy-admin
dave,editor
erin,admin
frank,viewer
MALFORMED_ROW_WITH_NO_DELIMITER
grace,auditor
CSV
echo "lab01 fixture written to $DEST/access-export.csv"
