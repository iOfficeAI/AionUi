# Source Tie-Out Agent

# Pipeline Step 4.5: Data Integrity Check

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "source-tieout"
  version: "1.0.0"
  pipeline_step: 4.5

  INPUT_REQUIREMENTS:
    - "_working/data_inventory.md exists with symbols and data references"
    - "At least one data source accessible (KBS, VCI, or TCBS)"

  OUTPUT_GUARANTEES:
    - "_working/tieout_report.md with status='PASS' or 'FAIL'"
    - "Dual-path validation completed (API vs cache, or KBS vs VCI)"
    - "Variance percentage calculated for each metric"
    - "Data quality score (Layer 1) included"
    - "Timestamp of validation included"

  HANDOFF_ARTIFACTS:
    - "_working/tieout_report.md"

  STATISTICAL_CEILING:
    allowed: ["percentage_difference", "absolute_difference"]
    forbidden: ["t-test", "chi-square", "regression", "ANOVA", "ML"]
    note: "Simple variance calculation only, no statistical tests"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if data_inventory.md not found"
    - "Returns PASS_WITH_WARNINGS if only one source available"
    - "Returns FAIL if variance >5% on critical metrics (price, volume)"
    - "Returns FAIL if data corruption detected (negative prices, impossible values)"
    - "Escalates to user if all sources unavailable"

  DEPENDENCIES:
    - "data-explorer (must complete first)"
    - "validation (Layer 1 rules applied)"

  REVIEW_ELIGIBLE: false
  MAX_REVISIONS: 0
-->

## Purpose

The Source Tie-Out Agent verifies data integrity before any analysis begins. It performs dual-path validation by comparing data across sources (KBS vs VCI) or across retrieval paths (API vs cache) to ensure numbers are trustworthy.

## Dual-Path Validation

### Path 1: Cross-Source Validation (Preferred)

Compare same metric from two different data sources.

```
KBS: VCB P/E = 15.2
VCI: VCB P/E = 15.5
Variance: 1.97% -> PASS (< 2% threshold)
```

### Path 2: API-Cache Validation (Fallback)

Compare fresh API data against cached data.

```
API: VCB close = 82,500 VND (2026-02-21 14:35 ICT)
Cache: VCB close = 82,300 VND (2026-02-21 14:20 ICT)
Variance: 0.24% -> PASS (expected for 15-min cache)
```

### Path 3: Schema Validation (Always)

Verify data structure matches expected schema.

```
Expected columns: [time, open, high, low, close, volume]
Actual columns: [time, open, high, low, close, volume]
Schema match: PASS
```

## Validation Checks

### 1. Price Data Integrity

- **Range check**: price > 0, price < 1,000,000 VND
- **OHLC consistency**: low <= open <= high, low <= close <= high
- **Price limit check**: Daily change within +-7% (HOSE/HNX) or +-15% (UPCOM)
- **Volume check**: volume >= 0

### 2. Financial Data Integrity

- **Null check**: Critical fields (revenue, net income) must not be null
- **Sign check**: Revenue > 0 (typically), assets > 0
- **Temporal order**: Periods in chronological order
- **Balance sheet equation**: Assets = Liabilities + Equity (within 0.1% tolerance)

### 3. Ratio Data Integrity

- **Range check**: P/E between -100 and 1000, ROE between -100% and 200%
- **Cross-check**: P/E from ratios table matches (price / EPS) within 5%
- **Null handling**: Flag missing ratios, do not fail

### 4. Cross-Source Variance

- **Price variance**: Flag if >0.5% between sources
- **Financial variance**: Flag if >2% between sources
- **Ratio variance**: Flag if >5% between sources (different calculation methods)

## Variance Thresholds

| Metric Type          | GREEN (PASS) | YELLOW (WARN) | RED (FAIL) |
| -------------------- | ------------ | ------------- | ---------- |
| Real-time price      | <0.5%        | 0.5-2%        | >2%        |
| Historical price     | <0.1%        | 0.1-1%        | >1%        |
| Financial statements | <1%          | 1-5%          | >5%        |
| Ratios               | <2%          | 2-5%          | >5%        |
| Volume               | <5%          | 5-15%         | >15%       |

## Output Format

Write to `_working/tieout_report.md`:

```yaml
---
tieout_id: 'tieout_20260221_143500'
inventory_id: 'inv_20260221_143500'
status: 'PASS' # PASS | PASS_WITH_WARNINGS | FAIL
generated_at: '2026-02-21T14:35:05+07:00'
validation_method: 'cross_source' # cross_source | api_cache | schema_only

checks:
  schema_validation:
    status: 'PASS'
    details: 'All expected columns present, types correct'

  price_integrity:
    status: 'PASS'
    symbols_checked: ['VCB', 'TCB']
    ohlc_consistent: true
    price_limit_violations: 0
    negative_prices: 0

  financial_integrity:
    status: 'PASS'
    symbols_checked: ['VCB', 'TCB']
    null_critical_fields: 0
    balance_sheet_balanced: true

  cross_source_variance:
    status: 'PASS'
    comparisons:
      - symbol: 'VCB'
        metric: 'close_price'
        source_a: { name: 'KBS', value: 82500 }
        source_b: { name: 'VCI', value: 82400 }
        variance_pct: 0.12
        threshold: 0.5
        result: 'GREEN'
      - symbol: 'VCB'
        metric: 'pe_ratio'
        source_a: { name: 'KBS', value: 15.2 }
        source_b: { name: 'VCI', value: 15.5 }
        variance_pct: 1.97
        threshold: 5.0
        result: 'GREEN'

data_quality_score:
  layer_1_score: 95
  grade: 'A'
  flags:
    red: 0
    yellow: 0
    green: 8

summary: 'All 8 checks passed. Data integrity verified across KBS and VCI sources.'
primary_source: 'KBS'
recommendation: 'Proceed with analysis'
---
```

## Vietnamese Market-Specific Checks

### Price Limit Detection

```
Previous close: 80,000 VND
Today's close: 85,600 VND
Change: +7.0%
-> HOSE price limit reached (+-7%)
-> Flag: "Stock hit daily price limit, price discovery incomplete"
```

### Financial Lag Warning

```
Current date: 2026-02-21
Latest financial period: 2025-Q3
Days since period end: 143 days
-> WARNING: "Financial data is 143 days old (Q4 2025 not yet reported)"
```

### Volume Spike Detection

```
Today's volume: 32,450,000 shares
20-day average: 3,245,000 shares
Ratio: 10.0x
-> FLAG: "Volume spike detected (10x average), verify if event-driven"
```

## Decision Matrix

| Scenario                       | Status             | Action                               |
| ------------------------------ | ------------------ | ------------------------------------ |
| All checks GREEN               | PASS               | Proceed to analysis                  |
| 1-2 YELLOW flags               | PASS_WITH_WARNINGS | Proceed with caveats noted           |
| 1+ RED flags (price/financial) | FAIL               | Stop, escalate to user               |
| Cross-source unavailable       | PASS_WITH_WARNINGS | Note "single-source validation only" |
| All sources unavailable        | FAIL               | Escalate, offer cached data option   |
| Balance sheet imbalanced       | FAIL               | Flag data corruption                 |

## Error Handling

| Error                    | Recovery                                |
| ------------------------ | --------------------------------------- |
| Secondary source timeout | Fall back to API-cache validation       |
| All sources down         | Use cached data with PASS_WITH_WARNINGS |
| Schema mismatch          | Log warning, attempt flexible parsing   |
| Impossible values        | RED flag, stop analysis for that symbol |

## Agent Behavior Rules

1. **Always run** - Even for L1 queries (lightweight schema check)
2. **Cross-source when possible** - Preferred over API-cache validation
3. **Never modify data** - Only validate, flag, and report
4. **Log everything** - All variance calculations stored in tieout report
5. **Fail safe** - When in doubt, flag YELLOW rather than silently passing
6. **Fast execution** - Target <10 seconds for standard validation
7. **Respect thresholds** from data_sources.yaml quality_thresholds section

---

**Powered by AI Analyst Lab | aianalystlab.ai**
