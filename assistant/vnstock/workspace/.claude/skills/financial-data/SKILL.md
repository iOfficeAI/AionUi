# Financial Data Skill

## Purpose

Data fetching layer for the Finance Research Assistant. Provides standalone scripts to query the Financial Datasets API (`api.financialdatasets.ai`) and print results as formatted JSON.

## Free Tier Tickers (no API key required)

`AAPL`, `GOOGL`, `MSFT`, `NVDA`, `TSLA`

For all other tickers, set: `export FINANCIAL_DATASETS_API_KEY=your_key_here`

## Scripts

| Script                 | Arguments                    | Data Returned                                                |
| ---------------------- | ---------------------------- | ------------------------------------------------------------ |
| `get_metrics.py`       | `TICKER DATE`                | Financial ratios, margins, valuation multiples, growth rates |
| `get_prices.py`        | `TICKER START_DATE END_DATE` | OHLCV daily price history                                    |
| `get_news.py`          | `TICKER DATE [N]`            | Recent news articles with source and date                    |
| `get_insider.py`       | `TICKER DATE [N]`            | Insider buy/sell transactions                                |
| `get_market_cap.py`    | `TICKER DATE`                | Current market capitalization                                |
| `search_line_items.py` | `TICKER LINE_ITEMS DATE [N]` | Specific financial statement line items                      |

## Usage

All scripts run from the workspace root:

```bash
# Financial metrics (ratios, margins, valuation)
python .claude/skills/financial-data/scripts/get_metrics.py AAPL 2026-02-19

# Price history (1 year)
python .claude/skills/financial-data/scripts/get_prices.py AAPL 2025-02-19 2026-02-19

# Recent news (10 articles)
python .claude/skills/financial-data/scripts/get_news.py AAPL 2026-02-19 10

# Insider transactions (20 most recent)
python .claude/skills/financial-data/scripts/get_insider.py AAPL 2026-02-19 20

# Market cap
python .claude/skills/financial-data/scripts/get_market_cap.py AAPL 2026-02-19

# Specific line items (comma-separated)
python .claude/skills/financial-data/scripts/search_line_items.py AAPL "revenue,net_income,free_cash_flow" 2026-02-19 4
```

## Dependencies

```bash
pip install requests pandas pydantic numpy
```
