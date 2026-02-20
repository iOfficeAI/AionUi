# Wave 3 Integration Test: Chart Generation

# Verify Brand Tokens and SWD Compliance

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Verify that chart-maker agent generates charts with correct brand tokens, SWD patterns, and AI Analyst Lab watermark.

## Test Cases

### Test 1: Bar Chart with Brand Colors

```python
from helpers.chart_helpers import create_bar_chart, BRAND

# Generate test bar chart
path = create_bar_chart(
    data={'VCB': 82500, 'TCB': 45200, 'BID': 52800, 'CTG': 38900},
    title='Banking Stock Prices (February 2026)',
    ylabel='Price (VND)',
    highlight_keys=['VCB'],
    value_format='vnd',
    filename='test_bar_brand.png',
)
```

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | File exists | `_working/charts/test_bar_brand.png` exists |
| 2 | Background color | `#F7F6F2` (brand.bg_light) |
| 3 | Highlight bar color | `#D97706` (brand.accent) |
| 4 | Non-highlight bar color | `#6B7280` (brand.chart_palette[3]) |
| 5 | Title color | `#1a1a2e` (brand.primary) |
| 6 | Attribution text | "Powered by AI Analyst Lab \| aianalystlab.ai" visible |
| 7 | Top spine | Not visible |
| 8 | Right spine | Not visible |
| 9 | VND formatting | Y-axis uses K/M/B abbreviations |
| 10 | DPI | >= 150 |

### Test 2: Line Chart with Focus/Mute

```python
from helpers.chart_helpers import create_line_chart
import pandas as pd
import numpy as np

dates = pd.date_range('2025-01-01', periods=250, freq='B')
path = create_line_chart(
    data={
        'VCB': pd.Series(np.random.uniform(78000, 88000, 250), index=dates),
        'TCB': pd.Series(np.random.uniform(38000, 48000, 250), index=dates),
        'VN-Index': pd.Series(np.random.uniform(1200, 1300, 250), index=dates),
    },
    title='VCB Outperforms Peers Over 12 Months',
    ylabel='Price (VND)',
    highlight_series=['VCB'],
    value_format='vnd',
    filename='test_line_focus.png',
)
```

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Focus line width | >= 2.0pt |
| 2 | Context line width | <= 1.5pt |
| 3 | Focus line alpha | 1.0 |
| 4 | Context line alpha | <= 0.5 |
| 5 | Legend present | frameon=False (no box border) |
| 6 | Attribution | Watermark at bottom right |

### Test 3: Comparison Table with Header Styling

```python
from helpers.chart_helpers import create_comparison_table
import pandas as pd

df = pd.DataFrame({
    'Symbol': ['VCB', 'TCB'],
    'Price (VND)': ['82,500', '45,200'],
    'P/E': ['15.2x', '8.5x'],
    'ROE': ['18.5%', '22.3%'],
})

path = create_comparison_table(
    df,
    title='VCB vs TCB: Fundamental Comparison',
    highlight_column='P/E',
    filename='test_table_highlight.png',
)
```

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Header background | `#1a1a2e` (brand.primary) |
| 2 | Header text | White |
| 3 | Highlight column | P/E column has accent background |
| 4 | Attribution | Present at bottom |

### Test 4: Attribution Watermark Verification

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Attribution text | "Powered by AI Analyst Lab \| aianalystlab.ai" |
| 2 | Position | Bottom-right corner |
| 3 | Font size | 7pt (small, non-distracting) |
| 4 | Opacity | 60% (alpha=0.6) |
| 5 | Style | Italic |
| 6 | Color | `#4B5563` (brand.text_secondary) |

### Test 5: Vietnamese Color Conventions

For a chart showing positive and negative returns:

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Positive values | Green (`#059669`) |
| 2 | Negative values | Red (`#DC2626`) |
| 3 | Not inverted | Green is NOT used for negative values |

## Overall Pass Criteria

**PASS:** All 5 test cases pass (all individual checks within each test pass)
**FAIL:** Any test case has a critical failure (wrong brand colors, missing attribution, inverted color convention)

## Run Instructions

```bash
cd /path/to/workspace
python helpers/chart_helpers.py  # Self-test mode
# Then visually inspect _working/charts/ for brand compliance
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
