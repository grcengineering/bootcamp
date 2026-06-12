/**
 * Builder surface renderer (web ISA ISC-80..88, UI side) — renders the BuilderHost's
 * widget model per spec.builder.surface:
 *   workspace     editable files + ported-validator run button (00/08/10/11/12/14)
 *   mapping       matching/mapping grid (10 crosswalk / 11 coverage map)
 *   scoring-grid  module-14 seven-stage BUILD/BUY/HYBRID grid + memo assembly
 *   ccm           module-13 dashboard tile + declared time-compression controls
 *   capstone      module-15 checklist + manifest editor + artifact binding
 *
 * Every verdict on screen is the ported validator's own output (ISC-137) — the UI never
 * re-implements a check. A11y: validator output is a non-live log region; a polite
 * announcer summarizes each run; tables are real tables; controls are native elements.
 */
import { useCallback, useMemo, useState } from "react";
import {
  DECIDING_QUESTIONS,
  LOOP_STAGES,
  VALID_CALLS,
  type LoopStage,
  type ValidatorRun,
} from "../../engines/builders";
import type { ExerciseSpec } from "../../lib/exercise-spec";
import { loadState } from "../../lib/labstate";
import type { BuilderHost } from "./sessions/builder-host";

interface BuilderSurfaceProps {
  host: BuilderHost;
  spec: ExerciseSpec;
  /** Fired after any state change (the player re-verifies + persists). */
  onChanged: () => void;
}

function ValidatorOutput({ run }: { run: ValidatorRun | null }) {
  if (run === null)
    return <p className="mt-2 text-xs text-ink-dim">No runs yet — the verdict comes from the module's own validator, ported byte-for-byte.</p>;
  return (
    <div role="log" aria-live="off" aria-label="Validator output" className="mt-2 overflow-x-auto">
      {run.stdout !== "" && <pre className="font-mono text-[13px] text-ink-soft whitespace-pre">{run.stdout.replace(/\n$/, "")}</pre>}
      {run.stderr !== "" && (
        <pre className="font-mono text-[13px] text-ink-soft whitespace-pre border-l-2 border-orange/65 pl-2">
          <span className="sr-only">stderr: </span>
          {run.stderr.replace(/\n$/, "")}
        </pre>
      )}
      <p className="mt-1.5 text-xs font-mono text-ink-dim">exit {run.exit}</p>
    </div>
  );
}

export default function BuilderSurface({ host, spec, onChanged }: BuilderSurfaceProps) {
  const [selected, setSelected] = useState<string>(() => host.workspace.list()[0] ?? "");
  const [buffer, setBuffer] = useState<string>(() => (selected ? (host.workspace.read(selected) ?? "") : ""));
  const [lastRun, setLastRun] = useState<ValidatorRun | null>(null);
  const [announce, setAnnounce] = useState("");
  const [mappingVersion, setMappingVersion] = useState(0);
  const [tile, setTile] = useState(() => host.ccm?.dashboardTile() ?? null);
  const [checklist, setChecklist] = useState(() => host.capstone?.checklist() ?? null);

  const announceRun = useCallback((run: ValidatorRun) => {
    setAnnounce((prev) => {
      const msg = `Check finished, exit code ${run.exit}.`;
      return prev === msg ? msg + "​" : msg;
    });
  }, []);

  const pickFile = useCallback(
    (name: string) => {
      setSelected(name);
      setBuffer(host.workspace.read(name) ?? "");
    },
    [host],
  );

  const editBuffer = useCallback(
    (text: string) => {
      setBuffer(text);
      if (selected && !host.workspace.isReadOnly(selected)) {
        host.workspace.write(selected, text);
        onChanged();
      }
    },
    [selected, host, onChanged],
  );

  const runValidator = useCallback(() => {
    const run = host.runValidator();
    setLastRun(run);
    setMappingVersion((v) => v + 1);
    announceRun(run);
    onChanged();
  }, [host, announceRun, onChanged]);

  const surface = host.surface;

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[color:var(--hairline)] bg-[color:var(--tint)]">
        <span className="font-mono text-xs text-ink-dim">guided builder — verified by the module's own validator</span>
        {surface === "workspace" && (
          <button type="button" className="px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white" onClick={runValidator}>
            Run validator
          </button>
        )}
      </div>

      {/* ---- workspace + mapping share the editable-files panel ---- */}
      {(surface === "workspace" || surface === "mapping") && (
        <div className="px-4 py-3">
          {surface === "workspace" && (
            <>
              <div role="tablist" aria-label="Workspace files" className="flex flex-wrap gap-1.5">
                {host.workspace.list().map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={name === selected}
                    className={
                      "px-2.5 py-1 rounded-lg text-xs font-mono border " +
                      (name === selected
                        ? "border-orange/50 text-ink bg-[color:var(--tint-strong)]"
                        : "border-[color:var(--hairline)] text-ink-dim hover:text-ink")
                    }
                    onClick={() => pickFile(name)}
                  >
                    {name}
                    {host.workspace.isReadOnly(name) && <span className="text-ink-dim"> (read-only)</span>}
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="grcb-builder-buffer">{selected} contents</label>
              <textarea
                id="grcb-builder-buffer"
                value={buffer}
                onChange={(e) => editBuffer(e.target.value)}
                readOnly={selected !== "" && host.workspace.isReadOnly(selected)}
                rows={Math.min(24, Math.max(10, buffer.split("\n").length + 1))}
                spellCheck={false}
                className="mt-3 w-full bg-transparent border border-[color:var(--hairline)] rounded-lg outline-none focus:border-orange/50 font-mono text-[13px] text-ink px-3 py-2 leading-relaxed resize-y"
              />
              {selected !== "" && host.workspace.isDirty(selected) && !host.workspace.isReadOnly(selected) && (
                <button
                  type="button"
                  className="mt-2 px-2.5 py-1 rounded-lg text-xs text-ink-dim hover:text-ink bg-[color:var(--tint)] border border-[color:var(--hairline)]"
                  onClick={() => {
                    host.workspace.restoreFile(selected);
                    setBuffer(host.workspace.read(selected) ?? "");
                    onChanged();
                  }}
                >
                  Restore this file to its seed
                </button>
              )}
            </>
          )}

          {surface === "mapping" && host.mapping && (
            <MappingTable
              key={mappingVersion}
              host={host}
              onScore={() => {
                const run = host.runValidator();
                setLastRun(run);
                setMappingVersion((v) => v + 1);
                announceRun(run);
                onChanged();
              }}
            />
          )}

          <div className="mt-3 border-t border-[color:var(--hairline)] pt-2">
            <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Validator output</h3>
            <ValidatorOutput run={lastRun} />
          </div>
        </div>
      )}

      {/* ---- module 14: scoring grid ---- */}
      {surface === "scoring-grid" && host.grid && (
        <div className="px-4 py-3">
          <table className="w-full text-sm">
            <caption className="sr-only">Seven-loop-stage build/buy/hybrid scoring grid</caption>
            <thead>
              <tr className="text-left text-xs text-ink-dim">
                <th scope="col" className="py-1.5 pr-3">Stage</th>
                <th scope="col" className="py-1.5 pr-3">Deciding question</th>
                <th scope="col" className="py-1.5">Call</th>
              </tr>
            </thead>
            <tbody>
              {LOOP_STAGES.map((stage) => (
                <tr key={stage} className="border-t border-[color:var(--hairline)]">
                  <th scope="row" className="py-2 pr-3 font-mono text-xs text-ink text-left align-top">{stage}</th>
                  <td className="py-2 pr-3 text-xs text-ink-soft align-top">{DECIDING_QUESTIONS[stage as LoopStage]}</td>
                  <td className="py-2 align-top">
                    <select
                      aria-label={`${stage} call`}
                      value={host.grid!.call(stage as LoopStage) ?? ""}
                      onChange={(e) => {
                        host.grid!.setCall(stage as LoopStage, e.target.value);
                        setMappingVersion((v) => v + 1);
                        onChanged();
                      }}
                      className="bg-[color:var(--tint)] border border-[color:var(--hairline)] rounded-lg px-2 py-1 text-xs text-ink"
                    >
                      <option value="">— score it —</option>
                      {VALID_CALLS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="mt-3 px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white"
            onClick={() => {
              const run = host.validateGrid();
              setLastRun(run);
              announceRun(run);
              onChanged();
            }}
          >
            Validate scoring grid
          </button>
          <div className="mt-3 border-t border-[color:var(--hairline)] pt-2">
            <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Validator output</h3>
            <ValidatorOutput run={lastRun} />
          </div>
        </div>
      )}

      {/* ---- module 13: CCM dashboard tile + declared time compression ---- */}
      {surface === "ccm" && host.ccm && (
        <div className="px-4 py-3">
          <CcmPanel
            host={host}
            spec={spec}
            tile={tile}
            onTick={(n) => {
              const run = host.ccmTick(n);
              setLastRun(run);
              setTile(host.ccm!.dashboardTile());
              announceRun(run);
              onChanged();
            }}
            onMutate={() => {
              setTile(host.ccm!.dashboardTile());
              onChanged();
            }}
          />
          <div className="mt-3 border-t border-[color:var(--hairline)] pt-2">
            <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Latest scheduled run</h3>
            <ValidatorOutput run={lastRun} />
          </div>
        </div>
      )}

      {/* ---- module 15: capstone assembler ---- */}
      {surface === "capstone" && host.capstone && (
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">8-point contract checklist</h3>
          <ul className="mt-2 space-y-1">
            {(checklist ?? []).map((p) => (
              <li key={p.id} className="text-xs flex items-start gap-2">
                <span className={"font-mono " + (p.ok ? "text-blue-bright" : "text-orange-bright")}>
                  {p.ok ? "ok" : "—"}
                </span>
                <span className="text-ink-soft">
                  <span className="font-mono">{p.id}</span> · {p.detail}
                </span>
              </li>
            ))}
          </ul>

          <ArtifactBinder host={host} onBound={() => { setChecklist(host.capstone!.checklist()); onChanged(); }} />

          <label className="block mt-4 text-xs font-semibold text-ink-dim uppercase tracking-wide" htmlFor="grcb-capstone-manifest">
            capstone-manifest.yaml
          </label>
          <textarea
            id="grcb-capstone-manifest"
            defaultValue={host.capstone.manifest()}
            onChange={(e) => {
              host.capstone!.editManifest(e.target.value);
              onChanged();
            }}
            rows={14}
            spellCheck={false}
            className="mt-1 w-full bg-transparent border border-[color:var(--hairline)] rounded-lg outline-none focus:border-orange/50 font-mono text-[13px] text-ink px-3 py-2 leading-relaxed resize-y"
          />
          <button
            type="button"
            className="mt-2 px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white"
            onClick={() => {
              const run = host.validateCapstoneRepo();
              setLastRun(run);
              setChecklist(host.capstone!.checklist());
              announceRun(run);
              onChanged();
            }}
          >
            Validate capstone
          </button>
          <div className="mt-3 border-t border-[color:var(--hairline)] pt-2">
            <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Validator output</h3>
            <ValidatorOutput run={lastRun} />
          </div>
        </div>
      )}

      <div aria-live="polite" role="status" className="sr-only">{announce}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MappingTable({ host, onScore }: { host: BuilderHost; onScore: () => void }) {
  const m = host.mapping!;
  const score = host.lastMappingScore();
  const rows = useMemo(() => Array.from({ length: m.rowCount() }, (_, i) => m.row(i)), [m]);
  const [, force] = useState(0);
  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Mapping rows: assign a target and relationship to each item</caption>
        <thead>
          <tr className="text-left text-xs text-ink-dim">
            <th scope="col" className="py-1.5 pr-3">{m.header.slice(0, rows[0]?.left.length ?? 1).join(" / ")}</th>
            <th scope="col" className="py-1.5 pr-3">{m.header[rows[0]?.left.length ?? 1] ?? "target"}</th>
            <th scope="col" className="py-1.5">{m.header[(rows[0]?.left.length ?? 1) + 1] ?? "label"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[color:var(--hairline)]">
              <th scope="row" className="py-2 pr-3 font-mono text-xs text-ink-soft text-left align-top">{row.left.join(" · ")}</th>
              <td className="py-2 pr-3 align-top">
                <input
                  aria-label={`Target for ${row.left.join(" ")}`}
                  list="grcb-mapping-targets"
                  value={row.target}
                  onChange={(e) => {
                    m.setMapping(i, e.target.value, m.row(i).label);
                    force((v) => v + 1);
                  }}
                  className="w-full bg-[color:var(--tint)] border border-[color:var(--hairline)] rounded-lg px-2 py-1 text-xs font-mono text-ink"
                />
              </td>
              <td className="py-2 align-top">
                <input
                  aria-label={`Relationship for ${row.left.join(" ")}`}
                  list="grcb-mapping-labels"
                  value={row.label}
                  onChange={(e) => {
                    m.setMapping(i, m.row(i).target, e.target.value);
                    force((v) => v + 1);
                  }}
                  className="w-full bg-[color:var(--tint)] border border-[color:var(--hairline)] rounded-lg px-2 py-1 text-xs font-mono text-ink"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="grcb-mapping-targets">
        {m.targets.map((t) => <option key={t} value={t} />)}
      </datalist>
      <datalist id="grcb-mapping-labels">
        {m.labels.map((l) => <option key={l} value={l} />)}
      </datalist>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className="px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white" onClick={onScore}>
          Score &amp; validate
        </button>
        {score && (
          <span className="text-xs text-ink-soft">
            {score.correct} of {score.total} rows match the answer key
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CcmPanel({
  host,
  spec,
  tile,
  onTick,
  onMutate,
}: {
  host: BuilderHost;
  spec: ExerciseSpec;
  tile: ReturnType<NonNullable<BuilderHost["ccm"]>["dashboardTile"]> | null;
  onTick: (n: number) => void;
  onMutate: () => void;
}) {
  const ccm = host.ccm!;
  const driftBucket = spec.builder?.ccm?.drift_bucket ?? ccm.buckets()[0]?.name ?? "";
  const t = tile ?? ccm.dashboardTile();
  const verdictColor =
    t.current === "PASS" ? "text-blue-bright" : t.current === "NO-DATA" ? "text-ink-dim" : "text-orange-bright";
  return (
    <div>
      <div className="glass-card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="font-mono text-sm text-ink">{t.control}</h3>
          <span className={"font-semibold text-sm " + verdictColor}>
            {t.current}
            <span className="sr-only"> is the current verdict</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-dim">
          last checked: {t.lastCheckedAt ?? "never"} · {t.greenRuns} green / {t.redRuns} red in window
          {t.openAlerts.length > 0 && <> · open alerts: {t.openAlerts.join(", ")}</>}
        </p>
        {/* 30-day trend strip — text-paired, never color-only */}
        <div className="mt-2 flex gap-0.5" aria-label={`${t.history.length} runs in window: ${t.greenRuns} pass, ${t.redRuns} not passing`}>
          {t.history.map((h, i) => (
            <span
              key={i}
              title={`${h.capturedAt}: rc=${h.rc}`}
              className={"inline-block w-2 h-4 rounded-sm " + (h.rc === 0 ? "bg-blue/70" : "bg-orange/80")}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-dim">{t.timeCompression}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white" onClick={() => onTick(1)}>
          Run next scheduled check
        </button>
        <button type="button" className="px-3 py-1 rounded-lg text-xs text-ink-soft bg-[color:var(--tint)] border border-[color:var(--hairline)]" onClick={() => onTick(7)}>
          Advance a week
        </button>
        <button type="button" className="px-3 py-1 rounded-lg text-xs text-ink-soft bg-[color:var(--tint)] border border-[color:var(--hairline)]" onClick={() => onTick(30)}>
          Advance 30 days
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded-lg text-xs text-orange-bright bg-[color:var(--tint)] border border-orange/30"
          onClick={() => {
            ccm.injectDrift(driftBucket);
            onMutate();
          }}
        >
          Inject drift ({driftBucket})
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded-lg text-xs text-ink-soft bg-[color:var(--tint)] border border-[color:var(--hairline)]"
          onClick={() => {
            ccm.remediate(driftBucket);
            onMutate();
          }}
        >
          Remediate
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Bind prior-module artifacts from the local store into the capstone repo (ISC-131). */
function ArtifactBinder({ host, onBound }: { host: BuilderHost; onBound: () => void }) {
  const artifacts = useMemo(() => Object.entries(loadState().artifacts), []);
  const [pick, setPick] = useState("");
  const [path, setPath] = useState("");
  if (artifacts.length === 0)
    return (
      <p className="mt-3 text-xs text-ink-dim">
        No prior-module artifacts in your local store yet — earlier exercises save theirs here for this capstone.
      </p>
    );
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs text-ink-dim">
        Bind a prior artifact
        <select
          value={pick}
          onChange={(e) => {
            setPick(e.target.value);
            setPath(`evidence/${e.target.value.split("/").pop() ?? "artifact"}`);
          }}
          className="block mt-1 bg-[color:var(--tint)] border border-[color:var(--hairline)] rounded-lg px-2 py-1 text-xs text-ink max-w-[16rem]"
        >
          <option value="">— choose —</option>
          {artifacts.map(([k]) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-dim">
        at repo path
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="block mt-1 bg-[color:var(--tint)] border border-[color:var(--hairline)] rounded-lg px-2 py-1 text-xs font-mono text-ink"
        />
      </label>
      <button
        type="button"
        className="px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white disabled:opacity-50"
        disabled={pick === "" || path === ""}
        onClick={() => {
          const a = loadState().artifacts[pick];
          if (!a) return;
          host.capstone!.bindArtifact("portfolio", path, { name: pick, content: a.content, module: a.module });
          onBound();
        }}
      >
        Bind
      </button>
    </div>
  );
}
