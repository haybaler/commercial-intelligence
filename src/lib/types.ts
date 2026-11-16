export type Row = Record<string, string | number | boolean | null>;

export interface Warehouse {
  /** Run a read-only query against the attached warehouse. */
  run(sql: string): Promise<Row[]>;
  /** Most recent quarter present in the data, e.g. "2024-Q4". */
  asOfQuarter: string;
  /** All quarters present, in chronological order. */
  quarters: string[];
  close(): Promise<void>;
}

export type ViewKey = "executive" | "attribution" | "health" | "ask";

export interface QuarterlyRow extends Row {
  year_quarter: string;
  order_year: number;
  order_quarter: number;
  revenue: number;
  orders: number;
  buying_accounts: number;
  new_account_revenue: number;
  repeat_account_revenue: number;
  influenced_revenue: number;
  influenced_share: number;
}

export interface MixRow extends Row {
  year_quarter: string;
  product_line: string;
  order_type: string;
  revenue: number;
  orders: number;
  buying_accounts: number;
}

export interface AttributionSummaryRow extends Row {
  year_quarter: string;
  total_revenue: number;
  influenced_revenue_last_touch: number;
  influenced_revenue_first_touch: number;
  influenced_share_pct: number;
}

export interface ProgramRow extends Row {
  year_quarter: string;
  program: string;
  spend_usd: number | null;
  influenced_revenue_last_touch: number;
  return_per_dollar: number | null;
}

export interface HealthRow extends Row {
  account_id: string;
  account_name: string;
  account_type: string;
  tier: string;
  territory: string;
  org: string;
  last_order_date: string | null;
  days_since_last_order: number | null;
  total_revenue: number | null;
  trailing_2q_revenue: number;
  prev_2q_revenue: number;
  trailing_vs_prior_2q_ratio: number | null;
  trailing_6m_revenue: number;
  segment_median_6m_revenue: number;
  ratio_to_segment_median: number | null;
  health_status: string;
}
