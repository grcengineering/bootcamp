/**
 * Fidelity suite (root ISA ISC-58/59; web ISA ISC-53..65).
 *
 * Replays every captured fixture through the shell engine and diffs per match class:
 *   byte-exact  → stdout, stderr (interactive form), exit code all byte-identical
 *   structured  → template match with typed holes (each hole names its entropy source)
 *
 * This file is the acceptance oracle for the engine implementation. It is intentionally
 * independent of the engine's internals: it consumes only the frozen public contract
 * (src/engines/shell/types.ts) and the committed fixtures (.ci/fixtures/).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { createShellEngine } from "../src/engines/shell";
import { loadManifest } from "../../.ci/fixtures/load-manifest";
import type { SeedSpec, ExecResult, ShellSession } from "../src/engines/shell/types";

const FIXTURES = join(dirname(new URL(import.meta.url).pathname), "../../.ci/fixtures");
// manifest.yaml PLUS every manifest.d/*.yaml fragment (Wave-4 fan-out) — one merged manifest.
const manifest = loadManifest(FIXTURES);

function loadSeed(seedId: string): SeedSpec {
  const seedDef = manifest.seeds[seedId];
  const homeDir = join(FIXTURES, seedDef.home);
  const binDir = join(FIXTURES, seedDef.path_bin);
  const files: SeedSpec["files"] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = "~/" + relative(homeDir, full);
      if (statSync(full).isDirectory()) { files.push({ path: rel, dir: true }); walk(full); }
      else if (name !== ".gitkeep") files.push({ path: rel, content: readFileSync(full, "utf8") });
    }
  };
  walk(homeDir);
  const tools: Record<string, string> = {};
  for (const name of readdirSync(binDir)) tools[name] = readFileSync(join(binDir, name), "utf8");
  return { files, tools };
}

function drain(session: ShellSession, line: string): { stdout: string; stderr: string; exit: number } {
  let r: ExecResult = session.exec(line);
  if (r.state === "pending") r = session.eof(); // fidelity replays are non-interactive
  const stdout = r.events.filter((e) => e.stream === "stdout").map((e) => e.text).join("");
  const stderr = r.events.filter((e) => e.stream === "stderr").map((e) => e.text).join("");
  return { stdout, stderr, exit: r.state === "done" ? r.exit : -1 };
}

const captured = readdirSync(join(FIXTURES, "captured")).filter((f) => f.endsWith(".json"));
const engine = createShellEngine();

const counts: Record<string, number> = {};

describe("fidelity: simulator vs captured ground truth", () => {
  for (const file of captured) {
    const fx = JSON.parse(readFileSync(join(FIXTURES, "captured", file), "utf8"));
    if (!fx.source.startsWith("docker-linux") && fx.source !== "macos-host") continue;
    if (fx.source === "docker-linux-booted") continue; // module 02 wave — separate suite
    // Entries whose simulation surface is NOT the shell engine (declared via the manifest
    // entry's sim_suite) are acceptance-tested by their own engine-class suite — e.g. the
    // m13 CCM captures exercise `source` + bash functions the shell engine doesn't claim;
    // their ported-library equivalence is byte-asserted by exercise-replay-13.test.ts and
    // tests/builders-validators.test.ts (same precedent as the booted skip above).
    const entry = (manifest.entries ?? []).find((e: { id: string }) => e.id === fx.id);
    if (entry?.sim_suite && entry.sim_suite !== "shell") continue;

    test(`${fx.id} [${fx.match}] ${fx.cmd}`, () => {
      const contract = manifest.meta.contracts[fx.source];
      const session = engine.create({
        variant: fx.source === "macos-host" ? "zsh-macos" : "bash-linux",
        seed: fx.seed ? loadSeed(fx.seed) : { files: [], tools: {} },
        epoch: manifest.meta.epoch,
        cols: contract.cols ?? 80,
        user: contract.user,
        host: contract.hostname ?? "workstation",
        home: contract.home ?? `/home/${contract.user}`,
      });
      // place the session at the entry's cwd
      const cd = drain(session, `cd ${fx.cwd}`);
      expect(cd.exit).toBe(0);
      for (const pre of fx.pre ?? []) drain(session, pre);

      // The learner types tty_equiv (e.g. `ls`); capture recorded its width-pinned equivalent.
      const typed = fx.tty_equiv ?? fx.cmd;
      const got = drain(session, typed);

      if (fx.match === "byte-exact") {
        expect(got.stdout).toBe(fx.stdout ?? "");
        expect(got.stderr).toBe(fx.stderr_interactive ?? fx.stderr ?? "");
        expect(got.exit).toBe(fx.exit);
      } else if (fx.match === "structured") {
        const re = templateToRegex(fx.stdout ?? "", fx.holes ?? []);
        expect(got.stdout).toMatch(re);
        expect(got.exit).toBe(fx.exit);
      } else {
        throw new Error(`unhandled match class in shell suite: ${fx.match}`);
      }

      for (const [i, post] of (fx.post ?? []).entries()) {
        const gp = drain(session, post.cmd);
        expect(`post${i}:${gp.stdout}`).toBe(`post${i}:${post.stdout ?? ""}`);
        expect(gp.exit).toBe(post.exit);
      }
      counts[fx.match] = (counts[fx.match] ?? 0) + 1;
    });
  }

  test("coverage report (ISC-59)", () => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`fidelity coverage: ${total} fixtures — ${JSON.stringify(counts)}`);
    expect(total).toBeGreaterThan(0);
  });
});

/** structured-class template: holes are `{{name}}` markers with declared entropy sources. */
function templateToRegex(template: string, holes: Array<{ name: string; pattern: string }>): RegExp {
  let out = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const h of holes) out = out.replaceAll(`\\{\\{${h.name}\\}\\}`, h.pattern);
  return new RegExp(`^${out}$`);
}
