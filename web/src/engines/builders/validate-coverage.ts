/**
 * Module 11 — ported from modules/11-threat-informed-grc/labs/validate-coverage.ts
 * (web ISA ISC-83/137). Direct transcription of the original Bun validator with file IO and
 * process exit abstracted; every output line and exit code preserved, including the two
 * signature defects: COVERAGE GAP and ZERO-THREAT CONTROL (the kill/downgrade candidate).
 *
 * Byte-accepted against builder-captures.json m11 (real `bun validate-coverage.ts` runs).
 */
import type { ReadonlyFs, ValidatorRun } from "./types";
import { ExitSignal, posixDirname, posixJoin, runPort } from "./types";

const ALLOWED_MITIGATIONS = new Set(["prevents", "detects", "partial"]);

function readList(fs: ReadonlyFs, path: string): Set<string> {
  return new Set(
    (fs.read(path) ?? "")
      .split("\n")
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter((l) => l.length > 0),
  );
}

/** Usage: validate-coverage.ts <coverage-map.csv> [prioritized-threats.txt] [controls-in-scope.txt] */
export function validateCoverage(argv: string[], fs: ReadonlyFs): ValidatorRun {
  return runPort((io) => {
    const fail = (msg: string): never => {
      io.error(msg);
      throw new ExitSignal(1);
    };

    const csvPath = argv[0];
    if (!csvPath) {
      fail("usage: validate-coverage.ts <coverage-map.csv> [prioritized-threats.txt] [controls-in-scope.txt]");
    }

    const threatsPath = argv[1] ?? posixJoin(posixDirname(csvPath!), "prioritized-threats.txt");
    const controlsPath = argv[2] ?? posixJoin(posixDirname(csvPath!), "controls-in-scope.txt");

    if (!fs.exists(threatsPath)) fail(`FAIL: prioritized-threats file not found: ${threatsPath}`);
    if (!fs.exists(controlsPath)) fail(`FAIL: controls-in-scope file not found: ${controlsPath}`);

    const prioritizedThreats = readList(fs, threatsPath);
    const inScopeControls = readList(fs, controlsPath);

    const lines = (fs.read(csvPath!) ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) fail("FAIL: coverage map has no data rows");

    const header = lines[0].split(",").map((c) => c.trim());
    const expected = ["threat_id", "threat_name", "control_id", "mitigation"];
    if (header.join(",") !== expected.join(",")) {
      fail(`FAIL: header must be '${expected.join(",")}', got '${header.join(",")}'`);
    }

    // Threats that have at least one real control line, and controls that touch at least one
    // prioritized threat. We build both so we can report BOTH defects in one pass.
    const threatsWithControl = new Set<string>();
    const controlsThatMitigateSomething = new Set<string>();
    const badMitigation: string[] = [];
    const unknownThreat: string[] = [];
    let dataRows = 0;

    for (let i = 1; i < lines.length; i++) {
      const [threatId, , controlId, mitigation] = lines[i].split(",").map((c) => c.trim());
      dataRows++;

      // A row with no control is just a placeholder for a known gap — record nothing, the gap
      // check below will catch the threat if it is prioritized.
      if (controlId === "") continue;

      // The threat on this line must be one the team actually prioritized; a line to a
      // non-prioritized threat is noise that can hide a zero-threat control behind a phantom mapping.
      if (!prioritizedThreats.has(threatId)) {
        unknownThreat.push(`${controlId} -> '${threatId}' (threat is not on the prioritized list)`);
        continue;
      }

      threatsWithControl.add(threatId);
      controlsThatMitigateSomething.add(controlId);

      if (!ALLOWED_MITIGATIONS.has(mitigation)) {
        badMitigation.push(
          `${threatId} -> ${controlId} has mitigation '${mitigation || "missing"}' (allowed: prevents|detects|partial)`,
        );
      }
    }

    // DEFECT 1 — coverage gaps: prioritized threats with no mapped control.
    const coverageGaps = [...prioritizedThreats].filter((t) => !threatsWithControl.has(t)).sort();

    // DEFECT 2 — zero-threat controls: in-scope controls that map to no prioritized threat.
    const zeroThreatControls = [...inScopeControls]
      .filter((c) => !controlsThatMitigateSomething.has(c))
      .sort();

    io.log(
      `prioritized threats: ${prioritizedThreats.size} | in-scope controls: ${inScopeControls.size} | map rows: ${dataRows} | threats covered: ${threatsWithControl.size}/${prioritizedThreats.size}`,
    );

    let failed = false;

    if (coverageGaps.length > 0) {
      failed = true;
      io.error(`FAIL: ${coverageGaps.length} coverage gap(s) — prioritized threat with no mapped control:`);
      for (const t of coverageGaps) io.error(`  - ${t}`);
    }

    if (zeroThreatControls.length > 0) {
      failed = true;
      io.error(
        `FAIL: ${zeroThreatControls.length} zero-threat control(s) — in-scope control mitigates no prioritized threat (kill/downgrade candidate):`,
      );
      for (const c of zeroThreatControls) io.error(`  - ${c}`);
    }

    if (unknownThreat.length > 0) {
      failed = true;
      io.error(`FAIL: ${unknownThreat.length} row(s) map a control to a non-prioritized threat:`);
      for (const u of unknownThreat) io.error(`  - ${u}`);
    }

    if (badMitigation.length > 0) {
      failed = true;
      io.error(`FAIL: ${badMitigation.length} row(s) carry an invalid mitigation label:`);
      for (const b of badMitigation) io.error(`  - ${b}`);
    }

    if (failed) {
      io.error("exit: 1");
      throw new ExitSignal(1);
    }

    io.log(
      "PASS: every prioritized threat has a mapped control; no zero-threat controls; all mitigation labels valid.",
    );
    throw new ExitSignal(0);
  });
}
