#!/usr/bin/env python3
"""Fetch financial metrics for a ticker."""
import json
import sys

sys.path.insert(0, '.')

from src.tools.api import get_financial_metrics


def main():
    if len(sys.argv) < 3:
        print("Usage: get_metrics.py TICKER DATE", file=sys.stderr)
        print("Example: get_metrics.py AAPL 2026-02-19", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    end_date = sys.argv[2]

    try:
        metrics = get_financial_metrics(ticker, end_date, period="ttm", limit=4)
        if not metrics:
            print(json.dumps({"error": f"No metrics found for {ticker}"}))
            return

        result = {
            "ticker": ticker,
            "end_date": end_date,
            "metrics": [m.model_dump() for m in metrics],
        }
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e), "ticker": ticker}))
        sys.exit(1)


if __name__ == "__main__":
    main()
