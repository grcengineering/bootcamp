#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 02.
# Proves the GRC-relevant CONTROL-EVALUATION LOGIC of the §6 lab on a clean
# machine (bash + coreutils only): no sshd, no systemd, no network, no root.
#
# The real lab collects evidence from a live host. Here we assert the LOGIC that
# turns that evidence into a pass/fail verdict, against bundled fixtures:
#   Control A (SSH key-only):  sshd_config -> PasswordAuthentication effective
#                              value must be "no"  => PASS
#   Control B (least-priv):    `id` output -> target user must be in the sudo
#                              group, and a non-privileged user must NOT be => PASS
# Exits 0 on success; non-zero with a clear FAIL message otherwise.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

bash "$HERE/setup.sh" "$WORK/fx" >/dev/null
test -f "$WORK/fx/sshd_config"  || { echo "FAIL: setup did not create sshd_config"; exit 1; }
test -f "$WORK/fx/id-grcops.txt" || { echo "FAIL: setup did not create id-grcops.txt"; exit 1; }

# --- Control A: resolve the EFFECTIVE PasswordAuthentication directive. -------
# Parse like sshd: ignore comments/blank lines, case-insensitive keyword, and
# let the LAST matching directive win (that is sshd's real precedence rule).
# Returns the value ("no"/"yes") or "UNSET".
effective_directive() {
  awk -v key="$1" '
    { line=$0; sub(/#.*/, "", line) }            # strip comments
    { gsub(/^[ \t]+|[ \t]+$/, "", line) }         # trim whitespace
    line == "" { next }
    {
      k=line; sub(/[ \t].*/, "", k)               # first token = keyword
      v=line; sub(/^[^ \t]+[ \t]+/, "", v)        # remainder = value
      if (tolower(k) == tolower(key)) { val=tolower(v) }
    }
    END { print (val == "" ? "UNSET" : val) }
  ' "$2"
}

PWAUTH="$(effective_directive PasswordAuthentication "$WORK/fx/sshd_config")"
ROOTLOGIN="$(effective_directive PermitRootLogin "$WORK/fx/sshd_config")"

# Assert the parser ignores the commented decoy (#PasswordAuthentication yes)
# and resolves to the real, last-wins directive.
test "$PWAUTH" = "no" \
  || { echo "FAIL: Control A — PasswordAuthentication resolved '$PWAUTH', expected 'no' (decoy comment likely matched)"; exit 1; }
test "$ROOTLOGIN" = "no" \
  || { echo "FAIL: Control A — PermitRootLogin resolved '$ROOTLOGIN', expected 'no'"; exit 1; }

# --- Control B: least-privilege via sudo-group membership. --------------------
# Parse `id` output; extract the groups=(...) list; assert membership.
in_sudo_group() {
  # prints "yes" if the id-output file lists the sudo (or wheel) group, else "no"
  awk '
    {
      n=split($0, f, " ")
      for (i=1;i<=n;i++) if (f[i] ~ /^groups=/) { g=f[i]; sub(/^groups=/, "", g) }
    }
    END {
      m=split(g, parts, ",")
      for (i=1;i<=m;i++) if (parts[i] ~ /\(sudo\)$/ || parts[i] ~ /\(wheel\)$/) { print "yes"; exit }
      print "no"
    }
  ' "$1"
}

GRCOPS_PRIV="$(in_sudo_group "$WORK/fx/id-grcops.txt")"
INTERN_PRIV="$(in_sudo_group "$WORK/fx/id-intern.txt")"

test "$GRCOPS_PRIV" = "yes" \
  || { echo "FAIL: Control B — provisioned user 'grcops' not detected in sudo group"; exit 1; }
test "$INTERN_PRIV" = "no" \
  || { echo "FAIL: Control B — non-privileged user 'intern' wrongly flagged as privileged (false positive)"; exit 1; }

# --- Compose the verdict the way an evidence pipeline would. ------------------
# Both controls must pass for the host to be compliant.
if [ "$PWAUTH" = "no" ] && [ "$ROOTLOGIN" = "no" ] && [ "$GRCOPS_PRIV" = "yes" ] && [ "$INTERN_PRIV" = "no" ]; then
  VERDICT="COMPLIANT"
else
  VERDICT="NON-COMPLIANT"
fi
test "$VERDICT" = "COMPLIANT" \
  || { echo "FAIL: composed control verdict was '$VERDICT', expected COMPLIANT"; exit 1; }

echo "PASS: Module 02 control logic reproduces (PasswordAuthentication=$PWAUTH, PermitRootLogin=$ROOTLOGIN, grcops in sudo=$GRCOPS_PRIV, intern in sudo=$INTERN_PRIV, verdict=$VERDICT)"
