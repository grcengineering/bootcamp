/**
 * Policy engine acceptance (web ISA ISC-71/72):
 *  - Cedar: live evaluation of the module-09 committed policy (labs/fixtures/policy.cedar)
 *    — allow/deny pairs including the revokeRole trap row (deny iff action==grantRole AND
 *    role==legacy-admin; revoking legacy-admin is FINE — the §4.3 failure mode).
 *  - OPA: the PRECOMPILED reference policy (modules/09 exercises/assets/policy.wasm, built
 *    by dockerized `opa build -t wasm`) evaluated against mutated inputs with check.sh
 *    exit-code semantics (exit 1 iff deny non-empty).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  CedarEngineAdapter,
  nodeCedarLoader,
  OpaEngineAdapter,
  OPA_DEFAULT_ENTRYPOINT,
  OPA_POLICY_DEFAULT_URL,
  type CedarDecision,
  type CedarRequest,
} from "../src/engines/policy";

const REPO = join(dirname(new URL(import.meta.url).pathname), "../..");
const CEDAR_POLICY = readFileSync(join(REPO, "modules/09-policy-as-code/labs/fixtures/policy.cedar"), "utf8");
const OPA_WASM = join(REPO, "modules/09-policy-as-code/exercises/assets/policy.wasm");

// The module's Cedar fixture is forbid-only (forbid wins over any permit); a baseline
// permit makes the allow/deny pair observable — exactly how the lab frames it.
const POLICY_SET = `permit(principal, action, resource);\n${CEDAR_POLICY}`;

const entities = JSON.stringify([
  { uid: { type: "AccessChange", id: "row2" }, attrs: { role: "legacy-admin" }, parents: [] },
  { uid: { type: "AccessChange", id: "row3" }, attrs: { role: "auditor" }, parents: [] },
]);

function req(action: string, id: string): CedarRequest {
  return {
    principal: { type: "User", id: "svc-deploy" },
    action: { type: "Action", id: action },
    resource: { type: "AccessChange", id },
  };
}

describe("Cedar — live learner-authored policy evaluation", () => {
  const adapter = new CedarEngineAdapter(nodeCedarLoader);

  test("allow/deny pairs incl. the revokeRole trap (AC-6-legacy-admin)", async () => {
    const requests = JSON.stringify([
      req("grantRole", "row2"), // grant legacy-admin  → DENY (the control)
      req("revokeRole", "row2"), // revoke legacy-admin → ALLOW (the trap row)
      req("grantRole", "row3"), // grant auditor       → ALLOW
    ]);
    const r = await adapter.run(POLICY_SET, { "requests.json": requests, "entities.json": entities });
    expect(r.exit).toBe(0);
    const decisions = r.artifacts?.decisions as CedarDecision[];
    expect(decisions.map((d) => d.decision)).toEqual(["deny", "allow", "allow"]);
    // the forbid policy (policy1 in the set) is the reason for the deny
    expect(decisions[0].reason).toContain("policy1");
    expect(r.stdout).toBe(
      'DENY  Action::"grantRole" on AccessChange::"row2" by User::"svc-deploy"\n' +
        'ALLOW Action::"revokeRole" on AccessChange::"row2" by User::"svc-deploy"\n' +
        'ALLOW Action::"grantRole" on AccessChange::"row3" by User::"svc-deploy"\n',
    );
  });

  test("forbid-only policy set denies everything (default-deny semantics)", async () => {
    const r = await adapter.run(CEDAR_POLICY, {
      "requests.json": JSON.stringify([req("grantRole", "row3")]),
      "entities.json": entities,
    });
    const decisions = r.artifacts?.decisions as CedarDecision[];
    expect(decisions[0]).toEqual({ decision: "deny", reason: [] }); // nothing permits
  });

  test("learner syntax error surfaces Cedar's own diagnostics, exit 1", async () => {
    const r = await adapter.run("permit(principal, action", {
      "requests.json": JSON.stringify([req("grantRole", "row2")]),
      "entities.json": entities,
    });
    expect(r.exit).toBe(1);
    expect(r.stderr.length).toBeGreaterThan(0);
    expect(r.stdout).toBe("");
  });

  test("malformed exercise asset JSON → exit 2", async () => {
    const r = await adapter.run(POLICY_SET, { "requests.json": "not json" });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("invalid exercise asset JSON");
  });

  test("no requests → empty decision log, exit 0", async () => {
    const r = await adapter.run(POLICY_SET, {});
    expect(r).toMatchObject({ stdout: "", exit: 0 });
    expect(r.artifacts?.decisions).toEqual([]);
  });
});

describe("OPA — precompiled policy, input-mutation exercises (check.sh semantics)", () => {
  const adapter = new OpaEngineAdapter({
    wasmBytes: async () => readFileSync(OPA_WASM),
  });

  test("violating input → DENY line + RESULT deny + exit 1 (gate teeth)", async () => {
    const r = await adapter.run(JSON.stringify({ action: "grantRole", resource: { role: "legacy-admin" } }));
    expect(r.exit).toBe(1);
    expect(r.stdout).toBe(
      "DENY  granting the legacy-admin role is forbidden\n" +
        "RESULT  entrypoint=access/deny  decision=deny  violations=1\n",
    );
    expect(r.artifacts?.deny).toEqual(["granting the legacy-admin role is forbidden"]);
  });

  test("the trap row: revoking legacy-admin is allowed (action AND role both checked)", async () => {
    const r = await adapter.run(JSON.stringify({ action: "revokeRole", resource: { role: "legacy-admin" } }));
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("RESULT  entrypoint=access/deny  decision=allow  violations=0\n");
    expect(r.artifacts?.deny).toEqual([]);
  });

  test("granting a non-legacy role is allowed", async () => {
    const r = await adapter.run(JSON.stringify({ action: "grantRole", resource: { role: "auditor" } }));
    expect(r.exit).toBe(0);
  });

  test("bundle exposes the expected entrypoint (provenance surface)", async () => {
    expect(await adapter.entrypoints()).toEqual([OPA_DEFAULT_ENTRYPOINT]);
    expect(OPA_POLICY_DEFAULT_URL).toBe("/engines/opa/policy.wasm");
  });

  test("invalid input JSON → exit 2", async () => {
    const r = await adapter.run("{nope");
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("invalid input JSON");
  });

  test("unknown entrypoint → evaluation error, exit 2", async () => {
    const wrong = new OpaEngineAdapter({
      wasmBytes: async () => readFileSync(OPA_WASM),
      entrypoint: "access/nonexistent",
    });
    const r = await wrong.run("{}");
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("opa evaluation failed");
  });

  test("load() is idempotent", async () => {
    await adapter.load();
    await adapter.load();
    expect((await adapter.run("{}")).exit).toBe(0);
  });
});
