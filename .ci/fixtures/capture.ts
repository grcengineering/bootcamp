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
import { parse } from "yaml";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(new URL(import.meta.url).pathname);
const MANIFEST = parse(readFileSync(join(HERE, "manifest.yaml"), "utf8"));
const CAPTURED = join(HERE, "captured");
mkdirSync(CAPTURED, { recursive: true });

type Entry = {
  id: string; module: string; source: string; match: string; seed?: string;
  cwd: string; pre?: string[]; cmd: string; post?: string[];
  tty_equiv?: string; citation?: string; notes?: string;
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
    stdout, stderr, exit,
    provenance: {
      contract: source,
      sw_vers: sh("sw_vers", []).trim(),
      epoch: MANIFEST.meta.epoch,
      captured_at: new Date().toISOString(),
      captured_with: "capture.ts v1",
    },
  };
}

if (source.startsWith("docker")) buildImage();

let failures = 0;
for (const e of entries) {
  const cap = source === "macos-host" ? captureMacos(e) : captureLinux(e);
  if (selfCheck) {
    const cap2 = source === "macos-host" ? captureMacos(e) : captureLinux(e);
    const a = JSON.stringify({ o: cap.stdout, e: cap.stderr, c: cap.exit, p: cap.post });
    const b = JSON.stringify({ o: cap2.stdout, e: cap2.stderr, c: cap2.exit, p: cap2.post });
    if (a !== b) {
      console.error(`SELF-DIFF ${e.id}: capture is non-deterministic — needs match:structured with declared holes`);
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
