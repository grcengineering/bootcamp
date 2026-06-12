/**
 * Mock SaaS API engine — public contract (web ISA ISC-74..79).
 *
 * Pure DOM-free TypeScript. An in-engine fetch ROUTER for the curriculum's wholly fictional
 * vendor `acme.example` (module 06 canon): the terminal sim's `curl` and the api-client
 * panel both call `ApiRouter.handle()` directly — no service worker, no network, ever.
 *
 * Honesty class: **authored-fixture** (.ci/fixtures/manifest.yaml taxonomy). acme.example
 * and its OAuth endpoint exist only as the module's documented prose + committed lab
 * fixtures, so there is no real system to capture from. The contract:
 *   - 200 bodies for GET /api/v2/users are BYTE-IDENTICAL to the module's committed
 *     fixtures (modules/06-api-fundamentals/labs/fixtures/users-page-{1,2}.json) —
 *     enforced by a bun test that diffs against the committed files.
 *   - every non-2xx body is the module-documented `{ "error": "...", "message": "..." }`
 *     shape (module 06 §5.1), authored once in acme.ts and emitted byte-stably.
 *   - OAuth token responses carry the module-canon keys (`access_token`, `expires_in: 3600`,
 *     §5.2) plus `token_type`/`scope` per RFC 6749 §5.1 (cited; the module's excerpt is
 *     elided shorthand, not byte canon).
 *   - all responses are DETERMINISTIC given the same request sequence from a fresh router
 *     (tokens come from a seeded PRNG), so golden transcripts replay byte-stably.
 */

export interface ApiRequest {
  /** HTTP method, case-insensitive ("GET", "POST", ...). */
  method: string;
  /** Path plus optional query string, e.g. "/api/v2/users?cursor=eyJwYWdlIjoyfQ==". */
  path: string;
  /** Request headers; name lookup is case-insensitive. */
  headers?: Record<string, string>;
  /** Raw request body (form-encoded for the token endpoint, per taught `curl -d`). */
  body?: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  /**
   * Stable-ordered emitted headers (Content-Type, Content-Length, then extras such as
   * Retry-After / Allow). Order is part of the byte-stability contract for `curl -i`.
   */
  headers: [name: string, value: string][];
  /** Exact response body bytes (canonical fixture pages end with "\n", like the files). */
  body: string;
}

export interface RateLimitConfig {
  /** Max requests accepted per window (documented vendor canon: 600/min). */
  limit: number;
  windowMs: number;
}

/** One page of a cursor-paginated collection: the cursor that RETRIEVES it (null = first page). */
export interface PagedPage {
  cursor: string | null;
  /** Byte-canonical response body (carries its own pagination.next_cursor inside the bytes). */
  body: string;
}

export interface PagedCollection {
  /** OAuth scope required to read this collection (module canon: "users:read"). */
  scope: string;
  pages: PagedPage[];
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  /** Scopes this client may be granted (requested subset is honored; omitted = all). */
  allowedScopes: string[];
}

export interface ApiKeyCred {
  key: string;
  scopes: string[];
}

/** Full vendor configuration; the default is the acme.example lab canon (see acme.ts). */
export interface ApiConfig {
  host: string;
  tokenPath: string;
  /** Collections keyed by exact path, e.g. "/api/v2/users". GET-only (evidence reads). */
  collections: Record<string, PagedCollection>;
  clients: OAuthClient[];
  apiKeys: ApiKeyCred[];
  /** Module canon: 3600 (§5.2 `expires_in: 3600`). */
  tokenTtlSeconds: number;
  rateLimit: RateLimitConfig;
}

export interface ApiRouterOptions {
  /** Sim clock in ms (the shell engine passes Machine.now(); defaults to Date.now). */
  now?: () => number;
  /** Override the documented 600/min limit for in-lab rate-limit drills (ISC-77). */
  rateLimit?: RateLimitConfig;
  /** Replace the whole vendor config (assessment-mode fresh fixtures). */
  config?: ApiConfig;
}

export interface ApiRouter {
  /** The vendor host this router answers for (curl resolves only this host). */
  readonly host: string;
  /** Route one request; never throws — every outcome is an HTTP response. */
  handle(req: ApiRequest): ApiResponse;
  /**
   * Stateful 5xx injection (ISC-74 "stateful ... 5xx"): the next `times` requests answer
   * 503 with the canonical `{error, message}` body, then service recovers — teaching
   * bounded retry on the 5xx family (module 06 §4.2).
   */
  failNext(times?: number): void;
}

/** Simulated webhook delivery record (ISC-79) — rendered in-app, never sent anywhere. */
export interface WebhookDelivery {
  event: string;
  method: "POST";
  url: string;
  headers: [name: string, value: string][];
  body: string;
  /** ISO timestamp derived from the sim clock. */
  deliveredAt: string;
}
