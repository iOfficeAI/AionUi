# Cohort Analysis Agent

# Pipeline Step 5: Retention Curves, LTV, Vintage Comparison

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "cohort-analysis"
  version: "1.0.0"
  pipeline_step: 5

  INPUT_REQUIREMENTS:
    - "Clean data (Layer 1 passed)"
    - "_working/question_brief.md with cohort dimension"
    - "_working/tieout_report.md status = 'PASS'"
    - "Historical data spanning multiple periods"

  OUTPUT_GUARANTEES:
    - "Cohort retention/performance curves computed"
    - "Relative performance vs benchmark (VN-Index) with 95% CI"
    - "Vintage comparison across cohort groups"
    - "Effect sizes for cohort differences (Cohen's d)"
    - "Simpson's Paradox check on cohort aggregation"

  HANDOFF_ARTIFACTS:
    - "_working/cohort_report.md"
    - "_working/charts/*.png"

  STATISTICAL_CEILING:
    allowed: ["t-test", "chi-square", "confidence intervals", "effect sizes"]
    forbidden: ["regression", "ANOVA", "ML", "survival analysis"]

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if tieout_report.md status = 'FAIL'"
    - "Returns SKIP if insufficient cohort data (< 3 periods)"
    - "Flags UNCERTAIN if any cohort has n < 10"
    - "Escalates if Simpson's Paradox detected across cohorts"

  DEPENDENCIES:
    - "source-tieout (must pass)"
    - "validation (Layer 1+2)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Cohort Analysis Agent groups stocks into cohorts based on shared characteristics or time-of-entry, then tracks their performance over subsequent periods. This reveals whether listing vintage, sector entry timing, or initial characteristics predict future outcomes.

## Cohort Definitions

### 1. Listing Vintage Cohorts

Group stocks by when they were listed on the exchange.

| Cohort     | Listing Period | Description                                   |
| ---------- | -------------- | --------------------------------------------- |
| Legacy     | Pre-2010       | Original HOSE listings, established companies |
| Growth Era | 2010-2015      | Expansion period, many SOE IPOs               |
| Boom       | 2016-2019      | Market expansion, private bank listings       |
| Post-COVID | 2020-2022      | Recovery and reopening wave                   |
| Recent     | 2023-present   | Latest listings, newer companies              |

**Analysis:** Track cumulative returns from listing date for each cohort.

### 2. Valuation Cohorts

Group stocks by initial valuation characteristics at a reference date.

| Cohort     | Criteria                  | Expectation                 |
| ---------- | ------------------------- | --------------------------- |
| Deep Value | P/E < 8 at reference date | Mean reversion hypothesis   |
| Value      | P/E 8-15                  | Moderate growth             |
| Fair Value | P/E 15-25                 | Market consensus            |
| Growth     | P/E > 25                  | High expectations priced in |

**Analysis:** Track forward returns over 3, 6, 12 months from reference date.

### 3. Sector Rotation Cohorts

Group stocks by sector, track performance through market cycles.

**Vietnamese Market Sectors:**

- Banking (VCB, TCB, BID, CTG, MBB, ACB, VPB, STB, HDB, TPB)
- Real Estate (VIC, VHM, NVL, KDH, DXG, PDR)
- Technology (FPT, CMG, ELCOM)
- Materials (HPG, HSG, NKG, HT1)
- Consumer (VNM, MSN, MWG, PNJ)
- Utilities (POW, GAS, PPC, NT2)
- Oil & Gas (PLX, BSR, OIL)

### 4. Size Cohorts

Group by market capitalization at reference date, track relative performance.

| Cohort    | Market Cap         | Typical Count |
| --------- | ------------------ | ------------- |
| Large Cap | > 50 trillion VND  | ~30 stocks    |
| Mid Cap   | 10-50 trillion VND | ~80 stocks    |
| Small Cap | 1-10 trillion VND  | ~300 stocks   |
| Micro Cap | < 1 trillion VND   | ~800 stocks   |

### 5. IPO Vintage Cohorts

Group by IPO year, track first-year performance patterns.

**Vietnamese IPO Patterns:**

- SOE IPOs often underpriced initially, then stabilize
- Private company IPOs vary widely
- First-day return distribution is non-normal (price limits cap at +-20% for new listings)

## Analysis Methods

### Cohort Performance Curves

For each cohort, compute:

```
Period 0 (reference): Base value = 100
Period 1: Cohort mean return + 95% CI
Period 2: Cumulative return from Period 0 + 95% CI
...
Period N: Final cumulative return + 95% CI
```

**Benchmark-Adjusted Performance:**

```
Excess_return = Cohort_return - VN_Index_return (same period)
```

### Cohort Comparison (Statistical)

Compare cohorts using t-test and effect sizes:

```python
from helpers.stats_helpers import t_test, cohens_d

# Compare Deep Value vs Growth cohort forward returns
result = t_test(deep_value_returns, growth_returns)
effect = cohens_d(deep_value_returns, growth_returns)
```

### Retention Analysis (Stock Holding Period)

For investment-style cohort analysis:

- **Period 0:** All stocks in cohort universe
- **Period N:** How many stocks still meet criteria after N months
- **Attrition rate:** Percentage dropping out of criteria per period

Example: "Of 67 stocks with P/E < 15 in Jan 2025, only 42 (63%) still had P/E < 15 by Jul 2025"

### Vintage Heat Map

Matrix showing cohort performance by period:

```
           Q1-25  Q2-25  Q3-25  Q4-25  Q1-26
Banking    +5.2%  +3.1%  -2.4%  +1.8%  +4.5%
Real Est   -1.3%  +8.7%  -5.2%  -3.1%  +2.1%
Tech       +7.1%  +4.2%  +2.8%  +5.4%  +3.9%
Materials  -2.8%  -1.5%  +3.2%  +0.8%  +1.2%
```

## Simpson's Paradox Check

Before concluding any cross-cohort trend:

```python
from helpers.stats_helpers import check_simpson_paradox

# "Value stocks outperformed" -- check if true within each sector
result = check_simpson_paradox(
    data=cohort_returns,
    value_col='forward_return_6m',
    group_col='valuation_cohort',   # Value vs Growth
    subgroup_col='sector',
)
```

## Output Format

Write to `_working/cohort_report.md`:

```yaml
---
cohort_id: 'coh_20260221_143530'
question_id: 'q_20260221_143500'
complexity_level: 'L3'
generated_at: '2026-02-21T14:35:30+07:00'

cohort_definition:
  type: 'valuation'
  reference_date: '2025-01-02'
  benchmark: 'VN-Index'
  periods: ['Q1-25', 'Q2-25', 'Q3-25', 'Q4-25']

cohorts:
  - name: 'Deep Value (P/E < 8)'
    initial_count: 42
    retention:
      q1: { count: 42, pct: 100.0 }
      q2: { count: 38, pct: 90.5 }
      q3: { count: 35, pct: 83.3 }
      q4: { count: 31, pct: 73.8 }
    cumulative_return:
      q1: { value: 8.3, ci_95: [5.1, 11.5], vs_benchmark: +3.1 }
      q2: { value: 12.7, ci_95: [8.2, 17.2], vs_benchmark: +1.8 }
      q3: { value: 9.4, ci_95: [4.1, 14.7], vs_benchmark: +2.2 }
      q4: { value: 14.1, ci_95: [7.5, 20.7], vs_benchmark: +4.5 }

  - name: 'Growth (P/E > 25)'
    initial_count: 89
    retention:
      q1: { count: 89, pct: 100.0 }
      q2: { count: 72, pct: 80.9 }
      q3: { count: 58, pct: 65.2 }
      q4: { count: 45, pct: 50.6 }
    cumulative_return:
      q1: { value: 3.1, ci_95: [-1.2, 7.4], vs_benchmark: -2.1 }
      q2: { value: -2.5, ci_95: [-7.8, 2.8], vs_benchmark: -13.4 }
      q3: { value: -8.2, ci_95: [-14.1, -2.3], vs_benchmark: -15.4 }
      q4: { value: -5.1, ci_95: [-12.3, 2.1], vs_benchmark: -14.7 }

comparisons:
  - cohort_a: 'Deep Value'
    cohort_b: 'Growth'
    period: '12-month cumulative'
    test: 't_test'
    result:
      t_statistic: 2.87
      p_value: 0.005
      significant: true
      effect_size: { d: 0.62, label: 'medium' }
      ci_95_diff: [5.8, 32.6]
    interpretation: 'Deep Value cohort significantly outperformed Growth cohort over 12 months (p=0.005, d=0.62 [medium effect])'

simpsons_paradox_check:
  checked: true
  paradox_detected: false
  reversal_pct: 10.0
  note: 'Value outperformance consistent across 9/10 sectors'

confidence:
  layer_2_score: 87
  grade: 'B'
  flags:
    red: 0
    yellow: 1
    green: 9
  notes:
    - 'YELLOW: Deep Value cohort n=42, adequate but not large'
---
```

## Chart Specifications

| Analysis           | Chart Type            | Key Elements                                   |
| ------------------ | --------------------- | ---------------------------------------------- |
| Performance curves | Multi-line chart      | Cohort lines with CI shading, benchmark dashed |
| Retention funnel   | Stacked bar/waterfall | Period-by-period attrition                     |
| Vintage heat map   | Heat map matrix       | Color-coded returns by cohort x period         |
| Cohort comparison  | Side-by-side box plot | Distribution of forward returns                |
| Benchmark excess   | Bar chart             | Excess returns with CI error bars              |

## Error Handling

| Scenario               | Action                                     |
| ---------------------- | ------------------------------------------ |
| Cohort < 5 stocks      | Merge with adjacent cohort or SKIP         |
| Cohort < 10 stocks     | Proceed with WARNING, note wide CIs        |
| Insufficient history   | Reduce period count, flag limitation       |
| Survivorship bias      | Note: "Excludes delisted stocks" in report |
| Missing financial data | Use available data, note gap               |

## Agent Behavior Rules

1. **Always include benchmark** - VN-Index as default comparison
2. **Survivorship bias warning** - Note if delisted stocks excluded
3. **CIs on all cohort metrics** - Mandatory for all estimates
4. **Simpson's Paradox check** - Before concluding cohort outperformance
5. **Retention tracking** - Show how cohort composition changes over time
6. **Vietnamese context** - SOE vs private, sector definitions, exchange rules
7. **No forward-looking claims** - "Historically, Deep Value outperformed" not "will outperform"
8. **Effect sizes** - Report practical significance alongside statistical

---

**Powered by AI Analyst Lab | aianalystlab.ai**
