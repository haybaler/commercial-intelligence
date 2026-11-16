import { useId } from "react";

export const LINE_COLORS = ["#0E7A66", "#24537F", "#7A4E7E", "#B7791F", "#B0413E", "#3E7C4F"];

/* ------------------------------------------------------------------ */
/* Vertical columns                                                    */
/* ------------------------------------------------------------------ */

export interface ColumnDatum {
  label: string;
  value: number;
  color?: string;
  sub?: string; // secondary label (e.g. YoY growth)
}

export function Columns({
  data,
  fmt = (v: number) => String(v),
  height = 220,
  highlightLast = true,
}: {
  data: ColumnDatum[];
  fmt?: (v: number) => string;
  height?: number;
  highlightLast?: boolean;
}) {
  const id = useId();
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 720;
  const H = height;
  const padL = 8;
  const padB = 30;
  const padT = 26;
  const bw = (W - padL * 2) / data.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
      <defs>
        <pattern id={`grid-${id}`} width="1" height="1">
          <rect width={W} height={H} fill="white" />
        </pattern>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={padL}
          x2={W - padL}
          y1={padT + (H - padT - padB) * (1 - f)}
          y2={padT + (H - padT - padB) * (1 - f)}
          stroke="#E2E7EC"
          strokeWidth={1}
        />
      ))}
      {data.map((d, i) => {
        const h = ((H - padT - padB) * d.value) / max;
        const x = padL + i * bw + bw * 0.18;
        const w = bw * 0.64;
        const y = H - padB - h;
        const isLast = i === data.length - 1;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={w}
              height={Math.max(h, 1)}
              rx={3}
              fill={d.color ?? (highlightLast && isLast ? "#0E7A66" : "#24537F")}
              opacity={highlightLast && isLast ? 1 : 0.82}
            >
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
            </rect>
            <text x={x + w / 2} y={y - 6} textAnchor="middle" className="fill-ink num" fontSize={11} fontWeight={600}>
              {fmt(d.value)}
            </text>
            <text x={x + w / 2} y={H - padB + 14} textAnchor="middle" className="fill-muted" fontSize={10.5}>
              {d.label}
            </text>
            {d.sub && (
              <text x={x + w / 2} y={H - padB + 26} textAnchor="middle" fontSize={10} className={d.sub.startsWith("-") ? "fill-brick" : "fill-leaf"}>
                {d.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked columns (multi-series)                                      */
/* ------------------------------------------------------------------ */

export function StackedColumns({
  categories,
  series,
  fmt = (v: number) => String(v),
  height = 240,
}: {
  categories: string[];
  series: { name: string; color: string; values: number[] }[];
  fmt?: (v: number) => string;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const padL = 8;
  const padB = 28;
  const padT = 26;
  const totals = categories.map((_, i) => series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const bw = (W - padL * 2) / categories.length;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Stacked bar chart">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={padL}
            x2={W - padL}
            y1={padT + (H - padT - padB) * (1 - f)}
            y2={padT + (H - padT - padB) * (1 - f)}
            stroke="#E2E7EC"
          />
        ))}
        {categories.map((c, i) => {
          let acc = 0;
          const x = padL + i * bw + bw * 0.2;
          const w = bw * 0.6;
          return (
            <g key={c}>
              {series.map((sr) => {
                const v = sr.values[i] ?? 0;
                const h = ((H - padT - padB) * v) / max;
                const y = H - padB - ((H - padT - padB) * (acc + v)) / max;
                acc += v;
                return (
                  <rect key={sr.name} x={x} y={y} width={w} height={Math.max(h, v > 0 ? 1 : 0)} fill={sr.color}>
                    <title>{`${c} · ${sr.name}: ${fmt(v)}`}</title>
                  </rect>
                );
              })}
              <text x={x + w / 2} y={H - padB - ((H - padT - padB) * totals[i]) / max - 6} textAnchor="middle" className="fill-ink num" fontSize={11} fontWeight={600}>
                {fmt(totals[i])}
              </text>
              <text x={x + w / 2} y={H - padB + 15} textAnchor="middle" className="fill-muted" fontSize={10.5}>
                {c}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
        {series.map((sr) => (
          <span key={sr.name} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: sr.color }} />
            {sr.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Line                                                                */
/* ------------------------------------------------------------------ */

export function LineChart({
  categories,
  series,
  fmt = (v: number) => String(v),
  height = 200,
}: {
  categories: string[];
  series: { name: string; color: string; values: (number | null)[] }[];
  fmt?: (v: number) => string;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const padL = 12;
  const padR = 40;
  const padB = 28;
  const padT = 22;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const x = (i: number) => padL + ((W - padL - padR) * i) / Math.max(categories.length - 1, 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / span);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + (H - padT - padB) * f}
              y2={padT + (H - padT - padB) * f}
              stroke="#E2E7EC"
            />
            <text x={W - padR + 5} y={padT + (H - padT - padB) * f + 3.5} fontSize={10} className="fill-muted num">
              {fmt(Math.round(max - span * f))}
            </text>
          </g>
        ))}
        {series.map((sr) => {
          const pts = sr.values
            .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
            .filter(Boolean)
            .join(" ");
          const lastIdx = sr.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
          const lastV = sr.values[lastIdx];
          return (
            <g key={sr.name}>
              <polyline points={pts} fill="none" stroke={sr.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {sr.values.map((v, i) =>
                v == null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill="white" stroke={sr.color} strokeWidth={1.6}>
                    <title>{`${categories[i]} · ${sr.name}: ${fmt(v)}`}</title>
                  </circle>
                )
              )}
              {lastV != null && (
                <text x={x(lastIdx)} y={y(lastV) - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill={sr.color} className="num">
                  {fmt(lastV)}
                </text>
              )}
            </g>
          );
        })}
        {categories.map((c, i) => (
          <text key={c} x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize={10.5} className="fill-muted">
            {c}
          </text>
        ))}
      </svg>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
          {series.map((sr) => (
            <span key={sr.name} className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-0.5 w-4" style={{ background: sr.color }} />
              {sr.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bars                                                     */
/* ------------------------------------------------------------------ */

export function HBars({
  data,
  fmt = (v: number) => String(v),
  colorFor,
}: {
  data: { label: string; value: number; sub?: string }[];
  fmt?: (v: number) => string;
  colorFor?: (d: { label: string; value: number }) => string;
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{d.label}</span>
            <span className="num font-semibold">{fmt(d.value)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-line/70 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${(Math.abs(d.value) / max) * 100}%`,
                background: colorFor ? colorFor(d) : "#0E7A66",
              }}
            />
          </div>
          {d.sub && <div className="mt-0.5 text-xs text-muted">{d.sub}</div>}
        </div>
      ))}
    </div>
  );
}
