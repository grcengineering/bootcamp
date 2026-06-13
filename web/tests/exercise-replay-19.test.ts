/**
 * Golden/anti-transcript replay gate for the module-19 api-paradigms exercise (root ISA ISC-73) —
 * the contract/wire `visual` (PEEL/Diff/build-and-break) counterpart of exercise-replay-16.test.ts.
 *
 * Transcript grammar (one JSON object per line; `input` is the learner's surface ACTION):
 *   { "panel": <panelId>, "select": <regionNodeId>, "read"?: <value>, "decode"?: <liveDecode> }
 * which maps 1:1 onto what the visual surface lets a learner do: switch panel, select a node
 * (revealing the oracle's real decode), read off a field value, and produce a LIVE decode
 * (base64url/protobuf-byte/recomputed-digest walk) that may independently disagree with the oracle.
 *
 * Verification mirrors the Lab Player (sticky, ordered, first-failure stops). The probe surfaces
 * are the SAME the player builds: ctx.parseTree (active panel's parse tree, from the contract/wire
 * oracle), ctx.visual (the just-performed select/read/decode), and ctx.validatorRun (the gqlsim
 * limiter's real verdict, for the build-and-break gate).
 *
 *   - golden.jsonl must leave EVERY action task recorded (pass)
 *   - each anti-*.jsonl must leave its targeted task unrecorded, failing at its named fails_check
 *
 * Honesty cross-check: panels are built from the committed REAL api artifacts via the SAME
 * lib/api-seed normalizer sync-content uses, and the protobuf decode is fidelity-checked against
 * protobuf.dev's verified byte examples in pbwire-fidelity.test.ts. The parser/decoder/transform
 * over the real artifact IS the oracle.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse } from "yaml";
import { VisualHost } from "../src/components/lab/sessions/visual-host";
import { buildApiVisualOptions, type ApiFixture } from "../src/lib/api-seed";
import { ExerciseSpecSchema, type ExerciseSpec } from "../src/lib/exercise-spec";
import { runCheck, type AnyCheckParams, type VerifyContext, type VerifyOutcome } from "../src/verifiers/registry";
import { assertAntiDiscriminates } from "./_anti-discriminate";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const MODULE_DIR = join(ROOT, "modules/19-it-api-paradigms");
const TRANSCRIPTS = join(MODULE_DIR, "exercises/transcripts");
const API = join(ROOT, ".ci/fixtures/assets/api");
const CONTRACT_FILES = ["users.openapi.json", "users.wsdl", "users.graphql", "users.proto"];

const spec: ExerciseSpec = ExerciseSpecSchema.parse(
  parse(readFileSync(join(MODULE_DIR, "exercises/exercise.yaml"), "utf8")),
);

function loadContracts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of CONTRACT_FILES) out[f] = readFileSync(join(API, f), "utf8");
  return out;
}

function loadApiFixture(name: string): ApiFixture {
  return JSON.parse(readFileSync(join(API, name), "utf8")) as ApiFixture;
}

function newHost(): VisualHost {
  if (!spec.visual) throw new Error("lab-19 must declare a visual: block");
  const fromFile = spec.visual.artifact.from.replace(/^assets\/api\//, "").replace(/^assets\//, "");
  const primary = loadApiFixture(fromFile);
  return new VisualHost(buildApiVisualOptions(spec.visual.mode, spec.visual.oracle, primary, loadContracts()));
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

/** The VerifyContext the player builds for the api visual surface. */
function ctxFor(host: VisualHost, taskId: string, i: number): VerifyContext {
  return {
    expectations: loadExpectations(),
    expectationKey: `${taskId}:${i}`,
    parseTree: host.parseTree(),
    visual: host.visualAction(),
    trace: host.traceProbe(),
    map: host.mapProbe(),
    validatorRun: host.validatorRun(),
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

describe("module 19 exercise replay (api-paradigms contract/wire visual engine)", () => {
  test("the exercise uses the visual engine over the four-paradigm diff fixture (pbwire oracle)", () => {
    expect(spec.engine).toBe("visual");
    expect(spec.visual?.oracle).toBe("pbwire");
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

  test("the golden replay read the gRPC mfa_enabled byte off the real protobuf (0x10 0x00 = false)", () => {
    const { host } = replay(join(TRANSCRIPTS, "golden.jsonl"));
    const clean = host.panel("grpc-clean")!.tree;
    expect(clean.region("body.grpc.message.f1_2.f2_2")!.value).toContain("false");
    expect(clean.region("body.grpc.message.f1_2.f2_2")!.value).toContain("0x10");
  });

  test("expectations.json documentation keys equal what the oracles decode (ISC-60 spirit)", () => {
    const exp = JSON.parse(readFileSync(join(TRANSCRIPTS, "expectations.json"), "utf8")) as Record<string, string>;
    const host = newHost();
    expect(exp["_oas_mfa_type"]).toBe(host.panel("contract-oas")!.tree.region("oas.components.schemas.User.properties.mfa_enabled")!.value);
    expect(exp["_wsdl_signedparts"]).toBe(host.panel("contract-wsdl")!.tree.region("wsdl.binding.policy.SignedParts")!.value);
    expect(exp["_sdl_mfa_type"]).toBe(host.panel("contract-sdl")!.tree.region("sdl.type.User.field.mfaEnabled")!.value);
    expect(exp["_proto_mfa_tag"]).toBe(host.panel("contract-proto")!.tree.region("proto.message.User.field.mfa_enabled")!.value);
    expect(exp["_soap_digest_clean"]).toBe(host.panel("soap-clean")!.tree.region("soap.recomputed-digest")!.value);
    expect(exp["_soap_digest_broken_recomputed"]).toBe(host.panel("soap-broken")!.tree.region("soap.recomputed-digest")!.value);
    expect(exp["_grpc_path_broken"]).toBe(host.panel("grpc-broken")!.tree.region("req._path")!.value);
  });

  for (const anti of readdirSync(TRANSCRIPTS).filter((f) => f.startsWith("anti-"))) {
    test(`${anti} fails its targeted task at the named check`, () => {
      const { header, state, host } = replay(join(TRANSCRIPTS, anti));
      expect(header?.anti_for).toBeTruthy();
      const target = spec.tasks.find((t) => t.id === header!.anti_for);
      expect(target).toBeDefined();
      expect(state.recorded.has(header!.anti_for!)).toBe(false);
      expect(state.gaps[header!.anti_for!] ?? "").not.toBe("");
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
