# Portfolio Skill

# Portfolio Analysis and Optimization

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/portfolio` command
- When user asks about portfolio construction, allocation, or risk
- L5 strategic queries involving portfolio optimization

## Command

`/portfolio [symbols]` - Analyze a portfolio
`/portfolio optimize [symbols]` - Suggest weight optimization
`/portfolio risk [symbols]` - Risk analysis
`/portfolio compare [portfolio1] vs [portfolio2]` - Compare two portfolios
`/portfolio rebalance [symbols] [target_weights]` - Rebalance analysis

## Purpose

Provide portfolio-level analysis including weight optimization, risk metrics, diversification assessment, and rebalancing recommendations. Uses descriptive statistics and correlation analysis (no ML or mean-variance optimization solvers).

## Portfolio Analysis

`/portfolio VCB TCB FPT VNM HPG`

```
Portfolio Analysis
===================
Stocks: 5 | Exchange: HOSE | As of: 2026-02-21

HOLDINGS (Equal Weight)
  Symbol  Name           Weight  Sector      PE     ROE
  VCB     Vietcombank    20%     Banking     15.2x  18.5%
  TCB     Techcombank    20%     Banking     7.8x   22.1%
  FPT     FPT Corp       20%     Technology  14.2x  19.5%
  VNM     Vinamilk       20%     Consumer    18.5x  16.9%
  HPG     Hoa Phat       20%     Materials   12.3x  16.1%

PORTFOLIO METRICS
  Weighted P/E:      13.6x
  Weighted ROE:      18.6%
  Weighted P/B:      2.3x
  Dividend yield:    2.8%

SECTOR CONCENTRATION
  Banking:    40% (VCB + TCB) -- WARNING: >30% threshold
  Technology: 20% (FPT)
  Consumer:   20% (VNM)
  Materials:  20% (HPG)

CORRELATION MATRIX (1Y daily returns)
       VCB   TCB   FPT   VNM   HPG
  VCB  1.00  0.72  0.45  0.38  0.52
  TCB  0.72  1.00  0.42  0.35  0.48
  FPT  0.45  0.42  1.00  0.31  0.40
  VNM  0.38  0.35  0.31  1.00  0.29
  HPG  0.52  0.48  0.40  0.29  1.00

  Avg correlation: 0.42 (moderate diversification)

RISK METRICS (1Y)
  Portfolio return:    +14.2%
  Portfolio volatility: 18.5% annualized
  Sharpe ratio:        0.77 (assuming 4.5% risk-free)
  Max drawdown:        -15.3% (2025-09-15 to 2025-10-22)
  VN-Index correlation: 0.85

OBSERVATIONS
  1. Banking concentration (40%) exceeds 30% sector limit
  2. VCB-TCB correlation high (0.72) -- limited diversification benefit
  3. VNM provides best diversification (lowest avg correlation)
  4. Max drawdown driven by banking sector correction in Sep 2025

RECOMMENDATIONS
  - Consider reducing banking to 30% (move 10% to another sector)
  - Add real estate or utilities for lower correlation
  - HPG adds cyclical exposure -- monitor steel demand indicators

Data freshness: Prices real-time | Financials Q3 2025
```

## Portfolio Optimization

`/portfolio optimize VCB TCB FPT VNM HPG`

```
Weight Optimization (Risk-Adjusted)
=====================================
Method: Equal Risk Contribution (no ML, no mean-variance solver)

Current vs Suggested Weights:
  Symbol  Current  Suggested  Change   Rationale
  VCB     20%      15%        -5%      Reduce banking concentration
  TCB     20%      15%        -5%      High correlation with VCB
  FPT     20%      25%        +5%      Lower correlation, strong ROE
  VNM     20%      25%        +5%      Best diversifier (lowest corr)
  HPG     20%      20%        0%       Balanced cyclical exposure

Expected Impact:
  Portfolio volatility: 18.5% -> 16.8% (-1.7pp)
  Avg correlation:     0.42 -> 0.38
  Sector max:          40% -> 30% (within limit)
  Sharpe ratio:        0.77 -> 0.85 (estimated)

Caveats:
  1. Optimization based on historical correlations (may not persist)
  2. No transaction costs included in estimates
  3. Rebalancing assumes T+2 settlement and full liquidity
  4. Not investment advice -- for analytical purposes only
```

## Risk Analysis

`/portfolio risk VCB TCB FPT VNM HPG`

Shows:

- Value at Risk (VaR) at 95% and 99% levels using historical method
- Maximum drawdown with recovery period
- Sector concentration risk
- Single-stock concentration risk
- Liquidity risk (based on average daily volume)
- Vietnamese market-specific risks (price limits, foreign ownership)

## Statistical Ceiling

**Allowed:**

- Correlation matrices
- Sharpe ratio, Sortino ratio
- Historical VaR (percentile method)
- Maximum drawdown
- Equal risk contribution weights
- Sector/stock concentration metrics

**Forbidden:**

- Mean-variance optimization (Markowitz)
- Monte Carlo simulation
- Black-Litterman model
- Factor regression models
- Machine learning portfolio optimization
- CAPM beta calculation

## Vietnamese Market Portfolio Rules

1. **Sector limits:** Flag concentration >30% in any single sector
2. **Single stock:** Flag concentration >10% in any single stock
3. **Banking dominance:** Vietnamese market is heavily banking-weighted -- warn users
4. **Price limits:** +/-7% daily cap affects short-term portfolio volatility
5. **Foreign ownership limits:** Some stocks have FOL caps affecting tradability
6. **VND denomination:** All values in VND with comma separators
7. **Trading hours:** 9:00-15:00 ICT, T+2 settlement

## Error Handling

| Scenario       | Response                                                                |
| -------------- | ----------------------------------------------------------------------- |
| Single stock   | "Portfolio analysis needs >=2 stocks. For single stock, use /explore."  |
| Invalid symbol | "Symbol [X] not found. Check /datasets coverage."                       |
| >30 stocks     | "Maximum 30 stocks for portfolio analysis. Use /screen to narrow down." |
| Missing data   | "Financial data missing for [X]. Using price data only."                |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
