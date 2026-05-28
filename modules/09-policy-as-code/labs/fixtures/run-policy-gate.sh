#!/usr/bin/env bash
# run-policy-gate.sh — the CI gate of the §6 lab.
#
# Wraps check.sh (the verdict-function) so a pipeline can call ONE thing per
# pull request. It does two jobs the loop demands:
#
#   1. EVALUATE: run the verdict-function against the input and propagate its
#      exit code, so a violation EXITS NON-ZERO and the build is blocked. The
#      non-compliant change physically cannot merge.
#   2. EVIDENCE: on EVERY run, regardless of verdict, append one structured,
#      versioned JSON evidence record to the evidence store. Proof is a
#      by-product of judging, not a separate manual chore.
#
# Usage:   run-policy-gate.sh <access-export.csv> <evidence-store-dir>
# Exit:    0 = control PASSES (build proceeds)   1 = control FAILS (blocked)
#          2 = usage / input error
# Deps:    bash + coreutils + awk + check.sh. No engine, no network, no jq.
set -uo pipefail

INPUT="${1:-}"
STORE="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/check.sh"

if [ -z "$INPUT" ] || [ -z "$STORE" ]; then
  echo "usage: run-policy-gate.sh <access-export.csv> <evidence-store-dir>" >&2
  exit 2
fi
[ -f "$INPUT" ] || { echo "ERROR: access export not found: $INPUT" >&2; exit 2; }
[ -f "$CHECK" ] || { echo "ERROR: check.sh not found next to gate: $CHECK" >&2; exit 2; }
mkdir -p "$STORE"

CONTROL_ID="AC-6-legacy-admin"
ENGINE="${POLICY_ENGINE:-cedar}"
RUN_ID="${CI_RUN_ID:-ci-local}"
NOW="${GATE_FAKE_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)}"

# Stable, content-addressed-ish input reference (8 hex chars) so the evidence
# record names which input was judged. Falls back gracefully if no checksum tool
# is present; the record shape is the contract, the exact hash bytes are not.
input_ref() {
  local base sum
  base="$(basename "$INPUT")"
  sum="$(cksum "$INPUT" 2>/dev/null | awk '{printf "%08x", $1}')"
  [ -n "$sum" ] && printf '%s@%s' "${base%.*}" "${sum:0:8}" || printf '%s@nohash' "${base%.*}"
}

echo "EVAL  control=$CONTROL_ID engine=$ENGINE input=$(basename "$INPUT")"

# Run the verdict-function. Capture its DENY output and exit code; the exit code
# IS the gate decision.
set +e
CHECK_OUT="$(bash "$CHECK" "$INPUT")"
CHECK_CODE=$?
set -e 2>/dev/null || true

printf '%s\n' "$CHECK_OUT" | grep '^DENY' || true
VIOLATIONS="$(printf '%s\n' "$CHECK_OUT" | sed -n 's/.*violations=\([0-9][0-9]*\).*/\1/p' | tail -n1)"
VIOLATIONS="${VIOLATIONS:-0}"

if [ "$CHECK_CODE" -eq 0 ]; then
  DECISION="allow"; PASSED="true"; GATE="PASS"
elif [ "$CHECK_CODE" -eq 1 ]; then
  DECISION="deny";  PASSED="false"; GATE="FAIL"
else
  echo "ERROR: verdict-function errored (exit $CHECK_CODE)" >&2
  exit 2
fi

# EVIDENCE: one record per run, regardless of verdict. This is the §4.6 shape.
REF="$(input_ref)"
RECORD="$STORE/${CONTROL_ID}-${RUN_ID}-$(printf '%s' "$NOW" | tr -dc '0-9').json"
printf '%s\n' "{\"control_id\": \"$CONTROL_ID\", \"policy_engine\": \"$ENGINE\", \"decision\": \"$DECISION\", \"passed\": $PASSED, \"violations\": $VIOLATIONS, \"input_ref\": \"$REF\", \"evaluated_at\": \"$NOW\", \"run\": \"$RUN_ID\"}" > "$RECORD"

echo "EVIDENCE  wrote $RECORD"
echo "GATE  result=$GATE  (violations=$VIOLATIONS)  exit=$CHECK_CODE"
exit "$CHECK_CODE"
