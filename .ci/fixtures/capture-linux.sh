#!/usr/bin/env bash
# Thin wrapper (root ISA ISC-54) — Linux ground-truth capture via the executable env contract.
exec bun "$(dirname "$0")/capture.ts" linux "$@"
