#!/usr/bin/env python3
"""Fetch OHLCV price history for a ticker."""
import json
import sys

sys.path.insert(0, '.')

from src.tools.api import get_prices


def main():
    if len(sys.argv) < 4:
        print("Usage: get_prices.py TICKER START_DATE END_DATE", file=sys.stderr)
        print("Example: get_prices.py AAPL 2025-02-19 2026-02-19", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    start_date = sys.argv[2]
    end_date = sys.argv[3]

    try:
        prices = get_prices(ticker, start_date, end_date)
        if not prices:
            print(json.dumps({"error": f"No price data found for {ticker}"}))
            return

        result = {
            "ticker": ticker,
            "start_date": start_date,
            "end_date": end_date,
            "count": len(prices),
            "prices": [p.model_dump() for p in prices],
        }
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e), "ticker": ticker}))
        sys.exit(1)


if __name__ == "__main__":
    main()
