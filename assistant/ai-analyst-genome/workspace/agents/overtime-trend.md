# Over-Time Trend Agent

# Pipeline Step 5: Time-Series Patterns, Anomalies, Seasonality

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "overtime-trend"
  version: "1.0.0"
  pipeline_step: 5

  INPUT_REQUIREMENTS:
    - "Clean data (Layer 1 passed)"
    - "_working/question_brief.md with timeframe and metrics"
    - "_working/tieout_report.md status = 'PASS'"
    - "Time-series data with datetime column"

  OUTPUT_GUARANTEES:
    - "Moving averages computed (20-day, 50-day, 200-day)"
    - "Anomalies flagged (> 2 standard deviations from rolling mean)"
    - "Seasonality patterns identified (Tet, quarter-end, year-end)"
    - "Period-over-period changes with 95% CI"
    - "Simpson's Paradox check on segmented time trends"

  HANDOFF_ARTIFACTS:
    - "_working/trend_report.md"
    - "_working/charts/*.png"

  STATISTICAL_CEILING:
    allowed: ["t-test", "chi-square", "confidence intervals", "effect sizes"]
    forbidden: ["regression", "ANOVA", "ML", "ARIMA", "Prophet", "exponential smoothing"]

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if tieout_report.md status = 'FAIL'"
    - "Returns SKIP if no time-series data available"
    - "Flags UNCERTAIN if time series < 60 data points"
    - "Escalates if anomaly coincides with data quality issue"

  DEPENDENCIES:
    - "source-tieout (must pass)"
    - "validation (Layer 1+2)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Over-Time Trend Agent analyzes temporal patterns in Vietnamese stock market data. It computes moving averages, detects anomalies, identifies seasonal effects, and compares period-over-period changes. It does NOT forecast or predict -- it describes what happened and when.

## Analysis Methods

### 1. Moving Averages

Compute rolling averages to smooth noise and identify trend direction.

| Window  | Purpose                        | Use Case                        |
| ------- | ------------------------------ | ------------------------------- |
| 5-day   | Very short-term momentum       | Intraweek trader signals        |
| 20-day  | Short-term trend (~1 month)    | Swing trading context           |
| 50-day  | Medium-term trend (~1 quarter) | Sector rotation analysis        |
| 200-day | Long-term trend (~1 year)      | Bull/bear market classification |

**Crossover Signals (descriptive, not predictive):**

- Golden Cross: 50-day crosses above 200-day (historically bullish)
- Death Cross: 50-day crosses below 200-day (historically bearish)
- Report as observation, never as prediction

### 2. Period-Over-Period Comparison

Compare metrics across time periods using statistical tests.

```python
from helpers.stats_helpers import t_test, confidence_interval

# Compare Q4 2025 vs Q3 2025 daily returns
q4_returns = data[data['quarter'] == 'Q4-2025']['daily_return']
q3_returns = data[data['quarter'] == 'Q3-2025']['daily_return']

result = t_test(q4_returns, q3_returns)
ci_diff = result['ci_95']

# Report: "Q4 2025 returns were X% lower than Q3 2025 (95% CI: [a%, b%], p=0.XX)"
```

**Standard Comparisons:**

- Quarter-over-Quarter (QoQ)
- Year-over-Year (YoY)
- Month-over-Month (MoM)
- Current period vs same period last year (YoY seasonal)

### 3. Anomaly Detection

Flag data points that deviate significantly from recent patterns.

**Method:** Rolling Z-score (window = 20 trading days)

```
z_score = (value - rolling_mean) / rolling_std
```

| Z-Score | Classification | Action |
| ------- | -------------- | ------ | -------- | ----------------------------- |
|         | z              | < 1.5  | Normal   | No flag                       |
| 1.5 <=  | z              | < 2.0  | Elevated | INFO flag                     |
| 2.0 <=  | z              | < 3.0  | Anomaly  | YELLOW flag, investigate      |
|         | z              | >= 3.0 | Extreme  | RED flag, verify data quality |

**Vietnamese Market Anomaly Context:**

- Price limit hits (+-7%) often create sustained anomalies
- Tet holiday creates volume anomalies (Jan-Feb)
- Index rebalancing dates (VN30 quarterly review)
- Ex-dividend dates cause price drops (not anomalies)
- ETF creation/redemption can cause volume spikes

### 4. Seasonality Patterns

Identify recurring patterns tied to calendar events.

**Vietnamese Market Seasonal Effects:**

| Period        | Pattern                                 | Mechanism                                 |
| ------------- | --------------------------------------- | ----------------------------------------- |
| Jan-Feb (Tet) | Volume drops 40-60%                     | Holiday closures, cash withdrawals        |
| March         | Volume recovery, often positive returns | Post-Tet fund redeployment                |
| April-May     | Volatility around AGM season            | Dividend announcements, shareholder votes |
| June          | VN30 rebalancing effects                | Index-tracking fund adjustments           |
| Sep           | VN30 rebalancing effects                | Index-tracking fund adjustments           |
| Oct-Nov       | Foreign fund year-end positioning       | Global fund reallocation                  |
| Dec           | Window dressing, portfolio rebalancing  | Year-end accounting effects               |
| Quarter-end   | Financial reporting anticipation        | Earnings expectations                     |

**Method:** Compare same calendar period across years using t-test.

```python
# Is January typically lower volume?
jan_volumes = data[data['month'] == 1]['volume']
non_jan_volumes = data[data['month'] != 1]['volume']
result = t_test(jan_volumes, non_jan_volumes)
```

### 5. Trend Decomposition (Descriptive Only)

Break time series into components WITHOUT forecasting:

- **Level:** Current value position relative to history
- **Trend direction:** Up/Down/Flat (based on 50-day MA slope)
- **Volatility regime:** Current std vs historical (high/normal/low)
- **Momentum:** Recent performance vs longer-term (20-day vs 200-day return)

**Trend Direction Classification:**

| Condition                                    | Classification |
| -------------------------------------------- | -------------- |
| 50-day MA rising AND price above 200-day MA  | Strong Uptrend |
| 50-day MA rising BUT price below 200-day MA  | Recovery       |
| 50-day MA falling BUT price above 200-day MA | Weakening      |
| 50-day MA falling AND price below 200-day MA | Downtrend      |

### 6. Structural Break Detection

Identify points where a time series behavior changed significantly.

**Method:** Compare mean/variance before and after candidate break points.

```python
from helpers.stats_helpers import t_test

# Test if mean return changed around event date
pre_event = returns[returns.index < event_date].tail(30)
post_event = returns[returns.index >= event_date].head(30)
result = t_test(pre_event, post_event)

# If significant: "Structural break detected around [date] (p=X.XX)"
```

**Common Vietnamese Market Break Points:**

- SBV rate decisions
- Government policy announcements
- FTSE/MSCI review dates
- Major IPO/listing dates
- COVID lockdown/reopening dates

## Simpson's Paradox Check for Time Trends

Before concluding any aggregate time trend, segment and verify:

```python
from helpers.stats_helpers import check_simpson_paradox

# "Market returned 15% in 2025" -- check by sector
result = check_simpson_paradox(
    data=annual_returns,
    value_col='return_2025',
    group_col='period',        # H1 vs H2
    subgroup_col='sector',
)
# If 7/10 sectors actually declined but banking pulled the aggregate up -> Paradox
```

## Output Format

Write to `_working/trend_report.md`:

```yaml
---
trend_id: 'trend_20260221_143525'
question_id: 'q_20260221_143500'
complexity_level: 'L3'
generated_at: '2026-02-21T14:35:25+07:00'

time_range:
  start: '2025-01-02'
  end: '2026-02-21'
  trading_days: 280

trend_summary:
  direction: 'weakening'
  current_vs_50d_ma: -2.3
  current_vs_200d_ma: +5.1
  volatility_regime: 'normal'
  momentum_20d: -1.5
  momentum_200d: +12.3

moving_averages:
  ma_20: 80500
  ma_50: 81200
  ma_200: 78300
  golden_cross_date: null
  death_cross_date: null

period_comparisons:
  - period_a: 'Q4-2025'
    period_b: 'Q3-2025'
    metric: 'daily_return'
    result:
      mean_a: -0.05
      mean_b: 0.12
      t_statistic: -2.31
      p_value: 0.023
      significant: true
      effect_size: { d: 0.41, label: 'small' }
      ci_95_diff: [-0.31, -0.02]
    interpretation: 'Q4 2025 returns significantly lower than Q3 2025 (p=0.023, d=0.41 [small effect])'

anomalies:
  count: 3
  events:
    - date: '2025-11-15'
      metric: 'volume'
      z_score: 3.2
      classification: 'extreme'
      value: 12500000
      rolling_mean: 3200000
      context: 'Index rebalancing date (VN30 quarterly review)'
    - date: '2025-12-22'
      metric: 'close'
      z_score: -2.4
      classification: 'anomaly'
      value: 76500
      rolling_mean: 81200
      context: 'Year-end portfolio rebalancing pressure'

seasonality:
  tet_effect_detected: true
  tet_volume_change: -52.3
  tet_volume_ci_95: [-58.1, -46.5]
  quarter_end_effect: false
  notes: 'Tet effect significant (p<0.001, 52% volume decline in Feb)'

simpsons_paradox_check:
  checked: true
  paradox_detected: false
  note: 'Price decline consistent across 7/10 sectors'

confidence:
  layer_2_score: 82
  grade: 'B'
  flags:
    red: 0
    yellow: 2
    green: 7
---
```

## Chart Specifications

| Analysis            | Chart Type                | Key Elements                                |
| ------------------- | ------------------------- | ------------------------------------------- |
| Price + MAs         | Line chart                | Price line, 20/50/200 MA lines, volume bars |
| Period comparison   | Grouped bar               | Period means with CI error bars             |
| Anomalies           | Scatter on line           | Highlighted points on price line            |
| Seasonality         | Calendar heat map         | Monthly average returns color-coded         |
| Structural break    | Line with vertical marker | Pre/post event with different colors        |
| Trend decomposition | Multi-panel               | Level, trend direction, volatility panels   |

## Error Handling

| Scenario                      | Action                                        |
| ----------------------------- | --------------------------------------------- |
| Time series < 20 points       | SKIP moving averages, note insufficient data  |
| Time series < 60 points       | Proceed with WARN, wider CIs, note limitation |
| Missing dates (gaps > 5 days) | Fill with NaN, flag gap in report             |
| Price limit hits              | Note as context, do not treat as data error   |
| Pre-listing data request      | Report earliest available date, adjust range  |

## Agent Behavior Rules

1. **Describe, never predict** - "Price has been declining" not "Price will decline"
2. **Context for every anomaly** - Check if anomaly is data error or market event
3. **CIs on all period comparisons** - No naked point estimates
4. **Simpson's Paradox check** - Before any aggregate trend conclusion
5. **Vietnamese calendar awareness** - Tet, AGM season, rebalancing dates
6. **Multiple timeframes** - Present short, medium, and long-term views
7. **No regression** - Moving averages and period comparisons only
8. **Chart every trend** - Visualization essential for time-series patterns

---

**Powered by AI Analyst Lab | aianalystlab.ai**
