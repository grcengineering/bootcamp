// Link gate: every URL under §8 Supplemental must be reachable. A dead link is a red build
// (Loop-2 trigger). Run with --soft (or LINKCHECK_SOFT=1) to downgrade failures to warnings
// for offline/local runs.
import { readFileSync } from "node:fs";
import { listModules, supplementalStart, extractUrls, red, green } from "./lib.ts";

const SOFT = process.argv.includes("--soft") || process.env.LINKCHECK_SOFT === "1";
const TIMEOUT = 10000;

async function check(url: string): Promise<{ url: string; ok: boolean; status: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  const headers = { "user-agent": "grc-bootcamp-linkcheck/1.0" };
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal, headers });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal, headers });
    }
    return { url, ok: res.status < 400, status: String(res.status) };
  } catch (e) {
    const name = e instanceof Error ? e.name : "error";
    return { url, ok: false, status: name === "AbortError" ? "timeout" : "network-error" };
  } finally {
    clearTimeout(t);
  }
}

const mods = listModules();
const urls = new Set<string>();
for (const mod of mods) {
  const md = readFileSync(mod.moduleMd, "utf8");
  const idx = supplementalStart(md);
  if (idx < 0) continue;
  for (const u of extractUrls(md.slice(idx))) urls.add(u);
}

if (urls.size === 0) {
  console.log("link-check: no supplemental URLs found");
  process.exit(0);
}

console.log(`link-check: probing ${urls.size} supplemental URL(s)${SOFT ? " (soft mode)" : ""}…`);
const results = await Promise.all([...urls].map(check));
let dead = 0;
for (const r of results) {
  if (r.ok) console.log(green(`✓ ${r.status} ${r.url}`));
  else {
    dead++;
    console.log(red(`✗ ${r.status} ${r.url}`));
  }
}
console.log(`\nlink-check: ${results.length - dead}/${results.length} reachable`);
process.exit(dead && !SOFT ? 1 : 0);
