---
name: analyze
description: Run all 4 investor personas + full analytical stack for comprehensive stock analysis
---

# /analyze Command

Complete stock analysis running all 4 investor personas plus full fundamental, technical, and valuation analysis.

## Usage

```
/analyze VCB
/analyze VNM
```

## Full Analysis Pipeline

### 1. Data Collection

- vnstock historical prices (1 year)
- Financial statements (3+ years)
- Current price board
- News & sentiment
- Market context (VNIndex, sector performance)

### 2. Analytical Skills

- **Fundamentals**: Profitability, growth, financial health
- **Technicals**: EMA, RSI, Bollinger, momentum
- **Valuation**: P/E, P/B, P/S, DCF (if data permits)
- **Risk**: Volatility, drawdowns, position sizing
- **Growth**: Revenue trends, S-curve, Rule of 40
- **News Sentiment**: Headline analysis

### 3. All 4 Investor Personas

#### Warren Buffett

- Economic moat analysis
- Owner earnings calculation
- Margin of safety evaluation
- Plain-English assessment

#### Ben Graham

- Defensive criteria scorecard (7 tests)
- Graham Number valuation
- Net-net working capital (if applicable)
- Clinical, criteria-first evaluation

#### Cathie Wood

- Innovation platform assessment
- TAM (Total Addressable Market) analysis
- 5-year growth scenarios
- Bold, future-oriented view

#### Stanley Druckenmiller

- Macro regime analysis first
- Asymmetric payoff evaluation
- Conviction sizing recommendation
- Direct, unemotional assessment

### 4. Visualization

- Price chart with EMAs
- Financial metrics trends
- Valuation multiples
- Analyst consensus radar

### 5. Final Report

**Structure:**

1. Executive Summary
2. Vietnamese Market Context
3. Company Overview
4. Fundamental Analysis
5. Technical Analysis
6. Valuation
7. **Investor Perspectives** (all 4 personas)
8. Risk Factors
9. Consensus & Recommendation
10. Charts & Data

## Output

```
analyses/{TICKER}_analyze_{DATE}/
├── report.md
├── charts/
│   ├── {TICKER}_price_{DATE}.png
│   ├── {TICKER}_financials_{DATE}.png
│   ├── {TICKER}_valuation_{DATE}.png
│   └── {TICKER}_radar_{DATE}.png
└── data/
    ├── metrics.json
    ├── prices.json
    ├── news.json
    └── {persona}_analysis.json (x4)
```

## Vietnamese Market Features

- **VN30 context**: Position in index
- **Sector leadership**: vs peers on HOSE
- **Foreign ownership**: Foreign buy/sell trends
- **Liquidity**: Average daily volume
- **Regulatory**: Vietnam-specific factors

## Example

```bash
/analyze VCB
```

Generates comprehensive Vietcombank analysis with:

- All 4 investor perspectives (Buffett, Graham, Wood, Druckenmiller)
- Full fundamental + technical + valuation stack
- Banking sector context
- VN30 index positioning
- Foreign investor sentiment
- Complete charts and data
