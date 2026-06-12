/**
 * Python engine acceptance (web ISA ISC-67/68): REAL CPython (Pyodide, node-capable build
 * of the same pinned package the browser self-hosts) runs the module-05 lab assets:
 * the committed validator.py judges evidence files (malformed files become findings, not
 * crashes) and the committed test suite's assertions execute against it in-engine.
 *
 * The browser path differs ONLY in loader glue (worker.ts/browser.ts — coverage-excluded);
 * the adapter core under test here is the code the worker runs.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { PythonEngineAdapter, PYODIDE_VERSION, PY_LAB_DIR, type PyodideLike } from "../src/engines/python";

const REPO = join(dirname(new URL(import.meta.url).pathname), "../..");
const VALIDATOR = readFileSync(join(REPO, "modules/05-programming-and-git/labs/validator.py"), "utf8");
const TEST_VALIDATOR = readFileSync(join(REPO, "modules/05-programming-and-git/labs/test_validator.py"), "utf8");

const adapter = new PythonEngineAdapter(async () => {
  const mod = await import("pyodide");
  return (await mod.loadPyodide()) as unknown as PyodideLike;
});

beforeAll(async () => {
  await adapter.load();
  await adapter.load(); // idempotent
}, 120_000);

const EVIDENCE = {
  "validator.py": VALIDATOR,
  "evidence/laptop-001.json": '{"host": "lt-01", "encrypted": true}',
  "evidence/laptop-002.json": '{"host": "lt-02", "encrypted": false}',
  "evidence/broken.json": '{"host": "b", "encrypted": tr', // malformed on purpose
};

describe("module-05 lab assets on real CPython", () => {
  test("validator.validate_dir: malformed file is a finding, not a crash", async () => {
    const r = await adapter.run(
      [
        "import json, validator",
        "report = validator.validate_dir('evidence')",
        "print(json.dumps(report, sort_keys=True))",
      ].join("\n"),
      EVIDENCE,
    );
    expect(r.exit).toBe(0);
    expect(r.stderr).toBe("");
    const report = JSON.parse(r.stdout);
    expect(report.results).toEqual([
      { file: "laptop-001.json", verdict: "PASS" },
      { file: "laptop-002.json", verdict: "FAIL" },
    ]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].file).toBe("broken.json");
  });

  test("validator.main writes the report file (probe via readLabFile)", async () => {
    const r = await adapter.run(
      ["import validator", "code = validator.main(['validator.py', 'evidence', 'report.json'])", "print(code)"].join("\n"),
      EVIDENCE,
    );
    expect(r.exit).toBe(0);
    expect(r.stdout.trim().endsWith("0")).toBe(true);
    const written = adapter.readLabFile("report.json");
    expect(written).not.toBeNull();
    expect(JSON.parse(written!).results).toHaveLength(2);
    expect(adapter.readLabFile("nope.json")).toBeNull();
  });

  test("the committed test suite's assertions run in-engine (ISC-68)", async () => {
    // pytest collects these in the real lab; in-engine we execute the same assertion
    // functions directly — same code, same semantics, no test-runner dependency.
    const r = await adapter.run(
      [
        "import test_validator as t",
        "t.test_encrypted_is_pass()",
        "t.test_unencrypted_is_fail()",
        "t.test_missing_field_is_fail()",
        "t.test_malformed_is_recorded_and_good_files_still_judged()",
        "print('4 assertions passed')",
      ].join("\n"),
      { ...EVIDENCE, "test_validator.py": TEST_VALIDATOR },
    );
    expect(r.stderr).toBe("");
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("4 assertions passed\n");
  });

  test("a broken learner change fails the taught assertion with CPython's traceback", async () => {
    const broken = VALIDATOR.replace('record.get("encrypted") is True', 'record.get("encrypted") is not None');
    const r = await adapter.run(
      ["import test_validator as t", "t.test_unencrypted_is_fail()"].join("\n"),
      { ...EVIDENCE, "validator.py": broken, "test_validator.py": TEST_VALIDATOR },
    );
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("AssertionError");
    expect(r.stderr).toContain("Traceback");
  });
});

describe("interpreter semantics", () => {
  test("runs are isolated (fresh globals — script semantics, not a REPL)", async () => {
    await adapter.run("leak = 42");
    const r = await adapter.run("print(leak)");
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("NameError");
  });

  test("SystemExit honors its code (validator usage error path)", async () => {
    const r = await adapter.run("import sys\nsys.exit(2)");
    expect(r.exit).toBe(2);
  });

  test("bare sys.exit() is a clean exit 0", async () => {
    const r = await adapter.run("import sys\nsys.exit()");
    expect(r.exit).toBe(0);
  });

  test("trailing expression repr lands in artifacts", async () => {
    const r = await adapter.run("1 + 1");
    expect(r.artifacts?.repr).toBe("2");
  });

  test("stdout/stderr streams are separated", async () => {
    const r = await adapter.run("import sys\nprint('clean')\nprint('complaint', file=sys.stderr)");
    expect(r.stdout).toBe("clean\n");
    expect(r.stderr).toBe("complaint\n");
    expect(r.exit).toBe(0);
  });

  test("version pin is enforced at load (ISC-128)", async () => {
    const drifted = new PythonEngineAdapter(async () => ({ version: "0.0.1" }) as PyodideLike);
    expect(drifted.load()).rejects.toThrow(`pinned ${PYODIDE_VERSION}`);
    expect(drifted.readLabFile("x")).toBeNull(); // not loaded → null probe
    expect(PY_LAB_DIR).toBe("/lab");
  });
});
