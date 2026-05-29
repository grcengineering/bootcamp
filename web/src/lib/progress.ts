// Per-learner progress — localStorage ONLY. There is no server; nothing here ever leaves the
// browser (ISC-21). This is the deliberate v1 boundary: no cross-learner cohort telemetry.
export type Status = "not-started" | "in-progress" | "complete" | "placed-out";

export const STATUSES: { value: Status; label: string }[] = [
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "placed-out", label: "Placed out" },
];

const KEY = (moduleId: string) => `grc-bootcamp:progress:${moduleId}`;
const TRACK_KEY = "grc-bootcamp:track";

export function getStatus(moduleId: string): Status {
  if (typeof localStorage === "undefined") return "not-started";
  return (localStorage.getItem(KEY(moduleId)) as Status) ?? "not-started";
}

export function setStatus(moduleId: string, status: Status): void {
  if (typeof localStorage === "undefined") return;
  if (status === "not-started") localStorage.removeItem(KEY(moduleId));
  else localStorage.setItem(KEY(moduleId), status);
  window.dispatchEvent(new CustomEvent("grc-progress-change"));
}

export function getAllStatuses(moduleIds: string[]): Record<string, Status> {
  const out: Record<string, Status> = {};
  for (const id of moduleIds) out[id] = getStatus(id);
  return out;
}

export function isDone(s: Status): boolean {
  return s === "complete" || s === "placed-out";
}

export function getTrack(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TRACK_KEY);
}

export function setTrack(track: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TRACK_KEY, track);
  window.dispatchEvent(new CustomEvent("grc-track-change"));
}
