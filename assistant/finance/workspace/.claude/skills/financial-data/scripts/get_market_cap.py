#!/usr/bin/env python3
"""Fetch current market capitalization for a ticker."""
import json
import sys

sys.path.insert(0, '.')

from src.tools.api import get_market_cap


def main():
    if len(sys.argv) < 3:
        print("Usage: get_market_cap.py TICKER DATE", file=sys.stderr)
        print("Example: get_market_cap.py AAPL 2026-02-19", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    end_date = sys.argv[2]

    try:
        market_cap = get_market_cap(ticker, end_date)
        result = {
            "ticker": ticker,
            "end_date": end_date,
            "market_cap": market_cap,
            "market_cap_billions": round(market_cap / 1e9, 2) if market_cap else None,
        }
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e), "ticker": ticker}))
        sys.exit(1)


if __name__ == "__main__":
    main()
