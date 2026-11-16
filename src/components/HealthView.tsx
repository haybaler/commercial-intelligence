"use client";

import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/queries";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { HealthRow } from "@/lib/types";

type SortKey = "total_revenue" | "days_since_last_order" | "trailing_vs_prior_2q_ratio";

const STATUS_STYLE: Record<string, string> = {
  "GONE QUIET": "bg-brick/10 text-brick",
  "UNDER-BUYING": "bg-amber/10 text-amber",
  WATCH: "bg-[#E8EDF2] text-navy",
  HEALTHY: "bg-leaf/10 text-leaf",
  "NEVER ORDERED": "bg-line text-muted",
  "BELOW THRESHOLD": "bg-line text-muted",
};

export function HealthView({ data }: { data: DashboardData }) {
  const { health } = data;
  const [status, setStatus] = useState("FLAGGED");
  const [type, setType] = useState("ALL");
  const [territory, setTerritory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_revenue");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const h of health) c[h.health_status] = (c[h.health_status] ?? 0) + 1;
    return c;
  }, [health]);

  const flagged = useMemo(
    () => health
      .filter((r) => r.health_status === "GONE QUIET" || r.health_status === "UNDER-BUYING")
      .sort((a, b) => Number(b.total_revenue ?? 0) - Number(a.total_revenue ?? 0))
      .slice(0, 30),
    [health],
  );

  const filtered = useMemo(() => {
    let rows = status === "FLAGGED" ? flagged : health;
    if (status === "GONE QUIET" || status === "UNDER-BUYING") rows = flagged;
    if (status !== "ALL" && status !== "FLAGGED") rows = rows.filter((r) => r.health_status === status);
    if (type !== "ALL") rows = rows.filter((r) => r.account_type === type);
    if (territory !== "ALL") rows = rows.filter((r) => r.territory === territory);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.account_name.toLowerCase().includes(s) || r.account_id.toLowerCase().includes(s)
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
  }, [health, flagged, status, type, territory, search, sortKey]);

  const atRiskRevenue = flagged.reduce((s, r) => s + (r.total_revenue || 0), 0);

  const types = [...new Set(health.map((r) => r.account_type))].sort();
  const territories = [...new Set(health.map((r) => r.territory))].sort();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="kpi-label">Gone quiet</div>
          <div className="mt-1 text-2xl font-semibold num text-brick">{flagged.filter((r) => r.health_status === "GONE QUIET").length}</div>
          <div className="mt-0.5 text-xs text-muted">120+ days quiet · within top 30</div>
        </div>
        <div className="card p-4">
          <div className="kpi-label">Under-buying</div>
          <div className="mt-1 text-2xl font-semibold num text-amber">{flagged.filter((r) => r.health_status === "UNDER-BUYING").length}</div>
          <div className="mt-0.5 text-xs text-muted">trailing 2Q &lt; 50% · within top 30</div>
        </div>
        <div className="card p-4">
          <div className="kpi-label">Watch</div>
          <div className="mt-1 text-2xl font-semibold num text-navy">{counts["WATCH"] ?? 0}</div>
          <div className="mt-0.5 text-xs text-muted">trailing 2Q 50–75% of prior</div>
        </div>
        <div className="card p-4">
          <div className="kpi-label">Revenue at risk</div>
          <div className="mt-1 text-2xl font-semibold num">{fmtMoney(atRiskRevenue)}</div>
          <div className="mt-0.5 text-xs text-muted">
            lifetime revenue · top {flagged.length} flagged accounts
          </div>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider">Filter</label>
        <Select value={status} onChange={setStatus} options={["FLAGGED", "GONE QUIET", "UNDER-BUYING", "WATCH", "HEALTHY", "BELOW THRESHOLD", "ALL"]} />
        <Select value={type} onChange={setType} options={["ALL", ...types]} />
        <Select value={territory} onChange={setTerritory} options={["ALL", ...territories]} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search account name or ID…"
          className="ml-auto min-w-[180px] rounded-lg border border-line bg-white px-3 py-1.5 text-sm focus:border-teal focus:outline-none"
          aria-label="Search accounts"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-base min-w-[900px]">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th>Territory</th>
                <th className="text-right">Last order</th>
                <ThSort label="Days quiet" k="days_since_last_order" current={sortKey} onSort={() => setSortKey("days_since_last_order")} />
                <ThSort label="Lifetime revenue" k="total_revenue" current={sortKey} onSort={() => setSortKey("total_revenue")} />
                <ThSort label="2Q vs prior 2Q" k="trailing_vs_prior_2q_ratio" current={sortKey} onSort={() => setSortKey("trailing_vs_prior_2q_ratio")} />
                <th className="text-right">Upside at Stake</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: HealthRow) => (
                <tr key={r.account_id} className={r.health_status === "HEALTHY" ? "opacity-75" : ""}>
                  <td>
                    <div className="font-medium">{r.account_name}</div>
                    <div className="text-xs text-muted">{r.account_id} · {r.tier}</div>
                  </td>
                  <td className="capitalize">{r.account_type}</td>
                  <td>{r.territory}</td>
                  <td className="text-right num">{fmtDate(r.last_order_date)}</td>
                  <td className="text-right num">{r.days_since_last_order ?? "—"}</td>
                  <td className="text-right num">{fmtMoney(r.total_revenue ?? 0)}</td>
                  <td className="text-right num">
                    {r.trailing_vs_prior_2q_ratio != null ? (
                      <span
                        className={
                          r.trailing_vs_prior_2q_ratio < 0.5
                            ? "text-brick font-semibold"
                            : r.trailing_vs_prior_2q_ratio < 0.75
                              ? "text-amber"
                              : ""
                        }
                      >
                        {Math.round(r.trailing_vs_prior_2q_ratio * 100)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-right num">
                    {r.ratio_to_segment_median != null
                      ? `${Math.max(0, Math.round((1 - r.ratio_to_segment_median) * 100))}%`
                      : "—"}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_STYLE[r.health_status] ?? "bg-line text-muted"}`}>
                      {r.health_status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-8">
                    No accounts match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed px-1">
        The default working list is the top 30 flagged accounts by lifetime revenue; only accounts
        with at least $25k lifetime spend are eligible. &quot;Upside at Stake&quot; is the percentage
        gap to the trailing 6-month median for the same account type. Thresholds and the full status logic are in{" "}
        <code className="text-ink">models/marts/mart_account_health.sql</code>.
      </p>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm capitalize focus:border-teal focus:outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o === "ALL" ? "All" : o}
        </option>
      ))}
    </select>
  );
}

function ThSort({ label, k, current, onSort }: { label: string; k: SortKey; current: SortKey; onSort: () => void }) {
  return (
    <th className="text-right">
      <button
        onClick={onSort}
        className={`font-semibold uppercase tracking-wider text-xs hover:text-ink ${current === k ? "text-teal" : "text-muted"}`}
      >
        {label} {current === k ? "↓" : ""}
      </button>
    </th>
  );
}
