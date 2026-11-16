export function fmtMoney(v: number | null | undefined, compact = true): string {
  if (v == null || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (compact && abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (compact && abs >= 1_000) return `$${(v / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtGrowth(current: number, prior: number | null | undefined): string {
  if (prior == null || prior === 0) return "—";
  const g = ((current - prior) / prior) * 100;
  const sign = g > 0 ? "+" : "";
  return `${sign}${g.toFixed(1)}%`;
}
