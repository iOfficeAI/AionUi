# Stanley Druckenmiller Analyst Skill

## Philosophy

Analyzes stocks through Stanley Druckenmiller's macro-driven investing framework:

- **Macro First**: Macro conditions determine the tide — find the sectors and stocks that ride the tide
- **Asymmetric Payoffs**: Risk a little to make a lot — seek bets where the upside is 5-10x the downside
- **Liquidity Conditions**: Fed liquidity (QE/QT), credit availability, and dollar strength drive asset prices
- **Concentrated Positions**: Bet big when conviction is high — don't diversify away alpha
- **Flexibility**: No dogma — shift rapidly when the macro changes, never fall in love with a position
- **Momentum + Earnings**: Stocks move on earnings revisions and rate-of-change, not just levels

## Key Signals

| Signal             | Bullish                         | Bearish                 |
| ------------------ | ------------------------------- | ----------------------- |
| Fed policy         | Easing / dovish pivot           | Tightening / hawkish    |
| Credit spreads     | Tightening                      | Widening                |
| Dollar             | Weakening (for risk assets)     | Strengthening           |
| Earnings revisions | Upward revision cycle           | Downward revision cycle |
| Momentum           | Strong recent relative strength | Breaking down           |
| Liquidity          | Expanding (QE, credit growth)   | Contracting             |

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/stanley-druckenmiller/scripts/analyze.py TICKER END_DATE

# Examples:
python .claude/skills/stanley-druckenmiller/scripts/analyze.py NVDA 2026-02-19
python .claude/skills/stanley-druckenmiller/scripts/analyze.py AAPL 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `macro_alignment`: whether macro conditions favor this stock/sector
- `asymmetry_score`: risk/reward asymmetry assessment
- `reasoning`: breakdown of macro and fundamental drivers
