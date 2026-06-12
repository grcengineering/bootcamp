#!/usr/bin/env bash
# Thin wrapper (root ISA ISC-55) — macOS ground-truth capture under the zsh -f contract.
exec bun "$(dirname "$0")/capture.ts" macos "$@"
