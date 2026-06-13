#!/usr/bin/env bun
/**
 * Ground-truth capture harness (root ISA ISC-54/55/56).
 *
 * Replays fidelity-manifest entries against the executable environment contracts and records
 * fixtures with provenance. The simulator never invents output; this tool is where output
 * comes from.
 *
 * Usage:
 *   bun .ci/fixtures/capture.ts linux            # all docker-linux-userland entries
 *   bun .ci/fixtures/capture.ts linux m01-pwd-home …    # subset by id
 *   bun .ci/fixtures/capture.ts macos            # macos-host entries (run on a real Mac)
 *   bun .ci/fixtures/capture.ts --check          # re-run everything twice; fail on self-diff
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { loadManifest } from "./load-manifest";

const HERE = dirname(new URL(import.meta.url).pathname);
// manifest.yaml PLUS every manifest.d/*.yaml fragment (Wave-4 fan-out): a module agent's
// docker-*/macos-host entries are captured here the same as the base manifest's.
const MANIFEST = loadManifest(HERE);
const CAPTURED = join(HERE, "captured");
mkdirSync(CAPTURED, { recursive: true });

type Hole = { name: string; find?: string; pattern: string; source: string };
type Entry = {
  id: string; module: string; source: string; match: string; seed?: string;
  cwd: string; pre?: string[]; cmd: string; post?: string[];
  tty_equiv?: string; citation?: string; notes?: string;
  // booted-mode extras (module 02 family)
  user?: string; pre_root?: string[]; holes?: Hole[]; post_holes?: Hole[];
  sim_equiv?: unknown; pipe_context?: boolean;
};

const args = process.argv.slice(2);
const selfCheck = args.includes("--check");
const mode = args.find((a) => !a.startsWith("--")) ?? "linux";
const onlyIds = args.filter((a) => !a.startsWith("--") && a !== mode);

const SOURCE_FOR = { linux: "docker-linux-userland", booted: "docker-linux-booted", macos: "macos-host" } as const;
const source = SOURCE_FOR[mode as keyof typeof SOURCE_FOR];
if (!source) { console.error(`unknown mode: ${mode}`); process.exit(2); }

const entries: Entry[] = MANIFEST.entries.filter(
  (e: Entry) => e.source === source && (onlyIds.length === 0 || onlyIds.includes(e.id)),
);
if (entries.length === 0) { console.error(`no manifest entries for source=${source}`); process.exit(2); }

const contract = MANIFEST.meta.contracts[source];
const IMAGE_TAG = `grc-bootcamp-capture:${mode}`;

function sh(cmd: string, cmdArgs: string[], opts: { input?: string } = {}): string {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, input: opts.input });
}

function buildImage() {
  console.log(`building ${IMAGE_TAG} from ${contract.dockerfile} …`);
  sh("docker", ["build", "-q", "-t", IMAGE_TAG, "-f", join(HERE, contract.dockerfile), join(HERE, "env")]);
}

/** One bash session per entry: seed → cd → pre → captured cmd (streams split) → post (streams split). */
function runnerScript(e: Entry): string {
  const seed = e.seed ? MANIFEST.seeds[e.seed] : null;
  const lines: string[] = ["#!/bin/bash", "set -u"];
  if (seed) {
    lines.push(
      `cp -r /seed/home/. /home/analyst/ 2>/dev/null || true`,
      `chown -R analyst:analyst /home/analyst`,
      `if [ -d /seed/bin ]; then cp /seed/bin/* /usr/local/bin/ && chmod 0755 /usr/local/bin/*; fi`,
      `find /home/analyst -exec touch -d "@$(date -d '${MANIFEST.meta.epoch}' +%s 2>/dev/null || echo 1780304400)" {} + 2>/dev/null || true`,
    );
  }
  // The learner session runs as the contract user with a fresh bash (no -e: exit codes are data).
  const session: string[] = [`cd ${shq(e.cwd)} || exit 99`];
  for (const p of e.pre ?? []) session.push(`{ ${p}; } > /dev/null 2>&1`);
  // $? must survive the bookkeeping write: an interactive learner session has nothing between
  // the command and the next thing they type, so `echo $?` probes in post must observe the
  // captured command's exit status (module 01 §5.4 canon). `(exit $__rc)` restores it after
  // each harness write — without this, the harness's own `echo -n` clobbers $? (capture bug
  // found 2026-06-12: m01-grepq-clean recorded post `echo $?` → "0" after a grep that exited 1).
  session.push(
    `{ ${e.cmd}; } > /cap/out.txt 2> /cap/err.txt; __rc=$?; echo -n $__rc > /cap/code.txt; (exit $__rc)`,
  );
  (e.post ?? []).forEach((p, i) => {
    session.push(
      `{ ${p}; } > /cap/post${i}.out.txt 2> /cap/post${i}.err.txt; __rc=$?; echo -n $__rc > /cap/post${i}.code.txt; (exit $__rc)`,
    );
  });
  lines.push(
    `mkdir -p /cap && chown ${contract.user} /cap`,
    `runuser -u ${contract.user} -- bash -c ${shq(session.join("\n"))}`,
    `tar -C /cap -cf - . | base64`,
  );
  return lines.join("\n");
}

function shq(s: string): string { return `'${s.replace(/'/g, `'\\''`)}'`; }

function captureLinux(e: Entry): Record<string, unknown> {
  const script = runnerScript(e);
  const out = sh("docker", [
    "run", "--rm", "-i", "-u", "root",
    "--hostname", contract.hostname,
    "-v", `${join(HERE, "seeds", e.seed ?? "")}:/seed:ro`,
    "-e", `COLUMNS=${contract.cols}`,
    IMAGE_TAG, "bash", "-s",
  ], { input: script });

  // Untar the base64'd /cap directory locally.
  const tmp = join(CAPTURED, `.tmp-${e.id}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync("bash", ["-c", `echo ${shq(out.trim())} | base64 -d | tar -C ${shq(tmp)} -xf -`]);
  const read = (f: string) => { try { return readFileSync(join(tmp, f), "utf8"); } catch { return null; } };

  const fixture: Record<string, unknown> = {
    id: e.id, module: e.module, source: e.source, match: e.match,
    seed: e.seed ?? null, cwd: e.cwd, pre: e.pre ?? [], cmd: e.cmd,
    tty_equiv: e.tty_equiv ?? null, citation: e.citation ?? null, notes: e.notes ?? null,
    stdout: read("out.txt"), stderr: read("err.txt"), exit: Number(read("code.txt")),
    // Interactive bash omits the script-mode "line N:" prefix in error messages.
    // Declared transformation (ISC-72 justification): verified empirically 2026-06-12 on this
    // image — `printf 'frobnicate\n' | bash -i` → "bash: frobnicate: command not found".
    stderr_interactive: read("err.txt")?.replace(/^bash: line \d+: /gm, "bash: ") ?? null,
    post: (e.post ?? []).map((p, i) => ({
      cmd: p, stdout: read(`post${i}.out.txt`), stderr: read(`post${i}.err.txt`), exit: Number(read(`post${i}.code.txt`)),
    })),
    provenance: {
      contract: source,
      image: IMAGE_TAG,
      base_digest: contract.base_digest,
      dockerfile: contract.dockerfile,
      arch: sh("docker", ["version", "--format", "{{.Server.Arch}}"]).trim(),
      epoch: MANIFEST.meta.epoch,
      captured_at: new Date().toISOString(),
      captured_with: "capture.ts v1",
    },
  };
  rmSync(tmp, { recursive: true, force: true });
  return fixture;
}

function captureMacos(e: Entry): Record<string, unknown> {
  const full = [...(e.pre ?? []), e.cmd].join(" && ");
  let stdout = "", stderr = "", exit = 0;
  try {
    stdout = sh("bash", [join(HERE, "env/macos-contract.sh"), e.cwd, full]);
  } catch (err: any) {
    stdout = err.stdout?.toString() ?? ""; stderr = err.stderr?.toString() ?? ""; exit = err.status ?? 1;
  }
  return {
    id: e.id, module: e.module, source: e.source, match: e.match, cwd: e.cwd,
    pre: e.pre ?? [], cmd: e.cmd, citation: e.citation ?? null,
    notes: e.notes ?? null, holes: (e as { holes?: unknown }).holes ?? null,
    stdout, stderr, exit,
    // Interactive zsh omits the `-c`-context ":1" position marker in error messages.
    // Declared transformation (ISC-72 justification): verified 2026-06-12 on this host —
    // typing an unmatched glob interactively yields "zsh: no matches found: …".
    stderr_interactive: stderr.replace(/^zsh:\d+: /gm, "zsh: "),
    provenance: {
      contract: source,
      sw_vers: sh("sw_vers", []).trim(),
      epoch: MANIFEST.meta.epoch,
      captured_at: new Date().toISOString(),
      captured_with: "capture.ts v1",
    },
  };
}

// ---------------------------------------------------------------------------
// booted mode (docker-linux-booted; module 02 family — systemd as PID 1)
// ---------------------------------------------------------------------------

/**
 * Scrub volatile spans out of captured streams per the entry's declared holes
 * (`find` regex → `{{name}}` marker). Applied to structured entries only; the
 * fidelity suite re-expands markers using each hole's `pattern`.
 */
function scrub(text: string | null, holes: Hole[] | undefined): string | null {
  if (text === null || !holes) return text;
  let out = text;
  for (const h of holes) {
    if (!h.find) continue;
    out = out.replace(new RegExp(h.find, "gm"), `{{${h.name}}}`);
  }
  return out;
}

function captureBooted(e: Entry): Record<string, unknown> {
  const seedDef = e.seed ? MANIFEST.seeds[e.seed] : null;
  const user = e.user ?? contract.user;
  // unique name per invocation: --check boots the same entry twice back-to-back, and
  // docker's async teardown makes name reuse racy (observed: second boot briefly saw a
  // half-initialized world)
  const cname = `grcb-cap-${e.id}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return captureBootedInner(e, seedDef, user, cname);
}

function captureBootedInner(e: Entry, seedDef: { apply?: string } | null, user: string, cname: string): Record<string, unknown> {
  const runArgs = [
    "run", "-d", "--name", cname, ...contract.run_flags.split(" "),
    "--hostname", contract.hostname,
  ];
  if (e.seed) runArgs.push("-v", `${join(HERE, "seeds", e.seed)}:/seed:ro`);
  runArgs.push(IMAGE_TAG);
  sh("docker", runArgs);
  try {
    // wait for systemd to settle (exits 0 on "running")
    sh("docker", ["exec", cname, "systemctl", "is-system-running", "--wait"]);
    if (e.seed) {
      // the bind mount must be live before the overlay runs (Docker Desktop mounts can
      // lag a fresh boot); failure here must be loud, never a silently-unseeded capture
      sh("docker", ["exec", cname, "bash", "-c",
        "for i in $(seq 1 50); do [ -f /seed/apply-seed.sh ] && exit 0; sleep 0.1; done; echo 'seed mount never appeared' >&2; exit 1"]);
    }

    // root phase: seed overlay (sanity-checked), then entry-specific root setup
    if (seedDef?.apply) {
      sh("docker", ["exec", cname, "bash", "-c", "bash /seed/apply-seed.sh"]);
      // sanity: the overlay's effects must be visible before the session runs — two
      // --privileged --cgroupns=host systemd containers in rapid succession can interfere
      // during teardown, and a half-built world must fail loudly, never capture silently.
      // Runs BEFORE pre_root: entry-specific root setup may legitimately mutate the seeded
      // world (e.g. the hardening entries append directives to the 3243-byte sshd_config).
      sh("docker", ["exec", cname, "bash", "-c",
        "[ -f /home/grcops/.ssh/id_ed25519 ] && [ \"$(stat -c %s /etc/ssh/sshd_config)\" = 3243 ] || { echo 'seed overlay not in effect' >&2; exit 1; }"]);
    }
    for (const step of e.pre_root ?? []) sh("docker", ["exec", cname, "bash", "-c", step]);

    // learner session (same shape as the userland runner: streams + exit codes split)
    const session: string[] = [`cd ${shq(e.cwd)} || exit 99`];
    for (const p of e.pre ?? []) session.push(`{ ${p}; } > /dev/null 2>&1`);
    session.push(
      `{ ${e.cmd}; } > /cap/out.txt 2> /cap/err.txt; __rc=$?; echo -n $__rc > /cap/code.txt; (exit $__rc)`,
    );
    (e.post ?? []).forEach((p, i) => {
      session.push(
        `{ ${p}; } > /cap/post${i}.out.txt 2> /cap/post${i}.err.txt; __rc=$?; echo -n $__rc > /cap/post${i}.code.txt; (exit $__rc)`,
      );
    });
    const script = [
      "#!/bin/bash", "set -u",
      `mkdir -p /cap && chown ${user} /cap`,
      // stdin closed: ssh/cat in pre/cmd must not slurp the rest of this harness script
      `runuser -u ${user} -- bash -c ${shq(session.join("\n"))} < /dev/null`,
      `tar -C /cap -cf - . | base64`,
    ].join("\n");
    const out = sh("docker", ["exec", "-i", "-e", `COLUMNS=${contract.cols}`, cname, "bash", "-s"], { input: script });

    const tmp = join(CAPTURED, `.tmp-${e.id}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    execFileSync("bash", ["-c", `echo ${shq(out.trim())} | base64 -d | tar -C ${shq(tmp)} -xf -`]);
    const read = (f: string) => { try { return readFileSync(join(tmp, f), "utf8"); } catch { return null; } };

    const fixture: Record<string, unknown> = {
      id: e.id, module: e.module, source: e.source, match: e.match,
      seed: e.seed ?? null, cwd: e.cwd, user, pre_root: e.pre_root ?? [], pre: e.pre ?? [], cmd: e.cmd,
      sim_equiv: e.sim_equiv ?? null, pipe_context: e.pipe_context ?? false,
      citation: e.citation ?? null, notes: e.notes ?? null,
      holes: e.holes ?? null, post_holes: e.post_holes ?? null,
      stdout: scrub(read("out.txt"), e.holes), stderr: scrub(read("err.txt"), e.holes), exit: Number(read("code.txt")),
      // Interactive bash omits the script-mode "line N:" prefix (same justification as userland).
      stderr_interactive: scrub(read("err.txt")?.replace(/^bash: line \d+: /gm, "bash: ") ?? null, e.holes),
      post: (e.post ?? []).map((p, i) => ({
        cmd: p,
        stdout: scrub(read(`post${i}.out.txt`), e.post_holes ?? e.holes),
        stderr: scrub(read(`post${i}.err.txt`), e.post_holes ?? e.holes),
        exit: Number(read(`post${i}.code.txt`)),
      })),
      provenance: {
        contract: source,
        image: IMAGE_TAG,
        base_digest: contract.base_digest,
        dockerfile: contract.dockerfile,
        arch: sh("docker", ["version", "--format", "{{.Server.Arch}}"]).trim(),
        epoch: MANIFEST.seeds[e.seed ?? ""]?.epoch ?? MANIFEST.meta.epoch,
        captured_at: new Date().toISOString(),
        captured_with: "capture.ts v1 (booted)",
        scrubbed: (e.holes ?? []).map((h) => h.name),
      },
    };
    rmSync(tmp, { recursive: true, force: true });
    return fixture;
  } finally {
    try { sh("docker", ["rm", "-f", cname]); } catch { /* already gone */ }
  }
}

if (source.startsWith("docker")) buildImage();

let failures = 0;
for (const e of entries) {
  const cap = source === "macos-host" ? captureMacos(e) : source === "docker-linux-booted" ? captureBooted(e) : captureLinux(e);
  if (selfCheck) {
    // booted containers share the host cgroup namespace — let the first one's teardown
    // settle before booting its twin (interference corrupts the second world)
    if (source === "docker-linux-booted") execFileSync("sleep", ["3"]);
    const cap2 = source === "macos-host" ? captureMacos(e) : source === "docker-linux-booted" ? captureBooted(e) : captureLinux(e);
    const a = JSON.stringify({ o: cap.stdout, e: cap.stderr, c: cap.exit, p: cap.post });
    const b = JSON.stringify({ o: cap2.stdout, e: cap2.stderr, c: cap2.exit, p: cap2.post });
    if (a !== b) {
      console.error(`SELF-DIFF ${e.id}: capture is non-deterministic — needs match:structured with declared holes`);
      console.error(`  run1: ${a.slice(0, 400)}`);
      console.error(`  run2: ${b.slice(0, 400)}`);
      failures++;
      continue;
    }
  }
  const file = join(CAPTURED, `${e.id}.json`);
  writeFileSync(file, JSON.stringify(cap, null, 2) + "\n");
  console.log(`captured ${e.id} → exit ${cap.exit}${selfCheck ? " (deterministic ✓)" : ""}`);
}

if (failures > 0) { console.error(`${failures} non-deterministic entries`); process.exit(1); }
console.log(`done: ${entries.length} fixtures in ${CAPTURED}`);
