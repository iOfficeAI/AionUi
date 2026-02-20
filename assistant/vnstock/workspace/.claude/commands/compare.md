---
name: compare
description: Side-by-side fundamental and technical comparison of Vietnamese stocks
---

# /compare Command

Compare multiple Vietnamese stocks side-by-side with fundamentals, technicals, and valuation.

## Usage

```
/compare VCB ACB TCB
/compare VNM SAB
/compare HPG GAS
```

## Comparison Framework

### 1. Company Overview

- Exchange listing (HOSE, HNX, UPCOM)
- Market cap
- Sector/industry
- VN30 membership
- Foreign ownership limit & current

### 2. Fundamental Comparison

- **Profitability**: ROE, ROA, net margin
- **Growth**: Revenue CAGR, EPS growth
- **Financial Health**: Current ratio, debt/equity
- **Efficiency**: Asset turnover, inventory turns
- **Quality**: Free cash flow, ROIC

### 3. Valuation Multiples

- **P/E ratio**: Price to earnings
- **P/B ratio**: Price to book
- **P/S ratio**: Price to sales
- **Dividend yield**: Current yield
- **Relative valuation**: vs sector average

### 4. Technical Analysis

- **Trend**: Price action (uptrend, downtrend, range)
- **Momentum**: RSI, MACD signals
- **Moving averages**: Relationship to EMA50, EMA200
- **Volume**: Liquidity comparison
- **Support/resistance**: Key levels

### 5. Market Metrics

- **Trading volume**: Average daily (30-day)
- **Foreign activity**: Foreign buy/sell ratio
- **Price performance**: YTD, 1Y, 3Y returns
- **Volatility**: 30-day, 90-day

## Output

```
analyses/{TICKER1}_compare_{TICKER2}_{DATE}/
├── report.md
├── charts/
│   ├── price_comparison_{DATE}.png
│   ├── fundamentals_heatmap_{DATE}.png
│   ├── valuation_comparison_{DATE}.png
│   └── technical_comparison_{DATE}.png
└── data/
    ├── {TICKER1}_data.json
    ├── {TICKER2}_data.json
    └── comparison_matrix.json
```

## Report Structure

1. **Executive Summary**
   - Quick verdict: Which stock looks better and why
2. **Company Profiles**
   - Brief overview of each company
3. **Fundamental Scorecard**
   - Side-by-side table with color coding
4. **Valuation Analysis**
   - Which is cheaper on multiple metrics
5. **Technical Picture**
   - Which has better momentum
6. **Risk Comparison**
   - Volatility, drawdowns, sector exposure
7. **Recommendation**
   - Ranking with rationale

## Vietnamese Banking Example

```bash
/compare VCB ACB TCB
```

Compares top 3 banks:

| Metric         | VCB      | ACB      | TCB      |
| -------------- | -------- | -------- | -------- |
| Market Cap     | 640T VND | 197T VND | 283T VND |
| P/E Ratio      | 10.2x    | 8.5x     | 9.1x     |
| ROE            | 22%      | 18%      | 19%      |
| Loan Growth    | 12%      | 15%      | 14%      |
| NPL Ratio      | 1.1%     | 1.4%     | 1.2%     |
| Dividend Yield | 3.2%     | 2.8%     | 3.0%     |

**Verdict**: VCB for quality (highest ROE, lowest NPL), ACB for value (lowest P/E), TCB balanced

## Sector-Specific Comparisons

### Banking (VCB vs ACB vs TCB vs MBB)

- Loan book quality (NPL ratios)
- Capital adequacy (CAR)
- Net interest margin
- Digital banking adoption

### Consumer (VNM vs SAB vs MSN)

- Brand strength
- Distribution network
- Margin trends
- Market share

### Industrial (HPG vs GAS vs PLX)

- Capacity utilization
- Commodity exposure
- Export vs domestic
- Capex plans

## Integration with /trading-ideas

After comparison, deep dive on winner:

```
/trading-ideas VCB
```
