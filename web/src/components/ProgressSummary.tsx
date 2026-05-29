import { useEffect, useState } from "react";
import { getAllStatuses, getTrack, isDone, type Status } from "../lib/progress";

interface Mod {
  id: string;
  title: string;
  tier?: number;
}

export default function ProgressSummary({ modules }: { modules: Mod[] }) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [track, setTrack] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setStatuses(getAllStatuses(modules.map((m) => m.id)));
      setTrack(getTrack());
    };
    refresh();
    window.addEventListener("grc-progress-change", refresh);
    window.addEventListener("grc-track-change", refresh);
    return () => {
      window.removeEventListener("grc-progress-change", refresh);
      window.removeEventListener("grc-track-change", refresh);
    };
  }, [modules]);

  const done = modules.filter((m) => isDone(statuses[m.id] ?? "not-started")).length;
  const inProgress = modules.filter((m) => (statuses[m.id] ?? "not-started") === "in-progress").length;
  const pct = modules.length ? Math.round((done / modules.length) * 100) : 0;

  return (
    <div className="glass rounded-xl p-5 not-prose">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <span className="font-medium text-ink">
          Your progress{track ? <span className="text-ink-dim"> · track: {track}</span> : null}
        </span>
        <span className="font-mono text-sm text-ink-soft">
          {done}/{modules.length} done · {pct}%
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[color:var(--tint-strong)] overflow-hidden" role="img" aria-label={`${pct}% complete`}>
        <div className="h-full bg-gradient-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-ink-dim mt-3">
        {done} complete/placed-out · {inProgress} in progress · stored only in this browser (no account, no server).
      </div>
    </div>
  );
}
