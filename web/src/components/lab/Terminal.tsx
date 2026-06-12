/**
 * Accessible DOM terminal (web ISA ISC-94/95/96/97/115/116/118/122/123).
 *
 * Renders a ShellSession. Design decisions are ISA-bound:
 *  - transcript is a NON-live `role="log"` a screen-reader virtual cursor can walk;
 *    a SEPARATE visually-hidden polite announcer summarizes each completed command
 *    (one announcement per command — never the raw output stream) (ISC-94);
 *  - output lines are `white-space: pre` inside a horizontal scroll container —
 *    re-wrapping would falsify fixtures, so it is forbidden (ISC-96);
 *  - stderr chunks carry a left border + visually-hidden "stderr" label, never
 *    color alone (ISC-95);
 *  - input is a real <input> (native paste/IME/selection); NO run-this-for-me
 *    buttons — typing is the learning, paste is allowed (ISC-118);
 *  - long output paginates: newest ~2000 lines stay in the DOM with a
 *    "Show earlier output" button that reveals older chunks — never destroys (ISC-123);
 *  - no pedagogy ever enters the transcript — the coach layer lives outside (ISC-116).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ExecResult, ShellSession } from "../../engines/shell/types";

export interface Chunk {
  id: number;
  kind: "input" | "stdout" | "stderr" | "completions";
  text: string;
  /** prompt rendered before an input echo ("" while feeding pending stdin, "> " in heredocs). */
  prompt?: string;
}

export interface TerminalHandle {
  focus(): void;
  /** Echo a typed line into the transcript without executing (editor open, etc.). */
  echoInput(line: string): void;
}

interface TerminalProps {
  session: ShellSession;
  /** Called after every COMPLETED command (state:"done") — the player runs verifiers here. */
  onCommandComplete?: (line: string, exit: number) => void;
  /** Intercept `nano <file>` before exec — opens the editor panel (ISC-51 UI side). */
  onOpenEditor?: (fileArg: string) => void;
  onActivity?: () => void;
  disabled?: boolean;
}

const PAGE_LINES = 2000;

function countLines(text: string): number {
  if (text === "") return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") n++;
  if (text.endsWith("\n")) n--;
  return n;
}

function commonPrefix(items: string[]): string {
  if (items.length === 0) return "";
  let p = items[0];
  for (const it of items.slice(1)) {
    let i = 0;
    while (i < p.length && i < it.length && p[i] === it[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}

let chunkSeq = 0;

const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { session, onCommandComplete, onOpenEditor, onActivity, disabled = false },
  ref,
) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<null | { heredoc: boolean }>(null);
  const [announce, setAnnounce] = useState("");
  const [visibleLineBudget, setVisibleLineBudget] = useState(PAGE_LINES);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyDraft = useRef<string | null>(null);

  const prompt = pending ? (pending.heredoc ? "> " : "") : session.prompt();

  const push = useCallback((items: Omit<Chunk, "id">[]) => {
    if (items.length === 0) return;
    setChunks((prev) => [...prev, ...items.map((c) => ({ ...c, id: ++chunkSeq }))]);
  }, []);

  const echoInput = useCallback(
    (line: string, p?: string) => push([{ kind: "input", text: line, prompt: p ?? prompt }]),
    [push, prompt],
  );

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    echoInput: (line: string) => echoInput(line),
  }), [echoInput]);

  // Auto-scroll to the newest output.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunks]);

  const applyResult = useCallback(
    (line: string, result: ExecResult, opts: { heredoc?: boolean } = {}) => {
      push(result.events.map((e) => ({ kind: e.stream, text: e.text }) as Omit<Chunk, "id">));
      if (result.state === "done") {
        setPending(null);
        const lines = result.events.reduce((n, e) => n + countLines(e.text), 0);
        // ISC-94: one throttled, summarizing announcement per command — never the stream.
        // Zero-width joiner toggles ensure identical consecutive summaries still mutate the
        // DOM so screen readers re-announce (review finding 4).
        setAnnounce((prev) => {
          const msg = `Command finished, ${lines} ${lines === 1 ? "line" : "lines"} of output, exit code ${result.exit}.`;
          return prev === msg ? msg + "​" : msg;
        });
        onCommandComplete?.(line, result.exit);
      } else {
        setPending((prev) => ({ heredoc: opts.heredoc ?? prev?.heredoc ?? false }));
      }
    },
    [push, onCommandComplete],
  );

  const runLine = useCallback(
    (line: string) => {
      onActivity?.();
      if (pending) {
        // bash shows no prompt while a command reads stdin; heredocs show the "> " continuation.
        echoInput(line, pending.heredoc ? "> " : "");
        applyResult(line, session.feedStdin(line + "\n"));
        return;
      }
      echoInput(line);
      const nano = line.match(/^\s*nano\s+(\S+)\s*$/);
      if (nano && onOpenEditor) {
        onOpenEditor(nano[1]);
        return;
      }
      const heredoc = /<<-?\s*['"]?\w/.test(line);
      applyResult(line, session.exec(line), { heredoc });
    },
    [pending, echoInput, applyResult, session, onOpenEditor, onActivity],
  );

  const submit = useCallback(() => {
    const line = value;
    setValue("");
    historyDraft.current = null;
    runLine(line);
  }, [value, runLine]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        echoInput(value + "^C", pending ? "" : undefined);
        setValue("");
        const r = session.interrupt();
        push(r.events.map((ev) => ({ kind: ev.stream, text: ev.text }) as Omit<Chunk, "id">));
        setPending(null);
        return;
      }
      if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
        if (pending || value === "") {
          e.preventDefault();
          applyResult("", session.eof());
        }
        return;
      }
      if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setChunks([]); // bash Ctrl+L: a clear is the user's own request, not data loss
        setVisibleLineBudget(PAGE_LINES);
        return;
      }
      if (pending) return; // no history/completion while a command reads stdin
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyDraft.current === null) historyDraft.current = value;
        const prev = session.historyUp();
        if (prev !== null) setValue(prev);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = session.historyDown();
        setValue(next !== null ? next : (historyDraft.current ?? ""));
        if (next === null) historyDraft.current = null;
        return;
      }
      if (e.key === "Tab") {
        // Shift+Tab must escape the terminal — a keyboard-only user can otherwise never
        // leave the input (WCAG 2.1.2 no-keyboard-trap; review finding 1).
        if (e.shiftKey) return;
        e.preventDefault();
        const { completions, replacePrefix } = session.complete(value);
        if (completions.length === 0) return;
        const lcp = commonPrefix(completions);
        if (lcp.length > replacePrefix.length) {
          setValue(value.slice(0, value.length - replacePrefix.length) + lcp);
        } else if (completions.length > 1) {
          // bash double-tab behavior: list the options in the transcript.
          push([{ kind: "completions", text: completions.join("  ") }]);
        }
        return;
      }
    },
    [submit, echoInput, value, pending, session, push, applyResult],
  );

  // Native paste works (single line). Multi-line paste executes whole lines in order —
  // pasting a command sequence is allowed (typing is the learning; paste isn't cheating).
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      if (!text.includes("\n")) return; // let the browser handle it
      e.preventDefault();
      const parts = (value + text).split("\n");
      const rest = parts.pop() ?? "";
      for (const line of parts) runLine(line);
      setValue(rest);
    },
    [value, runLine],
  );

  // Pagination: keep the newest `visibleLineBudget` lines mounted; older chunks stay in
  // memory behind the reveal button (never destroyed — ISC-123).
  const { visible, hiddenLines } = useMemo(() => {
    let budget = visibleLineBudget;
    let start = chunks.length;
    while (start > 0) {
      const cost = Math.max(1, countLines(chunks[start - 1].text));
      if (cost > budget) break;
      budget -= cost;
      start--;
    }
    const hidden = chunks.slice(0, start).reduce((n, c) => n + Math.max(1, countLines(c.text)), 0);
    return { visible: chunks.slice(start), hiddenLines: hidden };
  }, [chunks, visibleLineBudget]);

  const focusIfNoSelection = useCallback(() => {
    if ((globalThis.getSelection?.()?.toString() ?? "") === "") inputRef.current?.focus();
  }, []);

  return (
    <div
      className="grcb-term glass rounded-xl overflow-hidden flex flex-col"
      onMouseUp={focusIfNoSelection}
    >
      <style>{`
        .grcb-term-scroll { overflow: auto; }
        .grcb-term-line { white-space: pre; font-family: var(--font-mono); } /* NEVER pre-wrap (ISC-96) */
        .grcb-term-stderr { border-left: 2px solid rgba(255,140,0,.65); padding-left: 8px; margin-left: -10px; }
        .grcb-term-input { caret-color: var(--color-orange-bright); caret-shape: block; }
        .grcb-term-cursor { display: inline-block; width: 0.6em; height: 1.15em; vertical-align: text-bottom;
          background: var(--color-orange-bright); animation: grcb-blink 1.1s steps(1) infinite; }
        @keyframes grcb-blink { 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .grcb-term-cursor { animation: none; } }
      `}</style>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-[color:var(--hairline)] bg-[color:var(--tint)]">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-blue/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-[color:var(--color-line)]" />
        </span>
        <span className="font-mono text-xs text-ink-dim">simulated terminal — analyst@workstation</span>
      </div>

      <div ref={scrollRef} className="grcb-term-scroll flex-1 px-4 py-3 text-[13px] leading-relaxed min-h-[20rem] max-h-[32rem]">
        {hiddenLines > 0 && (
          <button
            type="button"
            onClick={() => setVisibleLineBudget((b) => b + PAGE_LINES)}
            className="mb-2 px-3 py-1 rounded-lg text-xs font-medium bg-[color:var(--tint)] text-ink-soft border border-[color:var(--hairline)] hover:border-orange/40"
          >
            Show earlier output ({hiddenLines.toLocaleString()} lines)
          </button>
        )}
        <div role="log" aria-live="off" aria-label="Terminal transcript" className="w-max min-w-full">
          {visible.map((c) => {
            if (c.kind === "input") {
              return (
                <div key={c.id} className="grcb-term-line text-ink">
                  {c.prompt ? <span className="text-blue-bright">{c.prompt}</span> : null}
                  <span>{c.text}</span>
                </div>
              );
            }
            if (c.kind === "stderr") {
              return (
                <div key={c.id} className="grcb-term-line grcb-term-stderr text-ink-soft">
                  <span className="sr-only">stderr: </span>
                  {c.text.replace(/\n$/, "")}
                </div>
              );
            }
            return (
              <div key={c.id} className={"grcb-term-line " + (c.kind === "completions" ? "text-ink-dim" : "text-ink-soft")}>
                {c.text.replace(/\n$/, "")}
              </div>
            );
          })}
        </div>

        <div className="flex items-baseline w-max min-w-full">
          {prompt !== "" && (
            <span className="grcb-term-line text-blue-bright shrink-0">{prompt}</span>
          )}
          <span className="relative flex-1 min-w-[8rem] flex">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              disabled={disabled}
              className="grcb-term-input w-full bg-transparent border-0 outline-none font-mono text-[13px] text-ink p-0"
              aria-label={pending ? "Terminal input — a command is reading from standard input" : "Terminal command input"}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
            {value === "" && !disabled && (
              <span aria-hidden="true" className="grcb-term-cursor absolute left-0 top-1/2 -translate-y-1/2" />
            )}
          </span>
        </div>
      </div>

      {/* ISC-94: decoupled, throttled announcer — polite summary, one per command. */}
      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>
    </div>
  );
});

export default Terminal;
