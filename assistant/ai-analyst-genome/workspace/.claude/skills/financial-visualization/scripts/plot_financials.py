#!/usr/bin/env python3
"""Generate a multi-period financial metrics bar chart."""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, '.')


def main():
    if len(sys.argv) < 3:
        print("Usage: plot_financials.py TICKER DATE [PERIODS]", file=sys.stderr)
        print("Example: plot_financials.py NVDA 2026-02-19 8", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    date = sys.argv[2]
    periods = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    output_dir = sys.argv[4] if len(sys.argv) > 4 else "reports/charts"

    try:
        import plotly.graph_objects as go
        from plotly.subplots import make_subplots
    except ImportError:
        print(json.dumps({"error": "plotly not installed. Run: pip install plotly kaleido", "chart_path": None}))
        sys.exit(1)

    try:
        from src.tools.api import get_financial_metrics
        metrics = get_financial_metrics(ticker, date, period="annual", limit=periods)
    except Exception as e:
        print(json.dumps({"error": f"Failed to fetch metrics: {e}", "chart_path": None}))
        sys.exit(1)

    if not metrics:
        print(json.dumps({"error": f"No metrics data for {ticker}", "chart_path": None}))
        sys.exit(1)

    # Reverse to chronological order (oldest first)
    metrics = list(reversed(metrics))

    period_labels = []
    revenue_growths = []
    net_margins = []
    operating_margins = []
    eps_values = []

    for m in metrics:
        md = m.model_dump() if hasattr(m, 'model_dump') else vars(m)
        label = str(md.get('report_period', md.get('period', 'N/A')))
        period_labels.append(label[:7])  # Trim to YYYY-MM
        revenue_growths.append((md.get('revenue_growth') or 0) * 100)
        net_margins.append((md.get('net_margin') or 0) * 100)
        operating_margins.append((md.get('operating_margin') or 0) * 100)
        eps_values.append(md.get('earnings_per_share') or 0)

    fig = make_subplots(specs=[[{"secondary_y": True}]])

    fig.add_trace(go.Bar(
        name="Revenue Growth %",
        x=period_labels,
        y=revenue_growths,
        marker_color="#00d4ff",
        opacity=0.85,
    ), secondary_y=False)

    fig.add_trace(go.Bar(
        name="Net Margin %",
        x=period_labels,
        y=net_margins,
        marker_color="#06d6a0",
        opacity=0.85,
    ), secondary_y=False)

    fig.add_trace(go.Bar(
        name="Operating Margin %",
        x=period_labels,
        y=operating_margins,
        marker_color="#ffd166",
        opacity=0.85,
    ), secondary_y=False)

    fig.add_trace(go.Scatter(
        name="EPS ($)",
        x=period_labels,
        y=eps_values,
        mode="lines+markers",
        line=dict(color="#ff6b35", width=2),
        marker=dict(size=7),
    ), secondary_y=True)

    fig.update_layout(
        template="plotly_dark",
        title=dict(text=f"{ticker} — Financial Performance ({periods} Periods)", font=dict(size=16)),
        barmode="group",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        height=500,
        width=1000,
        margin=dict(l=60, r=60, t=80, b=60),
    )
    fig.update_yaxes(title_text="Percentage (%)", secondary_y=False)
    fig.update_yaxes(title_text="EPS ($)", secondary_y=True)
    fig.update_xaxes(title_text="Period")

    os.makedirs(output_dir, exist_ok=True)
    chart_path = os.path.join(output_dir, f"{ticker}_financials_{date}.png")

    try:
        fig.write_image(chart_path, scale=2)
    except Exception as e:
        print(json.dumps({"error": f"Failed to save image (is kaleido installed?): {e}", "chart_path": None}))
        sys.exit(1)

    print(json.dumps({
        "chart_path": chart_path,
        "ticker": ticker,
        "periods": len(metrics),
        "metrics": ["revenue_growth", "net_margin", "operating_margin", "earnings_per_share"],
    }))


if __name__ == "__main__":
    main()
