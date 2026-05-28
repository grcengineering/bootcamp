#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 15 (Capstone: Ship One Control).
# Proves the CORE COVERAGE LOGIC of the capstone on a CLEAN machine (bash + coreutils + awk only):
#   - the committed COMPLETE manifest -> validator asserts all 7 loop stages covered
#     + before/after present -> PASS, exit 0
#   - the validator names each of the 7 stages it resolved (no silent coverage)
#   - the committed INCOMPLETE manifest (MONITOR + before_after missing) -> validator
#     REJECTS it, NAMES the gaps, exits non-zero (the gate actually gates)
#   - the coverage verdict is reproducible (same verdict on two runs)
# NO live infra: no cloud, no network, no credentials, no Docker, no yq.
# The §6 lab attaches a learner's REAL control artifacts to this same manifest+validator;
# this smoke test proves the COVERAGE LOGIC, not any real control's infrastructure.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# Build the starter capstone repo (validator + placeholder artifacts) from the committed manifest.
LAB="$(bash "$HERE/setup.sh" "$WORK/capstone-lab")"
test -d "$LAB" || { echo "FAIL: setup did not create the lab dir"; exit 1; }
test -f "$LAB/validate-capstone.sh" || { echo "FAIL: setup did not create the validator"; exit 1; }
test -f "$LAB/capstone-manifest.yaml" || { echo "FAIL: setup did not copy the manifest"; exit 1; }

# --- Positive case: COMPLETE manifest. Expect PASS (exit 0) and all 7 stages named. ---
set +e
OUT_OK="$("$LAB/validate-capstone.sh" "$LAB/capstone-manifest.yaml" 2>&1)"
RC_OK=$?
set -e
test "$RC_OK" -eq 0 || { echo "FAIL: complete manifest should validate PASS (got exit $RC_OK)"; echo "$OUT_OK"; exit 1; }
printf '%s\n' "$OUT_OK" | grep -q "PASS: all 7 loop stages covered" || { echo "FAIL: validator did not confirm full coverage"; echo "$OUT_OK"; exit 1; }

# Each of the seven loop stages must be individually resolved to an artifact (no silent gaps).
for stage in UNDERSTAND LOCATE QUERY EVALUATE EVIDENCE MONITOR OWN; do
  printf '%s\n' "$OUT_OK" | grep -Eq "^  ${stage} +ok  ->" || { echo "FAIL: stage $stage not reported as covered"; echo "$OUT_OK"; exit 1; }
done
# The before/after must be confirmed present.
printf '%s\n' "$OUT_OK" | grep -q "before/after ok ->" || { echo "FAIL: before/after not confirmed present"; echo "$OUT_OK"; exit 1; }

# --- Negative case: INCOMPLETE manifest (MONITOR + before_after missing). Expect FAIL (exit 1). ---
cp "$HERE/fixtures/capstone-manifest-incomplete.yaml" "$LAB/capstone-manifest-incomplete.yaml"
set +e
OUT_BAD="$("$LAB/validate-capstone.sh" "$LAB/capstone-manifest-incomplete.yaml" 2>&1)"
RC_BAD=$?
set -e
test "$RC_BAD" -eq 1 || { echo "FAIL: incomplete manifest should be rejected with exit 1 (got exit $RC_BAD)"; echo "$OUT_BAD"; exit 1; }
printf '%s\n' "$OUT_BAD" | grep -Eq "^  MONITOR +MISSING" || { echo "FAIL: validator did not name the missing MONITOR stage"; echo "$OUT_BAD"; exit 1; }
printf '%s\n' "$OUT_BAD" | grep -q "before/after MISSING" || { echo "FAIL: validator did not flag the missing before/after"; echo "$OUT_BAD"; exit 1; }
printf '%s\n' "$OUT_BAD" | grep -q "FAIL: capstone coverage incomplete" || { echo "FAIL: validator did not emit the incomplete-coverage verdict"; echo "$OUT_BAD"; exit 1; }

# --- Reproducibility: the coverage verdict is deterministic across two runs. ---
V1="$("$LAB/validate-capstone.sh" "$LAB/capstone-manifest.yaml" | tail -1)"
V2="$("$LAB/validate-capstone.sh" "$LAB/capstone-manifest.yaml" | tail -1)"
test "$V1" = "$V2" || { echo "FAIL: coverage verdict not reproducible (V1='$V1' V2='$V2')"; exit 1; }

echo "PASS: Module 15 capstone coverage reproduces (complete=PASS+7-stages+before/after, incomplete=FAIL+named-gaps, deterministic)"
