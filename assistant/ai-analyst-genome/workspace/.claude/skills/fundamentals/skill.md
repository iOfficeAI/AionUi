# Fundamentals Analyst Skill

## Purpose

Provides comprehensive fundamental analysis of a stock covering:

- **Profitability**: Gross margin, operating margin, net margin, ROE, ROA, ROIC
- **Growth**: Revenue growth, earnings growth, FCF growth, book value growth
- **Financial Health**: Current ratio, quick ratio, debt/equity, interest coverage
- **Valuation**: P/E, P/B, P/S, EV/EBITDA, FCF yield

## Scoring

Each dimension is scored and combined into an overall signal:

- **Bullish**: Strong metrics across multiple dimensions
- **Neutral**: Mixed signals, some strengths and weaknesses
- **Bearish**: Weak fundamentals, deteriorating metrics, financial stress

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/fundamentals/scripts/analyze.py TICKER END_DATE

# Examples:
python .claude/skills/fundamentals/scripts/analyze.py AAPL 2026-02-19
python .claude/skills/fundamentals/scripts/analyze.py MSFT 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `profitability_score`: 0–10
- `growth_score`: 0–10
- `health_score`: 0–10
- `valuation_score`: 0–10
- `reasoning`: detailed breakdown per dimension
