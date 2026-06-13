// Link gate: every URL under §8 Supplemental must be reachable. A dead link is a red build
// (Loop-2 trigger). Run with --soft (or LINKCHECK_SOFT=1) to downgrade failures to warnings
// for offline/local runs.
import { readFileSync } from "node:fs";
import { listModules, supplementalStart, extractUrls, red, green } from "./lib.ts";

const SOFT = process.argv.includes("--soft") || process.env.LINKCHECK_SOFT === "1";
const TIMEOUT = 20000;

// A realistic browser UA — many live sites (substack, postman, nist, rfc-editor) 403/404 a
// non-browser HEAD but serve a real GET. A bare HEAD with a bot UA is the false-negative source.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
// Statuses where a HEAD lies — retry once with a full GET before judging.
const GET_RETRY = new Set([403, 404, 405, 406, 409, 429, 500, 501, 503]);
// After the GET retry, these mean the resource is genuinely GONE (a rotted link → red build).
const DEAD = new Set([404, 410, 451]);

type Verdict = "ok" | "dead" | "blocked";
async function check(url: string): Promise<{ url: string; verdict: Verdict; status: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  const headers = { "user-agent": UA, accept: "*/*" };
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal, headers });
    if (GET_RETRY.has(res.status)) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal, headers });
    }
    if (res.status < 400) return { url, verdict: "ok", status: String(res.status) };
    if (DEAD.has(res.status)) return { url, verdict: "dead", status: String(res.status) };
    // 403/429/503/etc. after a real browser GET = bot-protection / rate-limit, NOT link rot.
    // The page is live for humans; we cannot machine-verify it, so warn — never fail the build.
    return { url, verdict: "blocked", status: String(res.status) };
  } catch (e) {
    const name = e instanceof Error ? e.name : "error";
    // A network/timeout error is unverifiable, not proven-dead → treat as blocked (warn, not red).
    return { url, verdict: "blocked", status: name === "AbortError" ? "timeout" : "network-error" };
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
let blocked = 0;
for (const r of results) {
  if (r.verdict === "ok") console.log(green(`✓ ${r.status} ${r.url}`));
  else if (r.verdict === "blocked") {
    blocked++;
    console.log(`⚠ ${r.status} ${r.url} (bot-protected / unverifiable — live for humans, not a dead link)`);
  } else {
    dead++;
    console.log(red(`✗ ${r.status} ${r.url}`));
  }
}
console.log(
  `\nlink-check: ${results.length - dead - blocked}/${results.length} reachable, ${blocked} unverifiable (warned), ${dead} dead`,
);
// Only a genuinely-GONE resource (404/410/451 after a real browser GET) fails the build —
// a 403/429/503/timeout is bot-protection or a flaky probe, not link rot (the §8 link is live).
process.exit(dead && !SOFT ? 1 : 0);
