/**
 * Module-02 renderers: journald/systemd timestamp + duration formats, pinned to the
 * docker-linux-booted captures (journal short format, `since … UTC; … ago`, Duration).
 */
import type { JournalEntry } from "./state";
import { M02 } from "./state";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const p2 = (n: number) => String(n).padStart(2, "0");

/** journalctl short format timestamp: "May 27 09:31:54" (UTC sim clock). */
export function fmtJournalTs(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** systemctl status timestamp: "Wed 2026-05-27 09:14:02 UTC". */
export function fmtSinceTs(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`;
}

/** Relative age ("6s ago", "5min ago") — systemd's coarse single-unit rendering, as captured. */
export function fmtAgo(nowMs: number, sinceMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
  if (s < 120) return `${s}s ago`;
  const min = Math.floor(s / 60);
  if (min < 120) return `${min}min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Active-period duration on a stopped unit ("120ms" shape per the stopped-status capture). */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min`;
}

/** One journal line: "May 27 09:31:54 web-01 sshd[1402]: …" (journalctl short format). */
export function fmtJournalLine(e: JournalEntry): string {
  return `${fmtJournalTs(e.t)} ${M02.host} ${e.ident}[${e.pid}]: ${e.msg}`;
}
