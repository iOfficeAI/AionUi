# Datasets Skill

# Data Source and Coverage Information

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/datasets` command
- When user asks about data availability, coverage, or sources
- Complements `/data-sources` with more detail on coverage

## Command

`/datasets` - Overview of all available datasets
`/datasets [source]` - Coverage details for a specific source (KBS, VCI, TCBS)
`/datasets coverage [symbol]` - Check data availability for a symbol
`/datasets freshness` - Show data staleness for each data type
`/datasets gaps [symbol]` - Identify missing data periods

## Purpose

Provide detailed information about what data is available, its coverage period, freshness, known gaps, and quality characteristics. This helps users understand what analyses are possible and what limitations exist.

## Main Output

`/datasets`

```
Available Datasets - Vietnamese Stock Market
==============================================
Platform: vnstock (v3.4.2+)
Sources: KBS (primary), VCI (secondary), TCBS (tertiary)

DATA TYPE               COVERAGE              SOURCE    FRESHNESS
OHLCV prices            2010-present          KBS       Real-time (<5 min)
Financial statements    2012-present          VCI       Quarterly (30-45 day lag)
Financial ratios        2012-present          VCI/TCBS  Quarterly (30-45 day lag)
Real-time price board   Current session       KBS       Live
Symbol listings         Current               KBS       Daily
VN30 constituents       2014-present          Static    Semi-annual update
Industry classification Current               KBS       Quarterly

UNIVERSE
  HOSE: ~400 stocks (So Giao dich Chung khoan TP.HCM)
  HNX:  ~350 stocks (So Giao dich Chung khoan Ha Noi)
  UPCOM: ~900 stocks (Unlisted Public Company Market)
  Total: ~1,700 stocks

INDICES
  VN-Index, VN30, HNX-Index, UPCOM-Index

Data source: vnstock library | Cache: data/cache/
```

## Coverage Check

`/datasets coverage VCB`

```
Data Coverage: VCB (Vietcombank)
=================================
Exchange: HOSE | VN30 Member | Sector: Banking

Data Type           Available Period      Records    Gaps
OHLCV prices        2010-01-04 - today    ~3,800     None
Balance sheet        2012-Q1 - 2025-Q3    56 qtrs    None
Income statement     2012-Q1 - 2025-Q3    56 qtrs    None
Cash flow            2012-Q1 - 2025-Q3    56 qtrs    None
Financial ratios     2012-Q1 - 2025-Q3    56 qtrs    None

Latest available: 2025-Q3 (Q4 2025 not yet filed, expected by 2026-03-15)
Price data freshness: Real-time (KBS)

Sufficient for: L1-L5 analysis, backtesting (14+ years), seasonal studies
```

## Freshness Report

`/datasets freshness`

```
Data Freshness Report
======================
As of: 2026-02-21 14:30 ICT

Data Type           Last Updated    Staleness    Status
Real-time prices    2 min ago       <5 min       FRESH
Cached prices       45 min ago      <1 hour      FRESH
Financial stmts     2025-Q3         ~150 days    STALE (Q4 expected)
Financial ratios    2025-Q3         ~150 days    STALE (Q4 expected)
VN30 constituents   2026-01-20      32 days      OK (next review: Jul 2026)
Exchange listings   2026-02-20      1 day        FRESH

Notes:
- Vietnamese companies file financials 30-45 days after quarter end
- Q4 2025 financials expected between 2026-01-31 and 2026-03-15
- Real-time data requires active market hours (9:00-15:00 ICT)
```

## Gap Analysis

`/datasets gaps HPG`

```
Data Gaps: HPG (Hoa Phat Group)
================================

OHLCV prices: No gaps detected (2010-01-04 to present)
Financial statements:
  - 2012-Q2: Missing income statement (filed late, recovered from TCBS)
  - 2020-Q1: Balance sheet revision (original vs restated differ by 2.3%)

Recommendations:
  - Use restated 2020-Q1 data (TCBS source preferred)
  - Price analysis: Fully available, no restrictions
  - Financial analysis: Available from 2012-Q3 onwards (complete)
```

## Data Quality Notes

| Data Type  | Known Issues                                     | Mitigation                                 |
| ---------- | ------------------------------------------------ | ------------------------------------------ |
| Prices     | Source variance 1-2% between KBS/VCI             | Use KBS as primary, triangulate for L3+    |
| Financials | 30-45 day reporting lag                          | Mark analyses with data-as-of date         |
| Ratios     | Calculation methodology differs by source        | Standardize via data_helpers.py            |
| Listings   | Delistings may not be immediately reflected      | Cross-check with exchange announcements    |
| VN30       | Semi-annual rebalance causes composition changes | Use point-in-time membership for backtests |

## Integration

- **Data access:** Via `helpers/vnstock_helpers.py` and `.claude/skills/vnstock-data/vnstock_lib.py`
- **Cache:** `data/cache/` with TTL configured in `data_sources.yaml`
- **Schema:** Documented in `.knowledge/datasets/vnstock_default/schema.md`
- **Quirks:** Documented in `.knowledge/datasets/vnstock_default/quirks.md`

## Rules

1. **Transparency** - Always show data freshness and known limitations
2. **Vietnamese context** - Include Tet closures, reporting lag, exchange rules
3. **Actionable** - Tell users what analyses are possible given available data
4. **No false precision** - Mark stale data clearly

---

**Powered by AI Analyst Lab | aianalystlab.ai**
