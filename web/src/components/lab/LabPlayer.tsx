/**
 * Spec-driven Lab Player (web ISA ISC-89..93, 115..119, 124..127, 129..131).
 *
 * Renders any exercise spec as data: intro → task rail + terminal → completion.
 *  - Engine is loaded LAZILY via import.meta.glob so reading pages ship no engine JS and
 *    this island builds even while src/engines/shell/ lands in a parallel build (ISC-100).
 *  - Tasks auto-verify after every completed command via the closed verifier registry
 *    (runCheck) — passing tasks flip with their evidence shown (ISC-90/119); failing
 *    checks surface the gap text, never the answer.
 *  - Hint ladder per task; reveal rungs need an explicit confirm and are recorded in
 *    labstate.reveals (ISC-91/125).
 *  - "Restore lab files" re-seeds VFS files only (history + completed tasks kept, ISC-117);
 *    "Reset exercise" is a confirmed full re-seed (ISC-92).
 *  - Session snapshot + player state persist debounced to localStorage with a size guard;
 *    quota exhaustion warns and degrades without corrupting progress (ISC-124).
 *  - Pedagogy (coach bubble, explains, hints) renders OUTSIDE the terminal stream (ISC-116).
 *  - No one-click "run this command" affordances — typing is the learning (ISC-118).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseSpec } from "../../lib/exercise-spec";
import type {
  SeedSpec,
  ShellEngine,
  ShellSessionOptions,
  ShellVariant,
} from "../../engines/shell/types";
import type {
  PowerShellEngine,
  WindowsSeed,
} from "../../engines/powershell/types";
import { runCheck, type AnyCheckParams, type ProbeSession, type VerifyContext } from "../../verifiers/registry";
import {
  appendEvidence,
  loadState,
  saveState,
  type ExerciseCompletion,
  type TaskRecord,
} from "../../lib/labstate";
import { loadPersisted, persist, removePersisted, type PersistFailure } from "../../lib/persist";
import Terminal, { type TerminalHandle } from "./Terminal";
import EditorPanel from "./EditorPanel";
import ApiInspector from "./ApiInspector";
import EditorConsole, { type ConsoleEngineId } from "./EditorConsole";
import BuilderSurface from "./BuilderSurface";
import type { LabSession } from "./sessions/types";
import { seedToFileMap } from "./sessions/types";
import { ApiLabSession, type ApiExchange } from "./sessions/api-exchange";
import { GitTerminalSession, type GitSessionSnapshot } from "./sessions/git-session";
import { ConsoleHost, type ConsoleSnapshot } from "./sessions/console-host";
import { BuilderHost, type BuilderSnapshot } from "./sessions/builder-host";

// Engines resolve lazily (none of them ship on reading pages — ISC-100); a glob that
// resolves to {} keeps the page building while an engine package lands in parallel.
const ENGINE_MODULES = import.meta.glob<{ createShellEngine: () => ShellEngine }>(
  "../../engines/shell/index.ts",
);
const ENGINE_KEY = "../../engines/shell/index.ts";
const PS_MODULES = import.meta.glob<{ createPowerShellEngine: () => PowerShellEngine }>(
  "../../engines/powershell/index.ts",
);
const PS_KEY = "../../engines/powershell/index.ts";
const GIT_MODULES = import.meta.glob<typeof import("../../engines/git")>(
  "../../engines/git/index.ts",
);
const GIT_KEY = "../../engines/git/index.ts";

interface LabPlayerProps {
  spec: ExerciseSpec;
  seed: SeedSpec;
  epoch: string;
  expectations: Record<string, string>;
  /** PowerShell engine seed (engine: powershell bundles only). */
  windowsSeed?: unknown;
  /** Linux-admin lab wiring (module 02's booted web-01 bundle only). */
  adminLab?: { password: string };
  /** Prompt hostname override (module 02: web-01). */
  host?: string;
}

interface SavedLab {
  v: 1;
  /** Terminal-class engine snapshot (shell SessionSnapshot / Ps snapshot / git wrapper). */
  snapshot?: unknown;
  console?: ConsoleSnapshot;
  builder?: BuilderSnapshot;
  tasks: Record<string, TaskRecord>;
  hints: Record<string, number>; // rungs opened per task
  reflections: Record<string, string>;
  coachDismissed: boolean;
}

type Phase = "intro" | "loading" | "running" | "engine-missing" | "engine-unsupported";

/** Engine → surface dispatch (the heart of the spec.engine wiring). */
type SurfaceKind = "terminal" | "console" | "builder" | "unsupported";

function surfaceKindOf(engine: ExerciseSpec["engine"]): SurfaceKind {
  switch (engine) {
    case "shell-linux":
    case "shell-macos":
    case "powershell":
    case "api":
    case "git":
      return "terminal";
    case "python":
    case "sql":
    case "policy":
    case "jq":
      return "console";
    case "builder":
      return "builder";
    default:
      return "unsupported"; // "mixed" ships in a later wave
  }
}

const VARIANTS: Partial<Record<ExerciseSpec["engine"], ShellVariant>> = {
  "shell-linux": "bash-linux",
  "shell-macos": "zsh-macos",
  api: "bash-linux", // the module-06 lab box is the Linux container + curl (ISC-78)
  git: "bash-linux", // the module-05 lab box is the Linux container + git porcelain
};

/** Render `code spans` in instruction/hint text without a markdown dependency. */
function InlineCode({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-[0.86em] px-1 py-0.5 rounded bg-[color:var(--code-bg)] text-[color:var(--code-fg)]">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function hintLabel(hint: ExerciseSpec["tasks"][number]["hints"][number]): "nudge" | "concept" | "reveal" {
  if ("reveal" in hint) return "reveal";
  if ("concept" in hint) return "concept";
  return "nudge";
}
function hintText(hint: ExerciseSpec["tasks"][number]["hints"][number]): string {
  if ("reveal" in hint) return hint.reveal;
  if ("concept" in hint) return hint.concept;
  return hint.nudge;
}

const STORAGE_WARNINGS: Record<PersistFailure, string> = {
  "too-large":
    "Your lab state is larger than the local storage budget — work continues in this tab, but it won't survive a reload.",
  quota:
    "This browser's local storage is full — progress keeps working in this tab, but it couldn't be saved for next time.",
  unavailable: "Local storage isn't available in this browser — progress won't survive a reload.",
};

export default function LabPlayer({ spec, seed, epoch, expectations, windowsSeed, adminLab, host }: LabPlayerProps) {
  const persistKey = `grcb.lab.${spec.id}`;
  const variant = VARIANTS[spec.engine] ?? null;
  const kind = surfaceKindOf(spec.engine);
  /** bash-world terminals get nano + the shell editor panel; PowerShell does not. */
  const bashWorld = spec.engine === "shell-linux" || spec.engine === "shell-macos" || spec.engine === "api" || spec.engine === "git";

  const [phase, setPhase] = useState<Phase>("intro");
  const [hasSaved, setHasSaved] = useState(false);
  const [taskRecords, setTaskRecords] = useState<Record<string, TaskRecord>>({});
  const [hintsOpen, setHintsOpen] = useState<Record<string, number>>({});
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [gap, setGap] = useState<{ taskId: string; text: string } | null>(null);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [editorFile, setEditorFile] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [completionRecorded, setCompletionRecorded] = useState(false);
  const [termEpoch, setTermEpoch] = useState(0);
  const [tick, setTick] = useState(0); // bumps after activity → debounced save

  const sessionRef = useRef<LabSession | null>(null);
  const apiRef = useRef<ApiLabSession | null>(null);
  const gitRef = useRef<GitTerminalSession | null>(null);
  const consoleRef = useRef<ConsoleHost | null>(null);
  const builderRef = useRef<BuilderHost | null>(null);
  /** Fresh-surface factory captured at start() — reset re-runs it (any engine class). */
  const recreateRef = useRef<(() => Promise<void> | void) | null>(null);
  const termRef = useRef<TerminalHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHasSaved(loadPersisted(persistKey) !== null);
  }, [persistKey]);

  const sessionOptions = useCallback(
    (): ShellSessionOptions => ({
      variant: variant ?? "bash-linux",
      seed,
      epoch,
      cols: 80,
      user: spec.seed.home.split("/").filter(Boolean).pop() ?? "analyst",
      host: host ?? (variant === "zsh-macos" ? "mac" : "workstation"),
      home: spec.seed.home,
      ...(spec.engine === "api" ? { apiLab: {} } : {}),
      ...(adminLab ? { adminLab } : {}),
    }),
    [variant, seed, epoch, spec.seed.home, spec.engine, adminLab, host],
  );

  const loadSaved = useCallback((): SavedLab | null => {
    try {
      const raw = loadPersisted(persistKey);
      if (!raw) return null;
      const saved = JSON.parse(raw) as SavedLab;
      return saved.v === 1 ? saved : null;
    } catch {
      return null; // corrupted save: fall through to a fresh surface, never crash
    }
  }, [persistKey]);

  const applySavedPlayerState = useCallback(
    (saved: SavedLab | null) => {
      if (saved) {
        setTaskRecords(saved.tasks);
        setHintsOpen(saved.hints);
        setReflections(saved.reflections);
        setCoachDismissed(saved.coachDismissed);
        setCompletionRecorded(Object.keys(loadState().completions).includes(spec.id));
      } else {
        setTaskRecords({});
        setHintsOpen({});
        setReflections({});
        setCompletionRecorded(false);
      }
    },
    [spec.id],
  );

  // ---- per-engine surface construction (THE spec.engine dispatch) -------------------

  const startTerminal = useCallback(
    async (resume: boolean) => {
      const saved = resume ? loadSaved() : null;
      apiRef.current = null;
      gitRef.current = null;

      if (spec.engine === "powershell") {
        const loader = PS_MODULES[PS_KEY];
        if (!loader || !windowsSeed) throw new Error("powershell engine/seed not bundled");
        const engine = (await loader()).createPowerShellEngine();
        const opts = {
          seed: windowsSeed as WindowsSeed,
          epoch,
          cols: 80,
          user: "labuser",
          home: "C:\\Users\\labuser",
        };
        sessionRef.current =
          saved?.snapshot !== undefined
            ? (engine.restore(saved.snapshot as never, opts) as unknown as LabSession)
            : (engine.create(opts) as unknown as LabSession);
        recreateRef.current = () => {
          sessionRef.current = engine.create(opts) as unknown as LabSession;
        };
        applySavedPlayerState(saved);
        return;
      }

      const loader = ENGINE_MODULES[ENGINE_KEY];
      if (!loader) throw new Error("shell engine not bundled");
      const engine = (await loader()).createShellEngine();

      if (spec.engine === "git") {
        const gitLoader = GIT_MODULES[GIT_KEY];
        if (!gitLoader) throw new Error("git engine not bundled");
        const gitMod = await gitLoader();
        const makeGit = async (snap: GitSessionSnapshot | null) => {
          const shell = snap
            ? engine.restore(snap.shell as never, sessionOptions())
            : engine.create(sessionOptions());
          const adapter = new gitMod.GitEngineAdapter({ dir: `${spec.seed.home}/lab05` });
          await adapter.load();
          const session = new GitTerminalSession(shell, adapter, { epoch }, () => setTick((n) => n + 1));
          if (snap) await session.restoreGit(snap);
          gitRef.current = session;
          sessionRef.current = session;
        };
        await makeGit((saved?.snapshot as GitSessionSnapshot | undefined) ?? null);
        recreateRef.current = () => makeGit(null);
        applySavedPlayerState(saved);
        return;
      }

      // shell-linux / shell-macos / api ride the same shell engine
      const makeShell = (snap: unknown | null): ApiLabSession | null => {
        const shell = snap
          ? engine.restore(snap as never, sessionOptions())
          : engine.create(sessionOptions());
        if (spec.engine === "api") {
          const wrapped = new ApiLabSession(shell, () => setTick((n) => n + 1));
          apiRef.current = wrapped;
          sessionRef.current = wrapped;
          return wrapped;
        }
        sessionRef.current = shell as unknown as LabSession;
        return null;
      };
      if (spec.engine === "api" && saved?.snapshot !== undefined) {
        const snap = saved.snapshot as { shell: unknown; exchanges: ApiExchange[] };
        makeShell(snap.shell)?.restoreLog(snap.exchanges ?? []);
      } else {
        makeShell(saved?.snapshot ?? null);
      }
      recreateRef.current = () => {
        makeShell(null);
      };
      applySavedPlayerState(saved);
    },
    [spec.engine, spec.seed.home, windowsSeed, epoch, sessionOptions, loadSaved, applySavedPlayerState],
  );

  const startConsole = useCallback(
    (resume: boolean) => {
      const saved = resume ? loadSaved() : null;
      const make = () => {
        const host = new ConsoleHost({
          files: seedToFileMap(seed),
          mainFile: spec.console?.main_file,
          assets: spec.console?.assets?.length ? spec.console.assets : undefined,
        });
        consoleRef.current = host;
      };
      make();
      if (saved?.console) consoleRef.current!.restore(saved.console);
      recreateRef.current = make;
      applySavedPlayerState(saved);
    },
    [seed, spec.console, loadSaved, applySavedPlayerState],
  );

  const startBuilder = useCallback(
    (resume: boolean) => {
      const saved = resume ? loadSaved() : null;
      const make = () => {
        builderRef.current = new BuilderHost(spec.builder!, seedToFileMap(seed));
      };
      make();
      if (saved?.builder) builderRef.current!.restore(saved.builder);
      recreateRef.current = make;
      applySavedPlayerState(saved);
    },
    [seed, spec.builder, loadSaved, applySavedPlayerState],
  );

  const start = useCallback(
    async (resume: boolean) => {
      if (kind === "unsupported" || (kind === "builder" && !spec.builder)) {
        setPhase("engine-unsupported");
        return;
      }
      setPhase("loading");
      try {
        if (kind === "terminal") await startTerminal(resume);
        else if (kind === "console") startConsole(resume);
        else startBuilder(resume);
      } catch {
        setPhase("engine-missing");
        return;
      }
      setGap(null);
      setInteracted(false);
      setTermEpoch((n) => n + 1);
      setPhase("running");
    },
    [kind, spec.builder, startTerminal, startConsole, startBuilder],
  );

  // ---- task verification (ISC-90) -------------------------------------------------

  const revealsUsedFor = useCallback(
    (taskId: string): number => {
      const task = spec.tasks.find((t) => t.id === taskId);
      const open = hintsOpen[taskId] ?? 0;
      if (!task) return 0;
      return task.hints.slice(0, open).filter((h) => "reveal" in h).length;
    },
    [spec.tasks, hintsOpen],
  );

  const verifyTasks = useCallback(() => {
    // Probe + context per surface kind: terminals are their own probe; console/builder
    // hosts expose one (same closed registry drives every engine class).
    const session: ProbeSession | null =
      kind === "terminal"
        ? sessionRef.current
        : kind === "console"
          ? (consoleRef.current?.probeSession() ?? null)
          : (builderRef.current?.probeSession() ?? null);
    if (!session) return;
    const extras: Omit<VerifyContext, "expectations" | "expectationKey"> = {
      engineResult: consoleRef.current?.lastResult() ?? null,
      validatorRun: builderRef.current?.lastValidatorRun() ?? null,
      mappingScore: builderRef.current?.lastMappingScore() ?? null,
      apiExchanges: apiRef.current?.probes() ?? [],
      repoState: gitRef.current?.repoState() ?? null,
    };
    setTaskRecords((prev) => {
      const next = { ...prev };
      let newGap: { taskId: string; text: string } | null = null;
      for (const task of spec.tasks) {
        if (next[task.id]) continue;
        if (task.type === "reflection") break; // reflections gate by saving, not by command
        let evidence: string[] = [];
        let failed: string | null = null;
        for (let i = 0; i < task.verify.length; i++) {
          try {
            const out = runCheck(session, task.verify[i] as AnyCheckParams, {
              expectations,
              expectationKey: `${task.id}:${i}`,
              ...extras,
            });
            if (!out.pass) {
              failed = out.gap;
              break;
            }
            evidence.push(out.evidence);
          } catch {
            failed = "this check couldn't run yet";
            break;
          }
        }
        if (failed !== null) {
          newGap = { taskId: task.id, text: failed };
          break;
        }
        next[task.id] = {
          taskId: task.id,
          completedAt: new Date().toISOString(),
          revealsUsed: revealsUsedFor(task.id),
          evidence: evidence.join(" · "),
        };
      }
      setGap(newGap);
      return next;
    });
  }, [kind, spec.tasks, expectations, revealsUsedFor]);

  const onCommandComplete = useCallback(() => {
    setInteracted(true);
    verifyTasks();
    setTick((n) => n + 1);
  }, [verifyTasks]);

  // ---- reflections (saved to labstate artifacts — ISC-131) ------------------------

  const saveReflection = useCallback(
    async (taskId: string) => {
      const content = (reflections[taskId] ?? "").trim();
      if (!content) return;
      const state = loadState();
      const key = `${spec.module}/${taskId}.md`;
      state.artifacts[key] = { content, savedAt: new Date().toISOString(), module: spec.module };
      await appendEvidence(state, "artifact-saved", key, content);
      saveState(state);
      setTaskRecords((prev) => ({
        ...prev,
        [taskId]: {
          taskId,
          completedAt: new Date().toISOString(),
          revealsUsed: 0,
          evidence: "reflection saved to your local artifact store",
        },
      }));
      setTick((n) => n + 1);
    },
    [reflections, spec.module],
  );

  // ---- hints (ISC-91/125) ----------------------------------------------------------

  const openNextHint = useCallback(
    (taskId: string, confirmReveal = false) => {
      const task = spec.tasks.find((t) => t.id === taskId);
      if (!task) return;
      const open = hintsOpen[taskId] ?? 0;
      if (open >= task.hints.length) return;
      const rung = task.hints[open];
      if ("reveal" in rung && !confirmReveal) {
        setPendingReveal(taskId);
        return;
      }
      if ("reveal" in rung) {
        const state = loadState();
        const ids = new Set(state.reveals[spec.id] ?? []);
        ids.add(taskId);
        state.reveals[spec.id] = [...ids];
        saveState(state);
      }
      setPendingReveal(null);
      setHintsOpen((prev) => ({ ...prev, [taskId]: open + 1 }));
      setTick((n) => n + 1);
    },
    [spec.tasks, spec.id, hintsOpen],
  );

  // ---- completion (ISC-93/125/129) ---------------------------------------------------

  const actionTasks = useMemo(() => spec.tasks.filter((t) => t.type === "action"), [spec.tasks]);
  const allActionsDone = actionTasks.every((t) => taskRecords[t.id]);
  const totalReveals = actionTasks.reduce((n, t) => n + (taskRecords[t.id]?.revealsUsed ?? 0), 0);
  const clean = totalReveals === 0;

  useEffect(() => {
    if (phase !== "running" || !allActionsDone || completionRecorded) return;
    setCompletionRecorded(true);
    (async () => {
      const state = loadState();
      const completion: ExerciseCompletion = {
        exerciseId: spec.id,
        module: spec.module,
        completedAt: new Date().toISOString(),
        clean,
        tasks: spec.tasks.map((t) => taskRecords[t.id]).filter((r): r is TaskRecord => !!r),
      };
      state.completions[spec.id] = completion;
      await appendEvidence(state, "exercise-completed", spec.id, completion);
      saveState(state);
      window.dispatchEvent(new CustomEvent("grc-lab-change"));
    })();
  }, [phase, allActionsDone, completionRecorded, clean, spec, taskRecords]);

  const downloadEvidencePack = useCallback(() => {
    const state = loadState();
    const pack = {
      format: "grcb-evidence-pack.v1",
      generatedAt: new Date().toISOString(),
      profile: state.profile,
      completions: state.completions,
      evidenceChain: state.evidenceChain,
      note: "Hash-chained and tamper-EVIDENT (any edit breaks the chain) — your evidence about your own learning.",
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evidence-pack.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ---- persistence (debounced 500ms; size-guarded — ISC-124) -----------------------

  useEffect(() => {
    if (phase !== "running") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const saved: SavedLab = {
        v: 1,
        ...(kind === "terminal" && sessionRef.current ? { snapshot: sessionRef.current.snapshot() } : {}),
        ...(kind === "console" && consoleRef.current ? { console: consoleRef.current.snapshot() } : {}),
        ...(kind === "builder" && builderRef.current ? { builder: builderRef.current.snapshot() } : {}),
        tasks: taskRecords,
        hints: hintsOpen,
        reflections,
        coachDismissed,
      };
      const outcome = persist(persistKey, JSON.stringify(saved));
      setStorageWarning(outcome.ok ? null : STORAGE_WARNINGS[outcome.reason]);
      if (outcome.ok) setHasSaved(true);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [phase, kind, tick, taskRecords, hintsOpen, reflections, coachDismissed, persistKey]);

  // ---- restore / reset (ISC-117 / ISC-92) -------------------------------------------

  const restoreLabFiles = useCallback(() => {
    if (kind === "console" && consoleRef.current) {
      consoleRef.current.restoreSeedFiles();
      setToast("Lab files restored from seed. Your run history and completed tasks are untouched.");
      setTermEpoch((n) => n + 1); // remount the console so the buffer reflects the seed
      setTick((n) => n + 1);
      return;
    }
    if (kind === "builder" && builderRef.current) {
      builderRef.current.workspace.resetAll();
      setToast("Workspace files restored from seed. Completed tasks are untouched.");
      setTermEpoch((n) => n + 1);
      setTick((n) => n + 1);
      return;
    }
    const session = sessionRef.current;
    if (!session) return;
    const ext = session as unknown as {
      reseedFiles?: (seed: SeedSpec) => void;
      writeFileAs?: (path: string, content: string, producedBy: string) => void;
    };
    if (typeof ext.reseedFiles === "function") {
      ext.reseedFiles(seed);
    } else if (typeof ext.writeFileAs === "function") {
      for (const f of seed.files) {
        if (!f.dir && f.content !== undefined) ext.writeFileAs(f.path, f.content, "lab-restore");
      }
    } else {
      setToast("This engine build can't restore files in place yet — use Reset exercise if needed.");
      return;
    }
    setToast("Lab files restored from seed. Your history and completed tasks are untouched.");
    setTick((n) => n + 1);
  }, [kind, seed]);

  const resetExercise = useCallback(() => {
    const recreate = recreateRef.current;
    if (!recreate) return;
    removePersisted(persistKey);
    void Promise.resolve(recreate()).then(() => {
      setTaskRecords({});
      setHintsOpen({});
      setReflections({});
      setGap(null);
      setEditorFile(null);
      setResetConfirm(false);
      setCompletionRecorded(false);
      setInteracted(false);
      setTermEpoch((n) => n + 1);
      setToast("Exercise reset to its seed state.");
    });
  }, [persistKey]);

  // ---- progressive disclosure ------------------------------------------------------

  const firstIncomplete = spec.tasks.findIndex((t) => !taskRecords[t.id]);
  const visibleTasks = firstIncomplete === -1 ? spec.tasks : spec.tasks.slice(0, firstIncomplete + 1);
  const currentTaskId = firstIncomplete === -1 ? null : spec.tasks[firstIncomplete].id;

  // ---- render ------------------------------------------------------------------------

  if (phase === "intro" || phase === "loading" || phase === "engine-missing" || phase === "engine-unsupported") {
    return (
      <div className="glass-card p-6 sm:p-8 max-w-3xl">
        <h2 className="text-xl font-semibold text-ink">Before you start</h2>
        <p className="mt-3 text-ink-soft whitespace-pre-line leading-relaxed">{spec.intro.trim()}</p>
        {spec.desktop_recommended && (
          <p className="mt-3 text-sm text-orange-bright">
            This exercise loads a heavier engine — a desktop-class browser is recommended.
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {hasSaved && (
            <button type="button" className="btn btn-primary" onClick={() => void start(true)} disabled={phase === "loading"}>
              Resume where you left off
            </button>
          )}
          <button
            type="button"
            className={"btn " + (hasSaved ? "btn-ghost" : "btn-primary")}
            onClick={() => void start(false)}
            disabled={phase === "loading"}
          >
            {hasSaved ? "Start fresh" : "Start the lab"}
          </button>
          {phase === "loading" && <span className="text-sm text-ink-dim">Loading the shell engine…</span>}
        </div>
        {phase === "engine-missing" && (
          <p className="mt-4 text-sm text-orange-bright" role="alert">
            The shell engine isn't bundled in this build yet — it's landing in a parallel change. The lab UI is
            ready; check back after the next deploy.
          </p>
        )}
        {phase === "engine-unsupported" && (
          <p className="mt-4 text-sm text-orange-bright" role="alert">
            This exercise uses the <span className="font-mono">{spec.engine}</span> engine class, which ships in a
            later wave. The module's lab section describes the real-machine path meanwhile.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @keyframes grcb-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
        .grcb-check-pop { animation: grcb-pop .35s cubic-bezier(.22,1,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .grcb-check-pop { animation: none; } }
      `}</style>

      {(storageWarning || toast) && (
        <div className="mb-4 space-y-2">
          {storageWarning && (
            <p role="alert" className="glass rounded-xl px-4 py-2.5 text-sm text-orange-bright border border-orange/30">
              {storageWarning}
            </p>
          )}
          {toast && (
            <p role="status" className="glass rounded-xl px-4 py-2.5 text-sm text-ink-soft flex items-center justify-between gap-3">
              <span>{toast}</span>
              <button type="button" className="text-ink-dim hover:text-ink text-xs" onClick={() => setToast(null)}>
                Dismiss
              </button>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ---- task rail ---- */}
        <section aria-label="Tasks" className="order-1">
          <ol className="space-y-3">
            {visibleTasks.map((task, idx) => {
              const done = !!taskRecords[task.id];
              const isCurrent = task.id === currentTaskId;
              const open = hintsOpen[task.id] ?? 0;
              return (
                <li key={task.id} className={"glass rounded-xl p-4 " + (isCurrent ? "border border-orange/40" : "")}>
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        "grid place-items-center w-6 h-6 rounded-full shrink-0 text-xs font-semibold mt-0.5 " +
                        (done ? "bg-gradient-brand text-white grcb-check-pop" : "bg-[color:var(--tint-strong)] text-ink-soft")
                      }
                      aria-hidden="true"
                    >
                      {done ? (
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink leading-relaxed">
                        <span className="sr-only">{done ? "Completed task" : isCurrent ? "Current task" : "Task"}: </span>
                        <InlineCode text={task.instruction.trim()} />
                      </p>

                      {done && taskRecords[task.id].evidence && (
                        <p className="mt-2 text-xs font-mono text-blue-bright/90 break-words">
                          <span className="text-ink-dim">evidence: </span>
                          {taskRecords[task.id].evidence}
                        </p>
                      )}
                      {done && task.explain && (
                        <p className="mt-2 text-xs text-ink-dim leading-relaxed">
                          <InlineCode text={task.explain.trim()} />
                        </p>
                      )}

                      {isCurrent && gap && gap.taskId === task.id && (
                        <p className="mt-2 text-xs text-orange-bright" role="status">
                          Not yet: <InlineCode text={gap.text} />
                        </p>
                      )}

                      {/* reflection input */}
                      {task.type === "reflection" && !done && (
                        <div className="mt-3">
                          <textarea
                            value={reflections[task.id] ?? ""}
                            onChange={(e) => setReflections((p) => ({ ...p, [task.id]: e.target.value }))}
                            rows={5}
                            aria-label="Your reflection"
                            className="w-full glass rounded-lg p-3 text-sm text-ink bg-transparent outline-none focus:border-orange/50"
                            placeholder="Write it as if explaining to a non-technical colleague…"
                          />
                          <button
                            type="button"
                            className="mt-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-brand text-white disabled:opacity-50"
                            disabled={!(reflections[task.id] ?? "").trim()}
                            onClick={() => void saveReflection(task.id)}
                          >
                            Save reflection
                          </button>
                        </div>
                      )}

                      {/* hint ladder */}
                      {!done && task.hints.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {task.hints.slice(0, open).map((h, i) => (
                            <p
                              key={i}
                              className={
                                "text-xs leading-relaxed rounded-lg px-3 py-2 " +
                                ("reveal" in h
                                  ? "bg-orange/10 text-ink-soft border border-orange/25"
                                  : "bg-[color:var(--tint)] text-ink-soft")
                              }
                            >
                              <span className="font-semibold text-ink-dim uppercase tracking-wide text-[10px] mr-1.5">
                                {hintLabel(h)}
                              </span>
                              <InlineCode text={hintText(h)} />
                            </p>
                          ))}
                          {open < task.hints.length &&
                            (pendingReveal === task.id ? (
                              <span className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                                Reveal the answer? It's recorded in your completion record (honest, not shaming).
                                <button
                                  type="button"
                                  autoFocus
                                  className="px-2.5 py-1 rounded-lg font-semibold bg-gradient-brand text-white"
                                  onClick={() => openNextHint(task.id, true)}
                                >
                                  Reveal
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 py-1 rounded-lg text-ink-dim hover:text-ink"
                                  onClick={() => setPendingReveal(null)}
                                >
                                  Not yet
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[color:var(--tint)] text-ink-soft border border-[color:var(--hairline)] hover:border-orange/40"
                                onClick={() => openNextHint(task.id)}
                              >
                                {hintLabel(task.hints[open]) === "reveal"
                                  ? "Reveal the answer…"
                                  : `Hint ${open + 1} of ${task.hints.length}`}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {firstIncomplete !== -1 && spec.tasks.length > visibleTasks.length && (
            <p className="mt-3 text-xs text-ink-dim">
              {spec.tasks.length - visibleTasks.length} more task{spec.tasks.length - visibleTasks.length === 1 ? "" : "s"} unlock as you go.
            </p>
          )}

          {/* completion card (ISC-129) */}
          {allActionsDone && (
            <div className="glass-card p-5 mt-4">
              <h3 className="text-lg font-semibold text-gradient inline-block">
                {clean ? "Clean run — exercise complete" : "Exercise complete"}
              </h3>
              <p className="mt-2 text-sm text-ink-soft leading-relaxed">
                {clean
                  ? "Every task verified against the simulated machine without a single revealed answer. The same commands on a real machine produce the same results."
                  : `Every task verified against the simulated machine. ${totalReveals} answer${totalReveals === 1 ? " was" : "s were"} revealed along the way — recorded honestly in your local record; re-run it clean any time with Reset.`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary text-sm" onClick={downloadEvidencePack}>
                  Download evidence pack
                </button>
              </div>
            </div>
          )}

          {/* quiet controls (ISC-117 / ISC-92) */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className="px-2.5 py-1.5 rounded-lg text-ink-dim hover:text-ink bg-[color:var(--tint)] border border-[color:var(--hairline)]"
              onClick={restoreLabFiles}
            >
              Restore lab files
            </button>
            {resetConfirm ? (
              <span className="flex flex-wrap items-center gap-2 glass rounded-lg px-3 py-1.5 text-ink-soft" role="alertdialog" aria-label="Confirm reset">
                Reset wipes the simulated machine AND your task progress here. Sure?
                <button type="button" autoFocus className="px-2 py-1 rounded font-semibold text-orange-bright hover:text-orange" onClick={resetExercise}>
                  Yes, reset
                </button>
                <button type="button" className="px-2 py-1 rounded text-ink-dim hover:text-ink" onClick={() => setResetConfirm(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg text-ink-dim hover:text-ink bg-[color:var(--tint)] border border-[color:var(--hairline)]"
                onClick={() => setResetConfirm(true)}
              >
                Reset exercise
              </button>
            )}
          </div>
        </section>

        {/* ---- terminal / editor ---- */}
        <section
          aria-label={kind === "terminal" ? "Simulated terminal" : kind === "console" ? "Code console" : "Guided builder"}
          className="order-2 min-w-0"
        >
          {/* coach layer — OUTSIDE the terminal stream (ISC-115/116) */}
          {spec.walkthrough_first_input && !coachDismissed && !interacted && (
            <div className="glass-card p-4 mb-4 flex items-start gap-3">
              <span aria-hidden="true" className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-brand-soft shrink-0">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-bright">
                  <path d="M10 1a6 6 0 0 0-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 0 0 .572.729 6.016 6.016 0 0 0 2.856 0A.75.75 0 0 0 12 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0 0 10 1ZM8.863 17.414a.75.75 0 0 0-.226 1.483 9.066 9.066 0 0 0 2.726 0 .75.75 0 0 0-.226-1.483 7.553 7.553 0 0 1-2.274 0Z" />
                </svg>
              </span>
              <p className="text-sm text-ink-soft leading-relaxed flex-1">
                First time in a terminal? Try typing <InlineCode text={`\`${spec.walkthrough_first_input}\``} /> and
                press Enter. The transcript below is exactly what the real machine would say — nothing in it is
                narration.
              </p>
              <button
                type="button"
                aria-label="Dismiss tip"
                className="text-ink-dim hover:text-ink shrink-0"
                onClick={() => {
                  setCoachDismissed(true);
                  setTick((n) => n + 1);
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          )}

          {kind === "terminal" && sessionRef.current && (
            <>
              <div className={editorFile ? "hidden" : undefined}>
                <Terminal
                  key={termEpoch}
                  ref={termRef}
                  session={sessionRef.current}
                  onCommandComplete={onCommandComplete}
                  onOpenEditor={
                    bashWorld || spec.engine === "powershell"
                      ? (fileArg) => setEditorFile(fileArg)
                      : undefined
                  }
                  onActivity={() => setInteracted(true)}
                  promptMode={spec.engine === "powershell" ? "ps" : "bash"}
                  label={
                    spec.engine === "powershell"
                      ? "labuser@WIN-LAB04 — Windows PowerShell 5.1"
                      : spec.engine === "shell-macos"
                        ? "analyst@mac"
                        : "analyst@workstation"
                  }
                />
              </div>
              {editorFile && (
                <EditorPanel
                  session={sessionRef.current}
                  fileArg={editorFile}
                  onClose={(wrote) => {
                    setEditorFile(null);
                    if (wrote) verifyTasks();
                    setTick((n) => n + 1);
                    requestAnimationFrame(() => termRef.current?.focus());
                  }}
                />
              )}
              {spec.engine === "api" && <ApiInspector exchange={apiRef.current?.last() ?? null} />}
            </>
          )}

          {kind === "console" && consoleRef.current && (
            <EditorConsole
              key={termEpoch}
              engineId={spec.engine as ConsoleEngineId}
              flavor={spec.console?.flavor}
              host={consoleRef.current}
              runLabel={spec.console?.run_label}
              onRan={onCommandComplete}
            />
          )}

          {kind === "builder" && builderRef.current && (
            <BuilderSurface key={termEpoch} host={builderRef.current} spec={spec} onChanged={onCommandComplete} />
          )}

          <p className="mt-3 text-xs text-ink-dim">
            {kind === "terminal" &&
              "This simulated machine runs the same seed files and tools the real capture container ran. Output is verified against reality, never invented. Paste works; there are no run-it-for-me buttons on purpose."}
            {kind === "console" &&
              "This is the real engine, compiled to WebAssembly and served from this site — your code genuinely runs. Output is the engine's own, never invented."}
            {kind === "builder" &&
              "Every verdict here comes from the module's own validator, ported byte-for-byte from the repo's lab checks — the UI never re-implements a check."}
          </p>
        </section>
      </div>
    </div>
  );
}
