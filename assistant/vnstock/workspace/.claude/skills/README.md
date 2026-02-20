# Skills - Python Library Guide

## Overview

All skills are designed as **Python libraries**, not CLI tools. Import and use functions directly instead of running scripts via bash.

## ⚠️ Important: No More CLI

**Old approach (deprecated)**:

```bash
python .claude/skills/vnstock-data/scripts/vnstock_cli.py finance --params '{...}' > output.json
python .claude/skills/technicals/scripts/analyze.py VCB 2025-02-20 2026-02-20 > signals.json
```

**New approach (recommended)**:

```python
import sys
sys.path.insert(0, '.')

from vnstock_lib import fetch_balance_sheet
from technicals.scripts.analyze import analyze_technical

balance_sheet = fetch_balance_sheet('VCB', period='annual')
signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')
```

## Available Skills

### 1. vnstock-data

**Core data access for Vietnamese stocks**

```python
from vnstock_lib import (
    fetch_quote,              # Historical OHLCV data
    fetch_balance_sheet,      # Balance sheet
    fetch_income_statement,   # Income statement
    fetch_cash_flow,          # Cash flow statement
    fetch_ratios,             # Financial ratios
    list_symbols,             # List stocks by exchange/industry
    fetch_price_board         # Real-time prices
)

# Example
prices = fetch_quote('VCB', start='2025-01-01', end='2026-02-20')
ratios = fetch_ratios('VCB', period='annual')
```

### 2. technicals

**Technical analysis using pandas-ta**

```python
from technicals.scripts.analyze import analyze_technical

signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')
# Returns dict with:
# - signal, confidence, combined_score
# - trend_following (EMA, ADX)
# - momentum (MACD, RSI, OBV)
# - mean_reversion (Bollinger Bands, z-score)
# - volatility (ATR, historical volatility)
```

### 3. macro-regime

**Vietnam macroeconomic regime classification**

```python
from macro_regime.scripts.classify_regime import classify_regime_dict
from macro_regime.scripts.fetch_gso_data import fetch_gso_data
from macro_regime.scripts.fetch_sbv_data import fetch_sbv_data

gso_data = fetch_gso_data()  # GDP, inflation, industrial production
sbv_data = fetch_sbv_data()  # Credit growth, policy rate, FX reserves

regime = classify_regime_dict(
    gdp_growth=7.2,
    credit_growth=14.5,
    inflation=4.2
)
# Returns: EXPANSION/SLOWDOWN/RECESSION/RECOVERY with favored sectors/factors
```

### 4. factor-analyst

**Quantitative factor calculations**

```python
from factor_analyst.scripts.calculate_factors import (
    calculate_value_factors,
    calculate_momentum_factors,
    calculate_quality_factors,
    calculate_growth_factors,
    calculate_volatility_factors
)

value = calculate_value_factors('VCB')      # P/E, P/B, EV/EBITDA
momentum = calculate_momentum_factors('VCB') # 12M/6M returns, RSI
quality = calculate_quality_factors('VCB')   # ROE, ROA, debt/equity
```

### 5. financial-visualization

**Generate professional charts**

```python
from financial_visualization.scripts.plot_technical_chart import plot_technical_chart
from financial_visualization.scripts.plot_financials import plot_financials

# 4-panel technical chart
chart_path = plot_technical_chart(
    symbol='VCB',
    start_date='2025-02-20',
    end_date='2026-02-20',
    output_path='technical_analysis.png'
)

# Financial statements charts
plot_financials('VCB', date='2026-02-20', quarters=8, output_dir='charts/')
```

## Directory Structure

```
.claude/skills/
├── vnstock-data/
│   ├── vnstock_lib.py              # Core data functions
│   └── scripts/
│       ├── vnstock_cli.py.deprecated  # Old CLI (deprecated)
│       └── README.md
├── technicals/
│   ├── __init__.py
│   ├── SKILL.md
│   └── scripts/
│       ├── analyze.py              # analyze_technical()
│       └── README.md
├── macro-regime/
│   ├── __init__.py
│   ├── SKILL.md
│   └── scripts/
│       ├── classify_regime.py      # classify_regime_dict()
│       ├── fetch_gso_data.py       # fetch_gso_data()
│       ├── fetch_sbv_data.py       # fetch_sbv_data()
│       └── README.md
├── factor-analyst/
│   ├── __init__.py
│   ├── SKILL.md
│   └── scripts/
│       ├── calculate_factors.py    # Factor calculations
│       ├── rank_universe.py        # Cross-sectional ranking
│       └── README.md
└── financial-visualization/
    ├── __init__.py
    ├── SKILL.md
    └── scripts/
        ├── plot_technical_chart.py # Technical charts
        ├── plot_financials.py      # Financial charts
        ├── plot_radar.py           # Factor radar chart
        └── README.md
```

## Import Best Practices

### 1. Always add workspace to path

```python
import sys
sys.path.insert(0, '.')  # Add workspace root to Python path
```

### 2. Import from specific modules

```python
# ✅ Good - specific import
from vnstock_lib import fetch_quote

# ✅ Good - multiple imports
from vnstock_lib import (
    fetch_quote,
    fetch_ratios,
    fetch_balance_sheet
)

# ❌ Avoid - wildcard imports
from vnstock_lib import *
```

### 3. Save to CSV, not JSON

```python
import pandas as pd

# Get data
prices = fetch_quote('VCB', start='2025-01-01', end='2026-02-20')

# Save to CSV (spreadsheet compatible)
prices.to_csv('data/vcb_prices.csv', index=False)

# For dicts, convert to DataFrame first
signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')
pd.DataFrame([signals]).to_csv('data/signals.csv', index=False)
```

## Migration Guide

### Before (CLI Approach)

```bash
# Fetch data via CLI
python .claude/skills/vnstock-data/scripts/vnstock_cli.py finance \
  --params '{"symbol":"VCB","statement_type":"balance_sheet"}' \
  > data/balance_sheet.json

# Read JSON
cat data/balance_sheet.json | jq '.data'

# Run technical analysis
python .claude/skills/technicals/scripts/analyze.py VCB 2025-02-20 2026-02-20 \
  > signals.json
```

### After (Library Approach)

```python
import sys
sys.path.insert(0, '.')
import pandas as pd

from vnstock_lib import fetch_balance_sheet
from technicals.scripts.analyze import analyze_technical

# Fetch data directly
balance_sheet = fetch_balance_sheet('VCB', period='annual')

# Run technical analysis
signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')

# Save to CSV (optional)
balance_sheet.to_csv('data/balance_sheet.csv', index=False)
pd.DataFrame([signals]).to_csv('data/signals.csv', index=False)

# Access data directly (no JSON parsing)
print(f"Signal: {signals['signal']}")
print(f"Confidence: {signals['confidence']}%")
```

## Benefits

1. **No subprocess overhead** - Direct function calls vs spawning Python processes
2. **Type safety** - Work with pandas DataFrames and Python dicts
3. **Better errors** - Python exceptions with stack traces
4. **IDE support** - Autocomplete, type hints, go-to-definition
5. **Composability** - Chain functions together easily
6. **Testing** - Easy to unit test
7. **Performance** - No serialization/deserialization overhead

## Each Skill Has

- ✅ `SKILL.md` - Skill documentation with library usage
- ✅ `__init__.py` - Module initialization for easy imports
- ✅ `scripts/README.md` - Library usage guide for that skill
- ✅ Importable functions - All main functions can be imported

## Further Reading

- See each `SKILL.md` for detailed documentation
- See each `scripts/README.md` for usage examples
- See `PYTHON_MIGRATION.md` for migration notes
- See agent prompts in `.claude/agents/` for real-world examples

## Support

For issues or questions:

1. Check the skill's `SKILL.md`
2. Check the `scripts/README.md`
3. Look at agent examples in `.claude/agents/`
4. Check `PYTHON_MIGRATION.md` for patterns
