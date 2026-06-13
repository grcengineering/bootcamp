#!/usr/bin/env bash
# Module 07 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./fixtures)
# Produces three committed-style fixtures that stand in for real cloud control-plane pulls:
#   - posture-findings.json : one finding per resource (STATE; from the posture service)
#   - audit-events.json     : CloudTrail-shaped action records (EVENTS; from the audit log)
#   - evidence.csv          : one row per evaluated control instance (the evidence table for SQL)
# No cloud, no network. In the real lab these three pulls replace this script.
set -euo pipefail
DEST="${1:-./fixtures}"
mkdir -p "$DEST"

# STATE: posture-service findings for the encryption control. One PASS in scope, plus noise.
cat > "$DEST/posture-findings.json" <<'JSON'
[
  { "resourceId": "audit-logs",  "control": "encryption", "status": "PASS" },
  { "resourceId": "scratch-tmp", "control": "encryption", "status": "FAIL" },
  { "resourceId": "exports-q2",  "control": "encryption", "status": "PASS" }
]
JSON

# EVENTS: audit-log records. Two privilege grants; one is at 02:14 UTC (out of hours -> violation).
cat > "$DEST/audit-events.json" <<'JSON'
[
  { "eventTime": "2026-05-20T14:02:00Z", "eventName": "AttachUserPolicy", "actor": "alice",        "policy": "AdministratorAccess" },
  { "eventTime": "2026-05-20T02:14:00Z", "eventName": "AttachUserPolicy", "actor": "contractor-7", "policy": "AdministratorAccess" },
  { "eventTime": "2026-05-20T11:30:00Z", "eventName": "GetObject",        "actor": "alice",        "policy": "" }
]
JSON

# The evidence table: one row per evaluated control instance. SQL turns this into a risk metric.
cat > "$DEST/evidence.csv" <<'CSV'
control,status
encryption,PASS
encryption,FAIL
encryption,PASS
access,PASS
access,FAIL
CSV

echo "Module 07 fixtures written to $DEST/ (posture-findings.json, audit-events.json, evidence.csv)"
