#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 08.
# Asserts the §6 guided lab's CORE LOGIC still reproduces on a clean machine
# (bash + coreutils + awk only — NO scanner, NO Terraform, NO cloud, NO network):
#
#   1. The non-compliant scan result drives the gate to FAIL (exit 1) — the
#      deliberately broken Terraform change is BLOCKED by the build.
#   2. A HIGH finding is mapped to the exact NIST control it enforces (SC-28),
#      proving the finding-to-control linkage the artifact requires.
#   3. The compliant scan result drives the gate to PASS (exit 0) and the build
#      proceeds — i.e. the remediation lifts the block.
#   4. The severity floor is real: a MEDIUM-only finding does not block at the
#      HIGH floor but does block when the floor is lowered to MEDIUM.
#
# This proves the EVALUATE step (the gate decision), not the scanner or the
# infrastructure. The real §6 lab runs Checkov/Trivy against real Terraform in
# real GitHub Actions; here we feed the gate committed scanner output instead.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

bash "$HERE/setup.sh" "$WORK/lab08" >/dev/null
GATE="$WORK/lab08/gate.sh"
MAP="$WORK/lab08/control-map.csv"
test -f "$WORK/lab08/checkov-noncompliant.json" || { echo "FAIL: setup did not create the non-compliant fixture"; exit 1; }
test -f "$WORK/lab08/checkov-compliant.json"     || { echo "FAIL: setup did not create the compliant fixture"; exit 1; }
test -f "$GATE"                                   || { echo "FAIL: setup did not create gate.sh"; exit 1; }

# --- Assertion 1: non-compliant change is BLOCKED (gate FAILs, exit 1). ---
set +e
NC_OUT="$(GATE_FAKE_TIME=ci bash "$GATE" "$WORK/lab08/checkov-noncompliant.json" "$MAP" HIGH 2>/dev/null)"
NC_CODE=$?
set -e
test "$NC_CODE" = "1" || { echo "FAIL: non-compliant scan should block the build (expected exit 1, got $NC_CODE)"; exit 1; }
printf '%s\n' "$NC_OUT" | grep -q "GATE_DECISION: FAIL" || { echo "FAIL: non-compliant gate did not emit a FAIL decision"; exit 1; }

# --- Assertion 2: a HIGH finding maps to the control it enforces (SC-28). ---
printf '%s\n' "$NC_OUT" | grep -q "CKV_AWS_19.*HIGH.*SC-28" \
  || { echo "FAIL: HIGH encryption finding (CKV_AWS_19) not mapped to control SC-28"; exit 1; }
printf '%s\n' "$NC_OUT" | grep -q "CKV_AWS_20.*HIGH.*AC-3" \
  || { echo "FAIL: HIGH public-access finding (CKV_AWS_20) not mapped to control AC-3"; exit 1; }

# Exactly two HIGH findings should be marked blocking; one MEDIUM should not.
BLOCKING_LINE="$(printf '%s\n' "$NC_OUT" | grep '^blocking_at_or_above_HIGH:')"
test "$BLOCKING_LINE" = "blocking_at_or_above_HIGH: 2" \
  || { echo "FAIL: expected 2 blocking HIGH findings, got -> '$BLOCKING_LINE'"; exit 1; }

# --- Assertion 3: compliant remediation PASSes (gate exit 0, build proceeds). ---
set +e
C_OUT="$(GATE_FAKE_TIME=ci bash "$GATE" "$WORK/lab08/checkov-compliant.json" "$MAP" HIGH 2>/dev/null)"
C_CODE=$?
set -e
test "$C_CODE" = "0" || { echo "FAIL: compliant scan should pass the build (expected exit 0, got $C_CODE)"; exit 1; }
printf '%s\n' "$C_OUT" | grep -q "GATE_DECISION: PASS" || { echo "FAIL: compliant gate did not emit a PASS decision"; exit 1; }

# --- Assertion 4: the severity floor is real (MEDIUM blocks only at MEDIUM). ---
set +e
M_OUT="$(GATE_FAKE_TIME=ci bash "$GATE" "$WORK/lab08/checkov-noncompliant.json" "$MAP" MEDIUM 2>/dev/null)"
M_CODE=$?
set -e
test "$M_CODE" = "1" || { echo "FAIL: lowering the floor to MEDIUM should still block (expected exit 1, got $M_CODE)"; exit 1; }
M_LINE="$(printf '%s\n' "$M_OUT" | grep '^blocking_at_or_above_MEDIUM:')"
test "$M_LINE" = "blocking_at_or_above_MEDIUM: 3" \
  || { echo "FAIL: at the MEDIUM floor all 3 findings should block, got -> '$M_LINE'"; exit 1; }

echo "PASS: Module 08 gate reproduces (non-compliant=BLOCKED, HIGH->SC-28/AC-3 mapped, compliant=PASS, severity-floor enforced)"
