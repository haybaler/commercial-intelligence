-- fct_orders: the core fact. One row per order line, carrying everything the
-- marts and the app need, with attribution resolved at order grain:
--
--   * new vs repeat       -- is this the account's first-ever order?
--   * catalog vs custom   -- order_type from the ERP line
--   * marketing influence  -- a credited touch in the 90 days before the
--     order. "Credited", not "proven incremental" -- same honesty rule as
--     the Slingshot board KPIs this demo is modeled on.
--   * first-touch source  -- source of the account's earliest touch ever
--   * last-touch source   -- source of the most recent touch within 90 days
--
-- First-touch and last-touch are compared head-to-head in mart_attribution;
-- keeping both as columns here means the mart SQL stays readable.
CREATE OR REPLACE TABLE fct_orders AS
WITH attributed AS (
    SELECT
        o.*,
        d.account_name,
        d.account_type,
        d.tier,
        d.territory,
        d.org,
        d.first_order_date,
        d.first_touch_date AS account_first_touch_date,
        -- last-touch: most recent campaign touch within 90 days; acquisition
        -- touches remain in first-touch credit rather than inflating both models
        (SELECT t.source
           FROM stg_touches t
          WHERE t.account_id = o.account_id
            AND t.touch_type = 'last'
            AND t.touch_date <= o.order_date
            AND t.touch_date >  o.order_date - INTERVAL 90 DAYS
          ORDER BY t.touch_date DESC
          LIMIT 1) AS lt_source,
        (SELECT MAX(t.touch_date)
           FROM stg_touches t
          WHERE t.account_id = o.account_id
            AND t.touch_type = 'last'
            AND t.touch_date <= o.order_date
            AND t.touch_date >  o.order_date - INTERVAL 90 DAYS) AS lt_date,
        -- first-touch source at account level: the source of the earliest
        -- recorded touch (how the account originally found us)
        (SELECT t.source
           FROM stg_touches t
          WHERE t.account_id = o.account_id
          ORDER BY t.touch_date ASC
          LIMIT 1) AS ft_source
    FROM stg_orders o
    JOIN dim_accounts d ON d.account_id = o.account_id
)
SELECT
    order_id,
    order_date,
    order_year,
    order_quarter,
    year_quarter,
    order_month,
    account_id,
    account_name,
    account_type,
    tier,
    territory,
    org,
    product_line,
    sku,
    order_type,
    order_type = 'catalog' AS is_catalog,
    units,
    revenue,
    channel,
    lead_source,
    -- new vs repeat: preserved from the order simulation at order grain
    is_new_account_order,
    first_order_date,
    -- attribution
    lt_source,
    ft_source,
    lt_date AS last_touch_date_resolved,
    account_first_touch_date AS first_touch_date_resolved,
    CAST(order_date - lt_date AS INTEGER) AS days_since_last_touch,
    lt_source IS NOT NULL AS is_marketing_influenced
FROM attributed;
