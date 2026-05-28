#!/usr/bin/env bash
# Lab-reproduction smoke test: run every module's labs/happy-path.sh in isolation.
# A lab that no longer reproduces fails the build (the curriculum has tests).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
ran=0
for hp in "$ROOT"/modules/*/labs/happy-path.sh; do
  [ -f "$hp" ] || continue
  ran=$((ran + 1))
  mod="$(basename "$(dirname "$(dirname "$hp")")")"
  out="$(bash "$hp" 2>&1)"
  if [ $? -eq 0 ]; then
    echo "✓ $mod"
    echo "$out" | sed 's/^/    /'
  else
    fail=$((fail + 1))
    echo "✗ $mod"
    echo "$out" | sed 's/^/    /'
  fi
done
echo ""
if [ "$ran" -eq 0 ]; then
  echo "lab-repro: no labs found"
  exit 0
fi
echo "lab-repro: $((ran - fail))/$ran labs reproduce"
[ "$fail" -eq 0 ] || exit 1
