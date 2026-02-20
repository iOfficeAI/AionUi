# Explore Skill

# Quick Interactive Data Exploration

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/explore` command
- For quick ad-hoc data lookups without full pipeline
- Useful for hypothesis formation and sanity checks

## Command

`/explore [symbol]` - Quick overview of a stock
`/explore [symbol] [metric]` - Specific metric for a stock
`/explore sector [sector_name]` - Sector overview
`/explore top [metric] [n]` - Top N stocks by metric
`/explore compare [sym1] [sym2] [metric]` - Quick comparison

## Purpose

Provide rapid, lightweight data exploration without invoking the full analysis pipeline. Think of it as a "data REPL" for quick questions that don't need validation, narrative, or presentation.

## Commands

### Stock Overview

`/explore VCB`

```
VCB (Vietcombank) - Quick Overview
===================================
Exchange: HOSE | Sector: Banking | VN30 Member

Price: 82,500 VND (+1.85% today)
Volume: 3.2M shares (avg 20d: 2.8M)

Valuation:
  P/E: 15.2x (sector avg: 12.8x)
  P/B: 2.8x (sector avg: 1.5x)

Fundamentals:
  ROE: 18.5% | ROA: 1.8%
  EPS (TTM): 5,428 VND

Performance:
  1M: +3.2% | 3M: -5.1% | 6M: +8.7% | 1Y: +15.3%

Data freshness: Real-time (updated 2 min ago)
```

### Metric Deep Dive

`/explore VCB pe_ratio`

```
VCB P/E Ratio History
=====================
Current: 15.2x
1Y avg: 14.8x | 2Y avg: 13.9x | 5Y avg: 12.5x

Recent trend: Expanding (rising from 12.1x in Jan 2025)
Sector comparison: Premium (+19% above sector avg 12.8x)
Historical percentile: 72nd (above average but not extreme)
```

### Top N

`/explore top roe 10`

```
Top 10 Stocks by ROE (HOSE)
============================
 1. TCB  22.1%  (Banking)
 2. ACB  21.3%  (Banking)
 3. VPB  20.8%  (Banking)
 4. MBB  20.2%  (Banking)
 5. FPT  19.5%  (Technology)
 6. VCB  18.5%  (Banking)
 7. MWG  17.8%  (Retail)
 8. PNJ  17.2%  (Retail)
 9. VNM  16.9%  (Consumer)
10. HPG  16.1%  (Materials)

Note: Banking sector dominates high-ROE rankings
Data: Latest available (may have 30-45 day lag for Q4 2025)
```

### Quick Comparison

`/explore compare VCB TCB pe_ratio`

```
P/E Comparison: VCB vs TCB
===========================
VCB: 15.2x | TCB: 8.2x
Difference: 7.0x (VCB at 85% premium)
Sector avg: 12.8x

VCB above average (+19%)
TCB below average (-36%)

Note: VCB's premium historically attributed to SOE status and lower NPL ratio.
For detailed analysis, use: "Compare VCB and TCB P/E ratios"
```

## Rules

1. **Speed over depth** - Return results in <5 seconds
2. **No validation** - This is exploratory, no Layer 1-4 checks
3. **No CIs** - Quick lookup, not statistical analysis
4. **Data freshness note** - Always show when data was last updated
5. **Upsell full analysis** - Suggest full pipeline when appropriate
6. **Cache-first** - Use cached data for speed

## Limitations

- No confidence scores (this is quick exploration, not analysis)
- No Simpson's Paradox checks
- No statistical tests
- Not suitable for investment decisions (use full pipeline)

---

**Powered by AI Analyst Lab | aianalystlab.ai**
