-- dim_accounts: one row per account with type/territory mapping plus
-- acquisition facts. This is the dimension every mart joins back to, so
-- account type and territory are defined exactly once, here.
CREATE OR REPLACE TABLE dim_accounts AS
WITH firsts AS (
    SELECT
        account_id,
        MIN(order_date)                                  AS first_order_date,
        MAX(order_date)                                  AS last_order_date,
        COUNT(*)                                         AS lifetime_orders,
        SUM(revenue)                                     AS lifetime_revenue
    FROM stg_orders
    GROUP BY account_id
),
first_touch AS (
    -- first-touch attribution starts at the account's very first recorded
    -- marketing touch, however long ago that was
    SELECT
        account_id,
        MIN(touch_date) AS first_touch_date
    FROM stg_touches
    GROUP BY account_id
)
SELECT
    a.account_id,
    a.account_name,
    a.account_type,
    a.tier,
    a.territory,
    a.org,
    f.first_order_date,
    YEAR(f.first_order_date) || '-Q' || QUARTER(f.first_order_date) AS first_order_quarter,
    f.last_order_date,
    f.lifetime_orders,
    f.lifetime_revenue,
    ft.first_touch_date,
    -- an account is "new" for the quarter of its first order and the two
    -- quarters after; mart logic uses first_order_quarter directly so the
    -- definition is inspectable rather than buried in a CASE statement
    f.first_order_date IS NOT NULL AS has_ordered
FROM stg_accounts a
LEFT JOIN firsts f       ON f.account_id = a.account_id
LEFT JOIN first_touch ft ON ft.account_id = a.account_id;
