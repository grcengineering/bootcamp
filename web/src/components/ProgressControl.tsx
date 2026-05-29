import { useEffect, useState } from "react";
import { getStatus, setStatus, STATUSES, type Status } from "../lib/progress";

export default function ProgressControl({ moduleId }: { moduleId: string }) {
  const [status, setLocal] = useState<Status>("not-started");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocal(getStatus(moduleId));
    setReady(true);
  }, [moduleId]);

  const choose = (s: Status) => {
    setStatus(moduleId, s);
    setLocal(s);
  };

  return (
    <div className="glass rounded-xl p-4 not-prose">
      <div className="text-sm font-medium text-ink mb-2.5">
        Your progress{!ready && <span className="text-ink-dim"> …</span>}
      </div>
      <div role="group" aria-label="Module progress" className="flex flex-wrap gap-2">
        {STATUSES.map(({ value, label }) => {
          const active = status === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(value)}
              className={
                "px-3 py-1.5 rounded-lg text-sm border transition " +
                (active
                  ? "bg-gradient-brand text-white border-transparent shadow-lg shadow-blue/20"
                  : "bg-white/5 text-ink-soft border-white/10 hover:border-orange/40")
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-dim mt-2.5">
        Tip: if you can produce the §7 artifact unaided, mark <strong className="text-ink-soft">Placed out</strong> and move on.
      </p>
    </div>
  );
}
