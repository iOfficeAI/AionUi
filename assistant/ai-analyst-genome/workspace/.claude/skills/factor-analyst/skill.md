# Factor Analyst Skill

Calculate quantitative investment factors and cross-sectional rankings for Vietnamese stocks.

## Python Library (Recommended)

Import and use as functions:

```python
import sys
sys.path.insert(0, '.')

from factor_analyst.calculate import calculate_factor_scores, rank_universe
from factor_analyst.correlation import calculate_factor_correlation

# Calculate factor scores for a stock
factor_scores = calculate_factor_scores(symbol='VCB')

# Rank stock against universe
rankings = rank_universe(universe='VN30', date='2026-02-20')

# Calculate factor correlation
correlation = calculate_factor_correlation(symbols=['VCB', 'ACB', 'TCB', 'VPB'])

print(f"Value z-score: {factor_scores['value']['z_score']:.2f}")
print(f"Quality z-score: {factor_scores['quality']['z_score']:.2f}")
print(f"Rank in VN30: #{rankings['rank']} of {rankings['total']}")
```

## CLI (Legacy)

For backward compatibility:

```bash
python scripts/calculate_factors.py --symbol VCB
python scripts/rank_universe.py --universe VN30
python scripts/factor_correlation.py --symbols "VCB,ACB,TCB,VPB"
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

Returns a Python dict:

```python
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

### Save to CSV (Optional)

```python
import pandas as pd

# Save factor scores
pd.DataFrame([factor_scores]).to_csv('drafts/factors/data/factor_scores.csv', index=False)

# Flatten nested structure for CSV
flattened = pd.json_normalize(factor_scores)
flattened.to_csv('drafts/factors/data/factors_detailed.csv', index=False)
```
