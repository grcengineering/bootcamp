#!/usr/bin/env bun
// Module 10 crosswalk validator (original lab asset).
// Asserts the GRC-relevant core logic of the standards spine:
//   1. Every crosswalk row maps a profile requirement to a REAL 800-53 spine family.
//   2. Every ORPHAN (empty spine_control, or relationship=orphan) is flagged — the build fails on it.
//   3. Every row carries a relationship label drawn from the allowed vocabulary, so a human is
//      forced to make a deliberate honesty call (catching false equivalence) rather than defaulting.
//
// Usage: bun validate-crosswalk.ts <crosswalk.csv> [spine-families.txt]
// Exit 0 = verified (no orphans, all rows structurally honest); non-zero = FAIL with named defects.
//
// Deliberately schema-light and dependency-free: this flat CSV is what Module 12 converts to OSCAL.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ALLOWED_RELATIONSHIPS = new Set([
  "exact",
  "broader",
  "narrower",
  "partial",
]);

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) fail("usage: validate-crosswalk.ts <crosswalk.csv> [spine-families.txt]");

const familiesPath =
  process.argv[3] ?? join(dirname(csvPath), "spine-families.txt");

const families = new Set(
  readFileSync(familiesPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0),
);

const lines = readFileSync(csvPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

if (lines.length < 2) fail("FAIL: crosswalk has no data rows");

// header sanity
const header = lines[0].split(",").map((c) => c.trim());
const expected = ["profile", "profile_control", "spine_control", "relationship"];
if (header.join(",") !== expected.join(",")) {
  fail(`FAIL: header must be '${expected.join(",")}', got '${header.join(",")}'`);
}

type Defect = string;
const orphans: Defect[] = [];
const badRelationship: Defect[] = [];
const unknownFamily: Defect[] = [];

const profiles = new Set<string>();
const referencedFamilies = new Set<string>();
let dataRows = 0;

for (let i = 1; i < lines.length; i++) {
  const [profile, profileControl, spineControl, relationship] = lines[i]
    .split(",")
    .map((c) => c.trim());
  dataRows++;
  profiles.add(profile);

  const isOrphan = spineControl === "" || relationship === "orphan";
  if (isOrphan) {
    orphans.push(`${profile} ${profileControl} (relationship=${relationship || "missing"})`);
    continue; // an orphan can't also be checked for family/relationship validity
  }

  // spine_control must start with a real 800-53 family abbreviation (e.g. AC-2 -> AC)
  const family = spineControl.split("-")[0];
  if (!families.has(family)) {
    unknownFamily.push(`${profile} ${profileControl} -> '${spineControl}' (family '${family}' not in spine)`);
  } else {
    referencedFamilies.add(family);
  }

  if (!ALLOWED_RELATIONSHIPS.has(relationship)) {
    badRelationship.push(`${profile} ${profileControl} -> '${spineControl}' has relationship '${relationship}' (allowed: exact|broader|narrower|partial)`);
  }
}

console.log(
  `profiles: ${profiles.size} | rows: ${dataRows} | spine families referenced: ${referencedFamilies.size}/${families.size}`,
);

let failed = false;

if (orphans.length > 0) {
  failed = true;
  console.error(`FAIL: ${orphans.length} orphan(s) — profile requirement maps to no spine control:`);
  for (const o of orphans) console.error(`  - ${o}`);
}

if (unknownFamily.length > 0) {
  failed = true;
  console.error(`FAIL: ${unknownFamily.length} row(s) map to a non-spine family:`);
  for (const u of unknownFamily) console.error(`  - ${u}`);
}

if (badRelationship.length > 0) {
  failed = true;
  console.error(`FAIL: ${badRelationship.length} row(s) carry an invalid relationship label:`);
  for (const b of badRelationship) console.error(`  - ${b}`);
}

if (failed) {
  console.error("exit: 1");
  process.exit(1);
}

console.log("PASS: every profile requirement maps to a real spine family; no orphans; all relationships valid.");
process.exit(0);
