/**
 * Points + badges summary island (web ISA ISC-139).
 * Pure derivation: deriveBadges(state, specs, defs) — recomputed on every render from
 * browser-local completion state; nothing is awarded-and-stored.
 */
import { useEffect, useState } from "react";
import { deriveBadges, type BadgeDef, type PointsConfig, type SpecInfo } from "../../lib/badges";
import { emptyState, loadState, type LearnerState } from "../../lib/labstate";

interface BadgeRailProps {
  specs: SpecInfo[];
  defs: BadgeDef[];
  points: PointsConfig;
}

export default function BadgeRail({ specs, defs, points }: BadgeRailProps) {
  const [state, setState] = useState<LearnerState>(() => emptyState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setState(loadState());
      setReady(true);
    };
    refresh();
    window.addEventListener("grc-lab-change", refresh);
    return () => window.removeEventListener("grc-lab-change", refresh);
  }, []);

  const derived = deriveBadges(state, specs, defs, points);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-ink">
          Your badges
          {state.profile.displayName ? <span className="text-ink-dim font-normal"> · {state.profile.displayName}</span> : null}
        </h3>
        <span className="font-mono text-sm text-gradient inline-block">
          {ready ? derived.points : 0} pts
        </span>
      </div>
      <p className="text-xs text-ink-dim mt-1">
        Derived from your completions ({derived.completedCount} done, {derived.cleanCount} clean) — recomputable,
        browser-local, no leaderboard.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...derived.earned.map((b) => ({ b, earned: true })), ...derived.locked.map((b) => ({ b, earned: false }))].map(
          ({ b, earned }) => (
            <li
              key={b.id}
              className={
                "rounded-xl px-3 py-2.5 border " +
                (earned
                  ? "border-orange/35 bg-gradient-brand-soft"
                  : "border-[color:var(--hairline)] bg-[color:var(--tint)] opacity-75")
              }
            >
              <p className={"text-sm font-semibold " + (earned ? "text-ink" : "text-ink-dim")}>
                <span aria-hidden="true" className="mr-1">{earned ? "★" : "☆"}</span>
                {b.name}
                <span className="sr-only">{earned ? " (earned)" : " (locked)"}</span>
              </p>
              <p className="text-xs text-ink-dim mt-0.5 leading-snug">{b.description}</p>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
