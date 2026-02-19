#!/usr/bin/env python3
"""Search specific financial statement line items for a ticker."""
import json
import sys

sys.path.insert(0, '.')

from src.tools.api import search_line_items


def main():
    if len(sys.argv) < 4:
        print("Usage: search_line_items.py TICKER LINE_ITEMS DATE [NUM_PERIODS]", file=sys.stderr)
        print("Example: search_line_items.py AAPL 'revenue,net_income,free_cash_flow' 2026-02-19 4", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    line_items_str = sys.argv[2]
    end_date = sys.argv[3]
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else 4

    line_items = [item.strip() for item in line_items_str.split(',')]

    try:
        items = search_line_items(ticker, line_items, end_date, period="ttm", limit=limit)
        if not items:
            print(json.dumps({"error": f"No line items found for {ticker}"}))
            return

        result = {
            "ticker": ticker,
            "end_date": end_date,
            "line_items_requested": line_items,
            "count": len(items),
            "results": [item.model_dump() for item in items],
        }
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e), "ticker": ticker}))
        sys.exit(1)


if __name__ == "__main__":
    main()
