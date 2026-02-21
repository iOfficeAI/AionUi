# Risk Manager Skill

## Purpose

Calculates volatility-adjusted position sizing and risk classification for a stock.

## Methodology

1. **Historical Volatility**: Annualized standard deviation of daily returns
2. **Risk Classification**:
   - Low: < 20% annualized volatility
   - Medium: 20–35% annualized volatility
   - High: > 35% annualized volatility
3. **Position Limit**: Volatility-adjusted allocation
   - Base position: 20% of portfolio
   - High volatility: reduced to minimum 5%
   - Low volatility: can go up to 25%

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/risk-manager/scripts/calculate.py TICKER START_DATE END_DATE PORTFOLIO_VALUE

# Examples:
python .claude/skills/risk-manager/scripts/calculate.py AAPL 2025-02-19 2026-02-19 100000
python .claude/skills/risk-manager/scripts/calculate.py NVDA 2025-02-19 2026-02-19 500000
```

## Output

Returns JSON with:

- `ticker`: the analyzed ticker
- `annualized_volatility`: historical volatility as decimal (e.g., 0.28 = 28%)
- `risk_level`: "low" | "medium" | "high"
- `max_position_size`: suggested maximum allocation as decimal (e.g., 0.15 = 15%)
- `reasoning`: explanation of risk assessment
