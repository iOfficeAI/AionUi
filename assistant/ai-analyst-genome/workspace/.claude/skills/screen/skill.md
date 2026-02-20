# Screen Skill

# Multi-Stock Screening

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/screen` command
- When user asks to filter or screen stocks by criteria
- L3+ queries involving multi-stock filtering

## Command

`/screen [criteria]` - Screen stocks by criteria
`/screen presets` - Show built-in screening presets
`/screen [preset_name]` - Run a preset screen
`/screen save [name]` - Save current criteria as preset

## Purpose

Quickly filter the Vietnamese stock universe (~1,700 stocks) by fundamental, valuation, and performance criteria. Returns a ranked list with key metrics and data quality indicators.

## Syntax

### Simple Criteria

```
/screen PE < 15 AND ROE > 20%
/screen market_cap > 10000B AND sector = "Banking"
/screen price_change_1y > 30% AND volume_avg > 500000
```

### Compound Criteria

```
/screen PE < 15 AND ROE > 20% AND debt_equity < 1.5 AND exchange = "HOSE"
```

### With Sorting

```
/screen PE < 15 AND ROE > 20% SORT BY ROE DESC LIMIT 20
```

## Available Metrics

### Valuation

| Metric         | Syntax             | Description                    |
| -------------- | ------------------ | ------------------------------ |
| P/E ratio      | `PE` or `pe_ratio` | He so gia tren thu nhap        |
| P/B ratio      | `PB` or `pb_ratio` | He so gia tren gia tri so sach |
| EV/EBITDA      | `ev_ebitda`        | Enterprise value / EBITDA      |
| Dividend yield | `div_yield`        | Ty suat co tuc                 |

### Fundamentals

| Metric         | Syntax          | Description                          |
| -------------- | --------------- | ------------------------------------ |
| ROE            | `ROE` or `roe`  | Ty suat sinh loi tren von chu so huu |
| ROA            | `ROA` or `roa`  | Ty suat sinh loi tren tong tai san   |
| EPS            | `EPS` or `eps`  | Thu nhap tren co phieu               |
| Debt/Equity    | `debt_equity`   | Ty le no tren von                    |
| Revenue growth | `rev_growth`    | Tang truong doanh thu                |
| Profit margin  | `profit_margin` | Bien loi nhuan                       |

### Market Data

| Metric           | Syntax                                 | Description                         |
| ---------------- | -------------------------------------- | ----------------------------------- |
| Market cap       | `market_cap`                           | Von hoa thi truong (in billion VND) |
| Volume (avg 20d) | `volume_avg`                           | Khoi luong giao dich binh quan      |
| Price change     | `price_change_1m`, `_3m`, `_6m`, `_1y` | Bien dong gia                       |

### Filters

| Filter   | Syntax     | Values                                 |
| -------- | ---------- | -------------------------------------- |
| Exchange | `exchange` | "HOSE", "HNX", "UPCOM"                 |
| Sector   | `sector`   | Banking, Technology, Real Estate, etc. |
| Index    | `index`    | "VN30", "VN100"                        |

## Built-in Presets

`/screen presets`

```
Available Screening Presets
============================

VALUE       PE < 15 AND PB < 1.5 AND ROE > 15%
            "Classic value stocks"

GROWTH      rev_growth > 20% AND profit_margin > 10% AND market_cap > 5000B
            "High growth companies"

DIVIDEND    div_yield > 5% AND PE < 20 AND debt_equity < 2
            "High dividend yield"

MOMENTUM    price_change_6m > 20% AND volume_avg > 200000
            "6-month momentum leaders"

QUALITY     ROE > 20% AND debt_equity < 1 AND profit_margin > 15%
            "High quality businesses"

VN30_VALUE  index = "VN30" AND PE < sector_avg AND ROE > sector_avg
            "Undervalued VN30 stocks"

BANKING     sector = "Banking" AND ROE > 18% AND PB < 2
            "Strong banks at reasonable valuations"

Usage: /screen VALUE  or  /screen BANKING
```

## Output Format

```
Stock Screen Results: PE < 15 AND ROE > 20%
=============================================
Found: 8 stocks (from 1,700 universe)
Exchange: All | Sorted by: ROE DESC

 #  Symbol  Name               Exchange  PE     ROE     PB    Market Cap
 1  TCB     Techcombank        HOSE      7.8x   22.1%   1.4x  135,200B VND
 2  ACB     Asia Commercial    HOSE      6.5x   21.3%   1.3x   89,500B VND
 3  VPB     VPBank             HOSE      5.2x   20.8%   1.1x  120,300B VND
 4  MBB     MB Bank            HOSE      6.1x   20.2%   1.5x  105,800B VND
 5  FPT     FPT Corp           HOSE      14.2x  19.5%   4.2x  185,600B VND
 6  CTG     VietinBank         HOSE      8.9x   18.8%   1.6x  145,200B VND
 7  BID     BIDV               HOSE      12.1x  18.2%   2.1x  198,500B VND
 8  STB     Sacombank          HOSE      9.3x   17.5%   1.2x   52,300B VND

Data as of: 2026-02-21 | Financials: Q3 2025 (30-45 day lag)

Tip: For deeper analysis, ask: "Analyze TCB, ACB, VPB fundamentals"
     For backtest, try: /backtest "Low PE + High ROE outperforms on HOSE"
```

## Rules

1. **Speed** - Return results in <10 seconds using cached data
2. **Data quality note** - Always show data freshness and reporting lag
3. **VND formatting** - Market cap in billion VND with comma separators
4. **Bilingual labels** - Include Vietnamese metric names where helpful
5. **No validation** - Screening is exploratory, not analytical
6. **Upsell analysis** - Suggest full pipeline for deeper investigation
7. **Survivorship warning** - Note if screening excludes delisted stocks

## Limitations

- Screens use latest available data (may have 30-45 day lag for financials)
- No forward-looking estimates (no analyst consensus data)
- No confidence scores on screen results
- For statistically rigorous analysis, use the full pipeline

---

**Powered by AI Analyst Lab | aianalystlab.ai**
