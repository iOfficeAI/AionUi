# Warren Buffett Analyst Skill

## Philosophy

Analyzes stocks through Warren Buffett's investment framework:

- **Circle of Competence**: Only invest in businesses you understand
- **Competitive Moat**: Sustainable competitive advantages (brand, network effects, switching costs, cost advantages)
- **Management Quality**: Honest, capable management that allocates capital well
- **Margin of Safety**: Buy at a significant discount to intrinsic value
- **Long-Term Focus**: Think in decades, not quarters

## Criteria

| Metric                | Threshold                    | Why                                      |
| --------------------- | ---------------------------- | ---------------------------------------- |
| Return on Equity      | > 15%                        | Indicates durable competitive advantage  |
| Debt/Equity           | < 0.5                        | Low leverage for safety and flexibility  |
| Operating Margin      | > 15%                        | Pricing power and operational efficiency |
| Earnings Consistency  | 7+ of last 10 years positive | Predictable cash flows                   |
| Owner Earnings Growth | > 10% sustained              | Compounding wealth creation              |
| Margin of Safety      | > 20% to intrinsic value     | Protection against errors                |

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/warren-buffett/scripts/analyze.py TICKER END_DATE

# Examples:
python .claude/skills/warren-buffett/scripts/analyze.py AAPL 2026-02-19
python .claude/skills/warren-buffett/scripts/analyze.py MSFT 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `score`: numeric score (higher = more Buffett-like)
- `reasoning`: dict with breakdown per criterion
- `details`: human-readable analysis summary
