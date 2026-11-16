-- stg_orders: cleaned order lines from the raw extract.
-- Raw source: NetSuite sales orders (synthetic). We cast types, derive
-- calendar attributes once (so every mart agrees on "Q3"), and quarantine
-- the two things raw ERP extracts always contain: non-positive revenue and
-- orders with no account. Quarantined rows land in stg_orders_rejects.
CREATE OR REPLACE TABLE stg_orders AS
SELECT
    order_id,
    CAST(order_date AS DATE) AS order_date,
    account_id,
    TRIM(product_line) AS product_line,
    TRIM(sku)          AS sku,
    LOWER(TRIM(order_type)) AS order_type,          -- 'catalog' | 'custom'
    CAST(units AS INTEGER)  AS units,
    CAST(revenue AS DECIMAL(18,2)) AS revenue,
    TRIM(channel)      AS channel,
    TRIM(lead_source)  AS lead_source,
    CAST(first_touch_date AS DATE) AS first_touch_date,
    CAST(last_touch_date  AS DATE) AS last_touch_date,
    -- calendar attributes, derived once
    YEAR(order_date)                              AS order_year,
    QUARTER(order_date)                           AS order_quarter,
    YEAR(order_date) || '-Q' || QUARTER(order_date) AS year_quarter,
    DATE_TRUNC('month', CAST(order_date AS DATE)) AS order_month
FROM raw_orders
WHERE account_id IS NOT NULL
  AND revenue > 0;

CREATE OR REPLACE TABLE stg_orders_rejects AS
SELECT *
FROM raw_orders
WHERE account_id IS NULL OR revenue <= 0;
