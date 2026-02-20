---
name: macro
description: Vietnamese and global macro analysis - economic indicators, policy, market regime
---

# /macro Command

Analyze macroeconomic conditions affecting Vietnamese stock market.

## Usage

```
/macro
/macro fed policy impact on Vietnam
/macro Vietnam GDP growth
```

## Analysis Components

### 1. Vietnamese Economy

- **GDP growth**: Quarterly and annual trends
- **Inflation**: CPI, PPI data
- **Interest rates**: SBV (State Bank of Vietnam) policy
- **Foreign reserves**: USD reserves, currency stability
- **Trade balance**: Exports, imports, trade partners
- **FDI flows**: Foreign direct investment trends

### 2. Global Macro (Vietnam Context)

- **Fed policy**: Impact on VND and capital flows
- **China economy**: Major trading partner effects
- **Commodity prices**: Oil, steel, agricultural (Vietnam exports)
- **USD strength**: VND exchange rate implications
- **Regional growth**: ASEAN economic conditions

### 3. Market Regime

- **VNIndex trend**: Bull/bear/consolidation
- **Sector rotation**: Which sectors leading
- **Foreign flows**: Net foreign buying/selling
- **Liquidity**: Trading volumes, market breadth
- **Valuation**: Market P/E, P/B vs historical

### 4. Policy & Catalysts

- **Government policy**: Infrastructure, stimulus
- **Regulatory changes**: Market reforms, foreign ownership limits
- **Geopolitical**: US-China trade, regional stability
- **Upcoming events**: Elections, policy meetings

## Vietnamese Market Specifics

### Key Economic Indicators

- **VNIndex**: Main stock market index (HOSE)
- **SBV rate**: State Bank policy rate
- **VND/USD**: Exchange rate stability
- **Manufacturing PMI**: Economic activity
- **Export growth**: Key driver for Vietnam

### Sector Sensitivity

- **Banks**: Interest rate sensitive
- **Real Estate**: Credit policy, FDI dependent
- **Manufacturing**: Export demand, commodity costs
- **Consumer**: Domestic demand, wage growth

## Output

```
analyses/macro_{topic}_{DATE}/
├── report.md           # Macro analysis
├── charts/
│   ├── vnindex_trend_{DATE}.png
│   ├── gdp_growth_{DATE}.png
│   └── sector_performance_{DATE}.png
└── data/
    ├── economic_indicators.json
    ├── market_data.json
    └── policy_timeline.json
```

## Report Structure

1. **Executive Summary**
2. **Vietnamese Economic Outlook**
   - GDP, inflation, rates
   - Trade and FDI
3. **Global Macro Factors**
   - Fed policy
   - China economy
   - Commodity prices
4. **Market Regime Assessment**
   - VNIndex analysis
   - Sector leadership
   - Foreign flows
5. **Investment Implications**
   - Favored sectors
   - Risk factors
   - Positioning recommendations

## Vietnamese Market Integration

After macro analysis, optionally continue with:

```
/screen sector:banks momentum:high
```

To find stocks aligned with current macro regime.

## Example

```bash
/macro
```

Generates:

- Vietnam economic assessment (GDP 6-7% growth expected)
- SBV policy stance (rates stable)
- VNIndex regime (consolidation vs 1,200 support)
- Sector recommendations (banks favored if rate cuts)
- Foreign investor sentiment
- Global macro headwinds/tailwinds
