#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 06.
# Asserts the §6 guided lab's CORE LOGIC still reproduces on a clean machine
# (bash + coreutils + bun; NO network, NO cloud creds, NO containers):
#   - the aggregator concatenates the `data` arrays ACROSS BOTH pages (8 users, not 5)
#   - the control metric "users without MFA" is computed correctly (= 4) over the
#     COMPLETE, paginated dataset
#   - the active-only sub-metric is correct (= 3; the suspended no-MFA user is excluded)
#   - the completeness guard fails LOUD when a page is dropped (single-page pull != total)
#   - the exit code is the machine-readable verdict (3 = control FAIL, 0 = PASS)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v bun >/dev/null 2>&1 || { echo "FAIL: bun is required for this lab harness"; exit 1; }

# Regenerate the fixtures from clean (proves setup.sh is self-contained).
bash "$HERE/setup.sh" "$WORK/fixtures" >/dev/null
test -f "$WORK/fixtures/users-page-1.json" || { echo "FAIL: setup did not create page 1"; exit 1; }
test -f "$WORK/fixtures/users-page-2.json" || { echo "FAIL: setup did not create page 2"; exit 1; }

# --- Assertion 1: COMPLETE pull over BOTH pages -> control FAIL (exit 3), metric = 4 ---
set +e
REPORT="$(bun "$HERE/aggregate-mfa.ts" "$WORK/fixtures/users-page-1.json" "$WORK/fixtures/users-page-2.json")"
RC=$?
set -e
test "$RC" -eq 3 || { echo "FAIL: expected control-FAIL exit 3, got $RC"; exit 1; }

# Pull scalar fields out of the JSON record with coreutils only (no jq dependency).
field() { printf '%s\n' "$REPORT" | grep "\"$1\"" | head -1 | grep -oE '[0-9]+' | head -1; }

TOTAL="$(field total_users)"
NOMFA="$(field users_without_mfa)"
ACTIVE_NOMFA="$(field active_users_without_mfa)"
PAGES="$(field pages_aggregated)"

test "$TOTAL" = "8" || { echo "FAIL: expected 8 aggregated users (both pages), got '$TOTAL'"; exit 1; }
test "$NOMFA" = "4" || { echo "FAIL: expected 4 users without MFA, got '$NOMFA'"; exit 1; }
test "$ACTIVE_NOMFA" = "3" || { echo "FAIL: expected 3 ACTIVE users without MFA, got '$ACTIVE_NOMFA'"; exit 1; }
test "$PAGES" = "2" || { echo "FAIL: expected 2 pages aggregated, got '$PAGES'"; exit 1; }
printf '%s\n' "$REPORT" | grep -q '"control_result": "FAIL"' || { echo "FAIL: control_result should be FAIL"; exit 1; }

# --- Assertion 2: the COMPLETENESS guard catches a truncated pull (page 2 dropped) ---
# If pagination stops early, the answer would be a LIE; the harness must refuse it.
set +e
bun "$HERE/aggregate-mfa.ts" "$WORK/fixtures/users-page-1.json" >/dev/null 2>"$WORK/err.log"
TRUNC_RC=$?
set -e
test "$TRUNC_RC" -eq 1 || { echo "FAIL: truncated pull should error (exit 1), got $TRUNC_RC"; exit 1; }
grep -q "incomplete pull" "$WORK/err.log" || { echo "FAIL: completeness guard did not fire on truncated pull"; exit 1; }

# --- Assertion 3: a PASS scenario returns exit 0 (every user has MFA) ---
mkdir -p "$WORK/all-pass"
cat > "$WORK/all-pass/page-1.json" <<'JSON'
{ "data": [ { "id": "u_x", "email": "x@acme.example", "mfa_enabled": true, "status": "active" } ],
  "pagination": { "page": 1, "per_page": 5, "total": 1, "next_cursor": null } }
JSON
set +e
bun "$HERE/aggregate-mfa.ts" "$WORK/all-pass/page-1.json" >/dev/null 2>&1
PASS_RC=$?
set -e
test "$PASS_RC" -eq 0 || { echo "FAIL: all-MFA dataset should PASS (exit 0), got $PASS_RC"; exit 1; }

echo "PASS: Module 06 lab reproduces (aggregated=$TOTAL across $PAGES pages, no-MFA=$NOMFA, active-no-MFA=$ACTIVE_NOMFA; completeness guard fires; PASS path exits 0)"
