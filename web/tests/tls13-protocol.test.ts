/**
 * tls13-sim behavior suite (Wave-4 honesty doctrine — applied-crypto/PKI module).
 *
 * The RFC 8446 handshake state machine IS the consequence engine. This suite asserts:
 *   - the canonical full-handshake order (RFC 8446 §4.1.1) reaches the established end state;
 *   - out-of-order / illegal messages raise the REAL AlertDescription codes (RFC 8446 §6.2 +
 *     the IANA TLS Alert Registry): unexpected_message(10), protocol_version(70),
 *     certificate_expired(45), bad_certificate(42), handshake_failure(40) — asserted by name
 *     AND numeric code; and
 *   - the committed fixture's break_cards declare exactly the codes the sim raises.
 *
 * No authored answer key: the alert a wrong move raises is the state machine's output; the
 * numeric codes are the literal RFC 8446 §6.2 values committed in the fixture.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  canonicalHandshake,
  runHandshake,
  TLS_ALERTS,
  type TlsMessage,
} from "../src/engines/visual/tls13-sim";

const ASSETS = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures/assets/net");
const fixture = JSON.parse(readFileSync(join(ASSETS, "tls13-handshake.json"), "utf8"));

describe("tls13-sim — RFC 8446 full handshake reaches the established state", () => {
  test("the canonical order completes (both Finished verified)", () => {
    const { probe, alert } = runHandshake(canonicalHandshake());
    expect(probe.reachedEndState).toBe(true);
    expect(alert).toBeNull();
    expect(probe.lastAlert).toBeNull();
    // canonical_ref + the 7-message flow match the fixture's committed cards
    expect(Object.keys(probe.canonical)[0]).toBe(fixture.handshake.canonical_ref);
    expect(probe.canonical[fixture.handshake.canonical_ref].length).toBe(fixture.handshake.cards.length);
    expect(probe.canonical[fixture.handshake.canonical_ref].map((m) => m.type)).toEqual(
      fixture.handshake.cards.map((c: { type: string }) => c.type),
    );
  });

  test("application data AFTER the handshake is legal (established → established)", () => {
    const ordered: TlsMessage[] = [...canonicalHandshake(), { from: "client", to: "server", type: "ApplicationData" }];
    const { probe } = runHandshake(ordered);
    expect(probe.reachedEndState).toBe(true);
    expect(probe.lastAlert).toBeNull();
  });

  test("the alert registry holds the literal RFC 8446 §6.2 codes", () => {
    expect(TLS_ALERTS.unexpected_message).toBe(10);
    expect(TLS_ALERTS.handshake_failure).toBe(40);
    expect(TLS_ALERTS.bad_certificate).toBe(42);
    expect(TLS_ALERTS.certificate_expired).toBe(45);
    expect(TLS_ALERTS.illegal_parameter).toBe(47);
    expect(TLS_ALERTS.protocol_version).toBe(70);
  });
});

describe("tls13-sim — out-of-order / illegal moves raise the REAL alert codes", () => {
  test("ApplicationData before {Finished} → unexpected_message(10)", () => {
    // the classic build-and-break: app data injected right after ServerHello
    const ordered: TlsMessage[] = [
      { from: "client", to: "server", type: "ClientHello" },
      { from: "server", to: "client", type: "ServerHello" },
      { from: "client", to: "server", type: "ApplicationData" }, // illegal — handshake not done
    ];
    const { probe, alert } = runHandshake(ordered);
    expect(probe.reachedEndState).toBe(false);
    expect(alert!.name).toBe("unexpected_message");
    expect(alert!.code).toBe(10);
    expect(probe.lastAlert).toEqual({ name: "unexpected_message", code: 10 });
    expect(fixture.handshake.break_cards.early_app_data.expect_code).toBe(10);
  });

  test("Certificate before ServerHello (wrong order) → unexpected_message(10)", () => {
    const ordered: TlsMessage[] = [
      { from: "client", to: "server", type: "ClientHello" },
      { from: "server", to: "client", type: "Certificate" }, // EE/ServerHello skipped
    ];
    const { alert } = runHandshake(ordered);
    expect(alert!.name).toBe("unexpected_message");
    expect(alert!.code).toBe(10);
  });

  test("a legacy-only ClientHello → protocol_version(70)", () => {
    const ordered = canonicalHandshake();
    const { alert } = runHandshake(ordered, { 0: { legacy_version_only: true } });
    expect(alert!.name).toBe("protocol_version");
    expect(alert!.code).toBe(70);
    expect(fixture.handshake.break_cards.legacy_clienthello.expect_code).toBe(70);
  });

  test("an expired Certificate → certificate_expired(45)", () => {
    const ordered = canonicalHandshake();
    // the Certificate is card index 3 in the canonical order
    const { alert } = runHandshake(ordered, { 3: { cert_expired: true } });
    expect(alert!.name).toBe("certificate_expired");
    expect(alert!.code).toBe(45);
    expect(fixture.handshake.break_cards.expired_cert.expect_code).toBe(45);
  });

  test("a corrupt Certificate → bad_certificate(42)", () => {
    const { alert } = runHandshake(canonicalHandshake(), { 3: { cert_bad: true } });
    expect(alert!.name).toBe("bad_certificate");
    expect(alert!.code).toBe(42);
  });

  test("no shared parameters in the ClientHello → handshake_failure(40)", () => {
    const { alert } = runHandshake(canonicalHandshake(), { 0: { no_shared_params: true } });
    expect(alert!.name).toBe("handshake_failure");
    expect(alert!.code).toBe(40);
  });

  test("a server's Finished swapped for the client's (wrong routing) → unexpected_message(10)", () => {
    // the server's Finished (card 5) routed from the client breaks the state machine
    const ordered: TlsMessage[] = [
      { from: "client", to: "server", type: "ClientHello" },
      { from: "server", to: "client", type: "ServerHello" },
      { from: "server", to: "client", type: "EncryptedExtensions" },
      { from: "server", to: "client", type: "Certificate" },
      { from: "server", to: "client", type: "CertificateVerify" },
      { from: "client", to: "server", type: "Finished" }, // client Finished where server's is due
    ];
    const { alert } = runHandshake(ordered);
    expect(alert!.name).toBe("unexpected_message");
    expect(alert!.code).toBe(10);
  });

  test("an empty handshake never reaches the end state and raises no alert", () => {
    const { probe, alert } = runHandshake([]);
    expect(probe.reachedEndState).toBe(false);
    expect(alert).toBeNull();
  });
});
