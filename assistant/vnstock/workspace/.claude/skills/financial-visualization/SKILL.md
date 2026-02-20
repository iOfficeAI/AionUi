# Financial Visualization Skill

## Purpose

Generates Plotly charts saved as PNG images for embedding in financial research reports. Bridges the gap between raw JSON signal data and human-readable visual insight. All charts use the `plotly_dark` theme for a consistent financial terminal aesthetic.

## Dependencies

```bash
pip install plotly kaleido
```

`kaleido` is required for static PNG export (`.write_image()`). Without it, only HTML output is possible.

## Free Tier Tickers (no API key required)

`AAPL`, `GOOGL`, `MSFT`, `NVDA`, `TSLA`

For all other tickers, set: `export FINANCIAL_DATASETS_API_KEY=your_key_here`

## Scripts

| Script               | Arguments                                 | Output                                                                  |
| -------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `plot_price.py`      | `TICKER START_DATE END_DATE [OUTPUT_DIR]` | Price line chart + EMA-8/21/55 overlays + volume subplot → PNG          |
| `plot_financials.py` | `TICKER DATE [PERIODS]`                   | Grouped bar chart of revenue growth, margins, EPS over N periods → PNG  |
| `plot_valuation.py`  | `TICKER DATE`                             | Horizontal bar chart of P/E, P/B, P/S vs 3-year trailing averages → PNG |
| `plot_radar.py`      | `TICKER SIGNALS_JSON DATE`                | Radar/spider chart of analyst signal scores (0–10 scale) → PNG          |

## Usage

All scripts run from the workspace root:

```bash
TODAY=$(date +%Y-%m-%d)
ONE_YEAR_AGO=$(date -v-1y +%Y-%m-%d 2>/dev/null || date -d "1 year ago" +%Y-%m-%d)

# Price chart with EMA overlays
python .claude/skills/financial-visualization/scripts/plot_price.py NVDA $ONE_YEAR_AGO $TODAY

# Financial metrics bar chart (8 periods)
python .claude/skills/financial-visualization/scripts/plot_financials.py NVDA $TODAY 8

# Valuation multiples vs historical averages
python .claude/skills/financial-visualization/scripts/plot_valuation.py NVDA $TODAY

# Analyst consensus radar (signals_json from portfolio-manager input)
python .claude/skills/financial-visualization/scripts/plot_radar.py NVDA '{"fundamentals": {"signal": "bullish", "confidence": 0.8}, "technicals": {"signal": "bullish", "confidence": 0.7}}' $TODAY
```

## Output Format

Each script prints JSON to stdout and saves a PNG to `reports/charts/`:

```json
{ "chart_path": "reports/charts/NVDA_price_2026-02-19.png", "ticker": "NVDA", "data_points": 252 }
```

On error:

```json
{ "error": "plotly not installed", "chart_path": null }
```

Exit code 1 on failure, 0 on success.

## Embedding in Reports

Chart PNG paths can be embedded in Markdown reports:

```markdown
![Price Chart with EMAs](reports/charts/NVDA_price_2026-02-19.png)
![Financial Metrics](reports/charts/NVDA_financials_2026-02-19.png)
![Valuation Multiples](reports/charts/NVDA_valuation_2026-02-19.png)
![Analyst Consensus Radar](reports/charts/NVDA_radar_2026-02-19.png)
```

If `chart_path` is null in the JSON output, omit the image line from the report.

## Notes

- Output directory `reports/charts/` is auto-created by each script if missing.
- Signal normalization for radar: confidence scores (0.0–1.0) × 10 = 0–10 axis values. Bearish signals are negated before scaling.
- Chart style: `plotly_dark` template with consistent color palette across all chart types.
