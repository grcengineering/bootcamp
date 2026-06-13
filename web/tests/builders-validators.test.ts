/**
 * Builder validator ports — byte-fidelity suite (web ISA ISC-137).
 *
 * Every ported validator (web/src/engines/builders/) is replayed against the captured
 * ground truth in tests/fixtures/builder-captures.json — REAL bash/`bun` runs of the
 * repo's own lab validators over the same inputs the CI lab-repro (happy-path.sh)
 * exercises. Acceptance is byte-identity: stdout, stderr, and exit code all equal.
 *
 * Drift guards additionally re-derive load-bearing constants (module 00 problem/stage
 * lists, module 14 reference TSV, module 15 seed bytes) from the committed lab sources,
 * so the ports cannot silently diverge from the curriculum repo.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ANALYSIS_STAGES,
  LEGACY_PROBLEMS,
  SimFs,
  analyzeDocument,
  capstoneSeedFiles,
  createScoringGrid,
  emitEvidence,
  evaluateAnalysis,
  evaluateControl,
  normalizeBuckets,
  runExpectedLoss,
  runGate,
  validateCapstone,
  validateCoverage,
  validateCrosswalk,
  validateOscal,
  type ReadonlyFs,
  type ValidatorRun,
} from "../src/engines/builders";

const HERE = dirname(new URL(import.meta.url).pathname);
const MODULES = join(HERE, "../../modules");
const captures = JSON.parse(readFileSync(join(HERE, "fixtures/builder-captures.json"), "utf8"));

interface CapturedCase {
  id: string;
  argv: string[];
  run: ValidatorRun;
}

/** ReadonlyFs over a captured directory snapshot ("name/" → dir, name → content). */
function fsFrom(snap: Record<string, string>, prefix = ""): ReadonlyFs {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  for (const [k, v] of Object.entries(snap)) {
    if (k.endsWith("/")) dirs.add(prefix + k.slice(0, -1));
    else files.set(prefix + k, v);
  }
  return {
    read: (p) => files.get(p) ?? null,
    exists: (p) => files.has(p) || dirs.has(p.replace(/\/+$/, "")),
  };
}

function expectIdentical(got: ValidatorRun, want: ValidatorRun, label: string) {
  expect(got.stdout, `${label}: stdout`).toBe(want.stdout);
  expect(got.stderr, `${label}: stderr`).toBe(want.stderr);
  expect(got.exit, `${label}: exit`).toBe(want.exit);
}

// ---------------------------------------------------------------------------
describe("module 00 — evaluate_analysis port", () => {
  const m00 = captures.m00;
  const conforming = m00.seed["legacy-vs-engineered-laptop-encryption.md"];

  test("conforming sample PASSES byte-identically (exit 0, silent)", () => {
    const got = evaluateAnalysis(conforming);
    const want = m00.cases.find((c: CapturedCase) => c.id === "conforming").run;
    expectIdentical(got, want, "conforming");
  });

  test("legacy-only sample is REJECTED with the exact missing-element lines", () => {
    const got = evaluateAnalysis(m00.nonConforming);
    const want = m00.cases.find((c: CapturedCase) => c.id === "non-conforming").run;
    expectIdentical(got, want, "non-conforming");
  });

  test("coverage is exhaustive on the conforming fixture (happy-path P_HITS=5, S_HITS=7)", () => {
    const report = analyzeDocument(conforming);
    expect(report.problems.filter((p) => p.present).length).toBe(5);
    expect(report.stages.filter((s) => s.present).length).toBe(7);
    expect(report.inversion).toBe(true);
    expect(report.conforms).toBe(true);
  });

  test("structured report names the gaps on a partial document", () => {
    const partial = "We have manual toil and UNDERSTAND only.\n";
    const report = analyzeDocument(partial);
    expect(report.conforms).toBe(false);
    expect(report.problems.find((p) => p.name === "manual toil")?.present).toBe(true);
    expect(report.problems.find((p) => p.name === "commoditized")?.present).toBe(false);
    expect(report.stages.find((s) => s.name === "UNDERSTAND")?.present).toBe(true);
    expect(report.stages.find((s) => s.name === "MONITOR")?.present).toBe(false);
    expect(report.inversion).toBe(false);
  });

  test("stage matching is case-sensitive; problem matching is not (bash grep -q vs -qi)", () => {
    const doc = "understand locate query evaluate evidence monitor own\nManual Toil Transactional Whack-A-Mole Closed-Framework Commoditized\nreality -> policy\n";
    const got = evaluateAnalysis(doc);
    expect(got.exit).toBe(1);
    expect(got.stdout).toContain("missing loop stage: UNDERSTAND");
    expect(got.stdout).not.toContain("missing legacy problem");
  });

  test("inversion regex accepts both taught forms and stays line-bounded like grep", () => {
    const base = LEGACY_PROBLEMS.join(" ") + "\n" + ANALYSIS_STAGES.join(" ") + "\n";
    expect(evaluateAnalysis(base + "REALITY->POLICY\n").exit).toBe(0); // case-insensitive arrow
    expect(evaluateAnalysis(base + "reality should drive the policy\n").exit).toBe(0);
    expect(evaluateAnalysis(base + "reality\ndrives policy\n").exit).toBe(1); // grep never crosses lines
  });

  test("drift guard: PROBLEMS/STAGES constants equal the committed happy-path.sh arrays", () => {
    const hp = readFileSync(join(MODULES, "00-what-grc-engineering-is/labs/happy-path.sh"), "utf8");
    const parse = (line: string) => [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...LEGACY_PROBLEMS] as string[]).toEqual(parse(hp.match(/^PROBLEMS=\(.*\)$/m)![0]));
    expect([...ANALYSIS_STAGES] as string[]).toEqual(parse(hp.match(/^STAGES=\(.*\)$/m)![0]));
  });
});

// ---------------------------------------------------------------------------
describe("module 08 — gate.sh port", () => {
  const m08 = captures.m08;
  const fs = fsFrom(m08.seed);

  test("drift guard: captured seed bytes equal the committed labs/fixtures (recapture on change)", () => {
    // The byte-fidelity cases below replay against the CAPTURE-TIME inputs. If a lab
    // fixture changes without re-running web/scripts/capture-builder-fixtures.ts, the
    // suite would keep validating the port against stale bytes while the live exercise
    // seeds the new ones — this guard turns that silent drift into a failure.
    const fixtures = join(MODULES, "08-iac-and-scanning-in-ci/labs/fixtures");
    for (const [name, content] of Object.entries(m08.seed as Record<string, string>)) {
      expect(`${name}:${readFileSync(join(fixtures, name), "utf8")}`).toBe(`${name}:${content}`);
    }
  });

  for (const c of m08.cases as CapturedCase[]) {
    test(`gate.sh ${c.argv.join(" ") || "(no args)"} [${c.id}] byte-identical`, () => {
      const got = runGate(c.argv, fs, { fakeTime: "ci" });
      expectIdentical(got, c.run, c.id);
    });
  }

  test("without GATE_FAKE_TIME the evaluated_at falls back to the injected clock", () => {
    const got = runGate(["checkov-compliant.json", "control-map.csv"], fs, {
      now: () => "2026-06-12T00:00:00Z",
    });
    expect(got.stdout).toContain("evaluated_at: 2026-06-12T00:00:00Z");
    expect(got.exit).toBe(0);
  });

  test("without any clock injection evaluated_at is a real UTC second timestamp", () => {
    const got = runGate(["checkov-compliant.json", "control-map.csv"], fs);
    expect(got.stdout).toMatch(/evaluated_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\n/);
  });

  test("unmapped check ids fall back to the UNMAPPED control row (awk END branch)", () => {
    const scan = JSON.stringify({
      results: { failed_checks: [{ check_id: "CKV_NEW_99", check_name: "novel", severity: "HIGH" }] },
    });
    const world = fsFrom({ "scan.json": scan, "control-map.csv": m08.seed["control-map.csv"] });
    const got = runGate(["scan.json", "control-map.csv"], world, { fakeTime: "ci" });
    expect(got.stdout).toContain("FAILED  CKV_NEW_99  [HIGH]  -> UNMAPPED (unmapped check (no control owner))  : BLOCK");
    expect(got.exit).toBe(1);
  });

  test("awk-parser fidelity: missing severity/name default to UNKNOWN/unknown and never block", () => {
    const scan = '{"results":{"failed_checks":[{"check_id":"CKV_X_1"}]}}';
    const world = fsFrom({ "scan.json": scan, "control-map.csv": m08.seed["control-map.csv"] });
    const got = runGate(["scan.json", "control-map.csv"], world, { fakeTime: "ci" });
    expect(got.stdout).toContain("FAILED  CKV_X_1  [UNKNOWN]");
    expect(got.stdout).toContain("        unknown");
    expect(got.stdout).toContain("GATE_DECISION: PASS");
    expect(got.exit).toBe(0);
  });

  test("awk-parser fidelity: nested arrays + braces in strings do not derail object collection", () => {
    const scan = [
      "{",
      '  "results": {',
      '    "failed_checks": [',
      '      {',
      '        "check_id": "CKV_AWS_19",',
      '        "check_name": "Ensure { weird ] chars in strings are ignored",',
      '        "severity": "HIGH",',
      '        "file_line_range": [1, 4]',
      "      }",
      "    ]",
      "  }",
      "}",
    ].join("\n");
    const world = fsFrom({ "scan.json": scan, "control-map.csv": m08.seed["control-map.csv"] });
    const got = runGate(["scan.json", "control-map.csv"], world, { fakeTime: "ci" });
    expect(got.stdout).toContain("FAILED  CKV_AWS_19  [HIGH]  -> SC-28");
    expect(got.stdout).toContain("Ensure { weird ] chars in strings are ignored");
    expect(got.exit).toBe(1);
  });

  test("the lab's fix-unblocks loop: editing the scan from noncompliant to compliant flips the gate", () => {
    const blocked = runGate(["checkov-noncompliant.json", "control-map.csv", "HIGH"], fs, { fakeTime: "ci" });
    const unblocked = runGate(["checkov-compliant.json", "control-map.csv", "HIGH"], fs, { fakeTime: "ci" });
    expect(blocked.exit).toBe(1);
    expect(blocked.stdout).toContain("GATE_DECISION: FAIL");
    expect(unblocked.exit).toBe(0);
    expect(unblocked.stdout).toContain("GATE_DECISION: PASS");
  });
});

// ---------------------------------------------------------------------------
describe("module 10 — validate-crosswalk.ts port", () => {
  const m10 = captures.m10;
  const fs = fsFrom(m10.seed, "work/");

  for (const c of m10.cases as CapturedCase[]) {
    test(`validate-crosswalk ${c.argv.join(" ") || "(no args)"} [${c.id}] byte-identical`, () => {
      expectIdentical(validateCrosswalk(c.argv, fs), c.run, c.id);
    });
  }

  test("missing families file throws like readFileSync (specs must seed both inputs)", () => {
    expect(() => validateCrosswalk(["work/crosswalk.csv", "work/nope.txt"], fs)).toThrow(/ENOENT/);
  });
});

// ---------------------------------------------------------------------------
describe("module 11 — validate-coverage.ts port", () => {
  const m11 = captures.m11;
  const fs = fsFrom(m11.seed, "work/");

  for (const c of m11.cases as CapturedCase[]) {
    test(`validate-coverage ${c.argv.join(" ") || "(no args)"} [${c.id}] byte-identical`, () => {
      expectIdentical(validateCoverage(c.argv, fs), c.run, c.id);
    });
  }
});

// ---------------------------------------------------------------------------
describe("module 12 — validate-oscal.ts port", () => {
  const m12 = captures.m12;
  const fs = fsFrom(m12.seed, "lab12/");

  for (const c of m12.cases as CapturedCase[]) {
    test(`validate-oscal ${c.argv.join(" ") || "(no args)"} [${c.id}] byte-identical`, () => {
      expectIdentical(validateOscal(c.argv, fs), c.run, c.id);
    });
  }

  test("happy-path assertion 3 holds: the C2P link line + policy-linked count appear verbatim", () => {
    const pass = validateOscal(
      ["lab12/acme-catalog.json", "lab12/acme-profile.json", "lab12/acme-component.json"],
      fs,
    );
    expect(pass.stdout).toContain('ac-2 -> policy "ac-2-account-management"  [link resolves]');
    expect(pass.stdout).toContain("policy-linked: 1");
  });

  test("catalog with metadata stripped fails naming the required-field contract", () => {
    const cat = JSON.parse(m12.seed["acme-catalog.json"]);
    delete cat.catalog.metadata.title;
    const world = fsFrom({ ...m12.seed, "acme-catalog.json": JSON.stringify(cat) }, "lab12/");
    const got = validateOscal(["lab12/acme-catalog.json", "lab12/acme-profile.json", "lab12/acme-component.json"], world);
    expect(got.exit).toBe(1);
    expect(got.stdout).toContain("FAIL: catalog metadata missing a required field (title / version / oscal-version)");
  });

  test("implemented-requirement without a control-id fails (claim joined to nothing)", () => {
    const comp = JSON.parse(m12.seed["acme-component.json"]);
    delete comp["component-definition"].components[0]["control-implementations"][0]["implemented-requirements"][0]["control-id"];
    const world = fsFrom({ ...m12.seed, "acme-component.json": JSON.stringify(comp) }, "lab12/");
    const got = validateOscal(["lab12/acme-catalog.json", "lab12/acme-profile.json", "lab12/acme-component.json"], world);
    expect(got.exit).toBe(1);
    expect(got.stdout).toContain('FAIL: implemented-requirement missing required "control-id"');
  });

  test("implemented-requirement naming an undefined control fails (unverifiable claim)", () => {
    const comp = JSON.parse(m12.seed["acme-component.json"]);
    comp["component-definition"].components[0]["control-implementations"][0]["implemented-requirements"][0]["control-id"] = "zz-99";
    const world = fsFrom({ ...m12.seed, "acme-component.json": JSON.stringify(comp) }, "lab12/");
    const got = validateOscal(["lab12/acme-catalog.json", "lab12/acme-profile.json", "lab12/acme-component.json"], world);
    expect(got.exit).toBe(1);
    expect(got.stdout).toContain('FAIL: implemented-requirement names control "zz-99" the catalog does not define');
  });

  test("learner edit loop is genuine: removing the policy link makes the SAME files fail", () => {
    const component = JSON.parse(m12.seed["acme-component.json"]);
    delete component["component-definition"].components[0]["control-implementations"][0][
      "implemented-requirements"
    ][0].links;
    const world = fsFrom({ ...m12.seed, "acme-component.json": JSON.stringify(component) }, "lab12/");
    const got = validateOscal(
      ["lab12/acme-catalog.json", "lab12/acme-profile.json", "lab12/acme-component.json"],
      world,
    );
    expect(got.exit).toBe(1);
    expect(got.stdout).toContain("FAIL: no implemented control carries a resolvable policy link (C2P)");
  });
});

// ---------------------------------------------------------------------------
describe("module 13 — ccm-check.sh port", () => {
  const m13 = captures.m13;

  for (const c of m13.normCases as CapturedCase[]) {
    test(`normalize_buckets ${c.argv[0]} byte-identical`, () => {
      const got = normalizeBuckets(m13.fixtures[c.argv[0]]);
      expect(got).toBe(c.run.stdout);
    });
  }

  for (const c of m13.evalCases as CapturedCase[]) {
    test(`evaluate_control ${c.argv[0]} byte-identical (stdout + stderr + rc)`, () => {
      expectIdentical(evaluateControl(m13.fixtures[c.argv[0]]), c.run, c.id);
    });
  }

  for (const c of m13.emitCases as Array<CapturedCase & { evidence: Record<string, string> }>) {
    test(`emit_evidence ${c.argv[0]} — evidence record + ledger + alert byte-identical`, () => {
      const fs = new SimFs();
      fs.write(c.argv[0], m13.fixtures[c.argv[0]]);
      const r = emitEvidence(fs, c.argv[0], c.argv[1]);
      expect(r.exit).toBe(c.run.exit);
      expect(fs.snapshot(c.argv[1])).toEqual(c.evidence);
    });
  }

  test("sequential loop (happy-path assertions 1-4): two runs, one store, 2-row ledger", () => {
    const fs = new SimFs();
    fs.write("state-compliant.json", m13.fixtures["state-compliant.json"]);
    fs.write("state-drifted.json", m13.fixtures["state-drifted.json"]);
    const r1 = emitEvidence(fs, "state-compliant.json", "evidence-seq");
    const r2 = emitEvidence(fs, "state-drifted.json", "evidence-seq");
    expect(r1.exit).toBe(captures.m13.seq.run1.exit);
    expect(r2.exit).toBe(captures.m13.seq.run2.exit);
    expect(fs.snapshot("evidence-seq")).toEqual(captures.m13.seq.evidence);
  });

  test("reproducibility (happy-path assertion 5): same snapshot, same verdict twice", () => {
    const v1 = evaluateControl(m13.fixtures["state-drifted.json"]);
    const v2 = evaluateControl(m13.fixtures["state-drifted.json"]);
    expect(v1).toEqual(v2);
  });

  test("unparseable snapshot fails closed (zero rows → rc 2, no PASS verdict)", () => {
    expect(normalizeBuckets("{ not json")).toBe("");
    const got = evaluateControl("{ not json");
    expect(got.exit).toBe(2);
    expect(got.stdout).not.toMatch(/^PASS /m);
    expect(got.stdout).toContain("evaluated=0");
  });

  test("bucket objects without a string name normalize to an empty name field (bun branch)", () => {
    const out = normalizeBuckets('{"buckets":[{"block_public_acls":true}]}');
    expect(out).toBe("\ttrue\tfalse\tfalse\tfalse\n");
  });

  test("missing captured_at falls back to the injected clock for record + ledger naming", () => {
    const fs = new SimFs();
    fs.write("state.json", '{"buckets":[{"name":"b","block_public_acls":true,"block_public_policy":true,"ignore_public_acls":true,"restrict_public_buckets":true}]}');
    const r = emitEvidence(fs, "state.json", "ev", () => "2026-06-12T01:02:03Z");
    expect(r.capturedAt).toBe("2026-06-12T01:02:03Z");
    expect(r.runId).toBe("run-20260612010203");
    expect(fs.read("ev/run-20260612010203.evidence")).toContain("captured_at=2026-06-12T01:02:03Z");
  });

  test("default clock produces a well-formed run id when captured_at is absent", () => {
    const fs = new SimFs();
    fs.write("state.json", "{}");
    const r = emitEvidence(fs, "state.json", "ev");
    expect(r.runId).toMatch(/^run-\d{14}$/);
    expect(r.exit).toBe(2); // zero buckets → fail closed
  });
});

// ---------------------------------------------------------------------------
describe("module 14 — expected_loss.ts port", () => {
  const m14 = captures.m14;
  const fs = fsFrom(m14.seed, "fixtures/");

  for (const c of m14.cases as CapturedCase[]) {
    test(`expected_loss ${c.argv.join(" ") || "(no args)"} [${c.id}] byte-identical`, () => {
      expectIdentical(runExpectedLoss(c.argv, fs), c.run, c.id);
    });
  }

  test("missing input file throws like the original's readFileSync", () => {
    expect(() => runExpectedLoss(["fixtures/nope.json"], fs)).toThrow(/ENOENT/);
  });

  test("happy-path properties hold on the real fixture: mean in analytic band, tail > mean", () => {
    const out = JSON.parse(
      runExpectedLoss(["fixtures/risk-input.json"], fs).stdout,
    ) as { mean: number; tailValue: number };
    const analytic = ((0.1 + 0.6) / 2) * ((300000 + 2500000) / 2); // mean(freq) × mean(mag)
    expect(out.mean).toBeGreaterThan(analytic * 0.95);
    expect(out.mean).toBeLessThan(analytic * 1.05);
    expect(out.tailValue).toBeGreaterThan(out.mean); // right-skew — what a RAG cell erases
  });

  test("drift guard: the reference scoring TSV equals the committed happy-path heredoc", () => {
    const hp = readFileSync(join(MODULES, "14-product-ownership-build-vs-buy/labs/happy-path.sh"), "utf8");
    const heredoc = hp.match(/<<'TSV'\n([\s\S]*?)TSV\n/)![1];
    const grid = createScoringGrid();
    grid.applyReference();
    expect(grid.toTsv()).toBe(heredoc);
  });
});

// ---------------------------------------------------------------------------
describe("module 15 — validate-capstone.sh port", () => {
  const m15 = captures.m15;
  const fs = fsFrom(m15.seed);

  for (const c of m15.cases as CapturedCase[]) {
    test(`validate-capstone ${c.argv.join(" ")} [${c.id}] byte-identical`, () => {
      expectIdentical(validateCapstone(c.argv, fs), c.run, c.id);
    });
  }

  test("happy-path stage lines: each of the 7 stages individually resolved (no silent gaps)", () => {
    const out = validateCapstone(["capstone-manifest.yaml"], fs).stdout;
    for (const stage of ["UNDERSTAND", "LOCATE", "QUERY", "EVALUATE", "EVIDENCE", "MONITOR", "OWN"]) {
      expect(out).toMatch(new RegExp(`^  ${stage} +ok  ->`, "m"));
    }
    expect(out).toContain("before/after ok ->");
  });

  test("reproducibility (happy-path): identical verdict line on two runs", () => {
    const v1 = validateCapstone(["capstone-manifest.yaml"], fs).stdout.trimEnd().split("\n").at(-1);
    const v2 = validateCapstone(["capstone-manifest.yaml"], fs).stdout.trimEnd().split("\n").at(-1);
    expect(v1).toBe(v2);
    expect(v1).toBe("PASS: all 7 loop stages covered; before/after present");
  });

  test("usage (no manifest argument) exits 1 with the script's usage text", () => {
    const got = validateCapstone([], fs);
    expect(got.exit).toBe(1);
    expect(got.stderr).toContain("usage: validate-capstone.sh <capstone-manifest.yaml>");
  });

  test("L2 scope-boundary lock: no-arg path is OUR pinned behavior (exit 1, message on stderr) — not in m15 captures", () => {
    // ISC-137 L2: the no-argument case has no byte-identical bash reference in the m15
    // captures (which always pass a manifest path). The port defines exit 1 with the usage
    // line on stderr and a clean stdout; this test LOCKS that choice so it can't silently
    // drift. The scope note lives at validate-capstone.ts and in web/ISA.md ISC-137.
    const got = validateCapstone([], fs);
    expect(got.exit).toBe(1);
    expect(got.stdout).toBe("");
    expect(got.stderr).toBe("usage: validate-capstone.sh <capstone-manifest.yaml>\n");
    // none of the m15 captured cases exercise the no-arg path — confirming this is unpinned
    // by the fixtures and therefore our own definition.
    expect((m15.cases as CapturedCase[]).some((c) => c.argv.length === 0)).toBe(false);
  });

  test("mapped-but-missing artifact yields the artifact-not-found MISSING variant", () => {
    const manifest = m15.seed["capstone-manifest.yaml"].replace("QUERY:      collect.sh", "QUERY:      gone.sh");
    const world = fsFrom({ ...m15.seed, "capstone-manifest.yaml": manifest });
    const got = validateCapstone(["capstone-manifest.yaml"], world);
    expect(got.exit).toBe(1);
    expect(got.stdout).toContain("  QUERY       MISSING (artifact not found: gone.sh)");
  });

  test("drift guard: capstoneSeedFiles() byte-equal to the real setup.sh output", () => {
    for (const [path, content] of Object.entries(capstoneSeedFiles())) {
      expect(m15.seed[path], path).toBe(content);
    }
  });
});
