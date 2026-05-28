#!/usr/bin/env bash
# Module 15 capstone-scaffold generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./capstone-lab)
#
# Builds a starter capstone repo around the committed sample manifest:
#   - capstone-manifest.yaml        (copied from the committed fixture)
#   - validate-capstone.sh          (the coverage self-check the §6 lab + CI run)
#   - placeholder artifacts for each of the 7 loop stages, so a COMPLETE manifest
#     resolves to real files on disk
#   - before-after.md skeleton
#
# In a real capstone the learner REPLACES the placeholders with their actual
# control's artifacts; the manifest + validator are the coverage spine that stays.
# Pure bash + coreutils. No network, no cloud, no yq. Echoes the lab dir path.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-./capstone-lab}"
mkdir -p "$DEST/policy" "$DEST/evidence" "$DEST/.github/workflows"

# 1. The manifest — committed fixture, copied verbatim.
cp "$HERE/fixtures/capstone-manifest.yaml" "$DEST/capstone-manifest.yaml"

# 2. Placeholder artifacts that the COMPLETE manifest points at (so coverage resolves).
cat > "$DEST/control-statement.md" <<'EOF'
# Control Statement (UNDERSTAND + LOCATE)
Claim: All S3 buckets block public access (SOC 2 CC6.1).
Threat (Module 11): public exposure of data at rest via a misconfigured bucket.
Ground truth (LOCATE): the four public-access-block fields on each bucket's
config — BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls, RestrictPublicBuckets.
EOF
cat > "$DEST/collect.sh"   <<'EOF'
#!/usr/bin/env bash
# QUERY: fetch each bucket's public-access-block config (placeholder).
echo '{"buckets":[]}'
EOF
chmod +x "$DEST/collect.sh"
cat > "$DEST/policy/public_access.rego" <<'EOF'
# EVALUATE: pass only if all four public-access-block fields are true (placeholder).
package capstone.public_access
default allow := false
EOF
cat > "$DEST/evidence/.keep" <<'EOF'
EVIDENCE: durable, versioned run records land here (run-<timestamp>.json).
EOF
cat > "$DEST/.github/workflows/ccm.yml" <<'EOF'
# MONITOR: scheduled re-run of collect -> evaluate -> evidence, alert on drift (placeholder).
name: ccm
on: { schedule: [{ cron: "0 */6 * * *" }] }
EOF
cat > "$DEST/README.md" <<'EOF'
# OWN — control as a product
Customers: auditor, gating engineer, posture-reporting exec.
Owner: a.engineer@example.com (single accountable name).
Backlog: (1) hook bucket-creation so new buckets are caught before next run [known gap];
         (2) extend to cross-account buckets; (3) reduce alert false positives.
Metric: % of evidence collected with zero manual touch (target 100%).
UX: evidence is a by-product of the scheduled check, not extra audit-season work.
EOF
cat > "$DEST/before-after.md" <<'EOF'
# Before / After — same control, legacy vs engineered
| Dimension | Before (legacy) | After (engineered) |
|---|---|---|
| Evidence effort | ~4 hrs human, annual | seconds, machine, every run |
| Check frequency | once/year at audit | every 6 hrs + on change |
| Drift detection | none until next audit | alert within one schedule cycle |
| Evidence durability | screenshot in a drive | versioned JSON, full history |
Legacy problems addressed: #1 toil (eliminated), #5 checkbox (now continuous).
Residual gap (honest): new buckets covered only at next run — see README backlog.
EOF

# 3. The coverage self-check. Parses the manifest with awk/grep (no yq), asserts
#    all 7 loop stages map to an existing path AND the before_after file exists.
cat > "$DEST/validate-capstone.sh" <<'VALIDATOR'
#!/usr/bin/env bash
# Capstone coverage validator. Asserts the manifest covers all 7 loop stages
# (each mapped to an existing artifact) and the before/after writeup is present.
# Pure bash + coreutils + awk. Exits 0 on full coverage, non-zero otherwise.
set -euo pipefail
MANIFEST="${1:?usage: validate-capstone.sh <capstone-manifest.yaml>}"
ROOT="$(cd "$(dirname "$MANIFEST")" && pwd)"
test -f "$MANIFEST" || { echo "FAIL: manifest not found: $MANIFEST"; exit 2; }

STAGES="UNDERSTAND LOCATE QUERY EVALUATE EVIDENCE MONITOR OWN"
fail=0

# Pull "key: value" pairs from the indented loop_coverage block only.
coverage_value() {
  awk -v key="$1" '
    /^loop_coverage:/ { inblk=1; next }
    inblk && /^[^[:space:]]/ { inblk=0 }
    inblk {
      line=$0
      sub(/^[[:space:]]+/, "", line)
      n=index(line, ":")
      if (n>0) {
        k=substr(line,1,n-1)
        v=substr(line,n+1)
        sub(/^[[:space:]]+/, "", v); sub(/[[:space:]]+$/, "", v)
        if (k==key) { print v; exit }
      }
    }
  ' "$MANIFEST"
}

echo "checking loop coverage..."
for stage in $STAGES; do
  artifact="$(coverage_value "$stage")"
  if [ -z "$artifact" ]; then
    printf "  %-11s MISSING (no artifact mapped)\n" "$stage"
    fail=1
    continue
  fi
  if [ -e "$ROOT/$artifact" ]; then
    printf "  %-11s ok  -> %s\n" "$stage" "$artifact"
  else
    printf "  %-11s MISSING (artifact not found: %s)\n" "$stage" "$artifact"
    fail=1
  fi
done

echo "checking before/after..."
ba="$(awk -F: '/^before_after:/ { v=$2; sub(/^[[:space:]]+/,"",v); sub(/[[:space:]]+$/,"",v); print v; exit }' "$MANIFEST")"
if [ -n "$ba" ] && [ -e "$ROOT/$ba" ]; then
  echo "  before/after ok -> $ba"
else
  echo "  before/after MISSING (no before_after pointer or file not found)"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "FAIL: capstone coverage incomplete — close the named gaps before shipping"
  exit 1
fi
echo "PASS: all 7 loop stages covered; before/after present"
VALIDATOR
chmod +x "$DEST/validate-capstone.sh"

# Resolve to an absolute path for the caller and echo it (matches sibling labs).
( cd "$DEST" && pwd )
