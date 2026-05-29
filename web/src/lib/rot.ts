// Curriculum rot status — mirrors the CLI dashboard semantics (.ci/lib.ts rotStatus):
// overdue = red, due within 30 days = amber, else green.
export type RotLevel = "green" | "amber" | "red" | "unknown";

export interface RotStatus {
  level: RotLevel;
  emoji: string;
  label: string;
}

export function rotStatus(reviewDue: string | undefined, asOf: Date): RotStatus {
  if (!reviewDue) return { level: "unknown", emoji: "⚪", label: "unknown" };
  const due = new Date(reviewDue).getTime();
  if (Number.isNaN(due)) return { level: "unknown", emoji: "⚪", label: "unknown" };
  const days = Math.round((due - asOf.getTime()) / 86_400_000);
  if (days < 0) return { level: "red", emoji: "🔴", label: `overdue ${-days}d` };
  if (days <= 30) return { level: "amber", emoji: "🟡", label: `due ${days}d` };
  return { level: "green", emoji: "🟢", label: `ok ${days}d` };
}
