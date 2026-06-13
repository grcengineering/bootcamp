/**
 * Golden/anti-transcript replay gate for the module-18 web-application-architecture exercise
 * (root ISA ISC-73) — the HTTP-header `visual` (PEEL/Diff) counterpart of exercise-replay-16.test.ts.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "panel": <panelId>, "select": <regionNodeId>, "read"?: <value>, "decode"?: <liveDecode> }
 * which maps 1:1 onto what the visual surface lets a learner do: switch panel, select a region
 * (revealing the oracle's real decode), read off a field value, and produce a LIVE decode
 * (base64url claim walk) that may independently disagree with the oracle.
 *
 * Verification mirrors the Lab Player exactly (LabPlayer.verifyTasks): after EVERY input, tasks
 * are evaluated in spec order with sticky completion records, stopping at the first unrecorded
 * failure. The probe surfaces are the SAME the player builds — ctx.parseTree (active panel's
 * hdr/jwt parse tree) + ctx.visual (the just-performed select/read/decode).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: the panels are built from the committed REAL header/token fixture by parsing
 * each header value through the `hdr` oracle (RFC 7239 Forwarded / RFC 6265 Set-Cookie / RFC 9111
 * Cache-Control) and the real JWT through the `jwt` oracle (RFC 7519 / RFC 8725) — the same parsers
 * the browser surface uses. The parser's parse tree over the real header/token bytes IS the oracle;
 * the discriminating field in each pair is its computed divergence, never a stored answer.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost, type VisualHostOptions } from "../src/components/lab/sessions/visual-host";
import { parseForwarded, parseSetCookie, parseCacheControl } from "../src/engines/visual/hdr";
import { buildJwtProbe } from "../src/engines/visual/jwt";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/18-web-application-architecture");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const FIXTURE = join(ROOT, ".ci/fixtures/assets/web/diff-the-trace.json");

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

interface WebPair {
  id: string;
  oracle: "forwarded" | "set-cookie" | "cache-control" | "jwt";
  clean: { label: string; header?: string; age?: string; token_ref?: string };
  broken: { label: string; header?: string; age?: string; token_ref?: string };
}
interface WebFixture {
  id: string;
  tokens: Record<string, string>;
  pairs: WebPair[];
}

function loadFixture(): WebFixture {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as WebFixture;
}

/** Parse one clean/broken leg into its hdr/jwt parse tree (the panel's real oracle). */
function legTree(
  oracle: WebPair["oracle"],
  leg: { header?: string; age?: string; token_ref?: string },
  tokens: Record<string, string>,
) {
  switch (oracle) {
    case "forwarded":
      return parseForwarded(leg.header!);
    case "set-cookie":
      return parseSetCookie(leg.header!);
    case "cache-control":
      return parseCacheControl(leg.header!, leg.age);
    case "jwt":
      return buildJwtProbe(tokens[leg.token_ref!]);
  }
}

/** Build the VisualHost panels (one per fixture leg) the SAME way sync-content would for `hdr`. */
function newHost(): VisualHost {
  if (!spec.visual) throw new Error("lab-18 must declare a visual: block");
  const fx = loadFixture();
  const panels: VisualHostOptions["panels"] = [];
  for (const pair of fx.pairs) {
    panels.push({ id: `${pair.id}-clean`, label: `${pair.id} · clean: ${pair.clean.label}`, tree: legTree(pair.oracle, pair.clean, fx.tokens) });
    panels.push({ id: `${pair.id}-broken`, label: `${pair.id} · broken: ${pair.broken.label}`, tree: legTree(pair.oracle, pair.broken, fx.tokens) });
  }
  return new VisualHost({ mode: spec.visual.mode, oracle: spec.visual.oracle, panels });
}

interface VisualAction {
  panel?: string;
  select?: string;
  read?: string;
  decode?: string;
}

/** One learner surface action (the grammar in the file header). */
function replayInput(host: VisualHost, input: VisualAction): void {
  if (input.panel) host.setActivePanel(input.panel);
  if (input.select) host.select(input.panel ?? host.snapshot().activePanel ?? "", input.select);
  if (input.read !== undefined) host.setValue(input.read);
  if (input.decode !== undefined) host.setDecode(input.decode);
}

/** The VerifyContext the player builds for the visual surface. */
function ctxFor(host: VisualHost, taskId: string, i: number): VerifyContext {
  return {
    expectations: loadExpectations(),
    expectationKey: `${taskId}:${i}`,
    parseTree: host.parseTree(),
    visual: host.visualAction(),
    trace: host.traceProbe(),
    map: host.mapProbe(),
  };
}

function loadExpectations(): Record<string, string> {
  const raw = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

interface ReplayState {
  recorded: Set<string>;
  gaps: Record<string, string>;
}

/** LabPlayer.verifyTasks semantics: ordered, sticky, first-failure stops the sweep. */
function verifySweep(host: VisualHost, state: ReplayState): void {
  for (const task of spec.tasks) {
    if (state.recorded.has(task.id)) continue;
    if (task.type === "reflection") break; // reflections gate by saving, not by checks
    let failed: string | null = null;
    for (let i = 0; i < task.verify.length; i++) {
      const out = runCheck(host.probeSession(), task.verify[i] as AnyCheckParams, ctxFor(host, task.id, i));
      if (!out.pass) {
        failed = out.gap;
        break;
      }
    }
    if (failed !== null) {
      state.gaps[task.id] = failed;
      break;
    }
    state.recorded.add(task.id);
  }
}

function loadTranscript(path: string): { header: { anti_for?: string; fails_check?: number; reason?: string } | null; inputs: VisualAction[] } {
  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = lines[0]?.anti_for ? lines[0] : null;
  return { header, inputs: lines.filter((l) => l.input !== undefined).map((l) => l.input as VisualAction) };
}

function replay(path: string): { header: { anti_for?: string; fails_check?: number } | null; state: ReplayState; host: VisualHost } {
  const host = newHost();
  const { header, inputs } = loadTranscript(path);
  const state: ReplayState = { recorded: new Set(), gaps: {} };
  for (const input of inputs) {
    replayInput(host, input);
    verifySweep(host, state);
  }
  return { header, state, host };
}

/** Per-index outcomes for one task against the CURRENT host state (H1 discrimination). */
function outcomesFor(host: VisualHost, taskId: string): VerifyOutcome[] {
  const task = spec.tasks.find((t) => t.id === taskId)!;
  return task.verify.map((chk, i) => {
    try {
      return runCheck(host.probeSession(), chk as AnyCheckParams, ctxFor(host, taskId, i));
    } catch (e) {
      return { pass: false, evidence: "", gap: String(e) };
    }
  });
}

describe("module 18 exercise replay (web-application-architecture HTTP-header visual engine)", () => {
  test("the exercise uses the visual engine over the header diff-the-trace fixture (hdr oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("hdr");
    expect(spec.visual?.mode).toBe("diff-the-trace");
  });

  test("golden transcript satisfies every action task", () => {
    const { state } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    for (const task of spec.tasks) {
      if (task.type !== "action") continue;
      const verdict = state.recorded.has(task.id) ? "pass" : (state.gaps[task.id] ?? "never evaluated");
      expect(`${task.id}: ${verdict}`).toBe(`${task.id}: pass`);
    }
  });

  test("the golden replay read the alg:none break off the real broken token", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    // after the last action, the active panel is the broken token; its alg decodes to none
    const tree = host.panel("pair-d-token-broken")!.tree;
    expect(tree.region("jwt.header.alg")!.value).toBe("none");
  });

  test("expectations.json documentation keys equal what the oracles decode (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    const fwdClean = host.panel("pair-a-provenance-clean")!.tree;
    expect(exp["_clean_forwarded_proto"]).toBe(fwdClean.region("fwd.el0.proto")!.value);
    expect(exp["_clean_forwarded_for"]).toBe(fwdClean.region("fwd.el0.for")!.value);
    const cookieClean = host.panel("pair-b-session-clean")!.tree;
    expect(exp["_clean_cookie_secure"]).toBe(cookieClean.region("cookie.av.secure")!.value);
    const jwtClean = host.panel("pair-d-token-clean")!.tree;
    expect(exp["_clean_jwt_alg"]).toBe(jwtClean.region("jwt.header.alg")!.value);
    expect(exp["_clean_jwt_iss"]).toBe(jwtClean.region("jwt.payload.iss")!.value);
    const fwdBroken = host.panel("pair-a-provenance-broken")!.tree;
    expect(exp["_broken_forwarded_for"]).toBe(fwdBroken.region("fwd.el0.for")!.value);
    const cookieBroken = host.panel("pair-b-session-broken")!.tree;
    expect(exp["_broken_cookie_safety"]).toBe(cookieBroken.region("cookie.safety")!.value);
    const cacheBroken = host.panel("pair-c-caching-broken")!.tree;
    expect(exp["_broken_cache_age"]).toBe(cacheBroken.region("cache.age")!.value);
    const jwtBroken = host.panel("pair-d-token-broken")!.tree;
    expect(exp["_broken_jwt_alg"]).toBe(jwtBroken.region("jwt.header.alg")!.value);
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, () => {
      const { header, state, host } = replay(join(TRANSCRIPTS, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = spec.tasks.find((t) => t.id === header!.anti_for);
      expect(target).toBeDefined();
      expect(state.recorded.has(header!.anti_for!)).toBe(false);
      expect(state.gaps[header!.anti_for!] ?? "").not.toBe("");
      // H1 discrimination: the named cheat (verify[fails_check]) is what failed, and (sticky
      // Lab-Player semantics) every action task before the target is recorded.
      assertAntiDiscriminates({
        anti,
        header,
        tasks: spec.tasks.map((t) => ({ id: t.id, type: t.type, verifyLength: t.verify?.length ?? 0 })),
        targetOutcomes: outcomesFor(host, header!.anti_for!),
        targetCompleted: state.recorded.has(header!.anti_for!),
        priorActionMode: "sticky",
        isCompleted: (id) => state.recorded.has(id),
      });
    });
  }
});
