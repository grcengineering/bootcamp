#!/usr/bin/env bash
# Fixture + check-library generator for Module 13 (Continuous Controls Monitoring).
#
# Produces, into the target dir (default: ./ccm-lab):
#   - ccm-check.sh        the control-check function library (vendor-neutral, pure bash + awk)
#   - evidence/           the versioned evidence store (append-only ledger + per-run records)
#
# The committed JSON fixtures (labs/fixtures/state-compliant.json, state-drifted.json) are the
# "sample state" the check runs against — they stand in for an AWS Config snapshot so the CORE
# EVALUATION LOGIC can be proven offline, with no cloud, no network, no credentials, no Docker.
# In the real §6 lab these same functions are wired to a scheduler and a live cloud snapshot.
set -euo pipefail

TARGET="${1:-./ccm-lab}"
mkdir -p "$TARGET/evidence"

cat > "$TARGET/ccm-check.sh" <<'CHECK'
#!/usr/bin/env bash
# Module 13 control-check library. Offline by construction: no network, no cloud SDK, no jq.
# JSON parsing uses `bun` when it is on PATH (a real parser, robust to any formatting) and falls
# back to pure bash + coreutils + awk on a bare machine — same output contract either way.
#
# CONTROL: CC6.1-s3-public-access-block
#   Claim: "every S3 bucket has all four public-access-block settings enabled."
#
# The check reads a captured state snapshot (JSON) and returns a verdict a machine can act on:
#   stdout    = a single PASS/FAIL line, then one "NONCOMPLIANT <name>" line per drifted bucket
#   exit code = 0 when the control PASSES, 1 when it FAILS (drift), 2 when it could evaluate ZERO
#               resources and therefore FAILS CLOSED (refuses to report a green verdict it cannot
#               justify). That exit code is the hinge that turns a check into automation — no human
#               has to read the output, and a non-zero is never silently treated as healthy.
#
# Design note: this library never calls `set -e`. It is sourced by callers that may or may not
# run under errexit, so it preserves the caller's shell options and signals only through return
# codes. (An earlier version forced `set -e` and leaked it into the caller — fixed.)

# normalize_buckets <state-json-file>
# Flattens a captured-state snapshot to ONE LINE PER BUCKET — the form the evaluator judges.
# Each emitted line is: "<name>\t<block_public_acls>\t<block_public_policy>\t<ignore_public_acls>\t<restrict_public_buckets>"
# with each flag rendered as the literal "true" or "false".
#
# This MUST work on PRETTY-PRINTED JSON. Real `aws ... --output json`, `jq .`, and AWS Config
# exports are multi-line — the bucket name and its flags land on DIFFERENT physical lines. An
# earlier version matched a bucket only when "name" AND "restrict_public_buckets" appeared on the
# SAME line, so every pretty-printed snapshot parsed to zero buckets and silently PASSED a public
# bucket. Fixed: we normalise first (parse the whole document), then evaluate the normalised rows.
#
# Two parsers, same output contract, both OFFLINE (no network, no cloud SDK):
#   1) bun, if present — a real JSON parser, robust to any whitespace, key order, or nesting.
#   2) a pure-awk fallback for a bare machine — walks the "buckets" array brace-by-brace, so a
#      bucket object spread across many lines is collapsed into one normalised row.
normalize_buckets() {
  local state="$1"
  if command -v bun >/dev/null 2>&1; then
    bun -e '
      const fs = require("fs");
      const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const buckets = Array.isArray(doc.buckets) ? doc.buckets : [];
      const flag = (b, k) => (b[k] === true ? "true" : "false");
      for (const b of buckets) {
        const name = typeof b.name === "string" ? b.name : "";
        process.stdout.write([name,
          flag(b, "block_public_acls"), flag(b, "block_public_policy"),
          flag(b, "ignore_public_acls"), flag(b, "restrict_public_buckets")].join("\t") + "\n");
      }
    ' "$state"
    return 0
  fi
  # Pure-awk fallback for a bare machine (bash + coreutils + awk, no bun). Read the WHOLE document
  # as one record (RS=""), then walk only the "buckets" array brace-by-brace, collapsing each
  # {...} object — however it is wrapped across lines — into one normalised row. A bucket is
  # recognised by its "name" key, NEVER by the accident of which keys share a physical line.
  awk 'BEGIN { RS = "\0" }
    # val(buf,key): the literal value of "key" in object text buf — "true"/"false" for booleans,
    # the unquoted string for string values, or "" when the key is absent.
    function val(buf, key,   re, m) {
      re = "\"" key "\"[ \t\r\n]*:[ \t\r\n]*"
      if (match(buf, re "true"))  return "true"
      if (match(buf, re "false")) return "false"
      if (match(buf, "\"" key "\"[ \t\r\n]*:[ \t\r\n]*\"")) {
        m = substr(buf, RSTART + RLENGTH); sub(/".*$/, "", m); return m
      }
      return ""
    }
    function emit(buf,   nm) {
      nm = val(buf, "name")
      if (nm == "") return            # not a bucket object (no name) — skip
      printf "%s\t%s\t%s\t%s\t%s\n", nm,
        (val(buf,"block_public_acls")=="true"?"true":"false"),
        (val(buf,"block_public_policy")=="true"?"true":"false"),
        (val(buf,"ignore_public_acls")=="true"?"true":"false"),
        (val(buf,"restrict_public_buckets")=="true"?"true":"false")
    }
    {
      doc = $0
      # Locate the "buckets" array and scan only from there, so a stray bracket elsewhere in the
      # document cannot be mistaken for the bucket list.
      if (!match(doc, /"buckets"[ \t\r\n]*:[ \t\r\n]*\[/)) exit 0
      i = RSTART + RLENGTH        # first char inside the [ ... ] array
      depth = 0; obj = ""; inobj = 0
      n = length(doc)
      for (; i <= n; i++) {
        c = substr(doc, i, 1)
        if (depth == 0 && c == "]") break       # end of the buckets array
        if (c == "{") { depth++; if (depth == 1) { obj = ""; inobj = 1; continue } }
        if (c == "}") { depth--; if (depth == 0) { emit(obj); inobj = 0; continue } }
        if (inobj) obj = obj c
      }
    }
  ' "$state"
}

# evaluate_control <state-json-file>
# Emits a machine-readable verdict on stdout. Returns 0 (pass) / 1 (fail/drift) / 2 (no resources).
# Deterministic: the same snapshot always yields the same verdict.
#
# FAIL CLOSED: if the snapshot parses to ZERO buckets (empty list, wrong shape, unparseable),
# this does NOT emit a green verdict — it refuses to pass and returns non-zero. A monitor that
# silently passes when it evaluated nothing is worse than no monitor: it manufactures evidence
# of compliance from the absence of data.
evaluate_control() {
  local state="$1"
  # Normalise to one row per bucket FIRST, then judge the rows. A bucket is COMPLIANT only when
  # all four public-access-block flags are true; otherwise it is NONCOMPLIANT (drift).
  # rows: "<name>\t<acls>\t<policy>\t<ignore>\t<restrict>"
  local rows total noncompliant
  rows="$(normalize_buckets "$state")"
  total="$(printf '%s' "$rows" | grep -c . || true)"

  # Refuse to pass on an empty evaluation — fail closed.
  if [ "$total" -eq 0 ]; then
    echo "ERROR control=CC6.1-s3-public-access-block evaluated=0 — refusing to pass: zero resources evaluated (empty, unparsed, or wrong-shape snapshot)" >&2
    echo "FAIL control=CC6.1-s3-public-access-block evaluated=0 noncompliant=0 reason=no-resources-evaluated"
    return 2
  fi

  # A row is NONCOMPLIANT unless every one of its four flags is exactly "true".
  noncompliant="$(printf '%s\n' "$rows" | awk -F'\t' '
    NF>=5 && !($2=="true" && $3=="true" && $4=="true" && $5=="true") { print $1 }
  ')"

  if [ -z "$noncompliant" ]; then
    echo "PASS control=CC6.1-s3-public-access-block evaluated=${total} noncompliant=0"
    return 0
  fi
  echo "FAIL control=CC6.1-s3-public-access-block evaluated=${total} noncompliant=$(printf '%s\n' "$noncompliant" | grep -c .)"
  printf 'NONCOMPLIANT %s\n' $noncompliant
  return 1
}

# emit_evidence <state-json-file> <evidence-dir>
# Runs the check, writes a timestamped immutable evidence record, appends one row to the
# append-only ledger (the 30-day-history substrate a dashboard tile reads), and — only on drift —
# writes an alert file. Returns the check's exit code so the caller can branch on PASS/FAIL.
emit_evidence() {
  local state="$1" evdir="$2"
  mkdir -p "$evdir"
  local captured run_id verdict_line rc full record
  captured="$(awk -F'"' '/"captured_at"/{print $4; exit}' "$state")"
  # Fall back to a wall-clock stamp when the snapshot carries no captured_at (e.g. a malformed or
  # empty state) so the fail-closed record + alert still get a stable, unique filename.
  [ -n "$captured" ] || captured="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  run_id="run-$(printf '%s' "$captured" | tr -cd '0-9')"
  record="$evdir/${run_id}.evidence"

  # Capture the verdict WITHOUT toggling shell options. `if cmd; then …` neutralises errexit for
  # this one call, so a FAIL (return 1) does not abort an errexit-enabled caller mid-function.
  if full="$(evaluate_control "$state")"; then rc=0; else rc=$?; fi
  verdict_line="$(printf '%s\n' "$full" | head -1)"

  # Immutable per-run evidence record — generated by the same code that did the evaluating,
  # so it cannot drift from what was actually checked.
  {
    echo "control_id=CC6.1-s3-public-access-block"
    echo "captured_at=${captured}"
    echo "verdict=${verdict_line}"
    echo "exit_code=${rc}"
    echo "source_state=$(basename "$state")"
  } > "$record"

  # Append-only ledger: one row per run. This is the history a dashboard tile reads to draw
  # "current state + 30-day trend". Append-only because evidence you can rewrite is not evidence.
  echo "${captured} ${run_id} rc=${rc} ${verdict_line}" >> "$evdir/ledger.log"

  # Alert fires ONLY on drift (non-zero exit). A PASS leaves no alert behind — silence is the
  # signal that the control is holding. A fail-closed "no resources evaluated" (rc=2) is also a
  # drift the responder must see: the monitor could not confirm the control, so it must not be
  # mistaken for healthy silence.
  if [ "$rc" -ne 0 ]; then
    {
      echo "ALERT control=CC6.1-s3-public-access-block captured_at=${captured}"
      echo "${verdict_line}"
      if [ "$rc" -eq 2 ]; then
        echo "drifted_resource=<none — evaluated 0 resources; snapshot empty, unparsed, or wrong shape>"
      else
        printf '%s\n' "$full" | awk '/^NONCOMPLIANT /{print "drifted_resource=" $2}'
      fi
    } > "$evdir/alert-${run_id}.txt"
  fi
  return "$rc"
}
CHECK
chmod +x "$TARGET/ccm-check.sh"

# Print the lab dir so callers (the happy-path smoke test) can capture it.
echo "$TARGET"
