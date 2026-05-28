#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 01.
# Asserts the §6 guided lab still reproduces on a clean machine (bash + coreutils only):
#   - composed small-programs-plus-pipes produce the admin-role count (= 3)
#   - the malformed row is captured on stderr, kept OUT of the evidence file (stream separation)
#   - the wrapped check script is reproducible (two runs, identical evidence)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

bash "$HERE/setup.sh" "$WORK/lab01" >/dev/null
test -f lab01/access-export.csv || { echo "FAIL: setup did not create the export"; exit 1; }

# The control check: count access rows whose role field contains 'admin'.
# Clean rows -> stdout; malformed (NF!=2) rows -> stderr; header skipped.
run_check() {
  awk -F, '
    NF != 2 { print "WARN: malformed row: " $0 > "/dev/stderr"; next }
    NR == 1 { next }
    $2 ~ /admin/ { c++ }
    END { print c + 0 }
  ' "$1"
}

# Task 4 + 5: count -> evidence file; collection errors -> separate log.
run_check lab01/access-export.csv > lab01/evidence-admin-count.txt 2> lab01/collection-errors.log

COUNT="$(cat lab01/evidence-admin-count.txt)"
test "$COUNT" = "3" || { echo "FAIL: expected admin-count 3, got '$COUNT'"; exit 1; }
grep -q "WARN: malformed row" lab01/collection-errors.log || { echo "FAIL: malformed row not captured on stderr"; exit 1; }
if grep -q "WARN" lab01/evidence-admin-count.txt; then echo "FAIL: evidence file contaminated by stderr"; exit 1; fi

# Task 7: wrap into a re-runnable script; run twice; assert identical evidence.
cat > check-admin-access.sh <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
awk -F, '
  NF != 2 { print "WARN: malformed row: " $0 > "/dev/stderr"; next }
  NR == 1 { next }
  $2 ~ /admin/ { c++ }
  END { print c + 0 }
' "${1:?usage: check-admin-access.sh <access-export.csv>}"
SCRIPT
chmod +x check-admin-access.sh
A="$(./check-admin-access.sh lab01/access-export.csv 2>/dev/null)"
B="$(./check-admin-access.sh lab01/access-export.csv 2>/dev/null)"
{ [ "$A" = "$B" ] && [ "$A" = "3" ]; } || { echo "FAIL: re-run not reproducible (A=$A B=$B)"; exit 1; }

echo "PASS: Module 01 lab reproduces (admin-count=$COUNT, stream-separated, reproducible across two runs)"
