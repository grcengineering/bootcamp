/**
 * Simulated webhook delivery (web ISA ISC-79; module 06 §4.6).
 *
 * The module teaches webhooks as an EXPLAIN-ONLY concept ("you won't build a webhook
 * receiver in this module — it needs an internet-reachable endpoint"), so the exercise
 * surface renders a simulated event delivery in-app: the §4.6 example is the vendor
 * POSTing the moment a user loses MFA. This helper produces that delivery record —
 * a pure data object the UI renders. Nothing is ever sent anywhere.
 *
 * Honesty class: authored-fixture. The event body is original, derived from the
 * committed lab fixture's canon user u_002 (bob — the first active no-MFA offender).
 */
import type { WebhookDelivery } from "./types";

export interface WebhookEventOptions {
  /** The learner-registered receiver URL (fictional; rendered, never fetched). */
  url: string;
  /** Sim clock in ms (drives occurred_at/deliveredAt and the delivery id). */
  nowMs: number;
}

/** UTF-8 byte length, mirroring router.ts (Content-Length counts bytes). */
function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : (i++, 4);
  }
  return n;
}

/**
 * The §4.6 taught moment: "instead of polling 'who lost MFA?' every hour, you receive
 * a POST the moment anyone does." Canon subject: u_002 bob (mfa_enabled: false, active).
 */
export function simulateMfaDisabledDelivery(opts: WebhookEventOptions): WebhookDelivery {
  const occurredAt = new Date(opts.nowMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const body =
    JSON.stringify(
      {
        event: "user.mfa_disabled",
        occurred_at: occurredAt,
        data: {
          id: "u_002",
          email: "bob@acme.example",
          mfa_enabled: false,
          status: "active",
        },
      },
      null,
      2,
    ) + "\n";
  return {
    event: "user.mfa_disabled",
    method: "POST",
    url: opts.url,
    headers: [
      ["Content-Type", "application/json"],
      ["Content-Length", String(byteLength(body))],
      ["X-Acme-Event", "user.mfa_disabled"],
      ["X-Acme-Delivery", `whd_${opts.nowMs.toString(16)}`],
    ],
    body,
    deliveredAt: occurredAt,
  };
}
