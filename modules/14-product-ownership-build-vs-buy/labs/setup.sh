#!/usr/bin/env bash
# Module 14 lab fixture generator (original lab asset).
# Usage: setup.sh [DEST_DIR]   (default ./fixtures)
# Produces a FAIR-style risk input for ONE control gap: a loss-event-frequency
# range (events/year), a loss-magnitude range (dollars/event), and an iteration
# count. The committed fixture makes the loss-exposure quantification reproducible.
# Scenario: "12 standing prod-db access grants that never expire" (mirrors module §5.2).
set -euo pipefail
DEST="${1:-./fixtures}"
mkdir -p "$DEST"
cat > "$DEST/risk-input.json" <<'JSON'
{
  "control": "prod-db-access-least-privilege",
  "gap": "12 standing prod-db access grants that never expire",
  "loss_event": "a standing grant is abused or compromised, causing a data incident",
  "frequency": { "min": 0.1, "max": 0.6, "unit": "events/year" },
  "magnitude": { "min": 300000, "max": 2500000, "unit": "USD/event" },
  "iterations": 10000,
  "tail_percentile": 95,
  "seed": 42
}
JSON
echo "Module 14 fixture written to $DEST/risk-input.json"
