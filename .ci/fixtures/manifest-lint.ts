#!/usr/bin/env bun
/**
 * Fidelity-manifest lint (root ISA ISC-53/54/57/60/72; RedTeam findings 2/3).
 *
 *  1. taxonomy — every entry has a valid source + match class
 *  2. booted-family gate — systemd-family commands may NOT claim userland provenance
 *  3. capture coverage — every docker/macos entry has a captured fixture with provenance
 *  4. citations — every authored/pwsh-authored fixture carries a citation
 *  5. structured-class discipline — structured entries declare holes, each naming its
 *     entropy source; byte-exact fixtures contain no undeclared template markers
 *  6. loosening tripwire — fixtures carrying normalizations/justifications are listed
 *     loudly (visibility, not prohibition)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "./load-manifest";

const HERE = join(import.meta.dir);
// manifest.yaml PLUS every manifest.d/*.yaml fragment (Wave-4 fan-out): each module agent owns
// its own fragment; the loader merges them and throws loudly on a duplicate id / seed collision.
const manifest = loadManifest(HERE);

const SOURCES = new Set(["docker-linux-userland", "docker-linux-booted", "macos-host", "pwsh-authored", "wasm-engine", "authored"]);
const MATCHES = new Set(["byte-exact", "structured", "engine-pinned", "synthesized-porcelain", "authored-with-citation", "computed"]);
const BOOTED_FAMILY = /^(systemctl|journalctl|service|loginctl|hostnamectl|timedatectl)\b|(^|\s)(ssh|sshd|useradd|usermod|userdel|passwd|sudo|apt|apt-get|dnf|yum)\b/;

let problems = 0;
const warn: string[] = [];

for (const e of manifest.entries ?? []) {
  const where = `entry ${e.id}`;
  if (!SOURCES.has(e.source)) { console.log(`FAIL ${where}: unknown source '${e.source}'`); problems++; }
  if (!MATCHES.has(e.match)) { console.log(`FAIL ${where}: unknown match class '${e.match}'`); problems++; }

  const cmdLine = [e.cmd, ...(e.pre ?? [])].join(" && ");
  if (e.source === "docker-linux-userland" && BOOTED_FAMILY.test(cmdLine)) {
    console.log(`FAIL ${where}: systemd/admin-family command claims userland provenance — use docker-linux-booted (ISC-54)`);
    problems++;
  }

  if (e.match === "structured" && !(Array.isArray(e.holes) && e.holes.length > 0 && e.holes.every((h: { name?: string; pattern?: string; source?: string }) => h.name && h.pattern && h.source))) {
    console.log(`FAIL ${where}: structured match requires holes[] each with name+pattern+source (entropy source named) (ISC-56)`);
    problems++;
  }

  const capturable = e.source.startsWith("docker-") || e.source === "macos-host";
  const fixturePath = join(HERE, "captured", `${e.id}.json`);
  if (capturable) {
    if (!existsSync(fixturePath)) { console.log(`FAIL ${where}: no captured fixture (run capture) (ISC-59)`); problems++; continue; }
    const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
    if (!fx.provenance?.captured_with) { console.log(`FAIL ${where}: fixture lacks capture provenance (ISC-60)`); problems++; }
    if (e.match === "byte-exact" && /\{\{[a-z_]+\}\}/.test(fx.stdout ?? "")) {
      console.log(`FAIL ${where}: byte-exact fixture contains template markers — declare structured instead`); problems++;
    }
    if (fx.normalizations?.length) {
      for (const n of fx.normalizations) {
        if (!n.justification) { console.log(`FAIL ${where}: normalization '${n.rule}' lacks justification (ISC-72)`); problems++; }
        else warn.push(`${where}: normalization '${n.rule}' — ${n.justification.slice(0, 80)}…`);
      }
    }
  }
  if ((e.source === "pwsh-authored" || e.source === "authored") && !e.citation) {
    console.log(`FAIL ${where}: authored entry requires a citation (ISC-57)`); problems++;
  }
}

if (warn.length) {
  console.log(`\nDECLARED LOOSENINGS (${warn.length}) — review these deliberately:`);
  for (const w of warn) console.log(`  ${w}`);
}

const n = (manifest.entries ?? []).length;
console.log(`\nmanifest-lint: ${problems === 0 ? `${n}/${n} entries pass` : `${problems} problem(s) across ${n} entries`}`);
process.exit(problems ? 1 : 0);
