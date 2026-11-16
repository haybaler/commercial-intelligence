"use client";

import type { DashboardData } from "@/lib/queries";
import { fmtGrowth, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { Columns, LineChart, StackedColumns } from "./charts";

const LINE_ORDER = [
  "Consumables",
  "Reagents",
  "Instruments",
  "Software",
  "Services",
  "Custom Projects",
];
const LINE_COLORS: Record<string, string> = {
  Consumables: "#0E7A66",
  Reagents: "#24537F",
  Instruments: "#7A4E7E",
  Software: "#B7791F",
  Services: "#3E7C4F",
  "Custom Projects": "#B0413E",
};

export function ExecutiveView({ data }: { data: DashboardData }) {
  const { quarterly, mix } = data;
  const latest = quarterly[quarterly.length - 1];
  const prior = quarterly[quarterly.length - 2];
  const yearAgo = quarterly[quarterly.length - 5]; // same quarter last year
  const total = quarterly.reduce((s, q) => s + q.revenue, 0);
  const influencedLatest = latest?.influenced_share ?? 0;
  const influencedYearAgo = yearAgo?.influenced_share ?? 0;

  const quarterLabels = quarterly.map((q) =>
    q.year_quarter.replace(/^20/, "").replace("-Q", " Q")
  );

  const mixQuarters = [...new Set(mix.map((m) => m.year_quarter))];
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
          sub="synthetic, Jan 2023 – Dec 2024"
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
            Quarterly order revenue across 24 months. All eight quarters are complete.
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
            Consumables and reagents rise from 40% toward 60% of revenue while
            instruments, software, services and custom projects make up the balance.
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
  const total = Object.values(rows).reduce((sum, revenue) => sum + revenue, 0);
  const catalog = rows.catalog ?? 0;
  const custom = rows["custom synthesis"] ?? 0;
  const groups = [
    { key: "catalog", label: "Catalog", revenue: catalog },
    { key: "instrument-service", label: "Instruments & services", revenue: total - catalog - custom },
    { key: "custom", label: "Custom synthesis", revenue: custom },
  ];
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
        {groups.map((group) => (
          <tr key={group.key}>
            <td>{group.label}</td>
            <td className="text-right num">{fmtMoney(group.revenue)}</td>
            <td className="text-right num">{fmtPct((group.revenue / total) * 100)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
