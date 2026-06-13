#!/usr/bin/env bash
awk '/"resourceId": "audit-logs"/ && /"status": "PASS"/ { print "encryption: PASS" } /"resourceId": "audit-logs"/ && /"status": "FAIL"/ { print "encryption: FAIL" }' fixtures/posture-findings.json
echo "access violations: $(grep AttachUserPolicy fixtures/audit-events.json | grep -E 'T(0[0-8]|1[89]|2[0-3]):' | wc -l)"
awk -F, '$1 == "encryption" { t++ } $1 == "encryption" && $2 == "FAIL" { f++ } END { print "encryption FAIL rows: " f " of " t }' fixtures/evidence.csv
awk -F, '$1 == "access" { t++ } $1 == "access" && $2 == "FAIL" { f++ } END { print "access FAIL rows: " f " of " t }' fixtures/evidence.csv
