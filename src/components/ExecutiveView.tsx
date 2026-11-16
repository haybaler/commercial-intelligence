"use client";

import type { DashboardData } from "@/lib/queries";
import { fmtGrowth, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { Columns, LineChart, StackedColumns } from "./charts";

const LINE_ORDER = [
  "Cell Mimic Controls",
  "Assay Reagents",
  "Flow Consumables",
  "Instrument Services",
  "Custom Cell Engineering",
  "OEM Components",
];
const LINE_COLORS: Record<string, string> = {
  "Cell Mimic Controls": "#0E7A66",
  "Assay Reagents": "#24537F",
  "Flow Consumables": "#7A4E7E",
  "Instrument Services": "#B7791F",
  "Custom Cell Engineering": "#B0413E",
  "OEM Components": "#3E7C4F",
};

export function ExecutiveView({ data }: { data: DashboardData }) {
  const { quarterly, mix } = data;
  // quarters with < 200 orders are partial periods (2024-Q4, 2026-Q4)
  const full = quarterly.filter((q) => q.orders >= 200);
  const latest = full[full.length - 1];
  const prior = full[full.length - 2];
  const yearAgo = full[full.length - 5]; // same quarter last year
  const total = quarterly.reduce((s, q) => s + q.revenue, 0);
  const influencedLatest = latest?.influenced_share ?? 0;
  const influencedYearAgo = yearAgo?.influenced_share ?? 0;

  const quarters = quarterly.map((q) => q.year_quarter.replace(/^20/, "").replace("-Q", " Q"));
  // 2026-Q4 is a partial quarter (Oct only) -- mark it in labels
  const quarterLabels = quarterly.map((q) =>
    q.year_quarter === "2026-Q4" ? "Q4* " : q.year_quarter.replace(/^20/, "").replace("-Q", " Q")
  );

  const mixQuarters = [...new Set(mix.map((m) => m.year_quarter))].filter(
    (q) => q !== "2026-Q4"
  );
  const mixSeries = LINE_ORDER.map((line) => ({
    name: line,
    color: LINE_COLORS[line],
    values: mixQuarters.map(
      (q) => mix.find((m) => m.year_quarter === q && m.product_line === line)?.revenue ?? 0
    ),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Revenue · 24 months"
          value={fmtMoney(total)}
          sub="synthetic, Nov 2024 – Oct 2026"
        />
        <Kpi
          label={`Revenue · ${latest.year_quarter}`}
          value={fmtMoney(latest.revenue)}
          sub={`${fmtGrowth(latest.revenue, prior.revenue)} QoQ · ${fmtGrowth(latest.revenue, yearAgo.revenue)} YoY`}
        />
        <Kpi
          label={`Buying accounts · ${latest.year_quarter}`}
          value={fmtNum(latest.buying_accounts)}
          sub={`${fmtGrowth(latest.buying_accounts, yearAgo?.buying_accounts)} vs ${yearAgo.year_quarter}`}
        />
        <Kpi
          label={`Marketing-influenced · ${latest.year_quarter}`}
          value={fmtPct(influencedLatest)}
          sub={`${fmtPct(influencedLatest - influencedYearAgo)} vs ${yearAgo.year_quarter} (credited touch, 90d)`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h3 className="text-lg font-semibold">Revenue by quarter</h3>
          <p className="text-sm text-muted mb-3">
            Growth with conference-season peaks (Sep–Oct). *Q4 2026 is October only.
          </p>
          <Columns
            data={quarterly.map((q, i) => ({
              label: quarterLabels[i],
              value: q.revenue,
              fmt: fmtMoney,
            }))}
            fmt={(v) => fmtMoney(v)}
          />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold">New vs repeat accounts</h3>
          <p className="text-sm text-muted mb-3">
            Revenue from first-order accounts vs. the returning base.
          </p>
          <StackedColumns
            categories={quarterLabels}
            fmt={(v) => fmtMoney(v)}
            series={[
              {
                name: "New accounts",
                color: "#24537F",
                values: quarterly.map((q) => q.new_account_revenue),
              },
              {
                name: "Repeat accounts",
                color: "#0E7A66",
                values: quarterly.map((q) => q.repeat_account_revenue),
              },
            ]}
          />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h3 className="text-lg font-semibold">Revenue mix by product line</h3>
          <p className="text-sm text-muted mb-3">
            Catalog lines (controls, reagents, consumables, services) vs. custom
            (engineering projects, OEM).
          </p>
          <StackedColumns
            categories={mixQuarters.map((q) => q.replace(/^20/, "").replace("-Q", " Q"))}
            fmt={(v) => fmtMoney(v)}
            series={mixSeries}
            height={260}
          />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold">Buying accounts by quarter</h3>
          <p className="text-sm text-muted mb-3">
            Distinct accounts with at least one order.
          </p>
          <LineChart
            categories={quarterLabels}
            fmt={(v) => fmtNum(v)}
            series={[
              {
                name: "Buying accounts",
                color: "#0E7A66",
                values: quarterly.map((q) => q.buying_accounts),
              },
            ]}
          />
          <div className="mt-5">
            <h4 className="text-sm font-semibold mb-2">Catalog vs custom</h4>
            <CatalogCustomTable data={data} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="kpi-label">{label}</div>
      <div className="mt-1 text-2xl font-semibold num">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </div>
  );
}

function CatalogCustomTable({ data }: { data: DashboardData }) {
  const rows = data.mix.reduce(
    (acc, m) => {
      acc[m.order_type] = (acc[m.order_type] ?? 0) + m.revenue;
      return acc;
    },
    {} as Record<string, number>
  );
  const total = (rows.catalog ?? 0) + (rows.custom ?? 0);
  return (
    <table className="w-full table-base">
      <thead>
        <tr>
          <th>Order type</th>
          <th className="text-right">Revenue</th>
          <th className="text-right">Share</th>
        </tr>
      </thead>
      <tbody>
        {(["catalog", "custom"] as const).map((k) => (
          <tr key={k}>
            <td className="capitalize">{k}</td>
            <td className="text-right num">{fmtMoney(rows[k] ?? 0)}</td>
            <td className="text-right num">{fmtPct(((rows[k] ?? 0) / total) * 100)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
