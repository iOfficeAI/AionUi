#!/usr/bin/env python3
"""Fetch recent company news for a ticker."""
import json
import sys

sys.path.insert(0, '.')

from src.tools.api import get_company_news


def main():
    if len(sys.argv) < 3:
        print("Usage: get_news.py TICKER DATE [NUM_ARTICLES]", file=sys.stderr)
        print("Example: get_news.py AAPL 2026-02-19 10", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    end_date = sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10

    try:
        news = get_company_news(ticker, end_date, limit=limit)
        if not news:
            print(json.dumps({"error": f"No news found for {ticker}"}))
            return

        result = {
            "ticker": ticker,
            "end_date": end_date,
            "count": len(news),
            "articles": news,
        }
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e), "ticker": ticker}))
        sys.exit(1)


if __name__ == "__main__":
    main()
