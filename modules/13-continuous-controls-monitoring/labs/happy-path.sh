#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 13 — Continuous Controls Monitoring.
#
# Proves the CORE CCM LOOP LOGIC on a CLEAN machine (bash + coreutils + awk only —
# NO cloud, NO network, NO credentials, NO Docker, NO jq):
#
#   1. The committed control-check evaluates a COMPLIANT snapshot  -> PASS (exit 0),
#      an evidence record IS emitted, and NO alert fires.
#   2. The committed control-check evaluates a DRIFTED  snapshot   -> FAIL (exit 1),
#      an evidence record IS emitted, and an alert FIRES naming the drifted resource.
#   3. Evidence is emitted on BOTH runs (compliant AND drift) — proof is a byproduct
#      of the check, not a manual step.
#   4. The append-only ledger gains exactly one history row per run (the 30-day-history
#      substrate the dashboard tile reads).
#   5. The check is reproducible: the same snapshot yields the same verdict twice.
#   6. A PRETTY-PRINTED (multi-line) drifted snapshot — the shape real `aws ... --output json`,
#      `jq .`, and AWS Config exports actually emit — is CAUGHT as noncompliant (FAIL, exit 1),
#      not silently passed. (Regression guard for the fail-open multi-line parsing bug.)
#   7. An EMPTY / zero-resource snapshot FAILS CLOSED: the check refuses to emit a green verdict
#      when it evaluated nothing (non-zero exit, no PASS), and the loop raises a drift alert.
#
# This proves the MONITOR stage's evaluation core. The real §6 lab wires these same
# functions to a scheduler and a live cloud snapshot; here we feed them committed fixtures.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# Generate the check library + evidence store from the committed fixtures.
LAB="$(bash "$HERE/setup.sh" "$WORK/ccm-lab")"
test -f "$LAB/ccm-check.sh" || { echo "FAIL: setup did not create the check library"; exit 1; }
# shellcheck disable=SC1091
source "$LAB/ccm-check.sh"
EVDIR="$LAB/evidence"

COMPLIANT="$HERE/fixtures/state-compliant.json"
DRIFTED="$HERE/fixtures/state-drifted.json"
DRIFTED_PRETTY="$HERE/fixtures/state-drifted-pretty.json"
EMPTY="$HERE/fixtures/state-empty.json"
test -f "$COMPLIANT"       || { echo "FAIL: missing fixture state-compliant.json"; exit 1; }
test -f "$DRIFTED"         || { echo "FAIL: missing fixture state-drifted.json"; exit 1; }
test -f "$DRIFTED_PRETTY"  || { echo "FAIL: missing fixture state-drifted-pretty.json"; exit 1; }
test -f "$EMPTY"           || { echo "FAIL: missing fixture state-empty.json"; exit 1; }

# --- Assertion 1: COMPLIANT state -> PASS (exit 0), evidence record emitted, NO alert. ---
if emit_evidence "$COMPLIANT" "$EVDIR"; then RC_OK=0; else RC_OK=$?; fi
test "$RC_OK" -eq 0 || { echo "FAIL: compliant state should evaluate PASS (got exit $RC_OK)"; exit 1; }
COMPLIANT_RECORD="$(ls "$EVDIR"/run-*.evidence 2>/dev/null | head -1)"
test -n "$COMPLIANT_RECORD" || { echo "FAIL: no evidence record emitted for the compliant run"; exit 1; }
grep -q "verdict=PASS" "$COMPLIANT_RECORD" || { echo "FAIL: compliant evidence record does not show PASS"; exit 1; }
if ls "$EVDIR"/alert-*.txt >/dev/null 2>&1; then echo "FAIL: alert fired on a COMPLIANT state (false positive)"; exit 1; fi

# --- Assertion 2: DRIFTED state -> FAIL (exit 1), evidence record emitted, alert FIRES. ---
if emit_evidence "$DRIFTED" "$EVDIR"; then RC_DRIFT=0; else RC_DRIFT=$?; fi
test "$RC_DRIFT" -eq 1 || { echo "FAIL: drifted state should evaluate FAIL/exit 1 (got exit $RC_DRIFT)"; exit 1; }
ALERT="$(ls "$EVDIR"/alert-*.txt 2>/dev/null | head -1)"
test -n "$ALERT" || { echo "FAIL: drift did not fire an alert"; exit 1; }
grep -q "acme-public-website" "$ALERT" || { echo "FAIL: alert does not name the drifted resource (acme-public-website)"; exit 1; }

# --- Assertion 3: evidence emitted on BOTH runs (compliant + drift). ---
RECORDS="$(ls "$EVDIR"/run-*.evidence 2>/dev/null | grep -c . || true)"
test "$RECORDS" -eq 2 || { echo "FAIL: expected 2 evidence records (compliant + drift), got $RECORDS"; exit 1; }

# --- Assertion 4: the append-only ledger gained exactly two rows (one per run). ---
LEDGER_ROWS="$(grep -c . "$EVDIR/ledger.log")"
test "$LEDGER_ROWS" -eq 2 || { echo "FAIL: ledger should have 2 rows, has $LEDGER_ROWS"; exit 1; }
grep -q "rc=0" "$EVDIR/ledger.log" || { echo "FAIL: ledger missing the compliant (rc=0) row"; exit 1; }
grep -q "rc=1" "$EVDIR/ledger.log" || { echo "FAIL: ledger missing the drift (rc=1) row"; exit 1; }

# --- Assertion 5: reproducibility — same snapshot, same verdict twice (deterministic check). ---
if V1="$(evaluate_control "$DRIFTED" | head -1)"; then :; fi
if V2="$(evaluate_control "$DRIFTED" | head -1)"; then :; fi
test "$V1" = "$V2" || { echo "FAIL: check not reproducible (V1='$V1' V2='$V2')"; exit 1; }

# --- Assertion 6: a PRETTY-PRINTED (multi-line) drifted snapshot is CAUGHT, not silently passed. ---
# This is the regression guard for the fail-open bug: real `aws ... --output json`, `jq .`, and AWS
# Config exports are multi-line, with the bucket name and its flags on DIFFERENT physical lines. A
# parser that needs them on the same line evaluates 0 buckets and green-lights a public bucket.
PRETTY_OUT="$(evaluate_control "$DRIFTED_PRETTY")" && RC_PRETTY=0 || RC_PRETTY=$?
test "$RC_PRETTY" -eq 1 || { echo "FAIL: pretty-printed drifted snapshot must FAIL/exit 1 (got exit $RC_PRETTY) — fail-open regression"; exit 1; }
printf '%s\n' "$PRETTY_OUT" | grep -q "^FAIL " || { echo "FAIL: pretty-printed drift did not print a FAIL verdict"; exit 1; }
printf '%s\n' "$PRETTY_OUT" | grep -q "evaluated=3" || { echo "FAIL: pretty-printed drift parsed the wrong bucket count (expected evaluated=3): $PRETTY_OUT"; exit 1; }
printf '%s\n' "$PRETTY_OUT" | grep -q "^NONCOMPLIANT acme-public-website$" || { echo "FAIL: pretty-printed drift did not name the public bucket as noncompliant"; exit 1; }
# And the full loop must raise an alert naming the drifted resource (drift, not silent health).
EVDIR2="$LAB/evidence-pretty"
if emit_evidence "$DRIFTED_PRETTY" "$EVDIR2"; then echo "FAIL: emit_evidence passed a pretty-printed public bucket"; exit 1; fi
ALERT_PRETTY="$(ls "$EVDIR2"/alert-*.txt 2>/dev/null | head -1)"
test -n "$ALERT_PRETTY" || { echo "FAIL: pretty-printed drift did not fire an alert"; exit 1; }
grep -q "acme-public-website" "$ALERT_PRETTY" || { echo "FAIL: pretty-printed alert does not name the drifted resource"; exit 1; }

# --- Assertion 7: an EMPTY / zero-resource snapshot FAILS CLOSED (no green verdict, no exit 0). ---
EMPTY_OUT="$(evaluate_control "$EMPTY" 2>/dev/null)" && RC_EMPTY=0 || RC_EMPTY=$?
test "$RC_EMPTY" -ne 0 || { echo "FAIL: empty snapshot must NOT exit 0 — fail-open on zero resources"; exit 1; }
printf '%s\n' "$EMPTY_OUT" | grep -q "^PASS " && { echo "FAIL: empty snapshot emitted a PASS verdict — must fail closed"; exit 1; }
printf '%s\n' "$EMPTY_OUT" | grep -q "evaluated=0" || { echo "FAIL: empty snapshot verdict should report evaluated=0: $EMPTY_OUT"; exit 1; }
# The loop must treat fail-closed as a drift the responder sees, not as healthy silence.
EVDIR3="$LAB/evidence-empty"
if emit_evidence "$EMPTY" "$EVDIR3"; then echo "FAIL: emit_evidence returned success (exit 0) on a zero-resource snapshot"; exit 1; fi
ALERT_EMPTY="$(ls "$EVDIR3"/alert-*.txt 2>/dev/null | head -1)"
test -n "$ALERT_EMPTY" || { echo "FAIL: zero-resource fail-closed did not fire an alert"; exit 1; }
ls "$EVDIR3"/run-*.evidence >/dev/null 2>&1 || { echo "FAIL: zero-resource run emitted no evidence record"; exit 1; }
grep -q "exit_code=0" "$EVDIR3"/run-*.evidence && { echo "FAIL: zero-resource evidence record shows exit_code=0 — must fail closed"; exit 1; }

echo "PASS: Module 13 CCM loop reproduces (compliant=PASS+evidence+no-alert, drift=FAIL+evidence+alert, ledger=2 rows, deterministic, pretty-printed drift CAUGHT, empty input FAILS CLOSED)"
