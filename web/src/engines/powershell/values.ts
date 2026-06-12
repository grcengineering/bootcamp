/**
 * PowerShell value model (web ISA ISC-63/64).
 *
 * The module's core thesis — "the pipeline carries objects, not text" (module 04 §3) —
 * demands a typed value model: cmdlets emit PsValue streams; the formatter renders them
 * only at the console boundary. Property order is significant (display order), so objects
 * carry ordered entry lists, and property lookup is case-insensitive like PowerShell.
 */

export interface PsDateTime { psType: "datetime"; ms: number }

export interface PsObject {
  psType: "object";
  typeName: string;
  entries: Array<[string, PsValue]>;
}

export interface PsHash { psType: "hash"; entries: Array<[string, PsValue]> }

export type PsValue =
  | string
  | number
  | boolean
  | null
  | PsDateTime
  | PsObject
  | PsHash
  | PsValue[];

export function isDateTime(v: PsValue): v is PsDateTime {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.psType === "datetime";
}

export function isPsObject(v: PsValue): v is PsObject {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.psType === "object";
}

export function isPsHash(v: PsValue): v is PsHash {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.psType === "hash";
}

export function makeObject(typeName: string, entries: Array<[string, PsValue]>): PsObject {
  return { psType: "object", typeName, entries };
}

/** Case-insensitive property lookup (PowerShell member names are case-insensitive). */
export function getProp(o: PsObject, name: string): { name: string; value: PsValue } | null {
  const lower = name.toLowerCase();
  for (const [k, v] of o.entries) if (k.toLowerCase() === lower) return { name: k, value: v };
  return null;
}

export function hashGet(h: PsHash, name: string): PsValue | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of h.entries) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/**
 * Deterministic ISO-local parse: "2026-05-27T21:14:03" → fixed ms with NO host-timezone
 * dependence (the sim's local time IS the seed's local time).
 */
export function parseDateTime(iso: string): PsDateTime {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(iso);
  if (!m) throw new Error(`seed datetime not in ISO local form: ${iso}`);
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return { psType: "datetime", ms };
}

/** en-US short date + long time, the pinned culture: "5/27/2026 9:14:03 PM" (module 04 §5.3). */
export function formatDateTime(d: PsDateTime): string {
  const t = new Date(d.ms);
  const month = t.getUTCMonth() + 1;
  const day = t.getUTCDate();
  const year = t.getUTCFullYear();
  let h = t.getUTCHours();
  const tt = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  const ss = String(t.getUTCSeconds()).padStart(2, "0");
  return `${month}/${day}/${year} ${h}:${mm}:${ss} ${tt}`;
}

/** Console display of a single value (table cells, list values, scalar lines). */
export function display(v: PsValue): string {
  if (v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  if (Array.isArray(v)) return `{${v.map(display).join(", ")}}`;
  if (isDateTime(v)) return formatDateTime(v);
  if (isPsHash(v)) return "System.Collections.Hashtable";
  return v.typeName;
}

/** Right-alignment rule: numerics and booleans right-align in the default table view. */
export function isRightAligned(v: PsValue): boolean {
  return typeof v === "number" || typeof v === "boolean";
}

/** Sort/compare semantics for the taught subset: numbers, datetimes, booleans,
 *  case-insensitive strings; null sorts first. */
export function compareValues(a: PsValue, b: PsValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (isDateTime(a) && isDateTime(b)) return a.ms - b.ms;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const sa = display(a).toLowerCase();
  const sb = display(b).toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Loose equality for Where-Object -eq/-ne: case-insensitive strings, numeric coercion
 *  when either side is a number (PowerShell's default comparison behavior). */
export function looseEquals(a: PsValue, b: PsValue): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const na = typeof a === "number" ? a : Number(display(a));
    const nb = typeof b === "number" ? b : Number(display(b));
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  return display(a).toLowerCase() === display(b).toLowerCase();
}
