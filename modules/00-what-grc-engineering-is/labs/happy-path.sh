#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 00.
# The §6 lab is CONCEPTUAL (no shell), so the happy-path validates the GRC-relevant CORE
# LOGIC of the lab: the rubric-evaluation of a one-page legacy-vs-engineered analysis.
# It runs on a clean machine with only bash + coreutils (no network, no cloud, no Docker).
#
# It asserts the EVALUATION LOGIC two ways:
#   1. a CONFORMING sample analysis PASSES the structural check
#      (names all 5 legacy problems, maps all 7 loop stages, states a reality->policy inversion);
#   2. a NON-CONFORMING (legacy-only) sample is correctly REJECTED
#      (proves the assertion discriminates, not just rubber-stamps).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# Generate the conforming fixture.
bash "$HERE/setup.sh" "$WORK/lab00" >/dev/null
FIXTURE="lab00/legacy-vs-engineered-laptop-encryption.md"
test -f "$FIXTURE" || { echo "FAIL: setup did not create the sample analysis"; exit 1; }

# The five named legacy problems the analysis MUST address (§4.3).
PROBLEMS=("manual toil" "transactional" "whack-a-mole" "closed-framework" "commoditized")
# The seven irreducible loop stages the engineered arrow MUST map (§4.6).
STAGES=("UNDERSTAND" "LOCATE" "QUERY" "EVALUATE" "EVIDENCE" "MONITOR" "OWN")

# evaluate_analysis FILE -> exit 0 if the document conforms, non-zero otherwise.
# This IS the rubric logic the conceptual lab is graded on, expressed as code.
evaluate_analysis() {
  local file="$1" missing=0 p s
  for p in "${PROBLEMS[@]}"; do
    grep -qi -- "$p" "$file" || { echo "  missing legacy problem: $p"; missing=1; }
  done
  for s in "${STAGES[@]}"; do
    grep -q -- "$s" "$file" || { echo "  missing loop stage: $s"; missing=1; }
  done
  # The reality->policy inversion must be stated explicitly (arrow or the words).
  if ! grep -qiE 'reality[[:space:]]*->[[:space:]]*policy|reality.*drive.*policy' "$file"; then
    echo "  missing reality->policy inversion statement"
    missing=1
  fi
  return "$missing"
}

# Assertion 1: the conforming sample PASSES.
if ! evaluate_analysis "$FIXTURE"; then
  echo "FAIL: conforming sample analysis did not pass the structural rubric"
  exit 1
fi

# Count proves coverage is exhaustive, not partial.
P_HITS=0; for p in "${PROBLEMS[@]}"; do grep -qi -- "$p" "$FIXTURE" && P_HITS=$((P_HITS+1)); done
test "$P_HITS" = "5" || { echo "FAIL: expected all 5 legacy problems named, found $P_HITS"; exit 1; }
S_HITS=0; for s in "${STAGES[@]}"; do grep -q -- "$s" "$FIXTURE" && S_HITS=$((S_HITS+1)); done
test "$S_HITS" = "7" || { echo "FAIL: expected all 7 loop stages mapped, found $S_HITS"; exit 1; }

# Assertion 2: a legacy-only document is correctly REJECTED (the check discriminates).
cat > "lab00/non-conforming.md" <<'BAD'
# Encryption control
We confirm laptops are encrypted by collecting screenshots each quarter for the auditor.
That is all we do.
BAD
if evaluate_analysis "lab00/non-conforming.md" >/dev/null 2>&1; then
  echo "FAIL: non-conforming legacy-only analysis was wrongly accepted"
  exit 1
fi

echo "PASS: Module 00 lab reproduces (conforming analysis names 5/5 problems, maps 7/7 stages, states inversion; legacy-only sample correctly rejected)"
