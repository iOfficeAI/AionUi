# CANSLIM Skill

## Philosophy

CANSLIM is William O'Neil's growth-momentum framework, introduced in _How to Make Money in Stocks_ (1988). It is the methodological opposite of Graham's value approach: it selects stocks exhibiting strong earnings acceleration and price momentum, with institutional demand as a confirming signal.

Where Graham screens for cheap assets, O'Neil screens for fast earnings, rising volume, and market leadership. The two methods rarely select the same stock at the same time.

CANSLIM is not a buy-and-hold system. O'Neil was explicit: cut losses at 7-8%, take profits at 20-25%, and exit before a 5-week leader turns into a laggard.

---

## The 7 Criteria

| Letter | Factor                           | Threshold                                                            | Rationale                                                                                                                                                                               |
| ------ | -------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C**  | Current quarterly earnings       | EPS growth > 25% YoY (most recent quarter)                           | Acceleration in the most recent quarter is the primary trigger. O'Neil found 75% of winning stocks showed ≥25% EPS growth before their big move.                                        |
| **A**  | Annual earnings growth           | EPS CAGR > 25% over 3–5 years                                        | Confirms the C factor is not a one-quarter anomaly. Sustained annual growth shows the business is structurally accelerating.                                                            |
| **N**  | New: product / high / management | Price within 5% of 52-week high                                      | O'Neil: "Buy when a stock breaks out to new highs from a proper base." Proximity to the 52-week high serves as a proxy for a valid breakout setup.                                      |
| **S**  | Supply and demand (volume)       | Recent volume > 50-day average AND up-volume days > down-volume days | Institutional accumulation manifests as above-average volume on up days. This is the demand side of the equation.                                                                       |
| **L**  | Leader vs. laggard               | 12-month return > 0 (proxy for relative strength)                    | O'Neil's RS Rating sorts stocks by 12-month performance. Leaders outperform 80%+ of the market. This proxy flags stocks with positive 12-month momentum.                                |
| **I**  | Institutional sponsorship        | Institutional ownership > 0% and increasing (or approximated)        | Large funds drive sustained price moves. A stock without institutional support lacks the buying power to sustain a breakout.                                                            |
| **M**  | Market direction                 | Price above 200-day simple moving average                            | O'Neil: "Three of four stocks follow the general market trend." Never fight a confirmed downtrend. The 200-day SMA is used here as the market-direction proxy for the individual stock. |

---

## Scoring & Signals

| Score       | Signal  | Confidence |
| ----------- | ------- | ---------- |
| 6–7 factors | bullish | 75–90%     |
| 4–5 factors | neutral | 50–65%     |
| 0–3 factors | bearish | 60–80%     |

---

## Usage

```bash
# Run from workspace root
python .claude/skills/canslim/scripts/analyze.py TICKER END_DATE

# Examples
python .claude/skills/canslim/scripts/analyze.py NVDA 2026-02-19
python .claude/skills/canslim/scripts/analyze.py AAPL 2026-02-19
python .claude/skills/canslim/scripts/analyze.py MSFT 2026-02-19
```

## Output Format

```json
{
  "ticker": "NVDA",
  "signal": "bullish|neutral|bearish",
  "confidence": 80,
  "score": 6,
  "max_score": 7,
  "factors": {
    "C": {
      "score": 1,
      "pass": true,
      "actual": "42% EPS growth YoY",
      "threshold": ">25% quarterly EPS growth YoY",
      "details": "Most recent quarter EPS up 42% year-over-year"
    },
    "A": { "score": 1, "pass": true, "actual": "...", "threshold": "...", "details": "..." },
    "N": { "score": 1, "pass": true, "actual": "...", "threshold": "...", "details": "..." },
    "S": { "score": 1, "pass": true, "actual": "...", "threshold": "...", "details": "..." },
    "L": { "score": 1, "pass": true, "actual": "...", "threshold": "...", "details": "..." },
    "I": { "score": 0, "pass": false, "actual": "...", "threshold": "...", "details": "..." },
    "M": { "score": 1, "pass": true, "actual": "...", "threshold": "...", "details": "..." }
  },
  "canslim_summary": "6/7 CANSLIM criteria pass. Strong earnings momentum with institutional support."
}
```

## Data Sources

- `get_financial_metrics(ticker, end_date, "annual", 5)` — earnings growth (A, I factors)
- `search_line_items(ticker, ["earnings_per_share"], end_date, "quarterly", 8)` — quarterly EPS (C factor)
- `search_line_items(ticker, ["earnings_per_share"], end_date, "annual", 5)` — annual EPS (A factor)
- `get_prices(ticker, start_date, end_date)` — price/volume history (N, S, L, M factors)

## Limitations

- **C factor**: Uses most recent two comparable quarters (YoY comparison). Quarterly data availability depends on API coverage.
- **I factor**: Institutional ownership percentage from `FinancialMetrics` when available. If `None`, the factor is marked as unverifiable.
- **M factor**: Uses 200-day SMA of the individual stock, not the market index. This is a simplified proxy.
- **S factor**: Volume trend is computed from the price history window available; requires sufficient history for a meaningful average.

---

## Screener Usage

The `/screen-canslim` command uses this skill as its scoring engine.
It discovers candidates via WebSearch, runs this script on each, and applies
a macro gate to rank results by composite score (CANSLIM + macro alignment).

The scoring pipeline:

1. WebSearch discovers 15-25 candidate tickers based on the user's topic and macro-favored sectors
2. This script scores each candidate (run via Bash loop)
3. Tickers with `score >= 4` pass the CANSLIM gate
4. A macro alignment bonus (+0 to +3) is added based on regime fit, sector fit, and political tailwinds
5. Results are ranked by `composite_score = canslim_score + macro_bonus` (max 10)

Usage via command: `/screen-canslim AI semiconductors`
Usage standalone: `python .claude/skills/canslim/scripts/analyze.py TICKER DATE`
