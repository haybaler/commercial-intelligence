-- mart_account_health: which accounts need a phone call?
--
-- Flags, with thresholds chosen to be explainable in a hallway conversation:
--
--   GONE QUIET     ordered historically, but nothing in the last 120 days
--                  (and at least one order in the 12 months before going quiet)
--   UNDER-BUYING   still ordering, but trailing 2 quarters < 50% of the
--                  prior 2 quarters' revenue
--   WATCH          trailing 2 quarters between 50% and 75% of prior
--   HEALTHY        everything else; accounts with < 2 quarters of history
--                  are HEALTHY by definition (not enough evidence)
--
-- "Versus their segment" is expressed as trailing-6-month revenue vs. the
-- segment (account-type) median, so a CRO isn't compared to an OEM.
-- Recency is measured against the warehouse's max order date, not the wall
-- clock, so the mart stays reproducible on a static snapshot.
CREATE OR REPLACE TABLE mart_account_health AS
WITH bounds AS (
    SELECT MAX(order_date) AS as_of FROM fct_orders
),
activity AS (
    SELECT
        account_id,
        MIN(order_date) AS first_order_date,
        MAX(order_date) AS last_order_date,
        COUNT(*)        AS total_orders,
        SUM(revenue)    AS total_revenue
    FROM fct_orders
    GROUP BY account_id
),
rev_2q AS (   -- trailing two full quarters
    SELECT account_id, SUM(revenue) AS trailing_2q_revenue
    FROM fct_orders
    WHERE order_date > (SELECT as_of FROM bounds) - INTERVAL 6 MONTHS
    GROUP BY account_id
),
rev_prev_2q AS (   -- the two quarters before that
    SELECT account_id, SUM(revenue) AS prev_2q_revenue
    FROM fct_orders
    WHERE order_date > (SELECT as_of FROM bounds) - INTERVAL 12 MONTHS
      AND order_date <= (SELECT as_of FROM bounds) - INTERVAL 6 MONTHS
    GROUP BY account_id
),
rev_6m AS (
    SELECT account_id, SUM(revenue) AS trailing_6m_revenue
    FROM fct_orders
    WHERE order_date > (SELECT as_of FROM bounds) - INTERVAL 6 MONTHS
    GROUP BY account_id
),
segment_benchmark AS (
    -- segment = account type; median trailing-6-month revenue per account
    SELECT d.account_type,
           MEDIAN(COALESCE(r.trailing_6m_revenue, 0)) AS segment_median_6m_revenue
    FROM dim_accounts d
    LEFT JOIN rev_6m r ON r.account_id = d.account_id
    GROUP BY d.account_type
)
SELECT
    d.account_id,
    d.account_name,
    d.account_type,
    d.tier,
    d.territory,
    d.org,
    a.first_order_date,
    a.last_order_date,
    CAST((SELECT as_of FROM bounds) - a.last_order_date AS INTEGER) AS days_since_last_order,
    a.total_orders,
    a.total_revenue,
    COALESCE(r2.trailing_2q_revenue, 0)  AS trailing_2q_revenue,
    COALESCE(rp.prev_2q_revenue, 0)      AS prev_2q_revenue,
    CASE WHEN COALESCE(rp.prev_2q_revenue, 0) > 0
         THEN ROUND(COALESCE(r2.trailing_2q_revenue, 0) / rp.prev_2q_revenue, 2)
    END AS trailing_vs_prior_2q_ratio,
    COALESCE(r6.trailing_6m_revenue, 0)  AS trailing_6m_revenue,
    b.segment_median_6m_revenue,
    CASE WHEN b.segment_median_6m_revenue > 0
         THEN ROUND(COALESCE(r6.trailing_6m_revenue, 0) / b.segment_median_6m_revenue, 2)
    END AS ratio_to_segment_median,
    CASE
        WHEN a.account_id IS NULL THEN 'NEVER ORDERED'
        -- Save plays are reserved for accounts with enough lifetime value to
        -- justify commercial attention; small one-and-done records stay visible
        -- in the mart but do not become health flags.
        WHEN COALESCE(a.total_revenue, 0) < 25000 THEN 'BELOW THRESHOLD'
        WHEN CAST((SELECT as_of FROM bounds) - a.last_order_date AS INTEGER) > 120
             AND a.last_order_date > (SELECT as_of FROM bounds) - INTERVAL 24 MONTHS
            THEN 'GONE QUIET'
        WHEN COALESCE(rp.prev_2q_revenue, 0) > 0
             AND COALESCE(r2.trailing_2q_revenue, 0) < 0.5 * rp.prev_2q_revenue
            THEN 'UNDER-BUYING'
        WHEN COALESCE(rp.prev_2q_revenue, 0) > 0
             AND COALESCE(r2.trailing_2q_revenue, 0) < 0.75 * rp.prev_2q_revenue
            THEN 'WATCH'
        ELSE 'HEALTHY'
    END AS health_status
FROM dim_accounts d
LEFT JOIN activity a           ON a.account_id = d.account_id
LEFT JOIN rev_2q r2            ON r2.account_id = d.account_id
LEFT JOIN rev_prev_2q rp       ON rp.account_id = d.account_id
LEFT JOIN rev_6m r6            ON r6.account_id = d.account_id
LEFT JOIN segment_benchmark b  ON b.account_type = d.account_type
ORDER BY health_status, total_revenue DESC;
