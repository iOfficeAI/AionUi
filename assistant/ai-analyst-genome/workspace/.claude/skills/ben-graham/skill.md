# Ben Graham Analyst Skill

## Philosophy

Analyzes stocks through Benjamin Graham's value investing framework — the father of security analysis:

- **Margin of Safety**: The central concept — buy only at a large discount to intrinsic value
- **Net-Net Value**: Stocks trading below net current asset value (NCAV) are deeply undervalued
- **Defensive Metrics**: Low P/E, low P/B, strong current ratio, low debt
- **Earnings Stability**: Consistent positive earnings over 10 years
- **Dividend Record**: Continuous dividends for 20 years preferred

## Criteria

| Metric          | Threshold               | Why                                     |
| --------------- | ----------------------- | --------------------------------------- |
| P/E Ratio       | < 15                    | Classic Graham ceiling                  |
| P/B Ratio       | < 1.5                   | (P/E × P/B < 22.5 acceptable)           |
| Current Ratio   | > 2.0                   | Financial safety for defensive investor |
| Long-term Debt  | < Net Current Assets    | Balance sheet strength                  |
| EPS Growth      | > 33% over 10 years     | Minimum growth for defensive selection  |
| Dividend Record | 20+ years uninterrupted | Income stability                        |

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/ben-graham/scripts/analyze.py TICKER END_DATE

# Examples:
python .claude/skills/ben-graham/scripts/analyze.py AAPL 2026-02-19
python .claude/skills/ben-graham/scripts/analyze.py MSFT 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `score`: numeric Graham score
- `reasoning`: breakdown per criterion
- `graham_number`: calculated Graham Number (sqrt(22.5 × EPS × BVPS))
