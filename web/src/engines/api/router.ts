/**
 * Mock SaaS API router (web ISA ISC-74..78) — pure TS, no DOM, no network.
 *
 * Implements the acme.example vendor exactly as module 06 documents it:
 *   - auth ladder (ISC-75): no auth → 401; Api-Key rung; Bearer rung; OAuth2
 *     client-credentials at POST /oauth/token with real expiry against the sim clock.
 *   - cursor pagination (ISC-76): canonical pages advertising total=8; follow
 *     pagination.next_cursor until null; unknown cursor → 400.
 *   - rate limiting (ISC-77): sliding window; over-limit → 429 + Retry-After seconds;
 *     waiting the advertised time (sim clock) frees the window.
 *   - stateful failures: 401/403/404/405/429/5xx, every body the documented
 *     { "error": "...", "message": "..." } shape.
 *
 * Determinism: tokens come from a seeded LCG, so a fresh router replaying the same
 * request sequence emits byte-identical responses (golden-transcript byte-stability).
 */
import type {
  ApiConfig,
  ApiRequest,
  ApiResponse,
  ApiRouter,
  ApiRouterOptions,
  PagedCollection,
} from "./types";
import { acmeConfig, ERRORS } from "./acme";

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  429: "Too Many Requests",
  503: "Service Unavailable",
};

/** UTF-8 byte length (Content-Length must count bytes, not UTF-16 units). */
function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : (i++, 4);
  }
  return n;
}

function response(status: number, body: string, extra: [string, string][] = []): ApiResponse {
  return {
    status,
    statusText: STATUS_TEXT[status] ?? "Unknown",
    headers: [
      ["Content-Type", "application/json"],
      ["Content-Length", String(byteLength(body))],
      ...extra,
    ],
    body,
  };
}

/**
 * Deterministic per-router token generator: seeded LCG → 32 hex chars (numerical-recipes
 * constants). Each router gets its own seed so a fresh router replaying the same request
 * sequence issues the same tokens (golden-transcript byte-stability).
 */
function tokenSource(): () => string {
  let s = 0x9f8c2026 >>> 0;
  return () => {
    let hex = "";
    for (let i = 0; i < 4; i++) {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      hex += s.toString(16).padStart(8, "0");
    }
    return `tok_${hex}`;
  };
}

interface IssuedToken {
  scopes: Set<string>;
  expiresAtMs: number;
}

function headerLookup(headers: Record<string, string> | undefined, name: string): string | null {
  if (!headers) return null;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v;
  return null;
}

function parseForm(body: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!body) return out;
  for (const pair of body.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    try {
      out.set(decodeURIComponent(k.replace(/\+/g, " ")), decodeURIComponent(v.replace(/\+/g, " ")));
    } catch {
      out.set(k, v); // malformed percent-encoding: keep raw (vendor is lenient)
    }
  }
  return out;
}

function splitPathQuery(path: string): { path: string; query: Map<string, string> } {
  const q = path.indexOf("?");
  if (q === -1) return { path, query: new Map() };
  return { path: path.slice(0, q), query: parseForm(path.slice(q + 1)) };
}

class ApiRouterImpl implements ApiRouter {
  readonly host: string;
  private readonly cfg: ApiConfig;
  private readonly now: () => number;
  private readonly tokens = new Map<string, IssuedToken>();
  private readonly nextToken = tokenSource();
  private window: number[] = [];
  private failuresQueued = 0;

  constructor(opts: ApiRouterOptions) {
    this.cfg = opts.config ?? acmeConfig();
    if (opts.rateLimit) this.cfg.rateLimit = opts.rateLimit;
    this.host = this.cfg.host;
    this.now = opts.now ?? Date.now;
  }

  failNext(times = 1): void {
    this.failuresQueued += times;
  }

  handle(req: ApiRequest): ApiResponse {
    const method = req.method.toUpperCase();
    const { path, query } = splitPathQuery(req.path);

    // injected outage first: a down vendor is down for everyone (ISC-74 "5xx on demand")
    if (this.failuresQueued > 0) {
      this.failuresQueued--;
      return response(503, ERRORS.serverError());
    }

    // rate limit gates EVERYTHING next (limiters sit in front of auth at real vendors)
    const limited = this.checkRateLimit();
    if (limited !== null) return limited;

    if (path === this.cfg.tokenPath) {
      if (method !== "POST")
        return response(405, ERRORS.methodNotAllowed(method, path), [["Allow", "POST"]]);
      return this.issueToken(req);
    }

    const collection = this.cfg.collections[path];
    if (collection !== undefined) {
      if (method !== "GET")
        return response(405, ERRORS.methodNotAllowed(method, path), [["Allow", "GET"]]);
      const denied = this.authorize(req, collection.scope);
      if (denied !== null) return denied;
      return this.servePage(collection, query);
    }

    return response(404, ERRORS.notFound(method, path));
  }

  // -------------------------------------------------------------------------
  // rate limiting (ISC-77)
  // -------------------------------------------------------------------------

  private checkRateLimit(): ApiResponse | null {
    const { limit, windowMs } = this.cfg.rateLimit;
    const now = this.now();
    this.window = this.window.filter((t) => t > now - windowMs);
    if (this.window.length >= limit) {
      const retryMs = this.window[0]! + windowMs - now;
      const retryAfter = Math.max(1, Math.ceil(retryMs / 1000));
      return response(429, ERRORS.rateLimited(limit), [["Retry-After", String(retryAfter)]]);
    }
    this.window.push(now);
    return null;
  }

  // -------------------------------------------------------------------------
  // OAuth2 client-credentials token endpoint (ISC-75; module 06 §4.3/§5.2)
  // -------------------------------------------------------------------------

  private issueToken(req: ApiRequest): ApiResponse {
    const form = parseForm(req.body);
    if ((form.get("grant_type") ?? "") !== "client_credentials")
      return response(400, ERRORS.unsupportedGrant());
    const clientId = form.get("client_id");
    const clientSecret = form.get("client_secret");
    if (!clientId || !clientSecret) return response(400, ERRORS.missingCredentials());
    const client = this.cfg.clients.find((c) => c.clientId === clientId);
    if (!client || client.clientSecret !== clientSecret)
      return response(401, ERRORS.invalidClient());

    const requested = (form.get("scope") ?? "").split(" ").filter(Boolean);
    const scopes = requested.length === 0 ? [...client.allowedScopes] : requested;
    for (const s of scopes)
      if (!client.allowedScopes.includes(s)) return response(400, ERRORS.invalidScope(s));

    const token = this.nextToken();
    this.tokens.set(token, {
      scopes: new Set(scopes),
      expiresAtMs: this.now() + this.cfg.tokenTtlSeconds * 1000,
    });
    // module canon keys (§5.2) + token_type/scope per RFC 6749 §5.1
    const body =
      JSON.stringify(
        {
          access_token: token,
          token_type: "Bearer",
          expires_in: this.cfg.tokenTtlSeconds,
          scope: scopes.join(" "),
        },
        null,
        2,
      ) + "\n";
    return response(200, body);
  }

  // -------------------------------------------------------------------------
  // auth ladder enforcement on resource reads (ISC-75; 401 vs 403 per §4.2/§4.3)
  // -------------------------------------------------------------------------

  private authorize(req: ApiRequest, requiredScope: string): ApiResponse | null {
    const auth = headerLookup(req.headers, "Authorization");
    if (auth === null || auth.trim() === "") return response(401, ERRORS.noAuth());
    const sp = auth.indexOf(" ");
    const scheme = sp === -1 ? auth : auth.slice(0, sp);
    const credential = sp === -1 ? "" : auth.slice(sp + 1).trim();

    if (scheme.toLowerCase() === "api-key") {
      const key = this.cfg.apiKeys.find((k) => k.key === credential);
      if (!key) return response(401, ERRORS.badApiKey());
      if (!key.scopes.includes(requiredScope))
        return response(403, ERRORS.insufficientScope(requiredScope));
      return null;
    }

    if (scheme.toLowerCase() === "bearer") {
      const issued = this.tokens.get(credential);
      if (!issued) return response(401, ERRORS.unknownToken());
      if (this.now() >= issued.expiresAtMs) {
        this.tokens.delete(credential);
        return response(401, ERRORS.expiredToken());
      }
      if (!issued.scopes.has(requiredScope))
        return response(403, ERRORS.insufficientScope(requiredScope));
      return null;
    }

    return response(401, ERRORS.badScheme(scheme));
  }

  // -------------------------------------------------------------------------
  // cursor pagination (ISC-76; module 06 §4.4 — bodies are byte canon)
  // -------------------------------------------------------------------------

  private servePage(collection: PagedCollection, query: Map<string, string>): ApiResponse {
    const cursor = query.get("cursor") ?? null;
    // per_page is documented-pinned at the vendor; other params are ignored, as real
    // list endpoints ignore parameters they don't recognize.
    const page = collection.pages.find((p) => p.cursor === cursor);
    if (page === undefined) return response(400, ERRORS.invalidCursor(cursor ?? ""));
    return response(200, page.body);
  }
}

export function createApiRouter(opts: ApiRouterOptions = {}): ApiRouter {
  return new ApiRouterImpl(opts);
}
