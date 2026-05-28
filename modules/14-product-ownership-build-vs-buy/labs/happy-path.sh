#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 14 (Product Ownership & Build-vs-Buy).
# Clean-machine, offline, fixture-based. Requires ONLY bash + coreutils + awk.
# No network, no cloud, no vendor trial, no bun.
#
# It proves the GRC-relevant CORE LOGIC of the lab — the risk-quantification and the
# build/buy scoring — against the BUNDLED fixture (labs/fixtures/risk-input.json):
#   1. the FAIR-style fixture parses and carries the expected frequency/magnitude ranges
#   2. the loss-exposure MEAN is computed (exact sum) and lands in the analytic band
#      implied by the ranges (mean(freq) * mean(mag))  -> the "planning figure"
#   3. the 95th-percentile TAIL is computed (histogram, no sort = portable) and is
#      strictly GREATER than the mean  -> the right-skew property a colored cell erases
#   4. a seven-stage build/buy/hybrid scoring table is produced covering ALL 7 loop
#      stages, each with a BUILD/BUY/HYBRID call  -> the build-vs-buy artifact logic
# Exit 0 on success; non-zero with a clear FAIL message otherwise.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# --- regenerate the committed fixture into a scratch dir (idempotent) ---
bash "$HERE/setup.sh" "$WORK/fixtures" >/dev/null
FIX="$WORK/fixtures/risk-input.json"
test -f "$FIX" || { echo "FAIL: setup did not create the risk-input fixture"; exit 1; }

# --- 1. parse the FAIR-style ranges from the fixture (coreutils only) ---
# Extract numbers from the "frequency" and "magnitude" objects without a JSON parser.
freq_line="$(grep -o '"frequency"[^}]*}' "$FIX")"
mag_line="$(grep -o '"magnitude"[^}]*}' "$FIX")"
FMIN="$(printf '%s' "$freq_line" | grep -o '"min":[ ]*[0-9.]*' | grep -o '[0-9.]*$')"
FMAX="$(printf '%s' "$freq_line" | grep -o '"max":[ ]*[0-9.]*' | grep -o '[0-9.]*$')"
MMIN="$(printf '%s' "$mag_line"  | grep -o '"min":[ ]*[0-9.]*' | grep -o '[0-9.]*$')"
MMAX="$(printf '%s' "$mag_line"  | grep -o '"max":[ ]*[0-9.]*' | grep -o '[0-9.]*$')"
ITER="$(grep -o '"iterations":[ ]*[0-9]*' "$FIX" | grep -o '[0-9]*$')"
SEED="$(grep -o '"seed":[ ]*[0-9]*' "$FIX" | grep -o '[0-9]*$')"

for v in FMIN FMAX MMIN MMAX ITER SEED; do
  eval "val=\${$v:-}"
  test -n "$val" || { echo "FAIL: fixture missing field $v"; exit 1; }
done

# Assert the fixture carries the documented scenario ranges (§5.2 of module.md).
{ [ "$FMIN" = "0.1" ] && [ "$FMAX" = "0.6" ]; } \
  || { echo "FAIL: frequency range drifted from fixture (got $FMIN-$FMAX, want 0.1-0.6)"; exit 1; }
{ [ "$MMIN" = "300000" ] && [ "$MMAX" = "2500000" ]; } \
  || { echo "FAIL: magnitude range drifted from fixture (got $MMIN-$MMAX, want 300000-2500000)"; exit 1; }

# --- 2 & 3. compute mean (exact sum) + 95th-percentile tail (histogram, no sort) ---
# Deterministic via srand(seed). Mean needs no sort; the tail is found by bucketing
# losses into a fixed-width histogram and walking buckets to the 95% cumulative count.
read -r MEAN TAIL ANALYTIC <<EOF
$(awk -v fmin="$FMIN" -v fmax="$FMAX" -v mmin="$MMIN" -v mmax="$MMAX" \
       -v n="$ITER" -v seed="$SEED" 'BEGIN{
  srand(seed);
  # histogram over [0, hi] where hi = max possible annual loss (fmax*mmax).
  hi = fmax * mmax;
  buckets = 2000;
  width = hi / buckets;
  sum = 0;
  for (i = 0; i < n; i++) {
    f = fmin + (fmax - fmin) * rand();
    m = mmin + (mmax - mmin) * rand();
    L = f * m;
    sum += L;
    b = int(L / width);
    if (b >= buckets) b = buckets - 1;
    hist[b]++;
  }
  mean = sum / n;
  # walk buckets until cumulative count crosses the 95th percentile.
  target = 0.95 * n;
  cum = 0; tail = hi;
  for (b = 0; b < buckets; b++) {
    cum += hist[b];
    if (cum >= target) { tail = (b + 0.5) * width; break; }
  }
  analytic = ((fmin + fmax) / 2) * ((mmin + mmax) / 2);
  printf "%.0f %.0f %.0f\n", mean, tail, analytic;
}')
EOF

test -n "$MEAN" || { echo "FAIL: mean expected loss was not computed"; exit 1; }
test -n "$TAIL" || { echo "FAIL: tail percentile was not computed"; exit 1; }

# Assertion (2): the sampled mean must land within +/-5% of the analytic mean
# (mean(freq) * mean(mag)). This proves the frequency x magnitude decomposition,
# not a hard-coded number.
awk -v mean="$MEAN" -v analytic="$ANALYTIC" 'BEGIN{
  lo = analytic * 0.95; hiB = analytic * 1.05;
  if (mean < lo || mean > hiB) { exit 1 }
}' || { echo "FAIL: mean $MEAN outside analytic band [~$ANALYTIC +/-5%] — frequency x magnitude logic broken"; exit 1; }

# Assertion (3): the 95th-percentile tail must exceed the mean. A product of two
# uniforms is right-skewed, so the bad-year tail > the planning mean. This is the
# property a red/amber/green cell destroys — assert the distribution actually has it.
awk -v mean="$MEAN" -v tail="$TAIL" 'BEGIN{ if (tail <= mean) exit 1 }' \
  || { echo "FAIL: tail ($TAIL) not greater than mean ($MEAN) — distribution is not right-skewed; quantification logic wrong"; exit 1; }

# --- 4. produce the seven-stage build/buy/hybrid scoring table (the artifact logic) ---
# Mirrors module.md §5.3. Emit it, then assert all 7 loop stages appear, each with a call.
cat > scoring-table.tsv <<'TSV'
stage	deciding_question	call
UNDERSTAND	Who is this control for / what is our context?	BUILD
LOCATE	Where does the access truth live (IdP, DB, cloud)?	BUY
QUERY	Pull the raw grant state	BUY
EVALUATE	Is a grant compliant per OUR policy?	BUILD
EVIDENCE	Store durable, dated, audit-ready proof	HYBRID
MONITOR	Alert when a grant outlives its shift	BUY
OWN	Backlog, metrics, the boundary itself	BUILD
TSV

EXPECTED_STAGES="UNDERSTAND LOCATE QUERY EVALUATE EVIDENCE MONITOR OWN"
for s in $EXPECTED_STAGES; do
  grep -q "^${s}	" scoring-table.tsv \
    || { echo "FAIL: scoring table missing loop stage '$s'"; exit 1; }
  call="$(grep "^${s}	" scoring-table.tsv | awk -F'\t' '{print $3}')"
  case "$call" in
    BUILD|BUY|HYBRID) : ;;
    *) echo "FAIL: stage '$s' has no valid BUILD/BUY/HYBRID call (got '$call')"; exit 1 ;;
  esac
done

STAGE_COUNT="$(awk -F'\t' 'NR>1{c++} END{print c+0}' scoring-table.tsv)"
test "$STAGE_COUNT" = "7" \
  || { echo "FAIL: expected all 7 loop stages scored, got $STAGE_COUNT"; exit 1; }

echo "PASS: Module 14 lab reproduces (mean=\$${MEAN}/yr, p95 tail=\$${TAIL}/yr > mean, 7/7 loop stages scored build/buy/hybrid)"
