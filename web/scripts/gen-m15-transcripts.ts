#!/usr/bin/env bun
/**
 * One-shot generator for modules/15-capstone-ship-one-control/exercises/transcripts/*.jsonl.
 * Derives every edit-manifest payload from the engine's own seed (capstone-seed.ts), so the
 * transcripts can never drift from the seeded bytes. Run from web/: bun scripts/gen-m15-transcripts.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPSTONE_MANIFEST } from "../src/engines/builders/capstone-seed";

const OUT = join(import.meta.dir, "../../modules/15-capstone-ship-one-control/exercises/transcripts");
mkdirSync(OUT, { recursive: true });

const LAPTOP_CONTROL = 'control: "Company laptops enforce full-disk encryption (SOC 2 CC6.1)"';
const MONITOR_CCM = "  MONITOR:    .github/workflows/ccm.yml";
const MONITOR_GONE = "  MONITOR:    .github/workflows/monitor.yml";
const MONITOR_README = "  MONITOR:    README.md";
const BEFORE_AFTER = "before_after: before-after.md";

// t1 — control line re-founded to the program's week-0 laptop-encryption claim.
const m1 = CAPSTONE_MANIFEST.replace(/^control: .*$/m, LAPTOP_CONTROL);
if (!m1.includes(LAPTOP_CONTROL)) throw new Error("control line replacement failed");

// t3 — the committed incomplete fixture's shape: MONITOR row + before_after pointer deleted.
const m2 = m1
  .split("\n")
  .filter((l) => !/^\s*MONITOR:/.test(l) && !/^before_after:/.test(l))
  .join("\n");

// t4 — before_after restored, MONITOR mapped to a workflow that does not exist.
const m3 = m2.replace(/^(  OWN:.*)$/m, `${MONITOR_GONE}\n$1`).replace(/\n*$/, `\n${BEFORE_AFTER}\n`);

// t5 — MONITOR re-pointed at the artifact setup.sh actually wrote (byte-equal to m1).
const m4 = m3.replace(MONITOR_GONE, MONITOR_CCM);

// anti-half-diagnosis — only the MONITOR row deleted (before_after left in place).
const mHalf = m1.split("\n").filter((l) => !/^\s*MONITOR:/.test(l)).join("\n");

// anti-gate-gaming — MONITOR mapped to README.md: an existing file, a dishonest mapping.
const mGamed = m4.replace(MONITOR_CCM, MONITOR_README);

const edit = (text: string) => JSON.stringify({ input: `edit-manifest\n${text}` });
const validate = JSON.stringify({ input: "validate" });

const golden = [
  edit(m1), // t1
  validate, // t2 — PASS over the re-founded manifest
  edit(m2), // t3 — induce the two named gaps
  validate, // t3 — FAIL: MONITOR MISSING (no artifact mapped) + before/after MISSING
  edit(m3), // t4 — claimed-but-absent MONITOR, before/after restored
  validate, // t4 — FAIL: MONITOR MISSING (artifact not found: …), before/after ok
  edit(m4), // t5 — close the gap with the artifact that exists
  validate, // t5 — PASS, exit 0
  validate, // t5 — second run: identical verdict (reproducible coverage proof)
];

const antiGaming = [
  JSON.stringify({
    anti_for: "t5",
    reason:
      "gaming the gate: MONITOR mapped to README.md — an existing file, so the presence-only validator PASSes (exit 0), but the mapping is coverage theater; the task contract pins the artifact that actually discharges MONITOR",
  }),
  edit(m1),
  validate,
  edit(m2),
  validate,
  edit(m3),
  validate,
  edit(mGamed),
  validate,
];

const antiHalf = [
  JSON.stringify({
    anti_for: "t3",
    reason:
      "near-miss: only the MONITOR row was deleted — before_after still points at before-after.md, so the validator names one gap instead of the incomplete fixture's two",
  }),
  edit(m1),
  validate,
  edit(mHalf),
  validate,
];

writeFileSync(join(OUT, "golden.jsonl"), golden.join("\n") + "\n");
writeFileSync(join(OUT, "anti-gate-gaming.jsonl"), antiGaming.join("\n") + "\n");
writeFileSync(join(OUT, "anti-half-diagnosis.jsonl"), antiHalf.join("\n") + "\n");
console.log("wrote golden.jsonl, anti-gate-gaming.jsonl, anti-half-diagnosis.jsonl");
