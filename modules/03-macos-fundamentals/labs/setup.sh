#!/usr/bin/env bash
# Module 03 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./lab03)
# Produces a samples/ directory of representative *sample outputs* of the macOS status
# commands taught in this module. These let a learner (or CI on Linux) build and test the
# control-EVALUATION logic with NO macOS machine and NO macOS-only binaries. Each file is
# what the corresponding command prints; one file is deliberately empty to exercise UNKNOWN.
set -euo pipefail
DEST="${1:-./lab03}"
S="$DEST/samples"
mkdir -p "$S"

# FileVault ON  -> encryption-at-rest PASS
printf '%s\n' 'FileVault is On.' > "$S/fdesetup-status.txt"

# FileVault OFF -> encryption-at-rest FAIL (the explicit negative fixture)
printf '%s\n' 'FileVault is Off.' > "$S/fdesetup-status-off.txt"

# SIP enabled -> OS-tamper-protection PASS
printf '%s\n' 'System Integrity Protection status: enabled.' > "$S/csrutil-status.txt"

# Gatekeeper assessments enabled -> software-execution-control PASS
printf '%s\n' 'assessments enabled' > "$S/spctl-status.txt"

# MDM enrolled -> centrally-managed PASS
{
  printf '%s\n' 'Enrolled via DEP: Yes'
  printf '%s\n' 'MDM enrollment: Yes (User Approved)'
} > "$S/profiles-status.txt"

# Installed configuration profiles incl. a screen-lock policy payload -> policy-present
{
  printf '%s\n' 'Configuration Profiles:'
  printf '%s\n' '    ScreenLock Policy:'
  printf '%s\n' '        Payloads: com.apple.screensaver (askForPassword=1, idleTime=600)'
} > "$S/system_profiler-profiles.txt"

# A check that COULD NOT RUN: empty output. Must evaluate to UNKNOWN, never PASS/FAIL.
: > "$S/profiles-status-unknown.txt"

echo "lab03 fixtures written to $S/"
