/**
 * oauth-oidc-sim (engine id: `oauth`) — the identity module's OAuth 2.0 authorization-code +
 * OpenID Connect "valet-key dance" state machine (TRACE consequence engine).
 *
 * Pure, DOM-free TypeScript: runs the RFC 6749 §4.1 authorization-code grant (with the OIDC
 * Core 1.0 id_token leg). It accepts the learner's ORDERED dance cards and either reaches the
 * resource-access end state (a short-lived access token granted and used) or rejects an illegal
 * move with the REAL OAuth error code (RFC 6749 §4.1.2.1 / §5.2):
 *   invalid_request — a required step out of order or missing (e.g. calling the resource server
 *                     before exchanging the authorization code for a token; an authorization
 *                     response with no code).
 *   unsupported_response_type / unauthorized_client / access_denied — declared per §4.1.2.1.
 *   invalid_grant   — the token endpoint was given something other than a valid code (§5.2).
 *
 * The valet-key insight made tangible: the long-lived credential is exchanged ONCE at the
 * authorization server; a short-lived scoped token rides every subsequent resource call. The
 * state machine IS the oracle — the accepted order and the error a wrong move raises are the
 * protocol's behaviour, not an authored answer key. Ground truth: RFC 6749 §4.1 (the grant),
 * §4.1.2.1 + §5.2 (the error codes), OpenID Connect Core 1.0 §3.1 (the authentication request /
 * id_token). Reproducible against a real IdP authorize/token endpoint.
 *
 * Output is a TraceProbe (web/src/verifiers/registry.ts) so sequence_matches / sim_alert_is read
 * it through the SAME closed registry the packet TRACE uses.
 */

import type { TraceProbe } from "../../verifiers/registry";

/** Participants in the authorization-code dance (RFC 6749 §1.1 roles). */
export type OAuthParticipant = "user-agent" | "client" | "authz-server" | "resource-server";

/**
 * The protocol acts the learner sequences (RFC 6749 §4.1 steps + the OIDC id_token).
 *   authorization_request  — client → authz-server (response_type=code, scope, redirect_uri)
 *   authorization_response — authz-server → user-agent → client (the one-time code)
 *   token_request          — client → authz-server (grant_type=authorization_code + the code)
 *   token_response         — authz-server → client (short-lived access_token [+ id_token])
 *   resource_request       — client → resource-server (Authorization: Bearer access_token)
 *   resource_response      — resource-server → client (the protected resource)
 */
export type OAuthActType =
  | "authorization_request"
  | "authorization_response"
  | "token_request"
  | "token_response"
  | "resource_request"
  | "resource_response";

/** One dance card. */
export interface OAuthMessage {
  from: OAuthParticipant;
  to: OAuthParticipant;
  type: OAuthActType;
  fields?: Record<string, string>;
}

/** RFC 6749 §4.1.2.1 / §5.2 error codes the sim raises. */
export const OAUTH_ERRORS = {
  invalid_request: "invalid_request",
  unauthorized_client: "unauthorized_client",
  access_denied: "access_denied",
  unsupported_response_type: "unsupported_response_type",
  invalid_scope: "invalid_scope",
  invalid_grant: "invalid_grant",
  invalid_client: "invalid_client",
  unauthorized: "unauthorized", // resource server 401 (RFC 6750 §3.1)
} as const;

export type OAuthErrorName = keyof typeof OAUTH_ERRORS;

/**
 * The canonical authorization-code + OIDC dance order — the sequence the sim accepts as the
 * completed valet-key handoff.
 */
export function canonicalDance(): OAuthMessage[] {
  return [
    { from: "client", to: "authz-server", type: "authorization_request", fields: { response_type: "code", scope: "openid profile", redirect_uri: "https://app.example.com/cb" } },
    { from: "authz-server", to: "client", type: "authorization_response", fields: { code: "SplxlOBeZQQYbYS6WxSbIA" } },
    { from: "client", to: "authz-server", type: "token_request", fields: { grant_type: "authorization_code", code: "SplxlOBeZQQYbYS6WxSbIA" } },
    { from: "authz-server", to: "client", type: "token_response", fields: { token_type: "Bearer", access_token: "2YotnFZFEjr1zCsicMWpAA", id_token: "<jwt>", expires_in: "3600" } },
    { from: "client", to: "resource-server", type: "resource_request", fields: { authorization: "Bearer 2YotnFZFEjr1zCsicMWpAA" } },
    { from: "resource-server", to: "client", type: "resource_response", fields: { status: "200" } },
  ];
}

export interface OAuthError {
  name: OAuthErrorName;
  /** The OAuth `error` parameter value (RFC 6749 §5.2) — the literal string. */
  error: string;
  detail: string;
}

export interface OAuthRun {
  probe: TraceProbe;
  error: OAuthError | null;
}

/** Faults the deliberate-break round can inject per card index. */
export interface OAuthCardFault {
  /** the authorization_response carried no code (just state) → invalid_request. */
  missing_code?: boolean;
  /** the token_request presented something other than a valid code → invalid_grant. */
  bad_grant?: boolean;
  /** the resource_request carried no/invalid bearer token → unauthorized (401). */
  no_token?: boolean;
}

/** The dance state — the progression the state machine walks. */
type OAuthState =
  | "START"
  | "AWAIT_CODE"
  | "HAVE_CODE"
  | "AWAIT_TOKEN"
  | "HAVE_TOKEN"
  | "AWAIT_RESOURCE"
  | "DONE";

/**
 * Run the OAuth/OIDC state machine over the learner's assembled order. Returns a TraceProbe plus
 * the real error any illegal move raised. The classic break — calling the resource server before
 * exchanging the code for a token — yields the real `invalid_request` (the valet key was never
 * obtained), exactly as a conformant authorization server responds.
 */
export function runDance(ordered: OAuthMessage[], faults: Record<number, OAuthCardFault> = {}): OAuthRun {
  const canon = canonicalDance();
  const canonical: TraceProbe["canonical"] = {
    "oauth-authz-code": canon.map((m) => ({ from: m.from, to: m.to, type: m.type })),
  };

  let state: OAuthState = "START";
  let error: OAuthError | null = null;
  const raise = (name: OAuthErrorName, detail: string): OAuthError => ({ name, error: OAUTH_ERRORS[name], detail });

  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i];
    const fault = faults[i] ?? {};

    // Card-level faults (tampered card rejected on processing).
    if (m.type === "authorization_response" && fault.missing_code) {
      error = raise("invalid_request", "the authorization response carried no `code` parameter; the one-time code is required to continue (RFC 6749 §4.1.2)");
      break;
    }
    if (m.type === "token_request" && fault.bad_grant) {
      error = raise("invalid_grant", "the token endpoint was given an invalid/expired authorization code (RFC 6749 §5.2)");
      break;
    }
    if (m.type === "resource_request" && fault.no_token) {
      error = raise("unauthorized", "the resource request carried no valid Bearer access token (RFC 6750 §3.1 → 401)");
      break;
    }

    const next = stepState(state, m);
    if (next === null) {
      // The signature break: a resource call before the token exchange is invalid_request —
      // the valet key was never obtained.
      if (m.type === "resource_request" && (state === "START" || state === "AWAIT_CODE" || state === "HAVE_CODE" || state === "AWAIT_TOKEN")) {
        error = raise("invalid_request", "the client called the resource server before exchanging the authorization code for an access token — no valet key was ever issued");
      } else {
        error = raise("invalid_request", `${m.type} is not the protocol's next act in state ${state}; the dance expects ${expectedAt(state)} here`);
      }
      break;
    }
    state = next;
  }

  const reachedEndState = error === null && state === "DONE";
  const lastAlert: TraceProbe["lastAlert"] = error
    ? { name: error.error, code: error.name === "unauthorized" ? 401 : undefined }
    : null;

  return {
    probe: {
      orderedMessages: ordered.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields })),
      reachedEndState,
      lastAlert,
      canonical,
    },
    error,
  };
}

function stepState(state: OAuthState, m: OAuthMessage): OAuthState | null {
  switch (state) {
    case "START":
      return m.type === "authorization_request" && m.from === "client" && m.to === "authz-server" ? "AWAIT_CODE" : null;
    case "AWAIT_CODE":
      return m.type === "authorization_response" && m.from === "authz-server" ? "HAVE_CODE" : null;
    case "HAVE_CODE":
      return m.type === "token_request" && m.from === "client" && m.to === "authz-server" ? "AWAIT_TOKEN" : null;
    case "AWAIT_TOKEN":
      return m.type === "token_response" && m.from === "authz-server" ? "HAVE_TOKEN" : null;
    case "HAVE_TOKEN":
      return m.type === "resource_request" && m.from === "client" && m.to === "resource-server" ? "AWAIT_RESOURCE" : null;
    case "AWAIT_RESOURCE":
      return m.type === "resource_response" && m.from === "resource-server" ? "DONE" : null;
    case "DONE":
      return null;
    default:
      return null;
  }
}

function expectedAt(state: OAuthState): string {
  const map: Record<OAuthState, string> = {
    START: "the authorization request (client → authz server)",
    AWAIT_CODE: "the authorization response carrying the code",
    HAVE_CODE: "the token request exchanging the code",
    AWAIT_TOKEN: "the token response carrying the access token",
    HAVE_TOKEN: "the resource request bearing the access token",
    AWAIT_RESOURCE: "the resource response",
    DONE: "nothing — the dance is complete",
  };
  return map[state];
}
