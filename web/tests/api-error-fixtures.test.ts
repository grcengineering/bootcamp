/**
 * acme.example auth-ladder + error-body fixture suite (web ISA ISC-74..78; engine-honesty
 * pass 2026-06-13).
 *
 * acme.example is wholly fictional — no real host to capture — so every error body is
 * authored in src/engines/api/acme.ts (ERRORS). This suite makes the COMMITTED FIXTURE
 * the source of truth instead of the code:
 *   1. fixture ↔ code: each .ci/fixtures/captured/m06-err-*.json `body` is byte-equal to
 *      its ERRORS.*() output (so editing the code without updating the doc-cited fixture
 *      fails here — the citation no longer lives only in a code comment);
 *   2. router ↔ fixture: a real request that triggers the error returns the fixture's
 *      status + byte-identical body through the live ApiRouter (so the engine is asserted
 *      against the fixture, not against itself);
 *   3. manifest ↔ fixture: every authored m06-err-* manifest entry has a fixture with a
 *      citation, and vice versa (the manifest-lint citation gate covers these).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  createApiRouter,
  ERRORS,
  ACME_API_KEY,
  ACME_CLIENT_ID,
  ACME_CLIENT_SECRET,
  SCOPE_DEVICES_READ,
  type ApiRouter,
  type ApiResponse,
} from "../src/engines/api";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const FIXTURES = join(ROOT, ".ci/fixtures");
const CAPTURED = join(FIXTURES, "captured");
const manifest = parseYaml(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));

interface ErrorFixture {
  id: string;
  module: string;
  source: string;
  match: string;
  status: number;
  error_code: string;
  citation: string;
  body: string;
  provenance: { captured_with: string };
}

const errFiles = readdirSync(CAPTURED)
  .filter((f) => f.startsWith("m06-err-") && f.endsWith(".json"))
  .sort();

function loadFixture(file: string): ErrorFixture {
  return JSON.parse(readFileSync(join(CAPTURED, file), "utf8"));
}

/** The exact ERRORS.*() call each fixture pins (fixture is canon; this maps it back). */
const ERROR_THUNK: Record<string, () => string> = {
  "m06-err-unauth-401": () => ERRORS.noAuth(),
  "m06-err-badscheme-401": () => ERRORS.badScheme("Basic"),
  "m06-err-badapikey-401": () => ERRORS.badApiKey(),
  "m06-err-unknowntoken-401": () => ERRORS.unknownToken(),
  "m06-err-expiredtoken-401": () => ERRORS.expiredToken(),
  "m06-err-insufficientscope-403": () => ERRORS.insufficientScope("users:read"),
  "m06-err-notfound-404": () => ERRORS.notFound("GET", "/api/v2/user"),
  "m06-err-methodnotallowed-405": () => ERRORS.methodNotAllowed("POST", "/api/v2/users"),
  "m06-err-ratelimited-429": () => ERRORS.rateLimited(600),
  "m06-err-invalidcursor-400": () => ERRORS.invalidCursor("bm9wZQ=="),
  "m06-err-servererror-503": () => ERRORS.serverError(),
  "m06-err-unsupportedgrant-400": () => ERRORS.unsupportedGrant(),
  "m06-err-invalidclient-401": () => ERRORS.invalidClient(),
  "m06-err-invalidscope-400": () => ERRORS.invalidScope("admin:write"),
  "m06-err-missingcredentials-400": () => ERRORS.missingCredentials(),
};

// ---------------------------------------------------------------------------
// 1. fixture ↔ code: the committed fixture body IS the ERRORS.*() output
// ---------------------------------------------------------------------------

describe("m06 error fixtures: committed body ↔ ERRORS.*() (fixture is canon)", () => {
  for (const file of errFiles) {
    const fx = loadFixture(file);
    test(`${fx.id} [${fx.match}] status ${fx.status}`, () => {
      expect(fx.source).toBe("authored");
      expect(fx.match).toBe("authored-with-citation");
      expect(fx.citation).toBeTruthy();
      expect(fx.provenance.captured_with).toBeTruthy();
      const thunk = ERROR_THUNK[fx.id];
      expect(thunk).toBeDefined();
      // the doc/RFC-cited fixture body is byte-equal to the engine's authored output
      expect(thunk!()).toBe(fx.body);
      // body is the documented { "error", "message" } shape with the fixture's code
      const parsed = JSON.parse(fx.body) as Record<string, string>;
      expect(Object.keys(parsed).sort()).toEqual(["error", "message"]);
      expect(parsed.error).toBe(fx.error_code);
    });
  }

  test("every m06-err manifest entry has a fixture, and vice versa", () => {
    const entryIds = (manifest.entries as Array<{ id: string; source: string }>)
      .filter((e) => e.id.startsWith("m06-err-"))
      .map((e) => e.id)
      .sort();
    const fixtureIds = errFiles.map((f) => f.replace(/\.json$/, "")).sort();
    expect(entryIds).toEqual(fixtureIds);
    expect(entryIds.length).toBeGreaterThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// 2. router ↔ fixture: the live router emits the fixture's status + body
// ---------------------------------------------------------------------------

const FIXED_NOW = 1_750_000_000_000;
const TOKEN_BODY = `grant_type=client_credentials&client_id=${ACME_CLIENT_ID}&client_secret=${ACME_CLIENT_SECRET}`;

function clockRouter(opts: { limit?: number } = {}): { router: ApiRouter; advance: (ms: number) => void } {
  let nowMs = FIXED_NOW;
  const router = createApiRouter({
    now: () => nowMs,
    rateLimit: opts.limit !== undefined ? { limit: opts.limit, windowMs: 60_000 } : undefined,
  });
  return { router, advance: (ms) => { nowMs += ms; } };
}

function getUsers(router: ApiRouter, auth?: string, cursor?: string): ApiResponse {
  return router.handle({
    method: "GET",
    path: cursor === undefined ? "/api/v2/users" : `/api/v2/users?cursor=${cursor}`,
    headers: auth === undefined ? {} : { Authorization: auth },
  });
}

function issueToken(router: ApiRouter, body: string): ApiResponse {
  return router.handle({ method: "POST", path: "/oauth/token", body });
}

function tokenOf(res: ApiResponse): string {
  return (JSON.parse(res.body) as { access_token: string }).access_token;
}

/** Drive the router into each error state and capture the live response. */
function triggerError(id: string): ApiResponse {
  switch (id) {
    case "m06-err-unauth-401":
      return getUsers(clockRouter().router);
    case "m06-err-badscheme-401":
      return getUsers(clockRouter().router, "Basic YWxhZGRpbjpvcGVuc2VzYW1l");
    case "m06-err-badapikey-401":
      return getUsers(clockRouter().router, "Api-Key 9f8c0000000000000000000000000000");
    case "m06-err-unknowntoken-401":
      return getUsers(clockRouter().router, "Bearer tok_ffffffffffffffffffffffffffffffff");
    case "m06-err-expiredtoken-401": {
      const { router, advance } = clockRouter();
      const token = tokenOf(issueToken(router, TOKEN_BODY));
      advance(3_601_000); // past the 3600s TTL
      return getUsers(router, `Bearer ${token}`);
    }
    case "m06-err-insufficientscope-403": {
      const { router } = clockRouter();
      const narrow = tokenOf(issueToken(router, `${TOKEN_BODY}&scope=${SCOPE_DEVICES_READ}`));
      return getUsers(router, `Bearer ${narrow}`);
    }
    case "m06-err-notfound-404":
      return clockRouter().router.handle({
        method: "GET",
        path: "/api/v2/user",
        headers: { Authorization: `Api-Key ${ACME_API_KEY}` },
      });
    case "m06-err-methodnotallowed-405":
      return clockRouter().router.handle({
        method: "POST",
        path: "/api/v2/users",
        headers: { Authorization: `Api-Key ${ACME_API_KEY}` },
      });
    case "m06-err-ratelimited-429": {
      // the fixture pins limit=600 (the documented default); exhaust the real default window
      const { router } = clockRouter();
      const auth = `Api-Key ${ACME_API_KEY}`;
      for (let i = 0; i < 600; i++) expect(getUsers(router, auth).status).toBe(200);
      return getUsers(router, auth);
    }
    case "m06-err-invalidcursor-400":
      return getUsers(clockRouter().router, `Api-Key ${ACME_API_KEY}`, "bm9wZQ==");
    case "m06-err-servererror-503": {
      const { router } = clockRouter();
      router.failNext(1);
      return getUsers(router, `Api-Key ${ACME_API_KEY}`);
    }
    case "m06-err-unsupportedgrant-400":
      return issueToken(clockRouter().router, "grant_type=password");
    case "m06-err-invalidclient-401":
      return issueToken(clockRouter().router, `grant_type=client_credentials&client_id=${ACME_CLIENT_ID}&client_secret=nope`);
    case "m06-err-invalidscope-400":
      return issueToken(clockRouter().router, `${TOKEN_BODY}&scope=admin:write`);
    case "m06-err-missingcredentials-400":
      return issueToken(clockRouter().router, "grant_type=client_credentials");
    default:
      throw new Error(`no trigger wired for ${id}`);
  }
}

describe("m06 error fixtures: live router ↔ committed fixture (byte-equal status + body)", () => {
  for (const file of errFiles) {
    const fx = loadFixture(file);
    test(`${fx.id} → ${fx.status} byte-identical to fixture`, () => {
      const res = triggerError(fx.id);
      expect(res.status).toBe(fx.status);
      expect(res.body).toBe(fx.body);
    });
  }
});
