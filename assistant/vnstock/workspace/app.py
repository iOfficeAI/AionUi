#!/usr/bin/env python3
"""
Finance Dashboard - Interactive analysis viewer built with Dash.

Reads analysis data from the analyses/ directory and displays
interactive Plotly charts and metrics.

Usage:
    python app.py [--port PORT]
"""
from __future__ import annotations

import json
import os
import sys
import glob
from datetime import datetime, timedelta

sys.path.insert(0, ".")

try:
    import dash
    from dash import dcc, html, Input, Output, State, callback
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
except ImportError:
    print("Required: pip install dash plotly", file=sys.stderr)
    sys.exit(1)

from src.tools.api import get_prices, get_financial_metrics, get_company_news
from src.data.models import FinancialMetrics

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ANALYSES_DIR = os.path.join(os.path.dirname(__file__), "analyses")


def discover_analyses() -> list[dict]:
    """Scan analyses/ for completed analysis folders."""
    results = []
    if not os.path.isdir(ANALYSES_DIR):
        return results
    for entry in sorted(os.listdir(ANALYSES_DIR), reverse=True):
        full = os.path.join(ANALYSES_DIR, entry)
        if not os.path.isdir(full) or entry == "samples":
            continue
        report = os.path.join(full, "report.md")
        if os.path.isfile(report):
            results.append({"label": entry, "value": full})
    return results


def load_json(path: str):
    """Load JSON file, return None on failure."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return None


def calculate_ema(prices: list[float], period: int) -> list[float | None]:
    """Exponential moving average."""
    ema: list[float | None] = []
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


# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------

DARK_TEMPLATE = "plotly_dark"
CHART_BG = "rgba(0,0,0,0)"
GRID_COLOR = "rgba(255,255,255,0.06)"


def build_price_chart(ticker: str, start_date: str, end_date: str) -> go.Figure:
    """Price chart with EMA overlays and volume subplot."""
    prices = get_prices(ticker, start_date, end_date)
    if not prices:
        return go.Figure().update_layout(
            title=f"{ticker} - No price data", template=DARK_TEMPLATE
        )

    dates = [p.time for p in prices]
    closes = [p.close for p in prices]
    volumes = [p.volume or 0 for p in prices]

    ema8 = calculate_ema(closes, 8)
    ema21 = calculate_ema(closes, 21)
    ema55 = calculate_ema(closes, 55)

    fig = make_subplots(
        rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.03,
        row_heights=[0.75, 0.25],
    )

    fig.add_trace(go.Scatter(x=dates, y=closes, name="Close", line=dict(color="#8B5CF6", width=2)), row=1, col=1)
    fig.add_trace(go.Scatter(x=dates, y=ema8, name="EMA 8", line=dict(color="#3B82F6", width=1, dash="dot")), row=1, col=1)
    fig.add_trace(go.Scatter(x=dates, y=ema21, name="EMA 21", line=dict(color="#F59E0B", width=1, dash="dot")), row=1, col=1)
    fig.add_trace(go.Scatter(x=dates, y=ema55, name="EMA 55", line=dict(color="#10B981", width=1, dash="dot")), row=1, col=1)
    fig.add_trace(go.Bar(x=dates, y=volumes, name="Volume", marker_color="rgba(139,92,246,0.3)"), row=2, col=1)

    fig.update_layout(
        template=DARK_TEMPLATE,
        title=f"{ticker} Price & Volume",
        paper_bgcolor=CHART_BG, plot_bgcolor=CHART_BG,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(l=50, r=20, t=60, b=30),
        xaxis_rangeslider_visible=False,
        yaxis=dict(gridcolor=GRID_COLOR),
        yaxis2=dict(gridcolor=GRID_COLOR),
        height=500,
    )
    return fig


def build_financials_chart(metrics_list: list[dict]) -> go.Figure:
    """Bar chart with revenue growth, margins, and EPS."""
    if not metrics_list:
        return go.Figure().update_layout(title="No financial data", template=DARK_TEMPLATE)

    periods = [m.get("period", m.get("report_period", "?")) for m in metrics_list]
    rev_growth = [m.get("revenue_growth", 0) or 0 for m in metrics_list]
    net_margin = [m.get("net_margin", 0) or 0 for m in metrics_list]
    op_margin = [m.get("operating_margin", 0) or 0 for m in metrics_list]
    eps = [m.get("earnings_per_share", 0) or 0 for m in metrics_list]

    fig = make_subplots(specs=[[{"secondary_y": True}]])

    fig.add_trace(go.Bar(x=periods, y=[v * 100 for v in rev_growth], name="Rev Growth %", marker_color="#06B6D4"), secondary_y=False)
    fig.add_trace(go.Bar(x=periods, y=[v * 100 for v in net_margin], name="Net Margin %", marker_color="#10B981"), secondary_y=False)
    fig.add_trace(go.Bar(x=periods, y=[v * 100 for v in op_margin], name="Op Margin %", marker_color="#EAB308"), secondary_y=False)
    fig.add_trace(go.Scatter(x=periods, y=eps, name="EPS $", mode="lines+markers", line=dict(color="#F97316", width=2)), secondary_y=True)

    fig.update_layout(
        template=DARK_TEMPLATE, title="Financial Metrics",
        barmode="group", paper_bgcolor=CHART_BG, plot_bgcolor=CHART_BG,
        margin=dict(l=50, r=50, t=60, b=30), height=400,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    )
    fig.update_yaxes(title_text="%", gridcolor=GRID_COLOR, secondary_y=False)
    fig.update_yaxes(title_text="EPS $", gridcolor=GRID_COLOR, secondary_y=True)
    return fig


def build_valuation_chart(metrics: dict) -> go.Figure:
    """Horizontal bar chart of valuation ratios."""
    labels = ["P/E", "P/B", "P/S"]
    values = [
        metrics.get("pe_ratio") or 0,
        metrics.get("price_to_book") or 0,
        metrics.get("price_to_sales") or 0,
    ]

    fig = go.Figure(go.Bar(
        x=values, y=labels, orientation="h",
        marker_color=["#8B5CF6", "#3B82F6", "#06B6D4"],
        text=[f"{v:.1f}" for v in values], textposition="auto",
    ))

    fig.update_layout(
        template=DARK_TEMPLATE, title="Valuation Multiples",
        paper_bgcolor=CHART_BG, plot_bgcolor=CHART_BG,
        margin=dict(l=50, r=20, t=60, b=30), height=300,
        xaxis=dict(gridcolor=GRID_COLOR),
    )
    return fig


def build_metrics_cards(metrics: dict) -> list:
    """Build key metric display cards."""
    items = [
        ("Market Cap", metrics.get("market_cap"), lambda v: f"${v/1e9:.1f}B" if v and v > 1e9 else f"${v/1e6:.0f}M" if v else "N/A"),
        ("P/E Ratio", metrics.get("pe_ratio"), lambda v: f"{v:.1f}" if v else "N/A"),
        ("Revenue Growth", metrics.get("revenue_growth"), lambda v: f"{v*100:.1f}%" if v else "N/A"),
        ("Net Margin", metrics.get("net_margin"), lambda v: f"{v*100:.1f}%" if v else "N/A"),
        ("ROE", metrics.get("return_on_equity"), lambda v: f"{v*100:.1f}%" if v else "N/A"),
        ("EPS", metrics.get("earnings_per_share"), lambda v: f"${v:.2f}" if v else "N/A"),
    ]

    cards = []
    for label, value, fmt in items:
        display = fmt(value) if value is not None else "N/A"
        color = "#10B981" if isinstance(value, (int, float)) and value > 0 else "#EF4444" if isinstance(value, (int, float)) and value < 0 else "#94A3B8"
        cards.append(
            html.Div(
                [
                    html.Div(label, style={"fontSize": "11px", "color": "#94A3B8", "marginBottom": "4px"}),
                    html.Div(display, style={"fontSize": "18px", "fontWeight": "600", "color": color}),
                ],
                style={
                    "background": "rgba(255,255,255,0.04)",
                    "borderRadius": "8px",
                    "padding": "12px 16px",
                    "minWidth": "120px",
                    "flex": "1",
                },
            )
        )
    return cards


# ---------------------------------------------------------------------------
# App Layout
# ---------------------------------------------------------------------------

app = dash.Dash(
    __name__,
    title="Finance Dashboard",
    update_title=None,
    suppress_callback_exceptions=True,
)

app.layout = html.Div(
    [
        # Header
        html.Div(
            [
                html.H1(
                    "Finance Dashboard",
                    style={"margin": "0", "fontSize": "20px", "fontWeight": "700"},
                ),
                html.Div(
                    [
                        dcc.Input(
                            id="ticker-input",
                            type="text",
                            placeholder="Ticker (e.g. NVDA)",
                            value="NVDA",
                            debounce=True,
                            style={
                                "background": "rgba(255,255,255,0.06)",
                                "border": "1px solid rgba(255,255,255,0.12)",
                                "borderRadius": "6px",
                                "padding": "6px 12px",
                                "color": "#E2E8F0",
                                "width": "140px",
                                "fontSize": "14px",
                            },
                        ),
                        html.Button(
                            "Analyze",
                            id="analyze-btn",
                            n_clicks=0,
                            style={
                                "background": "#8B5CF6",
                                "border": "none",
                                "borderRadius": "6px",
                                "padding": "6px 16px",
                                "color": "white",
                                "cursor": "pointer",
                                "fontSize": "14px",
                                "fontWeight": "500",
                            },
                        ),
                    ],
                    style={"display": "flex", "gap": "8px", "alignItems": "center"},
                ),
            ],
            style={
                "display": "flex",
                "justifyContent": "space-between",
                "alignItems": "center",
                "padding": "16px 24px",
                "borderBottom": "1px solid rgba(255,255,255,0.08)",
            },
        ),
        # Loading indicator
        dcc.Loading(
            id="loading",
            type="dot",
            color="#8B5CF6",
            children=[html.Div(id="dashboard-content")],
        ),
        # Store for data
        dcc.Store(id="analysis-data"),
    ],
    style={
        "backgroundColor": "#0F172A",
        "color": "#E2E8F0",
        "minHeight": "100vh",
        "fontFamily": '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
)


@callback(
    Output("analysis-data", "data"),
    Input("analyze-btn", "n_clicks"),
    State("ticker-input", "value"),
    prevent_initial_call=False,
)
def fetch_data(n_clicks, ticker):
    """Fetch financial data for the given ticker."""
    if not ticker:
        return None

    ticker = ticker.strip().upper()
    today = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

    data = {"ticker": ticker, "date": today}

    # Fetch metrics
    try:
        metrics = get_financial_metrics(ticker, today, limit=8)
        data["metrics"] = [m.model_dump() if hasattr(m, "model_dump") else m.__dict__ for m in metrics] if metrics else []
    except Exception:
        data["metrics"] = []

    # Fetch price data range
    data["price_start"] = start_date
    data["price_end"] = today

    # Fetch news
    try:
        news = get_company_news(ticker, today, limit=10)
        data["news"] = [{"title": n.title, "date": n.date} for n in news] if news else []
    except Exception:
        data["news"] = []

    return data


@callback(
    Output("dashboard-content", "children"),
    Input("analysis-data", "data"),
)
def render_dashboard(data):
    """Render the full dashboard from fetched data."""
    if not data:
        return html.Div(
            "Enter a ticker and click Analyze",
            style={"padding": "40px", "textAlign": "center", "color": "#64748B"},
        )

    ticker = data["ticker"]
    metrics_list = data.get("metrics", [])
    latest = metrics_list[0] if metrics_list else {}
    news = data.get("news", [])

    # Build charts
    price_fig = build_price_chart(ticker, data["price_start"], data["price_end"])
    financials_fig = build_financials_chart(metrics_list[:8])
    valuation_fig = build_valuation_chart(latest)

    # Build metrics cards
    metric_cards = build_metrics_cards(latest)

    # Build news list
    news_items = []
    for n in news[:8]:
        news_items.append(
            html.Div(
                [
                    html.Span(n.get("date", ""), style={"color": "#64748B", "fontSize": "11px", "minWidth": "80px"}),
                    html.Span(n.get("title", ""), style={"fontSize": "13px"}),
                ],
                style={"display": "flex", "gap": "12px", "padding": "6px 0", "borderBottom": "1px solid rgba(255,255,255,0.04)"},
            )
        )

    return html.Div(
        [
            # Ticker header
            html.Div(
                [
                    html.H2(ticker, style={"margin": "0", "fontSize": "28px", "fontWeight": "700", "color": "#8B5CF6"}),
                    html.Span(data["date"], style={"color": "#64748B", "fontSize": "13px"}),
                ],
                style={"display": "flex", "alignItems": "baseline", "gap": "12px", "padding": "20px 24px 12px"},
            ),
            # Metric cards row
            html.Div(
                metric_cards,
                style={"display": "flex", "gap": "12px", "padding": "0 24px 16px", "flexWrap": "wrap"},
            ),
            # Charts grid
            html.Div(
                [
                    # Price chart (full width)
                    html.Div(
                        dcc.Graph(figure=price_fig, config={"displayModeBar": False}),
                        style={"gridColumn": "1 / -1"},
                    ),
                    # Financials chart
                    html.Div(
                        dcc.Graph(figure=financials_fig, config={"displayModeBar": False}),
                    ),
                    # Valuation + News column
                    html.Div(
                        [
                            dcc.Graph(figure=valuation_fig, config={"displayModeBar": False}),
                            html.Div(
                                [
                                    html.H3("Recent News", style={"margin": "0 0 8px", "fontSize": "14px", "fontWeight": "600"}),
                                    html.Div(news_items if news_items else [html.Span("No news available", style={"color": "#64748B"})]),
                                ],
                                style={"padding": "0 8px"},
                            ),
                        ]
                    ),
                ],
                style={
                    "display": "grid",
                    "gridTemplateColumns": "1fr 1fr",
                    "gap": "8px",
                    "padding": "0 16px 24px",
                },
            ),
        ]
    )


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = 8050
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            port = int(sys.argv[idx + 1])

    print(f"Starting Finance Dashboard on http://localhost:{port}/")
    app.run(debug=False, host="0.0.0.0", port=port)
