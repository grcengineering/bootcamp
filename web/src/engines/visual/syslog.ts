/**
 * syslog-5424 (engine id: `syslog`) — the logging/telemetry/observability module's oracle.
 *
 * Pure, DOM-free TypeScript: tokenizes a REAL RFC 5424 syslog line into a nested parse tree
 * (the SAME ParseTreeProbe shape the packet-dissector produces, so the PEEL surface and the
 * closed verifier registry treat a log line exactly like a frame — "the OSI move applied to a
 * log"). It implements the RFC 5424 §6 ABNF the module teaches:
 *   SYSLOG-MSG = HEADER SP STRUCTURED-DATA [SP MSG]
 *   HEADER = PRI VERSION SP TIMESTAMP SP HOSTNAME SP APP-NAME SP PROCID SP MSGID
 *   PRI = "<" PRIVAL ">"          ; PRIVAL = Facility*8 + Severity   (§6.2.1)
 *   STRUCTURED-DATA = NILVALUE / 1*SD-ELEMENT                        (§6.3)
 * with NILVALUE ("-") read as a real "absent", and the leading UTF-8 BOM (EF BB BF) on MSG
 * stripped and reported (§6.4).
 *
 * The parse tree IS the oracle: every region boundary, every decoded field value, and the
 * PRI bit-unpack the PEEL surface shows is COMPUTED from the real line's characters, never
 * authored. The Facility/Severity words come from RFC 5424 Table 1 / Table 2 (the cited code
 * registries) — closed lookups over the computed numbers, not an answer key for any line.
 *
 * Honesty doctrine: the lines under test are the RFC 5424 §6.5 examples committed verbatim
 * (match: authored-with-citation — a syslog line is RFC text, not capturable wire bytes), and
 * the fidelity suite (web/tests/syslog-fidelity.test.ts) asserts the tokenizer's output equals
 * the RFC's own worked decode (PRIVAL 34 -> Facility 4 auth, Severity 2 Critical; PRIVAL 165
 * -> Facility 20, Severity 5 Notice) — so the parser cannot drift from the spec without CI
 * failing. Field meanings cite RFC 5424 §6.2.x / §6.3 / §6.4 / §6.5 and Table 1/Table 2.
 */

// Re-export the shared parse-tree shape so this oracle plugs into the same PEEL surface +
// verifier registry the packet-dissector does (a log line is just another layered artifact).
import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";
export type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

// ----------------------------------------------------------------------------
// RFC 5424 code registries (Table 1 = Facility, Table 2 = Severity). Closed, cited.
// ----------------------------------------------------------------------------

/** RFC 5424 §6.2.1 Table 1 — Facility codes (numerical code -> keyword). */
export const SYSLOG_FACILITIES: Record<number, string> = {
  0: "kernel messages",
  1: "user-level messages",
  2: "mail system",
  3: "system daemons",
  4: "security/authorization messages",
  5: "messages generated internally by syslogd",
  6: "line printer subsystem",
  7: "network news subsystem",
  8: "UUCP subsystem",
  9: "clock daemon",
  10: "security/authorization messages",
  11: "FTP daemon",
  12: "NTP subsystem",
  13: "log audit",
  14: "log alert",
  15: "clock daemon (note 2)",
  16: "local use 0 (local0)",
  17: "local use 1 (local1)",
  18: "local use 2 (local2)",
  19: "local use 3 (local3)",
  20: "local use 4 (local4)",
  21: "local use 5 (local5)",
  22: "local use 6 (local6)",
  23: "local use 7 (local7)",
};

/** RFC 5424 §6.2.1 Table 2 — Severity codes (numerical code -> keyword). */
export const SYSLOG_SEVERITIES: Record<number, string> = {
  0: "Emergency",
  1: "Alert",
  2: "Critical",
  3: "Error",
  4: "Warning",
  5: "Notice",
  6: "Informational",
  7: "Debug",
};

/** RFC 5424 NILVALUE — a single "-" means the field is genuinely ABSENT (§6.2.x). */
export const NILVALUE = "-";

// ----------------------------------------------------------------------------
// PRI bit-unpack (§6.2.1): PRIVAL = Facility * 8 + Severity. The oracle's arithmetic.
// ----------------------------------------------------------------------------

export interface PriDecode {
  prival: number;
  facility: number;
  facilityName: string;
  severity: number;
  severityName: string;
}

/**
 * Decode an RFC 5424 PRIVAL into its Facility (high bits, value/8) and Severity (low 3 bits,
 * value%8). Pure arithmetic + the cited Table 1/2 lookups — this IS the §6.2.1 definition.
 * Throws on a PRIVAL outside the RFC's 0..191 range (Facility 0..23, Severity 0..7).
 */
export function decodePri(prival: number): PriDecode {
  if (!Number.isInteger(prival) || prival < 0 || prival > 191)
    throw new Error(`PRIVAL out of RFC 5424 range (0..191): ${prival}`);
  const facility = Math.floor(prival / 8);
  const severity = prival % 8;
  return {
    prival,
    facility,
    facilityName: SYSLOG_FACILITIES[facility] ?? "unknown",
    severity,
    severityName: SYSLOG_SEVERITIES[severity] ?? "unknown",
  };
}

// ----------------------------------------------------------------------------
// HEADER tokenizer (§6.2): PRI VERSION SP TIMESTAMP SP HOSTNAME SP APP-NAME SP PROCID SP MSGID
// ----------------------------------------------------------------------------

/** The six space-delimited HEADER tokens (after PRI+VERSION), in RFC order. */
interface HeaderTokens {
  /** Byte offset where PRI starts (always 0). */
  priStart: number;
  /** "<NN>" inclusive end (offset just past ">"). */
  priEnd: number;
  prival: number;
  version: string;
  versionStart: number;
  versionEnd: number;
  /** Each remaining SP-delimited token with its [start,end) byte span. */
  tokens: Array<{ value: string; start: number; end: number }>;
}

/**
 * Tokenize the HEADER: read the PRI ("<PRIVAL>"), the VERSION digit(s), then split the rest of
 * the HEADER on single spaces into TIMESTAMP, HOSTNAME, APP-NAME, PROCID, MSGID. Total over a
 * well-formed §6.5 line; throws with a precise message on a malformed PRI/VERSION (the parser
 * is the oracle — it refuses to invent structure it cannot read).
 */
function tokenizeHeader(line: string): HeaderTokens {
  if (line[0] !== "<") throw new Error("RFC 5424 line must begin with PRI '<'");
  const gt = line.indexOf(">");
  if (gt < 2) throw new Error("malformed PRI: missing '>' or empty PRIVAL");
  const privalStr = line.slice(1, gt);
  if (!/^\d{1,3}$/.test(privalStr)) throw new Error(`malformed PRIVAL: ${JSON.stringify(privalStr)}`);
  const prival = Number(privalStr);
  // VERSION immediately follows ">" (no space) — RFC 5424 §6.2.2 (a nonzero digit run).
  let v = gt + 1;
  while (v < line.length && /\d/.test(line[v])) v++;
  const version = line.slice(gt + 1, v);
  if (version.length === 0) throw new Error("malformed HEADER: missing VERSION after PRI");
  // After VERSION there must be a single SP, then the five remaining SP-delimited tokens.
  if (line[v] !== " ") throw new Error("malformed HEADER: VERSION must be followed by a space");
  // Walk the rest of the line by spaces, recording byte spans. The HEADER consumes exactly
  // five more tokens (TIMESTAMP HOSTNAME APP-NAME PROCID MSGID); STRUCTURED-DATA/MSG follow.
  const tokens: Array<{ value: string; start: number; end: number }> = [];
  let i = v + 1;
  for (let n = 0; n < 5; n++) {
    const sp = line.indexOf(" ", i);
    const end = sp === -1 ? line.length : sp;
    tokens.push({ value: line.slice(i, end), start: i, end });
    if (sp === -1 && n < 4) throw new Error(`malformed HEADER: only ${n + 1} of 5 trailing tokens`);
    i = end + 1;
  }
  return { priStart: 0, priEnd: gt + 1, prival, version, versionStart: gt + 1, versionEnd: v, tokens };
}

// ----------------------------------------------------------------------------
// STRUCTURED-DATA walker (§6.3): NILVALUE / 1*SD-ELEMENT
//   SD-ELEMENT = "[" SD-ID *(SP SD-PARAM) "]"
//   SD-PARAM   = PARAM-NAME "=" %d34 PARAM-VALUE %d34
// ----------------------------------------------------------------------------

export interface SdParam {
  name: string;
  value: string;
}
export interface SdElement {
  /** SD-ID, e.g. "exampleSDID@32473" (§6.3.2). */
  sdId: string;
  params: SdParam[];
  /** [start,end) byte span of the whole "[ ... ]" element. */
  start: number;
  end: number;
}

/**
 * Walk STRUCTURED-DATA starting at byte `start`. Returns the parsed SD-ELEMENTs and the byte
 * offset just past the last "]" (where SP MSG begins). If the field is NILVALUE ("-"), returns
 * `nil:true` and the offset just past the "-". A malformed leading token (neither "-" nor "[")
 * or an unbalanced element stops the walk and is reported `malformed:true` with `end` advanced
 * to the next SP (or end-of-line), so the caller can size the STRUCTURED-DATA region honestly
 * and keep MSG aligned — the parser degrades, it never hides or mis-aligns bytes.
 */
function walkStructuredData(
  line: string,
  start: number,
): { elements: SdElement[]; end: number; nil: boolean; malformed: boolean } {
  if (line[start] === NILVALUE && (start + 1 >= line.length || line[start + 1] === " "))
    return { elements: [], end: start + 1, nil: true, malformed: false };
  // A well-formed STRUCTURED-DATA field is 1*SD-ELEMENT, each starting with "[". Anything else
  // is malformed: span it to the next SP and report it so the region boundary stays truthful.
  if (line[start] !== "[") {
    let e = start;
    while (e < line.length && line[e] !== " ") e++;
    return { elements: [], end: e, nil: false, malformed: true };
  }
  const elements: SdElement[] = [];
  let i = start;
  while (line[i] === "[") {
    const elemStart = i;
    i++; // past "["
    // SD-ID runs to the first SP or "]".
    let idEnd = i;
    while (idEnd < line.length && line[idEnd] !== " " && line[idEnd] !== "]") idEnd++;
    const sdId = line.slice(i, idEnd);
    i = idEnd;
    const params: SdParam[] = [];
    // *(SP SD-PARAM)
    while (line[i] === " ") {
      i++; // past SP
      const nameEnd = nextOf(line, i, ["=", " ", "]"]);
      // PARAM-NAME "=" DQUOTE PARAM-VALUE DQUOTE — bail (element malformed) if the shape breaks.
      if (line[nameEnd] !== "=" || line[nameEnd + 1] !== '"') break;
      const name = line.slice(i, nameEnd);
      // find the closing quote, honoring the RFC 5424 §6.3.3 escape ("\\", '\"', "\]").
      let j = nameEnd + 2;
      let raw = "";
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\" && j + 1 < line.length) {
          raw += line[j + 1];
          j += 2;
        } else {
          raw += line[j];
          j++;
        }
      }
      params.push({ name, value: raw });
      i = j + 1; // past closing DQUOTE
    }
    if (line[i] !== "]") {
      // unbalanced element — stop honestly; span the malformed remainder to the next SP.
      let e = i;
      while (e < line.length && line[e] !== " ") e++;
      return { elements, end: e, nil: false, malformed: true };
    }
    i++; // past "]"
    elements.push({ sdId, params, start: elemStart, end: i });
  }
  return { elements, end: i, nil: false, malformed: false };
}

/** Index of the first of `chars` at or after `from`, or end-of-line if none occur. */
function nextOf(line: string, from: number, chars: string[]): number {
  let i = from;
  while (i < line.length && !chars.includes(line[i])) i++;
  return i;
}

// ----------------------------------------------------------------------------
// the parser → ParseTreeProbe
// ----------------------------------------------------------------------------

/** UTF-8 BOM (RFC 5424 §6.4 — MSG that is UTF-8 begins with the BOM EF BB BF = "﻿"). */
const BOM = "﻿";

/**
 * Parse one real RFC 5424 line into a ParseTreeProbe. Region byte offsets are CHARACTER offsets
 * into the line (a §6.5 line is US-ASCII in the HEADER; MSG may carry a BOM + UTF-8). Throws
 * only on a structurally-impossible HEADER (the one hard error — there is no line to parse);
 * a malformed SD field degrades to a raw STRUCTURED-DATA region rather than throwing, mirroring
 * the dissector's "a forensic tool never hides bytes" contract.
 */
export function parseSyslog(line: string): ParseTreeProbe {
  if (line.length === 0) throw new Error("empty syslog line");
  const h = tokenizeHeader(line);
  const pri = decodePri(h.prival);

  const root: ParseRegion = {
    id: "msg",
    start: 0,
    end: line.length,
    label: "SYSLOG-MSG",
    layer: "message",
    value: `${line.length} chars`,
    rfc: "RFC 5424 §6",
    children: [],
  };

  // ---- HEADER ---------------------------------------------------------------
  const header: ParseRegion = {
    id: "header",
    start: 0,
    end: h.tokens[4].end,
    label: "HEADER",
    layer: "header",
    value: `PRI ${pri.prival} (${pri.facilityName} / ${pri.severityName}), v${h.version}`,
    rfc: "RFC 5424 §6.2",
    children: [],
  };

  // PRI region, with the bit-unpack exposed as children (Facility high bits, Severity low 3).
  const pre: ParseRegion = {
    id: "pri",
    start: h.priStart,
    end: h.priEnd,
    label: "PRI",
    layer: "header",
    value: `<${pri.prival}> = Facility ${pri.facility} (${pri.facilityName}), Severity ${pri.severity} (${pri.severityName})`,
    rfc: "RFC 5424 §6.2.1",
    children: [
      {
        id: "pri.facility",
        start: h.priStart,
        end: h.priEnd,
        label: "Facility",
        layer: "header",
        value: `${pri.facility} = ${pri.facilityName} (PRIVAL ${pri.prival} >> 3)`,
        rfc: "RFC 5424 Table 1",
        children: [],
      },
      {
        id: "pri.severity",
        start: h.priStart,
        end: h.priEnd,
        label: "Severity",
        layer: "header",
        value: `${pri.severity} = ${pri.severityName} (PRIVAL ${pri.prival} & 7)`,
        rfc: "RFC 5424 Table 2",
        children: [],
      },
    ],
  };
  header.children.push(pre);
  header.children.push({
    id: "version",
    start: h.versionStart,
    end: h.versionEnd,
    label: "VERSION",
    layer: "header",
    value: h.version,
    rfc: "RFC 5424 §6.2.2",
    children: [],
  });

  const headerFields: Array<[string, string, string]> = [
    ["timestamp", "TIMESTAMP", "RFC 5424 §6.2.3"],
    ["hostname", "HOSTNAME", "RFC 5424 §6.2.4"],
    ["app_name", "APP-NAME", "RFC 5424 §6.2.5"],
    ["procid", "PROCID", "RFC 5424 §6.2.6"],
    ["msgid", "MSGID", "RFC 5424 §6.2.7"],
  ];
  h.tokens.forEach((tok, idx) => {
    const [id, label, rfc] = headerFields[idx];
    const isNil = tok.value === NILVALUE;
    header.children.push({
      id,
      start: tok.start,
      end: tok.end,
      label,
      layer: "header",
      value: isNil ? "- (NILVALUE — absent)" : tok.value,
      rfc,
      children: [],
    });
  });
  root.children.push(header);

  // ---- STRUCTURED-DATA ------------------------------------------------------
  const sdStart = h.tokens[4].end + 1; // single SP after MSGID
  const sd = walkStructuredData(line, sdStart);
  const sdEndExclusive = sd.nil ? sdStart + 1 : sd.end;
  const sdRegion: ParseRegion = {
    id: "structured_data",
    start: sdStart,
    end: sdEndExclusive,
    label: "STRUCTURED-DATA",
    layer: "structured-data",
    value: sd.nil
      ? "- (NILVALUE — no structured data)"
      : sd.malformed
        ? `malformed SD field: ${JSON.stringify(line.slice(sdStart, sdEndExclusive))}`
        : `${sd.elements.length} SD-ELEMENT${sd.elements.length === 1 ? "" : "s"}`,
    rfc: "RFC 5424 §6.3",
    children: [],
  };
  sd.elements.forEach((el, ei) => {
    const elem: ParseRegion = {
      id: `sd${ei}`,
      start: el.start,
      end: el.end,
      label: "SD-ELEMENT",
      layer: "structured-data",
      value: `${el.sdId} (${el.params.length} param${el.params.length === 1 ? "" : "s"})`,
      rfc: "RFC 5424 §6.3.1",
      children: [
        {
          id: `sd${ei}.id`,
          start: el.start + 1,
          end: el.start + 1 + el.sdId.length,
          label: "SD-ID",
          layer: "structured-data",
          value: el.sdId,
          rfc: "RFC 5424 §6.3.2",
          children: [],
        },
        ...el.params.map((pm, pi) => ({
          id: `sd${ei}.param${pi}`,
          start: el.start,
          end: el.end,
          label: `SD-PARAM ${pm.name}`,
          layer: "structured-data",
          value: `${pm.name}="${pm.value}"`,
          rfc: "RFC 5424 §6.3.3",
          children: [],
        })),
      ],
    };
    sdRegion.children.push(elem);
  });
  root.children.push(sdRegion);

  // ---- MSG (optional; §6.4) -------------------------------------------------
  // MSG is present iff a single SP follows STRUCTURED-DATA and at least one char follows it.
  if (line[sdEndExclusive] === " " && sdEndExclusive + 1 < line.length) {
    const msgStart = sdEndExclusive + 1;
    const rawMsg = line.slice(msgStart);
    const hasBom = rawMsg.startsWith(BOM);
    const text = hasBom ? rawMsg.slice(BOM.length) : rawMsg;
    root.children.push({
      id: "structured_data_msg",
      start: msgStart,
      end: line.length,
      label: "MSG",
      layer: "message",
      value: hasBom ? `[BOM] ${text}` : text,
      rfc: "RFC 5424 §6.4",
      children: [],
    });
  }

  return buildProbe(root, line.length);
}

// ----------------------------------------------------------------------------
// probe assembly (same contract as pkt.buildProbe — range/id/decode lookups)
// ----------------------------------------------------------------------------

function flatten(region: ParseRegion, out: ParseRegion[]): void {
  out.push(region);
  for (const c of region.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  // Range lookups index the FIRST region with a given [start,end) (PRI's facility/severity
  // children share PRI's span, so the parent PRI wins range lookups; the children are reached
  // by id — exactly the read path the verifiers use for the bit-unpack legs).
  const byRange = new Map<string, ParseRegion>();
  for (const r of regions) {
    const k = `${r.start}:${r.end}`;
    if (!byRange.has(k)) byRange.set(k, r);
  }
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
