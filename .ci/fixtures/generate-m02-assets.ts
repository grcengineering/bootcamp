#!/usr/bin/env bun
/**
 * Generates web/src/engines/linuxadmin/generated/m02-assets.ts from the committed
 * booted captures + env assets, so every replayed byte in the module-02 simulation
 * carries provenance back to a captured fixture (never hand-typed into engine code).
 *
 * Re-run after recapturing: bun .ci/fixtures/generate-m02-assets.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const CAPTURED = join(HERE, "captured");
const OUT = join(HERE, "../../web/src/engines/linuxadmin/generated/m02-assets.ts");

const fx = (id: string) => JSON.parse(readFileSync(join(CAPTURED, `${id}.json`), "utf8"));
const lit = (s: string) => JSON.stringify(s);

// sudo's stderr prompt prefix appears in -S captures; strip it where the constant is the
// wrapped command's own stream (the sim's sudo layer emits the prompt itself).
function stripSudoPrompt(s: string, user = "grcops"): string {
  const p = `[sudo] password for ${user}: `;
  return s.startsWith(p) ? s.slice(p.length) : s;
}

const aptInstall = fx("m02-apt-install-deb");
const aptReinstall = fx("m02-apt-reinstall");
const aptNotfound = fx("m02-apt-install-notfound");
const aptNonroot = fx("m02-apt-nonroot");
const sudoUsage = fx("m02-sudo-usage");
const passwdMismatch = fx("m02-passwd-mismatch");

// apt stderr decomposition: "\nWARNING…\n\n" then per-scenario tail (debconf / E: line)
const APT_WARNING = "\nWARNING: apt does not have a stable CLI interface. Use with caution in scripts.\n\n";
const aptInstallErr = stripSudoPrompt(aptInstall.stderr);
const aptNotfoundErr = stripSudoPrompt(aptNotfound.stderr);
if (!aptInstallErr.startsWith(APT_WARNING) || !aptNotfoundErr.startsWith(APT_WARNING)) {
  throw new Error("apt stderr shape changed — re-derive APT_WARNING");
}

const banner = `/**
 * GENERATED — do not edit. Source: .ci/fixtures/generate-m02-assets.ts over the committed
 * docker-linux-booted captures (.ci/fixtures/captured/m02-*.json) and env assets.
 * Every constant here is replayed reality; provenance is the named fixture id.
 */
`;

const out = `${banner}
/** m02-apt-install-deb (stdout, byte-exact incl. dpkg \\r progress segments) */
export const APT_INSTALL_STDOUT = ${lit(aptInstall.stdout)};
/** m02-apt-install-deb (stderr after the sudo prompt: WARNING + debconf notice) */
export const APT_INSTALL_STDERR = ${lit(aptInstallErr)};
/** m02-apt-reinstall (stdout) */
export const APT_REINSTALL_STDOUT = ${lit(aptReinstall.stdout)};
/** m02-apt-install-notfound (stdout) */
export const APT_NOTFOUND_STDOUT = ${lit(aptNotfound.stdout)};
/** shared apt stderr preamble when output is not a tty (m02-apt-* captures) */
export const APT_WARNING = ${lit(APT_WARNING)};
/** m02-apt-install-notfound (stderr tail after WARNING — %s = package name) */
export const APT_NOTFOUND_E_LINE = ${lit(aptNotfoundErr.slice(APT_WARNING.length))};
/** m02-apt-nonroot (stderr, byte-exact) */
export const APT_NONROOT_STDERR = ${lit(aptNonroot.stderr)};
/** m02-sudo-usage (stderr, byte-exact) */
export const SUDO_USAGE = ${lit(sudoUsage.stderr)};
/** m02-passwd-mismatch (stderr after the sudo prompt; exit ${passwdMismatch.exit}) */
export const PASSWD_MISMATCH_STDERR = ${lit(stripSudoPrompt(passwdMismatch.stderr))};
export const PASSWD_MISMATCH_EXIT = ${passwdMismatch.exit};

/** env/evidence-collector.service — the unit bytes the scenario .deb installs */
export const EC_UNIT_FILE = ${lit(readFileSync(join(HERE, "env/evidence-collector.service"), "utf8"))};
/** env/evidence-collector — the daemon script bytes the scenario .deb installs */
export const EC_SCRIPT = ${lit(readFileSync(join(HERE, "env/evidence-collector"), "utf8"))};
`;

writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${out.length} bytes)`);
