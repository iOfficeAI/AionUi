#!/usr/bin/env python3
"""Generate a multi-analyst signal radar chart."""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, '.')

# Canonical analyst order for the radar chart
ANALYSTS = [
    "fundamentals",
    "technicals",
    "valuation",
    "warren-buffett",
    "ben-graham",
    "cathie-wood",
    "druckenmiller",
    "news-sentiment",
    "growth-analyst",
]

ANALYST_LABELS = {
    "fundamentals": "Fundamentals",
    "technicals": "Technicals",
    "valuation": "Valuation",
    "warren-buffett": "Buffett",
    "ben-graham": "Graham",
    "cathie-wood": "C. Wood",
    "druckenmiller": "Druckenmiller",
    "news-sentiment": "News",
    "growth-analyst": "Growth",
}


def signal_to_score(signal_data: dict) -> float:
    """Convert analyst signal dict to a 0-10 radar score."""
    signal = str(signal_data.get("signal", "neutral")).lower()
    confidence = float(signal_data.get("confidence", 0.5))
    confidence = max(0.0, min(1.0, confidence))
    score = confidence * 10
    if "bear" in signal:
        score = max(0.0, 10.0 - score)
    elif "neutral" in signal:
        score = 5.0
    return round(score, 2)


def main():
    if len(sys.argv) < 3:
        print("Usage: plot_radar.py TICKER SIGNALS_JSON [DATE] [OUTPUT_DIR]", file=sys.stderr)
        print('Example: plot_radar.py NVDA \'{"fundamentals": {"signal": "bullish", "confidence": 0.8}}\' 2026-02-19', file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper()
    signals_json = sys.argv[2]
    date = sys.argv[3] if len(sys.argv) > 3 else "unknown"
    output_dir = sys.argv[4] if len(sys.argv) > 4 else "reports/charts"

    try:
        import plotly.graph_objects as go
    except ImportError:
        print(json.dumps({"error": "plotly not installed. Run: pip install plotly kaleido", "chart_path": None}))
        sys.exit(1)

    try:
        signals = json.loads(signals_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid SIGNALS_JSON: {e}", "chart_path": None}))
        sys.exit(1)

    scores = []
    present_analysts = []
    for analyst in ANALYSTS:
        data = signals.get(analyst)
        if data is None:
            # Try alternate keys (e.g. "warren_buffett" vs "warren-buffett")
            alt = analyst.replace("-", "_")
            data = signals.get(alt)
        if data is not None:
            scores.append(signal_to_score(data))
            present_analysts.append(ANALYST_LABELS.get(analyst, analyst))

    if not scores:
        print(json.dumps({"error": "No recognizable analyst signals in SIGNALS_JSON", "chart_path": None}))
        sys.exit(1)

    # Close the radar polygon
    scores_closed = scores + [scores[0]]
    labels_closed = present_analysts + [present_analysts[0]]

    fig = go.Figure()

    fig.add_trace(go.Scatterpolar(
        r=scores_closed,
        theta=labels_closed,
        fill="toself",
        fillcolor="rgba(0, 212, 255, 0.2)",
        line=dict(color="#00d4ff", width=2),
        name="Analyst Score",
        mode="lines+markers",
        marker=dict(size=6, color="#00d4ff"),
    ))

    # Add a neutral reference circle at 5.0
    neutral_scores = [5.0] * (len(present_analysts) + 1)
    fig.add_trace(go.Scatterpolar(
        r=neutral_scores,
        theta=labels_closed,
        line=dict(color="#888888", width=1, dash="dot"),
        name="Neutral (5.0)",
        mode="lines",
    ))

    fig.update_layout(
        template="plotly_dark",
        title=dict(text=f"{ticker} — Multi-Analyst Signal Consensus", font=dict(size=16)),
        polar=dict(
            radialaxis=dict(
                visible=True,
                range=[0, 10],
                tickvals=[0, 2.5, 5, 7.5, 10],
                ticktext=["0\n(Bearish)", "2.5", "5\n(Neutral)", "7.5", "10\n(Bullish)"],
                gridcolor="#333333",
                linecolor="#555555",
            ),
            angularaxis=dict(
                gridcolor="#333333",
                linecolor="#555555",
            ),
            bgcolor="#1a1a2e",
        ),
        legend=dict(orientation="h", yanchor="bottom", y=-0.15, xanchor="center", x=0.5),
        height=550,
        width=700,
        margin=dict(l=80, r=80, t=80, b=80),
    )

    os.makedirs(output_dir, exist_ok=True)
    chart_path = os.path.join(output_dir, f"{ticker}_radar_{date}.png")

    try:
        fig.write_image(chart_path, scale=2)
    except Exception as e:
        print(json.dumps({"error": f"Failed to save image (is kaleido installed?): {e}", "chart_path": None}))
        sys.exit(1)

    print(json.dumps({
        "chart_path": chart_path,
        "ticker": ticker,
        "analysts": present_analysts,
        "scores": scores,
    }))


if __name__ == "__main__":
    main()
