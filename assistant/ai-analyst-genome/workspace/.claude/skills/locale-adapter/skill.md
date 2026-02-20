# Locale Adapter Skill

## PURPOSE

Format all outputs for Vietnamese market context: VND currency formatting, ICT timezone, bilingual labels (English + Vietnamese), and number formatting conventions. Automatically applied to every output.

## TRIGGER

- Auto-applied on **every output** that contains numbers, dates, or market terminology
- Internal skill (no user command)

## INSTRUCTIONS

### Currency Formatting (VND)

Always format Vietnamese Dong with:

- Thousands separator: comma
- No decimal places for VND amounts
- Currency suffix: "VND"
- For large numbers, use "billion VND" (ty VND)

**Examples:**

```
82,500 VND                    (stock price)
1,245,000 VND                 (high-value stock)
245.3 billion VND             (market cap)
12,500 billion VND            (revenue)
```

**Rules:**

- Stock prices: always show full number with commas (82,500 VND)
- Market cap: use "billion VND" if > 1 billion (245.3 billion VND)
- Revenue/assets: use "billion VND" if > 1 billion
- Never show VND with decimal places (82,500 VND, NOT 82,500.00 VND)
- For percentage changes: use 1 decimal place (+1.8%)

### Number Formatting

| Type        | Format                       | Example           |
| ----------- | ---------------------------- | ----------------- |
| Stock price | Comma-separated, no decimals | 82,500 VND        |
| Percentage  | 1 decimal place              | 15.2%             |
| Volume      | Comma-separated, no decimals | 3,245,600         |
| P/E ratio   | 1 decimal place              | 15.2x             |
| P/B ratio   | 2 decimal places             | 1.85x             |
| ROE         | 1 decimal place              | 18.5%             |
| Market cap  | Billions with 1 decimal      | 245.3 billion VND |
| EPS         | No decimals                  | 5,230 VND         |

### Date/Time Formatting

- **Date:** ISO format: `2026-02-21`
- **DateTime:** With ICT timezone: `2026-02-21 14:35 ICT`
- **Period:** Quarter format: `2025-Q3` or `Q3 2025`
- **Relative:** "3 min ago", "12 hours ago", "yesterday"

Trading hours reference: 09:00-11:30, 13:00-14:45 ICT (Mon-Fri)

### Bilingual Labels

Provide English primary with Vietnamese in parentheses for key market terms:

| English        | Vietnamese                           | Combined Label                             |
| -------------- | ------------------------------------ | ------------------------------------------ |
| VN30           | Ro chi so 30 co phieu                | VN30 (Ro chi so 30 co phieu)               |
| HOSE           | So Giao dich Chung khoan TP.HCM      | HOSE (So Giao dich Chung khoan TP.HCM)     |
| HNX            | So Giao dich Chung khoan Ha Noi      | HNX (So Giao dich Chung khoan Ha Noi)      |
| UPCOM          | Thi truong Dang ky Giao dich         | UPCOM (Thi truong Dang ky Giao dich)       |
| P/E Ratio      | He so gia tren thu nhap              | P/E (He so gia tren thu nhap)              |
| P/B Ratio      | He so gia tren gia tri so sach       | P/B (He so gia tren gia tri so sach)       |
| ROE            | Ty suat sinh loi tren von chu so huu | ROE (Ty suat sinh loi tren von chu so huu) |
| Market Cap     | Von hoa thi truong                   | Market Cap (Von hoa thi truong)            |
| Revenue        | Doanh thu                            | Revenue (Doanh thu)                        |
| Net Income     | Loi nhuan rong                       | Net Income (Loi nhuan rong)                |
| Dividend Yield | Ty suat co tuc                       | Dividend Yield (Ty suat co tuc)            |
| Volume         | Khoi luong giao dich                 | Volume (Khoi luong giao dich)              |

### Greeting

First interaction greeting:

```
Xin chao! Welcome to your Vietnamese Stock Market Analyst.
```

### Color Coding (Vietnamese Convention)

- **Green (#059669):** Positive / up / gain — consistent with Vietnamese market display
- **Red (#DC2626):** Negative / down / loss
- **Amber (#D97706):** Neutral / warning / unchanged

Note: Vietnamese stock market convention uses green for up and red for down (same as international convention used by HOSE/HNX electronic boards).

### Chart Labels

When generating charts:

- X-axis dates: `YYYY-MM` or `YYYY-MM-DD`
- Y-axis prices: `VND` suffix with comma separators
- Y-axis percentages: `%` suffix with 1 decimal
- Title: English (bilingual Vietnamese subtitle optional)
- Legend: English primary
- Attribution footer: "Powered by AI Analyst Lab | aianalystlab.ai"

### Significant Figures

| Data Type         | Precision            | Example    |
| ----------------- | -------------------- | ---------- |
| Stock price       | 0 decimals           | 82,500 VND |
| P/E, EV/EBITDA    | 1 decimal            | 15.2x      |
| P/B               | 2 decimals           | 1.85x      |
| ROE, ROA, margins | 1 decimal            | 18.5%      |
| Volume            | 0 decimals           | 3,245,600  |
| Returns           | 1 decimal            | +12.3%     |
| Market cap        | 1 decimal (billions) | 245.3B VND |
| Confidence score  | 0 decimals           | 95         |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
