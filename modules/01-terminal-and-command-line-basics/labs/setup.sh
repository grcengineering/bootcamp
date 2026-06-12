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
# The lab's parsing tool: clean rows -> stdout, malformed rows -> stderr (the §5.2 archetype).
# Canon-locked to .ci/fixtures/seeds/m01/bin/parse-access-export (CI drift check).
cat > "$DEST/parse-access-export" <<'TOOL'
#!/usr/bin/env bash
# Lab tool (module 01 §6 task 5): emits clean data rows on stdout and complains about
# malformed rows on stderr — the §5.2 stream-separation archetype, made runnable.
# Exists so the lab's "the parsing step will complain" is producible with taught composition
# (root ISA ISC-75: the reference solution previously required untaught awk).
awk -F, '
  NR == 1 { next }
  NF != 2 { print "WARN: malformed row: " $0 > "/dev/stderr"; next }
  { print }
' "${1:?usage: parse-access-export <export.csv>}"
TOOL
chmod +x "$DEST/parse-access-export"
echo "lab01 fixture written to $DEST/access-export.csv"
echo "lab tool written to $DEST/parse-access-export — put it on your PATH:"
echo "  export PATH=\"\$(cd "$DEST" && pwd):\$PATH\""
