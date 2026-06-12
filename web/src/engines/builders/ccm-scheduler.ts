/**
 * Module 13 CCM scheduler simulation (web ISA ISC-85/130/132) — scheduled checks over a
 * live state document, time-compression, drift injection, and the ledger-backed dashboard
 * tile (current verdict + 30-day history + alert state).
 *
 * HONESTY: every tick runs the REAL ported check library (ccm-check.ts — itself
 * byte-accepted against the bash original) against the CURRENT serialized state document.
 * The drift the learner injects is genuinely evaluated; nothing is scripted. Time is the
 * declared compression control: one tick advances the sim clock by `intervalHours`
 * (ISC-132 — module 13 uses a declared time-compression control, not a hidden frozen clock).
 */
import { CCM_CONTROL_ID, emitEvidence } from "./ccm-check";
import { SimFs } from "./sim-fs";

export interface BucketState {
  name: string;
  block_public_acls: boolean;
  block_public_policy: boolean;
  ignore_public_acls: boolean;
  restrict_public_buckets: boolean;
}

export interface CcmSchedulerOptions {
  /** Seed state document (a committed fixture's JSON text, e.g. state-compliant.json). */
  seedStateJson: string;
  /** ISO seconds epoch for the first scheduled run, e.g. "2026-05-20T09:00:00Z". */
  startIso: string;
  /** Sim hours per tick (the declared compression: default 24h — one run per dashboard day). */
  intervalHours?: number;
  /** Lab directory the evidence store lives under. */
  labDir?: string;
}

export interface TickResult {
  runId: string;
  capturedAt: string;
  rc: number;
  alertPath: string | null;
}

export interface LedgerEntry {
  capturedAt: string;
  runId: string;
  rc: number;
  verdict: string;
}

export interface DashboardTile {
  control: string;
  /** Verdict of the most recent run: rc 0 → PASS, 1 → FAIL, 2 → ERROR (fail-closed). */
  current: "PASS" | "FAIL" | "ERROR" | "NO-DATA";
  lastCheckedAt: string | null;
  /** Ledger rows inside the trailing window (oldest first) — the tile's trend strip. */
  history: LedgerEntry[];
  greenRuns: number;
  redRuns: number;
  /** Alert files currently in the evidence store (drift the responder must see). */
  openAlerts: string[];
  /** The declared time-compression label (honest sim boundary, ISC-132). */
  timeCompression: string;
}

const FLAGS: Array<keyof Omit<BucketState, "name">> = [
  "block_public_acls",
  "block_public_policy",
  "ignore_public_acls",
  "restrict_public_buckets",
];

function fmtIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19) + "Z";
}

export class CcmScheduler {
  readonly fs: SimFs;
  readonly evidenceDir: string;
  readonly intervalHours: number;
  private doc: { [k: string]: unknown; buckets: BucketState[] };
  private nextRunMs: number;
  private statePath: string;

  constructor(opts: CcmSchedulerOptions) {
    const parsed = JSON.parse(opts.seedStateJson) as { buckets?: BucketState[] };
    this.doc = { ...parsed, buckets: (parsed.buckets ?? []).map((b) => ({ ...b })) };
    this.nextRunMs = Date.parse(opts.startIso);
    if (Number.isNaN(this.nextRunMs)) throw new Error(`invalid startIso: ${opts.startIso}`);
    this.intervalHours = opts.intervalHours ?? 24;
    const labDir = opts.labDir ?? "ccm-lab";
    this.evidenceDir = `${labDir}/evidence`;
    this.statePath = `${labDir}/current-state.json`;
    this.fs = new SimFs();
    this.fs.mkdirp(this.evidenceDir);
  }

  buckets(): BucketState[] {
    return this.doc.buckets.map((b) => ({ ...b }));
  }

  /** Inject drift: flip the named bucket's public-access-block flags off (cloud-console sim). */
  injectDrift(bucketName: string, flags: Partial<Omit<BucketState, "name">> = {}): void {
    const b = this.doc.buckets.find((x) => x.name === bucketName);
    if (!b) throw new Error(`no such bucket: ${bucketName}`);
    if (Object.keys(flags).length === 0) {
      for (const f of FLAGS) b[f] = false;
    } else {
      Object.assign(b, flags);
    }
  }

  /** Remediate: restore all four flags on the named bucket (the fix that clears the alert). */
  remediate(bucketName: string): void {
    const b = this.doc.buckets.find((x) => x.name === bucketName);
    if (!b) throw new Error(`no such bucket: ${bucketName}`);
    for (const f of FLAGS) b[f] = true;
  }

  /** Drop all buckets — the wrong-shape/zero-resource scenario that must FAIL CLOSED. */
  emptySnapshot(): void {
    this.doc.buckets = [];
  }

  /**
   * One scheduled run: stamp captured_at with the sim clock, snapshot the CURRENT state
   * document, run the real check library, advance the clock by the declared interval.
   */
  tick(): TickResult {
    const capturedAt = fmtIso(this.nextRunMs);
    this.nextRunMs += this.intervalHours * 3600_000;
    const snapshot = JSON.stringify({ ...this.doc, captured_at: capturedAt }, null, 2) + "\n";
    this.fs.write(this.statePath, snapshot);
    const r = emitEvidence(this.fs, this.statePath, this.evidenceDir);
    return { runId: r.runId, capturedAt: r.capturedAt, rc: r.exit, alertPath: r.alertPath };
  }

  /** N scheduled runs (time compression: a month of monitoring in one gesture). */
  run(n: number): TickResult[] {
    const out: TickResult[] = [];
    for (let i = 0; i < n; i++) out.push(this.tick());
    return out;
  }

  /** Parse the append-only ledger the dashboard reads: `<iso> <run-id> rc=<n> <verdict…>`. */
  ledger(): LedgerEntry[] {
    const raw = this.fs.read(`${this.evidenceDir}/ledger.log`) ?? "";
    return raw
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => {
        const m = l.match(/^(\S+) (\S+) rc=(\d+) (.*)$/);
        if (!m) throw new Error(`unparseable ledger row: ${l}`);
        return { capturedAt: m[1], runId: m[2], rc: Number(m[3]), verdict: m[4] };
      });
  }

  /** The dashboard tile: current verdict + trailing-window history + open alerts. */
  dashboardTile(windowDays = 30): DashboardTile {
    const entries = this.ledger();
    if (entries.length === 0) {
      return {
        control: CCM_CONTROL_ID,
        current: "NO-DATA",
        lastCheckedAt: null,
        history: [],
        greenRuns: 0,
        redRuns: 0,
        openAlerts: [],
        timeCompression: this.timeCompressionLabel(),
      };
    }
    const last = entries[entries.length - 1];
    const cutoff = Date.parse(last.capturedAt) - windowDays * 86_400_000;
    const history = entries.filter((e) => Date.parse(e.capturedAt) >= cutoff);
    return {
      control: CCM_CONTROL_ID,
      current: last.rc === 0 ? "PASS" : last.rc === 1 ? "FAIL" : "ERROR",
      lastCheckedAt: last.capturedAt,
      history,
      greenRuns: history.filter((e) => e.rc === 0).length,
      redRuns: history.filter((e) => e.rc !== 0).length,
      openAlerts: this.fs.list(this.evidenceDir).filter((f) => f.startsWith("alert-")),
      timeCompression: this.timeCompressionLabel(),
    };
  }

  timeCompressionLabel(): string {
    return `simulated schedule: 1 tick = ${this.intervalHours}h of monitoring (declared time compression)`;
  }
}

export function createCcmScheduler(opts: CcmSchedulerOptions): CcmScheduler {
  return new CcmScheduler(opts);
}

/**
 * The design-input's canonical dashboard substrate: a 31-row ledger — 30 compliant runs
 * then ONE drift run (rc=1) — produced by genuinely running the check 31 times with drift
 * injected before the final tick. Returns the scheduler so the learner continues from there.
 */
export function seedThirtyOneRowHistory(
  seedStateJson: string,
  startIso: string,
  driftBucket: string,
): CcmScheduler {
  const sched = new CcmScheduler({ seedStateJson, startIso, intervalHours: 24 });
  sched.run(30);
  sched.injectDrift(driftBucket);
  sched.tick();
  return sched;
}
