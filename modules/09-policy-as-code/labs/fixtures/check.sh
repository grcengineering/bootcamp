#!/usr/bin/env bash
# check.sh — the verdict-function of the §6 lab, isolated for testing.
#
# This is the policy from §4.1 made real: decision = policy(input). It is the
# engine-agnostic encoding of control AC-6-legacy-admin:
#
#   "access changes must never grant the legacy-admin role."
#
# It reads an access-export CSV (one access change per row: row,principal,
# action,resource_role) and applies the SAME verdict the Cedar `forbid` and the
# Rego `deny` rule encode — deny any row whose action is grantRole AND whose
# resource_role is legacy-admin. It prints one DENY line per violation and
# exits non-zero IF AND ONLY IF there is at least one violation. That exit code
# is what gives the CI gate teeth.
#
# It checks BOTH the action and the role on purpose: revoking legacy-admin is
# fine; only GRANTING it is forbidden. A check that fired on the role alone
# would be subtly, silently wrong — the §4.3 failure mode in miniature.
#
# This is the EVALUATE step expressed as code, free of any policy engine: the
# real lab can swap in Cedar's or OPA's CLI and read the same exit code. Here we
# prove the verdict against committed fixtures with bash + coreutils + awk only.
#
# Usage:   check.sh <access-export.csv>
# Exit:    0 = no violation (control PASSES)
#          1 = >=1 violation (control FAILS — gate should block)
#          2 = usage / input error
set -euo pipefail

INPUT="${1:-}"
if [ -z "$INPUT" ]; then
  echo "usage: check.sh <access-export.csv>" >&2
  exit 2
fi
[ -f "$INPUT" ] || { echo "ERROR: access export not found: $INPUT" >&2; exit 2; }

CONTROL_ID="AC-6-legacy-admin"
FORBIDDEN_ACTION="grantRole"
FORBIDDEN_ROLE="legacy-admin"

# One awk pass over the CSV. Skip the header (NR==1). A row violates the control
# only when BOTH the action column equals grantRole AND the role column equals
# legacy-admin. Print a DENY line per violation; report the count via exit status.
VIOLATIONS="$(
  awk -F, -v act="$FORBIDDEN_ACTION" -v role="$FORBIDDEN_ROLE" '
    NR == 1 { next }
    NF < 4  { next }
    {
      a = $3; r = $4
      gsub(/^[ \t\r]+|[ \t\r]+$/, "", a)
      gsub(/^[ \t\r]+|[ \t\r]+$/, "", r)
      if (a == act && r == role) {
        printf "DENY  row %s: %s -> %s  (forbidden by %s)\n", $1, $2, r, "AC-6"
        n++
      }
    }
    END { print "::count::" (n + 0) }
  ' "$INPUT"
)"

COUNT="$(printf '%s\n' "$VIOLATIONS" | sed -n 's/^::count:://p')"
printf '%s\n' "$VIOLATIONS" | grep '^DENY' || true

if [ "${COUNT:-0}" -gt 0 ]; then
  echo "RESULT  control=$CONTROL_ID  decision=deny  violations=$COUNT"
  exit 1
fi
echo "RESULT  control=$CONTROL_ID  decision=allow  violations=0"
exit 0
