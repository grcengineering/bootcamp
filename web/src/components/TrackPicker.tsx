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
                "px-3 py-1.5 rounded-md text-sm border transition " +
                (active
                  ? "bg-accent text-white border-accent"
                  : "bg-white text-ink-soft border-line hover:border-accent")
              }
            >
              {t.title}
            </button>
          );
        })}
      </div>
      {current && (
        <p className="text-sm text-ink-soft mt-3">
          Your track is set to <strong className="text-ink">{tracks.find((t) => t.id === current)?.title ?? current}</strong>.
          It shows on your <a href="dashboard">dashboard</a>.
        </p>
      )}
    </div>
  );
}
