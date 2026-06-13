/**
 * Module 15 — `validate-capstone.sh` ported from
 * modules/15-capstone-ship-one-control/labs/setup.sh (heredoc) — web ISA ISC-87/137.
 *
 * Asserts the capstone manifest covers all 7 loop stages (each mapped to an EXISTING
 * artifact) and the before/after writeup is present. Output formatting is the original's
 * printf: `  %-11s ok  -> %s` / `  %-11s MISSING (…)`. Exit 0 covered / 1 incomplete /
 * 2 manifest not found.
 *
 * Byte-accepted against builder-captures.json m15 (real bash runs of the generated script).
 */
import type { ReadonlyFs, ValidatorRun } from "./types";
import { ExitSignal, posixDirname, posixJoin, runPort } from "./types";
import { LOOP_STAGES } from "./types";

/**
 * coverage_value <key>: awk transcription — values inside the indented `loop_coverage:` block
 * only; the block ends at the first non-indented line; first matching key wins.
 */
export function coverageValue(manifest: string, key: string): string {
  let inblk = false;
  for (const raw of manifest.split("\n")) {
    if (/^loop_coverage:/.test(raw)) {
      inblk = true;
      continue;
    }
    if (inblk && /^[^\s]/.test(raw)) inblk = false;
    if (inblk) {
      const line = raw.replace(/^\s+/, "");
      const n = line.indexOf(":");
      if (n > 0) {
        const k = line.slice(0, n);
        const v = line.slice(n + 1).replace(/^\s+/, "").replace(/\s+$/, "");
        if (k === key) return v;
      }
    }
  }
  return "";
}

/** before_after pointer: awk -F: '/^before_after:/ { print trimmed $2; exit }'. */
export function beforeAfterValue(manifest: string): string {
  for (const raw of manifest.split("\n")) {
    if (/^before_after:/.test(raw)) {
      const v = raw.split(":")[1] ?? "";
      return v.replace(/^\s+/, "").replace(/\s+$/, "");
    }
  }
  return "";
}

/** Usage: validate-capstone.sh <capstone-manifest.yaml> — artifacts resolved beside the manifest. */
export function validateCapstone(argv: string[], fs: ReadonlyFs): ValidatorRun {
  return runPort((io) => {
    const manifestPath = argv[0];
    if (!manifestPath) {
      // bash `${1:?usage…}` — the message is what's pinned; bash's `line N` prefix is
      // invocation-dependent and deliberately not reproduced.
      // SCOPE BOUNDARY (ISC-137, L2): the no-argument case is NOT among the m15 captured
      // fixtures (which always pass a manifest path), so there is no byte-identical bash
      // reference for it. We pin exit 1 here as the chosen behavior and lock it with a
      // builder test (tests/builders-validators.test.ts) — the equivalence claim is scoped
      // to the seeded inputs (see web/ISA.md ISC-137); this path is our own definition.
      io.error("usage: validate-capstone.sh <capstone-manifest.yaml>");
      throw new ExitSignal(1);
    }
    const root = posixDirname(manifestPath);
    const manifest = fs.read(manifestPath);
    if (manifest === null) {
      io.log(`FAIL: manifest not found: ${manifestPath}`);
      throw new ExitSignal(2);
    }

    let fail = 0;

    io.log("checking loop coverage...");
    for (const stage of LOOP_STAGES) {
      const artifact = coverageValue(manifest, stage);
      if (artifact === "") {
        io.log(`  ${stage.padEnd(11)} MISSING (no artifact mapped)`);
        fail = 1;
        continue;
      }
      if (fs.exists(posixJoin(root, artifact))) {
        io.log(`  ${stage.padEnd(11)} ok  -> ${artifact}`);
      } else {
        io.log(`  ${stage.padEnd(11)} MISSING (artifact not found: ${artifact})`);
        fail = 1;
      }
    }

    io.log("checking before/after...");
    const ba = beforeAfterValue(manifest);
    if (ba !== "" && fs.exists(posixJoin(root, ba))) {
      io.log(`  before/after ok -> ${ba}`);
    } else {
      io.log("  before/after MISSING (no before_after pointer or file not found)");
      fail = 1;
    }

    if (fail !== 0) {
      io.log("FAIL: capstone coverage incomplete — close the named gaps before shipping");
      throw new ExitSignal(1);
    }
    io.log("PASS: all 7 loop stages covered; before/after present");
    throw new ExitSignal(0);
  });
}
