#!/usr/bin/env python3
"""
Synthetic data generator for the commercial-intelligence demo.

Produces four raw tables (as CSV + parquet) for a fictional life-sciences
tools company, "Quillmere Bio" (invented; any resemblance is coincidental):

  raw_accounts       ~400 accounts with type, tier, territory, org
  raw_orders         ~3,000 orders over 24 months (2024-11 .. 2026-10)
  raw_touches        ~5,000 marketing touches
  raw_program_spend  program spend by quarter

Design goals (these drive the demo's story, see README):
  * Overall growth with Sep/Oct conference-season seasonality.
  * Marketing-influenced share of orders rises over time (~36% -> ~60%+),
    mirroring what a maturing demand engine looks like.
  * A slice of accounts "go quiet" in 2026 (nothing ordered for 120+ days)
    so the account-health mart has something real to flag.
  * A slice of accounts under-buy vs. their segment median.
  * Catalog lines (controls, reagents, consumables, services) vs. custom
    lines (custom cell engineering, OEM components).

Everything is seeded (np.random.default_rng(42)) so output is reproducible.

Run:  python3 scripts/generate_data.py
Out:  data/raw/*.csv and data/raw/*.parquet
"""

from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
rng = np.random.default_rng(SEED)

START = pd.Timestamp("2024-11-01")
END = pd.Timestamp("2026-10-31")
MONTHS = pd.date_range(START, END, freq="MS")  # 24 month starts
N_MONTHS = len(MONTHS)
AS_OF = END  # "today" for recency calculations in the marts

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

ACCOUNT_TYPES = ["biopharma", "CDMO", "CRO", "academic", "clinical lab", "OEM"]
TYPE_WEIGHTS = np.array([0.30, 0.12, 0.13, 0.17, 0.16, 0.12])
TYPE_MULT = {  # order-frequency multiplier by account type
    "biopharma": 1.15,
    "CDMO": 1.10,
    "CRO": 1.00,
    "academic": 0.70,
    "clinical lab": 1.20,
    "OEM": 0.80,
}
TIERS = ["enterprise", "mid", "small"]
TIER_WEIGHTS = np.array([0.20, 0.45, 0.35])
TIER_P = {  # base monthly probability of placing >=1 order
    "enterprise": 0.55,
    "mid": 0.38,
    "small": 0.22,
}
CHANNEL_WEIGHTS = {
    "enterprise": {"direct": 0.60, "inside sales": 0.25, "distributor": 0.10, "e-commerce": 0.05},
    "mid": {"direct": 0.35, "inside sales": 0.35, "distributor": 0.20, "e-commerce": 0.10},
    "small": {"direct": 0.15, "inside sales": 0.35, "distributor": 0.20, "e-commerce": 0.30},
}

TERRITORIES = {
    "US-West": "North America",
    "US-East": "North America",
    "US-Central": "North America",
    "EU-North": "EMEA",
    "EU-South": "EMEA",
    "APAC": "APAC",
}

# Product lines: (name, order_type, base price/unit, unit range)
PRODUCT_LINES = {
    "Cell Mimic Controls": {
        "order_type": "catalog",
        "skus": {"CMC-101": 485.0, "CMC-102": 1250.0, "CMC-103": 2900.0},
        "units": (1, 12),
    },
    "Assay Reagents": {
        "order_type": "catalog",
        "skus": {"ASR-201": 165.0, "ASR-202": 380.0, "ASR-203": 590.0},
        "units": (2, 30),
    },
    "Flow Consumables": {
        "order_type": "catalog",
        "skus": {"FCX-301": 95.0, "FCX-302": 210.0, "FCX-303": 340.0},
        "units": (4, 40),
    },
    "Instrument Services": {
        "order_type": "catalog",
        "skus": {"SVC-401": 2400.0, "SVC-402": 5800.0},
        "units": (1, 2),
    },
    "Custom Cell Engineering": {
        "order_type": "custom",
        "skus": {"CCE-501": np.nan},  # priced per project, lognormal below
        "units": (1, 1),
    },
    "OEM Components": {
        "order_type": "custom",
        "skus": {"OEM-601": np.nan, "OEM-602": np.nan},
        "units": (1, 2),
    },
}

# Product-line affinity by account type (weights, order = PRODUCT_LINES keys)
LINE_KEYS = list(PRODUCT_LINES.keys())
LINE_AFFINITY = {
    "biopharma":   [0.26, 0.20, 0.14, 0.10, 0.22, 0.08],
    "CDMO":        [0.30, 0.22, 0.16, 0.12, 0.16, 0.04],
    "CRO":         [0.34, 0.26, 0.14, 0.08, 0.16, 0.02],
    "academic":    [0.30, 0.28, 0.18, 0.08, 0.14, 0.02],
    "clinical lab": [0.40, 0.18, 0.26, 0.12, 0.02, 0.02],
    "OEM":         [0.10, 0.06, 0.10, 0.04, 0.10, 0.60],
}

SOURCES = ["Organic Search", "Paid Search", "Email", "Content", "Webinar",
           "Trade Show", "Partner", "Referral"]
TOUCH_SOURCE_DIST = {
    "biopharma":    [0.14, 0.10, 0.12, 0.16, 0.18, 0.12, 0.08, 0.10],
    "CDMO":         [0.12, 0.06, 0.12, 0.15, 0.20, 0.15, 0.12, 0.08],
    "CRO":          [0.12, 0.06, 0.12, 0.15, 0.20, 0.15, 0.12, 0.08],
    "academic":     [0.24, 0.08, 0.10, 0.20, 0.18, 0.10, 0.04, 0.06],
    "clinical lab": [0.22, 0.16, 0.16, 0.12, 0.08, 0.10, 0.06, 0.10],
    "OEM":          [0.08, 0.04, 0.10, 0.15, 0.12, 0.20, 0.25, 0.06],
}
TOUCH_TYPES = ["content download", "webinar attendance", "email click",
               "form fill", "booth visit", "ad click", "high-intent site visit"]
TOUCH_TYPE_FOR_SOURCE = {
    "Organic Search": "high-intent site visit",
    "Paid Search": "ad click",
    "Email": "email click",
    "Content": "content download",
    "Webinar": "webinar attendance",
    "Trade Show": "booth visit",
    "Partner": "content download",
    "Referral": "form fill",
}

# Monthly seasonality (Sep/Oct conference season peaks; Dec dips)
SEASONALITY = {1: 0.85, 2: 0.90, 3: 1.05, 4: 1.00, 5: 0.95, 6: 1.00,
               7: 0.90, 8: 1.00, 9: 1.15, 10: 1.15, 11: 0.85, 12: 0.80}

NAME_PREFIXES = [
    "Veyra", "Kordex", "Talvane", "Ostrin", "Caldera", "Sorvent", "Alcuin",
    "Nuvella", "Zefira", "Halloway", "Osmantix", "Ferrovue", "Lentrex",
    "Cavell", "Dornach", "Esker", "Fallow", "Quill", "Brantley", "Corvale",
    "Dunmore", "Ellison", "Fenwick", "Grantham", "Hollis", "Iverson",
    "Kestrel", "Loxley", "Marlowe", "Norwood", "Oakhurst", "Pemberton",
    "Quintrell", "Ravenswood", "Stanton", "Thackeray", "Underhill",
    "Vandermeer", "Wexford", "Yardley", "Ashcombe", "Blackwood", "Colfax",
    "Drysdale", "Everly", "Fairbanks", "Grosvenor", "Hawthorne",
]
NAME_SUFFIXES = [
    "Bio", "Therapeutics", "Labs", "BioWorks", "Diagnostics", "Genomics",
    "Biologics", "Sciences", "CellWorks", "Analytica", "Biosciences",
    "Molecular", "Proteomics", "BioSystems", "Cytometry Works",
]


def make_account_names(n: int) -> list[str]:
    names = set()
    while len(names) < n:
        p = NAME_PREFIXES[rng.integers(0, len(NAME_PREFIXES))]
        s = NAME_SUFFIXES[rng.integers(0, len(NAME_SUFFIXES))]
        names.add(f"{p} {s}")
    return sorted(names)


# ---------------------------------------------------------------------------
# 1. Accounts
# ---------------------------------------------------------------------------

N_ACCOUNTS = 400
names = make_account_names(N_ACCOUNTS)
acct_types = rng.choice(ACCOUNT_TYPES, size=N_ACCOUNTS, p=TYPE_WEIGHTS)
tiers = rng.choice(TIERS, size=N_ACCOUNTS, p=TIER_WEIGHTS)
territories = rng.choice(list(TERRITORIES), size=N_ACCOUNTS,
                         p=[0.20, 0.22, 0.13, 0.12, 0.08, 0.25])

accounts = pd.DataFrame({
    "account_id": [f"ACC-{i+1:04d}" for i in range(N_ACCOUNTS)],
    "account_name": names,
    "account_type": acct_types,
    "tier": tiers,
    "territory": territories,
})
accounts["org"] = accounts["territory"].map(TERRITORIES)

# Acquisition month: most accounts exist from the start; ~12% arrive later
# so "new accounts" is a real, observable phenomenon in the data.
accounts["cohort_month_idx"] = 0
late_idx = rng.choice(N_ACCOUNTS, size=int(0.12 * N_ACCOUNTS), replace=False)
accounts.loc[late_idx, "cohort_month_idx"] = rng.integers(6, 18, size=len(late_idx))

# Lifecycle: ~15% of accounts go quiet at some point in 2026 (after month idx
# ~15-19, i.e. Feb-Jun 2026). Another ~8% keep ordering but much less
# often -> "under-buying vs segment" in the health mart.
accounts["quiet_after_idx"] = N_MONTHS + 1  # never
quiet_pool = rng.choice(N_ACCOUNTS, size=int(0.15 * N_ACCOUNTS), replace=False)
accounts.loc[quiet_pool, "quiet_after_idx"] = rng.integers(14, 20, size=len(quiet_pool))
accounts["drop_factor"] = 1.0
drop_pool = rng.choice(N_ACCOUNTS, size=int(0.08 * N_ACCOUNTS), replace=False)
accounts.loc[drop_pool, "drop_factor"] = rng.uniform(0.20, 0.40, size=len(drop_pool))

# Marketing responsiveness: probability an order has a qualifying touch in
# the prior 90 days. Rises over time (maturing demand engine).
RESP_BASE = {"biopharma": 0.68, "CDMO": 0.58, "CRO": 0.62,
             "academic": 0.72, "clinical lab": 0.52, "OEM": 0.34}


# ---------------------------------------------------------------------------
# 2. Marketing touches
# ---------------------------------------------------------------------------

touch_rows = []
touch_id = 0
for _, acct in accounts.iterrows():
    # touches/month scale with tier; OEM partners touched less digitally
    p_touch = {"enterprise": 0.65, "mid": 0.45, "small": 0.28}[acct["tier"]]
    p_touch *= 1.0 if acct["account_type"] != "OEM" else 0.6
    dist = TOUCH_SOURCE_DIST[acct["account_type"]]
    for m in range(int(acct["cohort_month_idx"]), N_MONTHS):
        # marketing effort ramps up over the two years
        ramp = 0.6 + 0.4 * (m / N_MONTHS)
        if rng.random() < p_touch * ramp * SEASONALITY[MONTHS[m].month]:
            src = rng.choice(SOURCES, p=dist)
            day_offset = rng.integers(0, 28)
            touch_rows.append({
                "touch_id": f"TCH-{touch_id+1:05d}",
                "account_id": acct["account_id"],
                "touch_date": (MONTHS[m] + pd.Timedelta(days=int(day_offset))).date(),
                "touch_type": TOUCH_TYPE_FOR_SOURCE[src],
                "source": src,
            })
            touch_id += 1

touches = pd.DataFrame(touch_rows)
touches["touch_date"] = pd.to_datetime(touches["touch_date"])

# ---------------------------------------------------------------------------
# 3. Orders (~3,000)
# ---------------------------------------------------------------------------

# Two-pass: compute expected count, scale probabilities to land near 3,000.
expected = 0.0
for _, acct in accounts.iterrows():
    p_base = TIER_P[acct["tier"]] * TYPE_MULT[acct["account_type"]]
    for m in range(int(acct["cohort_month_idx"]), N_MONTHS):
        g = 1.0 + 0.018 * m
        expected += p_base * g * SEASONALITY[MONTHS[m].month]
SCALE = 3270.0 / expected  # binomial contraction lands realization near 3,000
print(f"expected orders before scaling: {expected:.0f} (scale factor {SCALE:.3f})")

touches_by_acct = {aid: g.sort_values("touch_date") for aid, g in touches.groupby("account_id")}

order_rows = []
order_id = 0
for _, acct in accounts.iterrows():
    aid = acct["account_id"]
    p_base = TIER_P[acct["tier"]] * TYPE_MULT[acct["account_type"]] * SCALE
    acct_touches = touches_by_acct.get(aid)
    dist = np.array(LINE_AFFINITY[acct["account_type"]])
    chan_w = CHANNEL_WEIGHTS[acct["tier"]]
    resp = RESP_BASE[acct["account_type"]]
    first_touch_date = acct_touches["touch_date"].min() if acct_touches is not None else None

    for m in range(int(acct["cohort_month_idx"]), N_MONTHS):
        if m >= acct["quiet_after_idx"]:
            continue  # gone quiet -> no more orders
        g = 1.0 + 0.018 * m
        p = p_base * g * SEASONALITY[MONTHS[m].month]
        if acct["drop_factor"] < 1.0 and m >= 14:
            p *= acct["drop_factor"]  # under-buying: still orders, far less often
        if rng.random() >= p:
            continue

        order_id += 1
        order_date = MONTHS[m] + pd.Timedelta(days=int(rng.integers(0, 28)))
        line = LINE_KEYS[rng.choice(len(LINE_KEYS), p=dist / dist.sum())]
        line_info = PRODUCT_LINES[line]
        sku = list(line_info["skus"])[rng.integers(0, len(line_info["skus"]))]
        lo, hi = line_info["units"]
        units = int(rng.integers(lo, hi + 1))

        if line_info["order_type"] == "catalog":
            price = line_info["skus"][sku] * float(rng.normal(1.0, 0.05))
            revenue = round(units * price, 2)
        elif line == "Custom Cell Engineering":
            revenue = round(float(rng.lognormal(mean=np.log(22000), sigma=0.55)), 2)
        else:  # OEM Components
            revenue = round(float(rng.lognormal(mean=np.log(18000), sigma=0.6)), 2)

        # channel: custom lines never go through e-commerce
        chans = list(chan_w)
        probs = np.array([chan_w[c] for c in chans])
        if line_info["order_type"] == "custom":
            probs = np.array([0.65 if c in ("direct", "inside sales") else 0.0 for c in chans])
        channel = chans[rng.choice(len(chans), p=probs / probs.sum())]

        # lead source + attribution: was there a marketing touch in prior 90d?
        last_touch_date = None
        lead_source = "Outbound / field"
        ramp_mult = 0.60 + 0.70 * (m / N_MONTHS)  # 0.60 -> 1.30 over 24 months
        if acct_touches is not None and rng.random() < resp * ramp_mult:
            window = acct_touches[
                (acct_touches["touch_date"] <= order_date)
                & (acct_touches["touch_date"] > order_date - pd.Timedelta(days=90))
            ]
            if len(window):
                last_touch = window.iloc[-1]
                last_touch_date = last_touch["touch_date"]
                lead_source = last_touch["source"]

        order_rows.append({
            "order_id": f"ORD-{order_id:05d}",
            "order_date": order_date.date(),
            "account_id": aid,
            "product_line": line,
            "sku": sku,
            "order_type": line_info["order_type"],
            "units": units,
            "revenue": revenue,
            "channel": channel,
            "lead_source": lead_source,
            "first_touch_date": first_touch_date.date() if pd.notna(first_touch_date) else None,
            "last_touch_date": last_touch_date.date() if last_touch_date is not None else None,
        })

orders = pd.DataFrame(order_rows)
orders["order_date"] = pd.to_datetime(orders["order_date"])
for col in ("first_touch_date", "last_touch_date"):
    orders[col] = pd.to_datetime(orders[col])
print(f"generated orders: {len(orders)}")
print(f"influenced share: {(orders['lead_source'] != 'Outbound / field').mean():.1%}")

# ---------------------------------------------------------------------------
# 4. Program spend by quarter
# ---------------------------------------------------------------------------

quarters = sorted(set(f"{d.year}-Q{(d.month - 1) // 3 + 1}" for d in MONTHS))
spend_base = {  # quarterly spend per program (Q1-2025 level), $k
    "Paid Search": 30.0,
    "Organic & Content": 22.0,
    "Email Nurture": 12.0,
    "Webinars": 14.0,
    "Trade Shows": 26.0,
    "Partner Marketing": 10.0,
}
spend_rows = []
for qi, q in enumerate(quarters):
    year, qn = int(q[:4]), int(q[-1])
    growth = 1.0 + 0.06 * (qi // 4) + 0.02 * (qn - 1)  # +6%/yr, slight intra-year ramp
    for program, base in spend_base.items():
        spend_rows.append({
            "quarter": q,
            "program": program,
            "spend_usd": round(base * growth * float(rng.normal(1.0, 0.06)) * 1000, 2),
        })
spend = pd.DataFrame(spend_rows)

# ---------------------------------------------------------------------------
# 5. Write raw tables
# ---------------------------------------------------------------------------

accounts_out = accounts.drop(
    columns=["quiet_after_idx", "drop_factor", "cohort_month_idx"])
accounts_out.to_csv(OUT_DIR / "raw_accounts.csv", index=False)
orders.to_csv(OUT_DIR / "raw_orders.csv", index=False)
touches.to_csv(OUT_DIR / "raw_touches.csv", index=False)
spend.to_csv(OUT_DIR / "raw_program_spend.csv", index=False)

# parquet copies are what the app + warehouse builder load
accounts_out.to_parquet(OUT_DIR / "raw_accounts.parquet", index=False)
orders.to_parquet(OUT_DIR / "raw_orders.parquet", index=False)
touches.to_parquet(OUT_DIR / "raw_touches.parquet", index=False)
spend.to_parquet(OUT_DIR / "raw_program_spend.parquet", index=False)

print(f"accounts: {len(accounts_out)} | touches: {len(touches)} | spend rows: {len(spend)}")
print(f"wrote -> {OUT_DIR}")
