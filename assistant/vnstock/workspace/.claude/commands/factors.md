---
name: factors
description: Analyze current factor premium landscape in Vietnamese stock market
---

# /factors Command

Analyze which investment factors are working in the current Vietnamese market regime.

## Usage

```
/factors
```

## Factor Framework

### 1. Value Factor

**Metrics:** P/E, P/B, P/S, Dividend Yield

**Analysis:**

- Value vs growth performance
- Which value metrics working best
- Sector-specific value opportunities
- Value spread (cheap vs expensive)

### 2. Momentum Factor

**Metrics:** Price momentum, earnings momentum, RSI

**Analysis:**

- Trend strength across market
- Momentum concentration (which sectors)
- Reversal risks
- Optimal lookback period (3M, 6M, 12M)

### 3. Quality Factor

**Metrics:** ROE, ROA, profit margins, cash flow

**Analysis:**

- Quality premium vs market
- High quality stocks outperforming
- Quality + Growth combinations
- Fraud risk indicators

### 4. Size Factor

**Metrics:** Market cap, liquidity

**Analysis:**

- Large cap vs small cap
- VN30 vs broader market
- Liquidity premium
- Small cap accessibility

### 5. Low Volatility Factor

**Metrics:** Beta, volatility, drawdowns

**Analysis:**

- Low vol outperformance
- Defensive sectors working
- Risk-adjusted returns
- Flight to safety vs risk-on

### 6. Growth Factor

**Metrics:** Revenue growth, earnings growth, sales growth

**Analysis:**

- Growth premium
- Which growth rates matter (1Y, 3Y, 5Y)
- Growth at reasonable price (GARP)
- Sustainability of growth

## Vietnamese Market Factors

### Banking Factor

Unique to Vietnam's bank-heavy market:

- Interest rate sensitivity
- Credit growth cycle
- Asset quality trends

### State-Owned Enterprise (SOE) Factor

- SOE vs private companies
- Privatization opportunities
- Corporate governance

### Foreign Ownership Factor

- Foreign vs domestic investors
- Foreign room availability
- Foreign buying pressure

### Export Exposure Factor

- Export-oriented vs domestic
- FDI correlation
- Currency sensitivity

## Output

```
analyses/factors_{DATE}/
├── report.md
├── charts/
│   ├── factor_performance_{DATE}.png
│   ├── factor_spreads_{DATE}.png
│   ├── sector_factor_map_{DATE}.png
│   └── cumulative_returns_{DATE}.png
└── data/
    ├── factor_returns.json
    ├── factor_correlations.json
    └── stock_factor_loadings.json
```

## Report Structure

1. **Factor Performance Summary**
   - YTD returns by factor
   - Factor ranking (best to worst)
   - Regime identification

2. **Factor Deep Dives**
   - Each factor analyzed individually
   - Top stocks for each factor
   - Factor spreads and crowding

3. **Factor Combinations**
   - Which combos working (Value+Quality, Momentum+Quality)
   - Multi-factor screening results

4. **Sector Factor Analysis**
   - Which factors drive each sector
   - Sector rotation signals

5. **Investment Implications**
   - Recommended factor tilts
   - Stocks matching winning factors
   - Portfolio construction ideas

## Vietnamese Market Example

**Current Regime (Hypothetical):**

- **Value**: Working (+12% YTD) → Favor low P/E banks
- **Momentum**: Strong (+8% YTD) → Ride winners
- **Quality**: Neutral (+2% YTD) → Less important now
- **Size**: Large cap outperforming (+5% vs small)
- **Low Vol**: Underperforming (-3% YTD) → Risk-on environment
- **Growth**: Weakening (+1% YTD) → Expensive growth struggling

**Factor Spread:**

- Value spread: Widest in 2 years (opportunity)
- Momentum spread: Tight (crowded)

**Recommendations:**

1. **Primary tilt**: Value (banks, consumer)
2. **Secondary tilt**: Momentum (ride existing trends)
3. **Avoid**: Low volatility (missing upside)
4. **Stocks**: ACB (value), VHM (momentum), VCB (quality+value)

## Integration

After factor analysis, screen for stocks:

```
/screen vn30 pe:<10 momentum:high
```

Or research factor leaders:

```
/trading-ideas ACB
```

## Data Source

Uses vnstock for Vietnamese stocks:

- Price data (momentum, volatility)
- Financial statements (value, quality, growth)
- Market cap data (size factor)

## Update Frequency

Run monthly or after major market moves to:

- Track factor regime changes
- Adjust portfolio tilts
- Identify new opportunities
