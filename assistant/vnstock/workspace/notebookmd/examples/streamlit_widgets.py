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
    cfg = NotebookConfig(max_table_rows=20)
    st = nb("dist/streamlit_demo.md", title="Streamlit Widgets Demo", cfg=cfg)

    # ── Text Elements ──
    st.section("Text Elements")
    st.title("Dashboard Title")
    st.header("Section Header", divider=True)
    st.subheader("Subsection")
    st.caption("This is a small caption text")
    st.text("Fixed-width preformatted text output")
    st.latex(r"\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i")
    st.divider()
    st.md("Regular **markdown** with `inline code`.")

    # ── Metrics ──
    st.section("Metric Cards")
    st.metric("Total Revenue", "$1,234,567", delta="+12.3%")
    st.metric("Active Users", "34,521", delta="+2,100")
    st.metric("Churn Rate", "2.1%", delta="-0.3%", delta_color="inverse")

    st.subheader("Metrics in a Row")
    st.metric_row([
        {"label": "Revenue", "value": "$1.2M", "delta": "+12%"},
        {"label": "Profit", "value": "$340K", "delta": "+8%"},
        {"label": "Users", "value": "3,400", "delta": "+200"},
        {"label": "Churn", "value": "2.1%", "delta": "-0.3%", "delta_color": "inverse"},
    ])

    # ── JSON Display ──
    st.section("JSON Display")
    st.json({
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

    st.json({"compact": True, "value": 42}, expanded=False)

    # ── Status Elements ──
    st.section("Status Elements")
    st.success("Data loaded successfully! 1,234 rows processed.")
    st.info("Processing will use cached data from the last 24 hours.")
    st.warning("Missing data detected for 3 trading days.")
    st.error("Failed to fetch real-time quotes. Using last known prices.")
    st.progress(0.75, "Loading data...")
    st.progress(1.0, "Complete!")
    st.toast("New data available for VCB")

    # ── Layout: Expander ──
    st.section("Collapsible Sections")
    st.write("Click to expand the sections below:")

    with st.expander("Methodology", expanded=True):
        st.write("""
The analysis uses a multi-factor model combining:
- **Value**: P/E, P/B ratios relative to sector median
- **Momentum**: 6-month and 12-month price returns
- **Quality**: ROE, debt-to-equity, earnings stability
""")

    with st.expander("Data Sources"):
        st.write("""
- HOSE/HNX market data via vnstock API
- Financial statements from company filings
- Macro indicators from GSO/SBV
""")

    # ── Layout: Tabs ──
    st.section("Tabbed Sections")
    tabs = st.tabs(["Overview", "Technical", "Fundamental"])

    with tabs.tab("Overview"):
        st.metric_row([
            {"label": "Price", "value": "95,400"},
            {"label": "Change", "value": "+1.2%", "delta": "+1.2%"},
            {"label": "Volume", "value": "1.5M"},
        ])

    with tabs.tab("Technical"):
        st.kv({
            "RSI (14)": "62.3",
            "MACD": "Bullish crossover",
            "EMA 20": "94,200",
            "Support": "93,000",
            "Resistance": "97,500",
        }, title="Technical Indicators")

    with tabs.tab("Fundamental"):
        st.kv({
            "P/E": "15.2x",
            "P/B": "2.8x",
            "ROE": "22.1%",
            "Dividend Yield": "1.2%",
            "NPL Ratio": "0.8%",
        }, title="Fundamental Metrics")

    # ── Code Display ──
    st.section("Code Display")
    st.echo(
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

        st.section("DataFrame Display")
        st.dataframe(df, name="VCB Price Data")
        st.summary(df, title="Data Summary")

        if HAS_MPL:
            st.section("Convenience Charts")
            st.line_chart(df, x="date", y="close", title="VCB Close Price")
            st.bar_chart(df.tail(10), x="date", y="volume", title="Recent Volume")
            st.area_chart(df, x="date", y="rsi", title="RSI Trend")

        st.section("Export & Wrap-up")
        st.export_csv(df, "vcb_demo.csv", name="VCB demo data")
        st.connection_status("vnstock API", status="connected", details="v3.1.0")
        st.success("Demo report complete!")
        st.balloons()

    out = st.save()
    print(f"\nReport saved to: {out}")


if __name__ == "__main__":
    main()
