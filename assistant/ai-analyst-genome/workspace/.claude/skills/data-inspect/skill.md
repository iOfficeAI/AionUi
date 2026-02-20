# Data Inspect Skill

# Show Active Schema

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/data-inspect` command
- When user asks about available columns, data types, or schema

## Command

`/data-inspect` - Show active dataset schema summary
`/data-inspect [table]` - Show specific table/data type schema
`/data-inspect columns` - List all available columns

## Purpose

Display the schema, columns, data types, and expected ranges for the currently active dataset. Reads from `.knowledge/datasets/[active]/schema.md`.

## Output

`/data-inspect`

```
Active Dataset: vnstock_default
================================
Platform: vnstock | Source: KBS (primary)

DATA TYPES AVAILABLE:
  prices       OHLCV daily prices (2010-present)
  financials   Balance sheet, income, cash flow (quarterly)
  ratios       P/E, P/B, ROE, ROA, EPS, etc. (quarterly)
  listings     Symbol info, exchange, sector, industry

KEY COLUMNS:
  prices:     date, open, high, low, close, volume, symbol
  financials: period, revenue, net_income, total_assets, equity, ...
  ratios:     period, pe, pb, roe, roa, eps, debt_equity, ...

REGISTERED METRICS:
  pe_ratio, pb_ratio, roe, market_cap

For detailed schema: /data-inspect prices
For deep profiling: /profile
```

## Rules

1. **Read from .knowledge** - Use cached schema, not live API
2. **Show ranges** - Include expected value ranges for key columns
3. **Vietnamese labels** - Include Vietnamese column name translations
4. **Suggest next** - Point users to /profile for deeper inspection

---

**Powered by AI Analyst Lab | aianalystlab.ai**
