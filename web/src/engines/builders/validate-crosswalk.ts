/**
 * Module 10 — ported from modules/10-standards-spine/labs/validate-crosswalk.ts
 * (web ISA ISC-82/137). Direct transcription of the original Bun validator with file IO and
 * process exit abstracted; every console.log / console.error line and exit code preserved.
 *
 * Byte-accepted against builder-captures.json m10 (real `bun validate-crosswalk.ts` runs).
 */
import type { ReadonlyFs, ValidatorRun } from "./types";
import { ExitSignal, posixDirname, posixJoin, runPort } from "./types";

const ALLOWED_RELATIONSHIPS = new Set(["exact", "broader", "narrower", "partial"]);

/** Usage: validate-crosswalk.ts <crosswalk.csv> [spine-families.txt] */
export function validateCrosswalk(argv: string[], fs: ReadonlyFs): ValidatorRun {
  return runPort((io) => {
    const fail = (msg: string): never => {
      io.error(msg);
      throw new ExitSignal(1);
    };

    const csvPath = argv[0];
    if (!csvPath) fail("usage: validate-crosswalk.ts <crosswalk.csv> [spine-families.txt]");

    const familiesPath = argv[1] ?? posixJoin(posixDirname(csvPath!), "spine-families.txt");

    const families = new Set(
      readFileSync(fs, familiesPath)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    );

    const lines = readFileSync(fs, csvPath!)
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

    const orphans: string[] = [];
    const badRelationship: string[] = [];
    const unknownFamily: string[] = [];

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
        badRelationship.push(
          `${profile} ${profileControl} -> '${spineControl}' has relationship '${relationship}' (allowed: exact|broader|narrower|partial)`,
        );
      }
    }

    io.log(
      `profiles: ${profiles.size} | rows: ${dataRows} | spine families referenced: ${referencedFamilies.size}/${families.size}`,
    );

    let failed = false;

    if (orphans.length > 0) {
      failed = true;
      io.error(`FAIL: ${orphans.length} orphan(s) — profile requirement maps to no spine control:`);
      for (const o of orphans) io.error(`  - ${o}`);
    }

    if (unknownFamily.length > 0) {
      failed = true;
      io.error(`FAIL: ${unknownFamily.length} row(s) map to a non-spine family:`);
      for (const u of unknownFamily) io.error(`  - ${u}`);
    }

    if (badRelationship.length > 0) {
      failed = true;
      io.error(`FAIL: ${badRelationship.length} row(s) carry an invalid relationship label:`);
      for (const b of badRelationship) io.error(`  - ${b}`);
    }

    if (failed) {
      io.error("exit: 1");
      throw new ExitSignal(1);
    }

    io.log("PASS: every profile requirement maps to a real spine family; no orphans; all relationships valid.");
    throw new ExitSignal(0);
  });
}

/** readFileSync analogue: the original would crash on a missing file; specs always seed both. */
function readFileSync(fs: ReadonlyFs, path: string): string {
  const c = fs.read(path);
  if (c === null) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  return c;
}
