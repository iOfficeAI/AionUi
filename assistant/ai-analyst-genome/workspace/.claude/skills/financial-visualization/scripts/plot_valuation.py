#!/usr/bin/env python3
"""Generate a valuation multiples chart comparing current vs 3-year trailing averages."""
from __future__ import annotations

import json
import os
import sys
from typing import Optional

sys.path.insert(0, '.')


def safe_avg(values: list) -> Optional[float]:
    vals = [v for v in values if v is not None and v > 0]
    return sum(vals) / len(vals) if vals else None


def main():
    if len(sys.argv) < 3:
        print("Usage: plot_valuation.py TICKER DATE", file=sys.stderr)
        print("Example: plot_valuation.py NVDA 2026-02-19", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    date = sys.argv[2]
    output_dir = sys.argv[3] if len(sys.argv) > 3 else "reports/charts"

    try:
        import plotly.graph_objects as go
    except ImportError:
        print(json.dumps({"error": "plotly not installed. Run: pip install plotly kaleido", "chart_path": None}))
        sys.exit(1)

    try:
        from src.tools.api import get_financial_metrics
        # Fetch 12 periods (TTM) for trailing averages
        metrics = get_financial_metrics(ticker, date, period="ttm", limit=12)
    except Exception as e:
        print(json.dumps({"error": f"Failed to fetch metrics: {e}", "chart_path": None}))
        sys.exit(1)

    if not metrics:
        print(json.dumps({"error": f"No metrics data for {ticker}", "chart_path": None}))
        sys.exit(1)

    all_pe = []
    all_pb = []
    all_ps = []
    for m in metrics:
        md = m.model_dump() if hasattr(m, 'model_dump') else vars(m)
        all_pe.append(md.get('price_to_earnings_ratio'))
        all_pb.append(md.get('price_to_book_ratio'))
        all_ps.append(md.get('price_to_sales_ratio'))

    # Current = most recent entry
    current_md = metrics[0].model_dump() if hasattr(metrics[0], 'model_dump') else vars(metrics[0])
    current_pe = current_md.get('price_to_earnings_ratio')
    current_pb = current_md.get('price_to_book_ratio')
    current_ps = current_md.get('price_to_sales_ratio')

    avg_pe = safe_avg(all_pe)
    avg_pb = safe_avg(all_pb)
    avg_ps = safe_avg(all_ps)

    multiples = [
        ("P/E Ratio", current_pe, avg_pe),
        ("P/B Ratio", current_pb, avg_pb),
        ("P/S Ratio", current_ps, avg_ps),
    ]

    labels = [m[0] for m in multiples]
    current_vals = [m[1] or 0 for m in multiples]
    avg_vals = [m[2] or 0 for m in multiples]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        name="Current",
        y=labels,
        x=current_vals,
        orientation="h",
        marker_color="#00d4ff",
        opacity=0.9,
    ))

    fig.add_trace(go.Bar(
        name="3-Year Trailing Avg",
        y=labels,
        x=avg_vals,
        orientation="h",
        marker_color="#4a4a8a",
        opacity=0.9,
    ))

    fig.update_layout(
        template="plotly_dark",
        title=dict(text=f"{ticker} — Valuation Multiples vs Trailing Averages", font=dict(size=16)),
        barmode="group",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        height=400,
        width=800,
        margin=dict(l=100, r=60, t=80, b=60),
        xaxis_title="Multiple (x)",
    )

    os.makedirs(output_dir, exist_ok=True)
    chart_path = os.path.join(output_dir, f"{ticker}_valuation_{date}.png")

    try:
        fig.write_image(chart_path, scale=2)
    except Exception as e:
        print(json.dumps({"error": f"Failed to save image (is kaleido installed?): {e}", "chart_path": None}))
        sys.exit(1)

    print(json.dumps({
        "chart_path": chart_path,
        "ticker": ticker,
        "multiples": {
            "pe": {"current": current_pe, "avg": avg_pe},
            "pb": {"current": current_pb, "avg": avg_pb},
            "ps": {"current": current_ps, "avg": avg_ps},
        },
    }))


if __name__ == "__main__":
    main()
