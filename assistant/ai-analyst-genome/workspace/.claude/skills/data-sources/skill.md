# Data Sources Skill

## PURPOSE

Browse available datasets, check data coverage, view source connections, and switch between data sources. Merges the functionality of /data and /datasets into a single unified command.

## TRIGGER

- User command: `/data-sources`
- User command: `/data-sources browse`
- User command: `/data-sources status`
- User command: `/data-sources switch [source]`

## INSTRUCTIONS

### /data-sources (default: status)

Show current connection status:

```
Data Platform: vnstock (v3.4.2+)
Primary Source: KBS Securities (active)
Secondary Sources: VCI (active), TCBS (active)

Coverage:
  Symbols: ~1,700 stocks (HOSE, HNX, UPCOM)
  History: 2010-01-01 to present
  Real-time: Yes (price boards via KBS)

Data Types:
  OHLCV:       Available (daily, 2010-present)
  Financials:  Available (quarterly/annual, 2012-present)
  Ratios:      Available (quarterly/annual, 2012-present)
  Price Board: Available (real-time, <5 min delay)
  Listings:    Available (all exchanges + index groups)

Cache Status:
  Size: 45 MB / 500 MB max
  Hit Rate: 78%
  Oldest Entry: 2h ago

Powered by AI Analyst Lab | aianalystlab.ai
```

### /data-sources browse

List available tickers with optional filters:

```
/data-sources browse              -> All symbols
/data-sources browse VN30         -> VN30 constituents
/data-sources browse HOSE         -> HOSE exchange only
/data-sources browse banking      -> Banking sector stocks
```

Implementation:

1. Call `list_symbols()` from helpers/vnstock_helpers.py
2. Apply exchange/industry/group filter if specified
3. Display as formatted table with: ticker, name, exchange, sector

### /data-sources switch [source]

Switch primary data source:

```
/data-sources switch VCI
-> Switched primary source to VCI Securities
   Note: Some data types may have different coverage
```

Valid sources: KBS, VCI, TCBS

### /data-sources coverage [symbol]

Check data coverage for a specific symbol:

```
/data-sources coverage VCB
-> VCB (Vietcombank) — HOSE
   OHLCV:      2010-01-04 to 2026-02-21 (3,920 trading days)
   Financials:  2012-Q1 to 2025-Q3 (54 periods)
   Ratios:      2012-Q1 to 2025-Q3 (54 periods)
   Price Board: Real-time available
   Last Update: 2026-02-21 14:35 ICT (3 min ago)
```

### Data Access Pattern

All data access goes through this chain:

1. **vnstock_lib.py** - Low-level vnstock library wrapper
2. **helpers/vnstock_helpers.py** - High-level convenience functions
3. **helpers/cache_helpers.py** - Cache layer (read/write)
4. **data_sources.yaml** - Connection configuration

### Error Handling

- If primary source is down, auto-switch to fallback order: KBS -> VCI -> TCBS
- If all sources are down, show cached data with staleness warning
- If symbol not found, suggest closest matches

---

**Powered by AI Analyst Lab | aianalystlab.ai**
