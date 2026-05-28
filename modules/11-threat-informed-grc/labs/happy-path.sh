#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 11 — Threat-informed GRC.
# Clean-machine, OFFLINE, fixture-based. Requires only bash + coreutils + awk.
# (The §6 lab's reference validator is validate-coverage.ts under bun; this smoke test
#  re-implements the SAME core evaluation logic in awk so CI can prove the GRC control logic
#  on a machine without bun — and, if bun IS present, additionally runs the real validator to
#  keep the two in agreement.)
#
# Asserts the threat-informed coverage-map core logic against BUNDLED fixtures:
#   1. The seed coverage map FAILS validation (non-zero) and names BOTH defects:
#        - a COVERAGE GAP: prioritized threat T-1486 maps to no control.
#        - a ZERO-THREAT CONTROL: in-scope control CTRL-DLP-AGENT-04 mitigates no prioritized
#          threat (the kill/downgrade candidate the module exists to surface).
#   2. Resolving BOTH defects (map the gap to a real control; remove the dead control from scope)
#      makes the map PASS (exit 0) — i.e. the threat-informed pass produces a clean, defensible
#      control portfolio.
#   3. A row claiming an invalid mitigation label is rejected (negative test on the honesty check).
#
# This proves the EVALUATE step (evaluating the control SET against the threats it faces),
# not any live system or scanner. The real §6 lab additionally drives ATT&CK Navigator and a
# stakeholder interview; here we feed the validator committed fixtures instead.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

bash "$HERE/setup.sh" "$WORK/work" >/dev/null
test -f work/prioritized-threats.txt || { echo "FAIL: setup did not create prioritized-threats.txt"; exit 1; }
test -f work/controls-in-scope.txt   || { echo "FAIL: setup did not create controls-in-scope.txt"; exit 1; }
test -f work/coverage-map.csv        || { echo "FAIL: setup did not create coverage-map.csv"; exit 1; }

# Sanity: the seed fixture must have 5 prioritized threats and 4 in-scope controls.
NTHREATS="$(grep -v '^[[:space:]]*#' work/prioritized-threats.txt | grep -c .)"
NCONTROLS="$(grep -v '^[[:space:]]*#' work/controls-in-scope.txt | grep -c .)"
test "$NTHREATS" = "5" || { echo "FAIL: expected 5 prioritized threats, found $NTHREATS"; exit 1; }
test "$NCONTROLS" = "4" || { echo "FAIL: expected 4 in-scope controls, found $NCONTROLS"; exit 1; }

# --- Core evaluation logic, awk re-implementation of validate-coverage.ts ---
# Prints one DEFECT line per problem to stdout; exit status 0 (clean) or 1 (defects found).
validate() {
  local csv="$1" threatsfile="$2" controlsfile="$3"
  awk -F, -v tf="$threatsfile" -v cf="$controlsfile" '
    BEGIN {
      # Load prioritized threats (ignore comments/blank lines).
      while ((getline t < tf) > 0) {
        sub(/#.*/, "", t); gsub(/[ \t\r]/, "", t)
        if (t != "") prioritized[t] = 1
      }
      # Load in-scope controls.
      while ((getline c < cf) > 0) {
        sub(/#.*/, "", c); gsub(/[ \t\r]/, "", c)
        if (c != "") inscope[c] = 1
      }
      mit["prevents"] = 1; mit["detects"] = 1; mit["partial"] = 1
      defects = 0
    }
    NR == 1 {
      if ($1 != "threat_id" || $2 != "threat_name" || $3 != "control_id" || $4 != "mitigation") {
        print "DEFECT bad-header"; defects++
      }
      next
    }
    {
      tid = $1; cid = $3; m = $4
      gsub(/[ \t\r]/, "", tid); gsub(/[ \t\r]/, "", cid); gsub(/[ \t\r]/, "", m)
      if (cid == "") next                       # gap placeholder row; caught in END
      if (!(tid in prioritized)) {              # mapping to a non-prioritized threat = noise
        print "DEFECT unknown-threat " cid " " tid; defects++; next
      }
      covered[tid] = 1                          # this prioritized threat has a control
      mitigates[cid] = 1                        # this control touches a prioritized threat
      if (!(m in mit)) { print "DEFECT bad-mitigation " tid " " cid " " m; defects++ }
    }
    END {
      # DEFECT 1 — coverage gaps.
      for (t in prioritized) if (!(t in covered)) { print "DEFECT coverage-gap " t; defects++ }
      # DEFECT 2 — zero-threat controls.
      for (c in inscope) if (!(c in mitigates)) { print "DEFECT zero-threat-control " c; defects++ }
      exit (defects > 0 ? 1 : 0)
    }
  ' "$csv"
}

# 1) Seed map MUST fail and name BOTH defects.
set +e
BEFORE="$(validate work/coverage-map.csv work/prioritized-threats.txt work/controls-in-scope.txt)"; RC=$?
set -e
test "$RC" -ne 0 || { echo "FAIL: seed coverage map should fail validation but exited 0"; exit 1; }
echo "$BEFORE" | grep -q "DEFECT coverage-gap T-1486" \
  || { echo "FAIL: coverage gap on prioritized threat T-1486 not detected. Got: $BEFORE"; exit 1; }
echo "$BEFORE" | grep -q "DEFECT zero-threat-control CTRL-DLP-AGENT-04" \
  || { echo "FAIL: zero-threat control CTRL-DLP-AGENT-04 not detected. Got: $BEFORE"; exit 1; }

# 2) Resolve BOTH defects:
#    - close the coverage gap: map T-1486 to a real backup/recovery control with an honest label.
#    - retire the zero-threat control: the team's KILL verdict removes CTRL-DLP-AGENT-04 from scope.
sed 's/^T-1486,Data encrypted for ransom,,$/T-1486,Data encrypted for ransom,CTRL-BACKUP-RESTORE-05,detects/' \
  work/coverage-map.csv > work/coverage-map-resolved.csv
test "$(grep -c 'T-1486,Data encrypted for ransom,CTRL-BACKUP-RESTORE-05,detects' work/coverage-map-resolved.csv)" = "1" \
  || { echo "FAIL: coverage-gap resolution did not rewrite the T-1486 row"; exit 1; }
# The newly-mapped control must also be in scope, or it would itself look unmapped from the other side.
grep -q '^CTRL-BACKUP-RESTORE-05$' work/controls-in-scope.txt 2>/dev/null \
  || printf 'CTRL-BACKUP-RESTORE-05\n' >> work/controls-in-scope.txt
# KILL the zero-threat control: drop it from the in-scope list (the evidence-based removal verdict).
grep -v '^CTRL-DLP-AGENT-04$' work/controls-in-scope.txt > work/controls-resolved.txt

set +e
AFTER="$(validate work/coverage-map-resolved.csv work/prioritized-threats.txt work/controls-resolved.txt)"; RC=$?
set -e
test "$RC" -eq 0 || { echo "FAIL: resolved map should pass but exited $RC. Defects: $AFTER"; exit 1; }

# 3) Negative test: a row with an invalid mitigation label must be rejected (honesty check).
cp work/coverage-map-resolved.csv work/coverage-map-bad.csv
printf 'T-1110,Brute-force of credentials,CTRL-MFA-01,eliminates-totally\n' >> work/coverage-map-bad.csv
set +e
BAD="$(validate work/coverage-map-bad.csv work/prioritized-threats.txt work/controls-resolved.txt)"; RC=$?
set -e
test "$RC" -ne 0 || { echo "FAIL: invalid mitigation label 'eliminates-totally' should be rejected but validation passed"; exit 1; }
echo "$BAD" | grep -q "DEFECT bad-mitigation T-1110 CTRL-MFA-01 eliminates-totally" \
  || { echo "FAIL: invalid mitigation label not flagged. Got: $BAD"; exit 1; }

# 4) If bun is available, also run the REAL reference validator the lab ships, to keep the
#    awk smoke test and the TypeScript validator in agreement.
if command -v bun >/dev/null 2>&1; then
  set +e
  bun "$HERE/validate-coverage.ts" work/coverage-map.csv work/prioritized-threats.txt work/controls-in-scope.txt >/dev/null 2>&1; RC=$?
  set -e
  test "$RC" -ne 0 || { echo "FAIL: bun validator should fail on the seed map's two defects but exited 0"; exit 1; }
  set +e
  bun "$HERE/validate-coverage.ts" work/coverage-map-resolved.csv work/prioritized-threats.txt work/controls-resolved.txt >/dev/null 2>&1; RC=$?
  set -e
  test "$RC" -eq 0 || { echo "FAIL: bun validator should pass on the resolved map but exited $RC"; exit 1; }
  BUN_NOTE=" (bun reference validator agreed)"
else
  BUN_NOTE=" (bun not present; awk core-logic only)"
fi

echo "PASS: Module 11 lab reproduces — coverage gap (T-1486) caught, zero-threat control (CTRL-DLP-AGENT-04) caught, both resolved to a clean map, invalid mitigation label rejected${BUN_NOTE}."
