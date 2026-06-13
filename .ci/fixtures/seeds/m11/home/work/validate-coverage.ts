#!/usr/bin/env bun
// Module 11 threat->control coverage-map validator (original lab asset).
// Asserts the GRC-relevant core logic of threat-informed control evaluation:
//   1. COVERAGE GAP: every prioritized threat maps to at least one control. A prioritized threat
//      with no mapped control fails the build — it is a threat you face with nothing run against it.
//   2. ZERO-THREAT CONTROL: every in-scope control appears on at least one map line to a
//      prioritized threat. A control that mitigates none of the prioritized threats fails the
//      build — it is unpriced toil and a candidate for removal/downgrade (§4.4/§4.5). This is the
//      defect frameworks are blind to, because they never ask you to remove a control.
//   3. HONEST MITIGATION LABEL: every mapped row carries a mitigation strength from the allowed
//      vocabulary (prevents|detects|partial), forcing a deliberate honesty call instead of a
//      default claim of full mitigation (the false-confidence defect).
//
// Usage: bun validate-coverage.ts <coverage-map.csv> [prioritized-threats.txt] [controls-in-scope.txt]
// Exit 0 = verified (no gaps, no zero-threat controls, all rows honest); non-zero = FAIL w/ defects.
//
// Deliberately schema-light and dependency-free, mirroring Module 10's crosswalk validator: this
// flat CSV is the artifact the capstone (Module 15) expects per control.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ALLOWED_MITIGATIONS = new Set(["prevents", "detects", "partial"]);

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function readList(path: string): Set<string> {
  return new Set(
    readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter((l) => l.length > 0),
  );
}

const csvPath = process.argv[2];
if (!csvPath) {
  fail("usage: validate-coverage.ts <coverage-map.csv> [prioritized-threats.txt] [controls-in-scope.txt]");
}

const threatsPath = process.argv[3] ?? join(dirname(csvPath), "prioritized-threats.txt");
const controlsPath = process.argv[4] ?? join(dirname(csvPath), "controls-in-scope.txt");

if (!existsSync(threatsPath)) fail(`FAIL: prioritized-threats file not found: ${threatsPath}`);
if (!existsSync(controlsPath)) fail(`FAIL: controls-in-scope file not found: ${controlsPath}`);

const prioritizedThreats = readList(threatsPath);
const inScopeControls = readList(controlsPath);

const lines = readFileSync(csvPath, "utf8")
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

  // A row with no control is just a placeholder for a known gap — record nothing, the gap check
  // below will catch the threat if it is prioritized.
  if (controlId === "") continue;

  // The threat on this line must be one the team actually prioritized; a line to a non-prioritized
  // threat is noise that can hide a zero-threat control behind a phantom mapping.
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

console.log(
  `prioritized threats: ${prioritizedThreats.size} | in-scope controls: ${inScopeControls.size} | map rows: ${dataRows} | threats covered: ${threatsWithControl.size}/${prioritizedThreats.size}`,
);

let failed = false;

if (coverageGaps.length > 0) {
  failed = true;
  console.error(`FAIL: ${coverageGaps.length} coverage gap(s) — prioritized threat with no mapped control:`);
  for (const t of coverageGaps) console.error(`  - ${t}`);
}

if (zeroThreatControls.length > 0) {
  failed = true;
  console.error(
    `FAIL: ${zeroThreatControls.length} zero-threat control(s) — in-scope control mitigates no prioritized threat (kill/downgrade candidate):`,
  );
  for (const c of zeroThreatControls) console.error(`  - ${c}`);
}

if (unknownThreat.length > 0) {
  failed = true;
  console.error(`FAIL: ${unknownThreat.length} row(s) map a control to a non-prioritized threat:`);
  for (const u of unknownThreat) console.error(`  - ${u}`);
}

if (badMitigation.length > 0) {
  failed = true;
  console.error(`FAIL: ${badMitigation.length} row(s) carry an invalid mitigation label:`);
  for (const b of badMitigation) console.error(`  - ${b}`);
}

if (failed) {
  console.error("exit: 1");
  process.exit(1);
}

console.log(
  "PASS: every prioritized threat has a mapped control; no zero-threat controls; all mitigation labels valid.",
);
process.exit(0);
