/**
 * jq engine acceptance (web ISA ISC-70): REAL jq 1.8.1 (jq-wasm) evaluates the taught
 * filters from the modules-01/06/07 JSON bridge against committed-fixture-shaped data.
 */
import { describe, expect, test } from "bun:test";
import { JqEngineAdapter, parseInvocation, JQ_DEFAULT_INPUT } from "../src/engines/jq";

/** modules/07 labs/setup.sh audit-events.json (fixture shape). */
const AUDIT_EVENTS = JSON.stringify([
  { eventTime: "2026-05-20T14:02:00Z", eventName: "AttachUserPolicy", actor: "alice", policy: "AdministratorAccess" },
  { eventTime: "2026-05-20T02:14:00Z", eventName: "AttachUserPolicy", actor: "contractor-7", policy: "AdministratorAccess" },
  { eventTime: "2026-05-20T11:30:00Z", eventName: "GetObject", actor: "alice", policy: "" },
]);

describe("parseInvocation", () => {
  test("bare filter targets input.json", () => {
    expect(parseInvocation(".users[].name")).toEqual({
      filter: ".users[].name",
      flags: [],
      file: JQ_DEFAULT_INPUT,
    });
  });

  test("taught CLI form: jq -r '.[] | .actor' audit-events.json", () => {
    expect(parseInvocation("jq -r '.[] | .actor' audit-events.json")).toEqual({
      filter: ".[] | .actor",
      flags: ["-r"],
      file: "audit-events.json",
    });
  });

  test("double-quoted filter and defaults", () => {
    expect(parseInvocation('jq ".count"')).toEqual({ filter: ".count", flags: [], file: JQ_DEFAULT_INPUT });
    expect(parseInvocation("jq")).toEqual({ filter: ".", flags: [], file: JQ_DEFAULT_INPUT });
  });
});

describe("real jq evaluation", () => {
  const adapter = new JqEngineAdapter();

  test("filter privilege grants, ignore the data-plane event (module-07 §5.2)", async () => {
    const r = await adapter.run('jq -c \'[.[] | select(.eventName == "AttachUserPolicy") | .actor]\' audit-events.json', {
      "audit-events.json": AUDIT_EVENTS,
    });
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe('["alice","contractor-7"]\n');
    expect(r.artifacts?.values).toEqual([["alice", "contractor-7"]]);
  });

  test("-r raw strings (taught for piping into shell tools)", async () => {
    const r = await adapter.run("jq -r '.[].actor' audit-events.json", { "audit-events.json": AUDIT_EVENTS });
    expect(r.stdout).toBe("alice\ncontractor-7\nalice\n");
    expect(r.artifacts).toBeUndefined(); // raw mode: lines are not JSON values
  });

  test("bare filter against the default input.json", async () => {
    const r = await adapter.run("length", { "input.json": AUDIT_EVENTS });
    expect(r.stdout).toBe("3\n");
    expect(r.artifacts?.values).toEqual([3]);
  });

  test("pretty (non -c) object output is still real jq formatting", async () => {
    const r = await adapter.run(".[0] | {actor}", { "input.json": AUDIT_EVENTS });
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe('{\n  "actor": "alice"\n}\n');
  });

  test("jq's own error text + non-zero exit on bad filter", async () => {
    const r = await adapter.run(".foo.", { "input.json": AUDIT_EVENTS });
    expect(r.exit).not.toBe(0);
    expect(r.stderr).toContain("jq: error");
    expect(r.stdout).toBe("");
  });

  test("runtime error (indexing a string) carries jq's message", async () => {
    const r = await adapter.run(".[0].actor.deeper", { "input.json": AUDIT_EVENTS });
    expect(r.exit).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain("cannot");
  });

  test("missing input file mirrors the CLI failure shape", async () => {
    const r = await adapter.run("jq . missing.json", {});
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("Could not open missing.json");
  });

  test("load() warms and reports the pinned engine version", async () => {
    await adapter.load();
    await adapter.load(); // idempotent
    expect(await adapter.version()).toContain("1.8.1");
  });
});
