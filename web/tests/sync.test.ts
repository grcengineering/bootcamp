/**
 * Encrypted sync + learner-state tests (web ISA ISC-140..145, ISC-129 chain integrity).
 * The tamper tests are the load-bearing ones: GCM must reject ANY ciphertext modification.
 */
import { describe, expect, test } from "bun:test";
import { exportEncrypted, importEncrypted, importAndMerge, SyncDecryptError } from "../src/lib/sync";
import { emptyState, appendEvidence, verifyChain, mergeStates, type LearnerState } from "../src/lib/labstate";

function sampleState(): LearnerState {
  const s = emptyState();
  s.profile.displayName = "Riley";
  s.completions["lab-01"] = {
    exerciseId: "lab-01", module: "01-terminal-and-command-line-basics",
    completedAt: "2026-06-12T10:00:00Z", clean: true,
    tasks: [{ taskId: "t3", completedAt: "2026-06-12T09:59:00Z", revealsUsed: 0, evidence: "produced by: cat … | grep … | wc -l" }],
  };
  s.artifacts["module-00/one-pager.md"] = { content: "# Before\n…", savedAt: "2026-06-10T08:00:00Z", module: "00" };
  return s;
}

describe("encrypted sync envelope", () => {
  test("round-trip restores state exactly (ISC-143)", async () => {
    const state = sampleState();
    const blob = await exportEncrypted(state, "correct horse battery staple");
    expect(blob.startsWith("GRCB-SYNC-v1.")).toBe(true);
    const back = await importEncrypted(blob, "correct horse battery staple");
    expect(back).toEqual(state);
  });

  test("wrong passphrase is rejected with a clear error (ISC-141)", async () => {
    const blob = await exportEncrypted(sampleState(), "correct horse battery staple");
    await expect(importEncrypted(blob, "wrong passphrase!")).rejects.toThrow(SyncDecryptError);
  });

  test("a single flipped ciphertext character is rejected (GCM tamper evidence)", async () => {
    const blob = await exportEncrypted(sampleState(), "correct horse battery staple");
    const envelope = JSON.parse(atob(blob.slice("GRCB-SYNC-v1.".length)));
    const ct = envelope.ct as string;
    const idx = Math.floor(ct.length / 2);
    envelope.ct = ct.slice(0, idx) + (ct[idx] === "A" ? "B" : "A") + ct.slice(idx + 1);
    const tampered = "GRCB-SYNC-v1." + btoa(JSON.stringify(envelope));
    await expect(importEncrypted(tampered, "correct horse battery staple")).rejects.toThrow(/modified|integrity|passphrase/);
  });

  test("two exports of the same state differ (fresh salt + IV every time)", async () => {
    const state = sampleState();
    const a = await exportEncrypted(state, "correct horse battery staple");
    const b = await exportEncrypted(state, "correct horse battery staple");
    expect(a).not.toBe(b);
  });

  test("garbage and wrong-header inputs produce friendly errors (ISC-146)", async () => {
    await expect(importEncrypted("not a blob", "x".repeat(10))).rejects.toThrow(/bad header/);
    await expect(importEncrypted("GRCB-SYNC-v1.%%%%", "x".repeat(10))).rejects.toThrow(/corrupted/);
  });

  test("short passphrases are refused at export", async () => {
    await expect(exportEncrypted(sampleState(), "short")).rejects.toThrow(/at least 8/);
  });
});

describe("merge semantics (ISC-145)", () => {
  test("newest-wins per completion; local never silently destroyed", async () => {
    const local = sampleState();
    const imported = sampleState();
    imported.completions["lab-01"] = { ...imported.completions["lab-01"], completedAt: "2026-06-13T10:00:00Z", clean: false };
    imported.completions["lab-02"] = { exerciseId: "lab-02", module: "02", completedAt: "2026-06-13T11:00:00Z", clean: true, tasks: [] };
    const { merged, summary } = mergeStates(local, imported);
    expect(merged.completions["lab-01"].completedAt).toBe("2026-06-13T10:00:00Z");
    expect(merged.completions["lab-02"]).toBeDefined();
    expect(summary.completionsTaken.imported).toBe(2);
  });

  test("importAndMerge returns a backup equal to pre-merge local", async () => {
    const local = sampleState();
    const remote = sampleState();
    remote.profile.displayName = "Other";
    const blob = await exportEncrypted(remote, "correct horse battery staple");
    const { backup, merged } = await importAndMerge(local, blob, "correct horse battery staple");
    expect(backup).toEqual(sampleState());
    expect(merged.profile.displayName).toBe("Riley"); // local profile wins
  });
});

describe("evidence-pack hash chain (ISC-129)", () => {
  test("chain appends verify; any field edit breaks verification at the right seq", async () => {
    const s = emptyState();
    await appendEvidence(s, "exercise-completed", "lab-01", { tasks: 8 });
    await appendEvidence(s, "artifact-saved", "module-00/one-pager.md", { bytes: 120 });
    await appendEvidence(s, "sync-export", "file", {});
    expect(await verifyChain(s.evidenceChain)).toBeNull();
    const tampered = structuredClone(s.evidenceChain);
    tampered[1].subject = "module-00/SOMETHING-ELSE.md";
    expect(await verifyChain(tampered)).toBe(1);
    const reordered = [s.evidenceChain[1], s.evidenceChain[0], s.evidenceChain[2]];
    expect(await verifyChain(reordered)).not.toBeNull();
  });
});
