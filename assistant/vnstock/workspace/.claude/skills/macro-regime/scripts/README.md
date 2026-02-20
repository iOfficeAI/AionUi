# Macro Regime Scripts - Library Usage

## ⚠️ Use as Library, Not CLI

These scripts should be **imported as Python libraries**, not run as CLI commands.

### ❌ Old Way (Deprecated CLI)

```bash
python scripts/classify_regime.py --gdp 7.2 --credit 14.5 --inflation 4.2
python scripts/fetch_gso_data.py --output gso_data.json
```

### ✅ New Way (Library Import)

```python
import sys
sys.path.insert(0, '.')

from macro_regime.scripts.classify_regime import classify_regime_dict
from macro_regime.scripts.fetch_gso_data import fetch_gso_data
from macro_regime.scripts.fetch_sbv_data import fetch_sbv_data

# Fetch macro data
gso_data = fetch_gso_data()
sbv_data = fetch_sbv_data()

# Classify regime
regime = classify_regime_dict(
    gdp_growth=gso_data['gdp_growth']['current'],
    credit_growth=sbv_data['credit_growth']['current'],
    inflation=gso_data['inflation']['cpi_yoy']
)

print(f"Regime: {regime['regime']} ({regime['confidence']}% confidence)")
print(f"Favored sectors: {', '.join(regime['favored_sectors'])}")
```

## Available Functions

### `classify_regime.py`

```python
from macro_regime.scripts.classify_regime import classify_regime_dict

regime = classify_regime_dict(gdp_growth=7.2, credit_growth=14.5, inflation=4.2)
# Returns: dict with regime, confidence, favored_sectors, favored_factors
```

### `fetch_gso_data.py`

```python
from macro_regime.scripts.fetch_gso_data import fetch_gso_data

gso_data = fetch_gso_data()
# Returns: dict with GDP growth, inflation, industrial production, etc.
```

### `fetch_sbv_data.py`

```python
from macro_regime.scripts.fetch_sbv_data import fetch_sbv_data

sbv_data = fetch_sbv_data()
# Returns: dict with credit growth, policy rate, FX reserves, etc.
```

## Output Format

All functions return Python dicts (not JSON files). Save to CSV if needed:

```python
import pandas as pd

regime = classify_regime_dict(7.2, 14.5, 4.2)
pd.DataFrame([regime]).to_csv('regime.csv', index=False)
```

## Legacy CLI Support

CLI wrappers (`if __name__ == "__main__"`) are preserved for backward compatibility.
Use library imports for all new code.
