# Factor Analyst Scripts - Library Usage

## ⚠️ Use as Library, Not CLI

These scripts are designed to be **imported as Python libraries**, not run as CLI commands.

### ❌ Old Way (Deprecated CLI)

```bash
python scripts/calculate_factors.py --symbol VCB --output factors.json
```

### ✅ New Way (Library Import)

```python
import sys
sys.path.insert(0, '.')

# Import the main function directly
from factor_analyst.scripts.calculate_factors import calculate_factor_scores

# Use as a function
factor_scores = calculate_factor_scores(symbol='VCB')
print(f"Value z-score: {factor_scores['value']['z_score']}")
```

## Available Functions

### `calculate_factors.py`

```python
from factor_analyst.scripts.calculate_factors import (
    calculate_value_factors,
    calculate_momentum_factors,
    calculate_quality_factors,
    calculate_growth_factors,
    calculate_volatility_factors
)

value = calculate_value_factors('VCB')
momentum = calculate_momentum_factors('VCB')
quality = calculate_quality_factors('VCB')
```

### `rank_universe.py`

```python
from factor_analyst.scripts.rank_universe import rank_universe

rankings = rank_universe(universe='VN30', date='2026-02-20')
print(f"Rank: #{rankings['rank']} of {rankings['total']}")
```

### `factor_correlation.py`

```python
from factor_analyst.scripts.factor_correlation import calculate_factor_correlation

correlation = calculate_factor_correlation(symbols=['VCB', 'TCB', 'VPB'])
```

## Why Library > CLI?

1. **No subprocess overhead** - Direct function calls
2. **Type safety** - Work with Python dicts/DataFrames
3. **Better errors** - Python exceptions with stack traces
4. **Composability** - Chain functions together
5. **Testing** - Easy to unit test

## Legacy CLI Support

CLI wrappers are still available for backward compatibility but are deprecated.
Use library imports for all new code.
