# News Sentiment Analyst Skill

## Purpose

Analyzes recent news headlines for a stock to determine market sentiment using keyword scoring.

## Methodology

- Fetches recent news articles via the Financial Datasets API
- Scores each headline using POSITIVE_WORDS and NEGATIVE_WORDS keyword lists
- Calculates positive %, negative %, and net sentiment score
- Generates bullish/bearish/neutral signal with confidence

## Positive Keywords (sample)

upgrade, beat, record, growth, bullish, breakout, expansion, profit, innovation, acquisition, dividend, buyback, strong, exceed, outperform...

## Negative Keywords (sample)

downgrade, miss, decline, bearish, breakdown, contraction, loss, lawsuit, investigation, fraud, recall, downgrade, layoffs, guidance cut, miss...

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/news-sentiment/scripts/analyze.py TICKER END_DATE NUM_ARTICLES

# Examples:
python .claude/skills/news-sentiment/scripts/analyze.py AAPL 2026-02-19 10
python .claude/skills/news-sentiment/scripts/analyze.py NVDA 2026-02-19 20
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `positive_pct`: percentage of positive headlines
- `negative_pct`: percentage of negative headlines
- `article_count`: number of articles analyzed
- `top_headlines`: list of most recent article titles
- `reasoning`: summary of sentiment drivers
