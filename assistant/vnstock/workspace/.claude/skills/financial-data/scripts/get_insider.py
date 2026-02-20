#!/usr/bin/env python3
"""Fetch insider trading transactions for a ticker."""
import json
import sys

sys.path.insert(0, '.')

from src.tools.api import get_insider_trades


def main():
    if len(sys.argv) < 3:
        print("Usage: get_insider.py TICKER DATE [NUM_TRADES]", file=sys.stderr)
        print("Example: get_insider.py AAPL 2026-02-19 20", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    end_date = sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 20

    try:
        trades = get_insider_trades(ticker, end_date, limit=limit)
        if not trades:
            print(json.dumps({"error": f"No insider trade data found for {ticker}"}))
            return

        result = {
            "ticker": ticker,
            "end_date": end_date,
            "count": len(trades),
            "trades": trades,
        }
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e), "ticker": ticker}))
        sys.exit(1)


if __name__ == "__main__":
    main()
