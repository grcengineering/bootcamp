/**
 * Editor/console surface for the real-WASM engines (web ISA ISC-67..72, ISC-135):
 * an editable code buffer + Run button + output region, driving an EngineAdapter that
 * is LAZY-LOADED with a visible progress bar when the surface mounts (reading pages
 * never pay; ISC-100). Output is the real engine's stdout/stderr/exit — never authored.
 *
 * A11y mirrors the Terminal's contract: output lives in a non-live region a virtual
 * cursor can walk; a separate polite announcer summarizes each completed run; stderr is
 * border-marked + sr-labeled, never color-only; everything is keyboard operable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineAdapter, EngineRunResult } from "../../engines/adapters";
import { ENGINE_BUDGETS } from "../../engines/budgets";
import type { ConsoleHost } from "./sessions/console-host";

export type ConsoleEngineId = "python" | "sql" | "policy" | "jq";

interface EditorConsoleProps {
  engineId: ConsoleEngineId;
  /** policy flavor: cedar (live authoring, default) | opa (precompiled + input mutation). */
  flavor?: "cedar" | "opa";
  host: ConsoleHost;
  runLabel?: string;
  /** Called after every completed run — the player re-verifies tasks here. */
  onRan: () => void;
  /** Injected adapter factory (tests); defaults to the lazy browser loaders. */
  makeAdapter?: (engineId: ConsoleEngineId, flavor?: "cedar" | "opa") => Promise<EngineAdapter>;
}

/** Lazy browser-side adapter constructors — each import is its own code-split chunk. */
async function defaultMakeAdapter(engineId: ConsoleEngineId, flavor?: "cedar" | "opa"): Promise<EngineAdapter> {
  switch (engineId) {
    case "sql": {
      const m = await import("../../engines/sql");
      return new m.SqlEngineAdapter({}); // default same-origin /engines/sql-wasm.wasm
    }
    case "jq": {
      const m = await import("../../engines/jq");
      return new m.JqEngineAdapter();
    }
    case "python": {
      const m = await import("../../engines/python/browser");
      return new m.PythonWorkerAdapter();
    }
    case "policy": {
      const [core, glue] = await Promise.all([
        import("../../engines/policy"),
        import("../../engines/policy/browser"),
      ]);
      if (flavor === "opa") return new core.OpaEngineAdapter({ wasmBytes: () => glue.browserOpaPolicyBytes() });
      return new core.CedarEngineAdapter(() => glue.browserCedarLoader());
    }
  }
}

const SIZE_HINTS: Record<ConsoleEngineId, string> = {
  python: sizeHint("python"),
  sql: sizeHint("sql"),
  policy: sizeHint("cedar"),
  jq: sizeHint("jq"),
};

function sizeHint(budgetKey: string): string {
  const b = ENGINE_BUDGETS[budgetKey];
  if (!b || b.budgetBytes === 0) return "";
  const mb = b.budgetBytes / 1_000_000;
  return mb >= 1 ? `~${mb.toFixed(0)} MB` : `~${Math.round(b.budgetBytes / 1000)} KB`;
}

const RUN_LABELS: Record<ConsoleEngineId, string> = {
  python: "Run script",
  sql: "Run query",
  policy: "Evaluate policy",
  jq: "Run filter",
};

type LoadState = "loading" | "ready" | "error";

export default function EditorConsole({ engineId, flavor, host, runLabel, onRan, makeAdapter }: EditorConsoleProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string>("");
  const [buffer, setBuffer] = useState(() => host.read(host.mainFile) ?? "");
  const [result, setResult] = useState<EngineRunResult | null>(() => host.lastResult());
  const [running, setRunning] = useState(false);
  const [announce, setAnnounce] = useState("");
  const adapterRef = useRef<EngineAdapter | null>(null);

  // ISC-135: prefetch + instantiate with a visible progress affordance on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const adapter = await (makeAdapter ?? defaultMakeAdapter)(engineId, flavor);
        await adapter.load();
        if (!alive) return;
        adapterRef.current = adapter;
        setLoadState("ready");
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoadState("error");
      }
    })();
    return () => {
      alive = false;
      // one-heavy-engine-at-a-time teardown (ISC-135) — workers release their memory
      (adapterRef.current as { dispose?: () => void } | null)?.dispose?.();
      adapterRef.current = null;
    };
  }, [engineId, flavor, makeAdapter]);

  const run = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || running) return;
    host.write(host.mainFile, buffer);
    setRunning(true);
    try {
      const r = await host.run(adapter);
      setResult(r);
      const lines = (r.stdout + r.stderr).split("\n").filter((l) => l !== "").length;
      setAnnounce((prev) => {
        const msg = `Run finished, ${lines} ${lines === 1 ? "line" : "lines"} of output, exit code ${r.exit}.`;
        return prev === msg ? msg + "​" : msg;
      });
      onRan();
    } finally {
      setRunning(false);
    }
  }, [buffer, host, onRan, running]);

  const assetNames = host.fileNames().filter((n) => n !== host.mainFile);

  return (
    <div className="glass rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[color:var(--hairline)] bg-[color:var(--tint)]">
        <span className="font-mono text-xs text-ink-dim">
          {host.mainFile} — real {engineId === "policy" ? (flavor === "opa" ? "OPA (precompiled policy)" : "Cedar") : engineId} engine, in your browser
        </span>
        {loadState === "ready" && (
          <button
            type="button"
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white disabled:opacity-50"
            onClick={() => void run()}
            disabled={running}
          >
            {running ? "Running…" : (runLabel ?? RUN_LABELS[engineId])}
          </button>
        )}
      </div>

      {loadState === "loading" && (
        <div className="px-4 py-3" role="status">
          <p className="text-sm text-ink-soft">
            Loading the {engineId} engine {SIZE_HINTS[engineId] && <span className="text-ink-dim">({SIZE_HINTS[engineId]}, served from this site — nothing third-party)</span>}…
          </p>
          <div
            className="mt-2 h-1.5 rounded-full bg-[color:var(--tint-strong)] overflow-hidden"
            role="progressbar"
            aria-label={`Loading the ${engineId} engine`}
            aria-valuetext="loading"
          >
            <div className="h-full w-1/3 rounded-full bg-gradient-brand grcb-progress-slide" />
          </div>
          <style>{`
            .grcb-progress-slide { animation: grcb-slide 1.2s ease-in-out infinite alternate; }
            @keyframes grcb-slide { from { transform: translateX(0); } to { transform: translateX(200%); } }
            @media (prefers-reduced-motion: reduce) { .grcb-progress-slide { animation: none; width: 100%; } }
          `}</style>
        </div>
      )}
      {loadState === "error" && (
        <p className="px-4 py-3 text-sm text-orange-bright" role="alert">
          The {engineId} engine failed to load: {loadError}. Reload the page to retry — the lab's real-machine
          path in the module text works regardless.
        </p>
      )}

      <label className="sr-only" htmlFor={`grcb-console-${engineId}`}>
        {host.mainFile} contents
      </label>
      <textarea
        id={`grcb-console-${engineId}`}
        value={buffer}
        onChange={(e) => {
          setBuffer(e.target.value);
          host.write(host.mainFile, e.target.value);
        }}
        rows={Math.min(20, Math.max(8, buffer.split("\n").length + 1))}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="w-full bg-transparent border-0 outline-none font-mono text-[13px] text-ink px-4 py-3 leading-relaxed resize-y"
      />

      {assetNames.length > 0 && (
        <details className="px-4 pb-3">
          <summary className="text-xs text-ink-dim cursor-pointer">
            Exercise assets passed to every run ({assetNames.join(", ")})
          </summary>
          {assetNames.map((n) => (
            <pre key={n} className="mt-2 text-xs font-mono text-ink-soft overflow-x-auto whitespace-pre p-3 rounded-lg bg-[color:var(--tint)]">
              <span className="text-ink-dim">{"// " + n + "\n"}</span>
              {host.read(n)}
            </pre>
          ))}
        </details>
      )}

      <div className="border-t border-[color:var(--hairline)] px-4 py-3 min-h-[6rem]">
        <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Engine output</h3>
        {result === null ? (
          <p className="mt-2 text-xs text-ink-dim">No runs yet — the output here comes from the real engine, nothing canned.</p>
        ) : (
          <div role="log" aria-live="off" aria-label="Engine output" className="mt-2 overflow-x-auto">
            {result.stdout !== "" && (
              <pre className="font-mono text-[13px] text-ink-soft whitespace-pre">{result.stdout.replace(/\n$/, "")}</pre>
            )}
            {result.stderr !== "" && (
              <pre className="font-mono text-[13px] text-ink-soft whitespace-pre border-l-2 border-orange/65 pl-2">
                <span className="sr-only">stderr: </span>
                {result.stderr.replace(/\n$/, "")}
              </pre>
            )}
            <p className="mt-1.5 text-xs font-mono text-ink-dim">exit {result.exit}</p>
          </div>
        )}
      </div>

      {/* decoupled polite announcer — one summary per run (Terminal a11y parity) */}
      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
