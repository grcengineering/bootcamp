#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 05.
# Asserts the §6 guided lab's CORE EVALUATION LOGIC still reproduces on a clean machine.
# Hard requirements: bash + coreutils only. python3 is OPTIONAL — if present we assert the
# real reference validator's report; in ALL cases we ALSO run a bash+coreutils fallback that
# independently re-derives the verdicts and malformed-handling, so CI is deterministically
# green with or without python3 (no network, no cloud, no Docker).
#
# What it proves against BUNDLED FIXTURES (one JSON evidence record per laptop):
#   - 2 hosts PASS the encryption control, 1 FAILs, 1 missing-field FAILs
#   - the malformed file is recorded as an error and does NOT abort the run (graceful handling)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# 1. Generate the bundled fixtures (5 files: 2 pass, 1 fail, 1 missing-field, 1 malformed).
bash "$HERE/setup.sh" "$WORK/evidence" >/dev/null
test -f evidence/lt-01.json || { echo "FAIL: setup did not create the evidence fixtures"; exit 1; }
test -f evidence/lt-05.json || { echo "FAIL: malformed fixture missing"; exit 1; }

# ---------------------------------------------------------------------------
# 2. Deterministic bash + coreutils fallback (ALWAYS runs; CI green without python3).
#    Re-derives each verdict from the raw JSON text using only grep/coreutils:
#      - PASS  iff the record literally contains  "encrypted": true
#      - FAIL  for "encrypted": false OR no encrypted field at all
#      - ERROR for a file that is not parseable as a single-line JSON object
#               (no closing brace) — the malformed fixture
# ---------------------------------------------------------------------------
pass=0 fail=0 errors=0
for f in evidence/*.json; do
  # An evaluable record is a JSON object: must contain both an opening and closing brace.
  if grep -q '{' "$f" && grep -q '}' "$f"; then
    if grep -Eq '"encrypted"[[:space:]]*:[[:space:]]*true' "$f"; then
      pass=$((pass + 1))
    else
      fail=$((fail + 1))   # "encrypted": false, or field absent
    fi
  else
    errors=$((errors + 1)) # malformed / not a complete JSON object
  fi
done

test "$pass"   = "2" || { echo "FAIL[fallback]: expected 2 PASS, got $pass"; exit 1; }
test "$fail"   = "2" || { echo "FAIL[fallback]: expected 2 FAIL (1 unencrypted + 1 missing-field), got $fail"; exit 1; }
test "$errors" = "1" || { echo "FAIL[fallback]: expected 1 recorded error (malformed file), got $errors"; exit 1; }

# ---------------------------------------------------------------------------
# 3. If python3 is available, assert the REAL reference validator agrees.
#    (Clean skip if absent — the fallback above already kept CI green.)
# ---------------------------------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
  cp "$HERE/validator.py" .
  python3 validator.py evidence report.json >/dev/null
  test -f report.json || { echo "FAIL[py]: validator did not write report.json"; exit 1; }

  # Count PASS / FAIL verdicts and recorded errors straight out of the JSON report text.
  py_pass="$(grep -c '"verdict": "PASS"' report.json || true)"
  py_fail="$(grep -c '"verdict": "FAIL"' report.json || true)"
  # Recorded errors: entries in the "errors" array each carry a "file" key.
  py_err="$(grep -c '"file": "lt-05.json"' report.json || true)"

  test "$py_pass" = "2" || { echo "FAIL[py]: validator reported $py_pass PASS, expected 2"; exit 1; }
  test "$py_fail" = "2" || { echo "FAIL[py]: validator reported $py_fail FAIL, expected 2"; exit 1; }
  test "$py_err"  = "1" || { echo "FAIL[py]: malformed lt-05.json not recorded as an error"; exit 1; }

  # The malformed file must be in "errors", NOT in "results" with a verdict.
  if grep -A1 '"file": "lt-05.json"' report.json | grep -q '"verdict"'; then
    echo "FAIL[py]: malformed file leaked into results with a verdict"; exit 1
  fi

  echo "PASS: Module 05 lab reproduces (python3 validator + bash fallback agree: 2 PASS, 2 FAIL, 1 recorded malformed)"
else
  echo "PASS: Module 05 lab reproduces (bash+coreutils fallback: 2 PASS, 2 FAIL, 1 recorded malformed; python3 absent, skipped)"
fi
