# Technicals Analyst Skill

## Purpose

Quantitative technical analysis using four signal categories:

| Category       | Indicators                        | Weight |
| -------------- | --------------------------------- | ------ |
| Trend          | EMA 8/21/55, price vs EMAs        | 30%    |
| Momentum       | 1-month, 3-month, 6-month returns | 30%    |
| Mean Reversion | Bollinger Bands, RSI, Z-score     | 20%    |
| Volatility     | Historical volatility, HV regime  | 20%    |

## Signal Logic

- **Bullish**: Uptrend confirmed, positive momentum, not overbought, normal/low volatility
- **Bearish**: Downtrend, negative momentum, overbought/oversold conditions, elevated volatility
- **Neutral**: Mixed signals across categories

## Requires Price History

This skill needs 1 year of price data. Provide start_date approximately 1 year before end_date.

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/technicals/scripts/analyze.py TICKER START_DATE END_DATE

# Examples (1 year of data):
python .claude/skills/technicals/scripts/analyze.py AAPL 2025-02-19 2026-02-19
python .claude/skills/technicals/scripts/analyze.py NVDA 2025-02-19 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `trend_signal`: EMA-based trend direction
- `momentum_signal`: recent momentum assessment
- `mean_reversion_signal`: RSI/Bollinger assessment
- `volatility_signal`: volatility regime
- `reasoning`: breakdown per indicator
