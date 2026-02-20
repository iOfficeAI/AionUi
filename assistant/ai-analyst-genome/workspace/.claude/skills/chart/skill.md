# Chart Skill

# Direct Chart Generation Without Pipeline

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/chart` command
- When user wants a quick chart without running the full analysis pipeline
- Useful for presentations, quick visual checks, ad-hoc exploration

## Command

`/chart [type] [symbol] [metric]` - Generate a chart
`/chart types` - List available chart types
`/chart style [theme]` - Set chart theme (analytics | analytics-dark)

## Purpose

Generate standalone charts directly using `helpers/chart_helpers.py` and the SWD (Storytelling with Data) patterns, without invoking the full agent pipeline. Charts include brand tokens, Vietnamese formatting, and AI Analyst Lab attribution.

## Chart Types

`/chart types`

```
Available Chart Types
======================

BAR      /chart bar VCB pe_ratio quarterly     Bar chart (vertical or horizontal)
LINE     /chart line VCB price 1y              Line chart with trend
TABLE    /chart table VN30 fundamentals        Data table (styled)
SCATTER  /chart scatter HOSE pe_ratio roe      Scatter plot (2 metrics)
HEATMAP  /chart heatmap VN30 correlation       Correlation or sector heatmap
COMBO    /chart combo VCB price volume 1y      Price + volume overlay
```

## Examples

### Price Chart

```
/chart line VCB price 1y
```

Generates a line chart of VCB closing price over the last year with:

- SWD styling (decluttered, focused)
- VND y-axis formatting (e.g., 80,000 VND)
- Volume bars in secondary axis
- Brand color palette from genome_config.yaml
- "Powered by AI Analyst Lab" attribution footer

### Comparison Bar Chart

```
/chart bar VCB,TCB,FPT,VNM,HPG pe_ratio
```

Generates a horizontal bar chart comparing P/E ratios with:

- Action title: "VCB trades at highest P/E among peers (15.2x)"
- Sector average line
- Color highlighting for outliers
- Bilingual labels: "P/E (He so gia tren thu nhap)"

### Correlation Heatmap

```
/chart heatmap VN30 correlation
```

Generates a correlation matrix heatmap for VN30 stocks with:

- Color scale: green (low correlation) to red (high correlation)
- Value annotations in cells
- Sector grouping

### Scatter Plot

```
/chart scatter HOSE pe_ratio roe
```

Generates a scatter plot of P/E vs ROE for HOSE stocks with:

- Each dot labeled with stock symbol
- Quadrant lines at median P/E and median ROE
- Quadrant labels: "Undervalued + High Quality" etc.
- Size by market cap

## Chart Generation Process

```
1. Parse command -> determine chart type, data needs
2. Fetch data via vnstock_helpers -> cache if available
3. Apply SWD patterns (declutter, focus, annotate)
4. Apply brand tokens from genome_config.yaml
5. Apply Vietnamese formatting (VND, bilingual labels)
6. Add attribution watermark
7. Save to _working/charts/[chart_id].png
8. Display inline
```

## SWD Patterns Applied

Every chart follows Storytelling with Data principles:

1. **Declutter** - Remove gridlines, unnecessary borders, redundant labels
2. **Focus** - Highlight the key insight with color or annotation
3. **Annotate** - Action title (not descriptive title), call-out key values
4. **Brand** - Use genome_config.yaml color palette consistently

## Chart Configuration

```python
# Applied from helpers/chart_helpers.py
chart_config = {
    'style': 'helpers/analytics_chart_style.mplstyle',
    'brand_colors': genome_config['brand']['chart_palette'],
    'bg_color': genome_config['brand']['chart_bg'],
    'positive_color': genome_config['brand']['positive'],  # #059669
    'negative_color': genome_config['brand']['negative'],  # #DC2626
    'font': genome_config['brand']['font_body'],           # Inter
    'attribution': genome_config['attribution']['footer_text'],
    'dpi': 150,
    'figsize': (10, 6),
}
```

## Vietnamese Formatting Rules

| Element       | Format                               | Example               |
| ------------- | ------------------------------------ | --------------------- |
| Currency      | VND with comma separator             | 82,500 VND            |
| Percentages   | 1 decimal place                      | 18.5%                 |
| Volume        | No decimals, abbreviated             | 3.2M shares           |
| Dates         | ISO + ICT timezone                   | 2026-02-21 14:30 ICT  |
| Large numbers | Billion VND abbreviated              | 135,200B VND          |
| Colors        | Green=up/positive, Red=down/negative | Vietnamese convention |

## Output

- Charts saved to: `_working/charts/`
- Format: PNG (150 DPI)
- Also displayed inline in the conversation

## Quality Notes

- `/chart` generates quick charts WITHOUT Layer 4 validation
- For validated charts (chart-data match <2%), use the full pipeline
- Charts include a "Quick chart -- not validated" note in footer
- For presentation-ready charts, use `/run-pipeline` instead

## Error Handling

| Scenario           | Response                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| Invalid chart type | "Unknown chart type. Available: bar, line, table, scatter, heatmap, combo" |
| Invalid symbol     | "Symbol [X] not found. Check /datasets coverage."                          |
| No data for period | "No data available for [symbol] in [period]. Try a shorter range."         |
| Too many symbols   | "Maximum 30 symbols per chart. Use /screen to narrow down."                |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
