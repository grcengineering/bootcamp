#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 01.
# Asserts the §6 guided lab still reproduces on a clean machine (bash + coreutils only),
# using ONLY the taught composition (cat/grep/wc pipes + the lab's parse-access-export tool):
#   - pipes-only count of admin-granting rows (= 3)
#   - the malformed row is captured on stderr by parse-access-export, kept OUT of the evidence
#   - the wrapped check script is reproducible (two runs, identical evidence)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

bash "$HERE/setup.sh" "$WORK/lab01" >/dev/null
test -f lab01/access-export.csv || { echo "FAIL: setup did not create the export"; exit 1; }
test -x lab01/parse-access-export || { echo "FAIL: setup did not install the lab tool"; exit 1; }
export PATH="$WORK/lab01:$PATH"

# Task 3/4: pipes-only count -> evidence file (the taught composition, no all-in-one tool).
COUNT_PIPED="$(cat lab01/access-export.csv | grep admin | wc -l | tr -d ' ')"
test "$COUNT_PIPED" = "3" || { echo "FAIL: pipes-only count expected 3, got '$COUNT_PIPED'"; exit 1; }

# Task 5: tool as first stage; complaint -> its own log; evidence stays clean.
parse-access-export lab01/access-export.csv 2> lab01/collection-errors.log \
  | grep admin | wc -l | tr -d ' ' > lab01/evidence-admin-count.txt

COUNT="$(cat lab01/evidence-admin-count.txt)"
test "$COUNT" = "3" || { echo "FAIL: expected admin-count 3, got '$COUNT'"; exit 1; }
grep -q "WARN: malformed row" lab01/collection-errors.log || { echo "FAIL: malformed row not captured on stderr"; exit 1; }
if grep -q "WARN" lab01/evidence-admin-count.txt; then echo "FAIL: evidence file contaminated by stderr"; exit 1; fi

# Task 7: wrap into a re-runnable script (the same composition); run twice; identical evidence.
cat > check-admin-access.sh <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
parse-access-export "${1:?usage: check-admin-access.sh <access-export.csv>}" 2> collection-errors.log \
  | grep admin | wc -l | tr -d ' '
SCRIPT
chmod +x check-admin-access.sh
A="$(./check-admin-access.sh lab01/access-export.csv)"
B="$(./check-admin-access.sh lab01/access-export.csv)"
{ [ "$A" = "$B" ] && [ "$A" = "3" ]; } || { echo "FAIL: re-run not reproducible (A=$A B=$B)"; exit 1; }

# Canon drift check (root ISA ISC-75): the tool installed by setup.sh must be byte-identical
# to the simulation seed's copy — one truth, two homes.
SEED_TOOL="$HERE/../../../.ci/fixtures/seeds/m01/bin/parse-access-export"
if [ -f "$SEED_TOOL" ]; then
  if ! diff -q "$SEED_TOOL" lab01/parse-access-export >/dev/null 2>&1; then
    echo "FAIL: parse-access-export drifted between labs/setup.sh and the simulation seed"; exit 1
  fi
fi

echo "PASS: Module 01 lab reproduces (admin-count=$COUNT, stream-separated, reproducible across two runs)"
