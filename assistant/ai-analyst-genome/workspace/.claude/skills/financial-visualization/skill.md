# Financial Visualization Skill

## Purpose

Generates Plotly charts saved as PNG images for embedding in financial research reports. Bridges the gap between raw JSON signal data and human-readable visual insight. All charts use the `plotly_dark` theme for a consistent financial terminal aesthetic.

## Dependencies

```bash
pip install plotly kaleido pandas-ta plotly-resampler
```

`kaleido` is required for static PNG export (`.write_image()`). Without it, only HTML output is possible.

## Scripts

| Script                    | Arguments                                           | Output                                                                    |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `plot_price.py`           | `TICKER START END [DIR] [--candlestick] [--bbands]` | Price/candlestick chart + EMA-8/21/55 + volume → PNG                      |
| `plot_technical_chart.py` | `SYMBOL START END [SIGNALS_JSON] [OUTPUT]`          | Multi-panel technical analysis (4 panels: price, MACD, RSI, volume) → PNG |
| `plot_financials.py`      | `TICKER DATE [PERIODS]`                             | Grouped bar chart of revenue growth, margins, EPS over N periods → PNG    |
| `plot_valuation.py`       | `TICKER DATE`                                       | Horizontal bar chart of P/E, P/B, P/S vs 3-year trailing averages → PNG   |
| `plot_radar.py`           | `TICKER SIGNALS_JSON DATE`                          | Radar/spider chart of analyst signal scores (0–10 scale) → PNG            |

## Enhanced Features (New in v2)

✅ **Candlestick charts**: `plot_price.py` now supports `--candlestick` flag for OHLC candles
✅ **Bollinger Bands**: `plot_price.py` supports `--bbands` flag for BB overlays
✅ **Multi-panel technical chart**: `plot_technical_chart.py` generates comprehensive 4-panel TA chart
✅ **Vietnamese stock support**: Both scripts work with vnstock data via `vnstock_lib.py`
✅ **Signal annotations**: Charts show support/resistance levels from technical analysis JSON
✅ **Volume coloring**: Green/red volume bars based on price movement
✅ **OBV overlay**: Normalized On-Balance Volume on volume panel

## Usage

### Basic Price Chart (Line Chart)

```bash
# Simple line chart with EMAs
python .claude/skills/financial-visualization/scripts/plot_price.py VCB 2025-02-20 2026-02-20

# With custom output directory
python .claude/skills/financial-visualization/scripts/plot_price.py HPG 2025-02-20 2026-02-20 charts
```

### Candlestick Chart with Bollinger Bands

```bash
# Candlestick chart with Bollinger Bands
python .claude/skills/financial-visualization/scripts/plot_price.py VCB 2025-02-20 2026-02-20 \
  charts --candlestick --bbands

# Vietnamese stocks
python .claude/skills/financial-visualization/scripts/plot_price.py TCB 2025-02-20 2026-02-20 \
  --candlestick --bbands
```

### Comprehensive Technical Analysis Chart

**Standalone (no signals)**:

```bash
python .claude/skills/financial-visualization/scripts/plot_technical_chart.py \
  VCB 2025-02-20 2026-02-20
```

**With technical analysis signals** (recommended):

```bash
# Step 1: Generate signals
python .claude/skills/technicals/scripts/analyze.py VCB 2025-02-20 2026-02-20 \
  > signals.json

# Step 2: Generate chart with signal annotations
python .claude/skills/financial-visualization/scripts/plot_technical_chart.py \
  VCB 2025-02-20 2026-02-20 signals.json technical_chart.png
```

**In multi-agent workflow**:

```bash
# Create workspace
mkdir -p analyses/VCB_multiagent_2026-02-20/drafts/technicals/{data,charts}

# Run analysis
python .claude/skills/technicals/scripts/analyze.py VCB 2025-02-20 2026-02-20 \
  | tee analyses/VCB_multiagent_2026-02-20/drafts/technicals/data/signals.json

# Generate chart
python .claude/skills/financial-visualization/scripts/plot_technical_chart.py \
  VCB 2025-02-20 2026-02-20 \
  analyses/VCB_multiagent_2026-02-20/drafts/technicals/data/signals.json \
  analyses/VCB_multiagent_2026-02-20/drafts/technicals/charts/technical_analysis.png
```

### Other Charts

```bash
# Financial metrics bar chart (8 periods)
python .claude/skills/financial-visualization/scripts/plot_financials.py NVDA 2026-02-20 8

# Valuation multiples vs historical averages
python .claude/skills/financial-visualization/scripts/plot_valuation.py NVDA 2026-02-20

# Analyst consensus radar
python .claude/skills/financial-visualization/scripts/plot_radar.py NVDA \
  '{"fundamentals": {"signal": "bullish", "confidence": 0.8}, "technicals": {"signal": "bullish", "confidence": 0.7}}' \
  2026-02-20
```

## Output Format

Each script prints JSON to stdout and saves a PNG:

**Success**:

```json
{
  "chart_path": "charts/VCB_technical_2026-02-20.png",
  "symbol": "VCB",
  "date_range": "2025-02-20 to 2026-02-20",
  "data_points": 252,
  "signal": "bullish",
  "confidence": 78
}
```

**Error**:

```json
{
  "error": "plotly not installed. Run: pip install plotly kaleido"
}
```

Exit code: 0 on success, 1 on failure.

## Chart Features

### plot_technical_chart.py (Multi-Panel Layout)

**4-panel comprehensive technical analysis chart**:

**Panel 1: Price & Indicators (50% height)**

- Candlestick chart (OHLC)
- EMA 8, 21, 55 overlays
- Bollinger Bands (20-period, ±2σ)
- Support/resistance lines (from signals JSON)
- Pivot points annotations

**Panel 2: MACD (15% height)**

- MACD line (12-26-9)
- Signal line
- Histogram (colored: green = positive, red = negative)

**Panel 3: RSI (15% height)**

- RSI(14) line
- Overbought line (70) - red dash
- Oversold line (30) - green dash

**Panel 4: Volume & OBV (20% height)**

- Volume bars (colored by price movement)
- OBV overlay (normalized to volume scale)

**Dimensions**: 1400x1200 PNG (scale 2x for high DPI)

### plot_price.py (Enhanced Price Chart)

**Features**:

- Line chart (default) or candlestick (`--candlestick`)
- EMA 8, 21, 55 overlays
- Optional Bollinger Bands (`--bbands`)
- Volume subplot (colored by price movement)
- Responsive to OHLC data (supports both US and Vietnamese stocks)

**Dimensions**: 1000x600 PNG (scale 2x)

## Embedding in Reports

Chart PNG paths can be embedded in Markdown reports:

```markdown
## Technical Analysis

![Technical Chart](analyses/VCB_multiagent_2026-02-20/drafts/technicals/charts/technical_analysis.png)

**Signal**: BULLISH (confidence: 78%)

**Key Levels**:

- Support: 95,000 VND (S1 pivot)
- Resistance: 105,000 VND (R1 pivot)

**Indicators**:

- MACD: Bullish crossover on 2026-02-15
- RSI: 62 (neutral zone, not overbought)
- ADX: 28 (moderate trend strength)
- OBV: Rising (volume confirming uptrend)

**Chart Interpretation**:
The price chart shows a clear uptrend with price trading above all three EMAs (8, 21, 55).
MACD histogram turned positive 5 days ago, confirming bullish momentum. RSI at 62 indicates
room to run before overbought conditions. OBV rising in sync with price confirms institutional
accumulation. Key support at 95k VND (pivot S1), resistance at 105k VND (pivot R1).
```

## Integration with Technical Analysis Skill

**Recommended workflow**:

1. **Run technical analysis** → Get signals JSON
2. **Generate chart with signals** → PNG with support/resistance annotations
3. **Embed in markdown report** → Visual + narrative insights

**Example**:

```bash
# 1. Analyze
python .claude/skills/technicals/scripts/analyze.py VCB 2025-02-20 2026-02-20 > signals.json

# 2. Visualize
python .claude/skills/financial-visualization/scripts/plot_technical_chart.py \
  VCB 2025-02-20 2026-02-20 signals.json chart.png

# 3. Read signals for narrative
cat signals.json | jq '.momentum.metrics.macd'
# Output: {"value": 0.45, "signal": 0.38, "histogram": 0.07, "crossover": "bullish", "crossover_date": "2026-02-15"}
```

**Markdown template**:

```markdown
## Technical Analysis

![Chart](chart.png)

**Signal**: {signal.upper()} (confidence: {confidence}%)

**MACD**: {crossover} crossover on {crossover_date}
**RSI**: {rsi_value} ({rsi_interpretation})
**ADX**: {adx_value} ({trend_strength})
**OBV**: {obv_trend} (volume {confirmation})

**Support**: {support_levels}
**Resistance**: {resistance_levels}
```

## Vietnamese Stock Examples

All scripts work with Vietnamese stocks via `vnstock_lib.py`:

```bash
# VCB (Vietcombank) - Large-cap banking
python .claude/skills/financial-visualization/scripts/plot_technical_chart.py \
  VCB 2025-02-20 2026-02-20

# HPG (Hoa Phat Steel) - Industrial
python .claude/skills/financial-visualization/scripts/plot_technical_chart.py \
  HPG 2025-02-20 2026-02-20

# TCB (Techcombank) - Banking
python .claude/skills/financial-visualization/scripts/plot_price.py \
  TCB 2025-02-20 2026-02-20 --candlestick --bbands
```

## Notes

- **Output directory**: Auto-created if missing (default: `charts/` for technical chart, `reports/charts/` for others)
- **Data source**: Uses `vnstock_lib.fetch_quote()` for Vietnamese stocks, falls back to financialdatasets.ai for US stocks
- **Signal normalization**: For radar chart, confidence scores (0.0–1.0) × 10 = 0–10 axis values
- **Chart style**: `plotly_dark` template for consistent financial terminal aesthetic
- **High DPI**: All charts use `scale=2` for retina displays
- **Color scheme**:
  - Green (#26a69a): Bullish candles, positive volume bars
  - Red (#ef5350): Bearish candles, negative volume bars
  - Cyan: EMA-8 (short-term)
  - Orange: EMA-21 (medium-term), OBV
  - Purple: EMA-55 (long-term), RSI
  - Gray: Bollinger Bands, support/resistance annotations
