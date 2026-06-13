/**
 * oauth-oidc-sim + saml-xml behavior suite (Wave-4 honesty doctrine — identity module).
 *
 * The RFC 6749 / OIDC Core state machine IS the consequence engine; the SAML reader parses the
 * real OASIS-spec assertion and the Conditions evaluator COMPUTES the staleness verdict. This
 * suite asserts:
 *   - the canonical authorization-code + OIDC dance reaches resource access;
 *   - out-of-order moves raise the REAL OAuth errors (RFC 6749 §4.1.2.1 / §5.2): a resource
 *     call before the token exchange → invalid_request; a missing code → invalid_request; a bad
 *     grant → invalid_grant; no bearer token → unauthorized (401) — asserted by error string;
 *   - the saml-xml reader reads <Issuer>/<Subject>/<Conditions>/<AuthnStatement>/
 *     <AuthnContextClassRef> off the real assertion; and
 *   - the expired-Conditions twin's window is COMPUTED stale (now >= NotOnOrAfter, exclusive),
 *     never an authored verdict — the divergent field between the clean and tampered assertions
 *     is the parser's computed NotOnOrAfter difference.
 *
 * No authored answer key: the error a wrong move raises is the sim's output; the staleness is
 * evaluateConditions()'s computation; the field values are the parser's read of the real XML.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  canonicalDance,
  runDance,
  OAUTH_ERRORS,
  type OAuthMessage,
} from "../src/engines/visual/oauth-oidc-sim";
import {
  parseSamlAssertion,
  parseSamlFields,
  evaluateConditions,
} from "../src/engines/visual/saml";

const NET = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/net");
const IDENTITY = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/identity");
const danceFixture = JSON.parse(readFileSync(join(IDENTITY, "oauth-oidc-dance.json"), "utf8"));
const samlXml = readFileSync(join(IDENTITY, "saml-assertion.xml"), "utf8");
const samlExpiredXml = readFileSync(join(IDENTITY, "saml-assertion-expired.xml"), "utf8");
void NET;

describe("oauth-oidc-sim — RFC 6749 authorization-code + OIDC dance reaches resource access", () => {
  test("the canonical dance completes (token exchanged once, short-lived token used)", () => {
    const { probe, error } = runDance(canonicalDance());
    expect(probe.reachedEndState).toBe(true);
    expect(error).toBeNull();
    expect(probe.lastAlert).toBeNull();
    expect(Object.keys(probe.canonical)[0]).toBe(danceFixture.dance.canonical_ref);
    expect(probe.canonical[danceFixture.dance.canonical_ref].map((m) => m.type)).toEqual(
      danceFixture.dance.cards.map((c: { type: string }) => c.type),
    );
  });

  test("the valet-key shape: the credential goes to the authz server once, the token rides the resource call", () => {
    const canon = canonicalDance();
    const tokenReq = canon.find((m) => m.type === "token_request")!;
    expect(tokenReq.from).toBe("client");
    expect(tokenReq.to).toBe("authz-server");
    const resourceReq = canon.find((m) => m.type === "resource_request")!;
    expect(resourceReq.to).toBe("resource-server");
    expect(resourceReq.fields!.authorization).toContain("Bearer");
  });

  test("the error registry holds the literal RFC 6749 §5.2 strings", () => {
    expect(OAUTH_ERRORS.invalid_request).toBe("invalid_request");
    expect(OAUTH_ERRORS.invalid_grant).toBe("invalid_grant");
    expect(OAUTH_ERRORS.access_denied).toBe("access_denied");
  });
});

describe("oauth-oidc-sim — out-of-order moves raise the REAL OAuth errors", () => {
  test("a resource call BEFORE the token exchange → invalid_request (the valet key was never issued)", () => {
    const bad: OAuthMessage[] = [
      { from: "client", to: "authz-server", type: "authorization_request" },
      { from: "authz-server", to: "client", type: "authorization_response" },
      { from: "client", to: "resource-server", type: "resource_request" }, // skipped the token exchange
    ];
    const { probe, error } = runDance(bad);
    expect(probe.reachedEndState).toBe(false);
    expect(error!.error).toBe("invalid_request");
    expect(probe.lastAlert!.name).toBe("invalid_request");
    expect(error!.detail).toContain("before exchanging the authorization code");
    expect(danceFixture.dance.break_cards.resource_before_token.expect_error).toBe("invalid_request");
  });

  test("an authorization response with no code → invalid_request", () => {
    const ordered = canonicalDance();
    const { error } = runDance(ordered, { 1: { missing_code: true } });
    expect(error!.error).toBe("invalid_request");
    expect(error!.detail).toContain("no `code`");
  });

  test("a token request with a bad/expired grant → invalid_grant", () => {
    const ordered = canonicalDance();
    const { error } = runDance(ordered, { 2: { bad_grant: true } });
    expect(error!.error).toBe("invalid_grant");
  });

  test("a resource request with no bearer token → unauthorized (401)", () => {
    const ordered = canonicalDance();
    const { probe, error } = runDance(ordered, { 4: { no_token: true } });
    expect(error!.error).toBe("unauthorized");
    expect(probe.lastAlert!.code).toBe(401);
  });

  test("starting with a token request (no authorization first) → invalid_request", () => {
    const bad: OAuthMessage[] = [{ from: "client", to: "authz-server", type: "token_request" }];
    const { error } = runDance(bad);
    expect(error!.error).toBe("invalid_request");
    expect(error!.detail).toContain("not the protocol's next act");
  });

  test("an empty dance never reaches the end state and raises no error", () => {
    const { probe, error } = runDance([]);
    expect(probe.reachedEndState).toBe(false);
    expect(error).toBeNull();
  });

  test("any act after the dance is complete (DONE) → invalid_request (the dance is over)", () => {
    // append a second resource_request after the dance reaches DONE
    const overlong: OAuthMessage[] = [
      ...canonicalDance(),
      { from: "client", to: "resource-server", type: "resource_request" },
    ];
    const { probe, error } = runDance(overlong);
    expect(probe.reachedEndState).toBe(false); // the extra act invalidates the completed dance
    expect(error!.error).toBe("invalid_request");
    expect(error!.detail).toContain("the dance is complete");
  });
});

describe("saml-xml — reads the real OASIS assertion's fields (scope-bounded, no XML-DSig)", () => {
  test("the field reader pulls Issuer / Subject / Conditions / AuthnStatement off the real XML", () => {
    const f = parseSamlFields(samlXml);
    expect(f.version).toBe("2.0");
    expect(f.issuer).toBe("https://idp.example.com/saml");
    expect(f.nameId).toBe("jane.auditor@example.com");
    expect(f.nameIdFormat).toContain("emailAddress");
    expect(f.notBefore).toBe("2024-01-01T11:59:00Z");
    expect(f.notOnOrAfter).toBe("2030-01-01T00:00:00Z");
    expect(f.audience).toBe("https://sp.example.org/saml");
    expect(f.authnInstant).toBe("2024-01-01T12:00:00Z");
    expect(f.authnContextClassRef).toContain("PasswordProtectedTransport");
  });

  test("the parse tree exposes named regions the PEEL surface selects", () => {
    const probe = parseSamlAssertion(samlXml);
    expect(probe.region("saml.issuer")!.value).toBe("https://idp.example.com/saml");
    expect(probe.region("saml.conditions.notonorafter")!.value).toBe("2030-01-01T00:00:00Z");
    expect(probe.region("saml.authn.contextclassref")!.value).toContain("PasswordProtectedTransport");
    // a non-assertion buffer is the one hard error
    expect(() => parseSamlAssertion("<not-saml/>")).toThrow(/not a SAML assertion/);
  });

  test("a region's byte span locates the field text for boundary checks (region_labeled_correctly)", () => {
    const probe = parseSamlAssertion(samlXml);
    const noa = probe.region("saml.conditions.notonorafter")!;
    expect(noa.end).toBeGreaterThan(noa.start);
    // the value at that span is the real NotOnOrAfter substring
    expect(samlXml.slice(noa.start, noa.end)).toBe("2030-01-01T00:00:00Z");
    expect(probe.regionAt({ start: noa.start, end: noa.end })).not.toBeNull();
    expect(probe.decode({ start: noa.start, end: noa.end })).toBe("2030-01-01T00:00:00Z");
  });
});

describe("saml-xml — the expired-Conditions break is COMPUTED, not authored", () => {
  const now = "2025-06-13T12:00:00Z";

  test("the clean assertion is valid at 'now' (now < NotOnOrAfter)", () => {
    const f = parseSamlFields(samlXml);
    const v = evaluateConditions(f, now);
    expect(v.valid).toBe(true);
    expect(v.reason).toContain("within the window");
  });

  test("the tampered twin is STALE: now >= NotOnOrAfter (the divergent field is the parser's compute)", () => {
    const fClean = parseSamlFields(samlXml);
    const fExpired = parseSamlFields(samlExpiredXml);
    // the ONLY divergent field between the two real assertions is NotOnOrAfter
    expect(fClean.issuer).toBe(fExpired.issuer);
    expect(fClean.nameId).toBe(fExpired.nameId);
    expect(fClean.authnContextClassRef).toBe(fExpired.authnContextClassRef);
    expect(fClean.notOnOrAfter).not.toBe(fExpired.notOnOrAfter);
    expect(fExpired.notOnOrAfter).toBe("2024-01-02T00:00:00Z");
    const v = evaluateConditions(fExpired, now);
    expect(v.valid).toBe(false);
    expect(v.reason).toContain("on/after NotOnOrAfter");
    expect(v.reason).toContain("window has closed");
  });

  test("the NotBefore guard and unparseable inputs are handled (totality)", () => {
    const f = parseSamlFields(samlXml);
    // before the window opens
    expect(evaluateConditions(f, "2020-01-01T00:00:00Z").valid).toBe(false);
    expect(evaluateConditions(f, "2020-01-01T00:00:00Z").reason).toContain("before NotBefore");
    // unparseable "now"
    expect(evaluateConditions(f, "not-a-date").valid).toBe(false);
    // an assertion with no Conditions window is unconstrained
    const noConditions = parseSamlFields("<saml:Assertion xmlns:saml=\"urn:oasis:names:tc:SAML:2.0:assertion\" Version=\"2.0\"><saml:Issuer>x</saml:Issuer></saml:Assertion>");
    expect(evaluateConditions(noConditions, now).valid).toBe(true);
    expect(evaluateConditions(noConditions, now).reason).toContain("no Conditions window");
    // an unparseable NotOnOrAfter
    const badNoa = { ...f, notOnOrAfter: "garbage" };
    expect(evaluateConditions(badNoa, now).valid).toBe(false);
  });
});
