// Curriculum rot status — mirrors the CLI dashboard semantics (.ci/lib.ts rotStatus):
// overdue = red, due within 30 days = amber, else green. Icons are Heroicons names.
export type RotLevel = "green" | "amber" | "red" | "unknown";

export interface RotStatus {
  level: RotLevel;
  icon: string; // Heroicons (iconify) name
  label: string;
}

export function rotStatus(reviewDue: string | undefined, asOf: Date): RotStatus {
  if (!reviewDue) return { level: "unknown", icon: "heroicons:question-mark-circle-solid", label: "unknown" };
  const due = new Date(reviewDue).getTime();
  if (Number.isNaN(due)) return { level: "unknown", icon: "heroicons:question-mark-circle-solid", label: "unknown" };
  const days = Math.round((due - asOf.getTime()) / 86_400_000);
  if (days < 0) return { level: "red", icon: "heroicons:exclamation-triangle-solid", label: `overdue ${-days}d` };
  if (days <= 30) return { level: "amber", icon: "heroicons:clock-solid", label: `due ${days}d` };
  return { level: "green", icon: "heroicons:check-circle-solid", label: `ok ${days}d` };
}

// DS status tokens (flip per theme): pass=green, risk=amber, fail=red. Orange is brand, not a status.
export const ROT_COLOR: Record<RotLevel, string> = {
  green: "text-[color:var(--status-pass-fg)]",
  amber: "text-[color:var(--status-risk-fg)]",
  red: "text-[color:var(--status-fail-fg)]",
  unknown: "text-ink-dim",
};
