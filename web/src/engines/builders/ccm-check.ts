/**
 * Module 13 — `ccm-check.sh` library ported from
 * modules/13-continuous-controls-monitoring/labs/setup.sh (heredoc) — web ISA ISC-85/137.
 *
 * CONTROL: CC6.1-s3-public-access-block.
 * Three functions, same output contract as the bash library:
 *   normalizeBuckets  — one TAB-separated row per bucket (name + four flags as "true"/"false");
 *                       ports the library's `bun` branch (a real JSON parser), which is the
 *                       branch the capture host executed. Unparseable input → zero rows, which
 *                       drives the fail-closed path exactly as bash command substitution does.
 *   evaluateControl   — PASS/FAIL/ERROR verdict lines; exit 0 pass / 1 drift / 2 fail-closed.
 *   emitEvidence      — immutable run-<ts>.evidence record + append-only ledger.log row +
 *                       alert-<run>.txt ONLY on non-zero rc, mutating a SimFs.
 *
 * Byte-accepted against builder-captures.json m13 (real bash runs of the generated library).
 */
import type { SimFs } from "./sim-fs";
import type { ValidatorRun } from "./types";
import { Io, posixBasename } from "./types";

export const CCM_CONTROL_ID = "CC6.1-s3-public-access-block";

/**
 * normalize_buckets <state-json>: flatten the snapshot to one line per bucket —
 * "<name>\t<block_public_acls>\t<block_public_policy>\t<ignore_public_acls>\t<restrict_public_buckets>".
 * Mirrors the library's bun parser: works on pretty-printed AND compact JSON identically.
 */
export function normalizeBuckets(stateJson: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(stateJson);
  } catch {
    // bash: bun exits non-zero, the command substitution yields "" → fail-closed downstream.
    return "";
  }
  const buckets = Array.isArray((doc as { buckets?: unknown })?.buckets)
    ? ((doc as { buckets: unknown[] }).buckets)
    : [];
  const flag = (b: Record<string, unknown>, k: string) => (b[k] === true ? "true" : "false");
  let out = "";
  for (const raw of buckets) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name : "";
    out += [
      name,
      flag(b, "block_public_acls"),
      flag(b, "block_public_policy"),
      flag(b, "ignore_public_acls"),
      flag(b, "restrict_public_buckets"),
    ].join("\t") + "\n";
  }
  return out;
}

/**
 * evaluate_control <state-json> → verdict on stdout, fail-closed complaint on stderr.
 * Returns 0 (pass) / 1 (fail/drift) / 2 (zero resources — REFUSES to pass).
 */
export function evaluateControl(stateJson: string): ValidatorRun {
  const io = new Io();
  // rows="$(normalize_buckets …)" — command substitution strips the trailing newline.
  const rows = normalizeBuckets(stateJson).replace(/\n$/, "");
  // total="$(printf '%s' "$rows" | grep -c . || true)" — lines containing ≥1 character.
  const rowLines = rows.split("\n").filter((l) => l.length > 0);
  const total = rowLines.length;

  // Refuse to pass on an empty evaluation — fail closed.
  if (total === 0) {
    io.error(
      `ERROR control=${CCM_CONTROL_ID} evaluated=0 — refusing to pass: zero resources evaluated (empty, unparsed, or wrong-shape snapshot)`,
    );
    io.log(`FAIL control=${CCM_CONTROL_ID} evaluated=0 noncompliant=0 reason=no-resources-evaluated`);
    return io.result(2);
  }

  // A row is NONCOMPLIANT unless every one of its four flags is exactly "true".
  const noncompliant = rowLines
    .map((l) => l.split("\t"))
    .filter((f) => f.length >= 5 && !(f[1] === "true" && f[2] === "true" && f[3] === "true" && f[4] === "true"))
    .map((f) => f[0]);

  if (noncompliant.length === 0) {
    io.log(`PASS control=${CCM_CONTROL_ID} evaluated=${total} noncompliant=0`);
    return io.result(0);
  }
  io.log(`FAIL control=${CCM_CONTROL_ID} evaluated=${total} noncompliant=${noncompliant.length}`);
  // printf 'NONCOMPLIANT %s\n' $noncompliant — one line per (whitespace-free) bucket name.
  for (const name of noncompliant) io.log(`NONCOMPLIANT ${name}`);
  return io.result(1);
}

export interface EmitResult {
  /** The check's exit code (0 pass / 1 drift / 2 fail-closed) — emit_evidence's return value. */
  exit: number;
  /** stderr passed through from evaluate_control (the fail-closed ERROR line). */
  stderr: string;
  runId: string;
  capturedAt: string;
  recordPath: string;
  alertPath: string | null;
}

/**
 * emit_evidence <state-json-file> <evidence-dir>: run the check, write the per-run evidence
 * record, append the ledger row, and fire an alert ONLY on drift/fail-closed. All file
 * mutations land in the provided SimFs exactly as the bash library leaves them on disk.
 *
 * `now` supplies the wall-clock fallback (`date -u +%Y-%m-%dT%H:%M:%SZ`) used only when the
 * snapshot carries no captured_at — injected so the sim clock (ISC-132) drives it.
 */
export function emitEvidence(
  fs: SimFs,
  statePath: string,
  evdir: string,
  now: () => string = () => new Date().toISOString().slice(0, 19) + "Z",
): EmitResult {
  fs.mkdirp(evdir);
  const state = fs.read(statePath) ?? "";

  // captured="$(awk -F'"' '/"captured_at"/{print $4; exit}' "$state")"
  let captured = "";
  for (const line of state.split("\n")) {
    if (line.includes('"captured_at"')) {
      captured = line.split('"')[3] ?? "";
      break;
    }
  }
  if (captured === "") captured = now();

  const runId = "run-" + captured.replace(/[^0-9]/g, ""); // tr -cd '0-9'
  const recordPath = `${evdir}/${runId}.evidence`;

  const evalRun = evaluateControl(state);
  const rc = evalRun.exit;
  // full="$(evaluate_control …)" strips the trailing newline; verdict_line = head -1.
  const full = evalRun.stdout.replace(/\n$/, "");
  const verdictLine = full.split("\n")[0] ?? "";

  // Immutable per-run evidence record — generated by the same code that did the evaluating.
  fs.write(
    recordPath,
    `control_id=${CCM_CONTROL_ID}\n` +
      `captured_at=${captured}\n` +
      `verdict=${verdictLine}\n` +
      `exit_code=${rc}\n` +
      `source_state=${posixBasename(statePath)}\n`,
  );

  // Append-only ledger: one row per run — the 30-day-history substrate a dashboard tile reads.
  fs.append(`${evdir}/ledger.log`, `${captured} ${runId} rc=${rc} ${verdictLine}\n`);

  // Alert fires ONLY on drift (non-zero exit); silence is the signal the control is holding.
  let alertPath: string | null = null;
  if (rc !== 0) {
    alertPath = `${evdir}/alert-${runId}.txt`;
    let alert = `ALERT control=${CCM_CONTROL_ID} captured_at=${captured}\n${verdictLine}\n`;
    if (rc === 2) {
      alert += "drifted_resource=<none — evaluated 0 resources; snapshot empty, unparsed, or wrong shape>\n";
    } else {
      for (const line of full.split("\n")) {
        if (/^NONCOMPLIANT /.test(line)) alert += `drifted_resource=${line.split(/\s+/)[1]}\n`;
      }
    }
    fs.write(alertPath, alert);
  }

  return { exit: rc, stderr: evalRun.stderr, runId, capturedAt: captured, recordPath, alertPath };
}
