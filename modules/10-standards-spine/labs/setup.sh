#!/usr/bin/env bash
# Module 10 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./work)
# Produces:
#   - spine-families.txt : the 20 valid NIST SP 800-53 control-family abbreviations (the spine's map targets)
#   - crosswalk.csv      : a seed crosswalk with example rows and ONE intentional planted orphan
set -euo pipefail
DEST="${1:-./work}"
mkdir -p "$DEST"

# The spine: 20 NIST SP 800-53 Rev 5 control-family abbreviations. These are the only valid
# map targets — a crosswalk row's spine_control must begin with one of these.
cat > "$DEST/spine-families.txt" <<'FAMILIES'
AC
AT
AU
CA
CM
CP
IA
IR
MA
MP
PE
PL
PM
PS
PT
RA
SA
SC
SI
SR
FAMILIES

# Seed crosswalk. Header + a few honest example rows + one INTENTIONAL orphan (empty spine_control).
# Learners add rows, resolve the orphan, and run the validator until it exits 0.
cat > "$DEST/crosswalk.csv" <<'CSV'
profile,profile_control,spine_control,relationship
SOC2,CC6.1,AC-2,broader
ISO27001,A.5.15,AC-2,exact
CSF2,PR.DS-01,SC-28,partial
PCI4,6.3.2,,orphan
CSV

echo "Module 10 fixtures written to $DEST/ (spine-families.txt, crosswalk.csv)"
