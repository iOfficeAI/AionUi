#!/usr/bin/env python3
"""Generate a price chart with EMA overlays and volume subplot."""
from __future__ import annotations

import json
import os
import sys
from typing import Optional

sys.path.insert(0, '.')


def calculate_ema(prices: list, period: int) -> list:
    """Calculate exponential moving average."""
    ema = []
    if not prices:
        return ema
    multiplier = 2 / (period + 1)
    for i, price in enumerate(prices):
        if i < period - 1:
            ema.append(None)
        elif i == period - 1:
            ema.append(sum(prices[:period]) / period)
        else:
            ema.append(price * multiplier + ema[-1] * (1 - multiplier))
    return ema


def main():
    if len(sys.argv) < 4:
        print("Usage: plot_price.py TICKER START_DATE END_DATE [OUTPUT_DIR]", file=sys.stderr)
        print("Example: plot_price.py NVDA 2025-02-19 2026-02-19", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    start_date = sys.argv[2]
    end_date = sys.argv[3]
    output_dir = sys.argv[4] if len(sys.argv) > 4 else "reports/charts"

    try:
        import plotly.graph_objects as go
        from plotly.subplots import make_subplots
    except ImportError:
        print(json.dumps({"error": "plotly not installed. Run: pip install plotly kaleido", "chart_path": None}))
        sys.exit(1)

    try:
        from src.tools.api import get_prices
        prices = get_prices(ticker, start_date, end_date)
    except Exception as e:
        print(json.dumps({"error": f"Failed to fetch prices: {e}", "chart_path": None}))
        sys.exit(1)

    if not prices:
        print(json.dumps({"error": f"No price data for {ticker}", "chart_path": None}))
        sys.exit(1)

    dates = [p.time for p in prices]
    closes = [p.close for p in prices]
    volumes = [p.volume for p in prices]

    ema8 = calculate_ema(closes, 8)
    ema21 = calculate_ema(closes, 21)
    ema55 = calculate_ema(closes, 55)

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.05,
        row_heights=[0.75, 0.25],
        subplot_titles=(f"{ticker} Price (USD)", "Volume"),
    )

    fig.add_trace(go.Scatter(
        x=dates, y=closes,
        name="Close",
        line=dict(color="#00d4ff", width=1.5),
    ), row=1, col=1)

    ema_configs = [
        (ema8, "EMA-8", "#ff6b35"),
        (ema21, "EMA-21", "#ffd166"),
        (ema55, "EMA-55", "#06d6a0"),
    ]
    for ema_vals, name, color in ema_configs:
        valid_dates = [d for d, v in zip(dates, ema_vals) if v is not None]
        valid_vals = [v for v in ema_vals if v is not None]
        fig.add_trace(go.Scatter(
            x=valid_dates, y=valid_vals,
            name=name,
            line=dict(color=color, width=1.2, dash="dot"),
        ), row=1, col=1)

    fig.add_trace(go.Bar(
        x=dates, y=volumes,
        name="Volume",
        marker_color="#4a4a8a",
        opacity=0.7,
    ), row=2, col=1)

    fig.update_layout(
        template="plotly_dark",
        title=dict(text=f"{ticker} — Price & EMA Overlays ({start_date} to {end_date})", font=dict(size=16)),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        height=600,
        width=1000,
        margin=dict(l=60, r=40, t=80, b=40),
        showlegend=True,
    )
    fig.update_yaxes(title_text="Price (USD)", row=1, col=1)
    fig.update_yaxes(title_text="Volume", row=2, col=1)

    os.makedirs(output_dir, exist_ok=True)
    chart_path = os.path.join(output_dir, f"{ticker}_price_{end_date}.png")

    try:
        fig.write_image(chart_path, scale=2)
    except Exception as e:
        print(json.dumps({"error": f"Failed to save image (is kaleido installed?): {e}", "chart_path": None}))
        sys.exit(1)

    print(json.dumps({
        "chart_path": chart_path,
        "ticker": ticker,
        "start_date": start_date,
        "end_date": end_date,
        "data_points": len(prices),
    }))


if __name__ == "__main__":
    main()
