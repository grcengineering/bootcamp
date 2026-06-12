/**
 * Module 08 — `gate.sh` ported from modules/08-iac-and-scanning-in-ci/labs/fixtures/gate.sh
 * (web ISA ISC-81/137). Reads a Checkov-shaped JSON scan result + a check→control map CSV,
 * applies a severity floor, maps every failed check to its control, decides PASS/FAIL, and
 * emits the auditor-readable evidence record on stdout. Exit 0 pass / 1 blocked / 2 usage.
 *
 * The JSON extraction is a STRUCTURAL TRANSCRIPTION of the original's awk scanner (bracket/
 * brace-depth walk with string-literal tracking) — not JSON.parse — so learner edits to the
 * scan fixture behave exactly as the bash gate would behave on them.
 *
 * Byte-accepted against builder-captures.json m08 (real bash runs, GATE_FAKE_TIME=ci).
 */
import type { ReadonlyFs, ValidatorRun } from "./types";
import { ExitSignal, runPort } from "./types";

function sevRank(s: string): number {
  switch (s) {
    case "CRITICAL": return 4;
    case "HIGH": return 3;
    case "MEDIUM": return 2;
    case "LOW": return 1;
    default: return 0;
  }
}

/** awk `field(s, key)`: first `"key"[ \t]*:[ \t]*"…"` match in the object buffer. */
function field(s: string, key: string): string {
  const m = s.match(new RegExp(`"${key}"[ \\t]*:[ \\t]*"[^"]*"`));
  if (!m) return "";
  return m[0].replace(/^.*:[ \t]*"/, "").replace(/"$/, "");
}

export interface FailedCheck {
  check_id: string;
  severity: string;
  check_name: string;
}

/**
 * `extract_failed` — char-by-char transcription of the original awk program: arm on the
 * line naming "failed_checks", track [ ] depth (string-aware), collect each top-level { }
 * object of that array, emit check_id/severity/check_name per object.
 */
export function extractFailed(resultJson: string): FailedCheck[] {
  const out: FailedCheck[] = [];
  let instr = false;
  let arm = 0;
  let depth = 0;
  let arraydepth = 0;
  let objbuf = "";
  let collecting = false;
  let objlevel = 0;

  for (const line of resultJson.split("\n")) {
    if (/"failed_checks"[ \t]*:/.test(line)) arm = 1;
    const n = line.length;
    for (let i = 0; i < n; i++) {
      const c = line[i];
      const prev = i > 0 ? line[i - 1] : "";
      if (c === '"' && prev !== "\\") instr = !instr;
      if (collecting) objbuf += c;
      if (instr) continue;
      if (c === "[") {
        depth++;
        if (arm === 1) {
          arraydepth = depth;
          arm = 0;
        }
      } else if (c === "]") {
        if (arraydepth && depth === arraydepth) arraydepth = 0;
        depth--;
      } else if (c === "{") {
        if (arraydepth && depth === arraydepth && !collecting) {
          collecting = true;
          objbuf = "{";
          objlevel = 0;
        }
        if (collecting) objlevel++;
      } else if (c === "}") {
        if (collecting) {
          objlevel--;
          if (objlevel === 0) {
            const cid = field(objbuf, "check_id");
            let sev = field(objbuf, "severity");
            let nm = field(objbuf, "check_name");
            if (cid !== "") {
              if (sev === "") sev = "UNKNOWN";
              if (nm === "") nm = "unknown";
              out.push({ check_id: cid, severity: sev, check_name: nm });
            }
            collecting = false;
            objbuf = "";
          }
        }
      }
    }
    if (collecting) objbuf += "\n";
  }
  return out;
}

/** `map_control` — naive `-F,` lookup; first matching row wins; UNMAPPED fallback. */
export function mapControl(controlMapCsv: string, want: string): { id: string; title: string } {
  const lines = controlMapCsv.split("\n");
  for (let nr = 1; nr < lines.length; nr++) {
    const f = lines[nr].split(",");
    if (f[0] === want) return { id: f[1] ?? "", title: f[2] ?? "" };
  }
  return { id: "UNMAPPED", title: "unmapped check (no control owner)" };
}

export interface GateOptions {
  /** GATE_FAKE_TIME — the env-pinned timestamp the lab + CI set ("ci"). */
  fakeTime?: string;
  /** Wall clock fallback when GATE_FAKE_TIME is unset (sim clock, ISO seconds). */
  now?: () => string;
}

/**
 * gate.sh <checkov-result.json> <control-map.csv> [severity-floor]
 * argv mirrors the script's positional parameters; file content comes from `fs`.
 */
export function runGate(argv: string[], fs: ReadonlyFs, opts: GateOptions = {}): ValidatorRun {
  return runPort((io) => {
    const RESULT = argv[0] ?? "";
    const CONTROL_MAP = argv[1] ?? "";
    const FLOOR = argv[2] ?? "HIGH";

    if (RESULT === "" || CONTROL_MAP === "") {
      io.error("usage: gate.sh <checkov-result.json> <control-map.csv> [severity-floor]");
      throw new ExitSignal(2);
    }
    if (!fs.exists(RESULT)) {
      io.error(`ERROR: scan result not found: ${RESULT}`);
      throw new ExitSignal(2);
    }
    if (!fs.exists(CONTROL_MAP)) {
      io.error(`ERROR: control map not found: ${CONTROL_MAP}`);
      throw new ExitSignal(2);
    }

    const FLOOR_RANK = sevRank(FLOOR);
    if (!(FLOOR_RANK > 0)) {
      io.error(`ERROR: unknown severity floor: ${FLOOR}`);
      throw new ExitSignal(2);
    }

    const resultJson = fs.read(RESULT) ?? "";
    const mapCsv = fs.read(CONTROL_MAP) ?? "";

    io.log("=== GRC IaC Gate — evidence record ===");
    io.log(`scan_result: ${RESULT}`);
    io.log(`control_map: ${CONTROL_MAP}`);
    io.log(`severity_floor: ${FLOOR}`);
    io.log(`evaluated_at: ${opts.fakeTime ?? (opts.now ? opts.now() : isoNow())}`);
    io.log("---");

    let BLOCKING = 0;
    let EVALUATED = 0;
    for (const { check_id: cid, severity: sev, check_name: name } of extractFailed(resultJson)) {
      if (cid === "") continue;
      EVALUATED++;
      const rank = sevRank(sev);
      const { id: controlId, title: controlTitle } = mapControl(mapCsv, cid);
      let verdict: string;
      if (rank >= FLOOR_RANK) {
        verdict = "BLOCK";
        BLOCKING++;
      } else {
        verdict = "below-floor (not blocking)";
      }
      io.log(`FAILED  ${cid}  [${sev}]  -> ${controlId} (${controlTitle})  : ${verdict}`);
      io.log(`        ${name}`);
    }

    io.log("---");
    io.log(`failed_checks_evaluated: ${EVALUATED}`);
    io.log(`blocking_at_or_above_${FLOOR}: ${BLOCKING}`);

    if (BLOCKING > 0) {
      io.log(`GATE_DECISION: FAIL  (build blocked — ${BLOCKING} control(s) violated at/above ${FLOOR})`);
      throw new ExitSignal(1);
    }
    io.log(`GATE_DECISION: PASS  (no violations at/above ${FLOOR} — build proceeds, evidence emitted)`);
    throw new ExitSignal(0);
  });
}

/** `date -u +%Y-%m-%dT%H:%M:%SZ` */
function isoNow(): string {
  return new Date().toISOString().slice(0, 19) + "Z";
}
