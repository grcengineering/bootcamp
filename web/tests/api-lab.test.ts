/**
 * Mock SaaS API lab — acceptance suite (web ISA ISC-74..79, test strategy row "ISC-74..79").
 *
 * Two layers:
 *  1. Router-level (controlled sim clock): auth ladder incl. OAuth expiry, cursor
 *     pagination completeness, 429 + Retry-After honoring, stateful 5xx, determinism.
 *  2. Shell-level (taught curl subset through the real engine): byte-stability of every
 *     response against the MODULE'S COMMITTED FIXTURES — the curriculum repo stays the
 *     single source of truth; drift between engine bytes and committed bytes fails here.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  createApiRouter,
  acmeConfig,
  ERRORS,
  USERS_PAGE_1,
  USERS_PAGE_2,
  USERS_PAGE_2_CURSOR,
  DEVICES_PAGE_1,
  ACME_API_KEY,
  ACME_CLIENT_ID,
  ACME_CLIENT_SECRET,
  SCOPE_DEVICES_READ,
  simulateMfaDisabledDelivery,
  type ApiRouter,
  type ApiResponse,
} from "../src/engines/api";
import { createShellEngine } from "../src/engines/shell";
import type { ShellSession, ExecResult, ApiLabOptions } from "../src/engines/shell/types";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const LAB_FIXTURES = join(ROOT, "modules/06-api-fundamentals/labs/fixtures");
const PAGE_1_BYTES = readFileSync(join(LAB_FIXTURES, "users-page-1.json"), "utf8");
const PAGE_2_BYTES = readFileSync(join(LAB_FIXTURES, "users-page-2.json"), "utf8");

const TOKEN_BODY = `grant_type=client_credentials&client_id=${ACME_CLIENT_ID}&client_secret=${ACME_CLIENT_SECRET}`;

/** Router on a controllable clock. */
function clockRouter(opts: { limit?: number; windowMs?: number } = {}) {
  let nowMs = 1_750_000_000_000;
  const router = createApiRouter({
    now: () => nowMs,
    rateLimit: opts.limit !== undefined ? { limit: opts.limit, windowMs: opts.windowMs ?? 60_000 } : undefined,
  });
  return { router, advance: (ms: number) => { nowMs += ms; } };
}

function getUsers(router: ApiRouter, auth?: string, cursor?: string): ApiResponse {
  return router.handle({
    method: "GET",
    path: cursor === undefined ? "/api/v2/users" : `/api/v2/users?cursor=${cursor}`,
    headers: auth === undefined ? {} : { Authorization: auth },
  });
}

function issueToken(router: ApiRouter, body = TOKEN_BODY): ApiResponse {
  return router.handle({ method: "POST", path: "/oauth/token", body });
}

function tokenOf(res: ApiResponse): string {
  return (JSON.parse(res.body) as { access_token: string }).access_token;
}

function header(res: ApiResponse, name: string): string | undefined {
  return res.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
}

// ---------------------------------------------------------------------------
// canon: the engine's bytes ARE the module's committed fixture bytes
// ---------------------------------------------------------------------------

describe("acme.example canon — byte-identical to committed module fixtures", () => {
  test("USERS_PAGE_1 matches modules/06-api-fundamentals/labs/fixtures/users-page-1.json", () => {
    expect(USERS_PAGE_1).toBe(PAGE_1_BYTES);
  });
  test("USERS_PAGE_2 matches modules/06-api-fundamentals/labs/fixtures/users-page-2.json", () => {
    expect(USERS_PAGE_2).toBe(PAGE_2_BYTES);
  });
  test("page 1 advertises the cursor the router serves page 2 under", () => {
    const p1 = JSON.parse(USERS_PAGE_1) as { pagination: { next_cursor: string } };
    expect(p1.pagination.next_cursor).toBe(USERS_PAGE_2_CURSOR);
  });
});

// ---------------------------------------------------------------------------
// ISC-75: auth ladder — 401 → API key → bearer → OAuth incl. expiry
// ---------------------------------------------------------------------------

describe("auth ladder (ISC-75)", () => {
  test("unauthenticated GET → 401 with the documented {error, message} body", () => {
    const { router } = clockRouter();
    const res = getUsers(router);
    expect(res.status).toBe(401);
    expect(res.statusText).toBe("Unauthorized");
    expect(res.body).toBe(ERRORS.noAuth());
    const parsed = JSON.parse(res.body) as Record<string, string>;
    expect(Object.keys(parsed).sort()).toEqual(["error", "message"]);
    expect(header(res, "Content-Type")).toBe("application/json");
    expect(header(res, "Content-Length")).toBe(String(Buffer.byteLength(res.body)));
  });

  test("Api-Key rung: valid key → 200 page 1; wrong key → 401", () => {
    const { router } = clockRouter();
    expect(getUsers(router, `Api-Key ${ACME_API_KEY}`).body).toBe(PAGE_1_BYTES);
    const bad = getUsers(router, "Api-Key 9f8c0000000000000000000000000000");
    expect(bad.status).toBe(401);
    expect(bad.body).toBe(ERRORS.badApiKey());
  });

  test("unsupported scheme → 401 naming the scheme", () => {
    const { router } = clockRouter();
    const res = getUsers(router, "Basic YWxhZGRpbjpvcGVuc2VzYW1l");
    expect(res.status).toBe(401);
    expect(res.body).toBe(ERRORS.badScheme("Basic"));
  });

  test("OAuth2 client-credentials: token issued with canon keys, then Bearer → 200", () => {
    const { router } = clockRouter();
    const tok = issueToken(router);
    expect(tok.status).toBe(200);
    const body = JSON.parse(tok.body) as Record<string, unknown>;
    expect(body.access_token).toMatch(/^tok_[0-9a-f]{32}$/);
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(body.scope).toBe("users:read devices:read");
    const res = getUsers(router, `Bearer ${tokenOf(tok)}`);
    expect(res.status).toBe(200);
    expect(res.body).toBe(PAGE_1_BYTES);
  });

  test("token endpoint failure modes: grant_type / missing creds / bad secret / bad scope", () => {
    const { router } = clockRouter();
    expect(issueToken(router, "grant_type=password").status).toBe(400);
    expect(issueToken(router, "grant_type=password").body).toBe(ERRORS.unsupportedGrant());
    expect(issueToken(router, "grant_type=client_credentials").body).toBe(ERRORS.missingCredentials());
    const badSecret = issueToken(router, `grant_type=client_credentials&client_id=${ACME_CLIENT_ID}&client_secret=nope`);
    expect(badSecret.status).toBe(401);
    expect(badSecret.body).toBe(ERRORS.invalidClient());
    const badScope = issueToken(router, `${TOKEN_BODY}&scope=admin:write`);
    expect(badScope.status).toBe(400);
    expect(badScope.body).toBe(ERRORS.invalidScope("admin:write"));
  });

  test("token endpoint tolerates form-encoding edge cases (empty pair, bare key, bad %)", () => {
    const { router } = clockRouter();
    const res = issueToken(router, `${TOKEN_BODY}&&flag&bad=%zz`);
    expect(res.status).toBe(200);
  });

  test("unknown bearer token → 401 unrecognized", () => {
    const { router } = clockRouter();
    const res = getUsers(router, "Bearer tok_ffffffffffffffffffffffffffffffff");
    expect(res.status).toBe(401);
    expect(res.body).toBe(ERRORS.unknownToken());
  });

  test("token expiry: valid until 3600s, expired after — re-exchange works (ISC-75)", () => {
    const { router, advance } = clockRouter();
    const token = tokenOf(issueToken(router));
    advance(3_599_000);
    expect(getUsers(router, `Bearer ${token}`).status).toBe(200);
    advance(2_000); // now past expires_in
    const expired = getUsers(router, `Bearer ${token}`);
    expect(expired.status).toBe(401);
    expect(expired.body).toBe(ERRORS.expiredToken());
    const fresh = tokenOf(issueToken(router));
    expect(getUsers(router, `Bearer ${fresh}`).status).toBe(200);
  });

  test("401 vs 403: narrow-scope token authenticates but lacks users:read (§4.2/§4.3)", () => {
    const { router } = clockRouter();
    const narrow = tokenOf(issueToken(router, `${TOKEN_BODY}&scope=${SCOPE_DEVICES_READ}`));
    const denied = getUsers(router, `Bearer ${narrow}`);
    expect(denied.status).toBe(403);
    expect(denied.body).toBe(ERRORS.insufficientScope("users:read"));
    const devices = router.handle({
      method: "GET",
      path: "/api/v2/devices",
      headers: { Authorization: `Bearer ${narrow}` },
    });
    expect(devices.status).toBe(200);
    expect(devices.body).toBe(DEVICES_PAGE_1);
  });
});

// ---------------------------------------------------------------------------
// ISC-76: pagination — a complete pull requires walking every page
// ---------------------------------------------------------------------------

describe("cursor pagination (ISC-76)", () => {
  test("complete pull: follow next_cursor to null; accumulated records match advertised total", () => {
    const { router } = clockRouter();
    const auth = `Api-Key ${ACME_API_KEY}`;
    const all: unknown[] = [];
    let cursor: string | null = null;
    let total = -1;
    let pages = 0;
    do {
      const res = cursor === null ? getUsers(router, auth) : getUsers(router, auth, cursor);
      expect(res.status).toBe(200);
      const page = JSON.parse(res.body) as { data: unknown[]; pagination: { total: number; next_cursor: string | null } };
      all.push(...page.data);
      total = page.pagination.total;
      cursor = page.pagination.next_cursor;
      pages++;
    } while (cursor !== null);
    expect(pages).toBe(2);
    expect(total).toBe(8);
    expect(all.length).toBe(total); // the completeness check the module teaches
  });

  test("page bodies are byte-canonical fixture bytes (both pages)", () => {
    const { router } = clockRouter();
    const auth = `Api-Key ${ACME_API_KEY}`;
    expect(getUsers(router, auth).body).toBe(PAGE_1_BYTES);
    expect(getUsers(router, auth, USERS_PAGE_2_CURSOR).body).toBe(PAGE_2_BYTES);
  });

  test("unknown cursor → 400 invalid_cursor", () => {
    const { router } = clockRouter();
    const res = getUsers(router, `Api-Key ${ACME_API_KEY}`, "bm9wZQ==");
    expect(res.status).toBe(400);
    expect(res.body).toBe(ERRORS.invalidCursor("bm9wZQ=="));
  });

  test("unrecognized query params (per_page) are ignored, like real list endpoints", () => {
    const { router } = clockRouter();
    const res = router.handle({
      method: "GET",
      path: "/api/v2/users?per_page=100",
      headers: { Authorization: `Api-Key ${ACME_API_KEY}` },
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe(PAGE_1_BYTES);
  });
});

// ---------------------------------------------------------------------------
// ISC-77: rate limiting — 429 + Retry-After; honoring it completes the pull
// ---------------------------------------------------------------------------

describe("rate limiting (ISC-77)", () => {
  test("over-limit → 429 with Retry-After; waiting the advertised time frees the window", () => {
    const { router, advance } = clockRouter({ limit: 3 });
    const auth = `Api-Key ${ACME_API_KEY}`;
    for (let i = 0; i < 3; i++) expect(getUsers(router, auth).status).toBe(200);
    const limited = getUsers(router, auth);
    expect(limited.status).toBe(429);
    expect(limited.statusText).toBe("Too Many Requests");
    expect(limited.body).toBe(ERRORS.rateLimited(3));
    expect(header(limited, "Retry-After")).toBe("60");
    advance(30_000); // retrying early is NOT honoring the signal
    const early = getUsers(router, auth);
    expect(early.status).toBe(429);
    expect(header(early, "Retry-After")).toBe("30");
    advance(30_000); // full Retry-After elapsed
    expect(getUsers(router, auth).status).toBe(200);
  });

  test("a complete paginated pull under limit=1 succeeds only by honoring Retry-After", () => {
    const { router, advance } = clockRouter({ limit: 1 });
    const auth = `Api-Key ${ACME_API_KEY}`;
    const p1 = getUsers(router, auth);
    expect(p1.status).toBe(200);
    const dropped = getUsers(router, auth, USERS_PAGE_2_CURSOR);
    expect(dropped.status).toBe(429); // dropping this page = silent incompleteness
    advance(Number(header(dropped, "Retry-After")) * 1000);
    const p2 = getUsers(router, auth, USERS_PAGE_2_CURSOR);
    expect(p2.status).toBe(200);
    const total =
      (JSON.parse(p1.body) as { data: unknown[] }).data.length +
      (JSON.parse(p2.body) as { data: unknown[] }).data.length;
    expect(total).toBe(8);
  });

  test("the documented default limit is 600/min (module 06 §5.1)", () => {
    expect(acmeConfig().rateLimit).toEqual({ limit: 600, windowMs: 60_000 });
  });
});

// ---------------------------------------------------------------------------
// 404 / 405 / stateful 5xx
// ---------------------------------------------------------------------------

describe("error semantics (ISC-74)", () => {
  test("unknown path → 404 not_found naming the request", () => {
    const { router } = clockRouter();
    const res = router.handle({ method: "GET", path: "/api/v2/user", headers: { Authorization: `Api-Key ${ACME_API_KEY}` } });
    expect(res.status).toBe(404);
    expect(res.body).toBe(ERRORS.notFound("GET", "/api/v2/user"));
  });

  test("wrong method on known paths → 405 with Allow header", () => {
    const { router } = clockRouter();
    const t = router.handle({ method: "GET", path: "/oauth/token" });
    expect(t.status).toBe(405);
    expect(header(t, "Allow")).toBe("POST");
    const u = router.handle({ method: "POST", path: "/api/v2/users", headers: { Authorization: `Api-Key ${ACME_API_KEY}` } });
    expect(u.status).toBe(405);
    expect(header(u, "Allow")).toBe("GET");
    expect(u.body).toBe(ERRORS.methodNotAllowed("POST", "/api/v2/users"));
  });

  test("failNext injects bounded 503s, then service recovers (retry-the-5xx lesson)", () => {
    const { router } = clockRouter();
    router.failNext(2);
    const auth = `Api-Key ${ACME_API_KEY}`;
    const first = getUsers(router, auth);
    expect(first.status).toBe(503);
    expect(first.body).toBe(ERRORS.serverError());
    expect(getUsers(router, auth).status).toBe(503);
    expect(getUsers(router, auth).status).toBe(200); // bounded retry succeeds
  });
});

// ---------------------------------------------------------------------------
// determinism + custom config
// ---------------------------------------------------------------------------

describe("determinism and configurability", () => {
  test("two fresh routers replaying the same sequence emit byte-identical responses", () => {
    const a = clockRouter().router;
    const b = clockRouter().router;
    const seq = (r: ApiRouter): string[] => {
      const out: string[] = [];
      out.push(getUsers(r).body);
      const tok = issueToken(r);
      out.push(tok.body);
      out.push(getUsers(r, `Bearer ${tokenOf(tok)}`).body);
      out.push(getUsers(r, `Bearer ${tokenOf(tok)}`, USERS_PAGE_2_CURSOR).body);
      return out;
    };
    expect(seq(a)).toEqual(seq(b));
  });

  test("zero-config router is the canonical vendor on the real clock", () => {
    const router = createApiRouter();
    expect(router.host).toBe("acme.example");
    // real Date.now drives expiry: a token issued now is immediately usable
    const token = tokenOf(issueToken(router));
    expect(getUsers(router, `Bearer ${token}`).body).toBe(PAGE_1_BYTES);
  });

  test("custom config (assessment-mode fresh fixtures) + multibyte Content-Length", () => {
    const cfg = acmeConfig();
    const body = '{ "note": "café — 12€ 𝄞" }\n'; // 2-, 3-, and 4-byte UTF-8 on purpose
    cfg.collections["/api/v2/notes"] = { scope: "users:read", pages: [{ cursor: null, body }] };
    const router = createApiRouter({ now: () => 0, config: cfg });
    const res = router.handle({ method: "GET", path: "/api/v2/notes", headers: { Authorization: `Api-Key ${ACME_API_KEY}` } });
    expect(res.status).toBe(200);
    expect(header(res, "Content-Length")).toBe(String(Buffer.byteLength(body)));
  });
});

// ---------------------------------------------------------------------------
// ISC-79: simulated webhook delivery
// ---------------------------------------------------------------------------

describe("webhook simulation (ISC-79)", () => {
  test("mfa-disabled event renders as a POST delivery for canon offender u_002", () => {
    const d = simulateMfaDisabledDelivery({ url: "https://hooks.corp.example/grc", nowMs: 1_750_000_000_000 });
    expect(d.method).toBe("POST");
    expect(d.event).toBe("user.mfa_disabled");
    expect(d.url).toBe("https://hooks.corp.example/grc");
    const body = JSON.parse(d.body) as { event: string; occurred_at: string; data: Record<string, unknown> };
    expect(body.event).toBe("user.mfa_disabled");
    expect(body.occurred_at).toBe(d.deliveredAt);
    expect(body.data).toEqual({ id: "u_002", email: "bob@acme.example", mfa_enabled: false, status: "active" });
    expect(d.headers.find(([k]) => k === "X-Acme-Event")?.[1]).toBe("user.mfa_disabled");
    expect(d.headers.find(([k]) => k === "Content-Length")?.[1]).toBe(String(Buffer.byteLength(d.body)));
    // deterministic given the same sim clock
    expect(simulateMfaDisabledDelivery({ url: "https://hooks.corp.example/grc", nowMs: 1_750_000_000_000 })).toEqual(d);
  });
});

// ---------------------------------------------------------------------------
// ISC-78: taught curl through the shell engine — byte-stable vs committed fixtures
// ---------------------------------------------------------------------------

function newApiSession(apiLab: ApiLabOptions = {}): ShellSession {
  return createShellEngine().create({
    variant: "bash-linux",
    seed: { files: [], tools: {} },
    epoch: "2026-06-01T09:00:00Z",
    cols: 80,
    user: "analyst",
    host: "workstation",
    home: "/home/analyst",
    apiLab,
  });
}

function run(s: ShellSession, line: string): { stdout: string; stderr: string; exit: number } {
  let r: ExecResult = s.exec(line);
  if (r.state === "pending") r = s.eof();
  return {
    stdout: r.events.filter((e) => e.stream === "stdout").map((e) => e.text).join(""),
    stderr: r.events.filter((e) => e.stream === "stderr").map((e) => e.text).join(""),
    exit: r.state === "done" ? r.exit : -1,
  };
}

describe("curl in the terminal sim (ISC-78)", () => {
  test("full taught flow: 401 → token → bearer pull of BOTH pages, byte-equal to committed fixtures", () => {
    const s = newApiSession();
    const unauth = run(s, "curl -s https://acme.example/api/v2/users");
    expect(unauth.exit).toBe(0); // curl exits 0 on HTTP errors; the STATUS is the verdict
    expect(unauth.stdout).toBe(ERRORS.noAuth());

    const tok = run(s, `curl -s -X POST https://acme.example/oauth/token -d '${TOKEN_BODY}'`);
    expect(tok.exit).toBe(0);
    const token = (JSON.parse(tok.stdout) as { access_token: string }).access_token;
    expect(token).toMatch(/^tok_[0-9a-f]{32}$/);

    const p1 = run(s, `curl -s -H "Authorization: Bearer ${token}" https://acme.example/api/v2/users`);
    expect(p1.stdout).toBe(PAGE_1_BYTES);
    const p2 = run(s, `curl -s -H "Authorization: Bearer ${token}" 'https://acme.example/api/v2/users?cursor=${USERS_PAGE_2_CURSOR}'`);
    expect(p2.stdout).toBe(PAGE_2_BYTES);
  });

  test("byte-stability: two fresh sessions produce identical transcripts (incl. tokens)", () => {
    const transcript = (s: ShellSession): string[] => [
      run(s, "curl -s https://acme.example/api/v2/users").stdout,
      run(s, `curl -s -X POST https://acme.example/oauth/token -d '${TOKEN_BODY}'`).stdout,
      run(s, `curl -s -H 'Authorization: Api-Key ${ACME_API_KEY}' https://acme.example/api/v2/devices`).stdout,
    ];
    const a = transcript(newApiSession());
    const b = transcript(newApiSession());
    expect(a).toEqual(b);
    expect(a[2]).toBe(DEVICES_PAGE_1);
  });

  test("-i prints status line + stable headers before the body", () => {
    const s = newApiSession();
    const res = run(s, `curl -si -H 'Authorization: Api-Key ${ACME_API_KEY}' https://acme.example/api/v2/users`);
    const expectedHead = `HTTP/1.1 200 OK\nContent-Type: application/json\nContent-Length: ${Buffer.byteLength(PAGE_1_BYTES)}\n\n`;
    expect(res.stdout).toBe(expectedHead + PAGE_1_BYTES);
  });

  test("attached option values and --data work; -d implies POST (token via -XPOST/--data)", () => {
    const s = newApiSession();
    const res = run(
      s,
      `curl -si -XPOST https://acme.example/oauth/token --data grant_type=client_credentials -d client_id=${ACME_CLIENT_ID} -d client_secret=${ACME_CLIENT_SECRET}`,
    );
    expect(res.stdout.startsWith("HTTP/1.1 200 OK\n")).toBe(true);
    // -d implies POST without -X, too
    const implied = run(s, `curl -s https://acme.example/oauth/token -d '${TOKEN_BODY}'`);
    expect((JSON.parse(implied.stdout) as { token_type: string }).token_type).toBe("Bearer");
  });

  test("token expiry is honest against the sim clock: sleep 3601 → 401 expired", () => {
    const s = newApiSession();
    const tok = run(s, `curl -s https://acme.example/oauth/token -d '${TOKEN_BODY}'`);
    const token = (JSON.parse(tok.stdout) as { access_token: string }).access_token;
    expect(run(s, `curl -s -H "Authorization: Bearer ${token}" https://acme.example/api/v2/users`).stdout).toBe(PAGE_1_BYTES);
    expect(run(s, "sleep 3601").exit).toBe(0);
    const expired = run(s, `curl -s -H "Authorization: Bearer ${token}" https://acme.example/api/v2/users`);
    expect(expired.stdout).toBe(ERRORS.expiredToken());
  });

  test("429 drill: exceed the lab limit, read Retry-After, sleep it, retry succeeds", () => {
    const s = newApiSession({ rateLimit: { limit: 2, windowMs: 60_000 } });
    const auth = `-H 'Authorization: Api-Key ${ACME_API_KEY}'`;
    expect(run(s, `curl -s ${auth} https://acme.example/api/v2/users`).stdout).toBe(PAGE_1_BYTES);
    expect(run(s, `curl -s ${auth} https://acme.example/api/v2/devices`).stdout).toBe(DEVICES_PAGE_1);
    const limited = run(s, `curl -si ${auth} https://acme.example/api/v2/users`);
    expect(limited.stdout.startsWith("HTTP/1.1 429 Too Many Requests\n")).toBe(true);
    expect(limited.stdout).toContain("\nRetry-After: 60\n");
    expect(limited.stdout).toContain('"error": "rate_limited"');
    expect(run(s, "sleep 60").exit).toBe(0); // honoring the signal (sim clock advances)
    const retried = run(s, `curl -s ${auth} https://acme.example/api/v2/users`);
    expect(retried.stdout).toBe(PAGE_1_BYTES);
  });

  test("schemeless URL resolves; non-acme hosts honestly fail (the box has no network)", () => {
    const s = newApiSession();
    expect(run(s, "curl -s acme.example/api/v2/users").stdout).toBe(ERRORS.noAuth());
    const other = run(s, "curl -s https://example.com/api");
    expect(other.exit).toBe(6);
    expect(other.stderr).toBe("curl: (6) Could not resolve host: example.com\n");
  });

  test("no URL / missing option values exit 2 with curl's documented error lines", () => {
    const s = newApiSession();
    const noUrl = run(s, "curl -s");
    expect(noUrl.exit).toBe(2);
    expect(noUrl.stderr).toBe("curl: no URL specified!\ncurl: try 'curl --help' or 'curl --manual' for more information\n");
    expect(run(s, "curl -H").exit).toBe(2);
    expect(run(s, "curl --data").exit).toBe(2);
  });

  test("outside the taught surface → declared sim boundary, never invented output (ISC-120)", () => {
    const s = newApiSession();
    for (const line of [
      "curl -o out.json https://acme.example/api/v2/users",
      "curl --verbose https://acme.example/api/v2/users",
      "curl https://acme.example/api/v2/users https://acme.example/api/v2/devices",
      "curl ftp://acme.example/files",
      "curl /api/v2/users",
    ]) {
      const r = run(s, line);
      expect(r.exit).toBe(64);
      expect(r.stderr).toContain("outside this lab's simulated surface");
    }
  });

  test("malformed -H (no colon) is ignored → request goes out unauthenticated", () => {
    const s = newApiSession();
    expect(run(s, "curl -s -H Authorization https://acme.example/api/v2/users").stdout).toBe(ERRORS.noAuth());
  });

  test("-d default Content-Type is form-urlencoded but an explicit -H wins", () => {
    const s = newApiSession();
    // explicit JSON content-type on the token endpoint: body is not form-decodable JSON,
    // so grant_type check fails → proves the explicit header replaced the default path
    const res = run(s, `curl -si https://acme.example/oauth/token -H 'Content-Type: application/json' -d '{"grant_type":"client_credentials"}'`);
    expect(res.stdout.startsWith("HTTP/1.1 400 Bad Request\n")).toBe(true);
  });

  test("wrong method via curl: -d to a GET-only collection → 405 with Allow", () => {
    const s = newApiSession();
    const res = run(s, `curl -si -H 'Authorization: Api-Key ${ACME_API_KEY}' https://acme.example/api/v2/users -d x=1`);
    expect(res.stdout.startsWith("HTTP/1.1 405 Method Not Allowed\nContent-Type: application/json\n")).toBe(true);
    expect(res.stdout).toContain("\nAllow: GET\n");
  });

  test("negative space preserved: curl is command-not-found on non-apiLab boxes", () => {
    const plain = createShellEngine().create({
      variant: "bash-linux",
      seed: { files: [], tools: {} },
      epoch: "2026-06-01T09:00:00Z",
      cols: 80,
      user: "analyst",
      host: "workstation",
      home: "/home/analyst",
    });
    const r = run(plain, "curl https://acme.example/api/v2/users");
    expect(r.exit).toBe(127);
    expect(r.stderr).toBe("bash: curl: command not found\n");
  });

  test("clean sub-environments have no vendor attached (runScriptClean → resolve failure)", () => {
    const s = createShellEngine().create({
      variant: "bash-linux",
      seed: { files: [{ path: "~/pull.sh", content: "curl -s https://acme.example/api/v2/users\n" }], tools: {} },
      epoch: "2026-06-01T09:00:00Z",
      cols: 80,
      user: "analyst",
      host: "workstation",
      home: "/home/analyst",
      apiLab: {},
    });
    const r = s.runScriptClean("~/pull.sh", []);
    expect(r.exit).toBe(6);
    expect(r.stderr).toBe("curl: (6) Could not resolve host: acme.example\n");
  });

  test("router is reattached fresh on snapshot restore (tokens are short-lived state)", () => {
    const s = newApiSession();
    const tok = run(s, `curl -s https://acme.example/oauth/token -d '${TOKEN_BODY}'`);
    const token = (JSON.parse(tok.stdout) as { access_token: string }).access_token;
    const snap = s.snapshot();
    const restored = createShellEngine().restore(snap, {
      variant: "bash-linux",
      seed: { files: [], tools: {} },
      epoch: "2026-06-01T09:00:00Z",
      cols: 80,
      user: "analyst",
      host: "workstation",
      home: "/home/analyst",
      apiLab: {},
    });
    const after = run(restored, `curl -s -H "Authorization: Bearer ${token}" https://acme.example/api/v2/users`);
    expect(after.stdout).toBe(ERRORS.unknownToken()); // old token gone; re-auth required
    const fresh = run(restored, `curl -s https://acme.example/oauth/token -d '${TOKEN_BODY}'`);
    expect((JSON.parse(fresh.stdout) as { access_token: string }).access_token).toMatch(/^tok_[0-9a-f]{32}$/);
  });
});

// ---------------------------------------------------------------------------
// seed integrity: .ci/fixtures/seeds/m06 mirrors the committed lab assets
// ---------------------------------------------------------------------------

describe("m06 seed (.ci/fixtures/seeds/m06)", () => {
  const SEED = join(ROOT, ".ci/fixtures/seeds/m06/home/lab06");
  const LABS = join(ROOT, "modules/06-api-fundamentals/labs");
  for (const rel of ["setup.sh", "aggregate-mfa.ts", "happy-path.sh", "fixtures/users-page-1.json", "fixtures/users-page-2.json"]) {
    test(`${rel} is byte-identical to the module's labs/ asset`, () => {
      expect(readFileSync(join(SEED, rel), "utf8")).toBe(readFileSync(join(LABS, rel), "utf8"));
    });
  }
});
