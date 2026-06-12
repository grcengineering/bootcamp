/**
 * PowerShell fidelity suite (web ISA ISC-63; root fidelity hierarchy decision 2026-06-12).
 *
 * Replays every authored m04 fixture (.ci/fixtures/captured/m04-*.json, source
 * pwsh-authored) through the PowerShell engine and byte-diffs stdout/stderr/exit.
 * Two extra canon tripwires keep the authored fixtures honest:
 *   1. prose-canon fixtures must byte-appear in modules/04-windows-fundamentals/module.md
 *      (spec↔prose drift tripwire, root ISC-70/74);
 *   2. the §5.4 collector bundle must satisfy the committed lab evaluator's COMPLIANT
 *      contract (labs/happy-path.sh rules — encryption, Defender, logon threshold, admins).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { createPowerShellEngine } from "../src/engines/powershell";
import type { ExecResult, PowerShellSession, WindowsSeed } from "../src/engines/powershell/types";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const FIXTURES = join(ROOT, ".ci/fixtures");
const manifest = parseYaml(readFileSync(join(FIXTURES, "manifest.yaml"), "utf8"));
const moduleMd = readFileSync(join(ROOT, "modules/04-windows-fundamentals/module.md"), "utf8");

export function loadM04Seed(file = "win-lab04.json"): WindowsSeed {
  const raw = JSON.parse(readFileSync(join(FIXTURES, "seeds/m04", file), "utf8"));
  return {
    ...raw,
    gpresultReport: readFileSync(join(FIXTURES, "seeds/m04", raw.gpresultReportFile), "utf8").replace(/\n$/, ""),
  };
}

const engine = createPowerShellEngine();

function mkSession(seed: WindowsSeed = loadM04Seed()): PowerShellSession {
  return engine.create({
    seed,
    epoch: manifest.meta.epoch,
    cols: 80,
    user: "labuser",
    home: "C:\\Users\\labuser",
  });
}

function drain(session: PowerShellSession, line: string): { stdout: string; stderr: string; exit: number } {
  let r: ExecResult = session.exec(line);
  if (r.state === "pending") r = session.eof();
  const stdout = r.events.filter((e) => e.stream === "stdout").map((e) => e.text).join("");
  const stderr = r.events.filter((e) => e.stream === "stderr").map((e) => e.text).join("");
  return { stdout, stderr, exit: r.state === "done" ? r.exit : -1 };
}

const captured = readdirSync(join(FIXTURES, "captured"))
  .filter((f) => f.startsWith("m04-") && f.endsWith(".json"))
  .sort();

const PROSE_CANON_IDS = [
  "m04-bitlocker-select",
  "m04-defender-select",
  "m04-winevent-4625-select",
  "m04-pscustomobject-json",
];

describe("m04 fidelity: powershell-sim vs authored-with-citation fixtures", () => {
  for (const file of captured) {
    const fx = JSON.parse(readFileSync(join(FIXTURES, "captured", file), "utf8"));
    test(`${fx.id} [${fx.match}] ${fx.cmd.split("\n")[0]}`, () => {
      expect(fx.source).toBe("pwsh-authored");
      expect(fx.match).toBe("authored-with-citation");
      expect(fx.citation).toBeTruthy();
      const session = mkSession();
      for (const pre of fx.pre ?? []) {
        expect(drain(session, pre).exit).toBe(0);
      }
      const got = drain(session, fx.cmd);
      expect(got.stdout).toBe(fx.stdout ?? "");
      expect(got.stderr).toBe(fx.stderr_interactive ?? fx.stderr ?? "");
      expect(got.exit).toBe(fx.exit);
    });
  }

  test("every pwsh-authored manifest entry has a fixture, and vice versa", () => {
    const entryIds = (manifest.entries as Array<{ id: string; source: string; citation?: string }>)
      .filter((e) => e.source === "pwsh-authored")
      .map((e) => e.id)
      .sort();
    const fixtureIds = captured.map((f) => f.replace(/\.json$/, "")).sort();
    expect(entryIds).toEqual(fixtureIds);
    expect(entryIds.length).toBeGreaterThanOrEqual(15);
  });

  test("ISC-63 cmdlet coverage: each evidence command has at least one fixture", () => {
    const cmds = captured.map((f) => JSON.parse(readFileSync(join(FIXTURES, "captured", f), "utf8")))
      .map((fx) => [fx.cmd, ...(fx.pre ?? [])].join("\n"));
    for (const needle of [
      "Get-BitLockerVolume", "Get-MpComputerStatus", "Get-WinEvent", "gpresult /R",
      "Get-LocalGroupMember", "Get-ItemProperty", "Select-Object", "ConvertTo-Json", "Export-Csv",
    ]) {
      expect(cmds.some((c) => c.includes(needle))).toBe(true);
    }
  });

  test("prose-canon tripwire: §5 fixtures byte-appear in module.md", () => {
    for (const id of PROSE_CANON_IDS) {
      const fx = JSON.parse(readFileSync(join(FIXTURES, "captured", `${id}.json`), "utf8"));
      expect(moduleMd.includes(fx.stdout)).toBe(true);
    }
  });

  test("labs-canon tripwire: the §5.4 collector bundle is COMPLIANT under happy-path.sh rules", () => {
    const session = mkSession();
    const fx = JSON.parse(readFileSync(join(FIXTURES, "captured", "m04-pscustomobject-json.json"), "utf8"));
    expect(drain(session, `${fx.cmd} > bundle.json`).exit).toBe(0);
    const bundle = JSON.parse(session.readFile("bundle.json")!.replace(/\r\n/g, "\n"));
    // labs/happy-path.sh evaluation contract (FAILED_LOGON_THRESHOLD=5, approved \Administrator)
    expect(bundle.Control_CC6_1_Encryption).toBe("FullyEncrypted");
    expect(bundle.Control_CC6_8_DefenderEnabled).toBe(true);
    expect(bundle.Control_CC6_1_FailedLogonCount).toBeLessThanOrEqual(5);
    expect(Array.isArray(bundle.Control_CC6_3_LocalAdmins)).toBe(true);
    for (const admin of bundle.Control_CC6_3_LocalAdmins) {
      expect(admin.endsWith("\\Administrator")).toBe(true);
    }
    // key set matches the committed compliant sample's control-label scheme
    const sample = JSON.parse(
      readFileSync(join(ROOT, "modules/04-windows-fundamentals/labs/sample-bundle-compliant.json"), "utf8"),
    );
    for (const key of Object.keys(bundle)) expect(Object.keys(sample)).toContain(key);
  });

  test("assessment re-seed: the non-compliant twin is NON-COMPLIANT under the same rules", () => {
    const session = mkSession(loadM04Seed("win-lab04-noncompliant.json"));
    const fx = JSON.parse(readFileSync(join(FIXTURES, "captured", "m04-pscustomobject-json.json"), "utf8"));
    expect(drain(session, `${fx.cmd} > bundle.json`).exit).toBe(0);
    const bundle = JSON.parse(session.readFile("bundle.json")!.replace(/\r\n/g, "\n"));
    expect(bundle.Control_CC6_1_Encryption).toBe("EncryptionInProgress");
    expect(bundle.Control_CC6_8_DefenderEnabled).toBe(false);
    expect(bundle.Control_CC6_1_FailedLogonCount).toBe(14);
    expect(bundle.Control_CC6_1_ScreenLockTimeoutSeconds).toBe(0);
    expect(bundle.Control_CC6_3_LocalAdmins).toEqual([
      "WIN-LAB04\\Administrator",
      "WIN-LAB04\\rogue.contractor",
    ]);
  });
});
