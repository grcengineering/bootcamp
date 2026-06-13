/**
 * tls13-sim (engine id: `tls13`) — the applied-crypto/PKI module's TLS 1.3 handshake state
 * machine (TRACE / build-and-break consequence engine).
 *
 * Pure, DOM-free TypeScript: runs the RFC 8446 §4.1 / §A.1 handshake state machine. It accepts
 * the learner's ORDERED handshake-message cards and either reaches the established state
 * (client+server Finished verified) or rejects an illegal move with the REAL AlertDescription
 * code from RFC 8446 §6.2:
 *   unexpected_message(10) — a record/handshake message out of the order the state machine
 *                            permits (e.g. application_data before Finished).
 *   bad_record_mac(20)     — (declared; not exercised by the ordering puzzle).
 *   handshake_failure(40)  — no acceptable handshake parameters (e.g. no shared cipher).
 *   bad_certificate(42)    — the certificate was corrupt/unacceptable.
 *   certificate_expired(45)— the certificate in CERTIFICATE has expired.
 *   internal_error(80)/illegal_parameter(47) — (declared).
 *   protocol_version(70)   — the offered ClientHello version is unsupported (e.g. TLS 1.0 only).
 *
 * The state machine IS the oracle: the accepted order and the alert a wrong move raises are the
 * protocol's behaviour, not an authored answer key. Ground truth: RFC 8446 §4.1.1 (message
 * flow), §A.1 (state machine), §6.2 + the IANA TLS Alert Registry (the numeric codes). The
 * canonical full-handshake order is reproducible against a real `openssl s_client -tls1_3`
 * exchange; the codes are the literal RFC values.
 *
 * Output is a TraceProbe (web/src/verifiers/registry.ts) so sequence_matches / sim_alert_is read
 * it through the SAME closed registry the packet TRACE uses.
 */

import type { TraceProbe } from "../../verifiers/registry";

/** TLS 1.3 handshake participants. */
export type TlsParticipant = "client" | "server";

/**
 * RFC 8446 handshake message types the module sequences (the §4 names + the record-layer
 * application_data the build-and-break round injects too early). HelloRetryRequest is the
 * special ServerHello of §4.1.4; we keep the core full-handshake set.
 */
export type TlsMessageType =
  | "ClientHello"
  | "ServerHello"
  | "EncryptedExtensions"
  | "Certificate"
  | "CertificateVerify"
  | "Finished" // both peers send one; routing (from) disambiguates
  | "ApplicationData";

/** One handshake-message card the learner assembles. */
export interface TlsMessage {
  from: TlsParticipant;
  to: TlsParticipant;
  type: TlsMessageType;
  fields?: Record<string, string>;
}

/** RFC 8446 §6.2 AlertDescription — the real codes the sim raises. */
export const TLS_ALERTS = {
  unexpected_message: 10,
  bad_record_mac: 20,
  handshake_failure: 40,
  bad_certificate: 42,
  certificate_expired: 45,
  certificate_unknown: 46,
  illegal_parameter: 47,
  decode_error: 50,
  protocol_version: 70,
  internal_error: 80,
} as const;

export type TlsAlertName = keyof typeof TLS_ALERTS;

/**
 * The canonical RFC 8446 §4.1.1 full-handshake order (one round trip + the client's flight):
 *   client→server ClientHello
 *   server→client ServerHello
 *   server→client EncryptedExtensions
 *   server→client Certificate
 *   server→client CertificateVerify
 *   server→client Finished
 *   client→server Finished
 * After both Finished, the connection is established and ApplicationData may flow.
 */
export function canonicalHandshake(): TlsMessage[] {
  return [
    { from: "client", to: "server", type: "ClientHello", fields: { versions: "TLS 1.3" } },
    { from: "server", to: "client", type: "ServerHello" },
    { from: "server", to: "client", type: "EncryptedExtensions" },
    { from: "server", to: "client", type: "Certificate" },
    { from: "server", to: "client", type: "CertificateVerify", fields: { proves: "server holds the private key for the cert's public key" } },
    { from: "server", to: "client", type: "Finished" },
    { from: "client", to: "server", type: "Finished" },
  ];
}

/** Per-card validity hints the build-and-break round attaches to a tampered ClientHello/Certificate. */
export interface TlsCardFault {
  /** the ClientHello offered only legacy versions → protocol_version(70). */
  legacy_version_only?: boolean;
  /** the Certificate was expired → certificate_expired(45). */
  cert_expired?: boolean;
  /** the Certificate was unacceptable/corrupt → bad_certificate(42). */
  cert_bad?: boolean;
  /** no shared cipher/params could be negotiated → handshake_failure(40). */
  no_shared_params?: boolean;
}

export interface TlsAlert {
  name: TlsAlertName;
  code: number;
  detail: string;
}

export interface TlsRun {
  probe: TraceProbe;
  alert: TlsAlert | null;
}

/** The handshake state — the §A.1 progression the state machine walks. */
type TlsState =
  | "START"
  | "WAIT_SH"
  | "WAIT_EE"
  | "WAIT_CERT"
  | "WAIT_CV"
  | "WAIT_SERVER_FINISHED"
  | "WAIT_CLIENT_FINISHED"
  | "ESTABLISHED";

/**
 * Run the RFC 8446 handshake state machine over the learner's assembled order. Returns a
 * TraceProbe plus the real alert any illegal move raised. The faults map (keyed by card index)
 * lets the build-and-break round inject a tampered card (legacy-only ClientHello, expired cert)
 * so the sim returns the real code — no authored failure.
 */
export function runHandshake(ordered: TlsMessage[], faults: Record<number, TlsCardFault> = {}): TlsRun {
  const canon = canonicalHandshake();
  const canonical: TraceProbe["canonical"] = {
    "tls13-full-handshake": canon.map((m) => ({ from: m.from, to: m.to, type: m.type })),
  };

  let state: TlsState = "START";
  let alert: TlsAlert | null = null;

  const raise = (name: TlsAlertName, detail: string): TlsAlert => ({ name, code: TLS_ALERTS[name], detail });

  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i];
    const fault = faults[i] ?? {};

    // Card-level faults take precedence (a tampered card is rejected the moment it's processed).
    if (m.type === "ClientHello" && fault.legacy_version_only) {
      alert = raise("protocol_version", "the ClientHello offered only legacy versions (e.g. TLS 1.0); TLS 1.3 requires supported_versions to include 0x0304");
      break;
    }
    if (m.type === "ClientHello" && fault.no_shared_params) {
      alert = raise("handshake_failure", "no cipher suite / key-share the server accepts was offered");
      break;
    }
    if (m.type === "Certificate" && fault.cert_expired) {
      alert = raise("certificate_expired", "the server certificate in this Certificate message has expired (notAfter in the past)");
      break;
    }
    if (m.type === "Certificate" && fault.cert_bad) {
      alert = raise("bad_certificate", "the certificate was corrupt or otherwise unacceptable");
      break;
    }

    // Ordering: each state accepts exactly the next legal message; anything else is
    // unexpected_message(10) — including ApplicationData before both Finished are exchanged.
    const next = stepState(state, m);
    if (next === null) {
      alert = raise("unexpected_message", `${m.type} arrived in state ${state}; the handshake expects ${expectedAt(state)} here`);
      break;
    }
    state = next;
  }

  const reachedEndState = alert === null && state === "ESTABLISHED";
  const lastAlert: TraceProbe["lastAlert"] = alert ? { name: alert.name, code: alert.code } : null;

  return {
    probe: {
      orderedMessages: ordered.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields })),
      reachedEndState,
      lastAlert,
      canonical,
    },
    alert,
  };
}

/** The legal next state for a message, or null if the message is unexpected in this state. */
function stepState(state: TlsState, m: TlsMessage): TlsState | null {
  switch (state) {
    case "START":
      return m.type === "ClientHello" && m.from === "client" ? "WAIT_SH" : null;
    case "WAIT_SH":
      return m.type === "ServerHello" && m.from === "server" ? "WAIT_EE" : null;
    case "WAIT_EE":
      return m.type === "EncryptedExtensions" && m.from === "server" ? "WAIT_CERT" : null;
    case "WAIT_CERT":
      return m.type === "Certificate" && m.from === "server" ? "WAIT_CV" : null;
    case "WAIT_CV":
      return m.type === "CertificateVerify" && m.from === "server" ? "WAIT_SERVER_FINISHED" : null;
    case "WAIT_SERVER_FINISHED":
      return m.type === "Finished" && m.from === "server" ? "WAIT_CLIENT_FINISHED" : null;
    case "WAIT_CLIENT_FINISHED":
      return m.type === "Finished" && m.from === "client" ? "ESTABLISHED" : null;
    case "ESTABLISHED":
      // Only application data is legal once established.
      return m.type === "ApplicationData" ? "ESTABLISHED" : null;
    default:
      return null;
  }
}

/** Human-readable description of the message the state machine expects in a given state. */
function expectedAt(state: TlsState): string {
  const map: Record<TlsState, string> = {
    START: "ClientHello",
    WAIT_SH: "ServerHello",
    WAIT_EE: "EncryptedExtensions",
    WAIT_CERT: "Certificate",
    WAIT_CV: "CertificateVerify",
    WAIT_SERVER_FINISHED: "the server's Finished",
    WAIT_CLIENT_FINISHED: "the client's Finished",
    ESTABLISHED: "application data",
  };
  return map[state];
}
