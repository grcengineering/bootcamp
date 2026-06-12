/**
 * Builder interaction models (web ISA ISC-80..88) — editable-file workspace, matching/
 * mapping widget, scoring grid + memo (14), CCM scheduler sim (13), capstone assembler (15).
 *
 * The models never duplicate validator logic: every pass/fail below is produced by the
 * SAME ported validators the byte-fidelity suite accepts, run against the model's CURRENT
 * state — so fail-then-pass journeys are genuine.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CAPSTONE_MANIFEST_INCOMPLETE,
  SimFs,
  createCapstoneAssembler,
  createCcmScheduler,
  createScoringGrid,
  createWorkspace,
  evaluateAnalysis,
  lossHistogram,
  mappingModelFromCsv,
  memoArtifact,
  renderMemo,
  seedThirtyOneRowHistory,
  validateCoverage,
  validateCrosswalk,
  validateMemo,
  type MemoParts,
  type ReadonlyFs,
} from "../src/engines/builders";
import { normalizePath, posixBasename, posixDirname, posixJoin, runPort } from "../src/engines/builders/types";

const HERE = dirname(new URL(import.meta.url).pathname);
const captures = JSON.parse(readFileSync(join(HERE, "fixtures/builder-captures.json"), "utf8"));

// ---------------------------------------------------------------------------
describe("shared plumbing", () => {
  test("posix helpers match node:path.posix semantics for lab-shaped paths", () => {
    expect(posixDirname("work/crosswalk.csv")).toBe("work");
    expect(posixDirname("crosswalk.csv")).toBe(".");
    expect(posixDirname("/a")).toBe("/");
    expect(posixDirname("a/b/")).toBe("a");
    expect(posixBasename("lab/state-drifted.json")).toBe("state-drifted.json");
    expect(posixBasename("plain.txt")).toBe("plain.txt");
    expect(posixJoin(".", "spine-families.txt")).toBe("spine-families.txt");
    expect(posixJoin("work", "x.csv")).toBe("work/x.csv");
    expect(normalizePath("evidence/")).toBe("evidence");
    expect(normalizePath("./a//b")).toBe("a/b");
    expect(normalizePath(".")).toBe(".");
    expect(normalizePath("/abs/p")).toBe("/abs/p");
  });

  test("runPort: a body that falls through (no ExitSignal) yields exit 0", () => {
    const r = runPort((io) => io.log("done"));
    expect(r).toEqual({ stdout: "done\n", stderr: "", exit: 0 });
  });

  test("runPort: non-exit errors propagate (never swallowed into a fake verdict)", () => {
    expect(() => runPort(() => { throw new Error("boom"); })).toThrow("boom");
  });

  test("SimFs: write/append/read/exists/list/remove/snapshot behave like the lab dirs", () => {
    const fs = new SimFs();
    fs.write("lab/evidence/ledger.log", "row1\n");
    fs.append("lab/evidence/ledger.log", "row2\n");
    fs.append("lab/evidence/new.txt", "created-by-append\n");
    expect(fs.read("lab/evidence/ledger.log")).toBe("row1\nrow2\n");
    expect(fs.isFile("lab/evidence/new.txt")).toBe(true);
    expect(fs.isDir("lab/evidence")).toBe(true);
    expect(fs.exists("lab/evidence/")).toBe(true); // trailing-slash dir form ([-e evidence/])
    expect(fs.exists("lab/nope")).toBe(false);
    expect(fs.list("lab/evidence")).toEqual(["ledger.log", "new.txt"]);
    expect(fs.list("lab")).toEqual(["evidence"]);
    fs.mkdirp("rootdir");
    fs.write("rootfile.txt", "x");
    expect(fs.list(".")).toContain("rootdir");
    expect(fs.list(".")).toContain("rootfile.txt");
    fs.remove("lab/evidence/new.txt");
    expect(fs.read("lab/evidence/new.txt")).toBeNull();
    expect(fs.snapshot("lab")).toEqual({ "evidence/": "<dir>", "evidence/ledger.log": "row1\nrow2\n" });
    fs.seed({ "seeded/dir/": "<dir>", "seeded/f.txt": "hi" });
    expect(fs.isDir("seeded/dir")).toBe(true);
    expect(fs.read("seeded/f.txt")).toBe("hi");
  });
});

// ---------------------------------------------------------------------------
describe("workspace model (ISC-80/82/83/84 editing surface)", () => {
  const seed = [
    { path: "work/coverage-map.csv", content: captures.m11.seed["coverage-map.csv"] },
    { path: "work/prioritized-threats.txt", content: captures.m11.seed["prioritized-threats.txt"] },
    { path: "work/controls-in-scope.txt", content: captures.m11.seed["controls-in-scope.txt"] },
    { path: "work/validate-coverage.ts", content: captures.m11.seed["validate-coverage.ts"] ?? "// reference", readOnly: true },
  ];

  test("module 11 fail-then-pass is genuine: validator reads the CURRENT workspace state", () => {
    const ws = createWorkspace(seed);
    const argv = ["work/coverage-map.csv", "work/prioritized-threats.txt", "work/controls-in-scope.txt"];

    const before = validateCoverage(argv, ws);
    expect(before.exit).toBe(1);
    expect(before.stderr).toContain("T-1486");
    expect(before.stderr).toContain("CTRL-DLP-AGENT-04");

    // The lab's two resolutions: close the gap, kill the zero-threat control.
    ws.write(
      "work/coverage-map.csv",
      ws.read("work/coverage-map.csv")!.replace(
        "T-1486,Data encrypted for ransom,,",
        "T-1486,Data encrypted for ransom,CTRL-BACKUP-RESTORE-05,detects",
      ),
    );
    ws.write(
      "work/controls-in-scope.txt",
      ws.read("work/controls-in-scope.txt")!
        .split("\n")
        .filter((l) => l !== "CTRL-DLP-AGENT-04")
        .join("\n") + "CTRL-BACKUP-RESTORE-05\n",
    );

    const after = validateCoverage(argv, ws);
    expect(after.exit).toBe(0);
    expect(after.stdout).toContain("PASS: every prioritized threat has a mapped control");
  });

  test("dirty tracking, per-file restore (ISC-117), and full reset", () => {
    const ws = createWorkspace(seed);
    expect(ws.isDirty("work/coverage-map.csv")).toBe(false);
    ws.write("work/coverage-map.csv", "scribble");
    expect(ws.isDirty("work/coverage-map.csv")).toBe(true);
    ws.restoreFile("work/coverage-map.csv");
    expect(ws.read("work/coverage-map.csv")).toBe(captures.m11.seed["coverage-map.csv"]);

    ws.write("work/notes.md", "learner file");
    expect(ws.isDirty("work/notes.md")).toBe(true);
    ws.resetAll();
    expect(ws.exists("work/notes.md")).toBe(false);
    expect(ws.list()).toEqual(seed.map((f) => f.path).sort());
  });

  test("read-only reference files reject edits but allow restore", () => {
    const ws = createWorkspace(seed);
    expect(ws.isReadOnly("work/validate-coverage.ts")).toBe(true);
    expect(() => ws.write("work/validate-coverage.ts", "hacked")).toThrow(/read-only/);
    ws.restoreFile("work/validate-coverage.ts");
  });

  test("remove guards seeded files; restoreFile guards unknown files; isDirty on missing is false", () => {
    const ws = createWorkspace(seed);
    expect(() => ws.remove("work/coverage-map.csv")).toThrow(/seeded file/);
    expect(() => ws.restoreFile("work/unknown.txt")).toThrow(/not a seeded file/);
    expect(ws.isDirty("work/unknown.txt")).toBe(false);
    ws.write("work/tmp.txt", "x");
    ws.remove("work/tmp.txt");
    expect(ws.exists("work/tmp.txt")).toBe(false);
  });

  test("module 00 journey: template → guided edits → evaluate_analysis pass → exported artifact", () => {
    const ws = createWorkspace([
      { path: "lab00/analysis.md", content: "# Legacy-vs-Engineered Analysis\n" },
    ]);
    expect(evaluateAnalysis(ws.read("lab00/analysis.md")!).exit).toBe(1);
    ws.write("lab00/analysis.md", captures.m00.seed["legacy-vs-engineered-laptop-encryption.md"]);
    expect(evaluateAnalysis(ws.read("lab00/analysis.md")!).exit).toBe(0);
    const artifact = ws.exportArtifact("lab00/analysis.md", "00-what-grc-engineering-is");
    expect(artifact.module).toBe("00-what-grc-engineering-is");
    expect(artifact.content).toContain("reality");
    expect(() => ws.exportArtifact("lab00/nope.md", "00")).toThrow(/missing file/);
  });

  test("snapshot/restore round-trips workspace state exactly", () => {
    const ws = createWorkspace(seed);
    ws.write("work/coverage-map.csv", "edited");
    const snap = ws.snapshot();
    const ws2 = createWorkspace(seed);
    ws2.restore(snap);
    expect(ws2.read("work/coverage-map.csv")).toBe("edited");
    expect(ws2.list()).toEqual(ws.list());
  });
});

// ---------------------------------------------------------------------------
describe("matching/mapping widget model (ISC-82/83)", () => {
  const crosswalkCsv = captures.m10.seed["crosswalk.csv"];
  const familiesFs: ReadonlyFs = {
    read: (p) => (p === "families.txt" ? captures.m10.seed["spine-families.txt"] : null),
    exists: (p) => p === "families.txt",
  };

  test("seed CSV round-trips byte-identically through the model", () => {
    const model = mappingModelFromCsv(crosswalkCsv, { leftCols: 2 });
    expect(model.toCsv()).toBe(crosswalkCsv);
  });

  test("module 10 journey: planted orphan fails, learner mapping resolves it, validator passes", () => {
    const model = mappingModelFromCsv(crosswalkCsv, {
      leftCols: 2,
      labels: ["exact", "broader", "narrower", "partial"],
    });
    const fsOver = (csv: string): ReadonlyFs => ({
      read: (p) => (p === "crosswalk.csv" ? csv : familiesFs.read(p)),
      exists: (p) => p === "crosswalk.csv" || familiesFs.exists(p),
    });

    const before = validateCrosswalk(["crosswalk.csv", "families.txt"], fsOver(model.toCsv()));
    expect(before.exit).toBe(1);
    expect(before.stderr).toContain("PCI4 6.3.2");

    const orphanIdx = [...Array(model.rowCount()).keys()].find(
      (i) => model.row(i).left[0] === "PCI4" && model.row(i).left[1] === "6.3.2",
    )!;
    model.setMapping(orphanIdx, "CM-8", "broader"); // the happy-path's canonical resolution
    const after = validateCrosswalk(["crosswalk.csv", "families.txt"], fsOver(model.toCsv()));
    expect(after.exit).toBe(0);
    expect(model.toCsv()).toContain("PCI4,6.3.2,CM-8,broader");
  });

  test("a dishonest label flows through to the validator — the model never blocks it", () => {
    const model = mappingModelFromCsv(crosswalkCsv, { leftCols: 2, labels: ["exact", "broader", "narrower", "partial"] });
    model.setMapping(3, "CM-8", "identical-totally");
    const fs: ReadonlyFs = {
      read: (p) => (p === "crosswalk.csv" ? model.toCsv() : familiesFs.read(p)),
      exists: () => true,
    };
    const run = validateCrosswalk(["crosswalk.csv", "families.txt"], fs);
    expect(run.exit).toBe(1);
    expect(run.stderr).toContain("invalid relationship label");
  });

  test("answer-key scoring gives per-row target/label verdicts (machine-scored, ISC-82)", () => {
    const model = mappingModelFromCsv(crosswalkCsv, { leftCols: 2 });
    model.setMapping(3, "CM-8", "broader");
    const key = [
      { target: "AC-2", label: "broader" },
      { target: "AC-2", label: "exact" },
      { target: "SC-28", label: "partial" },
      { target: "CM-8", label: "broader" },
    ];
    const scores = model.scoreAgainstKey(key);
    expect(scores.every((s) => s.correct)).toBe(true);
    model.setMapping(3, "CM-8", "exact"); // right control, dishonest relationship
    const rescored = model.scoreAgainstKey(key);
    expect(rescored[3]).toEqual({ index: 3, targetOk: true, labelOk: false, correct: false });
  });

  test("addRow/removeRow/reset/snapshot/restore + guards", () => {
    const model = mappingModelFromCsv(crosswalkCsv, { leftCols: 2 });
    model.addRow({ left: ["HIPAA", "164.312"], target: "SC-28", label: "partial" });
    expect(model.rowCount()).toBe(5);
    const snap = model.snapshot();
    model.removeRow(4);
    expect(model.rowCount()).toBe(4);
    model.restore(snap);
    expect(model.rowCount()).toBe(5);
    expect(model.row(4).left).toEqual(["HIPAA", "164.312"]);
    model.reset();
    expect(model.toCsv()).toBe(crosswalkCsv);
    expect(() => model.row(99)).toThrow(/no mapping row/);
    expect(() => model.setMapping(99, "x", "y")).toThrow(/no mapping row/);
    expect(() => model.removeRow(99)).toThrow(/no mapping row/);
    expect(() => mappingModelFromCsv("\n\n", { leftCols: 2 })).toThrow(/empty CSV/);
  });

  test("scoring with a short key marks unkeyed rows incorrect rather than guessing", () => {
    const model = mappingModelFromCsv(crosswalkCsv, { leftCols: 2 });
    const scores = model.scoreAgainstKey([{ target: "AC-2", label: "broader" }]);
    expect(scores[0].correct).toBe(true);
    expect(scores[1]).toEqual({ index: 1, targetOk: false, labelOk: false, correct: false });
  });
});

// ---------------------------------------------------------------------------
describe("scoring grid + decision memo (ISC-86)", () => {
  test("validation failures reuse happy-path.sh wording (diagnostic micro-hints)", () => {
    const grid = createScoringGrid();
    grid.setCall("UNDERSTAND", "BUILD");
    grid.setCall("LOCATE", "OUTSOURCE-EVERYTHING");
    const v = grid.validate();
    expect(v.pass).toBe(false);
    expect(v.failures).toContain("FAIL: stage 'LOCATE' has no valid BUILD/BUY/HYBRID call (got 'OUTSOURCE-EVERYTHING')");
    expect(v.failures).toContain("FAIL: scoring table missing loop stage 'QUERY'");
    expect(v.failures.at(-1)).toBe("FAIL: expected all 7 loop stages scored, got 2");
  });

  test("a fully-scored grid with valid calls passes and emits one row per stage", () => {
    const grid = createScoringGrid();
    grid.applyReference();
    grid.setCall("EVALUATE", "BUILD", "policy is OUR judgment — never outsourced");
    const v = grid.validate();
    expect(v).toEqual({ pass: true, failures: [] });
    expect(grid.call("EVALUATE")).toBe("BUILD");
    expect(grid.rationale("EVALUATE")).toContain("OUR judgment");
    expect(grid.toTsv().trimEnd().split("\n")).toHaveLength(8); // header + 7 stages
    expect(() => grid.setCall("DEPLOY" as never, "BUILD")).toThrow(/unknown loop stage/);
  });

  test("snapshot/restore/reset round-trip", () => {
    const grid = createScoringGrid();
    grid.applyReference();
    grid.setCall("OWN", "BUILD", "the boundary itself");
    const snap = grid.snapshot();
    grid.reset();
    expect(grid.validate().pass).toBe(false);
    grid.restore(snap);
    expect(grid.validate().pass).toBe(true);
    expect(grid.rationale("OWN")).toBe("the boundary itself");
  });

  test("memo: completeness gate + render + artifact shape", () => {
    const grid = createScoringGrid();
    grid.applyReference();
    const parts: MemoParts = {
      productCard: "Customers: auditor, gating engineer. Owner: a.engineer@example.com.",
      exposure: "Mean $493,516/yr; p95 tail $1,133,873/yr (right-skewed — the tail is the argument).",
      scoringTable: grid.toTsv(),
      boundary: "We BUY collection plumbing; we BUILD evaluation — policy is our judgment.",
      recommendation: "HYBRID: buy the platform, own EVALUATE and OWN.",
    };
    expect(validateMemo(parts)).toEqual({ pass: true, missing: [] });
    const memo = renderMemo(parts);
    for (const heading of [
      "## Control as a product",
      "## Quantified loss exposure",
      "## Seven-stage build/buy/hybrid scoring",
      "## The boundary argument",
      "## Recommendation",
    ]) {
      expect(memo).toContain(heading);
    }
    expect(memo).toContain("UNDERSTAND\tWho is this control for / what is our context?\tBUILD");

    const partial = validateMemo({ productCard: "x", boundary: " " });
    expect(partial.pass).toBe(false);
    expect(partial.missing).toEqual(["exposure", "scoringTable", "boundary", "recommendation"]);
    expect(() => renderMemo({ ...parts, recommendation: "" })).toThrow(/memo incomplete/);

    const artifact = memoArtifact(parts);
    expect(artifact.name).toBe("decision-memo.md");
    expect(artifact.module).toBe("14-product-ownership-build-vs-buy");
  });

  test("loss histogram tile derives from the SAME deterministic sample as the validator", () => {
    const input = JSON.parse(captures.m14.seed["risk-input.json"]);
    const h = lossHistogram(input, 40);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(h.mean).toBe(493516); // the captured real-tool mean
    expect(h.tailValue).toBe(1133873); // the captured real-tool p95
    expect(h.tailValue).toBeGreaterThan(h.mean);
    expect(h.maxLoss).toBeCloseTo(0.6 * 2500000);
    expect(h.binWidth).toBeCloseTo(h.maxLoss / 40);
  });
});

// ---------------------------------------------------------------------------
describe("CCM scheduler sim (ISC-85/130/132)", () => {
  const compliant = captures.m13.fixtures["state-compliant.json"];

  test("scheduled compliant runs: PASS evidence, no alert, ledger grows one row per tick", () => {
    const sched = createCcmScheduler({ seedStateJson: compliant, startIso: "2026-05-20T09:00:00Z", intervalHours: 24 });
    expect(sched.dashboardTile().current).toBe("NO-DATA");
    const t1 = sched.tick();
    expect(t1.rc).toBe(0);
    expect(t1.capturedAt).toBe("2026-05-20T09:00:00Z");
    expect(t1.alertPath).toBeNull();
    const t2 = sched.tick();
    expect(t2.capturedAt).toBe("2026-05-21T09:00:00Z"); // declared compression: 1 tick = 24h
    expect(sched.ledger()).toHaveLength(2);
    expect(sched.fs.list(sched.evidenceDir).filter((f) => f.startsWith("alert-"))).toHaveLength(0);
  });

  test("ledger rows carry the REAL library's byte format (verdict line included)", () => {
    const sched = createCcmScheduler({ seedStateJson: compliant, startIso: "2026-05-20T09:00:00Z" });
    sched.tick();
    const raw = sched.fs.read(`${sched.evidenceDir}/ledger.log`)!;
    expect(raw).toBe(
      "2026-05-20T09:00:00Z run-20260520090000 rc=0 PASS control=CC6.1-s3-public-access-block evaluated=3 noncompliant=0\n",
    );
  });

  test("drift injection is genuinely evaluated: alert fires naming the drifted bucket", () => {
    const sched = createCcmScheduler({ seedStateJson: compliant, startIso: "2026-05-20T09:00:00Z" });
    sched.tick();
    sched.injectDrift("acme-public-website");
    const drifted = sched.tick();
    expect(drifted.rc).toBe(1);
    expect(drifted.alertPath).not.toBeNull();
    expect(sched.fs.read(drifted.alertPath!)).toContain("drifted_resource=acme-public-website");
    // remediation clears it on the next scheduled run
    sched.remediate("acme-public-website");
    expect(sched.tick().rc).toBe(0);
    expect(sched.buckets().find((b) => b.name === "acme-public-website")?.block_public_acls).toBe(true);
  });

  test("partial drift: flipping a single flag still fails the four-flag control", () => {
    const sched = createCcmScheduler({ seedStateJson: compliant, startIso: "2026-05-20T09:00:00Z" });
    sched.injectDrift("acme-audit-logs", { restrict_public_buckets: false });
    const t = sched.tick();
    expect(t.rc).toBe(1);
    expect(sched.fs.read(t.alertPath!)).toContain("drifted_resource=acme-audit-logs");
  });

  test("zero-resource snapshot FAILS CLOSED through the whole loop (rc 2, ERROR tile)", () => {
    const sched = createCcmScheduler({ seedStateJson: compliant, startIso: "2026-05-20T09:00:00Z" });
    sched.emptySnapshot();
    const t = sched.tick();
    expect(t.rc).toBe(2);
    expect(sched.fs.read(t.alertPath!)).toContain("drifted_resource=<none — evaluated 0 resources");
    expect(sched.dashboardTile().current).toBe("ERROR");
  });

  test("31-row dashboard substrate: 30 green + 1 drift, tile reads current FAIL + history", () => {
    const sched = seedThirtyOneRowHistory(compliant, "2026-05-01T09:00:00Z", "acme-public-website");
    const ledger = sched.ledger();
    expect(ledger).toHaveLength(31);
    expect(ledger.filter((e) => e.rc === 0)).toHaveLength(30);
    expect(ledger.filter((e) => e.rc === 1)).toHaveLength(1);
    expect(ledger.at(-1)!.rc).toBe(1);

    const tile = sched.dashboardTile(30);
    expect(tile.control).toBe("CC6.1-s3-public-access-block");
    expect(tile.current).toBe("FAIL");
    expect(tile.lastCheckedAt).toBe(ledger.at(-1)!.capturedAt);
    expect(tile.history).toHaveLength(31); // 30-day window inclusive of both endpoints
    expect(tile.greenRuns).toBe(30);
    expect(tile.redRuns).toBe(1);
    expect(tile.openAlerts).toHaveLength(1);
    expect(tile.timeCompression).toContain("1 tick = 24h");
  });

  test("dashboard window actually windows: old rows age out of the tile", () => {
    const sched = createCcmScheduler({ seedStateJson: compliant, startIso: "2026-05-01T09:00:00Z", intervalHours: 24 });
    sched.run(10);
    const tile = sched.dashboardTile(5);
    expect(tile.history).toHaveLength(6); // last 5 days inclusive
    expect(sched.ledger()).toHaveLength(10);
  });

  test("guards: unknown bucket, bad startIso, unparseable ledger row", () => {
    const sched = createCcmScheduler({ seedStateJson: compliant, startIso: "2026-05-01T09:00:00Z" });
    expect(() => sched.injectDrift("nope")).toThrow(/no such bucket/);
    expect(() => sched.remediate("nope")).toThrow(/no such bucket/);
    expect(() => createCcmScheduler({ seedStateJson: compliant, startIso: "yesterday-ish" })).toThrow(/invalid startIso/);
    sched.fs.append(`${sched.evidenceDir}/ledger.log`, "corrupted row\n");
    expect(() => sched.ledger()).toThrow(/unparseable ledger row/);
  });
});

// ---------------------------------------------------------------------------
describe("capstone assembler (ISC-87/131)", () => {
  test("fresh seed repo passes the 8-point contract checklist (validator-derived)", () => {
    const asm = createCapstoneAssembler();
    const points = asm.checklist();
    expect(points).toHaveLength(8);
    expect(points.every((p) => p.ok)).toBe(true);
    expect(points.find((p) => p.id === "EVALUATE")?.detail).toBe("policy/public_access.rego");
    expect(points.find((p) => p.id === "BEFORE_AFTER")?.detail).toBe("before-after.md");
    expect(asm.readyToShip()).toBe(true);
  });

  test("the incomplete manifest fixture flips exactly MONITOR + before/after to gaps", () => {
    const asm = createCapstoneAssembler();
    asm.editManifest(CAPSTONE_MANIFEST_INCOMPLETE);
    const points = asm.checklist();
    const bad = points.filter((p) => !p.ok).map((p) => p.id);
    expect(bad).toEqual(["MONITOR", "BEFORE_AFTER"]);
    expect(points.find((p) => p.id === "MONITOR")?.detail).toBe("no artifact mapped");
    expect(asm.readyToShip()).toBe(false);
  });

  test("validator invocation history records exit codes across attempts (gate the lab tracks)", () => {
    const asm = createCapstoneAssembler();
    asm.editManifest(CAPSTONE_MANIFEST_INCOMPLETE);
    expect(asm.validate().exit).toBe(1);
    asm.editManifest(captures.m15.seed["capstone-manifest.yaml"]);
    expect(asm.validate().exit).toBe(0);
    expect(asm.validationHistory().map((r) => r.exit)).toEqual([1, 0]);
    expect(asm.validationHistory().map((r) => r.seq)).toEqual([1, 2]);
  });

  test("binds the module-00 one-pager as the BEFORE half of the program-long diff", () => {
    const asm = createCapstoneAssembler();
    const onePager = {
      name: "lab00/legacy-vs-engineered-laptop-encryption.md",
      content: captures.m00.seed["legacy-vs-engineered-laptop-encryption.md"],
      module: "00-what-grc-engineering-is",
    };
    const path = asm.bindBeforeArtifact(onePager);
    expect(path).toBe("before/legacy-vs-engineered-laptop-encryption.md");
    expect(asm.readFile(path)).toBe(onePager.content);

    const { before, after } = asm.beforeAfter();
    expect(before?.module).toBe("00-what-grc-engineering-is");
    expect(evaluateAnalysis(before!.content).exit).toBe(0); // still a conforming analysis
    expect(after).toContain("# Before / After");
  });

  test("binds prior-module artifacts into stage slots and the portfolio view", () => {
    const asm = createCapstoneAssembler();
    asm.bindArtifact("EVALUATE", "policy/public_access.rego", {
      name: "policy.rego",
      content: "package capstone.public_access\n\ndefault allow := false\n\nallow if { count(deny) == 0 }\n",
      module: "09-policy-as-code",
    });
    asm.bindArtifact("portfolio", "evidence/run-20260520090000.evidence", {
      name: "run-20260520090000.evidence",
      content: "control_id=CC6.1-s3-public-access-block\nexit_code=0\n",
      module: "13-continuous-controls-monitoring",
    });
    expect(asm.readFile("policy/public_access.rego")).toContain("allow if");
    const portfolio = asm.portfolio();
    expect(portfolio.map((b) => b.module)).toEqual(["09-policy-as-code", "13-continuous-controls-monitoring"]);
    expect(asm.readyToShip()).toBe(true); // bound artifacts keep all 8 points green
    expect(() => asm.bindArtifact("DEPLOY" as never, "x", { name: "x", content: "", module: "x" })).toThrow(
      /unknown checklist slot/,
    );
  });

  test("a learner who deletes a mapped artifact path sees the exact MISSING gap", () => {
    const asm = createCapstoneAssembler();
    asm.editManifest(asm.manifest().replace("QUERY:      collect.sh", "QUERY:      scripts/collect.sh"));
    const q = asm.checklist().find((p) => p.id === "QUERY")!;
    expect(q.ok).toBe(false);
    expect(q.detail).toBe("artifact not found: scripts/collect.sh");
    asm.writeFile("scripts/collect.sh", "#!/usr/bin/env bash\necho '{\"buckets\":[]}'\n");
    expect(asm.checklist().find((p) => p.id === "QUERY")!.ok).toBe(true);
  });

  test("snapshot/restore round-trips repo, bindings, and history", () => {
    const asm = createCapstoneAssembler();
    asm.bindBeforeArtifact({ name: "one-pager.md", content: "x", module: "00" });
    asm.validate();
    const snap = asm.snapshot();

    const asm2 = createCapstoneAssembler();
    asm2.restore(snap);
    expect(asm2.readFile("before/one-pager.md")).toBe("x");
    expect(asm2.validationHistory()).toHaveLength(1);
    expect(asm2.portfolio()).toHaveLength(1);
    expect(asm2.readyToShip()).toBe(true);
  });
});
