# Macro Regime Classification Skill

Classifies Vietnam's macroeconomic environment into regimes and identifies favored sectors/factors.

## Python Library (Recommended)

Import and use as functions:

```python
import sys
sys.path.insert(0, '.')

from macro_regime.classify import classify_regime
from macro_regime.data_fetchers import fetch_gso_data, fetch_sbv_data

# Fetch macro indicators
gso_data = fetch_gso_data()  # Returns dict with GDP, CPI
sbv_data = fetch_sbv_data()  # Returns dict with credit growth, policy rate

# Classify regime
regime = classify_regime(
    gdp_growth=gso_data['gdp_growth'],
    credit_growth=sbv_data['credit_growth'],
    inflation=gso_data['cpi_yoy']
)

print(f"Regime: {regime['regime']}")
print(f"Confidence: {regime['confidence']}%")
print(f"Favored sectors: {', '.join(regime['favored_sectors'])}")
```

## CLI (Legacy)

For backward compatibility:

```bash
python scripts/classify_regime.py --gdp 7.2 --credit 14.5 --inflation 4.2
python scripts/fetch_sbv_data.py
python scripts/fetch_gso_data.py
```

## Regimes

- **EXPANSION**: High GDP growth (>6.5%), strong credit growth (>12%), moderate inflation (<5%)
  - Favored sectors: BANKS, REAL_ESTATE, INDUSTRIALS
  - Favored factors: MOMENTUM, GROWTH

- **SLOWDOWN**: Declining GDP growth (5-6.5%), slowing credit (<12%), rising inflation (>5%)
  - Favored sectors: CONSUMER_STAPLES, UTILITIES, HEALTHCARE
  - Favored factors: QUALITY, VALUE

- **RECESSION**: Low GDP growth (<5%), contracting credit (<8%), high inflation (>7%)
  - Favored sectors: GOLD, CONSUMER_STAPLES
  - Favored factors: QUALITY, LOW_VOLATILITY

- **RECOVERY**: Improving GDP (5-6.5%), accelerating credit (>10%), falling inflation
  - Favored sectors: FINANCIALS, CONSUMER_DISCRETIONARY
  - Favored factors: VALUE, MOMENTUM

## Output Format

Returns a Python dict:

```python
{
    "regime": "EXPANSION",
    "confidence": 85,
    "indicators": {
        "gdp_growth": 7.2,
        "credit_growth": 14.5,
        "inflation": 4.2
    },
    "favored_sectors": ["BANKS", "REAL_ESTATE", "INDUSTRIALS"],
    "favored_factors": ["MOMENTUM", "GROWTH"],
    "timestamp": "2026-02-20T10:30:00Z"
}
```

### Save to CSV (Optional)

```python
import pandas as pd

# Save regime classification
pd.DataFrame([regime]).to_csv('drafts/macro/data/regime.csv', index=False)

# Save macro indicators
pd.DataFrame([gso_data]).to_csv('drafts/macro/data/gso_data.csv', index=False)
pd.DataFrame([sbv_data]).to_csv('drafts/macro/data/sbv_data.csv', index=False)
```
