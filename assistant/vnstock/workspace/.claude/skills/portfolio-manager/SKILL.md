# Portfolio Manager Skill

## Purpose

Aggregates signals from multiple analyst skills into a consensus trading decision.

## Decision Logic

Collects bullish/bearish/neutral signals from all analysts, then:

| Condition                                          | Decision    |
| -------------------------------------------------- | ----------- |
| 4+ bullish signals AND avg confidence > 70%        | Strong Buy  |
| 3+ bullish OR 2+ bullish with avg confidence > 65% | Buy         |
| 3+ bearish OR 2+ bearish with avg confidence > 65% | Sell        |
| 4+ bearish AND avg confidence > 70%                | Strong Sell |
| Otherwise                                          | Hold        |

Position sizing: `max_trade = 50% × position_limit × confidence_factor`

## Usage

Run from the workspace root directory:

```bash
# Pass signals as JSON string
python .claude/skills/portfolio-manager/scripts/aggregate.py 'SIGNALS_JSON'

# Example:
python .claude/skills/portfolio-manager/scripts/aggregate.py '{
  "warren_buffett": {"signal": "bullish", "confidence": 0.8},
  "fundamentals": {"signal": "bullish", "confidence": 0.75},
  "technicals": {"signal": "neutral", "confidence": 0.5},
  "valuation": {"signal": "bullish", "confidence": 0.7},
  "risk_manager": {"signal": "neutral", "confidence": 0.6, "max_position_size": 0.15}
}'
```

## Output

Returns JSON with:

- `decision`: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell"
- `confidence`: weighted average confidence
- `bullish_count`: number of bullish analyst signals
- `bearish_count`: number of bearish analyst signals
- `max_position_size`: recommended maximum position size
- `reasoning`: aggregation summary
