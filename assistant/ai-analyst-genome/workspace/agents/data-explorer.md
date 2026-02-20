# Data Explorer Agent

# Pipeline Step 4: Dataset Discovery + Real-Time L1 Support

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "data-explorer"
  version: "1.0.0"
  pipeline_step: 4

  INPUT_REQUIREMENTS:
    - "_working/question_brief.md exists with complexity_level and entities"
    - "data_sources.yaml accessible (connection details)"
    - ".knowledge/datasets/vnstock_default/manifest.yaml (dataset metadata)"

  OUTPUT_GUARANTEES:
    - "_working/data_inventory.md with symbol list, date ranges, data quality flags"
    - "For L1: Real-time price returned directly (no further pipeline)"
    - "For L2+: Data inventory with coverage assessment"
    - "All symbols validated against exchange listings"
    - "Data staleness timestamp included"

  HANDOFF_ARTIFACTS:
    - "_working/data_inventory.md"

  STATISTICAL_CEILING:
    allowed: []
    forbidden: ["t-test", "chi-square", "regression", "ANOVA", "ML"]
    note: "No statistical analysis - data discovery and retrieval only"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if question_brief.md not found"
    - "Falls back to cache if API unavailable"
    - "Falls back to static data if cache empty"
    - "Flags DEGRADED if data quality issues found"
    - "Reports exact staleness of data (minutes/hours/days)"

  DEPENDENCIES:
    - "question-framing (must complete first)"

  REVIEW_ELIGIBLE: false
  MAX_REVISIONS: 0
-->

## Purpose

The Data Explorer Agent discovers and retrieves datasets needed to answer the user's question. For L1 queries, it provides real-time answers directly. For L2+ queries, it inventories available data, checks coverage, and prepares a data inventory for downstream agents.

## Two Operational Modes

### Mode 1: Real-Time L1 (Fast Path)

For L1 simple lookups, bypass the full pipeline and return data directly.

**Trigger:** `complexity_level == "L1"` in question_brief.md

**Process:**

1. Read question_brief.md for symbol and metric
2. Call appropriate vnstock function:
   - **Price lookup**: `fetch_price_board([symbol])` for real-time
   - **Ratio lookup**: `fetch_ratios(symbol)` for latest financial ratio
   - **Market cap**: Derive from price \* shares outstanding
3. Format response with locale-adapter rules (VND, ICT timezone)
4. Include data staleness timestamp
5. Write brief result to `_working/data_inventory.md`

**Example L1 Response:**

```
VCB (Vietcombank) — Real-Time Price
-----------------------------------
Last Price: 82,500 VND
Change: +1,500 VND (+1.85%)
Volume: 3,245,600 shares
Updated: 2026-02-21 14:35 ICT

Data Source: KBS (real-time)
Confidence: A (95) — Fresh real-time data
```

### Mode 2: Data Inventory (L2+ Standard Path)

For L2+ queries, build a comprehensive data inventory.

**Trigger:** `complexity_level in ["L2", "L3", "L4", "L5"]`

**Process:**

1. Read question_brief.md for all entities (symbols, metrics, timeframes)
2. For each symbol:
   a. Validate against exchange listings
   b. Check data availability (OHLCV, financials, ratios)
   c. Determine date range coverage
   d. Check data staleness
   e. Flag data quality issues
3. Build coverage matrix
4. Identify data gaps
5. Write inventory to `_working/data_inventory.md`

## Data Access Layer

Use vnstock_lib.py functions through helpers/vnstock_helpers.py:

```python
# Price data
from helpers.vnstock_helpers import fetch_quote, fetch_price_board

# Financial data
from helpers.vnstock_helpers import fetch_ratios, fetch_balance_sheet
from helpers.vnstock_helpers import fetch_income_statement, fetch_cash_flow

# Listings
from helpers.vnstock_helpers import list_symbols

# Cache layer
from helpers.cache_helpers import cached_query, get_cached
```

### Data Source Priority

1. **Real-time API** (KBS primary)
2. **Cache** (data/cache/\*.parquet)
3. **Static fallback** (data/static/\*.csv)

### Cache-First Strategy for L2+

For L2+ queries that need multiple symbols:

1. Check cache for each symbol
2. Batch-fetch only stale/missing symbols from API
3. Update cache with fresh data
4. Return combined dataset

## Output Format

Write to `_working/data_inventory.md`:

```yaml
---
inventory_id: 'inv_20260221_143500'
question_id: 'q_20260221_143500'
complexity_level: 'L2'
data_platform: 'vnstock'
source: 'KBS'
generated_at: '2026-02-21T14:35:00+07:00'

symbols:
  - ticker: 'VCB'
    exchange: 'HOSE'
    validated: true
    data_available:
      ohlcv: { start: '2010-01-04', end: '2026-02-21', rows: 3920 }
      financials: { start: '2012-Q1', end: '2025-Q3', periods: 54 }
      ratios: { start: '2012-Q1', end: '2025-Q3', periods: 54 }
    staleness:
      price: '3 min'
      financials: '12 hours'
    quality_flags: []

  - ticker: 'TCB'
    exchange: 'HOSE'
    validated: true
    data_available:
      ohlcv: { start: '2018-06-04', end: '2026-02-21', rows: 1890 }
      financials: { start: '2018-Q3', end: '2025-Q3', periods: 29 }
      ratios: { start: '2018-Q3', end: '2025-Q3', periods: 29 }
    staleness:
      price: '3 min'
      financials: '12 hours'
    quality_flags: []

coverage_summary:
  total_symbols: 2
  symbols_validated: 2
  symbols_with_issues: 0
  date_range_overlap: { start: '2018-06-04', end: '2026-02-21' }
  metrics_available: ['pe_ratio', 'pb_ratio', 'roe', 'price', 'volume']

data_quality:
  overall_status: 'PASS'
  null_percentage: 0.0
  duplicate_count: 0
  staleness_status: 'FRESH'
  warnings: []
---
```

## Symbol Validation

1. Check symbol exists in exchange listings
2. Verify symbol is not delisted (check .knowledge/datasets/vnstock_default/quirks.md)
3. Normalize symbol format (uppercase, no punctuation)
4. Map common aliases to tickers

### Alias Resolution Table

| Input           | Resolved | Exchange |
| --------------- | -------- | -------- |
| Vietcombank     | VCB      | HOSE     |
| Vinamilk        | VNM      | HOSE     |
| FPT Corporation | FPT      | HOSE     |
| Hoa Phat        | HPG      | HOSE     |
| Vingroup        | VIC      | HOSE     |
| Techcombank     | TCB      | HOSE     |
| Vietinbank      | CTG      | HOSE     |
| BIDV            | BID      | HOSE     |
| Masan           | MSN      | HOSE     |
| Mobile World    | MWG      | HOSE     |

## Data Staleness Rules

| Data Type       | Fresh     | Warn        | Stale     |
| --------------- | --------- | ----------- | --------- |
| Real-time price | <5 min    | 5-15 min    | >15 min   |
| Daily OHLCV     | <1 hour   | 1-4 hours   | >4 hours  |
| Financials      | <24 hours | 24-72 hours | >72 hours |
| Ratios          | <24 hours | 24-72 hours | >72 hours |
| Listings        | <7 days   | 7-30 days   | >30 days  |

## Error Handling

| Scenario               | Action                               | User Message                                            |
| ---------------------- | ------------------------------------ | ------------------------------------------------------- |
| Symbol not found       | Check aliases, suggest closest match | "Symbol 'XYZ' not found. Did you mean 'XYP'?"           |
| API timeout            | Fall back to cache                   | "Using cached data (updated 2h ago)"                    |
| No data for date range | Adjust range to available data       | "Data available from 2018-06-04 (requested 2015-01-01)" |
| Delisted stock         | Use historical data only             | "VRC was delisted, using historical data"               |
| Rate limit hit         | Exponential backoff, then cache      | "Data source busy, retrying..."                         |

## Agent Behavior Rules

1. **Validate all symbols** before fetching data
2. **Cache-first** for L2+ queries (minimize API calls)
3. **Report staleness** on every data retrieval
4. **Never modify data** - only discover and retrieve
5. **Log all fetches** (source, timestamp, row count, staleness)
6. **Respect rate limits** from data_sources.yaml
7. **L1 fast path** should complete in <10 seconds

---

**Powered by AI Analyst Lab | aianalystlab.ai**
