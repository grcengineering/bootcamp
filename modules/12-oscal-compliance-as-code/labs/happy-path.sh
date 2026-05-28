#!/usr/bin/env bash
# CI lab-reproduction smoke test for Module 12.
# Asserts the §6 guided lab's CORE LOGIC still reproduces on a clean machine
# (bash + coreutils to stage, bun to run the validator — NO trestle, NO schema
# download, NO FedRAMP account, NO cloud, NO network):
#
#   1. The well-formed OSCAL set VALIDATES (exit 0): the catalog has its required
#      fields, the profile's references resolve with zero dangling, and the
#      implemented control carries a resolvable policy link.
#   2. The required OSCAL fields are actually present in the committed catalog
#      fixture (uuid, metadata.title, a control with id "ac-2") — the minimal
#      schema contract this module teaches.
#   3. The C2P linkage is real: control "ac-2" in the component-definition links
#      to the Module-09 policy id "ac-2-account-management".
#   4. A broken catalog (control id removed) FAILS validation (exit 1) and the
#      failure names the missing field — i.e. the gate bites.
#   5. A dangling profile reference (an included id the catalog does not define)
#      FAILS validation (exit 1) — the OSCAL form of a Module-10 crosswalk orphan.
#
# This proves the EVALUATE/EVIDENCE step (the validity + control-to-policy link),
# not trestle or the full OSCAL schema. The real §6 lab runs compliance-trestle
# against the actual schema; here we feed the offline gate committed fixtures.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# bun is required to run the validator; fail clearly if it is absent.
command -v bun >/dev/null 2>&1 || { echo "FAIL: bun is required to run validate-oscal.ts"; exit 1; }

bash "$HERE/setup.sh" "$WORK/lab12" >/dev/null
V="$WORK/lab12/validate-oscal.ts"
CAT="$WORK/lab12/acme-catalog.json"
PROF="$WORK/lab12/acme-profile.json"
COMP="$WORK/lab12/acme-component.json"
BROKEN="$WORK/lab12/acme-catalog-broken.json"

for f in "$V" "$CAT" "$PROF" "$COMP" "$BROKEN"; do
  test -f "$f" || { echo "FAIL: setup did not create $(basename "$f")"; exit 1; }
done

# --- Assertion 1: the well-formed OSCAL set VALIDATES (exit 0). ---
set +e
PASS_OUT="$(bun "$V" "$CAT" "$PROF" "$COMP" 2>/dev/null)"
PASS_CODE=$?
set -e
test "$PASS_CODE" = "0" \
  || { echo "FAIL: well-formed OSCAL set should validate (expected exit 0, got $PASS_CODE)"; echo "$PASS_OUT"; exit 1; }
printf '%s\n' "$PASS_OUT" | grep -q "^PASS:" \
  || { echo "FAIL: valid set did not emit a PASS line"; exit 1; }

# --- Assertion 2: the minimal OSCAL schema contract is present in the catalog. ---
grep -q '"uuid"'           "$CAT" || { echo "FAIL: catalog fixture missing required uuid"; exit 1; }
grep -q '"oscal-version"'  "$CAT" || { echo "FAIL: catalog fixture missing required oscal-version"; exit 1; }
grep -q '"id": "ac-2"'     "$CAT" || { echo "FAIL: catalog fixture missing control id ac-2"; exit 1; }

# --- Assertion 3: the C2P linkage is real (ac-2 -> policy ac-2-account-management). ---
printf '%s\n' "$PASS_OUT" | grep -q 'ac-2 -> policy "ac-2-account-management"' \
  || { echo "FAIL: control ac-2 not linked to Module-09 policy ac-2-account-management"; echo "$PASS_OUT"; exit 1; }
printf '%s\n' "$PASS_OUT" | grep -q 'policy-linked: 1' \
  || { echo "FAIL: expected exactly one policy-linked implemented control"; exit 1; }

# --- Assertion 4: a broken catalog (control id removed) FAILS validation. ---
set +e
BROKEN_OUT="$(bun "$V" "$BROKEN" "$PROF" "$COMP" 2>/dev/null)"
BROKEN_CODE=$?
set -e
test "$BROKEN_CODE" = "1" \
  || { echo "FAIL: broken catalog should fail validation (expected exit 1, got $BROKEN_CODE)"; exit 1; }
printf '%s\n' "$BROKEN_OUT" | grep -qi 'control missing required "id"' \
  || { echo "FAIL: broken-catalog failure did not name the missing control id"; echo "$BROKEN_OUT"; exit 1; }

# --- Assertion 5: a dangling profile reference FAILS validation (orphan). ---
# Build a profile that includes a control id the catalog does not define.
DANGLING_PROF="$WORK/lab12/acme-profile-dangling.json"
sed 's/"ac-2"/"ac-9"/' "$PROF" > "$DANGLING_PROF"
set +e
DANGLE_OUT="$(bun "$V" "$CAT" "$DANGLING_PROF" "$COMP" 2>/dev/null)"
DANGLE_CODE=$?
set -e
test "$DANGLE_CODE" = "1" \
  || { echo "FAIL: dangling profile reference should fail validation (expected exit 1, got $DANGLE_CODE)"; exit 1; }
printf '%s\n' "$DANGLE_OUT" | grep -qi 'catalog does not define' \
  || { echo "FAIL: dangling-reference failure did not name the orphan control"; echo "$DANGLE_OUT"; exit 1; }

echo "PASS: Module 12 OSCAL validation reproduces (valid=PASS, required-fields present, ac-2->policy linked, broken-catalog=FAIL, dangling-ref=FAIL)"
