#!/usr/bin/env bash
# gate.sh — the CORE LOGIC of the §6 lab, isolated for testing.
#
# Reads a Checkov-shaped JSON scan result and a control map, applies a severity
# floor, maps every failed check to the control it enforces, decides PASS/FAIL,
# and emits a machine- and auditor-readable evidence record on stdout.
#
# This is the EVALUATE step of the loop expressed as code. It is deliberately
# free of network, cloud, and scanner dependencies: it consumes a scan result
# that some scanner already produced. In the real pipeline the scanner runs
# first; here we prove the gate decision against committed fixtures.
#
# Usage:   gate.sh <checkov-result.json> <control-map.csv> [severity-floor]
# Default severity-floor: HIGH
# Exit:    0 = control set PASSES (build proceeds)
#          1 = control set FAILS  (build blocked)
#          2 = usage / input error
#
# Dependencies: bash + coreutils + awk only. No jq, no network.
set -euo pipefail

RESULT="${1:-}"
CONTROL_MAP="${2:-}"
FLOOR="${3:-HIGH}"

if [ -z "$RESULT" ] || [ -z "$CONTROL_MAP" ]; then
  echo "usage: gate.sh <checkov-result.json> <control-map.csv> [severity-floor]" >&2
  exit 2
fi
[ -f "$RESULT" ]      || { echo "ERROR: scan result not found: $RESULT" >&2; exit 2; }
[ -f "$CONTROL_MAP" ] || { echo "ERROR: control map not found: $CONTROL_MAP" >&2; exit 2; }

# Rank severities so the floor is a numeric comparison, not a string match.
sev_rank() {
  case "$1" in
    CRITICAL) echo 4 ;;
    HIGH)     echo 3 ;;
    MEDIUM)   echo 2 ;;
    LOW)      echo 1 ;;
    *)        echo 0 ;;
  esac
}
FLOOR_RANK="$(sev_rank "$FLOOR")"
[ "$FLOOR_RANK" -gt 0 ] || { echo "ERROR: unknown severity floor: $FLOOR" >&2; exit 2; }

# Extract failed checks from the JSON. We do NOT require jq: the relevant fields
# (check_id, check_name, severity) appear as quoted "key": "value" pairs, and
# every failed check is an object inside the "failed_checks" array. A single awk
# pass tracks bracket/brace depth so it isolates exactly the failed_checks array
# (correctly stepping over nested arrays like "file_line_range": [1, 4]), then
# emits one tab-separated record per object: check_id, severity, check_name.
#
# This is a pragmatic parser for THIS well-formed, machine-generated shape, not
# a general JSON parser. The real lab pipes real scanner output through jq; the
# fixture parser keeps the happy path dependency-free.
extract_failed() {
  awk '
    BEGIN { instr = 0; arm = 0; depth = 0; arraydepth = 0; objbuf = "" }
    {
      line = $0
      # If this line names the failed_checks key, arm so the next "[" opens
      # our array. The "[" can be on the same line, so arm before scanning.
      if (line ~ /"failed_checks"[ \t]*:/) arm = 1
      n = length(line)
      for (i = 1; i <= n; i++) {
        c = substr(line, i, 1)
        prev = (i > 1) ? substr(line, i-1, 1) : ""
        # String-literal tracking so structural chars inside strings dont count.
        if (c == "\"" && prev != "\\") { instr = !instr }

        # Buffer EVERY char while we are inside a top-level object of the array,
        # including string content (we need the field values).
        if (collecting) objbuf = objbuf c

        if (instr) continue   # only structure decisions below ignore strings

        if (c == "[") {
          depth++
          if (arm == 1) { arraydepth = depth; arm = 0 }
        } else if (c == "]") {
          if (arraydepth && depth == arraydepth) arraydepth = 0
          depth--
        } else if (c == "{") {
          if (arraydepth && depth == arraydepth && !collecting) {
            collecting = 1; objbuf = "{"; objlevel = 0
          }
          if (collecting) objlevel++
        } else if (c == "}") {
          if (collecting) {
            objlevel--
            if (objlevel == 0) {
              cid = field(objbuf, "check_id")
              sev = field(objbuf, "severity")
              nm  = field(objbuf, "check_name")
              if (cid != "") {
                if (sev == "") sev = "UNKNOWN"
                if (nm  == "") nm  = "unknown"
                printf "%s\t%s\t%s\n", cid, sev, nm
              }
              collecting = 0; objbuf = ""
            }
          }
        }
      }
      if (collecting) objbuf = objbuf "\n"
    }
    function field(s, key,   re, m) {
      re = "\"" key "\"[ \t]*:[ \t]*\"[^\"]*\""
      if (match(s, re)) {
        m = substr(s, RSTART, RLENGTH)
        sub(/^.*:[ \t]*"/, "", m)
        sub(/"$/, "", m)
        return m
      }
      return ""
    }
  ' "$RESULT"
}

# Look a check_id up in the control map; print "control_id|control_title" or "UNMAPPED".
map_control() {
  awk -F, -v want="$1" '
    NR == 1 { next }                      # skip header
    $1 == want { print $2 "|" $3; found=1; exit }
    END { if (!found) print "UNMAPPED|unmapped check (no control owner)" }
  ' "$CONTROL_MAP"
}

echo "=== GRC IaC Gate — evidence record ==="
echo "scan_result: $RESULT"
echo "control_map: $CONTROL_MAP"
echo "severity_floor: $FLOOR"
echo "evaluated_at: ${GATE_FAKE_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)}"
echo "---"

BLOCKING=0
EVALUATED=0
while IFS=$'\t' read -r cid sev name; do
  [ -n "${cid:-}" ] || continue
  EVALUATED=$((EVALUATED + 1))
  rank="$(sev_rank "$sev")"
  mapping="$(map_control "$cid")"
  control_id="${mapping%%|*}"
  control_title="${mapping#*|}"
  if [ "$rank" -ge "$FLOOR_RANK" ]; then
    verdict="BLOCK"
    BLOCKING=$((BLOCKING + 1))
  else
    verdict="below-floor (not blocking)"
  fi
  echo "FAILED  $cid  [$sev]  -> $control_id ($control_title)  : $verdict"
  echo "        $name"
done < <(extract_failed)

echo "---"
echo "failed_checks_evaluated: $EVALUATED"
echo "blocking_at_or_above_${FLOOR}: $BLOCKING"

if [ "$BLOCKING" -gt 0 ]; then
  echo "GATE_DECISION: FAIL  (build blocked — $BLOCKING control(s) violated at/above $FLOOR)"
  exit 1
fi

echo "GATE_DECISION: PASS  (no violations at/above $FLOOR — build proceeds, evidence emitted)"
exit 0
