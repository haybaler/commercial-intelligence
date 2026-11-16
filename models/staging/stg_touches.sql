-- stg_touches: cleaned marketing touch log.
-- Raw source: HubSpot engagement events (synthetic). A touch is any
-- attributable marketing interaction: form fill, webinar attendance,
-- email click, booth visit, etc.
CREATE OR REPLACE TABLE stg_touches AS
SELECT
    touch_id,
    account_id,
    CAST(touch_date AS DATE) AS touch_date,
    TRIM(touch_type) AS touch_type,
    TRIM(channel)    AS source
FROM raw_touches
WHERE account_id IS NOT NULL;
