#!/usr/bin/env python3
"""Generate a price chart with EMA overlays and volume subplot.

Supports both line charts and candlestick charts with optional Bollinger Bands.
"""
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
        print("Usage: plot_price.py TICKER START_DATE END_DATE [OUTPUT_DIR] [--candlestick] [--bbands]", file=sys.stderr)
        print("Example: plot_price.py NVDA 2025-02-19 2026-02-19", file=sys.stderr)
        print("Example: plot_price.py VCB 2025-02-19 2026-02-19 charts --candlestick --bbands", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    start_date = sys.argv[2]
    end_date = sys.argv[3]

    # Parse optional arguments
    output_dir = "reports/charts"
    use_candlestick = False
    use_bbands = False

    for i in range(4, len(sys.argv)):
        arg = sys.argv[i]
        if arg == '--candlestick':
            use_candlestick = True
        elif arg == '--bbands':
            use_bbands = True
        elif not arg.startswith('--'):
            output_dir = arg

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
    opens = [p.open for p in prices] if hasattr(prices[0], 'open') else closes
    highs = [p.high for p in prices] if hasattr(prices[0], 'high') else closes
    lows = [p.low for p in prices] if hasattr(prices[0], 'low') else closes
    closes = [p.close for p in prices]
    volumes = [p.volume for p in prices]

    ema8 = calculate_ema(closes, 8)
    ema21 = calculate_ema(closes, 21)
    ema55 = calculate_ema(closes, 55)

    # Calculate Bollinger Bands if requested
    bb_upper, bb_middle, bb_lower = None, None, None
    if use_bbands:
        bb_middle = calculate_ema(closes, 20)  # Use SMA approximation
        if len(closes) >= 20:
            bb_std = []
            for i in range(len(closes)):
                if i < 19:
                    bb_std.append(None)
                else:
                    window = closes[i-19:i+1]
                    mean = sum(window) / 20
                    variance = sum((x - mean) ** 2 for x in window) / 20
                    bb_std.append(variance ** 0.5)

            bb_upper = [bb_middle[i] + 2 * bb_std[i] if bb_middle[i] and bb_std[i] else None
                       for i in range(len(closes))]
            bb_lower = [bb_middle[i] - 2 * bb_std[i] if bb_middle[i] and bb_std[i] else None
                       for i in range(len(closes))]

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.05,
        row_heights=[0.75, 0.25],
        subplot_titles=(f"{ticker} Price (USD)", "Volume"),
    )

    # Add price trace (candlestick or line)
    if use_candlestick:
        fig.add_trace(go.Candlestick(
            x=dates,
            open=opens,
            high=highs,
            low=lows,
            close=closes,
            name="Price",
            increasing_line_color='#26a69a',
            decreasing_line_color='#ef5350'
        ), row=1, col=1)
    else:
        fig.add_trace(go.Scatter(
            x=dates, y=closes,
            name="Close",
            line=dict(color="#00d4ff", width=1.5),
        ), row=1, col=1)

    # Add Bollinger Bands if requested
    if use_bbands and bb_upper and bb_lower:
        valid_dates_bb = [d for d, v in zip(dates, bb_upper) if v is not None]
        valid_upper = [v for v in bb_upper if v is not None]
        valid_lower = [v for v in bb_lower if v is not None]

        fig.add_trace(go.Scatter(
            x=valid_dates_bb, y=valid_upper,
            name="BB Upper",
            line=dict(color="gray", width=1, dash="dash"),
            showlegend=False
        ), row=1, col=1)

        fig.add_trace(go.Scatter(
            x=valid_dates_bb, y=valid_lower,
            name="BB Lower",
            line=dict(color="gray", width=1, dash="dash"),
            fill='tonexty',
            fillcolor='rgba(128, 128, 128, 0.1)',
            showlegend=False
        ), row=1, col=1)

    # Add EMAs
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

    # Color volume bars based on price change
    volume_colors = []
    for i in range(len(closes)):
        if i == 0:
            volume_colors.append('#4a4a8a')
        else:
            volume_colors.append('#26a69a' if closes[i] >= closes[i-1] else '#ef5350')

    fig.add_trace(go.Bar(
        x=dates, y=volumes,
        name="Volume",
        marker_color=volume_colors,
        opacity=0.7,
    ), row=2, col=1)

    chart_type = "Candlestick" if use_candlestick else "Price"
    title_text = f"{ticker} — {chart_type} & EMA Overlays"
    if use_bbands:
        title_text += " with Bollinger Bands"
    title_text += f" ({start_date} to {end_date})"

    fig.update_layout(
        template="plotly_dark",
        title=dict(text=title_text, font=dict(size=16)),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        height=600,
        width=1000,
        margin=dict(l=60, r=40, t=80, b=40),
        showlegend=True,
        xaxis_rangeslider_visible=False
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
