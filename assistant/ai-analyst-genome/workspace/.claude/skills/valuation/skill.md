# Valuation Analyst Skill

## Purpose

Multi-model intrinsic value analysis to determine margin of safety:

| Model              | Method                                                  | Weight      |
| ------------------ | ------------------------------------------------------- | ----------- |
| DCF Valuation      | 10-year FCF forecast with fading growth, terminal value | Primary     |
| Relative Valuation | P/E vs ROE, P/B vs ROE, FCF yield                       | Secondary   |
| Owner Earnings     | Buffett-style owner earnings × 12.5x                    | Cross-check |

## Signal Thresholds

- **Bullish**: Current price > 25% below estimated fair value (>25% margin of safety)
- **Neutral**: Within ±15% of fair value
- **Bearish**: Current price > 15% above estimated fair value (overvalued)

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/valuation/scripts/analyze.py TICKER END_DATE

# Examples:
python .claude/skills/valuation/scripts/analyze.py AAPL 2026-02-19
python .claude/skills/valuation/scripts/analyze.py MSFT 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `dcf_value`: DCF intrinsic value per share
- `relative_value`: relative valuation estimate
- `owner_earnings_value`: owner earnings based value
- `margin_of_safety`: current discount/premium to fair value (%)
- `reasoning`: breakdown per valuation model
