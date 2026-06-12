/**
 * curl — taught-subset extension wiring the shell sim to the mock SaaS API
 * (web ISA ISC-78: taught curl invocations against acme.example, byte-stable).
 *
 * Scope (taught surface ONLY): `-s -i -H -X -d/--data` plus a single URL. Everything
 * else emits the declared sim-boundary message (exit 64) — never invented curl output.
 * `http` (HTTPie) is deliberately NOT implemented: module 06 names HTTPie only in §8
 * supplemental material and never invokes it (design-inputs inventory), so it is out
 * of the taught surface.
 *
 * Honesty notes:
 *   - curl is NOT in the pinned container's installed set (installed.ts) — module 01's
 *     negative space stands. The binary exists only when a session is created with
 *     `apiLab` options (the module-06 lab box), via buildVfs in index.ts.
 *   - acme.example is fictional; there is no real host to capture against, so this is
 *     authored-fixture class. The "no URL" and "could not resolve host" error lines are
 *     authored-with-citation from curl's documented behavior (curl 8.x, exit codes 2/6
 *     per `man curl` EXIT CODES).
 *   - Real curl writes a progress meter to stderr when stdout is not a tty; the sim
 *     never renders the meter (timing-dependent noise that would falsify byte-stable
 *     transcripts). `-s` is accepted and the taught habit is preserved.
 *   - `-i` renders header lines with "\n" (not the wire's "\r\n") — a terminal renders
 *     both identically; documented divergence, not hidden.
 *   - Per HTTP semantics (and real curl without `-f`), 4xx/5xx responses print the body
 *     and exit 0 — learners read the STATUS, which is the §4.2 lesson.
 *   - Router state (issued tokens, rate window) lives per shell session and resets on
 *     snapshot/restore — short-lived-by-design, like the tokens it issues.
 */
import type { IOCtx, Machine } from "./interpreter";
import { SIM_BOUNDARY_EXIT } from "./interpreter";
import { COREUTILS, type CoreutilImpl } from "./coreutils";
import { createApiRouter, type ApiRouter, type ApiRouterOptions } from "../api";

/** Per-machine router instances (clean sub-environments get no router → no network). */
const ROUTERS = new WeakMap<Machine, ApiRouter>();

export function attachApiRouter(m: Machine, router: ApiRouter): void {
  ROUTERS.set(m, router);
}

/** Convenience: build + attach the canonical acme.example router on a machine's clock. */
export function attachAcmeRouter(m: Machine, opts: Omit<ApiRouterOptions, "now"> = {}): ApiRouter {
  const router = createApiRouter({ ...opts, now: () => m.now() });
  attachApiRouter(m, router);
  return router;
}

const boundary = (what: string, io: IOCtx): number => {
  io.err.write(
    `grc-sim: curl: ${what} is outside this lab's simulated surface — run it on a real machine to explore\n`,
  );
  return SIM_BOUNDARY_EXIT;
};

interface ParsedArgs {
  silent: boolean;
  include: boolean;
  method: string | null;
  data: string[];
  headers: string[];
  url: string | null;
}

/** Parse the taught argv subset; returns an exit code if parsing already answered. */
function parseArgs(args: string[], io: IOCtx): ParsedArgs | number {
  const p: ParsedArgs = { silent: false, include: false, method: null, data: [], headers: [], url: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--data") {
      const v = args[++i];
      if (v === undefined) {
        io.err.write("curl: option --data: requires parameter\n");
        io.err.write("curl: try 'curl --help' or 'curl --manual' for more information\n");
        return 2;
      }
      p.data.push(v);
      continue;
    }
    if (a.startsWith("--")) return boundary(`option ${a}`, io);
    if (a.startsWith("-") && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j]!;
        if (f === "s") { p.silent = true; continue; }
        if (f === "i") { p.include = true; continue; }
        if (f === "H" || f === "X" || f === "d") {
          const inline = a.slice(j + 1);
          const v = inline !== "" ? inline : args[++i];
          if (v === undefined) {
            io.err.write(`curl: option -${f}: requires parameter\n`);
            io.err.write("curl: try 'curl --help' or 'curl --manual' for more information\n");
            return 2;
          }
          if (f === "H") p.headers.push(v);
          else if (f === "X") p.method = v;
          else p.data.push(v);
          j = a.length;
          continue;
        }
        return boundary(`option -${f}`, io);
      }
      continue;
    }
    if (p.url !== null) return boundary("fetching multiple URLs", io);
    p.url = a;
  }
  return p;
}

interface ParsedUrl { scheme: string; host: string; path: string }

function parseUrl(raw: string): ParsedUrl | null {
  const m = raw.match(/^(?:([a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?([^/\s]+)(\/.*)?$/);
  if (!m) return null;
  return { scheme: (m[1] ?? "https").toLowerCase(), host: m[2]!, path: m[3] ?? "/" };
}

const curl: CoreutilImpl = (args, io, m) => {
  const parsed = parseArgs(args, io);
  if (typeof parsed === "number") return parsed;

  if (parsed.url === null) {
    io.err.write("curl: no URL specified!\n");
    io.err.write("curl: try 'curl --help' or 'curl --manual' for more information\n");
    return 2;
  }

  const url = parseUrl(parsed.url);
  if (url === null || (url.scheme !== "http" && url.scheme !== "https"))
    return boundary(`URL '${parsed.url}'`, io);

  const router = ROUTERS.get(m);
  if (router === undefined || url.host !== router.host) {
    // the lab box has no real network; only the attached vendor host resolves
    io.err.write(`curl: (6) Could not resolve host: ${url.host}\n`);
    return 6;
  }

  const headers: Record<string, string> = {};
  for (const h of parsed.headers) {
    const colon = h.indexOf(":");
    if (colon === -1) continue; // header without value: ignored in the taught surface
    headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
  }
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
  if (parsed.data.length > 0 && !hasContentType)
    headers["Content-Type"] = "application/x-www-form-urlencoded"; // real curl -d default

  const res = router.handle({
    method: parsed.method ?? (parsed.data.length > 0 ? "POST" : "GET"),
    path: url.path,
    headers,
    body: parsed.data.length > 0 ? parsed.data.join("&") : undefined,
  });

  if (parsed.include) {
    io.out.write(`HTTP/1.1 ${res.status} ${res.statusText}\n`);
    for (const [name, value] of res.headers) io.out.write(`${name}: ${value}\n`);
    io.out.write("\n");
  }
  io.out.write(res.body);
  return 0; // curl without -f exits 0 on HTTP errors — the status code is the verdict
};

/** Register `curl` in the coreutils dispatch table (called once by the engine entry). */
export function registerCurl(): void {
  (COREUTILS as Record<string, CoreutilImpl>)["curl"] = curl;
}
