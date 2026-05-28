#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 10 — The Standards Spine.
# Clean-machine, OFFLINE, fixture-based. Requires only bash + coreutils + awk.
# (The §6 lab's reference validator is validate-crosswalk.ts under bun; this smoke test
#  re-implements the SAME core evaluation logic in awk so CI can prove the GRC control logic
#  on a machine without bun — and, if bun IS present, additionally runs the real validator.)
#
# Asserts the standards-spine core logic against BUNDLED fixtures:
#   - the seed crosswalk (with the planted orphan) FAILS validation (non-zero) and names the orphan
#   - every NON-orphan row maps to a REAL 800-53 spine family (AC-2 -> AC is in spine-families.txt)
#   - once the orphan is resolved to a real spine control, the crosswalk PASSES (exit 0)
#   - a row pointing at a non-spine family is rejected (negative test)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

bash "$HERE/setup.sh" "$WORK/work" >/dev/null
test -f work/spine-families.txt || { echo "FAIL: setup did not create spine-families.txt"; exit 1; }
test -f work/crosswalk.csv      || { echo "FAIL: setup did not create crosswalk.csv"; exit 1; }

# Sanity: the spine must have exactly 20 families (the superset's 20 control families).
FAMS="$(grep -c . work/spine-families.txt)"
test "$FAMS" = "20" || { echo "FAIL: expected 20 spine families, found $FAMS"; exit 1; }

# --- Core validation logic, awk re-implementation of validate-crosswalk.ts ---
# Prints one line per defect to stdout; sets exit status 0 (clean) or 1 (defects found).
validate() {
  local csv="$1" families="$2"
  awk -F, -v famfile="$families" '
    BEGIN {
      while ((getline f < famfile) > 0) { gsub(/[ \t\r]/,"",f); if (f != "") fam[f]=1 }
      rel["exact"]=1; rel["broader"]=1; rel["narrower"]=1; rel["partial"]=1
      defects=0
    }
    NR==1 {
      if ($1 != "profile" || $2 != "profile_control" || $3 != "spine_control" || $4 != "relationship") {
        print "DEFECT bad-header"; defects++
      }
      next
    }
    {
      profile=$1; pc=$2; sc=$3; r=$4
      gsub(/[ \t\r]/,"",sc); gsub(/[ \t\r]/,"",r)
      if (sc == "" || r == "orphan") { print "DEFECT orphan " profile " " pc; defects++; next }
      split(sc, a, "-"); family=a[1]
      if (!(family in fam)) { print "DEFECT unknown-family " profile " " pc " " sc; defects++ }
      if (!(r in rel))      { print "DEFECT bad-relationship " profile " " pc " " r; defects++ }
    }
    END { exit (defects > 0 ? 1 : 0) }
  ' "$csv"
}

# 1) Seed crosswalk MUST fail (planted orphan) and name it.
set +e
BEFORE="$(validate work/crosswalk.csv work/spine-families.txt)"; RC=$?
set -e
test "$RC" -ne 0 || { echo "FAIL: seed crosswalk should fail validation but exited 0"; exit 1; }
echo "$BEFORE" | grep -q "DEFECT orphan PCI4 6.3.2" \
  || { echo "FAIL: orphan PCI4 6.3.2 not detected. Got: $BEFORE"; exit 1; }

# 2) Resolve the orphan -> CM-8 (system component inventory), honest 'broader'. Re-validate -> PASS.
sed 's/^PCI4,6.3.2,,orphan$/PCI4,6.3.2,CM-8,broader/' work/crosswalk.csv > work/crosswalk-resolved.csv
test "$(grep -c 'PCI4,6.3.2,CM-8,broader' work/crosswalk-resolved.csv)" = "1" \
  || { echo "FAIL: orphan resolution did not rewrite the row"; exit 1; }
set +e
AFTER="$(validate work/crosswalk-resolved.csv work/spine-families.txt)"; RC=$?
set -e
test "$RC" -eq 0 || { echo "FAIL: resolved crosswalk should pass but exited $RC. Defects: $AFTER"; exit 1; }

# 3) Negative test: a row mapping to a NON-spine family (ZZ) must be rejected.
cp work/crosswalk-resolved.csv work/crosswalk-bad.csv
printf 'HIPAA,164.312,ZZ-1,exact\n' >> work/crosswalk-bad.csv
set +e
BAD="$(validate work/crosswalk-bad.csv work/spine-families.txt)"; RC=$?
set -e
test "$RC" -ne 0 || { echo "FAIL: non-spine family ZZ-1 should be rejected but validation passed"; exit 1; }
echo "$BAD" | grep -q "DEFECT unknown-family HIPAA 164.312 ZZ-1" \
  || { echo "FAIL: non-spine family not flagged. Got: $BAD"; exit 1; }

# 4) If bun is available, also run the REAL reference validator the lab ships, to keep the
#    awk smoke test and the TypeScript validator in agreement.
if command -v bun >/dev/null 2>&1; then
  set +e
  bun "$HERE/validate-crosswalk.ts" work/crosswalk.csv work/spine-families.txt >/dev/null 2>&1; RC=$?
  set -e
  test "$RC" -ne 0 || { echo "FAIL: bun validator should fail on seed orphan but exited 0"; exit 1; }
  set +e
  bun "$HERE/validate-crosswalk.ts" work/crosswalk-resolved.csv work/spine-families.txt >/dev/null 2>&1; RC=$?
  set -e
  test "$RC" -eq 0 || { echo "FAIL: bun validator should pass on resolved crosswalk but exited $RC"; exit 1; }
  BUN_NOTE=" (bun reference validator agreed)"
else
  BUN_NOTE=" (bun not present; awk core-logic only)"
fi

echo "PASS: Module 10 lab reproduces — seed orphan caught, resolution verified, non-spine family rejected${BUN_NOTE}."
