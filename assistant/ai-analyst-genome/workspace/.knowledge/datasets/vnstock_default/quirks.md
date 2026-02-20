# Known Data Quirks — vnstock (Vietnamese Stock Market)

## Data Lag Issues

### Financial Statement Lag (HIGH IMPACT)

**Symptom:** Financial data appears outdated, missing recent quarters
**Cause:** Vietnamese companies have 30-45 day reporting delay from quarter end
**Impact:** Q4 2025 data may not appear until mid-February 2026
**Workaround:**

- Warn users when requesting recent financials (<45 days old)
- Use price data for real-time analysis, financials for historical context
- Flag queries like "Q4 2025 results" with: "⚠️ Q4 data may not be available yet (typical 30-45 day lag)"

### Real-Time Price Staleness (MEDIUM IMPACT)

**Symptom:** Price data shows slight delay from market
**Cause:** API propagation delay, especially during high-volume periods
**Impact:** Real-time prices may be 1-5 minutes old
**Workaround:**

- Display timestamp with all L1 price queries: "VNM: 82,500 VND (updated 14:35 ICT)"
- Warn if timestamp >5 min old: "⚠️ Price data is stale (updated 14:20 ICT), market may have moved"

## Source Variance Issues

### Data Source Differences (MEDIUM IMPACT)

**Symptom:** KBS, VCI, TCBS return slightly different values for same metric
**Cause:** Different calculation methods, rounding, or data feeds
**Impact:** P/E ratio may differ by ±1-2% across sources
**Workaround:**

- Use KBS as primary (most complete coverage)
- Triangulate if variance >2%: "ℹ️ KBS: 15.2, VCI: 15.8 (3.9% variance) - using KBS"
- Log variance in validation report

### Ratio Calculation Differences (LOW IMPACT)

**Symptom:** Same company shows different P/E, P/B across sources
**Cause:** Different denominator definitions (trailing vs forward, diluted vs basic shares)
**Impact:** Absolute values differ, but trends align
**Workaround:**

- Stick to one source for comparative analysis
- Document ratio definition in outputs: "P/E (trailing 12 months, basic shares)"

## Coverage Gaps

### Delisted Stocks (MEDIUM IMPACT)

**Symptom:** Historical data exists but incomplete, symbol lookup fails
**Cause:** Stock was delisted, no longer actively traded
**Impact:** Cannot get recent data, historical may have gaps
**Workaround:**

- Check static/exchange_listings.csv for delisting status
- Display: "ℹ️ [SYMBOL] was delisted on [DATE], using historical data only"
- Exclude from VN30/index analysis

### Missing Historical Data (LOW IMPACT)

**Symptom:** Some stocks lack data before 2015 despite being listed earlier
**Cause:** Data vendor coverage limitations
**Impact:** Long-term trend analysis limited
**Workaround:**

- Check data availability before running 5-10 year analyses
- Fall back to available date range: "Data available from 2015-01-01 (requested 2010-01-01)"

### Incomplete Ratio Coverage (LOW IMPACT)

**Symptom:** Some stocks missing specific ratios (e.g., ROE for banks)
**Cause:** Industry-specific metrics, not all ratios apply to all sectors
**Impact:** Filter queries may exclude valid stocks
**Workaround:**

- Check for nulls before filtering
- Offer alternative metrics: "ROE not available for financial sector, use ROA instead"

## Vietnamese Market Specifics

### Daily Price Limits (HIGH IMPACT)

**Symptom:** Price hits ceiling/floor and stops moving
**Cause:** HOSE/HNX: ±7% daily limit, UPCOM: ±15%
**Impact:** Cannot assess "true" price discovery, volume spikes at limits
**Workaround:**

- Detect price limit hits: closing price exactly ±7% from previous close
- Display: "ℹ️ Stock hit daily price limit (+7%), may continue tomorrow"
- Flag for caution in momentum strategies

### Volume Spikes (MEDIUM IMPACT)

**Symptom:** Volume suddenly 10x+ average
**Cause:** Corporate actions, news, or manipulation
**Impact:** Distorts moving averages, liquidity metrics
**Workaround:**

- Flag if volume >10x average: "⚠️ Volume spike detected (10x average), verify if event-driven"
- Exclude outliers from moving averages if user confirms anomaly

### Currency (VND) Large Numbers (LOW IMPACT)

**Symptom:** Numbers appear huge (82,500 VND vs $3.45 USD)
**Cause:** VND is low-denomination currency
**Impact:** User confusion, chart readability
**Workaround:**

- Always display currency: "82,500 VND" (never just "82,500")
- Use thousands separators: "82,500" not "82500"
- For market cap, use billions: "Market Cap: 245 billion VND"

### Timezone (ICT = UTC+7) (LOW IMPACT)

**Symptom:** Trading hours appear offset from user's local time
**Cause:** Market operates in ICT timezone
**Impact:** Confusion for international users
**Workaround:**

- Always display ICT timestamps: "14:35 ICT"
- Convert to UTC if user requests: "14:35 ICT (07:35 UTC)"

## Data Quality Auto-Fixes

### Null Values (Applied Automatically)

**Detection:** Check for missing values in critical columns (price, volume)
**Auto-Fix:**

- Forward-fill up to 3 days (for holidays, non-trading days)
- Flag if >3 days: "⚠️ Missing data for 5 days (2026-01-15 to 2026-01-19), may indicate suspension"
  **User Notification:** "✓ Auto-fixed: Forward-filled 3 missing price values (0.1% of data)"

### Duplicate Rows (Applied Automatically)

**Detection:** Exact duplicates (same symbol, date, all values)
**Auto-Fix:** Remove duplicates, keep first occurrence
**User Notification:** "✓ Auto-fixed: Removed 2 duplicate rows"

### Out-of-Range Values (Flagged, Not Auto-Fixed)

**Detection:** Price ≤0, volume <0, P/E <0 or >1000
**Action:** Flag as RED, do not auto-fix
**User Notification:** "⚠️ Data quality issue: [SYMBOL] has negative price on [DATE], verify data source"

## Expected Ranges (Vietnamese Market Context)

| Metric    | Typical Range       | Flag If                                  |
| --------- | ------------------- | ---------------------------------------- |
| P/E Ratio | 5-30                | <0 (loss-making) or >50 (overvalued)     |
| P/B Ratio | 0.5-5               | <0 (negative equity) or >10              |
| ROE       | 5%-25%              | <0% (unprofitable) or >50% (suspicious)  |
| Volume    | 100k-10M shares/day | <1k (illiquid) or >100M (unusual)        |
| Price     | 1,000-500,000 VND   | <100 VND (penny stock) or >1M VND (rare) |

## Cache Behavior

### Cache Staleness Warnings

- **Real-time prices:** Warn if cached >5 minutes
- **Daily OHLCV:** Warn if cached >1 hour
- **Financials:** Warn if cached >24 hours
- **Ratios:** Warn if cached >24 hours

### Cache Fallback

- If API fails, use cache with staleness warning
- If cache empty, use static fallback (vn30_constituents.csv, exchange_listings.csv)
- Display: "⚠️ Using static fallback (last updated 2026-02-15), data may be outdated"

## Known Bugs/Limitations

1. **UPCOM symbols sometimes fail lookup** — Retry with HNX source if KBS fails
2. **Weekend data returns Friday close** — Expected behavior, not a bug
3. **Financial statements in Vietnamese** — Translation not yet implemented (Phase 2)
4. **No intraday data <1 day** — vnstock limitation, use daily OHLCV only

---

**Last Updated:** 2026-02-21
**Review Frequency:** Quarterly (or when new quirks discovered)
**Maintained By:** Validation Agent (Layer 1: Data Quality)
