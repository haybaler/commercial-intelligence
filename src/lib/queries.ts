import type {
  AttributionSummaryRow,
  HealthRow,
  MixRow,
  ProgramRow,
  QuarterlyRow,
  Row,
  Warehouse,
} from "./types";

export interface DashboardData {
  quarterly: QuarterlyRow[];
  mix: MixRow[];
  attributionSummary: AttributionSummaryRow[];
  programs: ProgramRow[];
  health: HealthRow[];
}

export async function loadDashboardData(wh: Warehouse): Promise<DashboardData> {
  const quarterly = (await wh.run(`
    SELECT
      year_quarter,
      order_year,
      order_quarter,
      SUM(revenue)::DOUBLE                                  AS revenue,
      COUNT(*)::INTEGER                                     AS orders,
      COUNT(DISTINCT account_id)::INTEGER                   AS buying_accounts,
      SUM(CASE WHEN is_new_account_order THEN revenue ELSE 0 END)::DOUBLE AS new_account_revenue,
      SUM(CASE WHEN NOT is_new_account_order THEN revenue ELSE 0 END)::DOUBLE AS repeat_account_revenue,
      SUM(CASE WHEN is_marketing_influenced THEN revenue ELSE 0 END)::DOUBLE  AS influenced_revenue,
      ROUND(100.0 * SUM(CASE WHEN is_marketing_influenced THEN revenue ELSE 0 END) / SUM(revenue), 1)::DOUBLE AS influenced_share
    FROM wh.fct_orders
    GROUP BY year_quarter, order_year, order_quarter
    ORDER BY order_year, order_quarter
  `)) as unknown as QuarterlyRow[];

  const mix = (await wh.run(`
    SELECT
      year_quarter,
      product_line,
      order_type,
      revenue::DOUBLE             AS revenue,
      orders::INTEGER             AS orders,
      buying_accounts::INTEGER    AS buying_accounts
    FROM wh.mart_revenue_product_line_quarter
    ORDER BY year_quarter, product_line
  `)) as unknown as MixRow[];

  const attributionSummary = (await wh.run(`
    SELECT
      year_quarter,
      total_revenue::DOUBLE                        AS total_revenue,
      influenced_revenue_last_touch::DOUBLE        AS influenced_revenue_last_touch,
      influenced_revenue_first_touch::DOUBLE     AS influenced_revenue_first_touch,
      influenced_share_pct::DOUBLE                 AS influenced_share_pct
    FROM wh.mart_attribution
    WHERE program = 'ALL PROGRAMS'
    ORDER BY year_quarter
  `)) as unknown as AttributionSummaryRow[];

  const programs = (await wh.run(`
    SELECT
      year_quarter,
      program,
      spend_usd::DOUBLE                          AS spend_usd,
      influenced_revenue_last_touch::DOUBLE      AS influenced_revenue_last_touch,
      return_per_dollar::DOUBLE                  AS return_per_dollar
    FROM wh.mart_attribution
    WHERE program <> 'ALL PROGRAMS'
    ORDER BY year_quarter, program
  `)) as unknown as ProgramRow[];

  const health = (await wh.run(`
    SELECT
      account_id,
      account_name,
      account_type,
      tier,
      territory,
      org,
      last_order_date::VARCHAR      AS last_order_date,
      days_since_last_order::INTEGER AS days_since_last_order,
      total_revenue::DOUBLE         AS total_revenue,
      trailing_2q_revenue::DOUBLE   AS trailing_2q_revenue,
      prev_2q_revenue::DOUBLE       AS prev_2q_revenue,
      trailing_vs_prior_2q_ratio::DOUBLE AS trailing_vs_prior_2q_ratio,
      trailing_6m_revenue::DOUBLE   AS trailing_6m_revenue,
      segment_median_6m_revenue::DOUBLE AS segment_median_6m_revenue,
      ratio_to_segment_median::DOUBLE AS ratio_to_segment_median,
      health_status
    FROM wh.mart_account_health
  `)) as unknown as HealthRow[];

  return { quarterly, mix, attributionSummary, programs, health };
}

export type { Row };
