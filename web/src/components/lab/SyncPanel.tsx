/**
 * Profile + encrypted cross-device sync UI (web ISA ISC-138..146).
 *
 * Everything stays browser-local: the passphrase is never stored anywhere (ISC-142);
 * exports are AES-256-GCM envelopes produced by src/lib/sync.ts; imports show a merge
 * summary BEFORE applying, apply with an automatic local backup, and offer undo (ISC-145).
 * The optional GitHub Gist transport uses the learner's own fine-grained PAT, kept in
 * THIS browser's localStorage only — documented honestly as user-owned storage (ISC-144).
 * SyncDecryptError messages surface verbatim — they're written for humans.
 */
import { useCallback, useEffect, useState } from "react";
import { loadState, saveState, type LearnerState, type MergeSummary } from "../../lib/labstate";
import {
  exportEncrypted,
  importAndMerge,
  pullFromGist,
  pushToGist,
  SyncDecryptError,
} from "../../lib/sync";

const BACKUP_KEY = "grcb.sync.backup";
const GIST_KEY = "grcb.sync.gist";

interface GistCfg {
  token: string;
  gistId?: string;
}

function loadGistCfg(): GistCfg {
  try {
    return JSON.parse(localStorage.getItem(GIST_KEY) ?? "{}") as GistCfg;
  } catch {
    return { token: "" };
  }
}

function friendly(e: unknown): string {
  if (e instanceof SyncDecryptError) return e.message;
  if (e instanceof Error) return e.message;
  return "something unexpected went wrong";
}

const inputCls =
  "w-full glass rounded-lg px-3 py-2 text-sm text-ink bg-transparent outline-none focus:border-orange/50";
const quietBtn =
  "px-3 py-1.5 rounded-lg text-sm font-medium bg-[color:var(--tint)] text-ink-soft border border-[color:var(--hairline)] hover:border-orange/40 disabled:opacity-50";

export default function SyncPanel() {
  const [displayName, setDisplayName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);

  const [exportPass, setExportPass] = useState("");
  const [armored, setArmored] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [importBlob, setImportBlob] = useState("");
  const [importPass, setImportPass] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{
    merged: LearnerState;
    summary: MergeSummary;
    backup: LearnerState;
  } | null>(null);
  const [applied, setApplied] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);

  const [gist, setGist] = useState<GistCfg>({ token: "" });
  const [gistMsg, setGistMsg] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(loadState().profile.displayName ?? "");
    setGist(loadGistCfg());
    setHasBackup(localStorage.getItem(BACKUP_KEY) !== null);
  }, []);

  const saveName = useCallback(() => {
    const state = loadState();
    state.profile.displayName = displayName.trim() || undefined;
    saveState(state);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  }, [displayName]);

  const doExport = useCallback(async () => {
    setExportErr(null);
    setArmored(null);
    setBusy(true);
    try {
      setArmored(await exportEncrypted(loadState(), exportPass));
    } catch (e) {
      setExportErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }, [exportPass]);

  const copyArmored = useCallback(async () => {
    if (!armored) return;
    await navigator.clipboard.writeText(armored);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [armored]);

  const downloadArmored = useCallback(() => {
    if (!armored) return;
    const blob = new Blob([armored], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grc-bootcamp.grcb-sync.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [armored]);

  const previewImport = useCallback(async () => {
    setImportErr(null);
    setPendingMerge(null);
    setApplied(false);
    setBusy(true);
    try {
      setPendingMerge(await importAndMerge(loadState(), importBlob, importPass));
    } catch (e) {
      setImportErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }, [importBlob, importPass]);

  const applyImport = useCallback(() => {
    if (!pendingMerge) return;
    // Automatic pre-import backup → undo restores it exactly (ISC-145).
    localStorage.setItem(BACKUP_KEY, JSON.stringify(pendingMerge.backup));
    saveState(pendingMerge.merged);
    setHasBackup(true);
    setApplied(true);
    setPendingMerge(null);
    window.dispatchEvent(new CustomEvent("grc-lab-change"));
  }, [pendingMerge]);

  const undoImport = useCallback(() => {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return;
    try {
      saveState(JSON.parse(raw) as LearnerState);
      localStorage.removeItem(BACKUP_KEY);
      setHasBackup(false);
      setApplied(false);
      window.dispatchEvent(new CustomEvent("grc-lab-change"));
    } catch {
      setImportErr("the local backup couldn't be read — nothing was changed");
    }
  }, []);

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setImportBlob(await f.text());
  }, []);

  const saveGistCfg = useCallback((next: GistCfg) => {
    setGist(next);
    localStorage.setItem(GIST_KEY, JSON.stringify(next));
  }, []);

  const gistPush = useCallback(async () => {
    setGistMsg(null);
    setBusy(true);
    try {
      const blob = await exportEncrypted(loadState(), exportPass);
      const { gistId } = await pushToGist({ token: gist.token, gistId: gist.gistId }, blob);
      saveGistCfg({ ...gist, gistId });
      setGistMsg(`Pushed to your private gist (${gistId}).`);
    } catch (e) {
      setGistMsg(`Push failed: ${friendly(e)}`);
    } finally {
      setBusy(false);
    }
  }, [exportPass, gist, saveGistCfg]);

  const gistPull = useCallback(async () => {
    setGistMsg(null);
    setBusy(true);
    try {
      const blob = await pullFromGist({ token: gist.token, gistId: gist.gistId });
      setImportBlob(blob);
      setGistMsg("Pulled the encrypted blob — enter your passphrase under Import and preview the merge.");
    } catch (e) {
      setGistMsg(`Pull failed: ${friendly(e)}`);
    } finally {
      setBusy(false);
    }
  }, [gist]);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* profile (ISC-138) */}
      <section className="glass-card p-5 md:col-span-2">
        <h3 className="font-semibold text-ink">Profile</h3>
        <p className="text-xs text-ink-dim mt-1">
          Optional display name — stored in this browser only and included in your encrypted sync payload.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 items-center max-w-md">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label="Display name"
            placeholder="Display name"
            className={inputCls + " flex-1 min-w-[12rem]"}
          />
          <button type="button" className={quietBtn} onClick={saveName}>
            Save
          </button>
          {nameSaved && (
            <span role="status" className="text-xs text-blue-bright">
              Saved.
            </span>
          )}
        </div>
      </section>

      {/* export (ISC-141/143) */}
      <section className="glass-card p-5">
        <h3 className="font-semibold text-ink">Export your progress</h3>
        <p className="text-xs text-ink-dim mt-1 leading-relaxed">
          Produces one encrypted blob (AES-256-GCM) of ALL your state — progress, completions, evidence chain,
          artifacts, profile. Pick a long passphrase (4+ random words is a good shape).{" "}
          <strong className="text-ink-soft">It is never stored anywhere</strong> — lose it and the export can't be
          opened, by us or anyone.
        </p>
        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
            aria-label="Export passphrase"
            placeholder="Passphrase (min 8 characters)"
            autoComplete="new-password"
            className={inputCls}
          />
          <button type="button" className={quietBtn} onClick={() => void doExport()} disabled={busy || exportPass.length < 8}>
            Create encrypted export
          </button>
          {exportErr && (
            <p role="alert" className="text-xs text-orange-bright">
              {exportErr}
            </p>
          )}
          {armored && (
            <div>
              <textarea
                readOnly
                value={armored}
                rows={4}
                aria-label="Encrypted sync blob"
                className={inputCls + " font-mono text-xs break-all"}
                onFocus={(e) => e.target.select()}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={quietBtn} onClick={() => void copyArmored()}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" className={quietBtn} onClick={downloadArmored}>
                  Download .grcb-sync.txt
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* import (ISC-145) */}
      <section className="glass-card p-5">
        <h3 className="font-semibold text-ink">Import from another browser</h3>
        <p className="text-xs text-ink-dim mt-1 leading-relaxed">
          Paste or upload a sync blob. You'll see exactly what the merge would take from each side BEFORE anything
          is applied; applying makes an automatic local backup you can undo.
        </p>
        <div className="mt-3 space-y-2">
          <textarea
            value={importBlob}
            onChange={(e) => setImportBlob(e.target.value)}
            rows={3}
            aria-label="Sync blob to import"
            placeholder="GRCB-SYNC-v1.…"
            className={inputCls + " font-mono text-xs"}
          />
          <label className="block text-xs text-ink-dim">
            …or upload the file:{" "}
            <input type="file" accept=".txt" onChange={(e) => void onFile(e)} className="text-xs" />
          </label>
          <input
            type="password"
            value={importPass}
            onChange={(e) => setImportPass(e.target.value)}
            aria-label="Import passphrase"
            placeholder="Passphrase used at export"
            autoComplete="off"
            className={inputCls}
          />
          <button
            type="button"
            className={quietBtn}
            onClick={() => void previewImport()}
            disabled={busy || !importBlob.trim() || !importPass}
          >
            Preview merge
          </button>
          {importErr && (
            <p role="alert" className="text-xs text-orange-bright">
              {importErr}
            </p>
          )}
          {pendingMerge && (
            <div className="glass rounded-lg p-3 text-xs text-ink-soft space-y-1.5">
              <p className="font-semibold text-ink">Merge preview (newest wins, nothing applied yet):</p>
              <p>
                Exercise completions — keep {pendingMerge.summary.completionsTaken.local} local, take{" "}
                {pendingMerge.summary.completionsTaken.imported} imported.
              </p>
              <p>
                Artifacts — keep {pendingMerge.summary.artifactsTaken.local} local, take{" "}
                {pendingMerge.summary.artifactsTaken.imported} imported.
              </p>
              <p>Evidence chain — {pendingMerge.summary.chainExtended ? "imported chain is longer and will be adopted" : "local chain kept"}.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-brand text-white"
                  onClick={applyImport}
                >
                  Apply merge (backs up local first)
                </button>
                <button type="button" className={quietBtn} onClick={() => setPendingMerge(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {applied && (
            <p role="status" className="text-xs text-blue-bright">
              Merge applied. Your previous local state was backed up.
            </p>
          )}
          {hasBackup && (
            <button type="button" className={quietBtn} onClick={undoImport}>
              Undo last import (restore backup)
            </button>
          )}
        </div>
      </section>

      {/* gist transport (ISC-144) */}
      <section className="glass-card p-5 md:col-span-2">
        <h3 className="font-semibold text-ink">Optional: your own private GitHub Gist</h3>
        <p className="text-xs text-ink-dim mt-1 leading-relaxed">
          Push/pull the same encrypted blob to a private gist YOU own, using a fine-grained personal access token
          with only gist permission. <strong className="text-ink-soft">Your token stays in this browser</strong> —
          it's stored in localStorage here, never sent anywhere except api.github.com, and never included in the
          sync payload. This is your storage, not our service.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] items-center max-w-3xl">
          <input
            type="password"
            value={gist.token}
            onChange={(e) => saveGistCfg({ ...gist, token: e.target.value })}
            aria-label="GitHub fine-grained personal access token"
            placeholder="GitHub PAT (gist scope)"
            autoComplete="off"
            className={inputCls}
          />
          <button type="button" className={quietBtn} onClick={() => void gistPush()} disabled={busy || !gist.token || exportPass.length < 8}>
            Push
          </button>
          <button type="button" className={quietBtn} onClick={() => void gistPull()} disabled={busy || !gist.token || !gist.gistId}>
            Pull
          </button>
          {gist.gistId && <span className="font-mono text-xs text-ink-dim">gist: {gist.gistId}</span>}
        </div>
        <p className="text-xs text-ink-dim mt-2">
          Push uses the passphrase from the Export box (encrypts before anything leaves the browser); pull drops the
          blob into the Import box.
        </p>
        {gistMsg && (
          <p role="status" className="text-xs text-ink-soft mt-2">
            {gistMsg}
          </p>
        )}
      </section>
    </div>
  );
}
