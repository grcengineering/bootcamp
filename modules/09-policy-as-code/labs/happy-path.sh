#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 09.
# Asserts the §6 guided lab's CORE LOGIC still reproduces on a clean machine
# (bash + coreutils + awk only — NO Cedar CLI, NO OPA, NO cloud, NO network):
#
#   1. The violating access export drives the gate to FAIL (exit 1) — the
#      change that grants legacy-admin is BLOCKED — and a passed:false evidence
#      record is emitted with the correct §4.6 shape.
#   2. The clean access export drives the gate to PASS (exit 0) — the build
#      proceeds — and a passed:true evidence record is emitted.
#   3. The verdict checks BOTH action AND role: the clean export contains a
#      REVOKE of legacy-admin, which must NOT be treated as a violation. A check
#      that fired on the role alone would be silently wrong (the §4.3 trap).
#   4. The emitted evidence record carries every required field
#      (control_id, policy_engine, decision, passed, violations, input_ref,
#      evaluated_at, run) — proof falls out of EVALUATE as a by-product.
#   5. TAMPER PROOF: changing the violating row's action from grantRole to
#      revokeRole must flip the gate from FAIL to PASS — proving the assertions
#      bite on the real verdict, not on incidental text.
#
# This proves the EVALUATE step (the verdict-function and the gate decision),
# not a policy engine. The real §6 lab can swap in Cedar's or OPA's CLI and read
# the same exit code; here we feed the gate committed CSV fixtures instead.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

bash "$HERE/setup.sh" "$WORK/lab09" >/dev/null
LAB="$WORK/lab09"
GATE="$LAB/run-policy-gate.sh"
CHECK="$LAB/check.sh"
STORE="$LAB/evidence-store"

test -f "$LAB/access-clean.csv"     || { echo "FAIL: setup did not create the clean fixture"; exit 1; }
test -f "$LAB/access-violation.csv" || { echo "FAIL: setup did not create the violation fixture"; exit 1; }
test -f "$LAB/policy.cedar"         || { echo "FAIL: setup did not create the Cedar policy"; exit 1; }
test -f "$LAB/policy.rego"          || { echo "FAIL: setup did not create the Rego policy"; exit 1; }
test -f "$GATE"                     || { echo "FAIL: setup did not create run-policy-gate.sh"; exit 1; }
test -f "$CHECK"                    || { echo "FAIL: setup did not create check.sh"; exit 1; }
test -d "$STORE"                    || { echo "FAIL: setup did not create the evidence store"; exit 1; }

# Tiny field reader for the flat JSON evidence records (no jq dependency).
# Usage: jval <file> <key> -> prints the value (string unquoted, bool/number raw).
jval() {
  sed -n "s/.*\"$2\"[ ]*:[ ]*\"\{0,1\}\([^,\"}]*\)\"\{0,1\}.*/\1/p" "$1" | head -n1
}

# --- Assertion 1: violating input is BLOCKED (gate FAILs, exit 1). ---
set +e
V_OUT="$(GATE_FAKE_TIME=2026-05-28T17:04:00Z CI_RUN_ID=ci-1789 bash "$GATE" "$LAB/access-violation.csv" "$STORE" 2>/dev/null)"
V_CODE=$?
set -e
test "$V_CODE" = "1" || { echo "FAIL: violating export should block the build (expected exit 1, got $V_CODE)"; exit 1; }
printf '%s\n' "$V_OUT" | grep -q "GATE  result=FAIL" || { echo "FAIL: violating gate did not emit a FAIL result"; exit 1; }
printf '%s\n' "$V_OUT" | grep -q "DENY  row 4: carol -> legacy-admin" \
  || { echo "FAIL: the forbidden grant (row 4 carol -> legacy-admin) was not denied"; exit 1; }

# The failing run must have written exactly one passed:false record.
V_REC="$(ls "$STORE"/AC-6-legacy-admin-ci-1789-*.json 2>/dev/null | head -n1)"
test -n "$V_REC" || { echo "FAIL: violating run wrote no evidence record"; exit 1; }
test "$(jval "$V_REC" passed)"     = "false"             || { echo "FAIL: violating record passed != false"; exit 1; }
test "$(jval "$V_REC" decision)"   = "deny"              || { echo "FAIL: violating record decision != deny"; exit 1; }
test "$(jval "$V_REC" violations)" = "1"                 || { echo "FAIL: violating record violations != 1"; exit 1; }
test "$(jval "$V_REC" control_id)" = "AC-6-legacy-admin" || { echo "FAIL: violating record control_id wrong"; exit 1; }

# --- Assertion 4: required evidence-record shape (every §4.6 field present). ---
for field in control_id policy_engine decision passed violations input_ref evaluated_at run; do
  grep -q "\"$field\"" "$V_REC" || { echo "FAIL: evidence record missing required field: $field"; exit 1; }
done
test "$(jval "$V_REC" evaluated_at)" = "2026-05-28T17:04:00Z" || { echo "FAIL: evidence record timestamp not propagated"; exit 1; }
test "$(jval "$V_REC" run)"          = "ci-1789"              || { echo "FAIL: evidence record run id not propagated"; exit 1; }

# --- Assertions 2 & 3: clean input PASSes, and REVOKING legacy-admin is allowed. ---
set +e
C_OUT="$(GATE_FAKE_TIME=2026-05-28T17:22:00Z CI_RUN_ID=ci-1804 bash "$GATE" "$LAB/access-clean.csv" "$STORE" 2>/dev/null)"
C_CODE=$?
set -e
test "$C_CODE" = "0" || { echo "FAIL: clean export should pass the build (expected exit 0, got $C_CODE)"; exit 1; }
printf '%s\n' "$C_OUT" | grep -q "GATE  result=PASS" || { echo "FAIL: clean gate did not emit a PASS result"; exit 1; }
# The clean export has a revokeRole legacy-admin row: it must NOT have been denied.
printf '%s\n' "$C_OUT" | grep -q "^DENY" && { echo "FAIL: a clean export (incl. a legacy-admin REVOKE) produced a denial"; exit 1; }

C_REC="$(ls "$STORE"/AC-6-legacy-admin-ci-1804-*.json 2>/dev/null | head -n1)"
test -n "$C_REC" || { echo "FAIL: clean run wrote no evidence record"; exit 1; }
test "$(jval "$C_REC" passed)"     = "true"  || { echo "FAIL: clean record passed != true"; exit 1; }
test "$(jval "$C_REC" decision)"   = "allow" || { echo "FAIL: clean record decision != allow"; exit 1; }
test "$(jval "$C_REC" violations)" = "0"     || { echo "FAIL: clean record violations != 0"; exit 1; }

# We now have a before/after audit trail: two records, one false, one true.
REC_COUNT="$(ls "$STORE"/*.json 2>/dev/null | wc -l | tr -d ' ')"
test "$REC_COUNT" = "2" || { echo "FAIL: expected exactly 2 evidence records (one fail, one pass), got $REC_COUNT"; exit 1; }

# --- Assertion 5: TAMPER PROOF — the assertion bites on the real verdict. ---
# Flip the forbidden GRANT (row 4) to a REVOKE. The control forbids only grants,
# so this single-word change must flip the gate FAIL -> PASS. If the gate still
# failed, our verdict-function would be ignoring the action column.
sed 's/4,carol,grantRole,legacy-admin/4,carol,revokeRole,legacy-admin/' \
  "$LAB/access-violation.csv" > "$LAB/access-tampered.csv"
set +e
T_OUT="$(GATE_FAKE_TIME=2026-05-28T18:00:00Z CI_RUN_ID=ci-tamper bash "$GATE" "$LAB/access-tampered.csv" "$STORE" 2>/dev/null)"
T_CODE=$?
set -e
test "$T_CODE" = "0" \
  || { echo "FAIL (tamper): turning the forbidden GRANT into a REVOKE should flip the gate to PASS (got exit $T_CODE) — the verdict is not checking the action column"; exit 1; }
printf '%s\n' "$T_OUT" | grep -q "GATE  result=PASS" \
  || { echo "FAIL (tamper): expected PASS after the grant->revoke edit"; exit 1; }

# And the inverse must hold: a clean row turned INTO a forbidden grant must FAIL,
# proving the assertion is not vacuously passing on every input.
sed 's/1,alice,grantRole,reader/1,alice,grantRole,legacy-admin/' \
  "$LAB/access-clean.csv" > "$LAB/access-injected.csv"
set +e
I_OUT="$(GATE_FAKE_TIME=2026-05-28T18:05:00Z CI_RUN_ID=ci-inject bash "$GATE" "$LAB/access-injected.csv" "$STORE" 2>/dev/null)"
I_CODE=$?
set -e
test "$I_CODE" = "1" \
  || { echo "FAIL (tamper): injecting a legacy-admin GRANT into the clean export should block (got exit $I_CODE)"; exit 1; }

echo "PASS: Module 09 policy gate reproduces (violation=BLOCKED+passed:false, clean=PASS+passed:true, revoke!=grant, evidence shape complete, tamper flips the verdict both ways)"
