/**
 * Module 12 — ported from modules/12-oscal-compliance-as-code/labs/fixtures/validate-oscal.ts
 * (web ISA ISC-84/137). Direct transcription: catalog required-field check, profile dangling-
 * reference check (the OSCAL form of a Module-10 crosswalk orphan), component-definition
 * implemented-requirements + resolvable C2P policy link. FAIL diagnostics go to STDOUT
 * (console.log in the original), usage errors to STDERR. Exit 0 valid / 1 invalid / 2 usage.
 *
 * Byte-accepted against builder-captures.json m12 (real `bun validate-oscal.ts` runs).
 */
import type { ReadonlyFs, ValidatorRun } from "./types";
import { ExitSignal, runPort } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any -- the original is deliberately schema-light */

/** Usage: validate-oscal.ts <catalog.json> <profile.json> <component.json> */
export function validateOscal(argv: string[], fs: ReadonlyFs): ValidatorRun {
  return runPort((io) => {
    const FAIL = (msg: string, consumer?: string): never => {
      io.log(`FAIL: ${msg}`);
      if (consumer) io.log(`  -> ${consumer}`);
      io.log("exit: 1");
      throw new ExitSignal(1);
    };

    const USAGE = (msg: string): never => {
      io.error(`ERROR: ${msg}`);
      io.error("usage: bun validate-oscal.ts <catalog.json> <profile.json> <component.json>");
      throw new ExitSignal(2);
    };

    const loadJson = (path: string | undefined): any => {
      if (!path) return USAGE("missing file argument");
      const text = fs.read(path);
      if (text === null) return USAGE(`file not found: ${path}`);
      try {
        return JSON.parse(text);
      } catch {
        return USAGE(`file is not valid JSON: ${path}`);
      }
    };

    const [catalogPath, profilePath, componentPath] = argv;

    const catalogDoc = loadJson(catalogPath);
    const profileDoc = loadJson(profilePath);
    const componentDoc = loadJson(componentPath);

    // --- 1. Catalog: required metadata + at least one control with an id. ---
    const catalog = catalogDoc?.catalog;
    if (!catalog) FAIL('catalog document missing top-level "catalog" object',
      "an importer that expects an OSCAL catalog cannot read this file at all");
    if (!catalog.uuid) FAIL('catalog missing required "uuid"',
      "the document has no stable identity; exchange tools cannot reference this version");
    const cm = catalog.metadata;
    if (!cm || !cm.title || !cm.version || !cm["oscal-version"]) {
      FAIL('catalog metadata missing a required field (title / version / oscal-version)',
        "a consumer cannot tell which catalog, version, or schema this is");
    }
    const controls: any[] = Array.isArray(catalog.controls) ? catalog.controls : [];
    if (controls.length === 0) FAIL("catalog defines no controls",
      "an empty spine selects nothing; every profile importing it would be vacuous");

    const controlIds = new Set<string>();
    for (const c of controls) {
      if (!c || typeof c.id !== "string" || c.id.length === 0) {
        FAIL('catalog control missing required "id"',
          "a control with no id cannot be referenced by a profile or a policy link; " +
          "this would break any importer (an auditor's tool, a FedRAMP pipeline) downstream.");
      }
      controlIds.add(c.id);
    }

    // --- 2. Profile: imports a catalog and includes only defined control ids. ---
    const profile = profileDoc?.profile;
    if (!profile) FAIL('profile document missing top-level "profile" object',
      "a baseline consumer cannot read this as an OSCAL profile");
    const imports: any[] = Array.isArray(profile.imports) ? profile.imports : [];
    if (imports.length === 0) FAIL("profile imports no catalog",
      "a profile that imports nothing selects from nothing; it is not a baseline");

    const inScope: string[] = [];
    const dangling: string[] = [];
    for (const imp of imports) {
      if (!imp.href) FAIL('profile import missing "href" to a catalog',
        "a profile that does not point at a catalog cannot be resolved");
      const includeBlocks: any[] = Array.isArray(imp["include-controls"]) ? imp["include-controls"] : [];
      for (const block of includeBlocks) {
        const ids: string[] = Array.isArray(block["with-ids"]) ? block["with-ids"] : [];
        for (const id of ids) {
          inScope.push(id);
          if (!controlIds.has(id)) dangling.push(id);
        }
      }
    }
    if (inScope.length === 0) FAIL("profile includes no control ids",
      "a profile that selects no controls satisfies no framework requirement");
    if (dangling.length > 0) {
      FAIL(`profile references control id(s) the catalog does not define: ${dangling.join(", ")}`,
        "this is the OSCAL form of a Module-10 crosswalk orphan: the profile claims a " +
        "control that has no home in the spine, so the selection cannot be resolved.");
    }

    // --- 3. Component-definition: real control ids + a resolvable policy link. ---
    const compDef = componentDoc?.["component-definition"];
    if (!compDef) FAIL('component document missing top-level "component-definition" object',
      "an implementation consumer cannot read this as an OSCAL component-definition");

    // Build the set of policy-id values declared in back-matter resources so a link
    // can be checked as RESOLVABLE, not merely present.
    const policyIds = new Set<string>();
    const resources: any[] = compDef["back-matter"]?.resources ?? [];
    for (const r of resources) {
      for (const p of r.props ?? []) {
        if (p.name === "policy-id" && typeof p.value === "string") policyIds.add(p.value);
      }
    }

    const components: any[] = Array.isArray(compDef.components) ? compDef.components : [];
    let implementedCount = 0;
    let policyLinkedCount = 0;
    const lines: string[] = [];

    for (const comp of components) {
      for (const ci of comp["control-implementations"] ?? []) {
        for (const ir of ci["implemented-requirements"] ?? []) {
          const cid = ir["control-id"];
          if (typeof cid !== "string" || cid.length === 0) {
            FAIL('implemented-requirement missing required "control-id"',
              "an implementation that names no control cannot be joined to the catalog or a policy");
          }
          if (!controlIds.has(cid)) {
            FAIL(`implemented-requirement names control "${cid}" the catalog does not define`,
              "the implementation claims a control with no home in the spine; the claim is unverifiable");
          }
          implementedCount++;
          // A C2P policy link: rel "policy" whose href resolves to a declared policy-id.
          let linked = false;
          for (const l of ir.links ?? []) {
            if (l.rel === "policy" && typeof l.href === "string") {
              const ref = l.href.startsWith("#") ? l.href.slice(1) : l.href;
              // The href points into back-matter (#policy-<id>) or names the id directly.
              const matches = [...policyIds].some(
                (pid) => ref === pid || ref === `policy-${pid}`,
              );
              if (matches) {
                linked = true;
                const pid = [...policyIds].find(
                  (p) => ref === p || ref === `policy-${p}`,
                );
                lines.push(`  ${cid} -> policy "${pid}"  [link resolves]`);
              }
            }
          }
          if (linked) policyLinkedCount++;
        }
      }
    }

    if (implementedCount === 0) FAIL("component-definition implements no controls",
      "a component that implements nothing proves no control is satisfied");
    if (policyLinkedCount === 0) {
      FAIL("no implemented control carries a resolvable policy link (C2P)",
        "without a link from the OSCAL claim to the enforcing policy, the document only " +
        "ASSERTS the control is implemented; it does not WIRE the claim to the enforcement.");
    }

    // --- PASS report (machine- and human-readable). ---
    io.log(`catalog: "${cm.title}" | controls: ${controls.length} (${[...controlIds].join(", ")})`);
    io.log(
      `profile: imports ${imports[0].href} | in-scope: ${inScope.length} (${inScope.join(", ")}) | dangling: ${dangling.length}`,
    );
    io.log(`component: implemented-requirements: ${implementedCount} | policy-linked: ${policyLinkedCount}`);
    for (const l of lines) io.log(l);
    io.log("PASS: required fields present, profile references resolve, control is implemented and policy-linked");
    io.log("exit: 0");
    throw new ExitSignal(0);
  });
}
