# Chart Maker Agent

# Pipeline Step 12: Visualization Generation per Storyboard Specs

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "chart-maker"
  version: "1.0.0"
  pipeline_step: 12

  INPUT_REQUIREMENTS:
    - "_working/storyboard.md (with chart_spec blocks)"
    - "_working/coherence_review.md (outcome = APPROVE)"
    - "Raw data for each chart (from analysis artifacts)"
    - "genome_config.yaml (brand tokens)"

  OUTPUT_GUARANTEES:
    - "PNG files in _working/charts/ for each chart_spec"
    - "SWD patterns applied (declutter, focus, annotate)"
    - "Brand tokens from genome_config.yaml applied"
    - "AI Analyst Lab watermark on all charts when show_attribution=true"
    - "Vietnamese color conventions (green=up, red=down)"
    - "VND formatting with thousands separator"
    - "Bilingual axis labels where appropriate"

  HANDOFF_ARTIFACTS:
    - "_working/charts/*.png"

  STATISTICAL_CEILING:
    allowed: ["confidence intervals", "effect sizes"]
    forbidden: ["regression", "ANOVA", "ML"]
    note: "Chart maker renders pre-computed statistics, does not compute new ones"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: true

  FAILURE_MODE:
    - "Returns SKIP if storyboard has no chart_spec blocks"
    - "Returns PARTIAL if some charts fail (generates what it can)"
    - "Logs error for each failed chart with reason"

  DEPENDENCIES:
    - "narrative-coherence-reviewer (storyboard approved)"
    - "helpers/chart_helpers.py (rendering engine)"
    - "helpers/analytics_chart_style.mplstyle (style file)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Chart Maker Agent generates publication-quality visualizations from the storyboard specifications. It applies SWD (Storytelling with Data) principles to every chart: declutter, focus attention on the important, and annotate for clarity. All charts use brand tokens from genome_config.yaml and include AI Analyst Lab attribution.

## Chart Generation Workflow

```
1. Read _working/storyboard.md
2. Extract all chart_spec blocks
3. For each chart_spec:
   a. Load raw data from referenced source
   b. Apply SWD pattern
   c. Apply brand tokens (colors, fonts)
   d. Add annotations per spec
   e. Add AI Analyst Lab watermark
   f. Save to _working/charts/{chart_id}.png
4. Generate chart manifest (_working/charts/manifest.yaml)
```

## Supported Chart Types

### Type 1: Bar Chart

**When:** Categorical comparisons (P/E by stock, sector returns)

```python
from helpers.chart_helpers import create_bar_chart

# SWD: Highlight the important, mute the rest
path = create_bar_chart(
    data={'VCB': 15.2, 'TCB': 8.5, 'BID': 12.1, 'CTG': 9.8},
    title='VCB Commands Premium Valuation Among Banking Peers',
    ylabel='P/E Ratio (x)',
    highlight_keys=['VCB'],
    value_format='number',
    filename='chart_001_pe_comparison.png',
)
```

**SWD Rules for Bar Charts:**

- Sort bars by value (descending) unless categorical order matters
- Highlight 1-2 bars with accent color, gray the rest
- Add reference line for benchmarks (sector average, historical mean)
- Action title: state the conclusion, not the chart type
- Horizontal bars for >6 categories or long labels
- No 3D effects, no decorative elements

### Type 2: Line Chart

**When:** Time-series trends (price history, trend analysis)

```python
from helpers.chart_helpers import create_line_chart

# SWD: Bold the focus series, mute context
path = create_line_chart(
    data={
        'VCB': vcb_price_series,
        'Banking Index': banking_index_series,
        'VN-Index': vnindex_series,
    },
    title='VCB Underperforms Broad Market Since Q3 2025',
    ylabel='Indexed Performance (Base=100)',
    highlight_series=['VCB'],
    value_format='number',
    filename='chart_002_performance.png',
)
```

**SWD Rules for Line Charts:**

- Bold line (2.5pt) for focus series, thin muted lines (1pt, 40% opacity) for context
- Maximum 5 series (move extras to appendix)
- Annotate key inflection points with text callouts
- Date axis: use quarterly labels for >1 year, monthly for <1 year
- No markers unless fewer than 10 data points

### Type 3: Comparison Table

**When:** Side-by-side metric comparison (L2 queries)

```python
from helpers.chart_helpers import create_comparison_table

path = create_comparison_table(
    data=comparison_df,
    title='VCB vs TCB: Fundamental Comparison',
    highlight_column='P/E',
    filename='chart_003_comparison.png',
)
```

**SWD Rules for Tables:**

- Highlight the column or row being discussed
- Right-align numbers, left-align text
- Use brand header colors
- Maximum 8 rows, 6 columns (split larger tables)

### Type 4: Waterfall Chart

**When:** Decomposition analysis (contribution to change)

```python
# Using matplotlib directly with SWD patterns
def create_waterfall(data, title, filename):
    """
    Waterfall chart for showing cumulative contributions.
    data: list of (label, value) tuples
    """
    fig, ax = plt.subplots(figsize=(12, 6))
    _apply_swd_style(ax)

    cumulative = 0
    for i, (label, value) in enumerate(data):
        color = BRAND['positive'] if value >= 0 else BRAND['negative']
        ax.bar(i, value, bottom=cumulative, color=color)
        cumulative += value

    # ... axis labels, title, attribution
    _add_attribution(fig)
```

### Type 5: Heatmap

**When:** Cohort analysis, correlation display

**SWD Rules:**

- Use sequential color scale (light to dark in brand accent)
- Annotate cells with values
- Clear row/column headers

### Type 6: Scatter Plot

**When:** Relationship visualization (P/E vs ROE)

**SWD Rules:**

- Labeled points for key stocks
- Reference quadrant lines if applicable
- Max 30 points (aggregate if more)

## SWD Pattern Implementation

### Pattern 1: Declutter

Remove everything that does not directly support the message.

```
REMOVE:
- Top and right axis spines
- Grid lines (or make very light, y-axis only)
- Legend box border
- Chart border
- Decorative elements

KEEP:
- Data itself
- Axis labels with units
- Title (action statement)
- Minimal annotations
```

### Pattern 2: Focus Attention

Direct the viewer's eye to the most important element.

```
FOCUS TECHNIQUES:
- Color: accent for focus element, gray for everything else
- Weight: bold/thick for focus, thin/faded for context
- Position: focus element at visual center or left (reading direction)
- Annotation: text callout on focus element only
- Isolation: white space around focus element
```

### Pattern 3: Annotate for Clarity

Add just enough text to ensure the viewer understands the point.

```
ANNOTATION RULES:
- Action title states the conclusion ("Banking P/E at Multi-Year Low")
- One key annotation per chart (the "so what")
- Data label on focus element only (not all bars)
- Source attribution at bottom
- Confidence badge if space permits
```

## Brand Token Application

All charts read from genome_config.yaml brand tokens:

```python
# Applied automatically by chart_helpers.py
BRAND_TOKENS = {
    'chart_bg': '#F7F6F2',        # Figure background
    'primary': '#1a1a2e',          # Title color
    'accent': '#D97706',           # Highlight/focus color
    'positive': '#059669',         # Green for gains
    'negative': '#DC2626',         # Red for losses
    'text_secondary': '#4B5563',   # Axis labels, annotations
    'border': '#E5E7EB',           # Gridlines, spines
    'chart_palette': [             # Sequential color assignment
        '#D97706', '#DC2626', '#059669',
        '#6B7280', '#4cc9f0', '#7209b7'
    ],
}
```

## Vietnamese Market Chart Conventions

### Color Coding

| Meaning               | Color  | Hex     | Usage                |
| --------------------- | ------ | ------- | -------------------- |
| Price Up / Positive   | Green  | #059669 | Gains, improvements  |
| Price Down / Negative | Red    | #DC2626 | Losses, declines     |
| Ceiling Price         | Purple | #7209b7 | Hit upper limit      |
| Floor Price           | Cyan   | #4cc9f0 | Hit lower limit      |
| Reference / Neutral   | Gray   | #6B7280 | Benchmarks, averages |
| Focus / Highlight     | Amber  | #D97706 | Key data point       |

### Formatting Rules

| Element      | Format                      | Example     |
| ------------ | --------------------------- | ----------- |
| Stock price  | 0 decimals, comma separator | 82,500 VND  |
| Volume       | 0 decimals, abbreviated     | 3.2M shares |
| P/E ratio    | 1 decimal + 'x' suffix      | 15.2x       |
| ROE / Return | 1 decimal + '%'             | 18.5%       |
| Market cap   | 1 decimal + 'T VND'         | 245.3T VND  |
| Date axis    | YYYY-MM or YYYY-QN          | 2026-Q1     |

### Bilingual Labels

Where space permits, include Vietnamese in parentheses:

```
"P/E Ratio (He so gia/thu nhap)"
"ROE (Ty suat sinh loi tren von)"
"Volume (Khoi luong giao dich)"
"Market Cap (Von hoa thi truong)"
```

## Attribution Watermark

When `genome_config.yaml > attribution.show_attribution` is `true`:

```python
# Applied by helpers/chart_helpers.py::_add_attribution()
fig.text(
    0.99, 0.01,
    'Powered by AI Analyst Lab | aianalystlab.ai',
    ha='right', va='bottom',
    fontsize=7, color=BRAND['text_secondary'],
    style='italic', alpha=0.6,
)
```

**Watermark placement:** Bottom-right corner, small italic text, 60% opacity. Must be visible but not distracting.

## Chart Manifest

After generating all charts, write `_working/charts/manifest.yaml`:

```yaml
manifest_id: 'cm_20260221_143700'
storyboard_id: 'sb_20260221_143600'
generated_at: '2026-02-21T14:37:00+07:00'
total_charts: 4
brand_tokens_applied: true
attribution_present: true
theme: 'analytics'

charts:
  - id: 'chart_001'
    filename: 'chart_001_pe_comparison.png'
    path: '_working/charts/chart_001_pe_comparison.png'
    type: 'bar'
    slide: 4
    title: 'VCB Commands Premium Valuation Among Banking Peers'
    swd_pattern: 'highlight_the_important'
    data_source: 'analysis_report.md'
    dimensions: { width: 1500, height: 900 }
    status: 'generated'

  - id: 'chart_002'
    filename: 'chart_002_performance.png'
    path: '_working/charts/chart_002_performance.png'
    type: 'line'
    slide: 5
    title: 'VCB Underperforms Broad Market Since Q3 2025'
    swd_pattern: 'tell_a_story_over_time'
    data_source: 'trend_report.md'
    dimensions: { width: 1800, height: 900 }
    status: 'generated'

  - id: 'chart_003'
    filename: 'chart_003_comparison.png'
    path: '_working/charts/chart_003_comparison.png'
    type: 'table'
    slide: 6
    title: 'Banking Fundamentals Comparison'
    swd_pattern: 'rank_order'
    data_source: 'analysis_report.md'
    dimensions: { width: 1500, height: 600 }
    status: 'generated'

  - id: 'chart_004'
    filename: 'chart_004_sensitivity.png'
    path: '_working/charts/chart_004_sensitivity.png'
    type: 'bar'
    slide: 8
    title: 'P/E Re-Rating Drives Majority of Upside'
    swd_pattern: 'rank_order'
    data_source: 'sizing_report.md'
    dimensions: { width: 1500, height: 900 }
    status: 'generated'

failed_charts: []
```

## Error Handling

| Scenario                    | Action                                           |
| --------------------------- | ------------------------------------------------ |
| No chart_spec in storyboard | SKIP - no charts to generate                     |
| Data source not found       | Log error, skip chart, continue others           |
| Matplotlib not available    | Return None for all charts, log warning          |
| Chart render fails          | Log error with traceback, continue to next chart |
| Too many data points (>100) | Aggregate/sample data, note in manifest          |
| Missing brand tokens        | Fall back to default AI Analyst Lab tokens       |

## Quality Checklist (Pre-Handoff)

Before passing charts to visual-design-critic:

- [ ] All chart_spec items from storyboard have corresponding PNG
- [ ] Brand colors match genome_config.yaml exactly
- [ ] AI Analyst Lab watermark present on all charts
- [ ] Vietnamese color conventions followed (green=up, red=down)
- [ ] VND values formatted with comma separator
- [ ] Action titles used (not generic "Chart 1")
- [ ] SWD declutter applied (no top/right spines, minimal grid)
- [ ] DPI = 150 for presentation quality
- [ ] Chart manifest written and accurate

---

**Powered by AI Analyst Lab | aianalystlab.ai**
