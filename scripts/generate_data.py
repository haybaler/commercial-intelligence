#!/usr/bin/env python3
"""
Synthetic commercial dataset for the demo.

Writes CSV + parquet extracts that mirror what the NetSuite / HubSpot / budget
exports would look like:

  data/raw/raw_accounts.csv(.parquet)      -- NetSuite customer export
  data/raw/raw_orders.csv(.parquet)        -- NetSuite sales-order export
  data/raw/raw_touches.csv(.parquet)       -- HubSpot campaign-touch export
  data/raw/raw_program_spend.csv(.parquet) -- marketing budget spreadsheet

Seeded for reproducibility. All companies and contacts are fictional.
"""

import math
import random
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

SEED = 42
rng = random.Random(SEED)
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw"
OUT.mkdir(parents=True, exist_ok=True)

START = datetime(2023, 1, 1)
END = datetime(2024, 12, 31)
QUARTERS = [(y, q) for y in (2023, 2024) for q in (1, 2, 3, 4)]

# The demo represents a growing commercial business, not a prospecting list that
# stops after two quarters. New-account acquisition and revenue are deliberately
# controlled at quarter level; order-level behaviour still comes from the account
# and product simulation below.
NEW_ACCOUNTS_BY_QUARTER = [28, 34, 24, 38, 30, 26, 36, 32]
QOQ_GROWTH = [None, 0.14, 0.17, 0.09, 0.16, 0.04, 0.12, 0.18]
QUARTER_REVENUE_TARGETS = []
_revenue = 1_400_000.0
for _growth in QOQ_GROWTH:
    if _growth is not None:
        _revenue *= 1 + _growth
    QUARTER_REVENUE_TARGETS.append(_revenue)
CATALOG_REVENUE_SHARE = [0.40, 0.43, 0.46, 0.49, 0.52, 0.55, 0.58, 0.60]

ORG_TYPES = [
    ("Academic Research Lab", 0.20),
    ("Biopharma R&D", 0.25),
    ("CDMO / CRO", 0.15),
    ("Hospital / Clinical Lab", 0.12),
    ("Industrial / Applied Sciences", 0.10),
    ("Government / Public Health", 0.08),
    ("Agbio / Food Sciences", 0.10),
]
TIERS = [("Strategic", 0.10), ("Mid-Market", 0.35), ("Transactional", 0.55)]
TERRITORIES = [
    "NA-West", "NA-East", "NA-Central", "DACH", "UKI", "Nordics",
    "Benelux", "France", "APAC-Japan", "APAC-ANZ", "APAC-Singapore",
]
ACQUISITION_CHANNELS = [
    ("Organic Search", 0.04), ("Paid Search", 0.10), ("Trade Show", 0.22),
    ("Webinar", 0.14), ("Outbound Sales", 0.24), ("Partner", 0.07),
    ("Referral", 0.04), ("Email", 0.03), ("Field Demo", 0.12),
]
PRODUCT_LINES = [
    ("Instruments", 0.18), ("Consumables", 0.30), ("Reagents", 0.22),
    ("Software", 0.10), ("Services", 0.12), ("Custom Projects", 0.08),
]
CATALOG_LINES = {"Consumables", "Reagents"}
PRODUCTS = {
    "Instruments": [
        ("QX-200 Digital PCR System", 38500), ("LX-96 Liquid Handler", 62000),
        ("AV-12 Automated Plate Reader", 24800), ("SP-8 Spectrophotometer", 11900),
        ("CC-400 Automated Cell Counter", 16400), ("MS-2400 Benchtop Sequencer", 98000),
    ],
    "Consumables": [
        ("QX ddPCR Supermix (5 mL)", 420), ("96-well qPCR Plates (50-pack)", 385),
        ("Filter Tips, 200 uL (960)", 145), ("Cell Culture Flasks T75 (100)", 310),
        ("Microcentrifuge Tubes (1000)", 88), ("Serological Pipettes (200)", 175),
        ("Deep-well Plates (24-pack)", 260), ("Sealing Films (100)", 95),
    ],
    "Reagents": [
        ("RNA Extraction Kit (250 prep)", 1450), ("NGS Library Prep Kit (24 rxn)", 2890),
        ("ELISA Kit, IL-6 (96T)", 780), ("Protein Assay Kit (500 rxn)", 395),
        ("Cell Viability Reagent (25 mL)", 510), ("Transfection Reagent (1 mL)", 640),
        ("Antibody, anti-CD44 (100 uL)", 465), ("qPCR Master Mix (500 rxn)", 890),
    ],
    "Software": [
        ("LabFlow ELN, Annual Seat", 1800), ("QX Analysis Suite License", 4200),
        ("Instrument Fleet Manager, Annual", 9600), ("LIMS Connector Module", 12500),
    ],
    "Services": [
        ("Instrument Installation & IQ/OQ", 3800), ("Annual Preventive Maintenance", 5200),
        ("Applications Training (on-site, 2d)", 4500), ("Method Development (per day)", 2200),
        ("Extended Warranty, 1 yr", 6800),
    ],
    "Custom Projects": [
        ("Custom Assay Development", 18500), ("OEM Consumable Supply Agreement", 42000),
        ("Custom Antibody Production", 12800), ("Automation Integration Project", 35000),
    ],
}

LAB_PREFIX = ["Alder", "Beacon", "Cobalt", "Darwin", "Everest", "Fathom", "Helix", "Ion",
              "Juniper", "Kestrel", "Lumen", "Meridian", "Nova", "Orchid", "Pinnacle",
              "Quartz", "Riparian", "Solace", "Tessera", "Umbra", "Vantage", "Willow",
              "Xenon", "Yarrow", "Zephyr", "Arbor", "Boreal", "Cinder", "Delta", "Ember"]
LAB_SUFFIX = ["Bio", "Biosciences", "Therapeutics", "Genomics", "Research", "Labs",
              "Diagnostics", "Biologics", "Scientific", "Health"]
FIRST = ["Amelia", "Noah", "Priya", "Mateo", "Sofia", "Liam", "Aisha", "Lucas", "Mei",
         "Oliver", "Ingrid", "Diego", "Hana", "Ethan", "Nora", "Ravi", "Clara", "Owen"]
LAST = ["Hayes", "Okafor", "Nguyen", "Silva", "Kowalski", "Tanaka", "Meyer", "Rossi",
        "Patel", "Larsen", "Moreau", "Kim", "Novak", "Costa", "Sato", "Weber"]
ROLES = ["Lab Manager", "Principal Investigator", "Procurement Lead", "R&D Director",
         "Operations Manager", "Research Scientist", "Facilities & Lab Ops"]


def weighted(pairs):
    r = rng.random()
    acc = 0.0
    for value, weight in pairs:
        acc += weight
        if r <= acc:
            return value
    return pairs[-1][0]


def quarter_bounds(year, quarter):
    start_month = 3 * (quarter - 1) + 1
    start = datetime(year, start_month, 1)
    end = datetime(year + (quarter == 4), 1 if quarter == 4 else start_month + 3, 1)
    return start, end - timedelta(days=1)


def random_date(start, end):
    return start + timedelta(days=rng.randint(0, max(0, (end - start).days)))


def quarter_for(date):
    return f"{date.year}-Q{(date.month - 1) // 3 + 1}"


# --- accounts ------------------------------------------------------------------
accounts = []
account_id = 1000
company_number = 0
for qi, (year, quarter) in enumerate(QUARTERS):
    q_start, q_end = quarter_bounds(year, quarter)
    for _ in range(NEW_ACCOUNTS_BY_QUARTER[qi]):
        created = random_date(q_start, q_end)
        account_id += 1
        company_number += 1
        name = f"{LAB_PREFIX[(company_number - 1) % len(LAB_PREFIX)]} {rng.choice(LAB_SUFFIX)}"
        if company_number > len(LAB_PREFIX):
            name = f"{name} {math.ceil(company_number / len(LAB_PREFIX))}"
        contact = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        domain = name.lower().replace(" ", "").replace("/", "")
        accounts.append({
            "account_id": f"A{account_id}",
            "account_name": name,
            "account_type": weighted(ORG_TYPES),
            "tier": weighted(TIERS),
            "territory": rng.choice(TERRITORIES),
            "created_date": created.strftime("%Y-%m-%d"),
            "created_quarter": quarter_for(created),
            "acquisition_channel": weighted(ACQUISITION_CHANNELS),
            "contact_name": contact,
            "contact_email": f"{contact.split()[0].lower()}.{contact.split()[1].lower()}@{domain}.example",
            "contact_role": rng.choice(ROLES),
            # Simulation state, removed before the raw extract is written.
            "_created": created,
            "_last_order": None,
            "_order_count": 0,
        })
print(f"accounts: {len(accounts)}")


# --- orders --------------------------------------------------------------------
orders = []
order_id = 500000
LINE_MEAN_ORDER_VALUE = {}
for line, _ in PRODUCT_LINES:
    values = []
    for _, base_price in PRODUCTS[line]:
        mean_qty = (rng.randint(1, 2) if line == "Instruments" else
                    18 if line in CATALOG_LINES else 1.5)
        values.append(base_price * math.exp(0.28 ** 2 / 2) * mean_qty)
    LINE_MEAN_ORDER_VALUE[line] = sum(values) / len(values)


def make_order(account, order_date, product_line):
    global order_id
    order_id += 1
    item, base_price = rng.choice(PRODUCTS[product_line])
    unit_price = round(base_price * rng.lognormvariate(0, 0.28), 2)
    if product_line == "Instruments":
        quantity = rng.choices([1, 2, 3], weights=[0.80, 0.16, 0.04])[0]
    elif product_line in CATALOG_LINES:
        quantity = rng.choices([2, 5, 10, 20, 50], weights=[0.10, 0.30, 0.35, 0.20, 0.05])[0]
    elif product_line == "Software":
        quantity = rng.choices([1, 5, 10, 25], weights=[0.35, 0.35, 0.20, 0.10])[0]
    else:
        quantity = rng.choices([1, 2, 3], weights=[0.65, 0.25, 0.10])[0]
    account["_order_count"] += 1
    account["_last_order"] = max(account["_last_order"] or order_date, order_date)
    is_new = account["_order_count"] == 1
    order_type = ("Catalog" if product_line in CATALOG_LINES else
                  "Instrument" if product_line == "Instruments" else
                  "Service" if product_line in {"Software", "Services"} else
                  "Custom Synthesis")
    order = {
        "order_id": f"SO{order_id}",
        "account_id": account["account_id"],
        "order_date": order_date.strftime("%Y-%m-%d"),
        "order_year": order_date.year,
        "order_quarter": (order_date.month - 1) // 3 + 1,
        "year_quarter": quarter_for(order_date),
        "product_line": product_line,
        "product_item": item,
        "order_type": order_type,
        "quantity": quantity,
        "unit_price": unit_price,
        "order_total": round(unit_price * quantity, 2),
        "is_new_account_order": is_new,
    }
    orders.append(order)
    return order


def choose_product_line(qi, catalog_revenue, other_revenue):
    """Choose a line using the remaining revenue budget and expected order size.

    This targets revenue share rather than row count: catalog orders are smaller
    than instrument orders, so a 60% revenue mix needs more than 60% of orders.
    """
    target = QUARTER_REVENUE_TARGETS[qi]
    catalog_remaining = max(0.0, target * CATALOG_REVENUE_SHARE[qi] - catalog_revenue)
    other_remaining = max(0.0, target * (1 - CATALOG_REVENUE_SHARE[qi]) - other_revenue)
    catalog_mean = sum(LINE_MEAN_ORDER_VALUE[line] for line in CATALOG_LINES) / 2
    other_mean = sum(LINE_MEAN_ORDER_VALUE[line] for line, _ in PRODUCT_LINES if line not in CATALOG_LINES) / 4
    catalog_weight = catalog_remaining / catalog_mean if catalog_remaining else 0.0
    other_weight = other_remaining / other_mean if other_remaining else 0.0
    if catalog_weight + other_weight == 0:
        catalog_weight, other_weight = CATALOG_REVENUE_SHARE[qi], 1 - CATALOG_REVENUE_SHARE[qi]
    use_catalog = rng.random() < catalog_weight / (catalog_weight + other_weight)
    line = rng.choice(["Consumables", "Reagents"]) if use_catalog else weighted([
        (line, weight) for line, weight in PRODUCT_LINES if line not in CATALOG_LINES
    ])
    return line


def choose_repeat_account(candidates, order_date):
    """Recency-weighted repeat purchasing leaves a realistic quiet-account tail."""
    weights = []
    for account in candidates:
        last = account["_last_order"] or account["_created"]
        months_since = max(0, (order_date - last).days / 30.44)
        recency = 0.68 ** months_since
        tier_factor = {"Strategic": 1.8, "Mid-Market": 1.15, "Transactional": 0.8}[account["tier"]]
        # A small reactivation chance keeps old accounts in the mix without
        # letting the whole historical base order every quarter.
        weights.append((0.025 + recency) * tier_factor)
    return rng.choices(candidates, weights=weights, k=1)[0]


for qi, (year, quarter) in enumerate(QUARTERS):
    q_start, q_end = quarter_bounds(year, quarter)
    quarter_accounts = [a for a in accounts if a["_created"] <= q_end]
    new_accounts = [a for a in quarter_accounts if a["_created"] >= q_start]
    quarter_revenue = 0.0
    catalog_revenue = 0.0

    # Every newly acquired account places its first order in its acquisition
    # quarter. Subsequent orders can come from new or established accounts.
    for account in new_accounts:
        order_date = random_date(account["_created"], q_end)
        line = choose_product_line(qi, catalog_revenue, quarter_revenue - catalog_revenue)
        order = make_order(account, order_date, line)
        quarter_revenue += order["order_total"]
        if line in CATALOG_LINES:
            catalog_revenue += order["order_total"]

    target = QUARTER_REVENUE_TARGETS[qi]
    catalog_target = target * CATALOG_REVENUE_SHARE[qi]
    other_target = target - catalog_target
    # Fill both revenue budgets. Stopping only on total revenue can leave catalog
    # short when a large instrument order lands late in the quarter.
    while catalog_revenue < catalog_target or (quarter_revenue - catalog_revenue) < other_target:
        order_date = random_date(q_start, q_end)
        eligible = [a for a in quarter_accounts if a["_created"] <= order_date]
        if not eligible:  # opening quarter: no account exists on the earliest days
            order_date = random_date(min(a["_created"] for a in quarter_accounts), q_end)
            eligible = [a for a in quarter_accounts if a["_created"] <= order_date]
        account = choose_repeat_account(eligible, order_date)
        line = choose_product_line(qi, catalog_revenue, quarter_revenue - catalog_revenue)
        order = make_order(account, order_date, line)
        quarter_revenue += order["order_total"]
        if line in CATALOG_LINES:
            catalog_revenue += order["order_total"]

    print(f"  {year}-Q{quarter}: revenue ${quarter_revenue:,.0f} / "
          f"catalog {100 * catalog_revenue / quarter_revenue:.1f}% / "
          f"new accounts {len(new_accounts)}")

orders.sort(key=lambda row: (row["order_date"], row["order_id"]))
print(f"orders: {len(orders)}")


# --- marketing touches ---------------------------------------------------------
# First touch: near account creation, matching the acquisition channel.
# Last touch: 0-45 days before an order. Not every order is marketing-influenced;
# untagged orders are the direct / sales-led share.
touches = []
touch_id = 900000
orders_by_account = {}
for order in orders:
    orders_by_account.setdefault(order["account_id"], []).append(order)

for account in accounts:
    created = datetime.strptime(account["created_date"], "%Y-%m-%d")
    touch_id += 1
    touches.append({
        "touch_id": f"T{touch_id}",
        "account_id": account["account_id"],
        "touch_date": (created - timedelta(days=rng.randint(3, 30))).strftime("%Y-%m-%d"),
        "channel": account["acquisition_channel"],
        "campaign": f"{account['acquisition_channel']} · Always-on",
        "touch_type": "first",
    })
    account_orders = sorted(orders_by_account.get(account["account_id"], []), key=lambda row: row["order_date"])
    for index, order in enumerate(account_orders):
        # New-business orders are more campaign-influenced than repeat orders.
        influence_probability = 0.78 if index == 0 else 0.56
        if rng.random() > influence_probability:
            continue
        order_date = datetime.strptime(order["order_date"], "%Y-%m-%d")
        last_channel = weighted([
            ("Trade Show", 0.23), ("Webinar", 0.16), ("Field Demo", 0.14),
            ("Outbound Sales", 0.12), ("Paid Search", 0.10), ("Email", 0.09),
            ("Partner", 0.08), ("Organic Search", 0.04), ("Content", 0.02),
            ("Referral", 0.02),
        ])
        touch_id += 1
        touches.append({
            "touch_id": f"T{touch_id}",
            "account_id": account["account_id"],
            "touch_date": (order_date - timedelta(days=rng.randint(0, 45))).strftime("%Y-%m-%d"),
            "channel": last_channel,
            "campaign": f"{last_channel} · Q{(order_date.month - 1) // 3 + 1} {order_date.year}",
            "touch_type": "last",
        })
print(f"touches: {len(touches)}")


# --- program spend -------------------------------------------------------------
# Calibrate the synthetic budget to the same 90-day last-touch rule used by the
# warehouse. This keeps every program in a plausible 3-8x credited-revenue /
# spend range without editing the presentation layer to hide outliers.
SOURCE_TO_PROGRAM = {
    "Paid Search": "Paid Search",
    "Organic Search": "Organic & Content",
    "Content": "Organic & Content",
    "Referral": "Referral",
    "Email": "Email Nurture",
    "Webinar": "Webinars",
    "Trade Show": "Trade Shows",
    "Partner": "Partner Marketing",
    "Field Demo": "Field Demos",
    "Outbound Sales": "Outbound Sales",
}
TARGET_ROMI = {
    "Trade Shows": 4.2,
    "Webinars": 5.2,
    "Field Demos": 5.8,
    "Outbound Sales": 6.4,
    "Paid Search": 4.6,
    "Email Nurture": 5.0,
    "Partner Marketing": 3.2,
    "Organic & Content": 4.4,
    "Referral": 3.4,
}
PROGRAMS = list(TARGET_ROMI)
touches_by_account = {}
for touch in touches:
    touches_by_account.setdefault(touch["account_id"], []).append(touch)
for account_touches in touches_by_account.values():
    account_touches.sort(key=lambda row: row["touch_date"])

credited_revenue = {}
for order in orders:
    order_date = datetime.strptime(order["order_date"], "%Y-%m-%d")
    eligible_touches = [
        touch for touch in touches_by_account.get(order["account_id"], [])
        if touch["touch_type"] == "last"
        and order_date - timedelta(days=89) <= datetime.strptime(touch["touch_date"], "%Y-%m-%d") <= order_date
    ]
    if not eligible_touches:
        continue
    source = eligible_touches[-1]["channel"]
    program = SOURCE_TO_PROGRAM.get(source)
    if program:
        key = (order["year_quarter"], program)
        credited_revenue[key] = credited_revenue.get(key, 0) + order["order_total"]

spend = []
for year, quarter in QUARTERS:
    yq = f"{year}-Q{quarter}"
    for program in PROGRAMS:
        target_romi = min(8.0, max(3.0, TARGET_ROMI[program] + rng.uniform(-0.25, 0.25)))
        credited = credited_revenue.get((yq, program), 0.0)
        spend.append({
            "year_quarter": yq,
            "program": program,
            "spend_usd": round(credited / target_romi, 2),
            "source": "FY24 marketing budget v3.xlsx",
        })
print(f"spend rows: {len(spend)}")


# --- write ---------------------------------------------------------------------
frames = {
    "accounts": pd.DataFrame([{k: v for k, v in account.items() if not k.startswith("_")}
                              for account in accounts]),
    "orders": pd.DataFrame(orders),
    "touches": pd.DataFrame(touches),
    "program_spend": pd.DataFrame(spend),
}
for name, frame in frames.items():
    csv_path = OUT / f"raw_{name}.csv"
    parquet_path = OUT / f"raw_{name}.parquet"
    frame.to_csv(csv_path, index=False)
    try:
        frame.to_parquet(parquet_path, index=False)
    except ImportError:
        pass  # parquet optional; warehouse falls back to CSV
    print(f"wrote {csv_path.relative_to(ROOT)} ({len(frame):,} rows)")
