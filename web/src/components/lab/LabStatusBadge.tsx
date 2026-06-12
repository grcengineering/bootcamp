/**
 * Per-exercise completion state chip for the /labs index cards (web ISA ISC-103).
 * Reads browser-local learner state only; pairs icon + text, never color alone.
 */
import { useEffect, useState } from "react";
import { loadState } from "../../lib/labstate";
import { loadPersisted } from "../../lib/persist";

type LabStatus = "not-started" | "in-progress" | "complete" | "complete-clean";

export default function LabStatusBadge({ exerciseId }: { exerciseId: string }) {
  const [status, setStatus] = useState<LabStatus | null>(null);

  useEffect(() => {
    const refresh = () => {
      const completion = loadState().completions[exerciseId];
      if (completion) setStatus(completion.clean ? "complete-clean" : "complete");
      else if (loadPersisted(`grcb.lab.${exerciseId}`) !== null) setStatus("in-progress");
      else setStatus("not-started");
    };
    refresh();
    window.addEventListener("grc-lab-change", refresh);
    return () => window.removeEventListener("grc-lab-change", refresh);
  }, [exerciseId]);

  if (status === null) return <span className="text-xs text-ink-dim">…</span>;

  const styles: Record<LabStatus, { cls: string; label: string; mark: string }> = {
    "not-started": { cls: "text-ink-dim border-[color:var(--hairline)]", label: "Not started", mark: "○" },
    "in-progress": { cls: "text-orange-bright border-orange/30", label: "In progress", mark: "◐" },
    complete: { cls: "text-blue-bright border-blue/30", label: "Complete", mark: "✓" },
    "complete-clean": { cls: "text-blue-bright border-blue/30", label: "Complete · clean run", mark: "✓" },
  };
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${s.cls}`}>
      <span aria-hidden="true">{s.mark}</span>
      {s.label}
    </span>
  );
}
