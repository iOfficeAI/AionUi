"""Example analysis script demonstrating notebookmd usage.

Run from the notebookmd package root:
    python examples/analysis.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running from the package root without install
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from notebookmd import nb, NotebookConfig

# Optional imports — graceful fallback
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
    cfg = NotebookConfig(max_table_rows=20, echo_to_console=True, include_code_default=True)
    N = nb("dist/notebook.md", title="Sample Financial Analysis", cfg=cfg)

    # ── Cell 1: Setup ──
    with N.cell("Setup"):
        N.md("This notebook demonstrates `notebookmd` features for financial analysis.")
        N.kv(
            {
                "pandas": "available" if HAS_PANDAS else "missing",
                "matplotlib": "available" if HAS_MPL else "missing",
            },
            title="Environment",
        )

    if HAS_PANDAS:
        # ── Cell 2: Load data ──
        with N.cell("Load sample data", code=True):
            df = pd.DataFrame(
                {
                    "date": pd.date_range("2026-01-01", periods=30, freq="D"),
                    "symbol": ["VCB"] * 30,
                    "close": [95 + i * 0.5 + (i % 7) * 0.3 for i in range(30)],
                    "volume": [1_000_000 + i * 50_000 for i in range(30)],
                }
            )
            print(f"Loaded {len(df)} rows")
            N.table(df.head(10), name="Price data (first 10)")

        # ── Cell 3: Summary stats ──
        with N.cell("Data summary"):
            N.summary(df, title="VCB Price Data Summary")

        # ── Cell 4: Aggregate ──
        with N.cell("Weekly aggregation", code=True):
            weekly = df.set_index("date").resample("W")["close"].agg(["mean", "min", "max"]).reset_index()
            weekly.columns = ["week", "avg_close", "min_close", "max_close"]
            N.table(weekly, name="Weekly price stats")
            N.kv(
                {
                    "Weeks": len(weekly),
                    "Avg Close": f"{weekly['avg_close'].mean():.2f}",
                    "Range": f"{df['close'].min():.2f} – {df['close'].max():.2f}",
                },
                title="Quick Metrics",
            )

        # ── Cell 5: Plot ──
        if HAS_MPL:
            with N.cell("Price chart", code=True):
                fig, ax = plt.subplots(figsize=(10, 4))
                ax.plot(df["date"], df["close"], linewidth=1.5, color="#2563eb")
                ax.set_title("VCB Daily Close Price")
                ax.set_xlabel("Date")
                ax.set_ylabel("Price (VND thousands)")
                ax.grid(True, alpha=0.3)
                fig.tight_layout()
                N.figure(fig, "vcb_price.png", caption="VCB daily closing price (Jan 2026)")

        # ── Cell 6: Export ──
        with N.cell("Export data"):
            N.export_csv(df, "vcb_prices.csv", name="VCB price data")
            N.note("CSV exported for downstream analysis.")

    # ── Cell 7: Interpretation ──
    with N.cell("Interpretation"):
        N.md("""
- VCB shows a **steady upward trend** over the sample period.
- Weekly aggregation reveals consistent mean-reversion within weeks.
- Volume increases suggest **growing institutional interest**.

### Next steps

1. Compare against sector peers (TCB, VPB, ACB)
2. Run factor analysis using the `factor` agent
3. Check macro regime for timing signals
""")

    out = N.save()
    print(f"\nNotebook saved to: {out}")


if __name__ == "__main__":
    main()
