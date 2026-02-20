# Factor Analyst Skill

Calculate quantitative investment factors and cross-sectional rankings for Vietnamese stocks.

## Commands

### Calculate Factors

```bash
python scripts/calculate_factors.py --symbol VCB --output factors.json
```

### Rank Universe

```bash
python scripts/rank_universe.py --universe VN30 --output rankings.json
```

### Factor Correlation

```bash
python scripts/factor_correlation.py --symbols "VCB,ACB,TCB,VPB" --output correlation.json
```

## Factors

### Value

- **P/E Ratio**: Price-to-earnings (lower is better)
- **P/B Ratio**: Price-to-book (lower is better)
- **EV/EBITDA**: Enterprise value to EBITDA (lower is better)

### Momentum

- **12M Return**: Trailing 12-month price return
- **6M Return**: Trailing 6-month price return
- **RSI**: Relative strength index

### Quality

- **ROE**: Return on equity
- **ROA**: Return on assets
- **Debt/Equity**: Financial leverage (lower is better)

### Growth

- **Revenue CAGR**: 3-year revenue growth
- **EPS CAGR**: 3-year earnings growth
- **Sales Growth**: YoY revenue growth

### Volatility

- **Std Dev**: 12-month return volatility (lower is better)
- **Beta**: Market sensitivity
- **Max Drawdown**: Largest peak-to-trough decline

## Output Format

```json
{
  "symbol": "VCB",
  "timestamp": "2026-02-20T10:30:00Z",
  "factors": {
    "value": {
      "pe_ratio": 12.5,
      "pb_ratio": 2.3,
      "ev_ebitda": 8.5,
      "z_score": 0.8
    },
    "momentum": {
      "return_12m": 25.5,
      "return_6m": 15.2,
      "rsi": 62.0,
      "z_score": 1.2
    },
    "quality": {
      "roe": 18.5,
      "roa": 1.2,
      "debt_equity": 6.5,
      "z_score": 1.5
    },
    "growth": {
      "revenue_cagr": 12.0,
      "eps_cagr": 15.0,
      "sales_growth_yoy": 14.0,
      "z_score": 0.9
    },
    "volatility": {
      "std_dev": 18.5,
      "beta": 0.9,
      "max_drawdown": -15.0,
      "z_score": -0.5
    }
  },
  "composite_score": 4.9,
  "percentile_rank": 78
}
```
