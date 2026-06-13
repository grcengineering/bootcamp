#!/usr/bin/env bun
// Module 14 reference calculator (original lab asset).
// Reads a FAIR-style risk-input.json (frequency range, magnitude range, iterations)
// and computes a loss-exposure DISTRIBUTION via a tiny Monte-Carlo-lite sample:
//   - draw N (frequency, magnitude) pairs uniformly from their ranges
//   - annual loss per draw = frequency * magnitude
//   - report the MEAN (planning figure) and a TAIL percentile (the "bad year")
//
// This is the learner-facing reference. The CI happy-path re-implements the same
// math deterministically in awk so it runs on a clean machine with no bun.
//
// Usage:  bun expected_loss.ts <path/to/risk-input.json>
// Output: JSON { mean, tailPercentile, tailValue, iterations } to stdout.

interface Range { min: number; max: number; unit?: string }
interface RiskInput {
  frequency: Range;
  magnitude: Range;
  iterations?: number;
  tail_percentile?: number;
  seed?: number;
}

// Deterministic LCG so results are reproducible across runs given the same seed.
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    // Numerical Recipes LCG constants.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function uniform(rng: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lowIdx = Math.floor(rank);
  const highIdx = Math.ceil(rank);
  if (lowIdx === highIdx) return sortedAsc[lowIdx];
  const frac = rank - lowIdx;
  return sortedAsc[lowIdx] + frac * (sortedAsc[highIdx] - sortedAsc[lowIdx]);
}

function computeExposure(input: RiskInput) {
  const n = input.iterations ?? 10000;
  const tailP = input.tail_percentile ?? 95;
  const rng = makeRng(input.seed ?? 42);
  const losses: number[] = new Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const freq = uniform(rng, input.frequency.min, input.frequency.max);
    const mag = uniform(rng, input.magnitude.min, input.magnitude.max);
    const loss = freq * mag;
    losses[i] = loss;
    sum += loss;
  }
  losses.sort((a, b) => a - b);
  return {
    mean: Math.round(sum / n),
    tailPercentile: tailP,
    tailValue: Math.round(percentile(losses, tailP)),
    iterations: n,
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: bun expected_loss.ts <path/to/risk-input.json>");
    process.exit(2);
  }
  const raw = require("fs").readFileSync(path, "utf8");
  const input = JSON.parse(raw) as RiskInput;
  const result = computeExposure(input);
  console.log(JSON.stringify(result, null, 2));
}

main();
