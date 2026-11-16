# Commercial Intelligence Layer — Quillmere Bio (demo)

A working, deployable demo of a commercial intelligence layer for a
life-sciences tools company. It is built to be put in front of a hiring
manager: every number on every screen comes from real SQL models running
against a real warehouse — not from mocked API responses.

The company, "Quillmere Bio," and all data are synthetic. The *shape* of the
problem is not: account-type mix, catalog vs. custom revenue, marketing
attribution that an exec will argue with, and accounts quietly going dark.
Those are the problems a real commercial systems architect gets hired to solve.

**Stack:** seeded Python generator → parquet → DuckDB warehouse built from
plain `.sql` models → Next.js 15 static export → duckdb-wasm querying the
warehouse file **in the browser**. No backend, no database server, deployable
to any static host.

---

## Run it

```bash
pip install duckdb pandas numpy pyarrow   # data + warehouse build
npm install                                # also fetches duckdb-wasm assets
npm run data:generate                      # writes data/raw/*.parquet (seeded)
npm run warehouse:build                    # models/*.sql -> data/warehouse/warehouse.duckdb
npm run build                              # next build -> out/
npm run serve:static                       # open http://localhost:3000
```

The repo is source-only: the data generator is seeded (`rng(42)`), so
`npm run data:generate` reproduces the exact same extracts every time, and
`npm run warehouse:build` compiles the models into the warehouse file the
app serves. The PWA icons ship base64-encoded under `/assets` (decoded by
`postinstall`) because binary assets don't travel through text-only tooling;
the wasm runtime is copied from `node_modules` by the same hook.

There is no committed `package-lock.json` (it can't travel the same
text-only channel); every dependency in `package.json` is pinned to an
exact version instead, so `npm install` resolves deterministically without
one.

---

## Architecture

```
scripts/generate_data.py        seeded synthetic raw extracts (CSV + parquet)
        │
        ▼
scripts/build_warehouse.py      executes models/*.sql in dependency order,
        │                       runs validation checks, persists warehouse.duckdb
        ▼
models/staging/*.sql            typed, cleaned, calendar-derived, rejects quarantined
models/dimensions/dim_accounts.sql   account dimension + first order/touch
models/marts/fct_orders.sql     order-grain fact: new/repeat, catalog/custom,
        │                       first-touch source, last-touch source (90-day window)
        ▼
models/marts/mart_revenue_product_line_quarter.sql
models/marts/mart_attribution.sql      (summary + program×quarter grains)
models/marts/mart_account_health.sql   (GONE QUIET / UNDER-BUYING / WATCH / HEALTHY)
        │
        ▼
public/data/warehouse.duckdb  ──►  src/lib/duckdb.ts  (duckdb-wasm, ATTACH READ_ONLY)
                                   src/lib/queries.ts (view queries)
                                   src/lib/nl2sql.ts  (plain-English → SQL)
                                   src/components/*.tsx (four views)
```

### The four views

1. **Executive summary** — revenue by quarter, buying accounts, growth rate,
   catalog vs. custom split, revenue per product line per quarter.
2. **Attribution** — marketing-influenced revenue and return per dollar of
   program spend, with first-touch vs. last-touch credit shown side by side.
3. **Account health** — flags accounts that have gone quiet or are under-buying
   versus their segment. This is the view an exec recognizes as their own
   problem before they recognize the technology.
4. **Ask the warehouse** — plain-English questions ("how much catalog revenue
   came from biopharma in Q3") parsed to SQL and executed live, with the
   generated SQL shown next to every answer.

---

## Decisions and tradeoffs

### 1. DuckDB file + duckdb-wasm instead of a database server

The entire warehouse (raw + staging + dimensions + marts, ~4 MB) ships to the
browser as a static asset and is attached read-only. Every view, filter, and
ask-box answer is a real SQL query against the modeled marts.

- **Why:** a hiring manager can click a deploy preview and the whole thing
  works — no API keys, no server, no "the demo database is down." It also
  proves the models are portable: they are plain SQL files, not an ORM.
- **Why not Postgres:** at this size, DuckDB provides the analytical SQL engine without provisioning, securing, or hosting a server; Postgres would add operational overhead without improving the demo.
- **Tradeoff:** the warehouse is a snapshot, not live data; first load fetches
  ~4 MB; and browser memory caps how far this scales. The same `.sql` files
  run against BigQuery or Postgres with dialect edits (below), which is the
  honest migration path.

### 2. Plain `.sql` model files instead of dbt

The models directory follows dbt conventions (staging → dimensions → marts)
but is executed by a 40-line Python script, not dbt.

- **Why:** for a demo, dbt adds toolchain weight (profiles, targets, a Python
  environment) without adding signal. A reviewer can read `fct_orders.sql` top
  to bottom in one sitting — that is the point of the exercise. The layering
  discipline is the same discipline dbt enforces; the build script is the seam
  where dbt would slot in.
- **Tradeoff:** no incremental builds, no dbt tests. The build script's
  validation block (row counts, reject counts, orphan checks, health-flag
  distribution) is the stand-in, and it is weaker than a real test suite.
  In production this becomes dbt tests or Great Expectations in CI.

### 3. Attribution: 90-day last-touch credit, with first-touch shown beside it

An order counts as marketing-influenced when a credited touch landed in the 90
days before it (`fct_orders.sql`). Last-touch source is the most recent touch
in that window; first-touch source is the account's earliest touch ever.
`mart_attribution` reports both, per quarter, side by side.

- **Why:** last-touch flatters closers (paid search, webinars near the order);
  first-touch flatters brand programs (everything traces back to them). A
  single model choice would be quietly self-serving; showing both, with the
  gap visible, is the honest version of the number. The influence share is
  reported quarter by quarter without claiming a causal trend.
- **Tradeoff:** credit is not causation. This is *credited* revenue, not
  proven-incremental revenue — there is no holdout, no geo experiment. The UI
  says so on the page, and it should. Program ROMI is calibrated to a plausible
  3–8x range; credited revenue still must not be read as incrementality.

### 4. Program spend mapped to lead sources explicitly, in SQL

Budget owners name programs one way ("Organic & Content"); HubSpot lead
sources name them another ("Organic Search" and "Content" roll up together;
"Referral" stays separate). The
mapping lives in `mart_attribution.sql` as an explicit `VALUES` table, not
hidden in a join.

- **Why:** this mapping is the conversation RevOps has with Finance every
  planning cycle. It deserves to be one readable, arguable block of SQL.
- **Tradeoff:** it is hand-maintained. In production it moves to a seed/mapping
  table owned by RevOps, with a test that fails when a new lead source appears
  that no program claims.

### 5. Account health thresholds you can defend in a hallway

- **GONE QUIET** — ordered historically, nothing in 120+ days, and ordered at
  least once in the 24-month window (so a dead account from year one doesn't
  pollute the list).
- **UNDER-BUYING** — trailing two quarters < 50% of the prior two quarters.
- **WATCH** — trailing two quarters 50–75% of prior.
- **HEALTHY** — everything else with at least $25k lifetime revenue.
- **BELOW THRESHOLD** — under $25k lifetime revenue; retained in the mart but
  ineligible for GONE QUIET, UNDER-BUYING, or WATCH flags. The UI working list
  is the top 30 GONE QUIET / UNDER-BUYING accounts by lifetime revenue.

"Versus their segment" is trailing-6-month revenue against the median of the
account's *own type* (biopharma vs. biopharma, OEM vs. OEM).

- **Why:** thresholds a VP of Sales can repeat without a slide. Median, not
  mean, so one whale doesn't set the bar. Recency is measured against the
  warehouse's max order date, not the wall clock, so the mart is reproducible
  on a static snapshot.
- **Tradeoff:** segment = account type only. A real deployment would add tier,
  installed product lines, and contract renewal dates — and "gone quiet"
  would exclude accounts with an active services contract even if they
  haven't ordered consumables.

### 6. Deterministic rule-based parser for the ask box, not an LLM

`src/lib/nl2sql.ts` parses a question into (metric, filters, time window,
group-by, limit) and composes SQL from **whitelisted identifiers only**. It is
not a canned-question lookup — the example questions and free-form variants
both work — but it is also not an LLM.

- **Why:** this module is deliberately the *seam* where an LLM step would
  replace the rule parser in production, and the README says so. For a demo,
  the parser's failure modes are inspectable ("I don't know the word 'churn'"
  beats a fluent hallucinated number), and the safety properties — identifier
  whitelist, read-only queries, generated SQL shown with every answer — are
  exactly the properties an LLM version would need to keep.
- **Tradeoff:** the vocabulary is small. It handles the metrics, entities, and
  phrasings in the example set and reasonable variants; it will not survive
  "which accounts are about to churn." That limitation is intentional and
  documented in the UI.

### 7. Next.js static export

`output: "export"` — the app is a static bundle plus the warehouse file, so
it deploys to GitHub Pages, Netlify, Vercel, S3, or an internal static server
with no runtime. A service worker caches the shell and the warehouse for
repeat visits (PWA).

- **Tradeoff:** no server-side secrets, no live connection to source systems,
  and the ask box runs against the shipped snapshot. All acceptable for a
  demo; none acceptable for production, where this layer sits behind auth and
  reads the warehouse directly (see migration path).

---

## What I simplified about the synthetic data

The generator (`scripts/generate_data.py`, seeded with `random.Random(42)`,
fully reproducible) deliberately compresses reality. Knowing where the seams
are is part of the demo:

- **One order line per order.** Real NetSuite extracts have order header vs.
  line grain, partial shipments, cancellations, and credits. Here every order
  is complete at insert.
- **Prices are fixed per SKU.** No discount schedules, no contract pricing, no
  cost of goods — so "revenue" is clean but margin is invisible.
- **Accounts have one type, one territory, forever.** No account hierarchies,
  no parent/child rollups, no territory reassignment mid-period, no merged
  accounts.
- **Marketing touches are atomic and honest.** Each touch has one source and a
  date; there are no campaign hierarchies, no touch cost per row (spend is
  quarterly at program level), no dark-funnel activity we can't see. Real
  HubSpot data has all of those problems.
- **Nine programs, eight quarters of spend per program, 72 spend rows.** Real
  marketing budgets carry headcount, agencies, and tooling that never map to a
  lead source at all.
- **Influence is planted, not inferred.** First orders and repeat orders have
  fixed campaign-influence probabilities; real attribution has to survive
  confounding because accounts that respond to marketing were often going to
  buy anyway.
- **No returns, no disputes, no FX.** Everything is USD, everything ships.
- **Growth is a controlled quarterly path, not a random collapse.** The generator
  targets 24–38 new accounts per quarter, mostly 8–20% QoQ revenue growth with
  two soft quarters, and a catalog revenue share rising from 40% to 60%.

The numbers are tuned to be plausible for a mid-size tools company (~$18.2M over
24 months, $1.4M growing to $3.3M per quarter, 248 accounts, 1,507 orders), not
to mirror any real company. Any resemblance to an actual employer's metrics
is deliberate in shape only.

---

## Running this against real NetSuite + HubSpot

The demo is a dress rehearsal. Swapping synthetic for real is a known path,
and the seams are labeled:

1. **Extracts become real ones.** Replace `scripts/generate_data.py` output
   with: NetSuite transaction lines via SuiteQL/saved search (orders, items,
   account fields), HubSpot contacts + companies + marketing touches via the
   engagements API. Keep the same raw table shapes (`raw_accounts`,
   `raw_orders`, `raw_touches`, `raw_program_spend`) and **no model changes
   are needed** — that is the point of the staging layer.
2. **Dialect port.** The models are DuckDB SQL. Against BigQuery:
   `INTERVAL 90 DAYS` → `INTERVAL 90 DAY`, `||` → `CONCAT`, correlated
   subqueries in `fct_orders` are fine but would likely become window
   functions for cost. Against Postgres: `MEDIAN` → `PERCENTILE_CONT(0.5)`,
   `DATE_TRUNC` and interval arithmetic carry over. Each is a mechanical edit
   confined to the marts; the staging contracts don't move.
3. **dbt, for real.** Once the data is live, the 40-line build script becomes
   a dbt project with tests (`unique`, `not_null`, `relationships` on
   `account_id`, accepted values on `order_type` and `health_status`) and
   nightly incremental runs on `fct_orders`.
4. **The ask box gets its LLM.** Replace the rule parser with an LLM call
   that emits the same (metric, filters, window, group-by) structure against
   the same identifier whitelist, keep the read-only connection, and keep
   showing the generated SQL with every answer. The demo's parser is the
   acceptance test for that step: it defines the shape the LLM output must
   validate into.
5. **Auth moves server-side.** The browser no longer downloads the
   warehouse; it calls an API that queries BigQuery/Postgres with row-level
   security. The static-export trick was for the demo's distribution problem,
   not a production architecture.
6. **Account health earns its name.** Add contract/renewal data from the CRM,
   exclude accounts under active services agreements from GONE QUIET, and let
   segment medians weight by installed product line. The thresholds stay;
   the denominators get smarter.

---

## Verification

Built and checked end to end, not stubbed:

- Warehouse build validates: 1,507 orders in `fct_orders`, 248 accounts in
  `dim_accounts`, 0 rejected order lines, 0 unmatched accounts, and a
  health distribution of 70 HEALTHY / 73 GONE QUIET / 16 UNDER-BUYING /
  5 WATCH / 84 BELOW THRESHOLD. No flagged account is below $25k lifetime
  revenue; the default working list contains 30 accounts and $5.55M at risk.
- Strict TypeScript and the static production build pass. All four views are
  exercised in Chromium: executive KPIs, attribution rankings and 3–8x ROMI,
  the top-30 health list, and all eight ask-box examples plus refusal behavior.
  Bare quarters name the period used; query timing is rounded to whole
  milliseconds; browser checks report zero console errors.

## Repository layout

```
assets/                  PWA icons shipped base64-encoded (decoded on install)
data/                    generated (gitignored): raw extracts + warehouse.duckdb
models/                  the SQL models — staging, dimensions, marts
scripts/                 generator, warehouse builder, asset copier
src/app/                 Next.js app (static export)
src/components/          the four views + shared chart primitives
src/lib/                 duckdb-wasm client, view queries, nl2sql parser
public/vendor/duckdb/    duckdb-wasm binaries (fetched at install)
```

*Built by Josh Haydon as a hiring-manager demo. The README is the argument;
the UI is the evidence.*
