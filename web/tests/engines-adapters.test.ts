/**
 * Uniform adapter contract (web ISA ISC-66..73): the helpers every engine adapter (and
 * future ones — api-lab, structured sims) builds results with, plus jq's pure helpers.
 */
import { describe, expect, test } from "bun:test";
import { ok, fail, errorMessage, type EngineAdapter } from "../src/engines/adapters";
import { ensureTrailingNewline, parseJsonValues } from "../src/engines/jq";

describe("result constructors", () => {
  test("ok(): terminal-shaped success with optional artifacts", () => {
    expect(ok("done\n")).toEqual({ stdout: "done\n", stderr: "", exit: 0 });
    expect(ok("done\n", { rows: 3 })).toEqual({
      stdout: "done\n",
      stderr: "",
      exit: 0,
      artifacts: { rows: 3 },
    });
  });

  test("fail(): mirrors tool failure semantics (default exit 1, custom codes)", () => {
    expect(fail("boom\n")).toEqual({ stdout: "", stderr: "boom\n", exit: 1 });
    expect(fail("usage\n", 2, { hint: "args" })).toEqual({
      stdout: "",
      stderr: "usage\n",
      exit: 2,
      artifacts: { hint: "args" },
    });
  });

  test("errorMessage(): Error, string, and structured throwables", () => {
    expect(errorMessage(new Error("engine said no"))).toBe("engine said no");
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage({ code: 42 })).toBe('{"code":42}');
  });

  test("the contract type admits a minimal adapter (compile-time + runtime shape)", async () => {
    const echo: EngineAdapter = {
      id: "echo",
      load: async () => {},
      run: async (input) => ok(input + "\n"),
    };
    await echo.load();
    expect(await echo.run("hi")).toEqual({ stdout: "hi\n", stderr: "", exit: 0 });
  });
});

describe("jq pure helpers", () => {
  test("parseJsonValues: NDJSON → values; pretty JSON → null (not NDJSON)", () => {
    expect(parseJsonValues('1\n"two"\n[3]\n')).toEqual([1, "two", [3]]);
    expect(parseJsonValues("")).toEqual([]);
    expect(parseJsonValues('{\n  "a": 1\n}\n')).toBeNull();
  });

  test("ensureTrailingNewline: idempotent normalization at the wasm boundary", () => {
    expect(ensureTrailingNewline("")).toBe("");
    expect(ensureTrailingNewline("x")).toBe("x\n");
    expect(ensureTrailingNewline("x\n")).toBe("x\n");
  });
});
