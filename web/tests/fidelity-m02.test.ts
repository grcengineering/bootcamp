/**
 * Module-02 fidelity suite (web ISA ISC-60; root ISA ISC-54).
 *
 * Replays every docker-linux-booted fixture (.ci/fixtures/captured/m02-*.json) through
 * the shell engine + linuxadmin extension and diffs per match class:
 *   byte-exact  → concatenated stdout/stderr + exit byte-identical
 *   structured  → template match; {{hole}} markers re-expanded from each fixture's
 *                 declared hole patterns (capture-time scrubs; manifest hole_defs)
 *
 * Capture-harness mapping, declared per entry in the manifest:
 *   - pre_root ran as root in the container → replayed here through sudo (then `sudo -k`
 *     so credential-cache state matches each capture's fresh session)
 *   - sim_equiv carries the interactive line + dialogue lines where the harness used
 *     piped `sudo -S` (the byte contract is the concatenated streams)
 *   - pipe_context entries captured with non-tty stdout → replayed under redirection,
 *     exactly like the harness (apt's WARNING is tty-gated for real)
 *   - ps aux / bare ps → header byte-exact + per-row grammar (the capture includes
 *     harness-only runuser rows the simulated box does not have)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ShellSession } from "../src/engines/shell/types";
import { FIXTURES, manifest, contract, createM02Session, collect, type Streams } from "./helpers-m02";

const manifestById = new Map<string, Record<string, unknown>>();
for (const e of manifest.entries) manifestById.set(e.id, e);

/** Replay a pre_root container-setup step through the sim's own elevation path. */
function preRootEquivalent(step: string): string[] {
  const table: Record<string, string[]> = {
    "useradd -m intern": ["echo labpass | sudo -S useradd -m intern"],
    "echo intern:internpw | chpasswd": [], // covered by the user-override seed
    "apt-get install -y /home/grcops/evidence-collector_1.0.0_all.deb":
      ["echo labpass | sudo -S apt install -y /home/grcops/evidence-collector_1.0.0_all.deb"],
    "systemctl start evidence-collector": ["echo labpass | sudo -S systemctl start evidence-collector"],
    "systemctl enable evidence-collector": ["echo labpass | sudo -S systemctl enable evidence-collector"],
    "systemctl stop evidence-collector": ["echo labpass | sudo -S systemctl stop evidence-collector"],
    "systemctl reload ssh": ["echo labpass | sudo -S systemctl reload ssh"],
    "printf 'PasswordAuthentication no\\nPermitRootLogin no\\n' >> /etc/ssh/sshd_config": [
      "echo labpass | sudo -S true",
      "printf 'PasswordAuthentication no\\nPermitRootLogin no\\n' | sudo tee -a /etc/ssh/sshd_config",
    ],
  };
  const mapped = table[step];
  if (mapped === undefined) throw new Error(`no sim mapping for pre_root step: ${step}`);
  return mapped;
}

/** structured-class template → regex (same encoding as the main fidelity suite). */
function templateToRegex(template: string, holes: Array<{ name: string; pattern: string }>): RegExp {
  let out = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const h of holes) out = out.replaceAll(`\\{\\{${h.name}\\}\\}`, h.pattern);
  return new RegExp(`^${out}$`);
}

interface Fx {
  id: string; match: string; cwd: string; user?: string;
  pre_root: string[]; pre: string[]; cmd: string;
  sim_equiv: { cmd: string; dialogue: string[]; eof?: boolean } | null;
  pipe_context: boolean;
  holes: Array<{ name: string; pattern: string }> | null;
  post_holes: Array<{ name: string; pattern: string }> | null;
  stdout: string | null; stderr: string | null; stderr_interactive: string | null; exit: number;
  post: Array<{ cmd: string; stdout: string | null; stderr: string | null; exit: number }>;
}

const captured = readdirSync(join(FIXTURES, "captured"))
  .filter((f) => f.startsWith("m02-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(FIXTURES, "captured", f), "utf8")) as Fx)
  .filter((fx) => manifestById.has(fx.id));

const PS_SPECIAL = new Set(["m02-ps-aux", "m02-ps-bare"]);

function setupSession(fx: Fx): ShellSession {
  const session = createM02Session(fx.user ?? (contract.user as string));
  const cd = collect(session, `cd ${fx.cwd}`);
  expect(cd.exit).toBe(0);
  for (const step of fx.pre_root) for (const line of preRootEquivalent(step)) collect(session, line);
  if (fx.pre_root.length > 0) collect(session, "sudo -k"); // fresh-credential state per capture
  for (const p of fx.pre) collect(session, p);
  return session;
}

/**
 * Entries replayed via the harness's exact piped form instead of the interactive
 * dialogue: a wrong first password ends an interactive sudo dialogue immediately
 * (single-collection dialogue — declared divergence from tty sudo's re-prompt loop),
 * so the 3-attempt byte contract is exercised the way it was captured.
 */
const VERBATIM_REPLAY = new Set(["m02-sudo-wrongpw"]);

function runMain(session: ShellSession, fx: Fx): Streams {
  const entry = manifestById.get(fx.id)!;
  const pipeContext = fx.pipe_context || entry.pipe_context === true;
  if (pipeContext) {
    // mirror the harness: streams to files, command's own exit observed
    const r = collect(session, `{ ${fx.cmd}; } > /tmp/.cap-out.txt 2> /tmp/.cap-err.txt`);
    return {
      stdout: session.readFile("/tmp/.cap-out.txt") ?? "",
      stderr: session.readFile("/tmp/.cap-err.txt") ?? "",
      exit: r.exit,
    };
  }
  const simEquiv = (fx.sim_equiv ?? (entry.sim_equiv as Fx["sim_equiv"])) || null;
  if (simEquiv && !VERBATIM_REPLAY.has(fx.id)) {
    return collect(session, simEquiv.cmd, simEquiv.dialogue ?? [], simEquiv.eof === true);
  }
  return collect(session, fx.cmd);
}

describe("fidelity-m02: simulator vs docker-linux-booted ground truth", () => {
  const counts: Record<string, number> = {};

  for (const fx of captured) {
    if (PS_SPECIAL.has(fx.id)) continue;

    test(`${fx.id} [${fx.match}] ${fx.cmd}`, () => {
      const session = setupSession(fx);
      const got = runMain(session, fx);

      if (fx.match === "byte-exact") {
        expect(got.stdout).toBe(fx.stdout ?? "");
        expect(got.stderr).toBe(fx.stderr_interactive ?? fx.stderr ?? "");
        expect(got.exit).toBe(fx.exit);
      } else {
        const holes = fx.holes ?? [];
        expect(got.stdout).toMatch(templateToRegex(fx.stdout ?? "", holes));
        expect(got.stderr).toMatch(templateToRegex(fx.stderr_interactive ?? fx.stderr ?? "", holes));
        expect(got.exit).toBe(fx.exit);
      }

      for (const [i, post] of fx.post.entries()) {
        const gp = collect(session, post.cmd);
        const pHoles = fx.post_holes ?? fx.holes;
        if (pHoles && pHoles.length > 0) {
          expect(gp.stdout).toMatch(templateToRegex(post.stdout ?? "", pHoles));
        } else {
          expect(`post${i}:${gp.stdout}`).toBe(`post${i}:${post.stdout ?? ""}`);
        }
        expect(gp.exit).toBe(post.exit);
      }
      counts[fx.match] = (counts[fx.match] ?? 0) + 1;
    });
  }

  // ---- ps aux / bare ps: header byte-exact + per-row column grammar -------------------
  test("m02-ps-aux [structured/grammar] ps aux", () => {
    const fx = captured.find((f) => f.id === "m02-ps-aux")!;
    const session = setupSession(fx);
    const got = collect(session, "ps aux");
    const capLines = (fx.stdout ?? "").trimEnd().split("\n");
    const simLines = got.stdout.trimEnd().split("\n");
    expect(simLines[0]).toBe(capLines[0]); // header bytes
    const row = /^[a-z+_-]{1,8} +\d+ +\d+\.\d+ +\d+\.\d+ +\d+ +\d+ +(\?|pts\/\d+) +\S{1,6} +\d{2}:\d{2} +\d+:\d{2} .+$/;
    for (const line of simLines.slice(1)) expect(line).toMatch(row);
    for (const line of capLines.slice(1)) expect(line).toMatch(row); // grammar derives from capture
    // the boot daemons are present with capture-pinned identity columns
    expect(got.stdout).toContain("/lib/systemd/");
    expect(got.stdout).toContain("sshd: /usr/sb");
    expect(simLines.every((l) => l.length <= 80)).toBe(true); // COLUMNS=80 truncation
    // §4.2 canon: sshd runs as root with scenario PID 742
    expect(simLines.find((l) => l.includes("sshd"))).toStartWith("root         742");
    expect(got.exit).toBe(0);
  });

  test("m02-ps-bare [structured/grammar] ps", () => {
    const fx = captured.find((f) => f.id === "m02-ps-bare")!;
    const session = setupSession(fx);
    const got = collect(session, "ps");
    const capLines = (fx.stdout ?? "").trimEnd().split("\n");
    const simLines = got.stdout.trimEnd().split("\n");
    expect(simLines[0]).toBe(capLines[0]);
    const row = /^ *\d+ (\?|pts\/\d) +\d{2}:\d{2}:\d{2} (bash|ps)$/;
    for (const line of simLines.slice(1)) expect(line).toMatch(row);
    for (const line of capLines.slice(1)) expect(line).toMatch(row);
    expect(got.exit).toBe(0);
  });

  test("coverage report (ISC-60)", () => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`fidelity-m02 coverage: ${total + 2} fixtures — ${JSON.stringify(counts)} + 2 grammar`);
    expect(total).toBeGreaterThanOrEqual(40);
  });
});
