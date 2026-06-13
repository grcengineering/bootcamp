#!/usr/bin/env bash
# my-gate.sh — the CI gate: run the verdict-function, then write one evidence
# record on EVERY run, and exit with the verdict so the pipeline blocks on deny.
INPUT="${1:-}"
STORE="${2:-}"
if [ -z "$INPUT" ]; then
  echo "usage: my-gate.sh <access-export.csv> <evidence-store-dir>" >&2
  exit 2
fi
if [ -z "$STORE" ]; then
  echo "usage: my-gate.sh <access-export.csv> <evidence-store-dir>" >&2
  exit 2
fi
mkdir -p "$STORE"
RUN_ID="${CI_RUN_ID:-ci-local}"
NOW="$GATE_FAKE_TIME"
if [ -z "$NOW" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
fi
echo "EVAL  control=AC-6-legacy-admin engine=cedar input=$INPUT"
./my-check.sh "$INPUT"
CODE=$?
if [ "$CODE" -eq 0 ]; then
  DECISION="allow"
  PASSED="true"
  GATE="PASS"
else
  DECISION="deny"
  PASSED="false"
  GATE="FAIL"
fi
COUNT=$(grep -c ',grantRole,legacy-admin$' "$INPUT")
STAMP=$(echo "$NOW" | tr -d 'TZ:-')
RECORD="$STORE/AC-6-legacy-admin-$RUN_ID-$STAMP.json"
echo "{\"control_id\": \"AC-6-legacy-admin\", \"policy_engine\": \"cedar\", \"decision\": \"$DECISION\", \"passed\": $PASSED, \"violations\": $COUNT, \"input_ref\": \"$INPUT\", \"evaluated_at\": \"$NOW\", \"run\": \"$RUN_ID\"}" > "$RECORD"
echo "EVIDENCE  wrote $RECORD"
echo "GATE  result=$GATE  (violations=$COUNT)  exit=$CODE"
exit "$CODE"
