/**
 * dns-resolve-sim (engine id: `dnsres`) — the how-the-internet-works module's DNS-delegation
 * state machine (TRACE consequence engine).
 *
 * Pure, DOM-free TypeScript: runs the REAL iterative-resolution delegation behaviour the DNS
 * "treasure hunt" teaches — a stub resolver queries a recursive resolver, which walks
 * root → TLD → authoritative, and ONLY the authoritative server answers the address. The
 * honest consequence: route the name query to the root and it returns the REAL referral to the
 * .com TLD servers (a root server REFERS, it never answers a leaf A record); route it to the
 * .com TLD and it refers to the authoritative server; only the authoritative server returns the
 * answer. A mis-routed query yields the real referral — never an authored "try again."
 *
 * The state machine is the oracle: the referral targets and the accepted hand-off order are
 * the protocol's behaviour, not an answer key. The cited ground truth (committed in
 * .ci/fixtures/assets/net/dns-delegation.json) is REAL: the IANA root-server list
 * (a.root-servers.net 198.41.0.4), the live .com TLD NS list (a.gtld-servers.net 192.5.6.30,
 * captured TTL 11246), and example.com's live authoritative NS (cloudflare). RFC 1034 §4.3.2
 * (resolution algorithm), §6 (delegation); RFC 1035 §7 (resolver behaviour).
 *
 * Output shape is a TraceProbe (web/src/verifiers/registry.ts) so sequence_matches / sim_alert_is
 * read it through the SAME closed registry the packet TRACE uses.
 */

import type { TraceProbe } from "../../verifiers/registry";

/** The four participants in the delegated resolution (RFC 1034 §4 / §6). */
export type DnsResParticipant = "stub" | "recursive" | "root" | "tld" | "authoritative";

/** One step the learner assembles: who asks whom, and the message type. */
export interface DnsResMessage {
  from: DnsResParticipant;
  to: DnsResParticipant;
  /** The protocol act: "query", "referral", or "answer". */
  type: string;
  fields?: Record<string, string>;
}

/** The committed real delegation data (cited; no value invented). */
export interface DnsDelegationData {
  qname: string;
  root: { server: string; ip: string; refers_to: string };
  tld: { zone: string; server: string; ip: string; ttl: number; refers_to: string };
  authoritative: { zone: string; servers: string[]; answer: string };
}

/**
 * The canonical resolution sequence for an iterative walk of `qname`. This is the order the
 * sim accepts as the completed treasure hunt:
 *   stub→recursive query, recursive→root query, root→recursive REFERRAL (to TLD),
 *   recursive→tld query, tld→recursive REFERRAL (to authoritative),
 *   recursive→authoritative query, authoritative→recursive ANSWER, recursive→stub answer.
 */
export function canonicalDelegation(data: DnsDelegationData): DnsResMessage[] {
  return [
    { from: "stub", to: "recursive", type: "query", fields: { name: data.qname, want: "A" } },
    { from: "recursive", to: "root", type: "query", fields: { name: data.qname } },
    { from: "root", to: "recursive", type: "referral", fields: { to_zone: data.tld.zone, ns: data.root.refers_to } },
    { from: "recursive", to: "tld", type: "query", fields: { name: data.qname } },
    { from: "tld", to: "recursive", type: "referral", fields: { to_zone: data.authoritative.zone, ns: data.tld.refers_to } },
    { from: "recursive", to: "authoritative", type: "query", fields: { name: data.qname } },
    { from: "authoritative", to: "recursive", type: "answer", fields: { name: data.qname, address: data.authoritative.answer } },
    { from: "recursive", to: "stub", type: "answer", fields: { name: data.qname, address: data.authoritative.answer } },
  ];
}

/** A real DNS "alert"/consequence the sim raises (RCODE-style or a referral, never authored). */
export interface DnsResConsequence {
  /** "referral" (a server referred instead of answering) or "out_of_order". */
  name: string;
  /** The zone the server referred the resolver to (when name === "referral"). */
  code?: number;
  detail: string;
}

/**
 * Run the delegation state machine over the learner's assembled message order. The sim is the
 * honest consequence engine: it tracks which server is being asked and returns the REAL act.
 * - Asking the root (or TLD) for the leaf address yields a REFERRAL, not an answer (the break).
 * - Only the authoritative server's answer, in the right hand-off order, reaches the end state.
 *
 * Returns a TraceProbe (the shape sequence_matches / sim_alert_is read) plus the per-step
 * consequence for the deliberate-break round.
 */
export interface DnsResRun {
  probe: TraceProbe;
  consequence: DnsResConsequence | null;
}

export function runDelegation(data: DnsDelegationData, ordered: DnsResMessage[]): DnsResRun {
  const canon = canonicalDelegation(data);
  const canonical: TraceProbe["canonical"] = {
    [data.qname]: canon.map((m) => ({ from: m.from, to: m.to, type: m.type })),
  };

  // The honest consequence: the FIRST query a learner routes to root/tld asking for the leaf
  // address gets a real referral (servers higher in the tree refer, they don't answer). The
  // authoritative server is the only one that answers. We detect the first divergence from the
  // canonical hand-off and emit the protocol's real response.
  let consequence: DnsResConsequence | null = null;
  for (let i = 0; i < ordered.length && i < canon.length; i++) {
    const got = ordered[i];
    const want = canon[i];
    if (got.from !== want.from || got.to !== want.to || got.type !== want.type) {
      // What does the protocol REALLY do for this mis-step?
      if (got.type === "query" && (got.to === "root" || got.to === "tld") && want.type !== "query") {
        // tried to query a higher server when a referral/answer was due — still a referral
        consequence = referralFor(data, got.to);
      } else if (got.type === "answer" && (got.from === "root" || got.from === "tld")) {
        // claimed the root/TLD answered the leaf — the real protocol REFERS instead
        consequence = referralFor(data, got.from);
      } else if (got.type === "query" && got.to === "authoritative" && want.to !== "authoritative") {
        // jumped straight to authoritative without earning the referral — out of order
        consequence = { name: "out_of_order", detail: "the resolver has not yet been referred to the authoritative server; the hand-off chain was skipped" };
      } else {
        consequence = { name: "out_of_order", detail: `step ${i + 1} (${got.from}→${got.to} ${got.type}) is not the protocol's next act` };
      }
      break;
    }
  }

  const reachedEndState =
    ordered.length === canon.length &&
    ordered.every((m, i) => m.from === canon[i].from && m.to === canon[i].to && m.type === canon[i].type);

  const lastAlert: TraceProbe["lastAlert"] = consequence ? { name: consequence.name, code: consequence.code } : null;

  return {
    probe: {
      orderedMessages: ordered.map((m) => ({ from: m.from, to: m.to, type: m.type, fields: m.fields })),
      reachedEndState,
      lastAlert,
      canonical,
    },
    consequence,
  };
}

function referralFor(data: DnsDelegationData, server: DnsResParticipant): DnsResConsequence {
  if (server === "root")
    return { name: "referral", detail: `${data.root.server} refers to the ${data.tld.zone} servers (${data.root.refers_to}); a root server never answers a leaf A record` };
  return { name: "referral", detail: `the ${data.tld.zone} server refers to ${data.authoritative.zone}'s authoritative NS (${data.tld.refers_to}); a TLD server delegates, it does not answer` };
}
