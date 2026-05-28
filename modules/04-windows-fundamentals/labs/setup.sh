#!/usr/bin/env bash
# Module 04 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./lab04)
#
# Writes a SAMPLE Windows endpoint compliance bundle in the JSON shape that the §6
# PowerShell collector (Collect-EndpointCompliance.ps1) produces via ConvertTo-Json.
# This lets the control-mapping LOGIC be exercised on a clean Linux CI machine that has
# NO PowerShell and NO Windows -- the happy-path parses this committed sample and asserts
# the SOC 2 CC6 evaluation. The fixture below is a NON-COMPLIANT endpoint on purpose:
# encryption in progress, Defender off, too many failed logons, an unexpected local admin.
set -euo pipefail
DEST="${1:-./lab04}"
mkdir -p "$DEST"
cat > "$DEST/endpoint-bundle.json" <<'JSON'
{
  "Hostname": "WIN-LAB04-NONCOMPLIANT",
  "CollectedUtc": "2026-05-28T00:00:00Z",
  "Control_CC6_1_Encryption": "EncryptionInProgress",
  "Control_CC6_8_DefenderEnabled": false,
  "Control_CC6_8_DefenderSignatureAgeDays": 19,
  "Control_CC6_1_ScreenLockTimeoutSeconds": 0,
  "Control_CC6_1_FailedLogonCount": 14,
  "Control_CC6_3_LocalAdmins": ["WIN-LAB04\\Administrator", "WIN-LAB04\\rogue.contractor"]
}
JSON
echo "lab04 sample bundle written to $DEST/endpoint-bundle.json"
