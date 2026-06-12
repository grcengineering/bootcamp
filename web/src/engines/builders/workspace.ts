/**
 * Editable-file workspace model (web ISA ISC-80..84) — the shared interaction surface for
 * the non-terminal builder exercises: a small set of seeded files (the module's committed
 * lab fixtures), learner edits tracked per file, per-file restore (ISC-117 semantics) and
 * full reset-to-seed, plus a ReadonlyFs view so the ported validators always evaluate the
 * CURRENT state — fail-then-pass is genuine, never scripted.
 *
 * DOM-free; persistence is a plain serializable snapshot (lib/labstate.ts owns storage).
 */
import type { LearnerArtifact, ReadonlyFs } from "./types";
import { normalizePath } from "./types";

export interface WorkspaceSeedFile {
  path: string;
  content: string;
  /** Read-only files (reference validators, check libraries) reject edits honestly. */
  readOnly?: boolean;
}

export interface WorkspaceSnapshot {
  version: 1;
  files: Record<string, string>;
}

export class Workspace implements ReadonlyFs {
  private seedByPath = new Map<string, WorkspaceSeedFile>();
  private files = new Map<string, string>();

  constructor(seed: WorkspaceSeedFile[]) {
    for (const f of seed) {
      const p = normalizePath(f.path);
      this.seedByPath.set(p, { ...f, path: p });
      this.files.set(p, f.content);
    }
  }

  list(): string[] {
    return [...this.files.keys()].sort();
  }

  read(path: string): string | null {
    return this.files.get(normalizePath(path)) ?? null;
  }

  exists(path: string): boolean {
    return this.files.has(normalizePath(path));
  }

  isReadOnly(path: string): boolean {
    return this.seedByPath.get(normalizePath(path))?.readOnly === true;
  }

  /** Learner edit (or new learner-authored file). Throws on read-only seeds. */
  write(path: string, content: string): void {
    const p = normalizePath(path);
    if (this.isReadOnly(p)) {
      throw new Error(`read-only file: ${p} (restore is allowed; editing the reference is not)`);
    }
    this.files.set(p, content);
  }

  /** Remove a learner-created file (seeded files restore instead of vanishing). */
  remove(path: string): void {
    const p = normalizePath(path);
    if (this.seedByPath.has(p)) {
      throw new Error(`seeded file: ${p} — use restoreFile() to return it to its seed state`);
    }
    this.files.delete(p);
  }

  /** True when the file diverges from its seed (learner-created files are always dirty). */
  isDirty(path: string): boolean {
    const p = normalizePath(path);
    const cur = this.files.get(p);
    if (cur === undefined) return false;
    const seed = this.seedByPath.get(p);
    return seed === undefined || seed.content !== cur;
  }

  /** Per-file restore (distinct from full reset — ISC-117). */
  restoreFile(path: string): void {
    const p = normalizePath(path);
    const seed = this.seedByPath.get(p);
    if (!seed) throw new Error(`not a seeded file: ${p}`);
    this.files.set(p, seed.content);
  }

  /** Reset every file to seed and drop learner-created files. */
  resetAll(): void {
    this.files.clear();
    for (const [p, f] of this.seedByPath) this.files.set(p, f.content);
  }

  /**
   * Export a file as a cross-module learner artifact (ISC-131 shape — e.g. module 00's
   * one-pager travels to module 15's capstone assembler).
   */
  exportArtifact(path: string, module: string): LearnerArtifact {
    const content = this.read(path);
    if (content === null) throw new Error(`cannot export missing file: ${path}`);
    return { name: normalizePath(path), content, module };
  }

  snapshot(): WorkspaceSnapshot {
    return { version: 1, files: Object.fromEntries(this.files) };
  }

  restore(snap: WorkspaceSnapshot): void {
    this.files = new Map(Object.entries(snap.files).map(([p, c]) => [normalizePath(p), c]));
  }
}

export function createWorkspace(seed: WorkspaceSeedFile[]): Workspace {
  return new Workspace(seed);
}
