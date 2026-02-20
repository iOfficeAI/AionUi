"""Example demonstrating all Streamlit-style widgets in notebookmd.

Run from the notebookmd package root:
    python examples/streamlit_widgets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running from the package root without install
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from notebookmd import nb, NotebookConfig

# Optional imports
try:
    import pandas as pd

    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    HAS_MPL = True
except ImportError:
    HAS_MPL = False


def main():
    cfg = NotebookConfig(max_table_rows=20, echo_to_console=True)
    N = nb("dist/streamlit_demo.md", title="Streamlit Widgets Demo", cfg=cfg)

    # ── Text Elements ──
    with N.cell("Text Elements"):
        N.st_title("Dashboard Title")
        N.st_header("Section Header", divider=True)
        N.st_subheader("Subsection")
        N.st_caption("This is a small caption text")
        N.text("Fixed-width preformatted text output")
        N.latex(r"\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i")
        N.divider()
        N.md("Regular **markdown** with `inline code`.")

    # ── Metrics ──
    with N.cell("Metric Cards"):
        N.metric("Total Revenue", "$1,234,567", delta="+12.3%")
        N.metric("Active Users", "34,521", delta="+2,100")
        N.metric("Churn Rate", "2.1%", delta="-0.3%", delta_color="inverse")

        N.md("### Metrics in a Row")
        N.metric_row([
            {"label": "Revenue", "value": "$1.2M", "delta": "+12%"},
            {"label": "Profit", "value": "$340K", "delta": "+8%"},
            {"label": "Users", "value": "3,400", "delta": "+200"},
            {"label": "Churn", "value": "2.1%", "delta": "-0.3%", "delta_color": "inverse"},
        ])

    # ── JSON Display ──
    with N.cell("JSON Display"):
        N.json({
            "symbol": "VCB",
            "exchange": "HOSE",
            "metrics": {
                "pe_ratio": 15.2,
                "pb_ratio": 2.8,
                "dividend_yield": 0.012,
            },
            "sector": "Banking",
            "tags": ["blue-chip", "state-owned", "dividend"],
        })

        N.json({"compact": True, "value": 42}, expanded=False)

    # ── Status Elements ──
    with N.cell("Status Elements"):
        N.success("Data loaded successfully! 1,234 rows processed.")
        N.info("Processing will use cached data from the last 24 hours.")
        N.warning("Missing data detected for 3 trading days.")
        N.error("Failed to fetch real-time quotes. Using last known prices.")
        N.progress(0.75, "Loading data...")
        N.progress(1.0, "Complete!")
        N.toast("New data available for VCB")

    # ── Layout: Expander ──
    with N.cell("Collapsible Sections"):
        N.md("Click to expand the sections below:")

        with N.expander("Methodology", expanded=True):
            N.md("""
The analysis uses a multi-factor model combining:
- **Value**: P/E, P/B ratios relative to sector median
- **Momentum**: 6-month and 12-month price returns
- **Quality**: ROE, debt-to-equity, earnings stability
""")

        with N.expander("Data Sources"):
            N.md("""
- HOSE/HNX market data via vnstock API
- Financial statements from company filings
- Macro indicators from GSO/SBV
""")

    # ── Layout: Tabs ──
    with N.cell("Tabbed Sections"):
        tabs = N.tabs(["Overview", "Technical", "Fundamental"])

        with tabs.tab("Overview"):
            N.metric_row([
                {"label": "Price", "value": "95,400"},
                {"label": "Change", "value": "+1.2%", "delta": "+1.2%"},
                {"label": "Volume", "value": "1.5M"},
            ])

        with tabs.tab("Technical"):
            N.kv({
                "RSI (14)": "62.3",
                "MACD": "Bullish crossover",
                "EMA 20": "94,200",
                "Support": "93,000",
                "Resistance": "97,500",
            }, title="Technical Indicators")

        with tabs.tab("Fundamental"):
            N.kv({
                "P/E": "15.2x",
                "P/B": "2.8x",
                "ROE": "22.1%",
                "Dividend Yield": "1.2%",
                "NPL Ratio": "0.8%",
            }, title="Fundamental Metrics")

    # ── Code Display ──
    with N.cell("Code Display"):
        N.echo(
            'df = fetch_quote("VCB", start="2025-01-01")\nprint(f"Rows: {len(df)}")',
            "Rows: 280",
        )

    # ── DataFrame & Charts (requires pandas) ──
    if HAS_PANDAS:
        df = pd.DataFrame({
            "date": pd.date_range("2026-01-01", periods=30, freq="D"),
            "close": [95 + i * 0.5 + (i % 7) * 0.3 for i in range(30)],
            "volume": [1_000_000 + i * 50_000 for i in range(30)],
            "rsi": [45 + i * 0.8 - (i % 5) * 2 for i in range(30)],
        })

        with N.cell("DataFrame Display"):
            N.dataframe(df, name="VCB Price Data")
            N.summary(df, title="Data Summary")

        if HAS_MPL:
            with N.cell("Convenience Charts"):
                N.line_chart(df, x="date", y="close", title="VCB Close Price")
                N.bar_chart(df.tail(10), x="date", y="volume", title="Recent Volume")
                N.area_chart(df, x="date", y="rsi", title="RSI Trend")

        with N.cell("Export & Wrap-up"):
            N.export_csv(df, "vcb_demo.csv", name="VCB demo data")
            N.connection_status("vnstock API", status="connected", details="v3.1.0")
            N.success("Demo notebook complete!")
            N.balloons()

    out = N.save()
    print(f"\nNotebook saved to: {out}")


if __name__ == "__main__":
    main()
