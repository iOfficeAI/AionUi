---
name: screen
description: Screen Vietnamese stocks by financial and technical criteria
---

# /screen Command

Filter Vietnamese stocks by financial metrics, technical indicators, and sector criteria.

## Usage

```
/screen sector:banks pe:<10 roe:>15
/screen exchange:HOSE volume:>1000000
/screen vn30 momentum:high
/screen dividend:>3
```

## Filter Criteria

### Sector/Exchange Filters

- `sector:banks` - Banking sector
- `sector:consumer` - Consumer goods
- `sector:industrial` - Industrials
- `sector:realestate` - Real estate
- `sector:tech` - Technology
- `exchange:HOSE` - HOSE exchange
- `exchange:HNX` - HNX exchange
- `vn30` - VN30 index constituents only

### Fundamental Filters

- `pe:<10` - P/E ratio less than 10
- `pe:>20` - P/E ratio greater than 20
- `pb:<2` - Price to book less than 2
- `roe:>15` - ROE greater than 15%
- `margin:>10` - Net margin > 10%
- `debt:<50` - Debt/equity < 50%
- `dividend:>3` - Dividend yield > 3%
- `growth:>10` - Revenue growth > 10%

### Technical Filters

- `momentum:high` - RSI > 60, price > EMA50
- `momentum:low` - RSI < 40, price < EMA50
- `uptrend` - Price > EMA50 > EMA200
- `downtrend` - Price < EMA50 < EMA200
- `oversold` - RSI < 30
- `overbought` - RSI > 70
- `volume:>1000000` - Avg daily volume > 1M

### Market Cap Filters

- `cap:large` - Market cap > 50T VND
- `cap:mid` - Market cap 10-50T VND
- `cap:small` - Market cap < 10T VND

## Process

1. **Parse Criteria**
   - Extract sector, metrics, thresholds
2. **Fetch Data**
   - Get symbols from vnstock (filtered by sector/exchange)
   - Retrieve financial data for each symbol
   - Get price data for technicals
3. **Apply Filters**
   - Screen by fundamental criteria
   - Screen by technical criteria
   - Combine filters (AND logic)
4. **Rank Results**
   - Sort by composite score
   - Highlight top 10-20 matches
5. **Generate Report**
   - Screener results table
   - Top picks analysis
   - Charts for top 5

## Output

```
analyses/screen_{criteria}_{DATE}/
├── report.md
├── charts/
│   ├── top5_comparison_{DATE}.png
│   └── sector_heatmap_{DATE}.png
└── data/
    ├── screener_results.json (all matches)
    └── top_picks.json (top 10)
```

## Report Structure

1. **Screening Criteria**
   - Filters applied
   - Universe size
2. **Results Summary**
   - Total matches
   - Sector breakdown
3. **Top Picks Table**
   - Symbol, name, key metrics
   - Sorted by composite score
4. **Individual Analysis** (top 5)
   - Brief fundamental + technical summary
5. **Sector Insights**
   - Which sectors passed screens
   - Common characteristics

## Vietnamese Market Examples

### Value Banks

```bash
/screen sector:banks pe:<10 roe:>15 dividend:>2.5
```

Finds:

- ACB (P/E 8.5, ROE 18%, Div 2.8%)
- TCB (P/E 9.1, ROE 19%, Div 3.0%)

### Quality Growth

```bash
/screen vn30 roe:>20 growth:>12
```

Finds VN30 stocks with high ROE and revenue growth

### Momentum Plays

```bash
/screen exchange:HOSE momentum:high volume:>1000000
```

Finds HOSE stocks in uptrend with high volume

### Dividend Stocks

```bash
/screen dividend:>4 debt:<50
```

High yield with low leverage

## Integration

After screening, analyze top picks:

```
/compare {TICKER1} {TICKER2} {TICKER3}
```

Or deep dive on best match:

```
/trading-ideas {TICKER}
```

## Data Source

Uses vnstock for Vietnamese stocks:

- Financial statements (balance sheet, income, ratios)
- Price data (for technical filters)
- Market listings (for sector/exchange filters)

## Limitations

- Data availability varies by stock
- Some metrics may be missing for smaller stocks
- Ratios are point-in-time (latest quarter/year)
- Technical indicators use recent price history
