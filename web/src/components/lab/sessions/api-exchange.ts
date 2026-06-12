/**
 * API-lab exchange observer (web ISA ISC-74..78 — Lab Player side).
 *
 * Wraps the module-06 shell session (created with `apiLab` options) and records every
 * curl exchange for the request/response inspector panel and the `api_pull_complete`
 * verifier. HONESTY CONTRACT:
 *   - The REQUEST side is ground truth: it is parsed from the exact line the learner
 *     typed, with the same taught-subset grammar the engine's curl implements
 *     (`-s -i -H -X -d/--data` + one URL).
 *   - The RESPONSE side is only recorded from what the engine actually printed. Status
 *     and headers are known ONLY when the learner used `curl -i` on an unpiped,
 *     unredirected invocation; otherwise they're recorded as null/absent — never
 *     inferred from body shape. (A `lastExchange()` probe on the engine would make the
 *     response wire-accurate in all cases; flagged as a contract gap.)
 *
 * DOM-free; unit-tested under `bun test`.
 */
import type { ShellSession } from "../../../engines/shell/types";
import type { ApiExchangeProbe } from "../../../verifiers/registry";
import { eventText, isThenable, type LabExecResult, type LabSession, type MaybePromise } from "./types";

export interface ApiExchange extends ApiExchangeProbe {
  /** The exact input line. */
  line: string;
  /** Raw query string ("" when none). */
  query: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  /** Response headers — known only for `curl -i` unpiped runs. */
  responseHeaders: [string, string][] | null;
  /** Response body as printed — null when the output went elsewhere (pipe/redirect). */
  responseBody: string | null;
  statusText: string | null;
  seq: number;
}

export interface ParsedCurlRequest {
  method: string;
  host: string;
  path: string;
  query: string;
  cursor: string | null;
  headers: Record<string, string>;
  body: string | null;
  include: boolean;
}

/**
 * Parse a single curl invocation with the engine's taught-subset grammar. Returns null
 * for non-curl lines and for compound lines (pipes/redirects/sequencing), where the
 * printed output is not the response body — those record nothing rather than guessing.
 */
export function parseCurlLine(line: string): ParsedCurlRequest | null {
  const trimmed = line.trim();
  if (!/^curl(\s|$)/.test(trimmed)) return null;
  const tokens = tokenizeQuoted(trimmed);
  const args = tokens.slice(1);
  let method: string | null = null;
  let include = false;
  const headers: Record<string, string> = {};
  const data: string[] = [];
  let url: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--data") { data.push(args[++i] ?? ""); continue; }
    if (a.startsWith("--")) return null; // outside the taught surface
    if (a.startsWith("-") && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j]!;
        if (f === "s") continue;
        if (f === "i") { include = true; continue; }
        if (f === "H" || f === "X" || f === "d") {
          const inline = a.slice(j + 1);
          const v = inline !== "" ? inline : (args[++i] ?? "");
          if (f === "H") {
            const colon = v.indexOf(":");
            if (colon !== -1) headers[v.slice(0, colon).trim()] = v.slice(colon + 1).trim();
          } else if (f === "X") method = v;
          else data.push(v);
          j = a.length;
          continue;
        }
        return null; // unknown flag: engine answers with a sim boundary; nothing to record
      }
      continue;
    }
    if (url !== null) return null;
    url = a;
  }
  if (url === null) return null;
  const m = url.match(/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?([^/\s]+)(\/[^?\s]*)?(?:\?(\S*))?$/);
  if (!m) return null;
  const query = m[3] ?? "";
  return {
    method: method ?? (data.length > 0 ? "POST" : "GET"),
    host: m[1]!,
    path: m[2] ?? "/",
    query,
    cursor: cursorFromQuery(query),
    headers,
    body: data.length > 0 ? data.join("&") : null,
    include,
  };
}

function cursorFromQuery(query: string): string | null {
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    if (k === "cursor") {
      try {
        return decodeURIComponent(eq === -1 ? "" : pair.slice(eq + 1));
      } catch {
        return eq === -1 ? "" : pair.slice(eq + 1);
      }
    }
  }
  return null;
}

/** Tokenize honoring single/double quotes (curl -H 'X: y' shapes). */
function tokenizeQuoted(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push(m[1] ?? m[2] ?? m[3]!);
  return out;
}

/** A line whose stdout is NOT the curl response body (pipes, redirects, sequencing). */
export function isCompoundLine(line: string): boolean {
  return firstSegment(line) !== line;
}

/** The text before the first unquoted shell operator (|, >, <, ;, &). */
export function firstSegment(line: string): string {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; continue; }
    if (ch === "|" || ch === ">" || ch === "<" || ch === ";" || ch === "&") return line.slice(0, i);
  }
  return line;
}

/** Split a `curl -i` transcript into status/headers/body (response side, as printed). */
export function splitIncludeOutput(stdout: string): {
  status: number | null;
  statusText: string | null;
  headers: [string, string][];
  body: string;
} {
  const statusMatch = stdout.match(/^HTTP\/1\.1 (\d{3}) ([^\n]*)\n/);
  if (!statusMatch) return { status: null, statusText: null, headers: [], body: stdout };
  const rest = stdout.slice(statusMatch[0].length);
  const sep = rest.indexOf("\n\n");
  const headerBlock = sep === -1 ? rest : rest.slice(0, sep);
  const body = sep === -1 ? "" : rest.slice(sep + 2);
  const headers: [string, string][] = [];
  for (const lineText of headerBlock.split("\n")) {
    const colon = lineText.indexOf(":");
    if (colon !== -1) headers.push([lineText.slice(0, colon), lineText.slice(colon + 2)]);
  }
  return { status: Number(statusMatch[1]), statusText: statusMatch[2]!, headers, body };
}

/**
 * Wrap the api-lab shell session: exec passes through untouched; completed curl lines
 * append an exchange record. Everything else (probes, history, snapshot) delegates.
 */
export class ApiLabSession implements LabSession {
  private readonly s: ShellSession;
  private log: ApiExchange[] = [];
  private seq = 0;
  private onExchange: (() => void) | null = null;

  constructor(session: ShellSession, onExchange?: () => void) {
    this.s = session;
    this.onExchange = onExchange ?? null;
  }

  exchanges(): ApiExchange[] {
    return [...this.log];
  }

  last(): ApiExchange | null {
    return this.log[this.log.length - 1] ?? null;
  }

  probes(): ApiExchangeProbe[] {
    return this.log.map(({ method, path, cursor, status }) => ({ method, path, cursor, status }));
  }

  /** Restore the observed log (persisted alongside the session snapshot). */
  restoreLog(log: ApiExchange[]): void {
    this.log = [...log];
    this.seq = this.log.length;
  }

  exec(line: string): MaybePromise<LabExecResult> {
    const r = this.s.exec(line);
    // ShellSession is sync by contract; guarded for structural safety.
    if (isThenable(r)) return r.then((res) => this.observe(line, res));
    return this.observe(line, r);
  }

  private observe(line: string, result: LabExecResult): LabExecResult {
    if (result.state !== "done") return result;
    const compound = isCompoundLine(line);
    // Piped/redirected curl still records its REQUEST side (typed ground truth); the
    // printed output isn't the response body then, so the response side stays null.
    const req = parseCurlLine(compound ? firstSegment(line) : line);
    if (req === null) return result;
    const stdout = compound ? null : eventText(result.events, "stdout");
    let status: number | null = null;
    let statusText: string | null = null;
    let responseHeaders: [string, string][] | null = null;
    let responseBody: string | null = stdout;
    if (stdout !== null && req.include) {
      const split = splitIncludeOutput(stdout);
      status = split.status;
      statusText = split.statusText;
      responseHeaders = split.status !== null ? split.headers : null;
      responseBody = split.status !== null ? split.body : stdout;
    }
    this.log.push({
      seq: this.seq++,
      line,
      method: req.method,
      path: req.path,
      query: req.query,
      cursor: req.cursor,
      requestHeaders: req.headers,
      requestBody: req.body,
      status,
      statusText,
      responseHeaders,
      responseBody,
    });
    this.onExchange?.();
    return result;
  }

  // ---- pure delegation -------------------------------------------------------------
  prompt(): string { return this.s.prompt(); }
  feedStdin(text: string): MaybePromise<LabExecResult> { return this.s.feedStdin(text); }
  eof(): MaybePromise<LabExecResult> { return this.s.eof(); }
  interrupt(): MaybePromise<LabExecResult> { return this.s.interrupt(); }
  complete(partial: string) { return this.s.complete(partial); }
  historyUp() { return this.s.historyUp(); }
  historyDown() { return this.s.historyDown(); }
  history() { return this.s.history(); }
  lastExit() { return this.s.lastExit(); }
  setCols(cols: number) { this.s.setCols(cols); }
  exists(p: string) { return this.s.exists(p); }
  readFile(p: string) { return this.s.readFile(p); }
  listDir(p: string) { return this.s.listDir(p); }
  producedBy(p: string) { return this.s.producedBy(p); }
  runScriptClean(p: string, args: string[], opts?: { perturb?: boolean }) {
    return this.s.runScriptClean(p, args, opts);
  }
  snapshot(): unknown {
    return { shell: this.s.snapshot(), exchanges: this.log };
  }
  writeFileAs(path: string, content: string, provenance: string): void {
    this.s.writeFileAs?.(path, content, provenance);
  }
  reseedFiles(seed: Parameters<NonNullable<ShellSession["reseedFiles"]>>[0]): void {
    this.s.reseedFiles?.(seed);
  }
}
