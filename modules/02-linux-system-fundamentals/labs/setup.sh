#!/usr/bin/env bash
# Module 02 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./lab02-fixtures)
#
# Produces the bundled evidence fixtures the happy-path control evaluation reads.
# These stand in for the real artifacts a learner collects on a live host in §6
# (sshd_config, `id`, `systemctl status`, `ls -l`), so the control LOGIC can be
# tested on a clean machine with no SSH daemon, no systemd, and no network.
set -euo pipefail
DEST="${1:-./lab02-fixtures}"
mkdir -p "$DEST"

# --- Fixture 1: a hardened sshd_config (the control target). -----------------
# Deliberately includes comments, a commented-out decoy, and trailing whitespace
# so the evaluator must parse like sshd does (last effective directive wins,
# comments ignored) rather than naive grep.
cat > "$DEST/sshd_config" <<'CFG'
# Managed sshd_config — host web-01 (evidence snapshot)
Port 22
#PasswordAuthentication yes        ← decoy: commented, MUST be ignored
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
CFG

# --- Fixture 2: `id` output for the provisioned non-root sudo user. -----------
# Format mirrors real `id` output exactly. Group membership is the control fact.
cat > "$DEST/id-grcops.txt" <<'IDOUT'
uid=1001(grcops) gid=1001(grcops) groups=1001(grcops),27(sudo)
IDOUT

# --- Fixture 3: `id` output for a user who is NOT privileged (negative case). --
cat > "$DEST/id-intern.txt" <<'IDOUT'
uid=1002(intern) gid=1002(intern) groups=1002(intern)
IDOUT

echo "lab02 fixtures written to $DEST/ (sshd_config, id-grcops.txt, id-intern.txt)"
