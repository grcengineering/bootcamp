/**
 * Module 14 — ported from modules/14-product-ownership-build-vs-buy/labs/expected_loss.ts
 * (web ISA ISC-86/137). The original IS TypeScript, so the math is carried over verbatim:
 * Numerical Recipes LCG (deterministic given seed) → uniform (frequency, magnitude) draws →
 * annual loss per draw → mean + tail percentile, both rounded. Every run is bit-identical
 * to the real tool for the same input bytes.
 *
 * Byte-accepted against builder-captures.json m14 (real `bun expected_loss.ts` runs).
 */
import type { ReadonlyFs, ValidatorRun } from "./types";
import { ExitSignal, runPort } from "./types";

export interface Range {
  min: number;
  max: number;
  unit?: string;
}

export interface RiskInput {
  frequency: Range;
  magnitude: Range;
  iterations?: number;
  tail_percentile?: number;
  seed?: number;
}

export interface ExposureResult {
  mean: number;
  tailPercentile: number;
  tailValue: number;
  iterations: number;
}

/** Deterministic LCG so results are reproducible across runs given the same seed. */
export function makeRng(seed: number): () => number {
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

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lowIdx = Math.floor(rank);
  const highIdx = Math.ceil(rank);
  if (lowIdx === highIdx) return sortedAsc[lowIdx];
  const frac = rank - lowIdx;
  return sortedAsc[lowIdx] + frac * (sortedAsc[highIdx] - sortedAsc[lowIdx]);
}

/** The raw loss sample, ascending — shared by computeExposure and the histogram tile. */
export function sampleLosses(input: RiskInput): number[] {
  const n = input.iterations ?? 10000;
  const rng = makeRng(input.seed ?? 42);
  const losses: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const freq = uniform(rng, input.frequency.min, input.frequency.max);
    const mag = uniform(rng, input.magnitude.min, input.magnitude.max);
    losses[i] = freq * mag;
  }
  return losses;
}

export function computeExposure(input: RiskInput): ExposureResult {
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

/**
 * Loss-distribution histogram for the module-14 dashboard tile (live mean-vs-p95 view).
 * Derived from the SAME deterministic sample as computeExposure — one source of truth.
 */
export interface LossHistogram {
  binWidth: number;
  /** counts[i] covers [i*binWidth, (i+1)*binWidth). */
  counts: number[];
  mean: number;
  tailPercentile: number;
  tailValue: number;
  maxLoss: number;
}

export function lossHistogram(input: RiskInput, bins = 40): LossHistogram {
  const losses = sampleLosses(input);
  const exposure = computeExposure(input);
  const hi = input.frequency.max * input.magnitude.max;
  const binWidth = hi / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const L of losses) {
    let b = Math.floor(L / binWidth);
    if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  return {
    binWidth,
    counts,
    mean: exposure.mean,
    tailPercentile: exposure.tailPercentile,
    tailValue: exposure.tailValue,
    maxLoss: hi,
  };
}

/** Usage: expected_loss.ts <path/to/risk-input.json> — the original's main(). */
export function runExpectedLoss(argv: string[], fs: ReadonlyFs): ValidatorRun {
  return runPort((io) => {
    const path = argv[0];
    if (!path) {
      io.error("usage: bun expected_loss.ts <path/to/risk-input.json>");
      throw new ExitSignal(2);
    }
    const raw = fs.read(path);
    // The original readFileSync would throw an uncaught ENOENT; specs always seed the fixture.
    if (raw === null) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    const input = JSON.parse(raw) as RiskInput;
    const result = computeExposure(input);
    io.log(JSON.stringify(result, null, 2));
    throw new ExitSignal(0);
  });
}
