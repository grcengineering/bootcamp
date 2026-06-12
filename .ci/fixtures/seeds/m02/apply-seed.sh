#!/bin/bash
# Booted-capture seed overlay (module 02). Runs as root inside the booted container with
# this directory mounted at /seed, BEFORE the learner session — so the capture box and the
# simulated box share one world: scenario sshd_config (3243 bytes, module §4.5 canon),
# the committed grcops keypair (411-byte id_ed25519, §5.2 canon), and canon May 27 mtimes.
set -euo pipefail

# --- /etc/ssh/sshd_config: scenario baseline (pre-hardening; stock decoy intact) ---------
cp /seed/system/etc/ssh/sshd_config /etc/ssh/sshd_config
chown root:root /etc/ssh/sshd_config
chmod 640 /etc/ssh/sshd_config

# --- grcops home: committed scenario keypair + the lab's PATH tool -----------------------
install -d -m 700 -o grcops -g grcops /home/grcops/.ssh
install -m 600 -o grcops -g grcops /seed/home/.ssh/id_ed25519     /home/grcops/.ssh/id_ed25519
install -m 644 -o grcops -g grcops /seed/home/.ssh/id_ed25519.pub /home/grcops/.ssh/id_ed25519.pub
# deliberately 644 (mild over-permission — §6 task 3 has the learner decode + tighten perms)
install -m 644 -o grcops -g grcops /seed/home/.ssh/authorized_keys /home/grcops/.ssh/authorized_keys
install -m 755 -o root -g root /seed/bin/lab-setup /usr/local/bin/lab-setup

# --- canon mtimes (module 02 scenario constants: May 27 2026) ----------------------------
touch -d '2026-05-27 09:00:00 UTC' /etc/passwd /etc/group /home/grcops/evidence-collector_1.0.0_all.deb
touch -d '2026-05-27 09:02:00 UTC' /etc/ssh/sshd_config
touch -d '2026-05-27 09:05:00 UTC' /home/grcops/.ssh /home/grcops/.ssh/id_ed25519 \
  /home/grcops/.ssh/id_ed25519.pub /home/grcops/.ssh/authorized_keys

# --- restart sshd so the seed config is the running config -------------------------------
systemctl restart ssh
