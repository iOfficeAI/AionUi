---
name: trading-ideas
description: Institutional equity research with BUY/HOLD/SELL recommendation for Vietnamese stocks
---

# /trading-ideas Command

Generate institutional-grade equity research report with clear buy/sell/hold recommendation.

## Usage

```
/trading-ideas VCB
/trading-ideas ACB
```

## What It Does

1. **Fetch Data**
   - vnstock quote (1 year historical)
   - Financial statements (balance sheet, income, cash flow, ratios)
   - Price board (current bid/ask)
   - News sentiment

2. **Run Analysis**
   - Fundamentals (profitability, growth, health)
   - Technicals (EMA, RSI, Bollinger)
   - Valuation (P/E, P/B, DCF if data available)
   - Risk assessment (volatility, position sizing)

3. **Consult Druckenmiller Persona**
   - Macro regime check
   - Asymmetric payoff evaluation
   - Conviction sizing recommendation

4. **Generate Report**
   - Executive summary
   - Investment thesis
   - **BUY/HOLD/SELL** recommendation
   - Target price (if applicable)
   - Risk factors
   - Charts (price, financials, valuation)

## Output Format

```
analyses/{TICKER}_trading-ideas_{DATE}/
├── report.md           # Full research report
├── charts/
│   ├── {TICKER}_price_{DATE}.png
│   ├── {TICKER}_financials_{DATE}.png
│   └── {TICKER}_valuation_{DATE}.png
└── data/
    ├── metrics.json
    ├── prices.json
    └── news.json
```

## Vietnamese Market Focus

Tailored for Vietnamese equities:

- **VN30** blue chips
- **HOSE** large caps
- **Banking sector** (VCB, ACB, TCB, MBB, VPB)
- **Consumer** (VNM, SAB, MWG)
- **Industrial** (HPG, GAS)

## Recommendation Criteria

**BUY:**

- Strong fundamentals + positive technicals
- Attractive valuation vs peers
- Positive macro tailwinds
- Risk/reward > 3:1

**HOLD:**

- Mixed signals across factors
- Fair valuation
- Wait for better entry
- Monitor for changes

**SELL:**

- Deteriorating fundamentals
- Overbought technicals
- Rich valuation
- Negative catalysts

## Example

```bash
/trading-ideas VCB
```

Generates institutional research on Vietcombank with:

- Banking sector analysis
- VCB competitive position
- Financial health scorecard
- Technical momentum
- Valuation vs peers (ACB, TCB, MBB)
- Buy/Hold/Sell with price target
