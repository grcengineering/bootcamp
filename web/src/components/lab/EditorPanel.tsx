/**
 * Beginner-honest nano-class editor (web ISA ISC-51, UI side).
 *
 * Full-width monospace textarea overlay inside the terminal frame. Labeled plainly as a
 * simulation ("GNU nano-style editor (simulated)") — never pretends to be the real nano.
 * Ctrl+O writes out, Ctrl+X exits (with a save prompt on unsaved changes), mirroring the
 * footer buttons so the keys AND visible affordances both work.
 *
 * Writing goes through the session: prefers the engine's `writeFileAs(path, content, cmd)`
 * extension (clean provenance: producedBy = "nano <file>"); falls back to driving a heredoc
 * through the public exec/feedStdin contract when the extension isn't there.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isThenable, type LabSession } from "./sessions/types";

interface EditorPanelProps {
  /** Any bash-world terminal session (shell, api wrapper, git wrapper). */
  session: LabSession;
  /** The filename exactly as typed after `nano ` (may be relative). */
  fileArg: string;
  /** Called when the editor closes; `wrote` is true if the buffer was saved at least once. */
  onClose: (wrote: boolean) => void;
}

/** True when the session is the PowerShell lab (prompt is the public contract: `PS <cwd>> `). */
export function isPsSession(session: LabSession): boolean {
  return /^PS .*> $/.test(session.prompt());
}

/** Resolve a nano/notepad argument against the session's cwd (parsed from the prompt — public API only). */
export function resolveEditorPath(fileArg: string, session: LabSession): string {
  const p = session.prompt();
  const ps = p.match(/^PS (.*)> $/);
  if (ps) {
    if (/^[A-Za-z]:/.test(fileArg)) return fileArg; // drive-qualified = absolute
    return `${ps[1].replace(/\\$/, "")}\\${fileArg.replace(/^\.\\/, "")}`;
  }
  if (fileArg.startsWith("/") || fileArg.startsWith("~")) return fileArg;
  const m = p.match(/:([^$]*)\$\s*$/) ?? p.match(/ ([^ %]*) %\s*$/);
  const cwd = m ? m[1].trim() : "~";
  return `${cwd === "/" ? "" : cwd}/${fileArg}`;
}

const HEREDOC_EOF = "__GRCB_NANO_EOF__";

function writeViaSession(session: LabSession, path: string, content: string, fileArg: string): boolean {
  const ext = session as unknown as {
    writeFileAs?: (path: string, content: string, producedBy: string) => void;
  };
  if (typeof ext.writeFileAs === "function") {
    ext.writeFileAs(path, content, `${isPsSession(session) ? "notepad" : "nano"} ${fileArg}`);
    return true;
  }
  // Contract-only fallback: heredoc through exec/feedStdin (provenance becomes the cat
  // line). Async sessions all provide writeFileAs, so a thenable here is a bail-out.
  let r = session.exec(`cat > ${path} << '${HEREDOC_EOF}'`);
  if (isThenable(r)) return false;
  if (r.state !== "pending") return false;
  for (const line of content.replace(/\n$/, "").split("\n")) {
    const fed = session.feedStdin(line + "\n");
    if (isThenable(fed)) return false;
    r = fed;
    if (r.state === "done") return false; // engine closed early — bail honestly
  }
  const closed = session.feedStdin(HEREDOC_EOF + "\n");
  if (isThenable(closed)) return false;
  if (closed.state === "pending") session.interrupt();
  return closed.state === "done";
}

export default function EditorPanel({ session, fileArg, onClose }: EditorPanelProps) {
  const path = resolveEditorPath(fileArg, session);
  const [content, setContent] = useState(() => session.readFile(path) ?? "");
  const [savedContent, setSavedContent] = useState(() => session.readFile(path));
  const [status, setStatus] = useState<string>("");
  const [exitPrompt, setExitPrompt] = useState(false);
  const [wroteOnce, setWroteOnce] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const dirty = content !== (savedContent ?? "");

  const writeOut = useCallback((): boolean => {
    const body = content === "" || content.endsWith("\n") ? content : content + "\n";
    const ok = writeViaSession(session, path, body, fileArg);
    if (ok) {
      setSavedContent(content);
      setWroteOnce(true);
      const lines = body === "" ? 0 : body.replace(/\n$/, "").split("\n").length;
      setStatus(`Wrote ${lines} ${lines === 1 ? "line" : "lines"} to ${path}`);
    } else {
      setStatus(`Could not write ${path}`);
    }
    return ok;
  }, [content, session, path, fileArg]);

  const exit = useCallback(() => {
    if (dirty) {
      setExitPrompt(true);
      return;
    }
    onClose(wroteOnce);
  }, [dirty, onClose, wroteOnce]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        writeOut();
      } else if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        exit();
      }
    },
    [writeOut, exit],
  );

  return (
    <div
      role="dialog"
      aria-label={`Editor for ${fileArg}`}
      aria-modal="false"
      onKeyDown={onKeyDown}
      className="glass rounded-xl overflow-hidden flex flex-col border border-[color:var(--hairline)]"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[color:var(--hairline)] bg-[color:var(--tint)]">
        <span className="font-mono text-xs text-ink">
          {isPsSession(session) ? "Notepad-style editor" : "GNU nano-style editor"}{" "}
          <span className="text-ink-dim">(simulated)</span> — {fileArg}
          {dirty && <span className="text-orange-bright" title="unsaved changes"> *</span>}
        </span>
        <span className="font-mono text-xs text-ink-dim" role="status">{status}</span>
      </div>

      <textarea
        ref={areaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        aria-label={`File contents of ${fileArg}`}
        className="w-full min-h-[18rem] bg-transparent font-mono text-[13px] leading-relaxed text-ink p-4 outline-none resize-y"
        style={{ whiteSpace: "pre", overflowX: "auto" }}
      />

      {exitPrompt ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-[color:var(--hairline)] bg-[color:var(--tint)]">
          <span className="font-mono text-xs text-ink">Save modified buffer?</span>
          <button
            type="button"
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-brand text-white"
            onClick={() => {
              if (writeOut()) onClose(true);
            }}
          >
            Yes, save
          </button>
          <button
            type="button"
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[color:var(--tint-strong)] text-ink-soft border border-[color:var(--hairline)]"
            onClick={() => onClose(wroteOnce)}
          >
            No, discard
          </button>
          <button
            type="button"
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-ink-dim hover:text-ink"
            onClick={() => setExitPrompt(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-[color:var(--hairline)] bg-[color:var(--tint)]">
          <button
            type="button"
            onClick={writeOut}
            className="px-2.5 py-1 rounded-lg font-mono text-xs text-ink bg-[color:var(--tint-strong)] border border-[color:var(--hairline)] hover:border-orange/40"
          >
            ^O Write Out
          </button>
          <button
            type="button"
            onClick={exit}
            className="px-2.5 py-1 rounded-lg font-mono text-xs text-ink bg-[color:var(--tint-strong)] border border-[color:var(--hairline)] hover:border-orange/40"
          >
            ^X Exit
          </button>
          <span className="font-mono text-[11px] text-ink-dim ml-auto">Ctrl+O saves · Ctrl+X exits</span>
        </div>
      )}
    </div>
  );
}
