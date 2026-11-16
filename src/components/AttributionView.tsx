"use client";

import type { DashboardData } from "@/lib/queries";
import { fmtMoney, fmtPct } from "@/lib/format";
import { HBars, StackedColumns } from "./charts";

export function AttributionView({ data }: { data: DashboardData }) {
  const { attributionSummary, programs, quarterly } = data;
  // use the last full quarter for KPIs (partial quarters: <200 orders)
  const fullQuarters = new Set(quarterly.filter((q) => q.orders >= 200).map((q) => q.year_quarter));
  const summary = attributionSummary.filter((r) => fullQuarters.has(r.year_quarter));
  const latest = summary[summary.length - 1];

  // aggregate program rows across all quarters for the ROI view
  const byProgram = new Map<string, { spend: number; credited: number }>();
  for (const r of programs) {
    const cur = byProgram.get(r.program) ?? { spend: 0, credited: 0 };
    cur.spend += r.spend_usd ?? 0;
    cur.credited += r.influenced_revenue_last_touch ?? 0;
    byProgram.set(r.program, cur);
  }
  const programRows = [...byProgram.entries()]
    .map(([program, v]) => ({
      program,
      spend: v.spend,
      credited: v.credited,
      roi: v.spend > 0 ? v.credited / v.spend : null,
    }))
    .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));

  const totalSpend = programRows.reduce((s, r) => s + r.spend, 0);
  const totalCredited = programRows.reduce((s, r) => s + r.credited, 0);

  const quarterLabels = attributionSummary.map((r) =>
    r.year_quarter === "2026-Q4" ? "Q4* " : r.year_quarter.replace(/^20/, "").replace("-Q", " Q")
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="kpi-label">Influenced revenue · {latest.year_quarter}</div>
          <div className="mt-1 text-2xl font-semibold num">{fmtMoney(latest.influenced_revenue_last_touch)}</div>
          <div className="mt-0.5 text-xs text-muted">last-touch credit, 90-day window</div>
        </div>
        <div className="card p-4">
          <div className="kpi-label">Influenced share · {latest.year_quarter}</div>
          <div className="mt-1 text-2xl font-semibold num">{fmtPct(latest.influenced_share_pct)}</div>
          <div className="mt-0.5 text-xs text-muted">
            {fmtPct(summary[0]?.influenced_share_pct ?? 0)} in {summary[0]?.year_quarter}
          </div>
        </div>
        <div className="card p-4">
          <div className="kpi-label">Blended return per dollar · 2 yrs</div>
          <div className="mt-1 text-2xl font-semibold num">${totalCredited / totalSpend > 0 ? (totalCredited / totalSpend).toFixed(2) : "—"}</div>
          <div className="mt-0.5 text-xs text-muted">credited revenue / program spend</div>
        </div>
        <div className="card p-4">
          <div className="kpi-label">Program spend · 2 yrs</div>
          <div className="mt-1 text-2xl font-semibold num">{fmtMoney(totalSpend)}</div>
          <div className="mt-0.5 text-xs text-muted">six programs, quarterly actuals</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h3 className="text-lg font-semibold">Total revenue vs marketing-influenced</h3>
          <p className="text-sm text-muted mb-3">
            An order counts as influenced when a credited marketing touch landed in the 90 days
            before it. Credited, not proven incremental — the honest version of this metric.
          </p>
          <StackedColumns
            categories={quarterLabels}
            fmt={(v) => fmtMoney(v)}
            series={[
              {
                name: "Marketing-influenced",
                color: "#0E7A66",
                values: attributionSummary.map((r) => r.influenced_revenue_last_touch),
              },
              {
                name: "Not influenced",
                color: "#C7D0D8",
                values: attributionSummary.map(
                  (r) => r.total_revenue - r.influenced_revenue_last_touch
                ),
              },
            ]}
          />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold">Return per dollar by program</h3>
          <p className="text-sm text-muted mb-4">
            Last-touch-credited revenue across all quarters, divided by spend. Paid search looks
            expensive per click and cheap per credited dollar — check the caveat below.
          </p>
          <HBars
            data={programRows.map((r) => ({
              label: r.program,
              value: r.roi ?? 0,
              sub: `${fmtMoney(r.credited)} credited · ${fmtMoney(r.spend)} spend`,
            }))}
            fmt={(v) => `$${v.toFixed(2)}`}
            colorFor={(d) =>
              d.value >= 2 ? "#0E7A66" : d.value >= 1 ? "#24537F" : d.value >= 0.5 ? "#B7791F" : "#B0413E"
            }
          />
          <p className="mt-4 text-xs text-muted leading-relaxed">
            <strong className="text-ink">Caveat:</strong> orders that close by field
            relationships (most custom/OEM work) carry no marketing credit, so program ROI
            overstates marketing&apos;s total contribution to the P&amp;L. That is a model
            choice, not a rounding error — the README argues both sides.
          </p>
        </section>
      </div>

      <section className="card p-5">
        <h3 className="text-lg font-semibold">First touch vs last touch, by quarter</h3>
        <p className="text-sm text-muted mb-3">
          Every influenced order credited to the source that introduced the account
          (first touch) and the source closest to the order (last touch). First touch
          flatters brand programs; last touch flatters closers. The gap is the
          argument either side uses in budget season.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full table-base min-w-[640px]">
            <thead>
              <tr>
                <th>Quarter</th>
                <th className="text-right">Total revenue</th>
                <th className="text-right">First-touch credit</th>
                <th className="text-right">Last-touch credit</th>
                <th className="text-right">Share (last-touch)</th>
              </tr>
            </thead>
            <tbody>
              {attributionSummary.map((r) => (
                <tr key={r.year_quarter}>
                  <td className="font-medium">{r.year_quarter}</td>
                  <td className="text-right num">{fmtMoney(r.total_revenue)}</td>
                  <td className="text-right num">{fmtMoney(r.influenced_revenue_first_touch)}</td>
                  <td className="text-right num">{fmtMoney(r.influenced_revenue_last_touch)}</td>
                  <td className="text-right num">{fmtPct(r.influenced_share_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
