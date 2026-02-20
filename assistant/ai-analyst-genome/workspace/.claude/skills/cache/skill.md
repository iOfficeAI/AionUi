# Cache Skill

## PURPOSE

Manage the data cache for vnstock API responses. View cache status, clear stale entries, force refresh, and inspect cached data for specific symbols. Cache reduces API calls and provides fallback when sources are unavailable.

## TRIGGER

- User command: `/cache`
- User command: `/cache status`
- User command: `/cache clear`
- User command: `/cache refresh [symbol]`
- User command: `/cache [symbol]`

## INSTRUCTIONS

### /cache (default: status)

Display cache overview:

```
Cache Status
============
Storage:    data/cache/
Size:       45 MB / 500 MB max (9% used)
Entries:    342 cached queries
Hit Rate:   78% (last 100 queries)

TTL Settings:
  Real-time prices:  5 minutes
  Daily OHLCV:       60 minutes
  Financial data:    24 hours
  Ratios:            24 hours

Staleness Summary:
  Fresh (<TTL):       287 entries (84%)
  Stale (>TTL):       55 entries (16%)

Last Refresh: 2026-02-21 14:30 ICT (5 min ago)

Powered by AI Analyst Lab | aianalystlab.ai
```

### /cache clear

Clear all cached data:

```
/cache clear            -> Clear all cache
/cache clear prices     -> Clear price cache only
/cache clear financials -> Clear financial cache only
/cache clear ratios     -> Clear ratio cache only
/cache clear stale      -> Clear only stale entries (>TTL)
```

Confirmation required:

```
Clear all cached data? This will require fresh API calls.
[Y/n]:
```

After clearing:

```
Cache cleared: Removed 342 entries (45 MB freed)
Next queries will fetch from API.
```

### /cache refresh [symbol]

Force refresh data for a specific symbol from API:

```
/cache refresh VCB
-> Refreshing VCB data from KBS...
   Prices:     Updated (3,920 rows, 2.1 MB)
   Financials: Updated (54 periods, 0.3 MB)
   Ratios:     Updated (54 periods, 0.1 MB)
   Total time: 2.3s
```

Without symbol, refresh all stale entries:

```
/cache refresh
-> Refreshing 55 stale entries...
   [============================] 100% (55/55)
   Updated 55 entries in 45s
```

### /cache [symbol]

Inspect cached data for a specific symbol:

```
/cache VCB
-> Cached Data: VCB
   Prices:
     Rows: 3,920
     Range: 2010-01-04 to 2026-02-21
     Size: 2.1 MB
     Age: 3 min (FRESH)
     Source: KBS

   Financials:
     Periods: 54
     Range: 2012-Q1 to 2025-Q3
     Size: 0.3 MB
     Age: 12 hours (FRESH)
     Source: KBS

   Ratios:
     Periods: 54
     Range: 2012-Q1 to 2025-Q3
     Size: 0.1 MB
     Age: 12 hours (FRESH)
     Source: KBS
```

### Cache Storage

Cache files stored as Parquet in:

```
data/cache/
  quotes/{symbol}_{source}_{interval}.parquet
  financials/{symbol}_{source}_{period}.parquet
  ratios/{symbol}_{source}_{period}.parquet
```

### Cache Key Generation

```python
cache_key = f"{query_type}_{symbol}_{source}_{params_hash}"
# Example: "quote_VCB_KBS_1D_abc123"
```

### TTL Logic (from data_sources.yaml)

| Data Type            | TTL      | Rationale                           |
| -------------------- | -------- | ----------------------------------- |
| Real-time prices     | 5 min    | Must be fresh for L1 queries        |
| Daily OHLCV          | 60 min   | Intraday updates not critical       |
| Financial statements | 24 hours | Changes only quarterly              |
| Financial ratios     | 24 hours | Changes only quarterly              |
| Symbol listings      | 7 days   | Changes only during index rebalance |

### Fallback Chain

When API is unavailable:

1. Check cache (even if stale)
2. If cache exists: use with staleness warning
3. If cache empty: check static fallback (data/static/\*.csv)
4. If no fallback: return error with recovery suggestions

---

**Powered by AI Analyst Lab | aianalystlab.ai**
