# Metric Spec Skill

# Metric Specification Template and Registry

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/metric-spec` command
- When analysis references a non-standard metric
- When user wants to define a custom metric

## Command

`/metric-spec [metric_name]` - View specification for a metric
`/metric-spec register [name]` - Register a new custom metric
`/metric-spec list` - List all registered metrics

## Purpose

Ensure every metric used in analysis has a clear, unambiguous specification including formula, data source, typical range, and update frequency. This prevents metric definition inconsistencies across analyses.

## Metric Specification Template

```yaml
metric_id: 'pe_ratio'
name: 'Price-to-Earnings Ratio'
vietnamese_name: 'He so gia tren thu nhap'
abbreviation: 'P/E'

formula:
  expression: 'market_price / earnings_per_share'
  numerator: 'Current market price per share (VND)'
  denominator: 'Trailing 12-month earnings per share (VND)'
  notes:
    - 'Uses trailing 12M EPS, not forward estimates'
    - 'Negative EPS results in negative P/E (flag as unusual)'

data_source:
  primary: 'vnstock ratios API (KBS)'
  secondary: 'Calculated from price / EPS if ratio API unavailable'
  update_frequency: 'Quarterly (aligned with earnings reports)'

typical_range:
  vietnamese_market: { min: 5, max: 30, median: 12 }
  global_comparison: { min: 10, max: 25, median: 18 }
  outlier_threshold: { low: 0, high: 50 }

interpretation:
  low: 'Potentially undervalued or earnings concerns'
  high: 'Growth expectations or overvaluation'
  negative: 'Company reporting losses (flag for review)'
  zero: 'Invalid, should not occur'

quality_rules:
  null_handling: 'Flag as gap, do not fill'
  precision: 1 # decimal places
  format: '12.8x'
  comparison_note: 'Compare within same sector for meaningful comparison'
```

## Pre-Registered Metrics

Located in `.knowledge/datasets/vnstock_default/metrics/`:

| Metric     | File            | Formula                     |
| ---------- | --------------- | --------------------------- |
| P/E Ratio  | pe_ratio.yaml   | Price / EPS                 |
| P/B Ratio  | pb_ratio.yaml   | Price / Book Value          |
| ROE        | roe.yaml        | Net Income / Equity         |
| Market Cap | market_cap.yaml | Price \* Shares Outstanding |

## Register Custom Metric

When user runs `/metric-spec register`:

```
Register Custom Metric
======================

Please provide:
1. Metric name: [e.g., "EV/EBITDA"]
2. Formula: [e.g., "Enterprise Value / EBITDA"]
3. Data source: [which vnstock API fields]
4. Typical range: [expected min-max for Vietnamese stocks]
5. Update frequency: [quarterly/daily/annual]
```

After registration, save to `.knowledge/datasets/vnstock_default/metrics/[metric_id].yaml`.

## View Metric

When user runs `/metric-spec P/E`:

```
Metric: P/E Ratio (He so gia tren thu nhap)
============================================

Formula: Market Price / Trailing 12M EPS
Source: vnstock ratios API (KBS)
Updated: Quarterly

Typical Range (Vietnamese market):
  Low: 5x | Median: 12x | High: 30x

Interpretation:
  < 8x: Deep value territory (check for value traps)
  8-15x: Value range (most VN30 banks fall here)
  15-25x: Fair value to growth premium
  > 25x: High growth expectations (verify earnings trajectory)
  < 0: Loss-making company (review carefully)

Notes:
  - VCB typically trades at 15-18x (SOE premium)
  - Private banks (TCB, VPB) typically 6-10x
  - Compare within sector, not across sectors
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
