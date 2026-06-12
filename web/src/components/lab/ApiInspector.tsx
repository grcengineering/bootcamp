/**
 * Request/response inspector for the module-06 API lab (web ISA ISC-74..78, UI side).
 *
 * Shows the LAST curl exchange the learner ran in the terminal. HONESTY: the request
 * side is exactly what was typed (taught-subset parse); the response side shows only
 * what the engine actually printed — status + headers appear when the run used
 * `curl -i` unpiped, and are labeled "not captured" otherwise, never inferred.
 */
import type { ApiExchange } from "./sessions/api-exchange";

interface ApiInspectorProps {
  exchange: ApiExchange | null;
}

export default function ApiInspector({ exchange }: ApiInspectorProps) {
  return (
    <section aria-label="Last API exchange" className="glass rounded-xl mt-4 overflow-hidden">
      <div className="px-4 py-2 border-b border-[color:var(--hairline)] bg-[color:var(--tint)]">
        <span className="font-mono text-xs text-ink-dim">last curl exchange — acme.example (simulated vendor, in-page)</span>
      </div>
      {exchange === null ? (
        <p className="px-4 py-3 text-xs text-ink-dim">
          No curl exchange yet. Run a <code className="font-mono">curl</code> command in the terminal and the
          request/response pair appears here.
        </p>
      ) : (
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="px-4 py-3 border-b sm:border-b-0 sm:border-r border-[color:var(--hairline)] min-w-0">
            <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Request (as typed)</h3>
            <pre className="mt-2 font-mono text-xs text-ink-soft whitespace-pre overflow-x-auto">
              {`${exchange.method} ${exchange.path}${exchange.query ? `?${exchange.query}` : ""}`}
              {Object.entries(exchange.requestHeaders).map(([k, v]) => `\n${k}: ${v}`).join("")}
              {exchange.requestBody !== null ? `\n\n${exchange.requestBody}` : ""}
            </pre>
          </div>
          <div className="px-4 py-3 min-w-0">
            <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Response (as printed)</h3>
            {exchange.status !== null ? (
              <pre className="mt-2 font-mono text-xs text-ink-soft whitespace-pre overflow-x-auto">
                {`HTTP/1.1 ${exchange.status} ${exchange.statusText ?? ""}`}
                {(exchange.responseHeaders ?? []).map(([k, v]) => `\n${k}: ${v}`).join("")}
              </pre>
            ) : (
              <p className="mt-2 text-xs text-ink-dim">
                Status + headers not captured — add <code className="font-mono">-i</code> (and don't pipe) to see
                the full wire exchange.
              </p>
            )}
            {exchange.responseBody !== null ? (
              <pre className="mt-2 font-mono text-xs text-ink-soft whitespace-pre overflow-x-auto max-h-56 overflow-y-auto">
                {exchange.responseBody.replace(/\n$/, "")}
              </pre>
            ) : (
              <p className="mt-2 text-xs text-ink-dim">Body not captured — this run piped or redirected its output.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
