# vnstock Data Skill

Vietnamese stock market data access via vnstock library.

## Python Library (Recommended)

Direct Python imports for zero-overhead data access. Use this instead of CLI for agent scripts.

### Import

```python
import sys
sys.path.insert(0, '.')
from .claude.skills.vnstock_data.vnstock_lib import (
    fetch_quote,
    fetch_balance_sheet,
    fetch_income_statement,
    fetch_cash_flow,
    fetch_ratios,
    fetch_price_board,
    list_symbols,
    fetch_financial_data,
    calculate_returns
)
```

### Functions

#### `fetch_quote(symbol, start, end, interval='1D', source='KBS') -> pd.DataFrame`

Fetch historical OHLCV price data.

```python
prices = fetch_quote('VCB', start='2025-02-01', end='2026-02-20')
latest_close = prices['close'].iloc[-1]
```

Returns DataFrame with columns: `time`, `open`, `high`, `low`, `close`, `volume`

#### `fetch_ratios(symbol, period='annual', lang='en', source='KBS') -> pd.DataFrame`

Fetch financial ratios (ROE, ROA, P/E, P/B, etc.)

```python
ratios = fetch_ratios('VCB', period='annual')
roe = ratios.loc[ratios['Metric'] == 'ROE', 'Value'].values[0]
pe = ratios.loc[ratios['Metric'] == 'P/E', 'Value'].values[0]
```

#### `fetch_balance_sheet(symbol, period='annual', lang='en') -> pd.DataFrame`

Fetch balance sheet statement.

```python
bs = fetch_balance_sheet('VCB', period='annual')
total_assets = bs.loc[bs['Metric'] == 'Total Assets', 'Value'].values[0]
```

#### `fetch_income_statement(symbol, period='annual', lang='en') -> pd.DataFrame`

Fetch income statement.

```python
income = fetch_income_statement('VCB', period='quarterly')
revenue = income.loc[income['Metric'] == 'Revenue', 'Value'].values[0]
```

#### `fetch_cash_flow(symbol, period='annual', lang='en') -> pd.DataFrame`

Fetch cash flow statement.

```python
cf = fetch_cash_flow('VCB', period='annual')
fcf = cf.loc[cf['Metric'] == 'Free Cash Flow', 'Value'].values[0]
```

#### `list_symbols(exchange=None, industry=None, group=None) -> pd.DataFrame`

List stock symbols with optional filters.

```python
# Get VN30 constituents
vn30 = list_symbols(group='VN30')
symbols = vn30['ticker'].tolist()

# Get banking stocks
banks = list_symbols(industry='BANKS')

# Get HOSE-listed stocks
hose = list_symbols(exchange='HOSE')
```

#### `fetch_price_board(symbols, source='KBS') -> pd.DataFrame`

Fetch real-time price board.

```python
board = fetch_price_board(['VCB', 'TCB', 'VPB'])
vcb_price = board.loc[board['symbol'] == 'VCB', 'last'].values[0]
```

#### `fetch_financial_data(symbol, period='annual') -> dict`

Fetch all financial statements at once (convenience function).

```python
data = fetch_financial_data('VCB', period='annual')
roe = data['ratios'].loc[data['ratios']['Metric'] == 'ROE', 'Value'].values[0]
revenue = data['income_statement'].loc[data['income_statement']['Metric'] == 'Revenue', 'Value'].values[0]
```

Returns dictionary with keys: `balance_sheet`, `income_statement`, `cash_flow`, `ratios`

#### `calculate_returns(symbol, start, end, periods=['1M','3M','6M','12M']) -> pd.DataFrame`

Calculate returns over multiple periods.

```python
returns = calculate_returns('VCB', '2025-02-20', '2026-02-20', ['1M', '3M', '12M'])
return_12m = returns.loc[returns['period'] == '12M', 'return'].values[0]
```

---

## CLI Interface (Legacy - Deprecated)

CLI wrapper for vnstock. **Prefer Python library above for better performance.**

### Get Quote

```bash
python scripts/vnstock_cli.py quote --params '{"symbol":"VCB","start":"2024-01-01","end":"2025-02-20"}'
```

### Get Financials

```bash
python scripts/vnstock_cli.py finance --params '{"symbol":"VCB","statement_type":"balance_sheet"}'
```

### List Symbols

```bash
python scripts/vnstock_cli.py listing --params '{"category":"all"}'
```

### Get Price Board

```bash
python scripts/vnstock_cli.py trading --params '{"symbols_list":"VCB,ACB,TCB"}'
```
