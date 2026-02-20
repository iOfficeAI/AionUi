# Data Quality Check Skill

## PURPOSE

Run Layer 1 validation on data before analysis begins. Automatically detects nulls, duplicates, out-of-range values, temporal gaps, and schema issues. Applies auto-fixes where safe (forward-fill, dedup) and reports all quality flags.

## TRIGGER

- Auto-applied on **every query** that involves data retrieval (L1-L5)
- Can also be invoked manually: `/data-quality-check [symbol]`

## INSTRUCTIONS

### Automatic Mode (Every Query)

After data-explorer fetches data, run these checks:

#### 1. Null/Missing Value Check

```python
from helpers.data_helpers import check_nulls

report = check_nulls(df)
# Returns: { column: null_count, total_rows, null_pct }
```

- **GREEN:** <1% nulls across all columns
- **YELLOW:** 1-5% nulls -> Auto-fix: forward-fill up to 3 consecutive trading days
- **RED:** >5% nulls -> Flag, do NOT auto-fix

Auto-fix notification:

```
Auto-fixed: Forward-filled 3 missing price values (0.1% of data)
```

#### 2. Duplicate Check

```python
from helpers.data_helpers import check_duplicates

report = check_duplicates(df)
# Returns: { duplicate_count, duplicate_indices }
```

- **GREEN:** 0 duplicates
- **YELLOW:** 1-5 exact duplicates -> Auto-remove (keep first)
- **RED:** >5 duplicates -> Flag for investigation

#### 3. Out-of-Range Check

| Column                      | Valid Range          | Flag If       |
| --------------------------- | -------------------- | ------------- |
| price (open/high/low/close) | > 0, < 1,000,000 VND | <= 0 or > 1M  |
| volume                      | >= 0                 | < 0           |
| P/E                         | -100 to 1000         | Outside range |
| P/B                         | -10 to 100           | Outside range |
| ROE                         | -100% to 200%        | Outside range |

- Never auto-fix out-of-range values
- Flag as RED if critical (price <= 0)

#### 4. Temporal Consistency Check

- Dates must be in chronological order
- Flag gaps > 5 trading days (weekends/holidays excluded)
- Vietnamese market holidays: Tet (Jan/Feb), April 30, May 1, Sep 2

#### 5. Schema Validation

- OHLCV must have: time, open, high, low, close, volume
- Financial must have: item, item_id, plus period columns
- Ratios must have: item, item_id, plus period columns

#### 6. Vietnamese Market Checks

- **Price limit:** Flag if daily change exactly +-7% (HOSE/HNX) or +-15% (UPCOM)
- **Financial lag:** Warn if latest financial data > 30 days old
- **Volume spike:** Flag if volume > 10x 20-day average

### Manual Mode (/data-quality-check [symbol])

Run full quality check on a specific symbol and display detailed report:

```
Data Quality Report: VCB
========================
Null Values:     0.0% (0/3,920 rows)     GREEN
Duplicates:      0 exact duplicates        GREEN
Out-of-Range:    0 violations              GREEN
Temporal Gaps:   0 gaps > 5 days           GREEN
Schema:          Matches expected           GREEN
Staleness:       3 min (real-time)         GREEN
Price Limits:    0 hits today              INFO
Financial Lag:   Q3 2025 (143 days)        YELLOW

Overall: PASS (Score: 95/100, Grade: A)
Auto-fixes Applied: 0
```

### Output

Quality check results are included in:

- `_working/tieout_report.md` (appended by source-tieout agent)
- `_working/validation_report.md` (Layer 1 section by validation agent)

---

**Powered by AI Analyst Lab | aianalystlab.ai**
