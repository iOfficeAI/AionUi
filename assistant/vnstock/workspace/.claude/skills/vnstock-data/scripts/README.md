# vnstock-data Scripts

## Migration Notice

**CLI interface has been deprecated.** Use direct Python imports instead.

### Old Way (Deprecated)

```bash
python vnstock_cli.py quote --params '{"symbol":"VCB"}'
```

### New Way (Recommended)

```python
import sys
sys.path.insert(0, '.')

from vnstock_lib import fetch_quote

# Fetch data directly
prices = fetch_quote('VCB', start='2025-01-01', end='2026-02-20')
print(prices.head())
```

## Benefits of Direct Import

1. **Zero overhead**: No subprocess spawning or JSON serialization
2. **Type safety**: Work with pandas DataFrames directly
3. **Better errors**: Python exceptions instead of bash errors
4. **IDE support**: Autocomplete and type hints
5. **Simpler code**: No CLI argument parsing

## Available Functions

See `vnstock_lib.py` for all available functions:

- `fetch_quote()` - Historical OHLCV data
- `fetch_balance_sheet()` - Balance sheet data
- `fetch_income_statement()` - Income statement
- `fetch_cash_flow()` - Cash flow statement
- `fetch_ratios()` - Financial ratios
- `list_symbols()` - List stocks by exchange/industry
- `fetch_price_board()` - Real-time price data

## Legacy CLI

The old CLI script is preserved as `vnstock_cli.py.deprecated` for reference only.
Use direct Python imports for all new code.
