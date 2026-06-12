/**
 * Lab-surface session layer tests (web ISA Wave 2 engine dispatch — Lab Player side):
 * sessions/types helpers, the api exchange observer (REAL shell engine + mock vendor),
 * the git terminal session (REAL shell engine + isomorphic-git adapter), the console
 * host, and the builder host (REAL ported validators). Mutation-style negative cases
 * throughout — observers that merely accept are theater.
 */
import { describe, expect, test } from "bun:test";
import { createShellEngine } from "../src/engines/shell";
import type { ShellSession, ShellSessionOptions } from "../src/engines/shell/types";
import { GitEngineAdapter } from "../src/engines/git";
import type { EngineAdapter, EngineRunResult } from "../src/engines/adapters";
import {
  eventText,
  isThenable,
  seedToFileMap,
  type LabExecResult,
} from "../src/components/lab/sessions/types";
import {
  ApiLabSession,
  firstSegment,
  isCompoundLine,
  parseCurlLine,
  splitIncludeOutput,
} from "../src/components/lab/sessions/api-exchange";
import { GitTerminalSession, type GitSessionSnapshot } from "../src/components/lab/sessions/git-session";
import { ConsoleHost } from "../src/components/lab/sessions/console-host";
import { BuilderHost, VALIDATORS, type BuilderSpec } from "../src/components/lab/sessions/builder-host";

const EPOCH = "2026-06-01T09:00:00Z";

function shellOpts(extra: Partial<ShellSessionOptions> = {}): ShellSessionOptions {
  return {
    variant: "bash-linux",
    seed: { files: [{ path: "~/lab05", dir: true }], tools: {} },
    epoch: EPOCH,
    cols: 80,
    user: "analyst",
    host: "workstation",
    home: "/home/analyst",
    ...extra,
  };
}

function done(r: LabExecResult): asserts r is Extract<LabExecResult, { state: "done" }> {
  expect(r.state).toBe("done");
}

// ---------------------------------------------------------------------------
// sessions/types helpers
// ---------------------------------------------------------------------------
describe("sessions/types helpers", () => {
  test("seedToFileMap flattens files, strips ~/, skips dirs", () => {
    const map = seedToFileMap({
      files: [
        { path: "~/lab07", dir: true },
        { path: "~/lab07/evidence.sql", content: "select 1;" },
        { path: "/abs/note.txt", content: "n" },
        { path: "~/empty-dir", dir: true },
      ],
      tools: {},
    });
    expect(map).toEqual({ "lab07/evidence.sql": "select 1;", "abs/note.txt": "n" });
  });

  test("eventText joins one stream only; isThenable distinguishes promises", () => {
    const events = [
      { stream: "stdout" as const, text: "a\n" },
      { stream: "stderr" as const, text: "E\n" },
      { stream: "stdout" as const, text: "b\n" },
    ];
    expect(eventText(events, "stdout")).toBe("a\nb\n");
    expect(eventText(events, "stderr")).toBe("E\n");
    expect(isThenable(Promise.resolve(1))).toBe(true);
    expect(isThenable({ state: "done" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// api-exchange: parsing
// ---------------------------------------------------------------------------
describe("api-exchange parsing (taught curl subset, request side = typed ground truth)", () => {
  test("plain GET, -i flag, headers, method, data, cursor extraction", () => {
    const r = parseCurlLine(
      `curl -si -X GET -H 'Authorization: Bearer tok_1' "https://acme.example/api/v2/users?cursor=eyJwYWdlIjoyfQ%3D%3D"`,
    );
    expect(r).not.toBeNull();
    expect(r!.method).toBe("GET");
    expect(r!.host).toBe("acme.example");
    expect(r!.path).toBe("/api/v2/users");
    expect(r!.cursor).toBe("eyJwYWdlIjoyfQ==");
    expect(r!.headers["Authorization"]).toBe("Bearer tok_1");
    expect(r!.include).toBe(true);
  });

  test("-d implies POST; --data collected; default GET without data", () => {
    const post = parseCurlLine(`curl -d grant_type=client_credentials --data client_id=x https://acme.example/oauth/token`);
    expect(post!.method).toBe("POST");
    expect(post!.body).toBe("grant_type=client_credentials&client_id=x");
    expect(parseCurlLine("curl https://acme.example/api/v2/users")!.method).toBe("GET");
    expect(parseCurlLine("curl https://acme.example/api/v2/users")!.cursor).toBeNull();
  });

  test("non-curl, unknown flags, multiple URLs → null (never guessed)", () => {
    expect(parseCurlLine("ls -la")).toBeNull();
    expect(parseCurlLine("curl --verbose https://acme.example/")).toBeNull();
    expect(parseCurlLine("curl -L https://acme.example/")).toBeNull();
    expect(parseCurlLine("curl https://a.example/ https://b.example/")).toBeNull();
  });

  test("compound detection honors quotes; firstSegment cuts at the operator", () => {
    expect(isCompoundLine(`curl -s https://acme.example/x | jq .`)).toBe(true);
    expect(isCompoundLine(`curl -s https://acme.example/x > out.json`)).toBe(true);
    expect(isCompoundLine(`curl -H 'X: a|b' https://acme.example/x`)).toBe(false);
    expect(firstSegment(`curl -s https://acme.example/x | jq .`)).toBe("curl -s https://acme.example/x ");
  });

  test("splitIncludeOutput separates status/headers/body; non-HTTP text falls through", () => {
    const split = splitIncludeOutput("HTTP/1.1 401 Unauthorized\nContent-Type: application/json\nContent-Length: 5\n\n{}\n");
    expect(split.status).toBe(401);
    expect(split.statusText).toBe("Unauthorized");
    expect(split.headers).toEqual([["Content-Type", "application/json"], ["Content-Length", "5"]]);
    expect(split.body).toBe("{}\n");
    expect(splitIncludeOutput("not a wire exchange").status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// api-exchange: observer over the REAL shell engine + mock vendor
// ---------------------------------------------------------------------------
describe("ApiLabSession over the real api-lab box", () => {
  function apiSession(): ApiLabSession {
    const shell = createShellEngine().create(shellOpts({ apiLab: {} }));
    return new ApiLabSession(shell);
  }

  test("curl -i records the printed wire exchange (status, headers, body)", () => {
    const s = apiSession();
    const r = s.exec("curl -si https://acme.example/api/v2/users") as LabExecResult;
    done(r);
    const ex = s.last();
    expect(ex).not.toBeNull();
    expect(ex!.method).toBe("GET");
    expect(ex!.path).toBe("/api/v2/users");
    expect(ex!.status).toBe(401); // the mock vendor's no-auth rung — real router verdict
    expect(ex!.responseHeaders!.some(([k]) => k === "Content-Type")).toBe(true);
    expect(ex!.responseBody).toContain('"error"');
    expect(s.probes()).toEqual([{ method: "GET", path: "/api/v2/users", cursor: null, status: 401 }]);
  });

  test("without -i the status is honestly unknown, body still captured", () => {
    const s = apiSession();
    done(s.exec("curl -s https://acme.example/api/v2/users") as LabExecResult);
    const ex = s.last()!;
    expect(ex.status).toBeNull();
    expect(ex.responseBody).toContain('"error"');
  });

  test("piped curl records the request side only (response not captured, not guessed)", () => {
    const s = apiSession();
    done(s.exec("curl -s https://acme.example/api/v2/users | wc -l") as LabExecResult);
    const ex = s.last()!;
    expect(ex.method).toBe("GET");
    expect(ex.path).toBe("/api/v2/users");
    expect(ex.status).toBeNull();
    expect(ex.responseBody).toBeNull();
  });

  test("non-curl lines record nothing; snapshot carries the log; restoreLog round-trips", () => {
    const s = apiSession();
    done(s.exec("pwd") as LabExecResult);
    expect(s.exchanges()).toHaveLength(0);
    done(s.exec("curl -si https://acme.example/api/v2/users") as LabExecResult);
    const snap = s.snapshot() as { shell: unknown; exchanges: ReturnType<ApiLabSession["exchanges"]> };
    expect(snap.exchanges).toHaveLength(1);
    const s2 = apiSession();
    s2.restoreLog(snap.exchanges);
    expect(s2.probes()).toEqual(s.probes());
  });

  test("delegation surface stays the shell's own (prompt, history, probes, cols, stdin)", () => {
    const s = apiSession();
    expect(s.prompt()).toBe("analyst@workstation:~$ ");
    done(s.exec("echo hi > note.txt") as LabExecResult);
    expect(s.readFile("~/note.txt")).toBe("hi\n");
    expect(s.exists("~/note.txt")).toBe(true);
    expect(s.listDir("~")).toContain("note.txt");
    expect(s.producedBy("~/note.txt")).toBe("echo hi > note.txt");
    expect(s.history()).toContain("echo hi > note.txt");
    expect(s.lastExit()).toBe(0);
    expect(s.historyUp()).toBe("echo hi > note.txt");
    s.historyDown(); // engine-owned cursor semantics — passthrough, no wrapper opinion
    expect(s.complete("ech").completions.length).toBeGreaterThan(0);
    s.setCols(120); // no throw — passthrough
    const pendingCat = s.exec("cat") as LabExecResult;
    expect(pendingCat.state).toBe("pending");
    expect((s.feedStdin("x\n") as LabExecResult).state).toBe("pending"); // cat keeps reading
    done(s.eof() as LabExecResult); // Ctrl+D ends it
    done(s.interrupt() as LabExecResult);
    s.writeFileAs("~/edited.txt", "via editor\n", "nano edited.txt");
    expect(s.readFile("~/edited.txt")).toBe("via editor\n");
    expect(s.runScriptClean("~/edited.txt", []).exit).not.toBe(0); // not a script — engine's own verdict
    s.reseedFiles({ files: [], tools: {} }); // no throw — passthrough
  });
});

// ---------------------------------------------------------------------------
// git terminal session: real shell + real isomorphic-git state
// ---------------------------------------------------------------------------
describe("GitTerminalSession (shell passthrough + git porcelain + state probe)", () => {
  function gitSession(): GitTerminalSession {
    const shell = createShellEngine().create(shellOpts());
    const adapter = new GitEngineAdapter({ dir: "/home/analyst/lab05" });
    return new GitTerminalSession(shell, adapter, { epoch: EPOCH });
  }

  test("taught flow: edit → init → status → add → commit; verified by REPO STATE", async () => {
    const s = gitSession();
    done((await s.exec("cd lab05")) as LabExecResult);
    done((await s.exec("echo 'v1' > validator.py")) as LabExecResult);
    const init = (await s.exec("git init")) as LabExecResult;
    done(init);
    expect(eventText(init.events, "stdout")).toContain("Initialized empty Git repository");
    const status = (await s.exec("git status")) as LabExecResult;
    expect(eventText(status.events, "stdout")).toContain("validator.py");
    done((await s.exec("git add validator.py")) as LabExecResult);
    const commit = (await s.exec('git commit -m "Start with validator"')) as LabExecResult;
    done(commit);
    expect(commit.state === "done" ? commit.exit : -1).toBe(0);
    const state = s.repoState();
    expect(state).not.toBeNull();
    expect(state!.branch).toBe("main");
    expect(state!.commits).toHaveLength(1);
    expect(state!.commits[0]!.subject).toBe("Start with validator");
    // wrapper-owned history covers BOTH worlds
    expect(s.history()).toContain("git init");
    expect(s.history()).toContain("echo 'v1' > validator.py");
    expect(s.historyUp()).toBe('git commit -m "Start with validator"');
    expect(s.lastExit()).toBe(0);
  });

  test("pre-init git commands fail like real git; repoState stays null", async () => {
    const s = gitSession();
    const r = (await s.exec("git status")) as LabExecResult;
    expect(r.state === "done" ? r.exit : -1).toBe(128);
    expect(eventText(r.events, "stderr")).toContain("not a git repository");
    expect(s.repoState()).toBeNull();
  });

  test("snapshot → replay restore reproduces the same head SHA (pinned clock ramp)", async () => {
    const s = gitSession();
    await s.exec("cd lab05");
    await s.exec("echo 'v1' > validator.py");
    await s.exec("git init");
    await s.exec("git add validator.py");
    await s.exec('git commit -m "c1"');
    const sha = s.repoState()!.headSha;
    const snap = s.snapshot();
    expect(snap.gitCommands).toEqual(["git init", "git add validator.py", 'git commit -m "c1"']);

    const shell2 = createShellEngine().restore(snap.shell as never, shellOpts());
    const adapter2 = new GitEngineAdapter({ dir: "/home/analyst/lab05" });
    const s2 = new GitTerminalSession(shell2, adapter2, { epoch: EPOCH });
    await s2.restoreGit(snap as GitSessionSnapshot);
    expect(s2.repoState()!.headSha).toBe(sha);
    expect(s2.history()).toEqual(s.history());
    expect(s2.lastExit()).toBe(0);
  });

  test("editor writes mirror into the worktree; delegation surface intact", async () => {
    const s = gitSession();
    await s.exec("cd lab05");
    await s.exec("git init");
    s.writeFileAs("/home/analyst/lab05/notes.md", "hello\n", "nano notes.md");
    const status = (await s.exec("git status")) as LabExecResult;
    expect(eventText(status.events, "stdout")).toContain("notes.md");
    expect(s.prompt()).toContain("lab05");
    expect(s.exists("/home/analyst/lab05/notes.md")).toBe(true);
    expect(s.readFile("/home/analyst/lab05/notes.md")).toBe("hello\n");
    expect(s.listDir("/home/analyst/lab05")).toContain("notes.md");
    expect(s.producedBy("/home/analyst/lab05/notes.md")).toBe("nano notes.md");
    expect(s.complete("git").replacePrefix).toBe("git");
    s.setCols(100);
    done((await s.interrupt()) as LabExecResult);
    done((await s.eof()) as LabExecResult);
    expect(s.historyDown()).toBeNull();
    expect(s.runScriptClean("/home/analyst/lab05/notes.md", []).exit).not.toBe(0);
    s.reseedFiles({ files: [], tools: {} });
  });
});

// ---------------------------------------------------------------------------
// console host
// ---------------------------------------------------------------------------
describe("ConsoleHost (editor/console state + probe session)", () => {
  function fakeEngine(result: Partial<EngineRunResult> = {}): EngineAdapter & { calls: Array<{ input: string; files: Record<string, string> }> } {
    const calls: Array<{ input: string; files: Record<string, string> }> = [];
    return {
      id: "fake",
      calls,
      load: async () => {},
      run: async (input, files) => {
        calls.push({ input, files: files ?? {} });
        return { stdout: "", stderr: "", exit: 0, ...result };
      },
    };
  }

  test("run hands the engine the main buffer + assets; result becomes the probe truth", async () => {
    const host = new ConsoleHost({
      files: { "collect.py": "print(3)\n", "evidence.json": "{}" },
      mainFile: "collect.py",
    });
    const eng = fakeEngine({ stdout: "3\n" });
    const r = await host.run(eng);
    expect(r.stdout).toBe("3\n");
    expect(eng.calls[0]!.input).toBe("print(3)\n");
    expect(eng.calls[0]!.files).toEqual({ "evidence.json": "{}", "collect.py": "print(3)\n" });
    expect(host.lastResult()!.exit).toBe(0);
    expect(host.runHistory()).toEqual(["print(3)\n"]);
  });

  test("explicit input (jq-style invocation) wins over the buffer", async () => {
    const host = new ConsoleHost({ files: { "input.json": "[1,2]" }, mainFile: "filter.jq" });
    const eng = fakeEngine();
    await host.run(eng, "jq '.[0]' input.json");
    expect(eng.calls[0]!.input).toBe("jq '.[0]' input.json");
    expect(host.runHistory()).toEqual(["jq '.[0]' input.json"]);
  });

  test("defaults: first file is main; assets = everything else; missing main = empty buffer", () => {
    const host = new ConsoleHost({ files: { "a.sql": "select 1;", "b.sql": "select 2;" } });
    expect(host.mainFile).toBe("a.sql");
    expect(host.runFiles()).toEqual({ "b.sql": "select 2;", "a.sql": "select 1;" });
    const empty = new ConsoleHost({ files: {}, mainFile: "new.py" });
    expect(empty.read("new.py")).toBe("");
  });

  test("restoreSeedFiles is files-only (ISC-117): runs survive, edits revert", async () => {
    const host = new ConsoleHost({ files: { "q.sql": "select 1;" } });
    await host.run(fakeEngine());
    host.write("q.sql", "select 99;");
    expect(host.read("q.sql")).toBe("select 99;");
    host.restoreSeedFiles();
    expect(host.read("q.sql")).toBe("select 1;");
    expect(host.runHistory()).toHaveLength(1);
  });

  test("snapshot/restore round-trips files+runs but never resurrects engine results", async () => {
    const host = new ConsoleHost({ files: { "q.sql": "select 1;" } });
    await host.run(fakeEngine({ stdout: "1\n" }));
    host.write("q.sql", "select 2;");
    const snap = host.snapshot();
    const fresh = new ConsoleHost({ files: { "q.sql": "select 1;" } });
    fresh.restore(snap);
    expect(fresh.read("q.sql")).toBe("select 2;");
    expect(fresh.runHistory()).toEqual(["select 1;"]);
    expect(fresh.lastResult()).toBeNull(); // results are real engine output only
  });

  test("probe session: ~-normalized files, run history, exit; honest boundaries", async () => {
    const host = new ConsoleHost({ files: { "lab/q.sql": "select 1;" }, mainFile: "lab/q.sql" });
    const probe = host.probeSession();
    expect(probe.lastExit()).toBe(-1); // no run yet — never a fake success
    await host.run(fakeEngine({ exit: 1 }));
    expect(host.probeSession().lastExit()).toBe(1);
    expect(probe.exists("~/lab/q.sql")).toBe(true);
    expect(probe.readFile("/lab/q.sql")).toBe("select 1;");
    expect(probe.readFile("lab/missing.sql")).toBeNull();
    expect(probe.listDir("")).toEqual(["lab/q.sql"]);
    expect(probe.producedBy("lab/q.sql")).toBeNull();
    expect(probe.runScriptClean("x", []).exit).toBe(64);
    expect(probe.prompt()).toContain("lab/q.sql");
  });
});

// ---------------------------------------------------------------------------
// builder host: real ported validators behind the closed registry
// ---------------------------------------------------------------------------
describe("BuilderHost (surfaces + closed validator registry)", () => {
  const PASSING_ANALYSIS = [
    "Legacy GRC ran on manual toil, transactional checklists, and whack-a-mole findings",
    "inside a closed-framework worldview staffed as commoditized labor.",
    "UNDERSTAND LOCATE QUERY EVALUATE EVIDENCE MONITOR OWN",
    "The inversion: reality -> policy.",
  ].join("\n");

  function workspaceSpec(extra: Partial<BuilderSpec> = {}): BuilderSpec {
    return { surface: "workspace", validator: "evaluate-analysis", validator_args: ["analysis.md"], ...extra };
  }

  test("workspace + evaluate-analysis: fail-then-pass is genuine (real ported check)", () => {
    const host = new BuilderHost(workspaceSpec(), { "analysis.md": "too thin\n" });
    const fail = host.runValidator();
    expect(fail.exit).toBe(1);
    expect(fail.stdout).toContain("missing legacy problem: manual toil");
    host.workspace.write("analysis.md", PASSING_ANALYSIS);
    const pass = host.runValidator();
    expect(pass.exit).toBe(0);
    expect(host.lastValidatorRun()!.exit).toBe(0);
  });

  test("validator boundaries: missing file, unconfigured validator", () => {
    const host = new BuilderHost(workspaceSpec({ validator_args: ["nope.md"] }), {});
    expect(host.runValidator().exit).toBe(2);
    const none = new BuilderHost({ surface: "workspace", validator_args: [] }, {});
    expect(none.runValidator().exit).toBe(64);
  });

  test("closed registry covers exactly the spec enum", () => {
    expect(Object.keys(VALIDATORS).sort()).toEqual(
      ["capstone", "coverage", "crosswalk", "evaluate-analysis", "expected-loss", "gate", "oscal"],
    );
  });

  test("mapping surface: widget edits → CSV → answer-key score; key file is read-only", () => {
    const seedCsv = "profile,profile_control,spine_control,relationship\nSOC2,CC6.1,,\nSOC2,CC6.6,,\n";
    const keyCsv = "profile,profile_control,spine_control,relationship\nSOC2,CC6.1,AC-2,exact\nSOC2,CC6.6,SC-7,partial\n";
    const host = new BuilderHost(
      {
        surface: "mapping",
        validator: "crosswalk",
        validator_args: ["crosswalk.csv"],
        mapping: { left_cols: 2, seed_file: "crosswalk.csv", targets: ["AC-2", "SC-7"], labels: ["exact", "partial"], key_file: "answer-key.csv" },
      },
      { "crosswalk.csv": seedCsv, "answer-key.csv": keyCsv },
    );
    expect(host.workspace.isReadOnly("answer-key.csv")).toBe(true);
    host.mapping!.setMapping(0, "AC-2", "exact");
    host.mapping!.setMapping(1, "SC-7", "broader"); // one-token mutation: wrong label
    const run = host.runValidator();
    expect(host.lastMappingScore()).toEqual({ correct: 1, total: 2 });
    // the real ported validator ran against the widget's exact CSV bytes — here it
    // crashes exactly like the original (this minimal world lacks spine-families.txt)
    expect(run.exit).toBe(1);
    expect(run.stderr).toContain("spine-families.txt");
    expect(host.workspace.read("crosswalk.csv")).toContain("SOC2,CC6.1,AC-2,exact");
    host.mapping!.setMapping(1, "SC-7", "partial");
    host.runValidator();
    expect(host.lastMappingScore()).toEqual({ correct: 2, total: 2 });
  });

  test("scoring-grid surface: happy-path.sh wording on failure; pass when 7 valid calls", () => {
    const host = new BuilderHost({ surface: "scoring-grid", validator_args: [] }, {});
    const fail = host.validateGrid();
    expect(fail.exit).toBe(1);
    expect(fail.stderr).toContain("FAIL: scoring table missing loop stage 'UNDERSTAND'");
    for (const s of ["UNDERSTAND", "LOCATE", "QUERY", "EVALUATE", "EVIDENCE", "MONITOR", "OWN"] as const) {
      host.grid!.setCall(s, "BUILD");
    }
    expect(host.validateGrid().exit).toBe(0);
    // boundary: grid call on a non-grid host
    expect(new BuilderHost(workspaceSpec(), {}).validateGrid().exit).toBe(64);
  });

  test("ccm surface: real check on every tick — drift genuinely flips the verdict", () => {
    const compliant = JSON.stringify({
      buckets: [{ name: "evidence-bucket", block_public_acls: true, block_public_policy: true, ignore_public_acls: true, restrict_public_buckets: true }],
    });
    const host = new BuilderHost(
      {
        surface: "ccm",
        validator_args: [],
        ccm: { state_file: "state.json", start: "2026-05-20T09:00:00Z", drift_bucket: "evidence-bucket", interval_hours_options: [24] },
      },
      { "state.json": compliant },
    );
    expect(host.ccmTick().exit).toBe(0);
    host.ccm!.injectDrift("evidence-bucket");
    expect(host.ccmTick().exit).toBe(1);
    const tile = host.ccm!.dashboardTile();
    expect(tile.current).toBe("FAIL");
    expect(tile.greenRuns).toBe(1);
    expect(tile.redRuns).toBe(1);
    expect(tile.openAlerts.length).toBeGreaterThan(0);
    host.ccm!.remediate("evidence-bucket");
    expect(host.ccmTick().exit).toBe(0);
    expect(new BuilderHost(workspaceSpec(), {}).ccmTick().exit).toBe(64);
  });

  test("capstone surface: validator + checklist through the assembler; probe reads the repo", () => {
    const host = new BuilderHost({ surface: "capstone", validator: "capstone", validator_args: ["capstone-manifest.yaml"] }, {});
    const run = host.validateCapstoneRepo();
    expect(typeof run.exit).toBe("number");
    expect(host.capstone!.checklist()).toHaveLength(8);
    expect(host.probeSession().readFile("capstone-manifest.yaml")).toContain("capstone");
    expect(host.runValidator().exit).toBe(run.exit); // spec-named validator reads the SAME repo fs
    expect(new BuilderHost(workspaceSpec(), {}).validateCapstoneRepo().exit).toBe(64);
  });

  test("snapshot/restore round-trips surface state; verdicts must be re-earned", () => {
    const host = new BuilderHost(workspaceSpec(), { "analysis.md": "draft\n" });
    host.workspace.write("analysis.md", PASSING_ANALYSIS);
    host.runValidator();
    const snap = host.snapshot();
    const fresh = new BuilderHost(workspaceSpec(), { "analysis.md": "draft\n" });
    fresh.restore(snap);
    expect(fresh.workspace.read("analysis.md")).toBe(PASSING_ANALYSIS);
    expect(fresh.lastValidatorRun()).toBeNull();
    expect(fresh.probeSession().history()).toEqual(host.probeSession().history());
    expect(fresh.probeSession().lastExit()).toBe(-1);
  });

  test("probe session boundaries (producedBy, runScriptClean, prompt, listDir)", () => {
    const host = new BuilderHost(workspaceSpec(), { "analysis.md": "x" });
    const probe = host.probeSession();
    expect(probe.exists("~/analysis.md")).toBe(true);
    expect(probe.producedBy("analysis.md")).toBeNull();
    expect(probe.runScriptClean("analysis.md", []).exit).toBe(64);
    expect(probe.prompt()).toBe("builder ");
    expect(probe.listDir("")).toEqual(["analysis.md"]);
  });
});

// ---------------------------------------------------------------------------
// builder host: every registry entry executes its REAL port and fails closed
// ---------------------------------------------------------------------------
describe("BuilderHost validator registry — fail-closed on missing inputs", () => {
  for (const name of ["gate", "coverage", "crosswalk", "oscal", "expected-loss", "capstone"] as const) {
    test(`${name}: empty world → non-zero exit with the port's own complaint`, () => {
      const host = new BuilderHost(
        { surface: "workspace", validator: name, validator_args: ["missing-input"] },
        {},
      );
      const run = host.runValidator();
      expect(run.exit).not.toBe(0); // a missing input must never read as green
      expect(run.stdout + run.stderr).not.toBe("");
      expect(host.probeSession().history()).toEqual([`validator:${name} missing-input`]);
    });
  }

  test("scoreMapping boundaries: no mapping surface → null; missing key file → null", () => {
    const ws = new BuilderHost({ surface: "workspace", validator_args: [] }, {});
    expect(ws.scoreMapping()).toBeNull();
    const noKey = new BuilderHost(
      {
        surface: "mapping",
        validator_args: [],
        mapping: { left_cols: 1, seed_file: "m.csv", targets: [], labels: [], key_file: "absent.csv" },
      },
      { "m.csv": "a,b,c\nx,,\n" },
    );
    expect(noKey.scoreMapping()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// git session: state-change notifications, empty-replay restore, async shells
// ---------------------------------------------------------------------------
describe("GitTerminalSession edges", () => {
  test("onStateChange fires after every git command; empty restore lands on null state", async () => {
    let pings = 0;
    const shell = createShellEngine().create(shellOpts());
    const s = new GitTerminalSession(shell, new GitEngineAdapter({ dir: "/home/analyst/lab05" }), { epoch: EPOCH }, () => pings++);
    await s.exec("git init");
    expect(pings).toBe(1);
    const shell2 = createShellEngine().create(shellOpts());
    const s2 = new GitTerminalSession(shell2, new GitEngineAdapter({ dir: "/home/analyst/lab05" }), { epoch: EPOCH });
    await s2.restoreGit({ v: 1, shell: {}, gitCommands: [], history: ["pwd"], lastExit: 0 });
    expect(s2.repoState()).toBeNull(); // no repo yet — never invented
    expect(s2.history()).toEqual(["pwd"]);
  });

  test("an async (promise-returning) shell still records history and exit", async () => {
    const shell = createShellEngine().create(shellOpts());
    const asyncShell = new Proxy(shell, {
      get(target, prop, receiver) {
        if (prop === "exec") {
          return (line: string) => Promise.resolve(target.exec(line));
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const s = new GitTerminalSession(asyncShell, new GitEngineAdapter({ dir: "/home/analyst/lab05" }), { epoch: EPOCH });
    const r = (await s.exec("echo async > probe.txt")) as LabExecResult;
    expect(r.state).toBe("done");
    expect(s.history()).toEqual(["echo async > probe.txt"]);
    expect(s.lastExit()).toBe(0);
    expect(s.readFile("~/probe.txt")).toBe("async\n");
  });
});

// ---------------------------------------------------------------------------
// exercise-spec extensions (console/builder blocks — backward compatible)
// ---------------------------------------------------------------------------
import { ExerciseSpecSchema } from "../src/lib/exercise-spec";

describe("exercise-spec console/builder extensions", () => {
  const base = {
    id: "lab-10",
    module: "10-frameworks-and-crosswalks",
    title: "Crosswalk builder",
    owner: "Justin Pagano",
    volatility: "A",
    review_due: "2026-12-01",
    seed: { profile: "m10", home: "/home/analyst" },
    intro: "Build the crosswalk.",
    tasks: [
      {
        id: "t1",
        type: "action",
        objective: [1],
        instruction: "Map every row.",
        verify: [{ check: "mapping_score_at_least", min_correct: 8 }],
        hints: [{ nudge: "Start with CC6.1." }, { reveal: "AC-2 / exact" }],
      },
    ],
  };

  test("builder spec parses (surface + validator + mapping config)", () => {
    const parsed = ExerciseSpecSchema.safeParse({
      ...base,
      engine: "builder",
      builder: {
        surface: "mapping",
        validator: "crosswalk",
        validator_args: ["crosswalk.csv"],
        mapping: { left_cols: 2, seed_file: "crosswalk.csv", targets: ["AC-2"], labels: ["exact"], key_file: "key.csv" },
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.builder!.mapping!.left_cols).toBe(2);
  });

  test("console spec parses on a console engine; jq is a first-class engine", () => {
    const parsed = ExerciseSpecSchema.safeParse({
      ...base,
      engine: "jq",
      console: { main_file: "filter.jq", assets: ["input.json"], run_label: "Run filter" },
    });
    expect(parsed.success).toBe(true);
  });

  test("cross-field refinements reject mismatched blocks (one-token mutations)", () => {
    // engine: builder REQUIRES a builder block
    expect(ExerciseSpecSchema.safeParse({ ...base, engine: "builder" }).success).toBe(false);
    // builder block on a non-builder engine
    expect(ExerciseSpecSchema.safeParse({
      ...base, engine: "shell-linux", builder: { surface: "workspace" },
    }).success).toBe(false);
    // console block on a terminal engine
    expect(ExerciseSpecSchema.safeParse({
      ...base, engine: "shell-linux", console: { main_file: "x" },
    }).success).toBe(false);
    // mapping surface without mapping config
    expect(ExerciseSpecSchema.safeParse({
      ...base, engine: "builder", builder: { surface: "mapping" },
    }).success).toBe(false);
    // ccm surface without ccm config
    expect(ExerciseSpecSchema.safeParse({
      ...base, engine: "builder", builder: { surface: "ccm" },
    }).success).toBe(false);
    // ccm surface WITH config parses
    expect(ExerciseSpecSchema.safeParse({
      ...base,
      engine: "builder",
      builder: { surface: "ccm", ccm: { state_file: "state.json", start: "2026-05-20T09:00:00Z", drift_bucket: "b" } },
    }).success).toBe(true);
  });
});

describe("hardening edges", () => {
  test("a rejecting git adapter never poisons the command queue", async () => {
    const shell = createShellEngine().create(shellOpts());
    let calls = 0;
    const flaky = {
      dir: "/home/analyst/lab05",
      setClock: () => {},
      writeFile: () => {},
      run: async () => {
        calls++;
        if (calls === 1) throw new Error("engine hiccup");
        return { stdout: "", stderr: "", exit: 0 };
      },
      state: async () => ({ branch: "main", branches: ["main"], headSha: null, commits: [] }),
    } as unknown as GitEngineAdapter;
    const s = new GitTerminalSession(shell, flaky, { epoch: EPOCH });
    await expect(s.exec("git status") as Promise<LabExecResult>).rejects.toThrow("engine hiccup");
    const ok = (await s.exec("git status")) as LabExecResult;
    expect(ok.state).toBe("done"); // the queue recovered — later commands still run
  });

  test("findBannedKeys flags code-smuggling keys at any depth (lint seam)", async () => {
    const { findBannedKeys } = await import("../src/lib/exercise-spec");
    expect(findBannedKeys({ tasks: [{ verify: [{ check: "x", script: "rm -rf" }] }] })).toEqual([
      "$.tasks[0].verify[0].script",
    ]);
    expect(findBannedKeys({ intro: "clean", seed: { files: [] } })).toEqual([]);
  });
});
