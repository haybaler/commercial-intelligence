#!/usr/bin/env python3
"""
Builds the DuckDB warehouse for the commercial-intelligence demo.

Runs the SQL models in /models in dependency order (staging -> dimensions ->
marts) against the raw parquet extracts produced by generate_data.py, then
persists the result as a single warehouse.duckdb file that the Next.js app
serves to duckdb-wasm in the browser.

The .sql files are the single source of truth: this script only orders and
executes them. The same files run unchanged against BigQuery/Postgres with
minor dialect edits (see README, "Running against real NetSuite + HubSpot").

Run:  python3 scripts/build_warehouse.py
Out:  data/warehouse/warehouse.duckdb (copied to public/data/warehouse.duckdb)
"""

from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data" / "warehouse"
OUT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = OUT_DIR / "warehouse.duckdb"

MODELS = [
    "staging/stg_accounts.sql",
    "staging/stg_orders.sql",
    "staging/stg_touches.sql",
    "staging/stg_program_spend.sql",
    "dimensions/dim_accounts.sql",
    "marts/fct_orders.sql",
    "marts/mart_revenue_product_line_quarter.sql",
    "marts/mart_attribution.sql",
    "marts/mart_account_health.sql",
]

if DB_PATH.exists():
    DB_PATH.unlink()

con = duckdb.connect(str(DB_PATH))

# raw layer: CSV extracts registered as raw_* tables (CSVs are the canonical
# raw form in the repo; generate_data.py additionally writes parquet for speed)
for name in ["accounts", "orders", "touches", "program_spend"]:
    csv = RAW / f"raw_{name}.csv"
    parquet = RAW / f"raw_{name}.parquet"
    src = parquet if parquet.exists() else csv
    con.execute(f"CREATE TABLE raw_{name} AS SELECT * FROM '{src}'")

for model in MODELS:
    sql = (ROOT / "models" / model).read_text()
    con.execute(sql)
    print(f"  built  {model}")

# --- validation ----------------------------------------------------------------
print("\nvalidation:")
checks = {
    "orders in fct_orders": "SELECT COUNT(*) FROM fct_orders",
    "accounts in dim": "SELECT COUNT(*) FROM dim_accounts",
    "orders rejected in staging": "SELECT COUNT(*) FROM stg_orders_rejects",
    "fct rows with account dim match":
        "SELECT COUNT(*) FROM fct_orders f LEFT JOIN dim_accounts d "
        "USING(account_id) WHERE d.account_id IS NULL",
    "health flags":
        "SELECT string_agg(health_status || '=' || n, ', ' ORDER BY health_status) "
        "FROM (SELECT health_status, COUNT(*) n FROM mart_account_health GROUP BY 1)",
}
for label, sql in checks.items():
    print(f"  {label}: {con.execute(sql).fetchone()[0]}")

con.execute("CHECKPOINT")
con.close()

# the app fetches the warehouse from /public/data; keep the copy in sync
import shutil
PUBLIC_COPY = ROOT / "public" / "data" / "warehouse.duckdb"
PUBLIC_COPY.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(DB_PATH, PUBLIC_COPY)

size_mb = DB_PATH.stat().st_size / 1e6
print(f"\nwrote {DB_PATH} ({size_mb:.1f} MB)")
print(f"copied -> {PUBLIC_COPY}")
