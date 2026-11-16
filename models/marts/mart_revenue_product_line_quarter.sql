-- mart_revenue_product_line_quarter: revenue, orders, and buying accounts
-- per product line per quarter -- the executive "what is the business made
-- of, and how is each part trending" table.
CREATE OR REPLACE TABLE mart_revenue_product_line_quarter AS
SELECT
    year_quarter,
    order_year,
    order_quarter,
    product_line,
    order_type,
    COUNT(*)                                AS orders,
    SUM(units)                              AS units,
    SUM(revenue)                            AS revenue,
    COUNT(DISTINCT account_id)              AS buying_accounts
FROM fct_orders
GROUP BY year_quarter, order_year, order_quarter, product_line, order_type
ORDER BY year_quarter, product_line;
