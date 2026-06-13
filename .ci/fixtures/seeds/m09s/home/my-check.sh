#!/usr/bin/env bash
# my-check.sh — the verdict-function: decision = policy(input).
# Denies a row only when BOTH the action is grantRole AND the role is legacy-admin.
INPUT="${1:-}"
if [ -z "$INPUT" ]; then
  echo "usage: my-check.sh <access-export.csv>" >&2
  exit 2
fi
if [ ! -f "$INPUT" ]; then
  echo "ERROR: access export not found: $INPUT" >&2
  exit 2
fi
awk -F, 'NR == 1 { next } $3 == "grantRole" && $4 == "legacy-admin" { print "DENY  row " $1 ": " $2 " -> " $4 "  (forbidden by AC-6)" }' "$INPUT"
COUNT=$(grep -c ',grantRole,legacy-admin$' "$INPUT")
if [ "$COUNT" -gt 0 ]; then
  echo "RESULT  control=AC-6-legacy-admin  decision=deny  violations=$COUNT"
  exit 1
fi
echo "RESULT  control=AC-6-legacy-admin  decision=allow  violations=0"
exit 0
