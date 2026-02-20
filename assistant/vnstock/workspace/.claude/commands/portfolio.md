---
name: portfolio
description: Analyze portfolio holdings for risk, correlation, and diversification
---

# /portfolio Command

Analyze your Vietnamese stock portfolio for risk, correlation, sector exposure, and diversification.

## Usage

```
/portfolio
```

Then provide your holdings when prompted:

```json
{
  "holdings": [
    { "symbol": "VCB", "shares": 1000, "avg_cost": 58500 },
    { "symbol": "ACB", "shares": 2000, "avg_cost": 22000 },
    { "symbol": "VNM", "shares": 500, "avg_cost": 72000 },
    { "symbol": "HPG", "shares": 3000, "avg_cost": 24000 }
  ]
}
```

## Analysis Components

### 1. Portfolio Overview

- Current value (total VND)
- Cost basis (total VND)
- Unrealized P&L (VND and %)
- Number of positions
- Largest holdings (top 5)

### 2. Position Sizing

- Weight of each position (%)
- Concentration risk (largest 3 positions)
- Recommended rebalancing (if any)

### 3. Sector Exposure

- Banking allocation (%)
- Consumer allocation (%)
- Industrial allocation (%)
- Real estate allocation (%)
- Tech allocation (%)
- Sector diversification score

### 4. Risk Metrics

- **Portfolio volatility**: 30-day, 90-day
- **Beta vs VNIndex**: Market sensitivity
- **Max drawdown**: Historical peak-to-trough
- **Sharpe ratio**: Risk-adjusted returns
- **VaR (Value at Risk)**: 95% confidence

### 5. Correlation Analysis

- Correlation matrix between holdings
- Highly correlated pairs (>0.7)
- Diversification benefits
- Recommended additions for diversification

### 6. Performance Attribution

- Which positions contributed most to returns
- Which positions dragged performance
- Sector contribution to returns

## Output

```
analyses/portfolio_{DATE}/
├── report.md
├── charts/
│   ├── allocation_pie_{DATE}.png
│   ├── sector_exposure_{DATE}.png
│   ├── correlation_heatmap_{DATE}.png
│   ├── performance_attribution_{DATE}.png
│   └── risk_return_scatter_{DATE}.png
└── data/
    ├── holdings.json
    ├── metrics.json
    ├── correlation_matrix.json
    └── recommendations.json
```

## Report Structure

1. **Executive Summary**
   - Portfolio value and P&L
   - Key risks identified
   - Top recommendations

2. **Current Allocation**
   - Position sizes (table + chart)
   - Sector weights

3. **Risk Analysis**
   - Volatility, beta, drawdown
   - Concentration risk
   - Correlation matrix

4. **Performance Review**
   - Returns by position
   - Attribution by sector
   - Benchmark comparison (vs VNIndex)

5. **Recommendations**
   - Rebalancing suggestions
   - Diversification opportunities
   - Risk reduction ideas

## Vietnamese Portfolio Example

**Holdings:**

- 40% VCB (Banking)
- 25% ACB (Banking)
- 20% VNM (Consumer)
- 15% HPG (Industrial)

**Analysis:**

- **Risk**: High banking concentration (65%)
- **Correlation**: VCB-ACB correlation 0.85 (too high)
- **Volatility**: Portfolio beta 0.92 vs VNIndex
- **Recommendation**: Reduce banking to <50%, add real estate or tech

## Rebalancing Suggestions

Based on risk analysis:

```
Current:
- Banking: 65% → Reduce to 45%
- Consumer: 20% → Maintain
- Industrial: 15% → Increase to 20%
- Real Estate: 0% → Add 10%
- Tech: 0% → Add 5%
```

Suggested trades:

- Sell 30% of ACB position
- Buy VHM (real estate)
- Buy FPT (tech)

## Integration with Other Commands

After portfolio analysis:

**Research a recommended add:**

```
/trading-ideas VHM
```

**Compare holdings:**

```
/compare VCB ACB
```

**Macro check:**

```
/macro
```

## Data Requirements

Requires vnstock data for each holding:

- Historical prices (1 year for volatility)
- Current prices (for valuation)
- Financial metrics (for quality check)
- Market data (for beta calculation)
