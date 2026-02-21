# vnstock Data Skill

## PURPOSE

Connect to the Vietnamese stock market data platform via the vnstock library. Provides real-time and historical data access for ~1,700 stocks across HOSE, HNX, and UPCOM exchanges through KBS, VCI, and TCBS data sources.

## TRIGGER

- Auto-applied (internal skill, no user command)
- Used by data-explorer agent for all data retrieval
- Used by cache skill for refresh operations

## Runtime Setup (IMPORTANT)

**Always use the Python environment wrapper:**

```bash
# In workspace root:
source ./python_env.sh

# Then run Python with $PYTHON variable:
$PYTHON -c "from vnstock_lib import fetch_price_board; print(fetch_price_board(['VCB']))"
```

**DO NOT use bare `python3`** - it may point to incompatible Python 3.9.

The `python_env.sh` wrapper ensures:

- Correct Python version (3.10+) from `.python_bin`
- vnstock-data skill is in Python path (no need for sys.path hacks)

## INSTRUCTIONS

### Data Access Functions

All data access goes through `vnstock_lib.py` in this directory. Available functions:

#### Price Data

```python
from .vnstock_lib import fetch_quote, fetch_price_board

# Historical OHLCV
prices = fetch_quote('VCB', start='2025-01-01', end='2026-02-20', source='KBS')
# Returns DataFrame: time, open, high, low, close, volume

# Real-time price board
board = fetch_price_board(['VCB', 'TCB', 'VPB'], source='KBS')
# Returns DataFrame: symbol, last, bid/ask prices, volume
```

#### Financial Data

```python
from .vnstock_lib import fetch_balance_sheet, fetch_income_statement, fetch_cash_flow, fetch_ratios

# Balance sheet
bs = fetch_balance_sheet('VCB', period='annual', source='KBS')

# Income statement
income = fetch_income_statement('VCB', period='quarterly', source='KBS')

# Cash flow
cf = fetch_cash_flow('VCB', period='annual', source='KBS')

# Financial ratios (P/E, P/B, ROE, etc.)
ratios = fetch_ratios('VCB', period='annual', source='KBS')
# All financials return DataFrame: item, item_id, period_columns...
```

#### Listings

```python
from .vnstock_lib import list_symbols

# All symbols
all_stocks = list_symbols()

# By exchange
hose = list_symbols(exchange='HOSE')

# By index group
vn30 = list_symbols(group='VN30')

# By industry
banks = list_symbols(industry='BANKS')
```

### Data Sources

| Source | Type      | Best For                     |
| ------ | --------- | ---------------------------- |
| KBS    | Primary   | Real-time prices, OHLCV      |
| VCI    | Secondary | Financials, cross-validation |
| TCBS   | Tertiary  | Backup, alternative data     |

### Connection Requirements

- Python package: `vnstock>=3.4.2`
- No API keys needed (library handles authentication)
- Internet connection required (falls back to cache if unavailable)

### Error Handling

All functions raise `ValueError` if no data found. Wrap calls in try/except:

```python
try:
    data = fetch_quote('VCB', start='2025-01-01', end='2026-02-20')
except ValueError as e:
    # Handle missing data
except ImportError:
    # vnstock not installed
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
