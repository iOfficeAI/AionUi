# Data Profiling Skill

# Deep-Profile Schema, Distributions, and Anomalies

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Auto-invoked on first connection to a new dataset
- Manual via `/profile` command
- Recommended after cache refresh or data source change

## Command

`/profile [symbol]` - Profile data for a specific stock
`/profile all` - Profile the full dataset
`/profile schema` - Show schema only (fast)

## Purpose

Perform deep profiling of dataset characteristics: column types, distributions, missing data patterns, outliers, and data quality metrics. Results are stored in `.knowledge/datasets/vnstock_default/last_profile.md` for reference by analysis agents.

## Profiling Checks

### 1. Schema Profile

```
Table: OHLCV (quotes)
Columns: 7
  - time: datetime64 (100% non-null)
  - open: float64 (99.8% non-null)
  - high: float64 (99.8% non-null)
  - low: float64 (99.8% non-null)
  - close: float64 (100% non-null)
  - volume: int64 (100% non-null)
  - ticker: string (100% non-null)

Rows: 3,920 (VCB, 2010-01-04 to 2026-02-21)
```

### 2. Distribution Profile

For each numeric column, compute:

```python
from helpers.data_helpers import profile_column

profile = {
    'count': n,
    'mean': mean,
    'std': std,
    'min': min_val,
    'q25': q25,
    'median': median,
    'q75': q75,
    'max': max_val,
    'skew': skewness,
    'null_pct': null_percentage,
    'zero_pct': zero_percentage,
    'unique_count': unique_values,
    'outliers_iqr': count_outside_1_5_iqr,
}
```

### 3. Temporal Profile

- Date range coverage
- Trading days vs calendar days
- Gap analysis (missing trading days)
- Frequency detection (daily/weekly/monthly/quarterly)

### 4. Anomaly Detection

- Values beyond 3x IQR
- Sudden jumps > 2 standard deviations
- Volume spikes > 10x average
- Zero-volume days (may indicate holiday or error)

### 5. Cross-Column Consistency

- OHLC: low <= open, close <= high
- Volume > 0 on non-holiday trading days
- Price monotonically bounded by daily limits (+-7%)

## Output Format

Write to `.knowledge/datasets/vnstock_default/last_profile.md`:

```yaml
---
profile_id: 'prof_20260221'
dataset: 'vnstock_default'
profiled_at: '2026-02-21T14:30:00+07:00'
source: 'KBS'

summary:
  total_symbols: 1700
  date_range: { start: '2010-01-04', end: '2026-02-21' }
  total_rows: 2850000
  data_quality_score: 92

columns:
  close:
    dtype: 'float64'
    null_pct: 0.02
    mean: 32450
    median: 18500
    std: 42100
    min: 100
    max: 256000
    skew: 'right (2.1)'
    outliers: 145
  volume:
    dtype: 'int64'
    null_pct: 0.0
    mean: 850000
    median: 245000
    std: 2100000
    min: 0
    max: 98000000
    skew: 'right (4.8)'
    zero_days: 234

anomalies:
  ohlc_violations: 0
  volume_spikes: 45
  price_limit_hits: 12500
  gap_days: 89

recommendations:
  - 'Forward-fill up to 3 days for minor gaps'
  - 'Volume spikes common around index rebalancing dates'
  - 'Right-skewed distributions expected for Vietnamese stock data'
---
```

## User-Facing Output

When user runs `/profile VCB`:

```
Data Profile: VCB (Vietcombank)
================================

Period: 2010-01-04 to 2026-02-21 (3,920 trading days)
Source: KBS

Price:
  Current: 82,500 VND | Mean: 52,300 | Median: 48,700
  Range: 15,200 - 98,500 VND
  Volatility: 28.4% annualized

Volume:
  Current (20d avg): 3.2M shares | Mean: 2.8M | Median: 2.1M

Quality:
  Missing data: 0.02% (7 values, auto-fillable)
  Outliers: 23 volume spikes (event-driven, not errors)
  OHLC consistency: 100% (no violations)
  Data Quality Score: 95 (A)

Last updated: 2026-02-21 14:30 ICT
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
