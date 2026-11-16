-- mart_attribution: marketing-influenced revenue and return per dollar of
-- program spend. Two grains, one table:
--
--   * one summary row per quarter (all-program influenced revenue, both
--     first-touch and last-touch views side by side)
--   * one row per quarter x program (spend vs credited revenue -> return $)
--
-- The budget's program names don't match HubSpot lead sources one-to-one,
-- so the mapping is explicit here -- this is the same conversation a RevOps
-- lead has with Finance every planning cycle:
--
--   Paid Search      <- 'Paid Search'
--   Organic & Content<- 'Organic Search', 'Content'
--   Referral         <- 'Referral'
--   Email Nurture    <- 'Email'
--   Webinars         <- 'Webinar'
--   Trade Shows      <- 'Trade Show'
--   Partner Marketing<- 'Partner'
--   Field Demos      <- 'Field Demo'
--   Outbound Sales   <- 'Outbound Sales'
--
-- Credit model for the return-per-dollar view: last-touch within 90 days.
-- First-touch credit would flatter long-running programs (everything traces
-- back to them); last-touch flatters closers. Showing both quarter-level
-- numbers is the honest way to present a model choice, so the view does.
CREATE OR REPLACE TABLE mart_attribution AS
WITH order_credit AS (
    SELECT
        year_quarter,
        revenue,
        is_marketing_influenced,
        lt_source,
        ft_source
    FROM fct_orders
),
-- normalize lead sources to budget programs
source_to_program AS (
    SELECT * FROM (VALUES
        ('Paid Search',      'Paid Search'),
        ('Organic Search',   'Organic & Content'),
        ('Content',          'Organic & Content'),
        ('Referral',         'Referral'),
        ('Email',            'Email Nurture'),
        ('Webinar',          'Webinars'),
        ('Trade Show',       'Trade Shows'),
        ('Partner',          'Partner Marketing'),
        ('Field Demo',       'Field Demos'),
        ('Outbound Sales',   'Outbound Sales')
    ) AS m(source, program)
),
quarter_summary AS (
    SELECT
        year_quarter,
        'ALL PROGRAMS'                              AS program,
        SUM(revenue)                                AS total_revenue,
        SUM(CASE WHEN is_marketing_influenced THEN revenue ELSE 0 END)
                                                    AS influenced_revenue_last_touch,
        SUM(CASE WHEN ft_source IS NOT NULL THEN revenue ELSE 0 END)
                                                    AS influenced_revenue_first_touch,
        NULL::DECIMAL(18,2)                         AS spend_usd,
        ROUND(100.0 * SUM(CASE WHEN is_marketing_influenced THEN revenue ELSE 0 END)
              / SUM(revenue), 1)                    AS influenced_share_pct
    FROM order_credit
    GROUP BY year_quarter
),
program_quarter AS (
    SELECT
        f.year_quarter,
        COALESCE(m.program, 'Unattributed')         AS program,
        SUM(CASE WHEN f.is_marketing_influenced THEN f.revenue ELSE 0 END)
                                                    AS influenced_revenue_last_touch,
        SUM(f.revenue)                              AS total_revenue,
        s.spend_usd,
        ROUND(SUM(CASE WHEN f.is_marketing_influenced THEN f.revenue ELSE 0 END)
              / NULLIF(s.spend_usd, 0), 2)          AS return_per_dollar
    FROM order_credit f
    LEFT JOIN source_to_program m ON m.source = f.lt_source
    LEFT JOIN stg_program_spend s
           ON s.year_quarter = f.year_quarter
          AND s.program      = COALESCE(m.program, 'Unattributed')
    GROUP BY f.year_quarter, COALESCE(m.program, 'Unattributed'), s.spend_usd
)
SELECT
    year_quarter,
    program,
    total_revenue,
    influenced_revenue_last_touch,
    influenced_revenue_first_touch,
    spend_usd,
    influenced_share_pct,
    CAST(NULL AS DOUBLE) AS return_per_dollar   -- only meaningful per program
FROM quarter_summary
UNION ALL
SELECT
    year_quarter,
    program,
    total_revenue,
    influenced_revenue_last_touch,
    NULL::DOUBLE,                               -- first-touch credit is summary-level only
    spend_usd,
    CAST(NULL AS DOUBLE) AS influenced_share_pct,
    return_per_dollar
FROM program_quarter;
