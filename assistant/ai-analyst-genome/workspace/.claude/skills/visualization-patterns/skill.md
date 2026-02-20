# Visualization Patterns Skill

# SWD Chart Patterns and Rules

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Apply Storytelling with Data (SWD) chart patterns and rules to all chart generation. This skill is auto-applied whenever charts are created, ensuring every visualization follows declutter, focus attention, and think-like-a-designer principles.

## When to Use

- **Trigger:** Auto-applied during chart generation (chart-maker agent)
- **Context:** Any time a visualization is being created or reviewed
- **Also invoked by:** visual-design-critic for review checklist

## SWD Core Principles

### Principle 1: Declutter

Remove everything that does not directly convey the data message.

**Remove:**

- Top and right axis spines
- Heavy gridlines (use light y-axis grid only, or none)
- Legend box borders
- Decorative elements (3D effects, gradients, shadows)
- Unnecessary tick marks
- Chart borders

**Implementation:**

```python
from helpers.chart_helpers import _apply_swd_style
# Automatically applied by chart_helpers functions
```

### Principle 2: Focus Attention

Direct the viewer's eye to the most important data element.

**Techniques:**
| Technique | How | When |
|-----------|-----|------|
| Color contrast | Accent color on focus, gray on rest | Bar/line emphasis |
| Line weight | Bold (2.5pt) focus, thin (1pt) context | Multi-series lines |
| Opacity | 100% focus, 30-40% context | Any chart type |
| Annotation | Text callout on key point only | Key finding |
| Isolation | White space around focus element | Dashboard layout |

### Principle 3: Think Like a Designer

Apply design fundamentals to make charts clear and professional.

**Design Rules:**

- **Alignment:** Consistent grid across all chart elements
- **Proximity:** Related items grouped (legend near its series)
- **Contrast:** Visual hierarchy via size, weight, color
- **Repetition:** Consistent style across all charts in a deck
- **White space:** Generous margins, uncluttered layout

## Chart Type Selection Guide

| Data Pattern           | Recommended Chart       | SWD Pattern               |
| ---------------------- | ----------------------- | ------------------------- |
| Categorical comparison | Horizontal bar          | `rank_order`              |
| Time series            | Line                    | `tell_a_story_over_time`  |
| Part of whole          | Stacked bar (not pie)   | `part_to_whole`           |
| Deviation from target  | Bar with reference line | `show_the_gap`            |
| Correlation            | Scatter (max 30 points) | `relationship`            |
| Distribution           | Histogram or box        | `spread`                  |
| Key metrics            | KPI cards (not charts)  | `highlight_the_important` |
| Before/After           | Paired bar or slope     | `show_the_gap`            |

**Vietnamese Market Chart Conventions:**

- Green = positive/up, Red = negative/down (same as international)
- Purple = ceiling price hit, Cyan = floor price hit
- VND formatting with comma separator (82,500 not 82500)
- Stock prices displayed as whole numbers (no decimals)

## Action Title Rules

Chart titles must state the conclusion, not describe the chart type.

| Bad Title              | Good Title                                        |
| ---------------------- | ------------------------------------------------- |
| "P/E Ratio Comparison" | "VCB Commands Premium Valuation at 15.2x"         |
| "Stock Price History"  | "Banking Stocks Underperform VN-Index by 12%"     |
| "ROE by Sector"        | "Banking ROE Leads All Sectors at 18.5%"          |
| "Volume Chart"         | "Trading Volume Surges 3x After Earnings Release" |

## Annotation Rules

- **One key annotation per chart** (the "so what")
- **Data label on focus element only** (not every bar)
- **Reference lines for benchmarks** (sector average, historical mean)
- **Source attribution at bottom** (small, italic, muted color)
- **Confidence badge if space permits** (inline badge component)

## Brand Token Integration

All charts read colors from `genome_config.yaml`:

```yaml
chart_palette: ['#D97706', '#DC2626', '#059669', '#6B7280', '#4cc9f0', '#7209b7']
chart_bg: '#F7F6F2'
positive: '#059669'
negative: '#DC2626'
accent: '#D97706'
```

**Zero hardcoded colors in chart code.** All color values come from brand tokens.

## Quality Checklist

Before any chart is finalized:

- [ ] Top and right spines removed
- [ ] Gridlines minimal or absent
- [ ] One clear focus element highlighted
- [ ] Action title (conclusion, not label)
- [ ] Units on axes (VND, %, x)
- [ ] Brand colors from genome_config
- [ ] AI Analyst Lab watermark present
- [ ] 150 DPI minimum for presentations

---

**Powered by AI Analyst Lab | aianalystlab.ai**
