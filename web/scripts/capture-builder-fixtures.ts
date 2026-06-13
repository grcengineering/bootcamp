#!/usr/bin/env bun
/**
 * Builder-validator ground-truth capture (web ISA ISC-137).
 *
 * Runs the repo's OWN lab validators — the exact committed bytes under modules/<m>/labs/ —
 * against the exact inputs the CI lab-repro (.ci/lab-repro.sh → labs/happy-path.sh) exercises,
 * and records byte-exact { stdout, stderr, exit } for every PASS and FAIL case those
 * happy-paths assert. The client-side ports in web/src/engines/builders/ are accepted ONLY
 * by byte-identity against these captures (tests/builders-validators.test.ts).
 *
 * Honesty class: fixture-pinned. Nothing here is authored — every expected string is the
 * output of the real validator process. Re-run after any change to a lab validator:
 *
 *   bun run web/scripts/capture-builder-fixtures.ts
 *
 * Output: web/tests/fixtures/builder-captures.json (committed).
 */
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULES = join(ROOT, "modules");
const OUT = join(ROOT, "web/tests/fixtures/builder-captures.json");

interface Run { stdout: string; stderr: string; exit: number }
interface Case { id: string; argv: string[]; env?: Record<string, string>; run: Run }

function spawn(cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Run {
  const p = Bun.spawnSync(cmd, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: new TextDecoder().decode(p.stdout),
    stderr: new TextDecoder().decode(p.stderr),
    exit: p.exitCode,
  };
}

function tmp(label: string): string {
  return mkdtempSync(join(tmpdir(), `grc-cap-${label}-`));
}

/** Recursively read a directory into { relPath: content } (text files only; dirs as "<dir>"). */
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, prefix: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        out[`${rel}/`] = "<dir>";
        walk(full, rel);
      } else {
        out[rel] = readFileSync(full, "utf8");
      }
    }
  };
  walk(dir, "");
  return out;
}

/**
 * Real bash version banner (L1 fix): the provenance line used to be the JS template literal
 * `${process.platform} bash=$(bash --version | head -1)`, which records the LITERAL string
 * "$(bash --version | head -1)" — JS does not run command substitution. Actually invoke bash
 * and capture its first version line so the recorded provenance is the truth.
 */
function bashVersionLine(): string {
  const p = Bun.spawnSync(["bash", "--version"], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) return "unknown (bash --version failed)";
  return new TextDecoder().decode(p.stdout).split("\n")[0]?.trim() || "unknown";
}

const captures: Record<string, unknown> = {
  meta: {
    captured_at: new Date().toISOString(),
    method: "web/scripts/capture-builder-fixtures.ts — real `bash`/`bun` runs of the committed lab validators",
    sources: "modules/{00,08,10,11,12,13,14,15}-*/labs/",
    platform: `${process.platform} bash=${bashVersionLine()}`,
  },
};

// ---------------------------------------------------------------------------
// Module 00 — evaluate_analysis (bash function inside labs/happy-path.sh)
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "00-what-grc-engineering-is/labs");
  const work = tmp("m00");
  spawn(["bash", join(labs, "setup.sh"), join(work, "lab00")]);
  const conformingPath = join(work, "lab00/legacy-vs-engineered-laptop-encryption.md");
  const conforming = readFileSync(conformingPath, "utf8");

  // The non-conforming sample exactly as happy-path.sh authors it (its FAIL case).
  const nonConforming =
    "# Encryption control\n" +
    "We confirm laptops are encrypted by collecting screenshots each quarter for the auditor.\n" +
    "That is all we do.\n";
  const ncPath = join(work, "lab00/non-conforming.md");
  writeFileSync(ncPath, nonConforming);

  // Execute the repo's OWN function bytes: extract the arrays + function from happy-path.sh.
  const hp = readFileSync(join(labs, "happy-path.sh"), "utf8");
  const pick = (re: RegExp) => {
    const m = hp.match(re);
    if (!m) throw new Error(`module 00: cannot extract ${re} from happy-path.sh`);
    return m[0];
  };
  const driver =
    pick(/^PROBLEMS=\(.*\)$/m) + "\n" +
    pick(/^STAGES=\(.*\)$/m) + "\n" +
    pick(/^evaluate_analysis\(\) \{[\s\S]*?\n\}/m) + "\n" +
    'evaluate_analysis "$1"\n';
  const driverPath = join(work, "driver.sh");
  writeFileSync(driverPath, driver);

  const cases: Case[] = [
    { id: "conforming", argv: ["lab00/legacy-vs-engineered-laptop-encryption.md"], run: spawn(["bash", driverPath, conformingPath]) },
    { id: "non-conforming", argv: ["lab00/non-conforming.md"], run: spawn(["bash", driverPath, ncPath]) },
  ];
  captures.m00 = { seed: { "legacy-vs-engineered-laptop-encryption.md": conforming }, nonConforming, cases };
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module 08 — gate.sh (bash) against the committed Checkov-shaped fixtures
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "08-iac-and-scanning-in-ci/labs");
  const work = tmp("m08");
  spawn(["bash", join(labs, "setup.sh"), join(work, "lab08")]);
  const cwd = join(work, "lab08");
  const env = { GATE_FAKE_TIME: "ci" };
  const g = (argv: string[], e?: Record<string, string>) =>
    spawn(["bash", "gate.sh", ...argv], { cwd, env: e ?? env });

  const cases: Case[] = [
    { id: "noncompliant-HIGH", argv: ["checkov-noncompliant.json", "control-map.csv", "HIGH"], env, run: g(["checkov-noncompliant.json", "control-map.csv", "HIGH"]) },
    { id: "compliant-HIGH", argv: ["checkov-compliant.json", "control-map.csv", "HIGH"], env, run: g(["checkov-compliant.json", "control-map.csv", "HIGH"]) },
    { id: "noncompliant-MEDIUM", argv: ["checkov-noncompliant.json", "control-map.csv", "MEDIUM"], env, run: g(["checkov-noncompliant.json", "control-map.csv", "MEDIUM"]) },
    { id: "noncompliant-default-floor", argv: ["checkov-noncompliant.json", "control-map.csv"], env, run: g(["checkov-noncompliant.json", "control-map.csv"]) },
    { id: "usage-no-args", argv: [], env, run: g([]) },
    { id: "missing-result-file", argv: ["nope.json", "control-map.csv"], env, run: g(["nope.json", "control-map.csv"]) },
    { id: "missing-map-file", argv: ["checkov-noncompliant.json", "nope.csv"], env, run: g(["checkov-noncompliant.json", "nope.csv"]) },
    { id: "unknown-floor", argv: ["checkov-noncompliant.json", "control-map.csv", "BANANA"], env, run: g(["checkov-noncompliant.json", "control-map.csv", "BANANA"]) },
  ];
  captures.m08 = { seed: snapshotDir(cwd), cases };
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module 10 — validate-crosswalk.ts (bun) — seed FAIL, resolved PASS, negatives
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "10-standards-spine/labs");
  const work = tmp("m10");
  spawn(["bash", join(labs, "setup.sh"), join(work, "work")]);
  const cwd = work;
  const V = join(labs, "validate-crosswalk.ts");
  const seedCsv = readFileSync(join(work, "work/crosswalk.csv"), "utf8");
  // The happy-path's canonical orphan resolution (its sed edit, verbatim semantics).
  const resolved = seedCsv.replace(/^PCI4,6\.3\.2,,orphan$/m, "PCI4,6.3.2,CM-8,broader");
  writeFileSync(join(work, "work/crosswalk-resolved.csv"), resolved);
  // The happy-path's negative test: a row mapping to a non-spine family.
  writeFileSync(join(work, "work/crosswalk-bad.csv"), resolved + "HIPAA,164.312,ZZ-1,exact\n");
  // Invalid relationship label (DESIGN-INPUTS named FAIL branch).
  writeFileSync(join(work, "work/crosswalk-badrel.csv"), resolved + "SOC2,CC1.1,AC-3,sorta\n");
  // Structural negatives the validator defines.
  writeFileSync(join(work, "work/crosswalk-empty.csv"), "profile,profile_control,spine_control,relationship\n");
  writeFileSync(join(work, "work/crosswalk-badheader.csv"), "a,b,c,d\nSOC2,CC6.1,AC-2,broader\n");

  const run = (argv: string[]) => spawn(["bun", V, ...argv], { cwd });
  const cases: Case[] = [
    { id: "seed-orphan-FAIL", argv: ["work/crosswalk.csv", "work/spine-families.txt"], run: run(["work/crosswalk.csv", "work/spine-families.txt"]) },
    { id: "resolved-PASS", argv: ["work/crosswalk-resolved.csv", "work/spine-families.txt"], run: run(["work/crosswalk-resolved.csv", "work/spine-families.txt"]) },
    { id: "default-families-path", argv: ["work/crosswalk-resolved.csv"], run: run(["work/crosswalk-resolved.csv"]) },
    { id: "unknown-family-FAIL", argv: ["work/crosswalk-bad.csv", "work/spine-families.txt"], run: run(["work/crosswalk-bad.csv", "work/spine-families.txt"]) },
    { id: "bad-relationship-FAIL", argv: ["work/crosswalk-badrel.csv", "work/spine-families.txt"], run: run(["work/crosswalk-badrel.csv", "work/spine-families.txt"]) },
    { id: "no-data-rows", argv: ["work/crosswalk-empty.csv", "work/spine-families.txt"], run: run(["work/crosswalk-empty.csv", "work/spine-families.txt"]) },
    { id: "bad-header", argv: ["work/crosswalk-badheader.csv", "work/spine-families.txt"], run: run(["work/crosswalk-badheader.csv", "work/spine-families.txt"]) },
    { id: "usage", argv: [], run: run([]) },
  ];
  captures.m10 = { seed: snapshotDir(join(work, "work")), cases };
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module 11 — validate-coverage.ts (bun) — both seed defects, resolution, negatives
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "11-threat-informed-grc/labs");
  const work = tmp("m11");
  spawn(["bash", join(labs, "setup.sh"), join(work, "work")]);
  const cwd = work;
  const V = join(labs, "validate-coverage.ts");
  const seedCsv = readFileSync(join(work, "work/coverage-map.csv"), "utf8");
  const controls = readFileSync(join(work, "work/controls-in-scope.txt"), "utf8");
  // happy-path resolution: close the gap, add the new control to scope, kill the dead control.
  const resolvedCsv = seedCsv.replace(
    /^T-1486,Data encrypted for ransom,,$/m,
    "T-1486,Data encrypted for ransom,CTRL-BACKUP-RESTORE-05,detects",
  );
  writeFileSync(join(work, "work/coverage-map-resolved.csv"), resolvedCsv);
  const controlsPlus = controls.includes("CTRL-BACKUP-RESTORE-05") ? controls : controls + "CTRL-BACKUP-RESTORE-05\n";
  const controlsResolved = controlsPlus
    .split("\n")
    .filter((l) => l !== "CTRL-DLP-AGENT-04")
    .join("\n");
  writeFileSync(join(work, "work/controls-resolved.txt"), controlsResolved);
  writeFileSync(join(work, "work/coverage-map-bad.csv"), resolvedCsv + "T-1110,Brute-force of credentials,CTRL-MFA-01,eliminates-totally\n");
  writeFileSync(join(work, "work/coverage-map-unknown.csv"), resolvedCsv + "T-9999,Invented threat,CTRL-MFA-01,partial\n");
  writeFileSync(join(work, "work/coverage-map-empty.csv"), "threat_id,threat_name,control_id,mitigation\n");
  writeFileSync(join(work, "work/coverage-map-badheader.csv"), "a,b,c,d\nT-1566,Phishing for credentials,CTRL-MFA-01,partial\n");

  const run = (argv: string[]) => spawn(["bun", V, ...argv], { cwd });
  const A = ["work/prioritized-threats.txt", "work/controls-in-scope.txt"];
  const R = ["work/prioritized-threats.txt", "work/controls-resolved.txt"];
  const cases: Case[] = [
    { id: "seed-two-defects-FAIL", argv: ["work/coverage-map.csv", ...A], run: run(["work/coverage-map.csv", ...A]) },
    { id: "resolved-PASS", argv: ["work/coverage-map-resolved.csv", ...R], run: run(["work/coverage-map-resolved.csv", ...R]) },
    { id: "default-paths", argv: ["work/coverage-map.csv"], run: run(["work/coverage-map.csv"]) },
    { id: "bad-mitigation-FAIL", argv: ["work/coverage-map-bad.csv", ...R], run: run(["work/coverage-map-bad.csv", ...R]) },
    { id: "unknown-threat-FAIL", argv: ["work/coverage-map-unknown.csv", ...R], run: run(["work/coverage-map-unknown.csv", ...R]) },
    { id: "no-data-rows", argv: ["work/coverage-map-empty.csv", ...A], run: run(["work/coverage-map-empty.csv", ...A]) },
    { id: "bad-header", argv: ["work/coverage-map-badheader.csv", ...A], run: run(["work/coverage-map-badheader.csv", ...A]) },
    { id: "usage", argv: [], run: run([]) },
    { id: "threats-file-missing", argv: ["work/coverage-map.csv", "work/nope.txt", "work/controls-in-scope.txt"], run: run(["work/coverage-map.csv", "work/nope.txt", "work/controls-in-scope.txt"]) },
    { id: "controls-file-missing", argv: ["work/coverage-map.csv", "work/prioritized-threats.txt", "work/nope.txt"], run: run(["work/coverage-map.csv", "work/prioritized-threats.txt", "work/nope.txt"]) },
  ];
  captures.m11 = { seed: snapshotDir(join(work, "work")), cases };
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module 12 — validate-oscal.ts (bun) — valid PASS, broken catalog, dangling ref, usage
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "12-oscal-compliance-as-code/labs");
  const work = tmp("m12");
  spawn(["bash", join(labs, "setup.sh"), join(work, "lab12")]);
  const cwd = work;
  const V = join(work, "lab12/validate-oscal.ts");
  // happy-path Assertion 5: sed 's/"ac-2"/"ac-9"/' profile → dangling reference.
  const prof = readFileSync(join(work, "lab12/acme-profile.json"), "utf8");
  writeFileSync(join(work, "lab12/acme-profile-dangling.json"), prof.replaceAll('"ac-2"', '"ac-9"'));
  writeFileSync(join(work, "lab12/not-json.json"), "{ nope\n");

  const run = (argv: string[]) => spawn(["bun", V, ...argv], { cwd });
  const cases: Case[] = [
    { id: "valid-PASS", argv: ["lab12/acme-catalog.json", "lab12/acme-profile.json", "lab12/acme-component.json"], run: run(["lab12/acme-catalog.json", "lab12/acme-profile.json", "lab12/acme-component.json"]) },
    { id: "broken-catalog-FAIL", argv: ["lab12/acme-catalog-broken.json", "lab12/acme-profile.json", "lab12/acme-component.json"], run: run(["lab12/acme-catalog-broken.json", "lab12/acme-profile.json", "lab12/acme-component.json"]) },
    { id: "dangling-profile-FAIL", argv: ["lab12/acme-catalog.json", "lab12/acme-profile-dangling.json", "lab12/acme-component.json"], run: run(["lab12/acme-catalog.json", "lab12/acme-profile-dangling.json", "lab12/acme-component.json"]) },
    { id: "usage-no-args", argv: [], run: run([]) },
    { id: "file-not-found", argv: ["lab12/nope.json", "lab12/acme-profile.json", "lab12/acme-component.json"], run: run(["lab12/nope.json", "lab12/acme-profile.json", "lab12/acme-component.json"]) },
    { id: "not-json", argv: ["lab12/not-json.json", "lab12/acme-profile.json", "lab12/acme-component.json"], run: run(["lab12/not-json.json", "lab12/acme-profile.json", "lab12/acme-component.json"]) },
  ];
  captures.m12 = { seed: snapshotDir(join(work, "lab12")), cases };
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module 13 — ccm-check.sh (bash; bun-branch JSON parsing, as on the capture host)
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "13-continuous-controls-monitoring/labs");
  const work = tmp("m13");
  spawn(["bash", join(labs, "setup.sh"), join(work, "ccm-lab")]);
  const fixtures = ["state-compliant.json", "state-drifted.json", "state-drifted-pretty.json", "state-empty.json"];
  for (const f of fixtures) copyFileSync(join(labs, "fixtures", f), join(work, f));

  const lib = join(work, "ccm-lab/ccm-check.sh");
  const callFn = (fn: string, args: string[]) =>
    spawn(["bash", "-c", `source "${lib}"; ${fn} ${args.map((a) => `"${a}"`).join(" ")}`], { cwd: work });

  const evalCases: Case[] = [];
  const normCases: Case[] = [];
  for (const f of fixtures) {
    evalCases.push({ id: `evaluate_control:${f}`, argv: [f], run: callFn("evaluate_control", [f]) });
    normCases.push({ id: `normalize_buckets:${f}`, argv: [f], run: callFn("normalize_buckets", [f]) });
  }

  // emit_evidence: per-fixture fresh evidence dirs; snapshot what landed on disk + rc.
  const emitCases: Array<{ id: string; argv: string[]; run: Run; evidence: Record<string, string> }> = [];
  for (const f of fixtures) {
    const ev = `evidence-${f.replace(/\W/g, "-")}`;
    const run = callFn("emit_evidence", [f, ev]);
    emitCases.push({ id: `emit_evidence:${f}`, argv: [f, ev], run, evidence: snapshotDir(join(work, ev)) });
  }
  // Sequential ledger semantics (happy-path assertions 1-4): two runs into ONE store.
  const seqRun1 = callFn("emit_evidence", ["state-compliant.json", "evidence-seq"]);
  const seqRun2 = callFn("emit_evidence", ["state-drifted.json", "evidence-seq"]);
  const seq = { run1: seqRun1, run2: seqRun2, evidence: snapshotDir(join(work, "evidence-seq")) };

  captures.m13 = {
    library: readFileSync(lib, "utf8"),
    fixtures: Object.fromEntries(fixtures.map((f) => [f, readFileSync(join(labs, "fixtures", f), "utf8")])),
    normCases,
    evalCases,
    emitCases,
    seq,
  };
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module 14 — expected_loss.ts (bun) — deterministic LCG output + usage error
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "14-product-ownership-build-vs-buy/labs");
  const work = tmp("m14");
  spawn(["bash", join(labs, "setup.sh"), join(work, "fixtures")]);
  const V = join(labs, "expected_loss.ts");
  const fixture = readFileSync(join(work, "fixtures/risk-input.json"), "utf8");
  // A second input (different seed/ranges) so determinism is proven as a property, not one number.
  const alt = JSON.stringify({ frequency: { min: 0.5, max: 2 }, magnitude: { min: 1000, max: 50000 }, iterations: 5000, tail_percentile: 90, seed: 7 }, null, 2) + "\n";
  writeFileSync(join(work, "fixtures/risk-alt.json"), alt);
  // Defaults branch: no iterations/tail/seed keys at all.
  const defaults = JSON.stringify({ frequency: { min: 0.1, max: 0.6 }, magnitude: { min: 300000, max: 2500000 } }, null, 2) + "\n";
  writeFileSync(join(work, "fixtures/risk-defaults.json"), defaults);

  const run = (argv: string[]) => spawn(["bun", V, ...argv], { cwd: work });
  const cases: Case[] = [
    { id: "fixture", argv: ["fixtures/risk-input.json"], run: run(["fixtures/risk-input.json"]) },
    { id: "alt-input", argv: ["fixtures/risk-alt.json"], run: run(["fixtures/risk-alt.json"]) },
    { id: "defaults", argv: ["fixtures/risk-defaults.json"], run: run(["fixtures/risk-defaults.json"]) },
    { id: "usage-no-args", argv: [], run: run([]) },
  ];
  captures.m14 = { seed: { "risk-input.json": fixture, "risk-alt.json": alt, "risk-defaults.json": defaults }, cases };
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module 15 — validate-capstone.sh (bash, generated by setup.sh) — PASS, FAIL, not-found
// ---------------------------------------------------------------------------
{
  const labs = join(MODULES, "15-capstone-ship-one-control/labs");
  const work = tmp("m15");
  spawn(["bash", join(labs, "setup.sh"), join(work, "capstone-lab")]);
  const lab = join(work, "capstone-lab");
  copyFileSync(join(labs, "fixtures/capstone-manifest-incomplete.yaml"), join(lab, "capstone-manifest-incomplete.yaml"));

  const run = (argv: string[]) => spawn(["bash", join(lab, "validate-capstone.sh"), ...argv], { cwd: lab });
  const cases: Case[] = [
    { id: "complete-PASS", argv: ["capstone-manifest.yaml"], run: run(["capstone-manifest.yaml"]) },
    { id: "incomplete-FAIL", argv: ["capstone-manifest-incomplete.yaml"], run: run(["capstone-manifest-incomplete.yaml"]) },
    { id: "manifest-not-found", argv: ["nope.yaml"], run: run(["nope.yaml"]) },
  ];
  captures.m15 = { seed: snapshotDir(lab), cases };
  rmSync(work, { recursive: true, force: true });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(captures, null, 2) + "\n");
const sections = Object.keys(captures).filter((k) => k !== "meta");
console.log(`captured ${sections.length} module sections -> ${OUT}`);
if (!existsSync(OUT)) process.exit(1);
