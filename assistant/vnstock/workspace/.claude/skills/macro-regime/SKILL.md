# Macro Regime Classification Skill

Classifies Vietnam's macroeconomic environment into regimes and identifies favored sectors/factors.

## Commands

### Classify Regime

```bash
python scripts/classify_regime.py --gdp 7.2 --credit 14.5 --inflation 4.2 --output regime.json
```

### Fetch SBV Data

```bash
python scripts/fetch_sbv_data.py --output sbv_data.json
```

### Fetch GSO Data

```bash
python scripts/fetch_gso_data.py --output gso_data.json
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

```json
{
  "regime": "EXPANSION",
  "confidence": 0.85,
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
