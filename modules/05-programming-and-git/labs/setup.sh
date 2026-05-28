#!/usr/bin/env bash
# Module 05 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./evidence)
# Produces a directory of laptop encryption-status evidence records (one JSON per host),
# including: a passing host, a failing host, a host MISSING the encrypted field,
# and one deliberately MALFORMED file (not valid JSON) to exercise graceful handling.
set -euo pipefail
DEST="${1:-./evidence}"
mkdir -p "$DEST"

cat > "$DEST/lt-01.json" <<'JSON'
{"host": "lt-01", "encrypted": true, "checked_at": "2026-05-28"}
JSON

cat > "$DEST/lt-02.json" <<'JSON'
{"host": "lt-02", "encrypted": false, "checked_at": "2026-05-28"}
JSON

# Host with the field absent entirely — absence must NOT count as a pass.
cat > "$DEST/lt-03.json" <<'JSON'
{"host": "lt-03", "checked_at": "2026-05-28"}
JSON

cat > "$DEST/lt-04.json" <<'JSON'
{"host": "lt-04", "encrypted": true, "checked_at": "2026-05-28"}
JSON

# Deliberately malformed: truncated, not valid JSON. The validator must record this
# as an error and keep going, NOT crash the whole run.
cat > "$DEST/lt-05.json" <<'JSON'
{"host": "lt-05", "encrypted": tr
JSON

echo "Module 05 fixtures written to $DEST (5 files: 2 pass, 1 fail, 1 missing-field, 1 malformed)"
