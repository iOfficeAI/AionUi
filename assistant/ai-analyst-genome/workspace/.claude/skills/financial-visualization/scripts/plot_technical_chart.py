#!/usr/bin/env python3
"""Generate comprehensive technical analysis chart with multi-panel layout."""
from __future__ import annotations

import sys
import json
import os
from pathlib import Path

sys.path.insert(0, '.')

try:
    import pandas as pd
    import pandas_ta as ta
except ImportError as e:
    print(json.dumps({"error": f"Required libraries not installed: {e}. Run: pip install pandas pandas-ta"}))
    sys.exit(1)

try:
    from vnstock_lib import fetch_quote
except ImportError:
    vnstock_lib = None


def plot_technical_chart(symbol: str, start_date: str, end_date: str, signals_path: str = None, output_path: str = None):
    """
    Generate comprehensive technical analysis chart.

    Args:
        symbol: Stock symbol (e.g., 'VCB')
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        signals_path: Path to signals JSON from analyze.py (optional)
        output_path: Where to save PNG (default: charts/{symbol}_technical_{date}.png)
    """
    try:
        import plotly.graph_objects as go
        from plotly.subplots import make_subplots
    except ImportError:
        print(json.dumps({"error": "plotly not installed. Run: pip install plotly kaleido"}))
        sys.exit(1)

    # Fetch data
    if vnstock_lib is None:
        print(json.dumps({"error": "vnstock_lib not available. Install vnstock library."}))
        sys.exit(1)

    try:
        df = fetch_quote(symbol, start=start_date, end=end_date)
    except Exception as e:
        print(json.dumps({"error": f"Failed to fetch data: {e}", "symbol": symbol}))
        sys.exit(1)

    if df is None or len(df) < 20:
        print(json.dumps({"error": "Insufficient data", "symbol": symbol}))
        sys.exit(1)

    # Calculate indicators
    df['ema_8'] = df.ta.ema(length=8)
    df['ema_21'] = df.ta.ema(length=21)
    df['ema_55'] = df.ta.ema(length=55)

    macd = df.ta.macd(fast=12, slow=26, signal=9)
    if macd is not None and not macd.empty:
        df['macd'] = macd['MACD_12_26_9']
        df['macd_signal'] = macd['MACDs_12_26_9']
        df['macd_hist'] = macd['MACDh_12_26_9']

    df['rsi'] = df.ta.rsi(length=14)
    df['obv'] = df.ta.obv()

    bbands = df.ta.bbands(length=20, std=2)
    if bbands is not None and not bbands.empty:
        df['bb_upper'] = bbands['BBU_20_2.0']
        df['bb_middle'] = bbands['BBM_20_2.0']
        df['bb_lower'] = bbands['BBL_20_2.0']

    # Load signals if provided
    signals = None
    if signals_path and os.path.exists(signals_path):
        try:
            with open(signals_path) as f:
                signals = json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load signals file: {e}", file=sys.stderr)

    # Create multi-panel chart
    fig = make_subplots(
        rows=4, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.03,
        subplot_titles=(
            f'{symbol} Price & Indicators',
            'MACD',
            'RSI',
            'Volume & OBV'
        ),
        row_heights=[0.5, 0.15, 0.15, 0.2]
    )

    # Panel 1: Candlestick + EMAs + Bollinger Bands
    fig.add_trace(go.Candlestick(
        x=df.index,
        open=df['open'],
        high=df['high'],
        low=df['low'],
        close=df['close'],
        name='Price',
        increasing_line_color='#26a69a',
        decreasing_line_color='#ef5350'
    ), row=1, col=1)

    fig.add_trace(go.Scatter(
        x=df.index,
        y=df['ema_8'],
        name='EMA 8',
        line=dict(color='cyan', width=1)
    ), row=1, col=1)

    fig.add_trace(go.Scatter(
        x=df.index,
        y=df['ema_21'],
        name='EMA 21',
        line=dict(color='orange', width=1)
    ), row=1, col=1)

    fig.add_trace(go.Scatter(
        x=df.index,
        y=df['ema_55'],
        name='EMA 55',
        line=dict(color='purple', width=1)
    ), row=1, col=1)

    if 'bb_upper' in df.columns:
        fig.add_trace(go.Scatter(
            x=df.index,
            y=df['bb_upper'],
            name='BB Upper',
            line=dict(color='gray', width=1, dash='dash'),
            showlegend=False
        ), row=1, col=1)

        fig.add_trace(go.Scatter(
            x=df.index,
            y=df['bb_lower'],
            name='BB Lower',
            line=dict(color='gray', width=1, dash='dash'),
            fill='tonexty',
            fillcolor='rgba(128, 128, 128, 0.1)',
            showlegend=False
        ), row=1, col=1)

    # Add support/resistance lines from signals
    if signals and 'levels' in signals:
        for support in signals['levels'].get('support', []):
            fig.add_hline(
                y=support,
                line_dash="dot",
                line_color="green",
                annotation_text=f"Support {support:,.0f}",
                annotation_position="right",
                row=1,
                col=1
            )
        for resistance in signals['levels'].get('resistance', []):
            fig.add_hline(
                y=resistance,
                line_dash="dot",
                line_color="red",
                annotation_text=f"Resistance {resistance:,.0f}",
                annotation_position="right",
                row=1,
                col=1
            )

    # Panel 2: MACD
    if 'macd' in df.columns:
        fig.add_trace(go.Scatter(
            x=df.index,
            y=df['macd'],
            name='MACD',
            line=dict(color='blue')
        ), row=2, col=1)

        fig.add_trace(go.Scatter(
            x=df.index,
            y=df['macd_signal'],
            name='Signal',
            line=dict(color='red')
        ), row=2, col=1)

        # Color histogram bars based on value
        colors = ['#26a69a' if val >= 0 else '#ef5350' for val in df['macd_hist']]
        fig.add_trace(go.Bar(
            x=df.index,
            y=df['macd_hist'],
            name='Histogram',
            marker_color=colors,
            showlegend=False
        ), row=2, col=1)

    # Panel 3: RSI
    if 'rsi' in df.columns:
        fig.add_trace(go.Scatter(
            x=df.index,
            y=df['rsi'],
            name='RSI',
            line=dict(color='purple')
        ), row=3, col=1)

        fig.add_hline(
            y=70,
            line_dash="dash",
            line_color="red",
            annotation_text="Overbought",
            annotation_position="right",
            row=3,
            col=1
        )

        fig.add_hline(
            y=30,
            line_dash="dash",
            line_color="green",
            annotation_text="Oversold",
            annotation_position="right",
            row=3,
            col=1
        )

    # Panel 4: Volume + OBV
    # Color volume bars based on price change
    volume_colors = []
    for i in range(len(df)):
        if i == 0:
            volume_colors.append('lightgray')
        else:
            volume_colors.append('#26a69a' if df['close'].iloc[i] >= df['close'].iloc[i-1] else '#ef5350')

    fig.add_trace(go.Bar(
        x=df.index,
        y=df['volume'],
        name='Volume',
        marker_color=volume_colors,
        opacity=0.5,
        showlegend=False
    ), row=4, col=1)

    # Normalize OBV for second y-axis
    if 'obv' in df.columns and df['obv'].max() > 0:
        obv_normalized = df['obv'] / df['obv'].max() * df['volume'].max()
        fig.add_trace(go.Scatter(
            x=df.index,
            y=obv_normalized,
            name='OBV (normalized)',
            line=dict(color='orange', width=2),
            yaxis='y2'
        ), row=4, col=1)

    # Update layout
    fig.update_layout(
        template='plotly_dark',
        title=dict(
            text=f'{symbol} Technical Analysis ({start_date} to {end_date})',
            font=dict(size=18)
        ),
        height=1200,
        showlegend=True,
        xaxis_rangeslider_visible=False,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    # Update y-axes labels
    fig.update_yaxes(title_text="Price", row=1, col=1)
    fig.update_yaxes(title_text="MACD", row=2, col=1)
    fig.update_yaxes(title_text="RSI", row=3, col=1, range=[0, 100])
    fig.update_yaxes(title_text="Volume", row=4, col=1)

    # Save chart
    if output_path is None:
        output_dir = "charts"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{symbol}_technical_{end_date}.png")
    else:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    try:
        fig.write_image(output_path, width=1400, height=1200, scale=2)
    except Exception as e:
        print(json.dumps({"error": f"Failed to save image (is kaleido installed?): {e}"}))
        sys.exit(1)

    result = {
        "chart_path": output_path,
        "symbol": symbol,
        "date_range": f"{start_date} to {end_date}",
        "data_points": len(df)
    }

    # Add signal summary if available
    if signals:
        result["signal"] = signals.get("signal", "unknown")
        result["confidence"] = signals.get("confidence", 0)

    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python plot_technical_chart.py SYMBOL START_DATE END_DATE [SIGNALS_PATH] [OUTPUT_PATH]", file=sys.stderr)
        print("Example: python plot_technical_chart.py VCB 2025-02-20 2026-02-20", file=sys.stderr)
        sys.exit(1)

    symbol = sys.argv[1]
    start_date = sys.argv[2]
    end_date = sys.argv[3]
    signals_path = sys.argv[4] if len(sys.argv) > 4 else None
    output_path = sys.argv[5] if len(sys.argv) > 5 else None

    plot_technical_chart(symbol, start_date, end_date, signals_path, output_path)
