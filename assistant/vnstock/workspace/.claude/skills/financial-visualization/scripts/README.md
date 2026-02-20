# Financial Visualization Scripts - Library Usage

## ⚠️ Use as Library, Not CLI

These scripts should be **imported as Python libraries**, not run as CLI commands.

### ❌ Old Way (Deprecated CLI)

```bash
python scripts/plot_technical_chart.py VCB 2025-02-20 2026-02-20 signals.json output.png
```

### ✅ New Way (Library Import)

```python
import sys
sys.path.insert(0, '.')

from financial_visualization.scripts.plot_technical_chart import plot_technical_chart

# Generate technical chart
chart_path = plot_technical_chart(
    symbol='VCB',
    start_date='2025-02-20',
    end_date='2026-02-20',
    signals_path='drafts/technicals/data/signals.json',  # Optional
    output_path='drafts/technicals/charts/technical_analysis.png'
)

print(f"Chart saved to: {chart_path}")
```

## Available Functions

### `plot_technical_chart.py`

Generate 4-panel technical analysis chart:

```python
from financial_visualization.scripts.plot_technical_chart import plot_technical_chart

chart_path = plot_technical_chart(
    symbol='VCB',
    start_date='2025-02-20',
    end_date='2026-02-20',
    signals_path=None,  # Optional: path to signals JSON from technicals
    output_path='chart.png'  # Where to save PNG
)

# Chart includes:
# Panel 1: Candlestick + EMAs + Bollinger Bands + support/resistance
# Panel 2: MACD with histogram
# Panel 3: RSI with overbought/oversold zones
# Panel 4: Volume bars + OBV overlay
```

### `plot_financials.py`

Generate financial statement charts:

```python
from financial_visualization.scripts.plot_financials import plot_financials

plot_financials(
    symbol='VCB',
    date='2026-02-20',
    quarters=8,
    output_dir='drafts/fundamentals/charts/'
)
```

### `plot_radar.py`

Generate factor radar chart:

```python
from financial_visualization.scripts.plot_radar import plot_radar

plot_radar(
    symbol='VCB',
    factor_scores_path='drafts/factors/data/factor_scores.json',
    date='2026-02-20',
    output_dir='drafts/factors/charts/'
)
```

### `plot_valuation.py`

Generate valuation comparison charts:

```python
from financial_visualization.scripts.plot_valuation import plot_valuation

plot_valuation(
    symbol='VCB',
    date='2026-02-20',
    output_dir='drafts/valuation/charts/'
)
```

## Dependencies

Requires:

- `plotly` - For interactive charts
- `kaleido` - For PNG export
- `pandas` - For data manipulation

Install with:

```bash
pip install plotly kaleido pandas
```

## Legacy CLI Support

CLI wrappers (`if __name__ == "__main__"`) are preserved for backward compatibility.
Use library imports for all new code.
