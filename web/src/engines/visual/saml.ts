/**
 * saml-xml (engine id: `saml`) — the identity module's SAML 2.0 assertion field reader (PEEL /
 * Diff oracle). SCOPE-BOUNDED HONESTLY: it reads the load-bearing assertion fields and catches
 * the expired-<Conditions> tamper; it does NOT validate XML-DSig (no canonicalization, no
 * signature crypto). The module says so out loud — the value is in reading the assertion's
 * claims (who, how authenticated, valid-until), not in re-implementing XML Signature.
 *
 * Pure, DOM-free TypeScript: parses a real OASIS-spec example assertion into the SAME
 * ParseTreeProbe shape the packet-dissector produces, so the PEEL surface and the closed
 * verifier registry treat it identically to `pkt`/`dns`. It surfaces:
 *   <Issuer>                              — who issued the assertion (the IdP)
 *   <Subject>/<NameID>                    — who the assertion is about
 *   <Conditions NotBefore NotOnOrAfter>   — the assertion's validity window (the staleness break)
 *   <AudienceRestriction>/<Audience>      — who the assertion is FOR (the SP entityID)
 *   <AuthnStatement AuthnInstant>         — when authentication happened
 *   <AuthnContextClassRef>                — HOW (e.g. PasswordProtectedTransport, or an MFA ref)
 *
 * The <Conditions> NotOnOrAfter is a single, highlightable region whose value the Diff round
 * tampers (a clean assertion valid-until a future instant vs a twin whose window has closed) —
 * the staleness IS the break, computed by comparing the parsed instant to a supplied "now",
 * never an authored verdict.
 *
 * Ground truth: OASIS "Assertions and Protocols for the OASIS Security Assertion Markup
 * Language (SAML) V2.0" (saml-core-2.0-os), §2.3 (Assertion), §2.5 (Conditions), §2.7
 * (Statements / AuthnStatement). The committed fixture is the spec's canonical example
 * assertion (.ci/fixtures/assets/identity/saml-assertion.xml; match: authored-with-citation).
 */

import type { ByteRange, ParseRegion, ParseTreeProbe } from "./pkt";

// ----------------------------------------------------------------------------
// the fields the module reads (closed, cited to saml-core-2.0-os)
// ----------------------------------------------------------------------------

export interface SamlAssertionFields {
  /** Assertion attributes (the @Version, @IssueInstant, @ID). */
  version: string | null;
  issueInstant: string | null;
  id: string | null;
  issuer: string | null;
  /** Subject NameID text + @Format. */
  nameId: string | null;
  nameIdFormat: string | null;
  /** <Conditions> validity window (xsd:dateTime, UTC). */
  notBefore: string | null;
  notOnOrAfter: string | null;
  /** <AudienceRestriction>/<Audience> — the SP entityID the assertion is bound to. */
  audience: string | null;
  /** <AuthnStatement @AuthnInstant>. */
  authnInstant: string | null;
  /** <AuthnContextClassRef> — the authentication method URI. */
  authnContextClassRef: string | null;
}

/** Extract the text of the first `<tag ...>text</tag>` (namespace-prefix agnostic). */
function tagText(xml: string, local: string): string | null {
  // matches <ns:Local ...>text</ns:Local> or <Local ...>text</Local>
  const re = new RegExp(`<(?:[A-Za-z0-9]+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${local}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Extract an attribute value from the first occurrence of `<tag ... attr="...">`. */
function attrOf(xml: string, local: string, attr: string): string | null {
  // find the opening tag, then read attr from it
  const tagRe = new RegExp(`<(?:[A-Za-z0-9]+:)?${local}(\\s[^>]*?)/?>`);
  const m = xml.match(tagRe);
  if (!m) return null;
  const attrRe = new RegExp(`\\b${attr}="([^"]*)"`);
  const a = m[1].match(attrRe);
  return a ? a[1] : null;
}

/** Parse the cited assertion fields out of the real XML (no DSig; field reading only). */
export function parseSamlFields(xml: string): SamlAssertionFields {
  return {
    version: attrOf(xml, "Assertion", "Version"),
    issueInstant: attrOf(xml, "Assertion", "IssueInstant"),
    id: attrOf(xml, "Assertion", "ID"),
    issuer: tagText(xml, "Issuer"),
    nameId: tagText(xml, "NameID"),
    nameIdFormat: attrOf(xml, "NameID", "Format"),
    notBefore: attrOf(xml, "Conditions", "NotBefore"),
    notOnOrAfter: attrOf(xml, "Conditions", "NotOnOrAfter"),
    audience: tagText(xml, "Audience"),
    authnInstant: attrOf(xml, "AuthnStatement", "AuthnInstant"),
    authnContextClassRef: tagText(xml, "AuthnContextClassRef"),
  };
}

/**
 * Evaluate the <Conditions> window against a "now" instant (ISO 8601). SAML §2.5.1.2:
 * NotOnOrAfter is EXCLUSIVE — the assertion is valid for now < NotOnOrAfter (and now >=
 * NotBefore when present). Returns the verdict the staleness break turns on — computed, never
 * authored.
 */
export interface ConditionsVerdict {
  valid: boolean;
  reason: string;
}

export function evaluateConditions(fields: SamlAssertionFields, nowIso: string): ConditionsVerdict {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) return { valid: false, reason: `unparseable "now": ${nowIso}` };
  if (fields.notBefore) {
    const nb = Date.parse(fields.notBefore);
    if (!Number.isNaN(nb) && now < nb) return { valid: false, reason: `now (${nowIso}) is before NotBefore (${fields.notBefore})` };
  }
  if (fields.notOnOrAfter) {
    const noa = Date.parse(fields.notOnOrAfter);
    if (Number.isNaN(noa)) return { valid: false, reason: `unparseable NotOnOrAfter: ${fields.notOnOrAfter}` };
    if (now >= noa) return { valid: false, reason: `now (${nowIso}) is on/after NotOnOrAfter (${fields.notOnOrAfter}) — the assertion's window has closed` };
    return { valid: true, reason: `now (${nowIso}) is within the window [${fields.notBefore ?? "−∞"}, ${fields.notOnOrAfter})` };
  }
  return { valid: true, reason: "no Conditions window constrains this assertion" };
}

// ----------------------------------------------------------------------------
// parse tree (logical regions, not byte offsets — the surface PEELs named fields)
// ----------------------------------------------------------------------------

function region(id: string, label: string, value: string, rfc: string): ParseRegion {
  // SAML is read as logical fields; byte offsets are the field's char span in the document for
  // boundary checks (start/end carry the substring location so region_labeled_correctly works).
  return { id, start: 0, end: 0, label, layer: "saml", value, rfc, children: [] };
}

/** Locate a field's char span in the XML for honest byte-range boundaries (best-effort). */
function spanOf(xml: string, needle: string | null): { start: number; end: number } {
  if (!needle) return { start: 0, end: 0 };
  const i = xml.indexOf(needle);
  return i < 0 ? { start: 0, end: 0 } : { start: i, end: i + needle.length };
}

/**
 * Build a ParseTreeProbe over a real SAML assertion. Throws only if the buffer is not a SAML
 * assertion at all (no <Assertion> element) — a forensic reader, like the others.
 */
export function parseSamlAssertion(xml: string): ParseTreeProbe {
  if (!/<(?:[A-Za-z0-9]+:)?Assertion[\s>]/.test(xml)) throw new Error("not a SAML assertion (no <Assertion> element)");
  const f = parseSamlFields(xml);

  const root: ParseRegion = {
    id: "saml",
    start: 0,
    end: xml.length,
    label: "SAML 2.0 Assertion",
    layer: "saml",
    value: `Assertion ${f.id ?? "?"} issued ${f.issueInstant ?? "?"} by ${f.issuer ?? "?"}`,
    rfc: "OASIS saml-core-2.0-os §2.3",
    children: [],
  };

  const add = (id: string, label: string, value: string | null, rfc: string, valueNeedle?: string | null): void => {
    const r = region(id, label, value ?? "(absent)", rfc);
    const span = spanOf(xml, valueNeedle ?? value ?? null);
    r.start = span.start;
    r.end = span.end;
    root.children.push(r);
  };

  add("saml.issuer", "Issuer", f.issuer, "saml-core §2.3.3 (Issuer)");
  add("saml.subject", "Subject NameID", f.nameId, "saml-core §2.4 (Subject)");
  add("saml.nameid_format", "NameID Format", f.nameIdFormat, "saml-core §8.3 (NameID Format)");
  add("saml.conditions.notbefore", "Conditions NotBefore", f.notBefore, "saml-core §2.5.1 (Conditions)");
  add("saml.conditions.notonorafter", "Conditions NotOnOrAfter", f.notOnOrAfter, "saml-core §2.5.1.2 (NotOnOrAfter, exclusive)");
  add("saml.audience", "AudienceRestriction Audience", f.audience, "saml-core §2.5.1.4 (AudienceRestriction)");
  add("saml.authn.instant", "AuthnStatement AuthnInstant", f.authnInstant, "saml-core §2.7.2 (AuthnStatement)");
  add("saml.authn.contextclassref", "AuthnContextClassRef", f.authnContextClassRef, "saml-core §2.7.2.2 (AuthnContext)");

  return buildProbe(root, xml.length);
}

// ----------------------------------------------------------------------------
// probe assembly (mirrors pkt/dns — one verifier path)
// ----------------------------------------------------------------------------

function flatten(r: ParseRegion, out: ParseRegion[]): void {
  out.push(r);
  for (const c of r.children) flatten(c, out);
}

function buildProbe(root: ParseRegion, byteLength: number): ParseTreeProbe {
  const regions: ParseRegion[] = [];
  flatten(root, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byRange = new Map<string, ParseRegion>();
  // first writer wins for a given range (the assertion has many zero-spans for absent fields)
  for (const r of regions) {
    const key = `${r.start}:${r.end}`;
    if (!byRange.has(key)) byRange.set(key, r);
  }
  return {
    regions,
    root,
    byteLength,
    region: (id) => byId.get(id) ?? null,
    regionAt: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`) ?? null,
    decode: (range: ByteRange) => byRange.get(`${range.start}:${range.end}`)?.value ?? null,
  };
}
