#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 03 (macOS Fundamentals).
# Runs on a CLEAN machine with ONLY bash + coreutils. It does NOT call any macOS-only
# binary (fdesetup/csrutil/spctl/profiles/system_profiler) and needs no network, cloud,
# Docker, or specific OS. It proves the GRC-relevant CORE LOGIC of the §6 lab:
#   - the three-valued evaluator maps known-good -> PASS, known-bad -> FAIL, else -> UNKNOWN
#   - FileVault On => encryption PASS; FileVault Off => FAIL
#   - SIP enabled => PASS; Gatekeeper assessments enabled => PASS; MDM enrolled => PASS
#   - the combined screen-lock control needs BOTH MDM enrolled AND a screen-lock profile
#   - a check that could not run (empty output) => UNKNOWN, never silently scored PASS/FAIL
#   - the assembled evidence packet is deterministic (identical across two runs)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

bash "$HERE/setup.sh" "$WORK/lab03" >/dev/null
S="$WORK/lab03/samples"
test -d "$S" || { echo "FAIL: setup did not create the samples/ fixtures"; exit 1; }

# --- The evaluator under test: the §4.8 two-questions-then-default shape. ---------------
# Args: <raw-output> <known-good-regex> <known-bad-regex>.
# Order matters: a check with no recognizable output must return UNKNOWN, not FAIL.
evaluate() {
  local raw="$1" good="$2" bad="$3"
  # Empty / whitespace-only output is a check that did not run -> UNKNOWN.
  if [ -z "${raw//[[:space:]]/}" ]; then echo "UNKNOWN"; return 0; fi
  if printf '%s' "$raw" | grep -Eqi -- "$good"; then echo "PASS"; return 0; fi
  if printf '%s' "$raw" | grep -Eqi -- "$bad";  then echo "FAIL"; return 0; fi
  echo "UNKNOWN"
}

assert_eq() {
  # assert_eq <label> <expected> <actual>
  if [ "$2" != "$3" ]; then echo "FAIL: $1 — expected '$2', got '$3'"; exit 1; fi
}

# --- FileVault: encryption at rest -------------------------------------------------------
FV_ON="$(cat "$S/fdesetup-status.txt")"
assert_eq "FileVault On => encryption PASS" "PASS" \
  "$(evaluate "$FV_ON" 'FileVault is On' 'FileVault is Off')"

FV_OFF="$(cat "$S/fdesetup-status-off.txt")"
assert_eq "FileVault Off => encryption FAIL" "FAIL" \
  "$(evaluate "$FV_OFF" 'FileVault is On' 'FileVault is Off')"

# --- SIP: OS tamper protection -----------------------------------------------------------
SIP="$(cat "$S/csrutil-status.txt")"
assert_eq "SIP enabled => PASS" "PASS" \
  "$(evaluate "$SIP" 'status: enabled' 'status: disabled')"

# --- Gatekeeper: software-execution control ----------------------------------------------
GK="$(cat "$S/spctl-status.txt")"
assert_eq "Gatekeeper assessments enabled => PASS" "PASS" \
  "$(evaluate "$GK" 'assessments? enabled' 'assessments? disabled')"

# --- MDM: centrally managed --------------------------------------------------------------
MDM="$(cat "$S/profiles-status.txt")"
assert_eq "MDM enrolled => PASS" "PASS" \
  "$(evaluate "$MDM" 'MDM enrollment: Yes' 'MDM enrollment: No')"

# --- Combined control: screen-lock is enforced ONLY if managed AND policy present --------
PROFILES="$(cat "$S/system_profiler-profiles.txt")"
managed="$(evaluate "$MDM" 'MDM enrollment: Yes' 'MDM enrollment: No')"
policy="$(evaluate "$PROFILES" 'ScreenLock Policy.*|askForPassword=1' 'no profiles installed')"
if [ "$managed" = "PASS" ] && [ "$policy" = "PASS" ]; then screenlock="PASS"; else screenlock="FAIL"; fi
assert_eq "screen-lock enforced (managed AND policy) => PASS" "PASS" "$screenlock"

# Counter-case: an unmanaged device must FAIL the combined control even with policy present.
managed_no="$(evaluate "MDM enrollment: No" 'MDM enrollment: Yes' 'MDM enrollment: No')"
if [ "$managed_no" = "PASS" ] && [ "$policy" = "PASS" ]; then sl2="PASS"; else sl2="FAIL"; fi
assert_eq "unmanaged device => screen-lock FAIL" "FAIL" "$sl2"

# --- The trap: a check that could not run must be UNKNOWN, never PASS/FAIL ---------------
EMPTY="$(cat "$S/profiles-status-unknown.txt")"
assert_eq "empty output => UNKNOWN (not a silent pass/fail)" "UNKNOWN" \
  "$(evaluate "$EMPTY" 'MDM enrollment: Yes' 'MDM enrollment: No')"

# --- Assemble the labeled packet and prove it is deterministic across two runs -----------
build_packet() {
  {
    echo "CONTROL: Encryption at rest (CC6.1) | SUBSYSTEM: FileVault | VERDICT: $(evaluate "$FV_ON" 'FileVault is On' 'FileVault is Off')"
    echo "CONTROL: OS tamper protection (CC6.8) | SUBSYSTEM: SIP | VERDICT: $(evaluate "$SIP" 'status: enabled' 'status: disabled')"
    echo "CONTROL: Software execution control (CC6.8) | SUBSYSTEM: Gatekeeper | VERDICT: $(evaluate "$GK" 'assessments? enabled' 'assessments? disabled')"
    echo "CONTROL: Centrally managed (CC1.x) | SUBSYSTEM: MDM | VERDICT: $(evaluate "$MDM" 'MDM enrollment: Yes' 'MDM enrollment: No')"
    echo "CONTROL: Screen-lock policy enforced (CC6.1) | SUBSYSTEM: MDM/prof | VERDICT: $screenlock"
    echo "CONTROL: Profile query (sample gap) | SUBSYSTEM: MDM/prof | VERDICT: $(evaluate "$EMPTY" 'ScreenLock' 'no profiles')"
  }
}
build_packet > packet1.txt
build_packet > packet2.txt
if ! diff -q packet1.txt packet2.txt >/dev/null; then
  echo "FAIL: evidence packet is not deterministic across two runs"; exit 1
fi
grep -q "VERDICT: UNKNOWN" packet1.txt || { echo "FAIL: packet did not surface the UNKNOWN gap"; exit 1; }
PASS_COUNT="$(grep -c "VERDICT: PASS" packet1.txt)"
test "$PASS_COUNT" = "5" || { echo "FAIL: expected 5 PASS lines, got $PASS_COUNT"; exit 1; }

echo "PASS: Module 03 lab reproduces (5 controls PASS, 1 UNKNOWN surfaced, unmanaged=FAIL, packet deterministic)"
