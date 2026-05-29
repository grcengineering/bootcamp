import { useEffect, useState } from "react";
import { getTrack, setTrack } from "../lib/progress";

interface T {
  id: string;
  title: string;
}

export default function TrackPicker({ tracks }: { tracks: T[] }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => setCurrent(getTrack()), []);

  const choose = (id: string) => {
    setTrack(id);
    setCurrent(id);
  };

  return (
    <div className="not-prose">
      <div className="flex flex-wrap gap-2">
        {tracks.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => choose(t.id)}
              className={
                "px-3 py-1.5 rounded-lg text-sm border transition " +
                (active
                  ? "bg-gradient-brand text-white border-transparent shadow-lg shadow-blue/20"
                  : "bg-[color:var(--tint)] text-ink-soft border-[color:var(--hairline)] hover:border-orange/40")
              }
            >
              {t.title}
            </button>
          );
        })}
      </div>
      {current && (
        <p className="text-sm text-ink-dim mt-3">
          Your track is set to <strong className="text-ink">{tracks.find((t) => t.id === current)?.title ?? current}</strong>.
          It shows on your <a href="dashboard" className="text-blue-bright hover:text-orange">dashboard</a>.
        </p>
      )}
    </div>
  );
}
