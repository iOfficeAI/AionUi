# Dataset Schema -- vnstock_default

## Vietnamese Stock Market Data via vnstock Library

### 1. OHLCV Price Data (fetch_quote)

| Column | Type     | Description             | Expected Range        |
| ------ | -------- | ----------------------- | --------------------- |
| time   | datetime | Trading date            | 2010-01-01 to present |
| open   | float    | Opening price (VND)     | > 0, < 1,000,000      |
| high   | float    | Highest price (VND)     | >= open, >= close     |
| low    | float    | Lowest price (VND)      | <= open, <= close     |
| close  | float    | Closing price (VND)     | > 0, < 1,000,000      |
| volume | int      | Trading volume (shares) | >= 0                  |

**Constraints:**

- `low <= open <= high`
- `low <= close <= high`
- Daily change limited to +-7% (HOSE/HNX) or +-15% (UPCOM)
- Weekend/holiday gaps are normal (2-5 day gaps)

**Source function:** `vnstock_lib.fetch_quote(symbol, start, end, interval, source)`

---

### 2. Financial Statements (fetch_balance_sheet, fetch_income_statement, fetch_cash_flow)

| Column   | Type  | Description                                      |
| -------- | ----- | ------------------------------------------------ |
| item     | str   | Line item name (e.g., "Total assets", "Revenue") |
| item_id  | str   | Unique identifier for the line item              |
| {period} | float | Value for each period (e.g., "2025-Q4", "2024")  |

**Period columns are dynamic:** Each column after `item_id` represents a reporting period (e.g., "2025-Q4", "2025-Q3", "2024", "2023").

**Balance Sheet items include:**

- Total assets, Current assets, Non-current assets
- Total liabilities, Current liabilities, Long-term liabilities
- Shareholders' equity, Retained earnings
- Constraint: Assets = Liabilities + Equity (within 0.1%)

**Income Statement items include:**

- Revenue (Doanh thu), Cost of goods sold
- Gross profit, Operating profit
- Net income (Loi nhuan rong)
- Earnings per share (EPS)

**Cash Flow items include:**

- Cash from operations, Cash from investing
- Cash from financing, Net change in cash
- Beginning cash, Ending cash

**Source functions:**

- `vnstock_lib.fetch_balance_sheet(symbol, period, source)`
- `vnstock_lib.fetch_income_statement(symbol, period, source)`
- `vnstock_lib.fetch_cash_flow(symbol, period, source)`

---

### 3. Financial Ratios (fetch_ratios)

| Column   | Type  | Description                     |
| -------- | ----- | ------------------------------- |
| item     | str   | Ratio name (e.g., "ROE", "P/E") |
| item_id  | str   | Unique identifier               |
| {period} | float | Value for each period           |

**Common ratios available:**
| Ratio | Typical Range (Vietnamese Market) | Unit |
|-------|----------------------------------|------|
| P/E | 5-30 (blue chips 10-20) | x |
| P/B | 0.5-5 (blue chips 1-3) | x |
| ROE | 5-25% (banks 15-25%) | % |
| ROA | 1-10% (banks 1-3%) | % |
| EPS | varies widely | VND |
| Dividend Yield | 2-8% | % |
| Debt/Equity | 0-3 (varies by sector) | x |
| Current Ratio | 0.5-3 | x |
| Gross Margin | 10-60% | % |
| Net Margin | 5-30% | % |

**Source function:** `vnstock_lib.fetch_ratios(symbol, period, source)`

---

### 4. Price Board (fetch_price_board)

Real-time price snapshot. Column names vary by source (KBS/VCI/TCBS).

**Common columns:**
| Column | Type | Description |
|--------|------|-------------|
| symbol / listing_symbol | str | Stock ticker |
| match_price / last | float | Last traded price |
| match_vol / match_volume | int | Volume at last price |
| ceiling | float | Daily price ceiling |
| floor | float | Daily price floor |
| ref_price / reference | float | Reference (previous close) |

**Source function:** `vnstock_lib.fetch_price_board(symbols_list, source)`

---

### 5. Symbol Listings (list_symbols)

| Column        | Type | Description                         |
| ------------- | ---- | ----------------------------------- |
| ticker        | str  | Stock ticker (e.g., "VCB")          |
| organ_name    | str  | Company name (may be in Vietnamese) |
| exchange      | str  | Exchange: HOSE, HNX, UPCOM          |
| industry_code | str  | Industry classification             |

**Note:** When filtered by group (e.g., VN30), may return a Series instead of DataFrame. The `list_symbols()` wrapper normalizes this to always return a DataFrame with at least a `ticker` column.

**Source function:** `vnstock_lib.list_symbols(exchange, industry, group, source)`

---

### Data Relationships

```
Symbol (ticker)
  |
  +-- OHLCV prices (time series, one row per trading day)
  |
  +-- Balance Sheet (one row per line item, columns are periods)
  |
  +-- Income Statement (one row per line item, columns are periods)
  |
  +-- Cash Flow (one row per line item, columns are periods)
  |
  +-- Financial Ratios (one row per ratio, columns are periods)
  |
  +-- Price Board (real-time snapshot, one row per symbol)
```

---

**Last Updated:** 2026-02-21
**Maintained By:** Data Explorer Agent
