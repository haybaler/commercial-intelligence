-- stg_accounts: cleaned account master from the raw extract.
-- Raw source: NetSuite customer records (synthetic). Nothing fancy here on
-- purpose -- staging is where raw records become typed, trimmed, and
-- deduplicated so every downstream model can trust them.
CREATE OR REPLACE TABLE stg_accounts AS
SELECT
    account_id,
    TRIM(account_name)  AS account_name,
    LOWER(TRIM(account_type)) AS account_type,
    LOWER(TRIM(tier))   AS tier,
    TRIM(territory)     AS territory,
    TRIM(org)           AS org
FROM raw_accounts
WHERE account_id IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY account_name) = 1;
