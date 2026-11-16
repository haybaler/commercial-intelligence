import { fmtMoney, fmtNum, fmtPct } from "./format";
import type { Row, Warehouse } from "./types";

/**
 * Deterministic plain-English -> SQL for this warehouse.
 *
 * This is deliberately NOT a canned-question lookup: it parses the question
 * into (metric, filters, time window, group-by, sort/limit) and composes SQL
 * from whitelisted identifiers only. Against a production warehouse this
 * module is the seam where an LLM step would replace the rule parser --
 * the README discusses the tradeoff. The safety properties (identifier
 * whitelist, read-only queries) would stay exactly the same.
 */

export interface AskResult {
  sql: string;
  answer: string;
  columns: string[];
  rows: Row[];
}

export interface AskContext {
  asOfQuarter: string; // e.g. "2026-Q4"
}

const ACCOUNT_TYPES: Record<string, string> = {
  biopharma: "biopharma",
  cdmo: "CDMO",
  cro: "CRO",
  academic: "academic",
  "clinical lab": "clinical lab",
  "clinical labs": "clinical lab",
  oem: "OEM",
};

const PRODUCT_LINES: Record<string, string> = {
  "cell mimic": "Cell Mimic Controls",
  "cell mimic controls": "Cell Mimic Controls",
  "assay reagent": "Assay Reagents",
  "assay reagents": "Assay Reagents",
  "flow consumable": "Flow Consumables",
  "flow consumables": "Flow Consumables",
  "instrument service": "Instrument Services",
  "instrument services": "Instrument Services",
  "custom cell": "Custom Cell Engineering",
  "custom cell engineering": "Custom Cell Engineering",
  "oem component": "OEM Components",
  "oem components": "OEM Components",
};

const CHANNELS: Record<string, string> = {
  direct: "direct",
  "inside sales": "inside sales",
  distributor: "distributor",
  distribution: "distributor",
  "e-commerce": "e-commerce",
  ecommerce: "e-commerce",
  "web store": "e-commerce",
  online: "e-commerce",
};

const LEAD_SOURCES: Record<string, string> = {
  "organic search": "Organic Search",
  organic: "Organic Search",
  "paid search": "Paid Search",
  "paid ads": "Paid Search",
  email: "Email",
  content: "Content",
  webinar: "Webinar",
  webinars: "Webinar",
  "trade show": "Trade Show",
  "trade shows": "Trade Show",
  conference: "Trade Show",
  partner: "Partner",
  referral: "Referral",
};

const TERRITORIES: Record<string, string> = {
  "us-west": "US-West",
  "us-east": "US-East",
  "us-central": "US-Central",
  "eu-north": "EU-North",
  "eu-south": "EU-South",
  apac: "APAC",
  europe: "EU-North",
};

const ORGS: Record<string, string> = {
  "north america": "North America",
  emea: "EMEA",
  apac: "APAC",
};

interface Parsed {
  metric: "revenue" | "orders" | "units" | "accounts" | "spend" | "return_per_dollar" | "influenced_share";
  filters: string[];
  filterDesc: string[];
  groupDims: string[]; // SQL expressions
  groupLabels: string[];
  timeDesc: string | null;
  topN: number | null;
  topDim: string | null;
  orderDir: "DESC" | "ASC";
  signals: number;
}

const GROUP_DIMS: Array<[RegExp, string, string, string]> = [
  [/ by (product line|line)s?$/, "product_line", "product line", "product_line"],
  [/ by (account )?types?$/, "account_type", "account type", "account_type"],
  [/ by territories$| by territory$/, "territory", "territory", "territory"],
  [/ by (sales )?channels?$/, "channel", "channel", "channel"],
  [/ by (lead )?sources?$/, "lt_source", "lead source", "lead_source"],
  [/ by quarters?$| per quarters?$/, "year_quarter", "quarter", "year_quarter"],
  [/ by months?$| per months?$/, "order_month", "month", "order_month"],
  [/ by programs?$/, "program", "program", "program"],
  [/ by orgs?$| by region$/, "org", "org", "org"],
  [/ by (sku|skus)$/, "sku", "SKU", "sku"],
];

export const EXAMPLE_QUESTIONS = [
  "how much catalog revenue came from biopharma in Q3",
  "revenue by product line in 2026",
  "what share of revenue was marketing influenced in Q3 2026",
  "top 10 accounts by revenue in 2026",
  "orders by account type by quarter",
  "return per dollar for paid search by quarter",
  "revenue from trade shows by territory",
  "which territory had the most buying accounts last quarter",
];

function shiftQuarter(q: string, delta: number): string {
  const [y, qq] = q.split("-Q").map((s, i) => (i === 0 ? parseInt(s, 10) : parseInt(s, 10)));
  const idx = y * 4 + qq - 1 + delta;
  return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
}

export function parseQuestion(question: string, ctx: AskContext): Parsed {
  let q = question.toLowerCase().replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
  const p: Parsed = {
    metric: "revenue",
    filters: [],
    filterDesc: [],
    groupDims: [],
    groupLabels: [],
    timeDesc: null,
    topN: null,
    topDim: null,
    orderDir: "DESC",
    signals: 0,
  };

  // ---- metric -------------------------------------------------------------
  if (/return per dollar|roi|return on spend/.test(q)) {
    p.metric = "return_per_dollar";
    q = q.replace(/return per dollar|roi|return on spend/g, " ");
    p.signals++;
  } else if (/influenced/.test(q) && /share|percent|%/.test(q)) {
    p.metric = "influenced_share";
    q = q.replace(/marketing[- ]?influenced/g, " ")
         .replace(/(what |which )?(was |is )?(the )?(share|percent(age)?) of (revenue|sales)/g, " ")
         .replace(/of total/g, " ")
         .replace(/(what |which )?(is |was )?the share/g, " ");
    p.signals++;
  } else if (/\baccounts\b/.test(q) && !/by account|revenue per account/.test(q)) {
    p.metric = "accounts";
    q = q.replace(/how many (buying )?accounts|number of (buying )?accounts|buying accounts/g, " ");
    p.signals++;
  } else if (/\bunits\b/.test(q)) {
    p.metric = "units";
    q = q.replace(/how many units|units?/g, " ");
    p.signals++;
  } else if (/\borders\b/.test(q)) {
    p.metric = "orders";
    q = q.replace(/how many orders|orders?/g, " ");
    p.signals++;
  } else if (/spend|cost/.test(q)) {
    p.metric = "spend";
    q = q.replace(/program spend|spend|cost/g, " ");
    p.signals++;
  } else if (/revenue|sales|how much|bookings/.test(q)) {
    p.metric = "revenue";
    q = q.replace(/revenue|sales|how much|bookings/g, " ");
    p.signals++;
  }

  // ---- time ----------------------------------------------------------------
  const knownQuarters: string[] = [];
  for (let y = 2024; y <= 2026; y++) {
    for (let k = 1; k <= 4; k++) knownQuarters.push(`${y}-Q${k}`);
  }
  const maxFull = shiftQuarter(ctx.asOfQuarter, -1); // last completed quarter

  let m = q.match(/\b(20\d\d)[ -]?q([1-4])\b/);
  if (m) {
    p.filters.push(`year_quarter = '${m[1]}-Q${m[2]}'`);
    p.timeDesc = `${m[1]} Q${m[2]}`;
    q = q.replace(m[0], " ");
    p.signals++;
  } else if ((m = q.match(/\bq([1-4])\b(?: of (20\d\d))?/))) {
    const year = m[2] ?? maxFull.slice(0, 4);
    p.filters.push(`year_quarter = '${year}-Q${m[1]}'`);
    p.timeDesc = `${year} Q${m[1]}${m[2] ? "" : " (most recent year with that quarter)"}`;
    q = q.replace(m[0], " ");
    p.signals++;
  } else if (/last quarter/.test(q)) {
    p.filters.push(`year_quarter = '${maxFull}'`);
    p.timeDesc = maxFull.replace("-Q", " Q");
    q = q.replace(/last quarter/g, " ");
    p.signals++;
  } else if (/this quarter/.test(q)) {
    p.filters.push(`year_quarter = '${ctx.asOfQuarter}'`);
    p.timeDesc = `${ctx.asOfQuarter.replace("-Q", " Q")} (partial)`;
    q = q.replace(/this quarter/g, " ");
    p.signals++;
  } else if (/this year/.test(q)) {
    p.filters.push(`order_year = ${maxFull.slice(0, 4)}`);
    p.timeDesc = String(maxFull.slice(0, 4));
    q = q.replace(/this year/g, " ");
    p.signals++;
  } else if (/last year/.test(q)) {
    p.filters.push(`order_year = ${Number(maxFull.slice(0, 4)) - 1}`);
    p.timeDesc = String(Number(maxFull.slice(0, 4)) - 1);
    q = q.replace(/last year/g, " ");
    p.signals++;
  } else if ((m = q.match(/\b(20\d\d)\b/))) {
    p.filters.push(`order_year = ${m[1]}`);
    p.timeDesc = m[1];
    q = q.replace(m[0], " ");
    p.signals++;
  }

  // ---- entity filters (longest keys first) ---------------------------------
  const scan = (
    dict: Record<string, string>,
    column: string,
    label: (v: string) => string,
    sql: (v: string) => string
  ) => {
    for (const key of Object.keys(dict).sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(q)) {
        const value = dict[key];
        p.filters.push(sql(value));
        p.filterDesc.push(label(value));
        q = q.replace(re, " ");
        p.signals++;
        break; // one value per category is enough for a demo parser
      }
    }
  };

  scan(ACCOUNT_TYPES, "account_type", (v) => v, (v) => `account_type = '${v}'`);
  scan(PRODUCT_LINES, "product_line", (v) => v, (v) => `product_line = '${v}'`);
  scan(CHANNELS, "channel", (v) => v, (v) => `channel = '${v}'`);
  // lead sources credit budget programs differently in the attribution mart
  const SOURCE_TO_PROGRAM: Record<string, string> = {
    "Paid Search": "Paid Search",
    "Organic Search": "Organic & Content",
    "Content": "Organic & Content",
    "Referral": "Organic & Content",
    "Email": "Email Nurture",
    "Webinar": "Webinars",
    "Trade Show": "Trade Shows",
    "Partner": "Partner Marketing",
  };
  scan(
    LEAD_SOURCES,
    p.metric === "return_per_dollar" || p.metric === "spend" ? "program" : "lt_source",
    (v) => v,
    (v) => `program = '${SOURCE_TO_PROGRAM[v] ?? v}'`
  );
  scan(TERRITORIES, "territory", (v) => v, (v) => `territory = '${v}'`);
  scan(ORGS, "org", (v) => v, (v) => `org = '${v}'`);

  if (/\bcatalog\b/.test(q)) {
    p.filters.push(`order_type = 'catalog'`);
    p.filterDesc.push("catalog");
    q = q.replace(/\bcatalog\b/g, " ");
    p.signals++;
  }
  if (/\bcustom\b/.test(q)) {
    p.filters.push(`order_type = 'custom'`);
    p.filterDesc.push("custom");
    q = q.replace(/\bcustom\b/g, " ");
    p.signals++;
  }
  if (/marketing[- ]influenced|influenced/.test(q)) {
    p.filters.push("is_marketing_influenced");
    p.filterDesc.push("marketing-influenced");
    q = q.replace(/marketing[- ]influenced|influenced/g, " ");
    p.signals++;
  }
  if (/new accounts?|first[- ]time/.test(q)) {
    p.filters.push("is_new_account_order");
    p.filterDesc.push("new accounts");
    q = q.replace(/new accounts?|first[- ]time/g, " ");
    p.signals++;
  }

  // ---- group-by (up to two dimensions, matched greedily) ---------------------
  for (const [re, dim, label] of GROUP_DIMS) {
    if (p.groupDims.length >= 2) break;
    if (re.test(q)) {
      p.groupDims.push(dim);
      p.groupLabels.push(label);
      q = q.replace(re, " ");
      p.signals++;
    }
  }

  // ---- "which X had the most/fewest <metric>" --------------------------------
  const whichMatch = q.match(
    /which (territor(?:y|ies)|product lines?|account types?|channels?|programs?|lead sources?|orgs?|regions?|quarters?) (?:had|has|have)( the)? (most|fewest|highest|lowest|least|smallest)/
  );
  if (whichMatch) {
    const nounDim: Record<string, string> = {
      "territory": "territory",
      "territories": "territory",
      "product line": "product_line",
      "product lines": "product_line",
      "account type": "account_type",
      "account types": "account_type",
      "channel": "channel",
      "channels": "channel",
      "program": "program",
      "programs": "program",
      "lead source": "lt_source",
      "lead sources": "lt_source",
      "org": "org",
      "orgs": "org",
      "region": "org",
      "regions": "org",
      "quarter": "year_quarter",
      "quarters": "year_quarter",
    };
    p.topDim = nounDim[whichMatch[1]] ?? "territory";
    p.topN = 1;
    p.orderDir = /fewest|lowest|least|smallest/.test(whichMatch[3]) ? "ASC" : "DESC";
    q = q.replace(whichMatch[0], " ");
    p.signals += 2;
  }

  // ---- top N -----------------------------------------------------------------
  const topMatch = q.match(/top (\d+|ten|five|twenty)/);
  if (topMatch) {
    const word: Record<string, number> = { ten: 10, five: 5, twenty: 20 };
    p.topN = word[topMatch[1]] ?? parseInt(topMatch[1], 10);
    q = q.replace(topMatch[0], " ");
    p.signals++;
  }
  const topNoun = q.match(
    /top (?:\d+|ten|five|twenty )?(territor(?:y|ies)|product lines?|account types?|channels?|programs?|lead sources?)/
  );
  if (topNoun && !p.topDim) {
    const nounMap: Record<string, string> = {
      "territory": "territory",
      "territories": "territory",
      "product line": "product_line",
      "product lines": "product_line",
      "account type": "account_type",
      "account types": "account_type",
      "channel": "channel",
      "channels": "channel",
      "program": "program",
      "programs": "program",
      "lead source": "lt_source",
      "lead sources": "lt_source",
    };
    p.topDim = nounMap[topNoun[1]] ?? "territory";
    if (!p.topN) p.topN = 10;
    p.groupDims = [];
    p.signals++;
  }
  if (/top accounts|largest accounts|biggest accounts/.test(q)) {
    p.topDim = "account_name";
    if (!p.topN) p.topN = 10;
    p.groupDims = []; // account grain overrides a by-dimension
    p.signals++;
  }
  if (/top territories/.test(q)) {
    p.topDim = "territory";
    if (!p.topN) p.topN = 10;
    p.groupDims = [];
    p.signals++;
  }
  if (/top (product )?lines/.test(q)) {
    p.topDim = "product_line";
    if (!p.topN) p.topN = 10;
    p.groupDims = [];
    p.signals++;
  }

  return p;
}

function buildSql(p: Parsed): { sql: string; from: string } {
  const where = p.filters.length ? `WHERE ${p.filters.join("\n    AND ")}` : "";
  const dims = p.topDim ?? (p.groupDims.length ? p.groupDims.join(", ") : null);

  if (p.metric === "return_per_dollar") {
    const where2 = p.filters.length
      ? `WHERE ${p.filters.join("\n    AND ")} AND program <> 'ALL PROGRAMS'`
      : `WHERE program <> 'ALL PROGRAMS'`;
    return {
      from: "wh.mart_attribution",
      sql: `SELECT
    year_quarter,
    program,
    spend_usd::DOUBLE            AS spend,
    influenced_revenue_last_touch::DOUBLE AS influenced_revenue,
    return_per_dollar::DOUBLE    AS return_per_dollar
  FROM wh.mart_attribution
  ${where2}
  ORDER BY year_quarter, program`,
    };
  }

  let select: string;
  let from = "wh.fct_orders";
  switch (p.metric) {
    case "accounts":
      select = "COUNT(DISTINCT account_id)::INTEGER AS accounts";
      break;
    case "orders":
      select = "COUNT(*)::INTEGER AS orders";
      break;
    case "units":
      select = "SUM(units)::INTEGER AS units";
      break;
    case "spend":
      select = "SUM(spend_usd)::DOUBLE AS spend";
      from = "wh.mart_attribution";
      break;
    case "influenced_share":
      select =
        "ROUND(100.0 * SUM(CASE WHEN is_marketing_influenced THEN revenue ELSE 0 END) / SUM(revenue), 1)::DOUBLE AS influenced_share_pct";
      break;
    default:
      select = "SUM(revenue)::DOUBLE AS revenue";
  }

  if (from === "wh.mart_attribution") {
    const w = p.filters.length ? `WHERE ${p.filters.join(" AND ")}` : "";
    return {
      from,
      sql: `SELECT ${dims ? `${dims}, ` : ""}${select.replace("spend_usd", "spend_usd")}
  FROM wh.mart_attribution
  ${w}
  ${dims ? `GROUP BY ${dims}\n  ORDER BY 2 DESC` : ""}`,
    };
  }

  const orderLimit = p.topN
    ? `ORDER BY 2 DESC\n  LIMIT ${p.topN}`
    : dims
      ? `ORDER BY ${dims === "order_month" ? dims : "1"}`
      : "";
  return {
    from,
    sql: `SELECT ${dims ? `${dims}, ` : ""}${select}
  FROM wh.fct_orders
  ${where}
  ${dims ? `GROUP BY ${dims}` : ""}
  ${orderLimit}`,
  };
}

function describeMetric(p: Parsed): string {
  switch (p.metric) {
    case "accounts": return "Buying accounts";
    case "orders": return "Orders";
    case "units": return "Units";
    case "spend": return "Program spend";
    case "influenced_share": return "Marketing-influenced share of revenue";
    case "return_per_dollar": return "Return per dollar of program spend";
    default: return "Revenue";
  }
}

function renderValue(p: Parsed, row: Row, key: string): string {
  const v = row[key];
  if (v == null) return "—";
  if (p.metric === "revenue" || key.toLowerCase().includes("revenue")) return fmtMoney(Number(v));
  if (p.metric === "influenced_share" || key === "influenced_share_pct") return fmtPct(Number(v));
  if (p.metric === "return_per_dollar" || key === "return_per_dollar") return `$${Number(v).toFixed(2)}`;
  if (typeof v === "number") return fmtNum(v);
  return String(v);
}

export async function ask(wh: Warehouse, question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) throw new Error("Ask something first — try one of the example questions below.");

  const p = parseQuestion(trimmed, { asOfQuarter: wh.asOfQuarter });
  if (p.signals < 2) {
    throw new Error(
      "I couldn't map that onto the warehouse schema. I understand questions with a metric " +
        "(revenue, orders, units, accounts, spend), filters (account types, product lines, catalog vs custom, " +
        "channels, lead sources, territories, marketing-influenced), a time window (Q3, 2026, last quarter), " +
        "and a group-by (by quarter, by product line, by territory…). Try one of the examples."
    );
  }

  const { sql } = buildSql(p);
  let rows: Row[];
  try {
    rows = await wh.run(sql);
  } catch (e) {
    throw new Error(`The generated SQL failed against the warehouse: ${(e as Error).message}`);
  }

  const valueKey =
    p.metric === "revenue" ? "revenue"
    : p.metric === "accounts" ? "accounts"
    : p.metric === "orders" ? "orders"
    : p.metric === "units" ? "units"
    : p.metric === "spend" ? "spend"
    : p.metric === "influenced_share" ? "influenced_share_pct"
    : "return_per_dollar";

  const scope = [describeMetric(p), ...p.filterDesc, p.timeDesc].filter(Boolean).join(" · ");
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const isScalar =
    rows.length === 1 && columns.length === 1 + (p.topDim ? 1 : p.groupDims.length);

  let answer: string;
  if (isScalar) {
    const dimCol = p.topDim ?? p.groupDims[0];
    const dimVal = dimCol != null ? rows[0][dimCol] : null;
    answer = dimVal != null && dimVal !== ""
      ? `${scope} — ${dimVal}: ${renderValue(p, rows[0], valueKey)}`
      : `${scope}: ${renderValue(p, rows[0], valueKey)}`;
  } else if (rows.length === 0) {
    answer = `${scope}: no rows matched.`;
  } else if (p.topN && p.topDim) {
    answer = `Top ${Math.min(p.topN, rows.length)} by ${p.topDim === "account_name" ? "account" : p.topDim.replace(/_/g, " ")} — ${scope}:`;
  } else if (p.groupDims.length) {
    answer = `${scope}, by ${p.groupLabels.join(" by ")}:`;
  } else {
    answer = `${scope}:`;
  }

  return { sql, answer, columns, rows };
}
