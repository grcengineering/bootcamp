/**
 * acme.example — the module-06 vendor canon (authored-fixture class).
 *
 * Single authoring point for every byte the mock vendor emits. Provenance per constant:
 *   - USERS_PAGE_1 / USERS_PAGE_2: EXACT bytes of the module's committed lab fixtures
 *     (modules/06-api-fundamentals/labs/fixtures/users-page-{1,2}.json, themselves the
 *     heredoc bytes of labs/setup.sh). A bun test byte-diffs these against the committed
 *     files — drift there is a build failure, not silent rot.
 *   - error bodies (the ERRORS table): authored to the module-documented shape
 *     `{ "error": "...", "message": "..." }` (module 06 §5.1 "Error shape"); messages are
 *     original prose. Each body is LOCKED to a doc/RFC-cited fixture —
 *     .ci/fixtures/captured/m06-err-*.json (source authored, match authored-with-citation),
 *     carrying the HTTP/OAuth2 RFC + module-06 § citation — and api-error-fixtures.test.ts
 *     byte-asserts both this table and the live router against it. The FIXTURE is the source
 *     of truth (the manifest-lint citation gate covers the provenance), not this comment.
 *   - DEVICES_PAGE_1: authored extension for the users/devices surface (web ISA ISC-74),
 *     carrying the curriculum's laptop-encryption claim thread (`disk_encrypted`).
 *   - credentials: fictional, deterministic. The API key starts "9f8c" because module 06
 *     §4.3 shows `Authorization: Api-Key 9f8c...` (elided in prose; completed here).
 *   - rate limit 600/min, scope users:read, token TTL 3600s: module 06 §5.1 canon.
 */
import type { ApiConfig } from "./types";

// ---------------------------------------------------------------------------
// committed-fixture page bodies (byte canon — do NOT reformat)
// ---------------------------------------------------------------------------

export const USERS_PAGE_1 = `{
  "data": [
    { "id": "u_001", "email": "alice@acme.example", "mfa_enabled": true,  "status": "active" },
    { "id": "u_002", "email": "bob@acme.example",   "mfa_enabled": false, "status": "active" },
    { "id": "u_003", "email": "carol@acme.example", "mfa_enabled": true,  "status": "active" },
    { "id": "u_004", "email": "dave@acme.example",  "mfa_enabled": false, "status": "suspended" },
    { "id": "u_005", "email": "erin@acme.example",  "mfa_enabled": true,  "status": "active" }
  ],
  "pagination": {
    "page": 1,
    "per_page": 5,
    "total": 8,
    "next_cursor": "eyJwYWdlIjoyfQ=="
  }
}
`;

export const USERS_PAGE_2 = `{
  "data": [
    { "id": "u_006", "email": "frank@acme.example", "mfa_enabled": false, "status": "active" },
    { "id": "u_007", "email": "grace@acme.example", "mfa_enabled": true,  "status": "active" },
    { "id": "u_008", "email": "heidi@acme.example", "mfa_enabled": false, "status": "active" }
  ],
  "pagination": {
    "page": 2,
    "per_page": 5,
    "total": 8,
    "next_cursor": null
  }
}
`;

/** The cursor carried by page 1 (base64 of {"page":2} — visible in the fixture bytes). */
export const USERS_PAGE_2_CURSOR = "eyJwYWdlIjoyfQ==";

// ---------------------------------------------------------------------------
// authored devices collection (ISC-74; laptop-encryption claim thread)
// ---------------------------------------------------------------------------

export const DEVICES_PAGE_1 = `{
  "data": [
    { "id": "d_101", "user_id": "u_001", "hostname": "wkst-alice-01", "disk_encrypted": true,  "os": "macos" },
    { "id": "d_102", "user_id": "u_002", "hostname": "wkst-bob-01",   "disk_encrypted": false, "os": "windows" },
    { "id": "d_103", "user_id": "u_003", "hostname": "wkst-carol-01", "disk_encrypted": true,  "os": "linux" },
    { "id": "d_104", "user_id": "u_005", "hostname": "wkst-erin-01",  "disk_encrypted": true,  "os": "macos" },
    { "id": "d_105", "user_id": "u_007", "hostname": "wkst-grace-01", "disk_encrypted": true,  "os": "macos" }
  ],
  "pagination": {
    "page": 1,
    "per_page": 5,
    "total": 5,
    "next_cursor": null
  }
}
`;

// ---------------------------------------------------------------------------
// credentials (fictional canon — deterministic, documented in the exercise UI)
// ---------------------------------------------------------------------------

/** §4.3 canon prefix "9f8c..." completed to a full fictional key. */
export const ACME_API_KEY = "9f8c4e21b6a94d3f8c7e5a1029384756";
export const ACME_CLIENT_ID = "grc_evidence_bot";
export const ACME_CLIENT_SECRET = "cs_4d2b9e7f1a8c6053b4e2d9f7c1a08e35";
export const SCOPE_USERS_READ = "users:read";
export const SCOPE_DEVICES_READ = "devices:read";

// ---------------------------------------------------------------------------
// error bodies — module-documented shape { "error": "...", "message": "..." } (§5.1)
// ---------------------------------------------------------------------------

/** Canonical error body: 2-space JSON + trailing newline (matches fixture-file style). */
export function errorBody(error: string, message: string): string {
  return JSON.stringify({ error, message }, null, 2) + "\n";
}

export const ERRORS = {
  noAuth: () =>
    errorBody("unauthorized", "authentication required: provide an Api-Key or Bearer token in the Authorization header"),
  badScheme: (scheme: string) =>
    errorBody("unauthorized", `unsupported authorization scheme: ${scheme}`),
  badApiKey: () => errorBody("unauthorized", "invalid API key"),
  unknownToken: () => errorBody("unauthorized", "unrecognized access token"),
  expiredToken: () => errorBody("unauthorized", "access token expired"),
  insufficientScope: (scope: string) =>
    errorBody("insufficient_scope", `this endpoint requires scope ${scope}`),
  notFound: (method: string, path: string) =>
    errorBody("not_found", `no such endpoint: ${method} ${path}`),
  methodNotAllowed: (method: string, path: string) =>
    errorBody("method_not_allowed", `${method} is not allowed for ${path}`),
  rateLimited: (limit: number) =>
    errorBody("rate_limited", `rate limit exceeded (${limit} requests/minute) — honor the Retry-After header, then retry`),
  invalidCursor: (cursor: string) => errorBody("invalid_cursor", `unknown cursor: ${cursor}`),
  serverError: () => errorBody("server_error", "temporary upstream failure — safe to retry with backoff"),
  unsupportedGrant: () => errorBody("unsupported_grant_type", "grant_type must be client_credentials"),
  invalidClient: () => errorBody("invalid_client", "unknown client_id or bad client_secret"),
  invalidScope: (scope: string) => errorBody("invalid_scope", `scope not granted to this client: ${scope}`),
  missingCredentials: () => errorBody("invalid_request", "missing client_id or client_secret"),
} as const;

// ---------------------------------------------------------------------------
// default vendor config (the lab canon)
// ---------------------------------------------------------------------------

export function acmeConfig(): ApiConfig {
  return {
    host: "acme.example",
    tokenPath: "/oauth/token",
    collections: {
      "/api/v2/users": {
        scope: SCOPE_USERS_READ,
        pages: [
          { cursor: null, body: USERS_PAGE_1 },
          { cursor: USERS_PAGE_2_CURSOR, body: USERS_PAGE_2 },
        ],
      },
      "/api/v2/devices": {
        scope: SCOPE_DEVICES_READ,
        pages: [{ cursor: null, body: DEVICES_PAGE_1 }],
      },
    },
    clients: [
      {
        clientId: ACME_CLIENT_ID,
        clientSecret: ACME_CLIENT_SECRET,
        allowedScopes: [SCOPE_USERS_READ, SCOPE_DEVICES_READ],
      },
    ],
    apiKeys: [{ key: ACME_API_KEY, scopes: [SCOPE_USERS_READ, SCOPE_DEVICES_READ] }],
    tokenTtlSeconds: 3600,
    rateLimit: { limit: 600, windowMs: 60_000 },
  };
}
