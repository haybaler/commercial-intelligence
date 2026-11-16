"use client";

import { useRef, useState } from "react";
import { EXAMPLE_QUESTIONS, ask, type AskResult } from "@/lib/nl2sql";
import type { Warehouse } from "@/lib/types";
import { fmtDate } from "@/lib/format";

export function AskView({ wh }: { wh: Warehouse }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const submit = async (q: string) => {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await ask(wh, query);
      setResult(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const renderCell = (col: string, v: unknown): string => {
    if (v == null) return "—";
    if (col.includes("date")) return fmtDate(String(v));
    if (typeof v === "number") {
      if (col === "revenue" || col.includes("revenue") || col === "spend") {
        return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      }
      if (col === "influenced_share_pct") return `${v.toFixed(1)}%`;
      if (col === "return_per_dollar") return `$${v.toFixed(2)}`;
      return v.toLocaleString("en-US");
    }
    return String(v);
  };

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h3 className="text-lg font-semibold">Ask the warehouse</h3>
        <p className="text-sm text-muted mb-4">
          Plain English in, SQL out. Questions are parsed into metrics, filters, and time
          windows, then executed against the marts in DuckDB — running in this browser. The
          generated SQL is shown with every answer.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. how much catalog revenue came from biopharma in Q3"
            className="flex-1 rounded-lg border border-line bg-white px-4 py-2.5 text-sm focus:border-teal focus:outline-none"
            aria-label="Question"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Querying…" : "Ask"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button key={q} className="chip" onClick={() => { setQuestion(q); submit(q); }}>
              {q}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="card border-brick/40 bg-brick/5 p-4 text-sm text-brick" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div ref={resultRef} className="card p-5">
          <div className="text-lg font-semibold">{result.answer}</div>
          {result.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-base min-w-[480px]">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} className={isValueCol(c) ? "text-right" : ""}>
                        {c.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      {result.columns.map((c) => (
                        <td key={c} className={`num ${isValueCol(c) ? "text-right" : ""}`}>
                          {renderCell(c, r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 50 && (
                <p className="text-xs text-muted mt-2">Showing 50 of {result.rows.length} rows.</p>
              )}
            </div>
          )}
          <details className="mt-4">
            <summary className="sql-summary">Show generated SQL</summary>
            <pre className="sql">{result.sql}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function isValueCol(c: string): boolean {
  return /revenue|orders|units|accounts|spend|share|ratio|dollar/.test(c);
}
