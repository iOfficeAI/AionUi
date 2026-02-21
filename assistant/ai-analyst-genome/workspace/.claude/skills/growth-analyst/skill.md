# Growth Analyst Skill

## Purpose

Evaluates a company's growth trajectory, market opportunity, and S-curve positioning:

- **Revenue Growth Rate**: Absolute and trend (accelerating/decelerating)
- **TAM Penetration**: Estimated market share vs total addressable market
- **S-Curve Stage**: Early hypergrowth / mid-growth / late maturity
- **Rule of 40**: Growth rate + FCF margin (>40% = excellent for SaaS/tech)
- **Earnings Leverage**: Operating leverage as revenue scales

## Growth Stage Classification

| Stage         | Revenue Growth | Margin Trend         | S-Curve Position |
| ------------- | -------------- | -------------------- | ---------------- |
| Hypergrowth   | > 40% YoY      | Negative (investing) | Early            |
| High Growth   | 20–40% YoY     | Improving            | Mid-early        |
| Growth        | 10–20% YoY     | Positive             | Mid              |
| Mature Growth | 5–10% YoY      | Stable/high          | Late             |
| Mature        | < 5% YoY       | High/stable          | End              |

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/growth-analyst/scripts/analyze.py TICKER END_DATE

# Examples:
python .claude/skills/growth-analyst/scripts/analyze.py NVDA 2026-02-19
python .claude/skills/growth-analyst/scripts/analyze.py AAPL 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `growth_stage`: classification of current growth stage
- `revenue_growth_rate`: most recent YoY revenue growth
- `growth_trend`: "accelerating" | "decelerating" | "stable"
- `rule_of_40_score`: growth rate + FCF margin
- `reasoning`: detailed growth assessment
