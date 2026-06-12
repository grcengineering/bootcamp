#!/usr/bin/env bun
/**
 * capture-git.ts — replay the module-05 reference git flow through REAL git and store
 * porcelain captures (web ISA ISC-66, match class: synthesized-porcelain).
 *
 * Ground truth: the local git binary (provenance records the exact version), driven with
 *   - pinned identity   analyst <analyst@workstation>
 *   - pinned dates      GIT_AUTHOR_DATE / GIT_COMMITTER_DATE per commit (UTC)
 *   - isolated config   GIT_CONFIG_GLOBAL/SYSTEM neutralized; init.defaultBranch=main
 *   - non-tty pipes     color/pager behavior identical to the sim surface
 * so commit SHAs are fully deterministic and MUST be reproduced by the isomorphic-git
 * engine (web/tests/engines-git.test.ts byte-diffs porcelain AND SHAs).
 *
 * Manifest entries use source: wasm-engine (the git engine owns these fixtures; the shell
 * fidelity suite skips them) — the provenance block records the real-git ground truth.
 *
 * Usage: bun .ci/fixtures/capture-git.ts
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COMMIT_1,
  COMMIT_2,
  GIT_IDENTITY,
  REFERENCE_FLOW,
  REPO_DIR,
} from "../../web/src/engines/git/referenceFlow";

const HERE = join(import.meta.dir);
const OUT = join(HERE, "captured");

const work = mkdtempSync(join(tmpdir(), "m05-git-"));
const repo = join(work, REPO_DIR);
mkdirSync(repo);

const baseEnv: Record<string, string> = {
  PATH: process.env.PATH ?? "",
  HOME: work,
  LC_ALL: "C",
  TZ: "UTC",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: GIT_IDENTITY.name,
  GIT_AUTHOR_EMAIL: GIT_IDENTITY.email,
  GIT_COMMITTER_NAME: GIT_IDENTITY.name,
  GIT_COMMITTER_EMAIL: GIT_IDENTITY.email,
};

function git(args: string[], dates?: { timestamp: number }) {
  const env = { ...baseEnv };
  if (dates) {
    env.GIT_AUTHOR_DATE = `${dates.timestamp} +0000`;
    env.GIT_COMMITTER_DATE = `${dates.timestamp} +0000`;
  }
  // -c init.defaultBranch=main pins the default branch to the module-prose canon ("main")
  // without a hint block; recorded in every capture's notes.
  const r = spawnSync("git", ["-c", "init.defaultBranch=main", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", exit: r.status ?? -1 };
}

const gitVersion = spawnSync("git", ["--version"], { encoding: "utf8" }).stdout.trim();

const commitDates: Record<string, { timestamp: number }> = {
  "commit-initial": COMMIT_1,
  "commit-feature": COMMIT_2,
};

const pre: string[] = [];
for (const step of REFERENCE_FLOW) {
  for (const [path, content] of Object.entries(step.writes ?? {})) {
    writeFileSync(join(repo, path), content);
  }
  const argv = step.cmd.replace(/^git /, "");
  // split respecting the double-quoted -m message
  const args = argv.match(/"[^"]*"|\S+/g)!.map((a) => a.replace(/^"|"$/g, ""));
  const got = git(args, commitDates[step.id]);

  const id = `m05-git-${step.id}`;
  const isInit = step.id === "init";
  const capture = {
    id,
    module: "05",
    source: "wasm-engine",
    match: "synthesized-porcelain",
    seed: null,
    cwd: `~/${REPO_DIR}`,
    pre: [...pre],
    cmd: step.cmd,
    tty_equiv: null,
    citation: null,
    notes:
      "REAL local-git capture (synthesized-porcelain ground truth for the isomorphic-git engine). " +
      "Pinned identity/dates make commit SHAs deterministic; init.defaultBranch=main pinned to module-prose canon.",
    ...(isInit
      ? {
          holes: [
            {
              name: "repo_path",
              pattern: "[^\\n]+",
              source: "capture temp dir — the sim renders its own VFS path",
            },
          ],
        }
      : {}),
    stdout: isInit ? got.stdout.replace(/in [^\n]+\n/, "in {{repo_path}}\n") : got.stdout,
    stderr: got.stderr,
    exit: got.exit,
    stderr_interactive: got.stderr,
    post: [],
    provenance: {
      contract: "local-real-git",
      ground_truth: gitVersion,
      platform: `${process.platform}-${process.arch}`,
      identity: `${GIT_IDENTITY.name} <${GIT_IDENTITY.email}>`,
      author_date_initial: `${COMMIT_1.timestamp} +0000`,
      author_date_feature: `${COMMIT_2.timestamp} +0000`,
      config_isolation: "GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_NOSYSTEM=1 LC_ALL=C TZ=UTC",
      default_branch_pin: "git -c init.defaultBranch=main",
      epoch: "2026-06-01T09:00:00Z",
      captured_at: new Date().toISOString(),
      captured_with: "capture-git.ts v1",
    },
  };
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(capture, null, 2) + "\n");
  console.log(`${id}: exit=${got.exit} stdout=${JSON.stringify(got.stdout.slice(0, 60))}`);
  pre.push(step.cmd);
}

rmSync(work, { recursive: true, force: true });
console.log(`\n${REFERENCE_FLOW.length} captures written to ${OUT} (git: ${gitVersion})`);
