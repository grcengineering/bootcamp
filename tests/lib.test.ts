// Meaningful tests for the curriculum tooling's pure logic. Each test asserts an observable
// outcome that maps to a real CI behavior — no coverage padding.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import {
  parseMetaYaml,
  readSections,
  supplementalStart,
  extractUrls,
  lintAnatomy,
  lintOriginality,
  lintStyle,
  objectivesBlock,
  countObjectives,
  rotStatus,
  readBannedVerbs,
  listModules,
  red,
  green,
  yellow,
  REPO_ROOT,
  MODULES_DIR,
} from "../.ci/lib.ts";

describe("color helpers", () => {
  test("wrap text in ANSI color codes and reset", () => {
    expect(red("x")).toBe("\x1b[31mx\x1b[0m");
    expect(green("x")).toBe("\x1b[32mx\x1b[0m");
    expect(yellow("x")).toBe("\x1b[33mx\x1b[0m");
  });
});

describe("parseMetaYaml", () => {
  test("parses scalars, dates, quoted strings", () => {
    const m = parseMetaYaml(`module: 01-x\nowner: "Justin Pagano"\nreview_due: 2027-05-28`);
    expect(m.module).toBe("01-x");
    expect(m.owner).toBe("Justin Pagano");
    expect(m.review_due).toBe("2027-05-28");
  });
  test("parses inline arrays", () => {
    const m = parseMetaYaml(`objectives: [O1, O2, O3]`);
    expect(m.objectives).toEqual(["O1", "O2", "O3"]);
  });
  test("strips inline comments but keeps values", () => {
    const m = parseMetaYaml(`volatility: A   # fundamentals barely change`);
    expect(m.volatility).toBe("A");
  });
  test("ignores blank lines and full-line comments", () => {
    const m = parseMetaYaml(`# header comment\n\nstatus: published\n`);
    expect(m.status).toBe("published");
    expect(Object.keys(m)).toEqual(["status"]);
  });
  test("ignores non key:value lines", () => {
    expect(parseMetaYaml(`not a pair line`)).toEqual({});
  });
});

describe("readSections", () => {
  test("extracts numbered section headings in order", () => {
    const secs = readSections(`## 1. Learning Objectives\ntext\n## 2. Why this matters for GRC`);
    expect(secs.map((s) => s.num)).toEqual([1, 2]);
    expect(secs[0].title).toBe("Learning Objectives");
  });
  test("ignores non-numbered headings", () => {
    expect(readSections(`## Overview\n### 1. nope`)).toEqual([]);
  });
});

describe("supplementalStart / extractUrls", () => {
  const md = `## 7. Assessment\nno urls here\n## 8. Supplemental Learning Material\nhttps://example.com/a and https://example.org/b.`;
  test("finds §8 boundary", () => {
    expect(supplementalStart(md)).toBeGreaterThan(0);
  });
  test("returns -1 when §8 absent", () => {
    expect(supplementalStart(`## 1. Learning Objectives`)).toBe(-1);
  });
  test("extracts urls, trimming trailing punctuation", () => {
    expect(extractUrls("see https://example.com/a.")).toEqual(["https://example.com/a"]);
  });
  test("returns empty array when no urls", () => {
    expect(extractUrls("no links at all")).toEqual([]);
  });
});

describe("lintAnatomy", () => {
  const goodMd = Object.keys({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 })
    .map((n) => `## ${n}. Section ${n}`)
    .join("\n");
  const goodMeta = {
    module: "01-x",
    owner: "Justin Pagano",
    volatility: "A",
    last_reviewed: "2026-05-28",
    review_due: "2027-05-28",
    status: "published",
    objectives: ["O1"],
  };
  test("passes a complete module", () => {
    expect(lintAnatomy({ md: goodMd, meta: goodMeta, hasLabs: true, hasAssessment: true })).toEqual([]);
  });
  test("flags missing sections", () => {
    const problems = lintAnatomy({ md: `## 1. x`, meta: goodMeta, hasLabs: true, hasAssessment: true });
    expect(problems.some((p) => p.includes("§8"))).toBe(true);
  });
  test("flags missing meta.yaml", () => {
    const problems = lintAnatomy({ md: goodMd, meta: null, hasLabs: true, hasAssessment: true });
    expect(problems).toContain("missing meta.yaml");
  });
  test("flags TBD owner and missing keys", () => {
    const problems = lintAnatomy({
      md: goodMd,
      meta: { ...goodMeta, owner: "TBD-at-approval", objectives: [] },
      hasLabs: true,
      hasAssessment: true,
    });
    expect(problems.some((p) => p.includes("owner is still TBD"))).toBe(true);
    expect(problems.some((p) => p.includes("objectives"))).toBe(true);
  });
  test("flags missing labs/ and assessment/", () => {
    const problems = lintAnatomy({ md: goodMd, meta: goodMeta, hasLabs: false, hasAssessment: false });
    expect(problems).toContain("missing labs/");
    expect(problems).toContain("missing assessment/");
  });
});

describe("lintOriginality", () => {
  test("passes when urls only in §8", () => {
    const md = `## 1. Learning Objectives\nclean\n## 8. Supplemental Learning Material\nhttps://example.com`;
    expect(lintOriginality(md)).toEqual([]);
  });
  test("flags a url before §8", () => {
    const md = `## 1. Learning Objectives\nsee https://sneaky.example\n## 8. Supplemental Learning Material\n`;
    expect(lintOriginality(md).some((p) => p.includes("outside §8"))).toBe(true);
  });
  test("flags absence of §8 entirely", () => {
    expect(lintOriginality(`## 1. Learning Objectives`).some((p) => p.includes("no '## 8."))).toBe(true);
  });
});

describe("lintStyle / objectivesBlock / countObjectives", () => {
  const good = `## 1. Learning Objectives\n\n1. **Explain** the thing.\n2. **Produce** an artifact.\n\n## 2. Why this matters for GRC`;
  test("passes measurable bold verbs", () => {
    expect(lintStyle(good)).toEqual([]);
    expect(countObjectives(good)).toBe(2);
  });
  test("flags a banned lead verb", () => {
    const bad = `## 1. Learning Objectives\n\n1. **Understand** the thing.\n\n## 2. x`;
    expect(lintStyle(bad).some((p) => p.includes("unmeasurable objective verb"))).toBe(true);
  });
  test("flags a banned multiword phrase", () => {
    const bad = `## 1. Learning Objectives\n\n1. **Note**: you should be familiar with shells.\n\n## 2. x`;
    expect(lintStyle(bad).some((p) => p.includes("be familiar with"))).toBe(true);
  });
  test("flags an objective with no bold lead verb", () => {
    const bad = `## 1. Learning Objectives\n\n1. just do the thing.\n\n## 2. x`;
    expect(lintStyle(bad).some((p) => p.includes("no bold lead verb"))).toBe(true);
  });
  test("flags missing objectives block", () => {
    expect(lintStyle(`## 2. Why`).some((p) => p.includes("could not locate"))).toBe(true);
    expect(objectivesBlock(`## 2. Why`)).toBe("");
  });
});

describe("rotStatus", () => {
  const asOf = new Date("2026-05-28T00:00:00Z");
  test("green when far out", () => {
    expect(rotStatus("2027-05-28", asOf).emoji).toBe("🟢");
  });
  test("amber when due within 30d", () => {
    expect(rotStatus("2026-06-10", asOf).emoji).toBe("🟡");
  });
  test("red when overdue", () => {
    expect(rotStatus("2026-05-01", asOf).emoji).toBe("🔴");
  });
  test("unknown when missing or unparseable", () => {
    expect(rotStatus(undefined, asOf).emoji).toBe("⚪");
    expect(rotStatus("not-a-date", asOf).emoji).toBe("⚪");
  });
});

describe("readBannedVerbs", () => {
  test("falls back to defaults when file missing", () => {
    const verbs = readBannedVerbs(join(REPO_ROOT, "nope-does-not-exist.txt"));
    expect(verbs).toContain("understand");
  });
  test("reads the real banned-verbs file if present", () => {
    const p = join(REPO_ROOT, "style", "banned-verbs.txt");
    if (existsSync(p)) expect(readBannedVerbs(p).length).toBeGreaterThan(0);
  });
});

describe("listModules + real Module 01 conformance", () => {
  test("returns [] for a missing dir", () => {
    expect(listModules(join(REPO_ROOT, "no-such-modules-dir"))).toEqual([]);
  });
  test("finds the migrated Module 01 and it passes all gates", () => {
    const mods = listModules(MODULES_DIR);
    const m01 = mods.find((m) => m.id.startsWith("01-"));
    expect(m01).toBeDefined();
    const md = readFileSync(m01!.moduleMd, "utf8");
    const meta = parseMetaYaml(readFileSync(m01!.metaYaml, "utf8"));
    expect(lintOriginality(md)).toEqual([]);
    expect(lintStyle(md)).toEqual([]);
    expect(
      lintAnatomy({ md, meta, hasLabs: true, hasAssessment: true })
    ).toEqual([]);
  });
});
