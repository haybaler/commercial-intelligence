-- stg_program_spend: marketing program spend by quarter.
-- Raw source: marketing budget actuals (synthetic). Program names follow
-- the budget, which is why they don't match lead_source one-to-one; the
-- mapping lives in marts/mart_attribution.sql.
CREATE OR REPLACE TABLE stg_program_spend AS
SELECT
    TRIM(year_quarter) AS year_quarter,
    TRIM(program)  AS program,
    CAST(spend_usd AS DECIMAL(18,2)) AS spend_usd
FROM raw_program_spend;
