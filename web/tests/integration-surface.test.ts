/**
 * Tests for the post-review integration surface: honest editor writes (writeFileAs),
 * restore-lab-files (reseedFiles, web ISA ISC-117), and labstate storage round-trips.
 */
import { describe, expect, test } from "bun:test";
import { createShellEngine } from "../src/engines/shell";
import { emptyState, loadState, saveState, STORAGE_KEY } from "../src/lib/labstate";
import type { SeedSpec } from "../src/engines/shell/types";

const seed: SeedSpec = {
  files: [
    { path: "~/evidence", dir: true },
    { path: "~/evidence/access.csv", content: "user,role\nalice,admin\n" },
  ],
  tools: { "lab-setup": "#!/usr/bin/env bash\necho provisioned\n" },
};

function session() {
  return createShellEngine().create({
    variant: "bash-linux", seed, epoch: "2026-06-01T09:00:00Z",
    cols: 80, user: "analyst", host: "workstation", home: "/home/analyst",
  });
}

describe("writeFileAs (honest editor provenance)", () => {
  test("writes content and records the editor as producer — not a synthetic heredoc", () => {
    const s = session();
    s.writeFileAs!("~/evidence/notes.sh", "#!/usr/bin/env bash\necho hi\n", "nano notes.sh");
    expect(s.readFile("~/evidence/notes.sh")).toContain("echo hi");
    expect(s.producedBy("~/evidence/notes.sh")).toBe("nano notes.sh");
    // history stays clean: the learner never typed a heredoc
    expect(s.history().join("\n")).not.toContain("__GRCB_NANO_EOF__");
  });
});

describe("reseedFiles (restore lab files; ISC-117)", () => {
  test("restores a deleted seed file; history, cwd, and learner files survive", () => {
    const s = session();
    s.exec("cd evidence");
    s.exec("rm access.csv");
    s.exec("echo mine > my-notes.txt");
    expect(s.exists("~/evidence/access.csv")).toBe(false);
    s.reseedFiles!(seed);
    expect(s.readFile("~/evidence/access.csv")).toBe("user,role\nalice,admin\n");
    expect(s.readFile("~/evidence/my-notes.txt")).toBe("mine\n");          // learner work kept
    expect(s.history()).toContain("rm access.csv");                        // history kept
    expect(s.prompt()).toContain("~/evidence");                            // cwd kept
  });

  test("restores an overwritten seed tool", () => {
    const s = session();
    const before = s.exec("lab-setup");
    expect(before.state).toBe("done");
    s.reseedFiles!(seed);
    const after = s.exec("lab-setup");
    expect(after.state).toBe("done");
    if (after.state === "done") {
      expect(after.events.map((e) => e.text).join("")).toContain("provisioned");
    }
  });
});

describe("labstate storage round-trip", () => {
  function fakeStorage(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(), key: () => null, length: 0,
    } as Storage;
  }

  test("save → load preserves state; updatedAt refreshed", () => {
    const storage = fakeStorage();
    const s = emptyState();
    s.profile.displayName = "Riley";
    saveState(s, storage);
    const back = loadState(storage);
    expect(back.profile.displayName).toBe("Riley");
    expect(back.updatedAt > new Date(0).toISOString()).toBe(true);
  });

  test("corrupt or missing storage yields a clean empty state (never throws)", () => {
    const storage = fakeStorage();
    expect(loadState(storage)).toEqual(emptyState());
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadState(storage)).toEqual(emptyState());
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, legacy: true }));
    expect(loadState(storage).version).toBe(2);
  });
});

describe("merge branch coverage (local-newer paths)", () => {
  test("local-newer completion and artifact are kept; reveals union; progress only fills gaps", async () => {
    const { mergeStates } = await import("../src/lib/labstate");
    const local = emptyState();
    const imported = emptyState();
    local.completions["lab-01"] = { exerciseId: "lab-01", module: "01", completedAt: "2026-06-14T00:00:00Z", clean: true, tasks: [] };
    imported.completions["lab-01"] = { exerciseId: "lab-01", module: "01", completedAt: "2026-06-13T00:00:00Z", clean: false, tasks: [] };
    local.artifacts["a.md"] = { content: "newer", savedAt: "2026-06-14T00:00:00Z", module: "00" };
    imported.artifacts["a.md"] = { content: "older", savedAt: "2026-06-13T00:00:00Z", module: "00" };
    local.moduleProgress["01"] = "complete";
    imported.moduleProgress["01"] = "in-progress";
    imported.moduleProgress["02"] = "in-progress";
    local.reveals["lab-01"] = ["t3"];
    imported.reveals["lab-01"] = ["t4"];
    const { merged, summary } = mergeStates(local, imported);
    expect(merged.completions["lab-01"].clean).toBe(true);
    expect(merged.artifacts["a.md"].content).toBe("newer");
    expect(merged.moduleProgress["01"]).toBe("complete");
    expect(merged.moduleProgress["02"]).toBe("in-progress");
    expect(merged.reveals["lab-01"].sort()).toEqual(["t3", "t4"]);
    expect(summary.completionsTaken.local).toBe(1);
    expect(summary.artifactsTaken.local).toBe(1);
  });
});
