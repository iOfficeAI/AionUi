<!-- officecli: v1.0.24 -->

# Creating a Data Dashboard

Complete guide for building a professional Excel dashboard from CSV or tabular data. Follow this step by step.

---

## Section A: Overview and Decision Logic

### A.1 What You Will Build

A single `.xlsx` file with two sheets:

1. **Sheet1 (Data)** -- Imported CSV data with frozen headers, AutoFilter, column widths, and conditional formatting on key columns.
2. **Dashboard** -- KPI cards (formula-driven), sparklines, charts (linked to data via cell range references), and preset styling.

Three non-negotiable principles:

- **All KPI values are formulas**, never hardcoded numbers
- **All charts use cell range references**, never inline data
- **Dashboard is the active sheet on open**, formulas recalculate on open

### A.2 Analyze the Input Data (MANDATORY FIRST STEP)

Before writing any commands, examine the CSV:

1. **Count rows and columns** in the CSV
2. **Identify column types:**
   - Date/time (the usual X-axis / primary dimension)
   - Numeric: currency, count, rate, percentage
   - Categorical: text labels (region, product, department)
3. **Determine the primary dimension** -- what the X-axis will be (usually date or category)
4. **Note the row count** -- this determines output complexity (see A.3)

### A.2b Handling Multi-Dimensional Data (MANDATORY CHECK)

> **DETECTION:** After Step A.2, check if any categorical column has repeating values (e.g., "North" appears in multiple rows, or "Q1" appears for every department). If YES, your data is multi-dimensional -- you MUST follow this section. Skipping this leads to noisy, unreadable charts.

If the data has **multiple categorical dimensions** (e.g., region x category x date, or department x quarter), it is NOT a simple time series. Follow these guidelines:

1. **Identify the aggregation strategy.** Decide which dimension(s) are most important for the dashboard's purpose. Common patterns:
   - **Time + Category**: Aggregate across categories to show time trends (e.g., `SUMIFS` by date).
   - **Category + Subcategory**: Show totals per top-level category (e.g., revenue by region).
   - **Cross-tabulation**: If the user wants breakdowns by two dimensions, pick the primary one for charts and use KPIs for the secondary.

2. **KPI formulas for multi-dimensional data.** Use aggregation functions that work across the full dataset:
   - `=SUM(col)` for totals (works regardless of dimensions)
   - `=AVERAGEIFS(value_col, criteria_col, criteria)` for conditional averages
   - `=COUNTIF(col, criteria)` for counting categories
   - `=SUMIFS(value_col, criteria_col, criteria)` for conditional sums

   > **CRITICAL — numFmt for percentage results (Fix-2):** When writing `AVERAGEIFS` or other formulas to Summary sheet cells where the result is a percentage (e.g., conversion rate, churn rate), you MUST set `numFmt` at the same time. Without it, the cell displays as a raw float (e.g., `0.0983333`) instead of a readable percentage.
   >
   > ```bash
   > # When setting a percentage formula on Summary sheet, always include numFmt:
   > officecli set dashboard.xlsx "Summary!C2" --prop "formula==AVERAGEIFS(Data!C2:C100,Data!A2:A100,B2)" --prop numFmt="0.0%"
   > # Or in batch JSON:
   > # {"command":"set","path":"Summary!C2","props":{"formula":"=AVERAGEIFS(Data!C2:C100,Data!A2:A100,B2)","numFmt":"0.0%"}}
   > ```
   >
   > Common numFmt values for Summary sheet formula results:
   > | Result Type | numFmt |
   > |-------------|--------|
   > | Percentage (e.g., rate, ratio) | `0.0%` or `0%` |
   > | Currency | `$#,##0` or `#,##0` |
   > | Integer count | `#,##0` |
   > | Decimal | `#,##0.00` |

3. **Charts with multi-dimensional data.** When rows are not 1:1 with the X-axis (e.g., 20 rows per month across 4 regions x 5 categories):
   - Charts using raw cell ranges will show all rows (e.g., 200 data points). This is acceptable for scatter and line charts but may be noisy.
   - For aggregated views (e.g., "Revenue by Region"), create a **helper summary area** on the Dashboard sheet using `SUMIFS`/`AVERAGEIFS` formulas, then reference those cells as the chart data source.
   - Document any helper cells explicitly so the dashboard remains maintainable.

4. **Sparklines with multi-dimensional data.** Sparklines show 1D trends. If the data is cross-sectional (not a meaningful time series when read row-by-row), sparklines may not be useful. In that case, it is acceptable to skip sparklines even if the complexity table says "YES" or "Optional" -- add a comment explaining why.

5. **Hiding helper columns (MANDATORY).** If you create a helper summary area on the Dashboard sheet for chart data sources, the helper columns MUST be hidden before delivery. Exposed helper columns (raw numbers in columns I, J, K etc.) appear as clutter alongside the KPI cards and charts.

   > **CRITICAL — Chart data source MUST reference visible Summary sheet cells, NOT hidden columns.**
   > LibreOffice does not recalculate hidden column formulas at render time. If a chart's `series.values` points to a hidden helper column (even one with valid `SUMIFS`/`AVERAGEIFS` formulas), the chart will render as empty/blank because the formula results are never computed.
   >
   > **Correct pattern:**
   > 1. Write all aggregation formulas (`SUMIFS`, `AVERAGEIFS`) to a **visible** Summary sheet (a dedicated sheet, not hidden columns on Dashboard).
   > 2. Set chart `series.values` / `series.categories` to reference the **Summary sheet cells**.
   > 3. After charts are created and verified, you may hide the Summary sheet if desired — but verify charts still render before hiding.
   >
   > **Wrong pattern (causes blank charts):**
   > - Writing `SUMIFS` formulas to hidden Dashboard columns (e.g., `col[I]` → hidden)
   > - Pointing chart `series.values` to those hidden cells
   > - Chart data appears blank in LibreOffice/WPS because hidden column formulas are not evaluated

   **Option A — Use a dedicated Summary sheet (recommended to avoid blank charts):**
   ```bash
   officecli add dashboard.xlsx / --type sheet --prop name=Summary
   # Write aggregation formulas to Summary sheet (visible cells)
   # Point chart series.values to Summary sheet cells
   # Optionally hide Summary sheet after chart verification:
   officecli set dashboard.xlsx /Summary --prop hidden=true
   ```

   **Option B — Hide helper columns on Dashboard (ONLY if charts do NOT reference the hidden columns):**
   ```bash
   # Only hide columns that are NOT used as chart data sources
   officecli set dashboard.xlsx '/Dashboard/col[I]' --prop hidden=true
   officecli set dashboard.xlsx '/Dashboard/col[J]' --prop hidden=true
   # Repeat for each helper column used
   ```

   After hiding, verify with `officecli view dashboard.xlsx text` that only KPI cards and chart titles are visible on Dashboard.

### A.3 Data Size to Complexity Mapping

> **This table is the authoritative source for output complexity.** When any other text in this skill (including Core Concepts in SKILL.md) conflicts with this table, **this table wins.**

| Data Size | KPIs | Charts | Sparklines | CF Rules | Named Ranges | Preset |
|-----------|------|--------|------------|----------|--------------|--------|
| < 10 rows | 1-2 | 1 | NO | 0-1 | NO | minimal |
| 10-50 rows | 2-3 | 2 | Optional (time-series only) | 1-2 | NO | dashboard |
| 50-200 rows | 3-5 | 2-3 | YES (time-series only) | 2-3 | Optional | dashboard |
| 200+ rows | 3-5 | 3 | YES (time-series only) | 3-4 | Recommended | dashboard |

Sparkline column: "YES/Optional" applies only when data is a **sequential time series**. For cross-sectional or categorical data, skip sparklines regardless of row count (see Step 5 decision gate).

> **STOP here and plan.** Before writing any commands, write out:
> 1. How many KPIs? Which formulas?
> 2. How many charts? Which types? Which data columns?
> 3. Which CF rules? On which columns?
> 4. Chart layout positions (use the grid in A.5)

### A.4 Chart Type Selection Guide

| Data Pattern | Recommended Chart | Example |
|-------------|-------------------|---------|
| Trend over time (single series) | `line` | MRR over 12 months |
| Trend over time (multiple series) | `line` (multi-series) or `columnStacked` | Revenue components over time |
| Comparison across categories | `column` or `bar` | Revenue by region — for time-series data (dates, months, quarters in order), prefer `column` over `bar`; `bar` creates horizontal bars which make left-to-right time reading unnatural |
| Part-of-whole breakdown | `doughnut` or `pie` | Spend by category |
| Budget vs Actual | `combo` (bars + line) | Department budget performance |
| Correlation | `scatter` (see note below) | Price vs volume |

> **Scatter chart syntax differs from other charts.** Scatter charts do NOT use `series1.categories`. Instead, use `series1.xValues` for the X-axis data. Using `series1.categories` on a scatter chart produces an invalid `<cat>` element in the OOXML and will fail validation. See the scatter chart template in Step 6.

### A.5 Dashboard Layout Grid

```
Dashboard Sheet Layout:
+----------------------------------------------------------+
| Row 1-4: KPI Cards                                        |
|   A1: Label (9pt gray)  C1: Label  E1: Label  G1: Label  |
|   A2: Value (24pt bold) C2: Value  E2: Value  G2: Value  |
|   B2: Sparkline         D2: Spark  F2: Spark  H2: Spark  |
+----------------------------------------------------------+
| Row 5+: Charts (2-column grid)                             |
|  Left:  x=0,  y=5, width=10, height=15                    |
|  Right: x=11, y=5, width=10, height=15                    |
+----------------------------------------------------------+
| Row 21+: Additional charts (if needed)                     |
|  Left:  x=0,  y=21, width=10, height=15                   |
|  Right: x=11, y=21, width=10, height=15                   |
+----------------------------------------------------------+
```

---

## Section B: Step-by-Step Workflow

### Step 1: Create Workbook and Import Data

**Option A — Import from CSV (most common):**

```bash
officecli create dashboard.xlsx
officecli import dashboard.xlsx /Sheet1 --file data.csv --header
```

`--header` automatically sets freeze pane at A2 and AutoFilter. After import, note the **last data row number** (e.g., row 13 for 12 data rows + 1 header).

**Option B — Build data sheet from scratch (no CSV):**

```bash
officecli create dashboard.xlsx
officecli add dashboard.xlsx / --type sheet --prop name=Data
officecli remove dashboard.xlsx /Sheet1

officecli open dashboard.xlsx

# Write headers in row 1
cat <<'EOF' | officecli batch dashboard.xlsx
[
  {"command":"set","path":"/Data/A1","props":{"value":"Month","bold":"true"}},
  {"command":"set","path":"/Data/B1","props":{"value":"Revenue","bold":"true"}},
  {"command":"set","path":"/Data/C1","props":{"value":"Units","bold":"true"}},
  {"command":"set","path":"/Data/D1","props":{"value":"Target","bold":"true"}}
]
EOF

# Write data rows via batch — all values must be strings
cat <<'EOF' | officecli batch dashboard.xlsx
[
  {"command":"set","path":"/Data/A2","props":{"value":"Jan"}},
  {"command":"set","path":"/Data/B2","props":{"value":"120000"}},
  ...
]
EOF

# Set freeze pane manually (equivalent to import --header)
officecli set dashboard.xlsx /Data --prop freeze=A2
# Set AutoFilter — must target the sheet path, NOT a cell range path
# Use autoFilter=true to filter the full used range, or autoFilter=A1:D1 to specify a range
officecli set dashboard.xlsx /Data --prop autoFilter=A1:D1
```

> **Multi-sheet dashboards:** If your dashboard has multiple data sheets (e.g., Data + Expenses, or Sheet1 + KPIs), apply `freeze=A2` and `autoFilter` to **every** data sheet, not just the primary one. Applying these settings only to the primary sheet leaves secondary sheets without header lock and filter — inconsistent and unprofessional.
>
> ```bash
> # Apply to each additional data sheet
> officecli set dashboard.xlsx /Expenses --prop freeze=A2
> officecli set dashboard.xlsx /Expenses --prop autoFilter=A1:E1
> officecli set dashboard.xlsx /KPIs --prop freeze=A2
> officecli set dashboard.xlsx /KPIs --prop autoFilter=A1:C1
> ```

After setup, proceed with the same Step 2–10 workflow as the CSV path. Note the last data row number for formula ranges.

> **Sheet naming recommendation (Fix-3):** Rename the default `Sheet1` to a semantic name that reflects the data content (e.g., `Data`, `HR_Data`, `Sales_Raw`). This improves readability and makes formula references self-documenting.
>
> ```bash
> officecli set dashboard.xlsx "Sheet1!A1" --prop sheetName="Data"
> ```
>
> **Note:** After renaming, update ALL formulas that reference the old sheet name. For example, `=SUM(Sheet1!B2:B13)` must become `=SUM(Data!B2:B13)`. This includes Dashboard KPI formulas, chart series references, and CF rules. If you prefer to skip renaming to avoid this update burden, ensure the filename itself is descriptive.

**Then open in resident mode** before continuing. All subsequent steps (2–10) run in memory:

```bash
officecli open dashboard.xlsx   # (skip if already opened in Option B above)
# ... steps 2–10 ...
officecli close dashboard.xlsx
officecli validate dashboard.xlsx
```

---

### Step 2: Set Data Sheet Column Widths

`import --header` does NOT auto-size columns. Always set widths manually.

**Recommended widths by column type:**

| Content Type | Width |
|-------------|-------|
| Date (yyyy-mm-dd) | 14 |
| Currency ($#,##0) | 15 |
| Percentage (0.0%) | 12 |
| Short text | 15 |
| Long text | 20-25 |
| Integer / count | 12 |

**Individual commands:**

```bash
officecli set dashboard.xlsx '/Sheet1/col[A]' --prop width=14
officecli set dashboard.xlsx '/Sheet1/col[B]' --prop width=15
officecli set dashboard.xlsx '/Sheet1/col[C]' --prop width=15
officecli set dashboard.xlsx '/Sheet1/col[D]' --prop width=15
officecli set dashboard.xlsx '/Sheet1/col[E]' --prop width=12
```

**Date column fix:** If dates display as serial numbers (e.g., 45662 instead of 2025-01-15), apply a date number format to the **data cell range** (not the column — `numFmt` is not supported on `col[]` targets):

```bash
# CORRECT: apply numFmt to the data range
officecli set dashboard.xlsx '/Sheet1/A2:A13' --prop numFmt=yyyy-mm-dd

# WRONG: col[] does not support numFmt -- will fail with "UNSUPPORTED props: numFmt"
# officecli set dashboard.xlsx '/Sheet1/col[A]' --prop numFmt=yyyy-mm-dd
```

Common date formats: `yyyy-mm-dd`, `yyyy-mm`, `mm/dd/yyyy`, `mmm yyyy`.

Adjust the range (`A2:A13`) to match your actual data rows.

**Batch alternative** (for many columns):

```bash
officecli set dashboard.xlsx "/Sheet1/col[A]" --prop width=14
officecli set dashboard.xlsx "/Sheet1/col[B]" --prop width=15
officecli set dashboard.xlsx "/Sheet1/col[C]" --prop width=15
officecli set dashboard.xlsx "/Sheet1/col[D]" --prop width=15
officecli set dashboard.xlsx "/Sheet1/col[E]" --prop width=12
```

**Summary sheet column widths (MANDATORY when a Summary sheet exists):**

If your dashboard includes a Summary sheet (created in A.2b for multi-dimensional data aggregation), you MUST also set column widths on that sheet. The `col[]` auto-size behavior does NOT apply to formula-populated sheets.

> **Why this matters:** Summary sheets populated with `SUMIFS`/`AVERAGEIFS` formulas default to column width 8. Text labels (Channel, Department, Category, etc.) truncate; numeric values may show `###`. Always set widths after writing Summary data.

```bash
# Summary sheet column widths — set after writing all Summary formulas/data
# Text label column (first column: Category, Channel, Department, etc.)
officecli set dashboard.xlsx "/Summary/col[A]" --prop width=18
# Numeric value columns (adjust count to match actual column count)
officecli set dashboard.xlsx "/Summary/col[B]" --prop width=14
officecli set dashboard.xlsx "/Summary/col[C]" --prop width=14
officecli set dashboard.xlsx "/Summary/col[D]" --prop width=14
# General width guidance:
#   Text/label columns (A): 15-20
#   Numeric/value columns (B+): 12-15
```

If Summary has more columns, extend the pattern accordingly.

---

### Step 2b: Header Row Fill Colors (MANDATORY)

> **QUALITY BAR REQUIREMENT:** Every sheet with column headers MUST have a fill color applied to the header row. Failure to set header fill is a Quality Bar violation (Q2 fail).

Apply a dark background fill to row 1 of the Data sheet and Summary sheet. This makes the header row immediately distinguishable from data rows.

**Data sheet header row fill (dark blue with white text):**

```bash
# Data sheet header row fill
officecli set dashboard.xlsx '/Sheet1/A1:F1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true
```

Adjust the range (`A1:F1`) to match the actual number of columns in your data sheet.

**Summary sheet header fill (if Summary sheet exists):**

```bash
# Summary sheet header fill
officecli set dashboard.xlsx '/Summary/A1:E1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true
```

Adjust the range to match the actual number of columns in your Summary sheet.

**Recommended fill colors by tab color theme:**

| Tab Color Theme | fill | font.color |
|-----------------|------|------------|
| Blue (#4472C4) | `1F3864` | `FFFFFF` |
| Green (#70AD47) | `2E7B32` | `FFFFFF` |
| Gray (#A5A5A5) | `546E7A` | `FFFFFF` |
| Corporate dark | `37474F` | `FFFFFF` |

**In the Section C example**, the header fill commands appear immediately after Step 2 column widths:

```bash
# ── Step 2b: Header row fill colors (MANDATORY) ──
officecli set saas_dashboard.xlsx '/Sheet1/A1:E1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true
```

---

### Step 3: Add Dashboard Sheet

```bash
officecli add dashboard.xlsx / --type sheet --prop name=Dashboard
```

> **CRITICAL: Dashboard Architecture — Read Before Step 4**
>
> The Dashboard sheet MUST contain ALL visible content: KPI cards, charts, and the title area.
> Summary/Data sheets store data sources only — users will NOT look at these sheets.
>
> **Correct architecture:**
> ```
> Dashboard (what users see)
>   ← contains: KPI labels + values (rows 1-2) + charts (rows 5+)
>   ← all KPI values are formulas referencing Summary or Data sheets
> Summary (aggregated data — hidden from users)
>   ← contains: SUMIFS / AVERAGEIFS rollups, helper columns for charts
> Data / Sheet1 (raw data — hidden from users)
>   ← contains: imported CSV rows
> ```
>
> **WRONG:** Putting KPI values only in Summary/Data sheet and leaving Dashboard empty.
> **CORRECT:** KPI label cells (A1, C1, E1, G1) and KPI value cells (A2, C2, E2, G2) MUST be on the Dashboard sheet, with formulas like `=SUM(Sheet1!B2:B13)` pointing to the data sheet.
>
> If you are unsure which sheet a KPI value belongs to, ask: "Will the user see this cell when they open the file?" If yes, it belongs on Dashboard.

---

### Step 4: Build KPI Cells on Dashboard (batch)

Each KPI is a **label cell** (row 1) + **value cell** (row 2):

- Label: small gray text (`font.size=9`, `font.color=666666`)
- Value: large bold number with formula and numFmt (`font.size=24`, `bold=true`)

> **WARNING: Batch JSON values must ALL be strings.**
> CORRECT: `{"bold":"true","font.size":"24","numFmt":"$#,##0"}`
> WRONG: `{"bold":true,"font.size":24}` -- will fail with JSON deserialization error.

**Template for 4 KPIs:**

```bash
officecli set dashboard.xlsx /Dashboard/A1 --prop value="Total Revenue" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set dashboard.xlsx /Dashboard/A2 --prop "formula==SUM(Sheet1!B2:B13)" --prop numFmt='$#,##0' --prop font.size=24 --prop bold=true --prop font.color=2E7D32
officecli set dashboard.xlsx /Dashboard/C1 --prop value="Average Monthly" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set dashboard.xlsx /Dashboard/C2 --prop "formula==AVERAGE(Sheet1!B2:B13)" --prop numFmt='$#,##0' --prop font.size=24 --prop bold=true --prop font.color=2E7D32
officecli set dashboard.xlsx /Dashboard/E1 --prop value="Growth Rate" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set dashboard.xlsx /Dashboard/E2 --prop "formula==IFERROR((Sheet1!B13-Sheet1!B2)/Sheet1!B2,0)" --prop numFmt=0.0% --prop font.size=24 --prop bold=true --prop font.color=2E7D32
officecli set dashboard.xlsx /Dashboard/G1 --prop value="Latest Value" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set dashboard.xlsx /Dashboard/G2 --prop "formula==Sheet1!B13" --prop numFmt='$#,##0' --prop font.size=24 --prop bold=true --prop font.color=2E7D32
```

**Common KPI formulas:**

| KPI | Formula | numFmt |
|-----|---------|--------|
| Total | `=SUM(Sheet1!B2:B13)` | `$#,##0` |
| Average | `=AVERAGE(Sheet1!B2:B13)` | `$#,##0` |
| Max | `=MAX(Sheet1!B2:B13)` | `$#,##0` |
| Min | `=MIN(Sheet1!B2:B13)` | `$#,##0` |
| Count | `=COUNT(Sheet1!B2:B13)` | `#,##0` |
| Growth rate | `=IFERROR((Sheet1!B13-Sheet1!B2)/Sheet1!B2,0)` | `0.0%` |
| Average rate | `=AVERAGE(Sheet1!E2:E13)` | `0.0%` |
| Percentage change | `=IFERROR(Sheet1!B13/Sheet1!B12-1,0)` | `0.0%` |

Always wrap division formulas in `IFERROR` to prevent `#DIV/0!` errors.

---

### Step 4b: Set Dashboard Column Widths (MANDATORY)

> **CRITICAL: KPI values at font.size=24 + bold + numFmt WILL display as "###" if columns are too narrow.** You MUST set Dashboard column widths after creating KPI cells. This step is NOT optional.

KPI value columns (A, C, E, G) need width 22 to fit formatted numbers like `$6,320,000` or `0.0%` at 24pt bold. Sparkline columns (B, D, F, H) need width 12.

**Batch command (recommended):**

```bash
officecli set dashboard.xlsx "/Dashboard/col[A]" --prop width=22
officecli set dashboard.xlsx "/Dashboard/col[B]" --prop width=12
officecli set dashboard.xlsx "/Dashboard/col[C]" --prop width=22
officecli set dashboard.xlsx "/Dashboard/col[D]" --prop width=12
officecli set dashboard.xlsx "/Dashboard/col[E]" --prop width=22
officecli set dashboard.xlsx "/Dashboard/col[F]" --prop width=12
officecli set dashboard.xlsx "/Dashboard/col[G]" --prop width=22
officecli set dashboard.xlsx "/Dashboard/col[H]" --prop width=12
```

Adjust the number of columns to match your KPI count. For 5+ KPIs, add columns I and J:

```bash
  {"command":"set","path":"/Dashboard/col[I]","props":{"width":"22"}},
  {"command":"set","path":"/Dashboard/col[J]","props":{"width":"12"}}
```

**KPI card background fill (Quality Bar item):**

KPI cards on the Dashboard sheet SHOULD have a light background fill (e.g., `F0F4FF` for blue tint). This is a Quality Bar item — omitting it is a P2 quality deduction.

```bash
# Apply a light blue background to the KPI card area (rows 1-2)
officecli set dashboard.xlsx '/Dashboard/A1:H2' --prop fill=F0F4FF
```

Adjust the range to match your KPI column layout (e.g., `A1:J2` for 5 KPI pairs). This is separate from the large 24pt KPI value formatting — the fill is applied to the cell background, not the font.

---

### Step 5: Add Sparklines Next to KPIs

> **DECISION GATE: When to SKIP sparklines**
> - SKIP if data has **fewer than 10 rows** (too few points for a meaningful trend).
> - SKIP if data is **cross-sectional, not time-series** (e.g., regions, departments, products with no time ordering). Sparklines show 1D trends -- they are meaningless for categorical/cross-sectional data. Skip even if the complexity table says "YES" or "Optional."
> - INCLUDE only when rows represent a **sequential time series** (dates, months, quarters) with 10+ data points.

```bash
# Line sparkline next to KPI 1
officecli add dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=B2 \
  --prop range="Sheet1!B2:B13" \
  --prop type=line \
  --prop color=4472C4 \
  --prop highpoint=FF0000

# Column sparkline next to KPI 2
officecli add dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=D2 \
  --prop range="Sheet1!C2:C13" \
  --prop type=column \
  --prop color=4472C4

# Line sparkline next to KPI 3
officecli add dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=F2 \
  --prop range="Sheet1!E2:E13" \
  --prop type=line \
  --prop color=2E7D32

# Line sparkline next to KPI 4
officecli add dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=H2 \
  --prop range="Sheet1!B2:B13" \
  --prop type=line \
  --prop color=4472C4
```

Sparkline rules:
- Range must be 1D (single row or single column)
- Cross-sheet ranges work: `range="Sheet1!B2:B13"`
- Sparklines are add-only (cannot modify after creation)

---

### Step 6: Add Charts

> **STOP -- Multi-Dimensional Data Check:**
> If your data has **repeating values in the X-axis column** (e.g., the same department appearing 4 times for 4 quarters, or the same region appearing across multiple categories), do NOT chart raw rows directly. The chart will have noisy, repeating X-axis labels and be unreadable.
>
> **Go to Section A.2b** and create aggregation formulas on a **dedicated Summary sheet** BEFORE charting. Then reference those Summary sheet cells as chart data sources.
>
> **CRITICAL — Chart data sources must always reference visible cells.**
> Do NOT point `series.values` or `series.categories` to hidden columns, even if those columns contain valid formulas. LibreOffice does not evaluate hidden column formulas at render time, resulting in blank/empty charts. Always use a visible Summary sheet as the intermediary for aggregated chart data.

#### 6a: Cell Range References (MANDATORY Pattern)

> **CRITICAL: Always use cell range references, NEVER inline data.**
> CORRECT: `--prop series1.values="Sheet1!B2:B13" --prop series1.categories="Sheet1!A2:A13"`
> WRONG: `--prop series1="Revenue:100,200,300"` -- creates a static chart that cannot update.
>
> Exception: Only use inline data when data requires aggregation that cannot be expressed in Excel formulas (e.g., weekly rollup from daily data). Document the exception explicitly if used.

#### 6b: Undocumented Chart Properties (DeferredAddKeys)

These properties work on `add` ONLY. They are NOT in `--help` output. The agent cannot discover them -- they must be specified from this reference.

| Property | Syntax | When to Use |
|----------|--------|-------------|
| `preset` | `--prop preset=dashboard` | **EVERY chart.** Options: minimal, dark, corporate, magazine, dashboard, colorful, monochrome |
| `referenceline` | `--prop referenceline="value:color:label:dash"` | Budget targets, averages, thresholds |
| `trendline` | `--prop trendline=linear` | Time-series charts to show direction |
| `axisNumFmt` | `--prop axisNumFmt='$#,##0'` | Currency/percentage value axes |

**Reference line format variants:**
- `"125"` -- value only
- `"125:FF0000"` -- value + color
- `"125:FF0000:Target"` -- value + color + label
- `"125:FF0000:Target:dash"` -- value + color + label + dash style

> **The format is `value:color:label:dash`** (color BEFORE label). The parser treats the second field as a color. Putting a label in the second field causes `Invalid color value` errors.

**Trendline types:** `linear`, `exp`, `log`, `poly:N`, `movingAvg:N`

#### Chart Templates

> **WARNING: `series1.name=` is MANDATORY on every series.** If you omit the `.name` property, the chart legend will display generic labels like "Series1", "Series2", etc. This is unprofessional and unacceptable for any dashboard. Always set a descriptive name for every series (e.g., `--prop series1.name="Revenue"`).

**Line chart (time series trend):**

```bash
officecli add dashboard.xlsx /Dashboard --type chart \
  --prop chartType=line \
  --prop title="Net MRR Trend" \
  --prop series1.name="Net MRR" \
  --prop series1.values="Sheet1!B2:B13" \
  --prop series1.categories="Sheet1!A2:A13" \
  --prop preset=dashboard \
  --prop trendline=linear \
  --prop axisNumFmt='$#,##0' \
  --prop x=0 --prop y=5 --prop width=10 --prop height=15
```

**Column chart (categorical comparison):**

```bash
officecli add dashboard.xlsx /Dashboard --type chart \
  --prop chartType=column \
  --prop title="Monthly Revenue" \
  --prop series1.name="Revenue" \
  --prop series1.values="Sheet1!B2:B13" \
  --prop series1.categories="Sheet1!A2:A13" \
  --prop preset=dashboard \
  --prop axisNumFmt='$#,##0' \
  --prop x=11 --prop y=5 --prop width=10 --prop height=15
```

**Stacked bar chart (component breakdown):**

```bash
officecli add dashboard.xlsx /Dashboard --type chart \
  --prop chartType=columnStacked \
  --prop title="MRR Components" \
  --prop series1.name="New MRR" \
  --prop series1.values="Sheet1!B2:B13" \
  --prop series2.name="Expansion" \
  --prop series2.values="Sheet1!C2:C13" \
  --prop series3.name="Churned" \
  --prop series3.values="Sheet1!D2:D13" \
  --prop series1.categories="Sheet1!A2:A13" \
  --prop preset=dashboard \
  --prop axisNumFmt='$#,##0' \
  --prop x=0 --prop y=21 --prop width=10 --prop height=15
```

**Combo chart (budget vs actual):**

```bash
officecli add dashboard.xlsx /Dashboard --type chart \
  --prop chartType=combo \
  --prop title="Budget vs Actual" \
  --prop series1.name="Budget" \
  --prop series1.values="Sheet1!C2:C13" \
  --prop series2.name="Actual" \
  --prop series2.values="Sheet1!D2:D13" \
  --prop series1.categories="Sheet1!A2:A13" \
  --prop comboSplit=1 \
  --prop preset=dashboard \
  --prop axisNumFmt='$#,##0' \
  --prop x=11 --prop y=5 --prop width=10 --prop height=15
```

**Doughnut chart (composition):**

> **Note:** Doughnut/pie-style charts show part-of-whole breakdowns. Prefer `doughnut` over `pie` — `chartType=pie` has a known rendering issue in LibreOffice (chart renders blank). Use `doughnut` as the safe alternative.

```bash
officecli add dashboard.xlsx /Dashboard --type chart \
  --prop chartType=doughnut \
  --prop title="Revenue Breakdown" \
  --prop series1.name="Revenue" \
  --prop series1.values="Sheet1!B2:B5" \
  --prop categories="Sheet1!A2:A5" \
  --prop preset=dashboard \
  --prop holesize=60 \
  --prop axisNumFmt='#,##0' \
  --prop x=11 --prop y=21 --prop width=10 --prop height=15
```

**Scatter chart (correlation):**

> **IMPORTANT: Scatter charts use `series1.xValues` instead of `series1.categories`.** Using `categories` on a scatter chart produces invalid OOXML.

```bash
officecli add dashboard.xlsx /Dashboard --type chart \
  --prop chartType=scatter \
  --prop title="Price vs Volume" \
  --prop series1.name="Products" \
  --prop series1.values="Sheet1!C2:C13" \
  --prop series1.xValues="Sheet1!B2:B13" \
  --prop preset=dashboard \
  --prop axisNumFmt='#,##0' \
  --prop x=0 --prop y=21 --prop width=10 --prop height=15
```

**Column chart with reference line:**

```bash
officecli add dashboard.xlsx /Dashboard --type chart \
  --prop chartType=column \
  --prop title="Revenue vs Target" \
  --prop series1.name="Revenue" \
  --prop series1.values="Sheet1!B2:B13" \
  --prop series1.categories="Sheet1!A2:A13" \
  --prop preset=dashboard \
  --prop axisNumFmt='$#,##0' \
  --prop "referenceline=100000:FF0000:Target:dash" \
  --prop x=0 --prop y=5 --prop width=10 --prop height=15
```

#### 6c: Multi-Series Charts

Each series needs `.name`, `.values`, and `.categories`:

```bash
--prop series1.name="Revenue" \
--prop series1.values="Sheet1!B2:B13" \
--prop series1.categories="Sheet1!A2:A13" \
--prop series2.name="Cost" \
--prop series2.values="Sheet1!C2:C13" \
--prop series2.categories="Sheet1!A2:A13"
```

For combo charts, `comboSplit=N` makes the first N series bars and the rest lines.

#### 6d: Chart Position Validation (MANDATORY After Adding Each Chart)

After adding each chart, verify it fits within the Dashboard visible area.

**Standard Dashboard visible area:** columns A–L (x: 0–21), rows 1–30 (y: 1–30). Charts outside this range may be truncated or invisible in print/export.

**Print area constraint (MANDATORY when print area is set):**
If a print area has been defined for the Dashboard sheet, all charts MUST fit within it. Charts that overflow the print area are clipped in PDF/print output and appear broken.

- Determine the print area column width (in column units). For example, a print area of A1:L40 spans 12 columns (x: 0–11).
- Keep each chart's `x + width` ≤ print area right boundary.
- **Recommended:** chart width ≤ 90% of print area width (e.g., if print area is 12 columns wide, max chart width = 10).
- If two charts are placed side-by-side, each chart width must be ≤ 45% of print area width so they both fit.

**Recommended chart sizes:**

| Use Case | width | height | Notes |
|----------|-------|--------|-------|
| Standard chart (half-width) | 10 | 15 | Fits two charts side by side |
| Wide chart (full-width) | 20 | 15 | Spans full Dashboard width |
| Compact chart | 8 | 12 | For dashboards with 3+ charts |

**Verify chart position after adding:**

```bash
# Check chart anchor and position (replace chart[1] with chart[2] etc.)
officecli get dashboard.xlsx '/Dashboard/chart[1]' --json
```

In the JSON output, confirm:
- `x` + `width` ≤ 21 (chart does not extend beyond column L)
- `y` + `height` ≤ 30 (chart does not extend below row 30)
- If a print area is set: `x` + `width` does not exceed the print area's right column boundary

If a chart exceeds the boundary, remove it and re-add with corrected dimensions:

```bash
officecli remove dashboard.xlsx '/Dashboard/chart[1]'
# Re-add with adjusted x/y/width/height values
```

#### 6f: Chart Error Recovery

If a chart `add` command fails or produces an unexpected result:

1. **Check how many charts exist:**
   ```bash
   officecli query dashboard.xlsx 'chart'
   ```

2. **Remove a broken or ghost chart** (N is the 1-based chart index):
   ```bash
   officecli remove dashboard.xlsx '/Dashboard/chart[N]'
   ```
   Example: to remove the 2nd chart on Dashboard: `officecli remove dashboard.xlsx '/Dashboard/chart[2]'`

3. **Retry the chart add** with corrected parameters.

> Always verify chart count after any chart failure. Failed `add` commands may still create a partial/empty chart object that must be removed before retrying.

---

### Step 7: Add Conditional Formatting

Four CF types are available. Choose based on the data pattern.

**Databar** -- magnitude comparison (revenue, spend):

```bash
officecli add dashboard.xlsx /Sheet1 --type databar \
  --prop sqref=B2:B13 --prop color=4472C4
```

**Colorscale** -- heat map (rates, growth):

```bash
# 2-color scale (low=red, high=green)
officecli add dashboard.xlsx /Sheet1 --type colorscale \
  --prop sqref=E2:E13 --prop mincolor=FFCDD2 --prop maxcolor=C8E6C9

# 3-color scale (red -> white -> green)
officecli add dashboard.xlsx /Sheet1 --type colorscale \
  --prop sqref=D2:D13 \
  --prop mincolor=FFCDD2 --prop midcolor=FFFFFF --prop maxcolor=C8E6C9
```

**Iconset** -- status indicators:

```bash
officecli add dashboard.xlsx /Sheet1 --type iconset \
  --prop sqref=E2:E13 --prop iconset=3Arrows
```

Available icon sets: `3Arrows`, `3ArrowsGray`, `3Flags`, `3TrafficLights1`, `3TrafficLights2`, `3Signs`, `3Symbols`, `3Symbols2`, `4Arrows`, `4ArrowsGray`, `4Rating`, `4RedToBlack`, `4TrafficLights`, `5Arrows`, `5ArrowsGray`, `5Rating`, `5Quarters`

Use `--prop showvalue=false` to show only icons (hide cell values).

**Formulacf** -- custom business logic:

> **WARNING: Do NOT use `font.bold` in formulacf.** Use `fill` + `font.color` only. `font.bold` causes validation errors (`<b>` element in dxf/font is not allowed by OOXML schema).

```bash
# Green highlight when value is high
officecli add dashboard.xlsx /Sheet1 --type formulacf \
  --prop sqref=B2:B13 \
  --prop 'formula=$B2>=100000' \
  --prop fill=C8E6C9 --prop font.color=2E7D32

# Red highlight when value is low
officecli add dashboard.xlsx /Sheet1 --type formulacf \
  --prop sqref=B2:B13 \
  --prop 'formula=$B2<100000' \
  --prop fill=FFCDD2 --prop font.color=C62828
```

**Semantic colors reference:**

| Meaning | Fill | Font Color |
|---------|------|------------|
| Good / Positive | C8E6C9 | 2E7D32 |
| Bad / Negative | FFCDD2 | C62828 |
| Neutral | F5F5F5 | 666666 |

---

### Step 8: Set Tab Colors

```bash
officecli set dashboard.xlsx /Dashboard --prop tabColor=4472C4
officecli set dashboard.xlsx /Sheet1 --prop tabColor=A5A5A5
```

---

### Step 9: Polish (Optional, Data-Size-Dependent)

Apply these when the dataset is large enough (50+ rows) or the audience is executive-level.

**Gradient fills on KPI cells:**

```bash
officecli set dashboard.xlsx '/Dashboard/A1' \
  --prop fill=4472C4-1A3B6B --prop font.color=FFFFFF --prop bold=true
```

**Cell merge for wider KPI labels:**

```bash
officecli set dashboard.xlsx '/Dashboard/A1:B1' \
  --prop merge=true --prop value="Total Revenue" \
  --prop bold=true --prop font.size=9 --prop font.color=666666
```

**Dashboard zoom to 85%:**

```bash
officecli set dashboard.xlsx /Dashboard --prop zoom=85
```

**Named ranges (for 50+ row datasets or C-suite audience):**

```bash
officecli add dashboard.xlsx / --type namedrange \
  --prop name="TotalRevenue" --prop ref="Sheet1!B2:B13" \
  --prop comment="Monthly revenue data"
```

---

### Step 10: raw-set -- activeTab and fullCalcOnLoad (ALWAYS LAST)

> **CRITICAL: These MUST be the last commands, after ALL sheets, charts, CF, sparklines, and named ranges are created.**

**Command 1: Set Dashboard as active tab.**

Before setting `activeTab`, verify the exact sheet order (0-based index):

```bash
# List all sheets in order — count from 0 to find Dashboard's index
officecli query dashboard.xlsx 'sheet'
```

Example output:
```
Sheet1    (index 0)
Summary   (index 1)
Dashboard (index 2)
```

Use the 0-based index of the Dashboard sheet. In this example, `activeTab="2"`.

```bash
officecli raw-set dashboard.xlsx /workbook \
  --xpath "//x:sheets" \
  --action insertbefore \
  --xml '<bookViews><workbookView activeTab="1" /></bookViews>'
```

`activeTab` is 0-based. If Dashboard is the second sheet (Sheet1=0, Dashboard=1), use `activeTab="1"`. **Always confirm the index with `query 'sheet'` — do NOT guess.**

**Command 2: Set fullCalcOnLoad.**

```bash
officecli set dashboard.xlsx / --prop calc.fullCalcOnLoad=true
```

Do NOT use `raw-set` to insert `<calcPr>` — it creates duplicate elements. The high-level `set` API handles schema ordering automatically.

---

### Step 11: Validate

```bash
officecli validate dashboard.xlsx
```

Must return zero errors. If errors are found:
- Check for `font.bold` in formulacf -- remove it
- Check calcPr -- use `set / --prop calc.fullCalcOnLoad=true` instead of raw-set
- Check for duplicate bookViews -- raw-set may have been run twice
- Fix the issue and re-validate

---

## Section C: Complete Example -- SaaS MRR Dashboard

A full, copy-pasteable command sequence for a SaaS MRR dataset with 12 rows and 5 columns: `month`, `new_mrr`, `expansion_mrr`, `churned_mrr`, `net_mrr`.

Assume the CSV file `saas_mrr.csv` exists with this structure:

```
month,new_mrr,expansion_mrr,churned_mrr,net_mrr
2025-01,45000,12000,8000,49000
2025-02,48000,14000,9000,53000
2025-03,52000,15000,7500,59500
2025-04,47000,16000,10000,53000
2025-05,55000,18000,8500,64500
2025-06,58000,17000,9500,65500
2025-07,62000,19000,11000,70000
2025-08,60000,20000,10500,69500
2025-09,65000,22000,9000,78000
2025-10,68000,21000,12000,77000
2025-11,72000,24000,10000,86000
2025-12,75000,25000,11500,88500
```

**Data analysis:** 12 rows, 5 columns. Primary dimension: month (date). Numeric columns: 4 (all currency). Per the complexity table: 2-3 KPIs, 2 charts, optional sparklines, 1-2 CF rules.

**Plan:**
- KPIs: Latest Net MRR, MoM Growth Rate, Average Churn Rate, Total Net New MRR
- Charts: Line chart (Net MRR trend with trendline), Stacked column (MRR components)
- Sparklines: 4 (one per KPI)
- CF: Databar on net_mrr, colorscale on churned_mrr

### Commands

```bash
# ── Step 1: Create and import ──
officecli create saas_dashboard.xlsx
officecli import saas_dashboard.xlsx /Sheet1 --file saas_mrr.csv --header

# ── Step 2: Column widths ──
officecli set saas_dashboard.xlsx "/Sheet1/col[A]" --prop width=14
officecli set saas_dashboard.xlsx "/Sheet1/col[B]" --prop width=15
officecli set saas_dashboard.xlsx "/Sheet1/col[C]" --prop width=15
officecli set saas_dashboard.xlsx "/Sheet1/col[D]" --prop width=15
officecli set saas_dashboard.xlsx "/Sheet1/col[E]" --prop width=15

# ── Step 3: Add Dashboard sheet ──
officecli add saas_dashboard.xlsx / --type sheet --prop name=Dashboard

# ── Step 4: Build KPI cells ──
officecli set saas_dashboard.xlsx /Dashboard/A1 --prop value="Latest Net MRR" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set saas_dashboard.xlsx /Dashboard/A2 --prop "formula==Sheet1!E13" --prop numFmt='$#,##0' --prop font.size=24 --prop bold=true --prop font.color=2E7D32
officecli set saas_dashboard.xlsx /Dashboard/C1 --prop value="MoM Growth" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set saas_dashboard.xlsx /Dashboard/C2 --prop "formula==IFERROR(Sheet1!E13/Sheet1!E12-1,0)" --prop numFmt=0.0% --prop font.size=24 --prop bold=true --prop font.color=2E7D32
officecli set saas_dashboard.xlsx /Dashboard/E1 --prop value="Avg Churn Rate" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set saas_dashboard.xlsx /Dashboard/E2 --prop "formula==IFERROR(AVERAGE(Sheet1!D2:D13)/AVERAGE(Sheet1!E2:E13),0)" --prop numFmt=0.0% --prop font.size=24 --prop bold=true --prop font.color=C62828
officecli set saas_dashboard.xlsx /Dashboard/G1 --prop value="Total Net New MRR" --prop bold=true --prop font.size=9 --prop font.color=666666
officecli set saas_dashboard.xlsx /Dashboard/G2 --prop "formula==SUM(Sheet1!E2:E13)" --prop numFmt='$#,##0' --prop font.size=24 --prop bold=true --prop font.color=2E7D32

# ── Step 4b: Dashboard column widths (MANDATORY -- prevents ### on KPIs) ──
officecli set saas_dashboard.xlsx "/Dashboard/col[A]" --prop width=22
officecli set saas_dashboard.xlsx "/Dashboard/col[B]" --prop width=12
officecli set saas_dashboard.xlsx "/Dashboard/col[C]" --prop width=22
officecli set saas_dashboard.xlsx "/Dashboard/col[D]" --prop width=12
officecli set saas_dashboard.xlsx "/Dashboard/col[E]" --prop width=22
officecli set saas_dashboard.xlsx "/Dashboard/col[F]" --prop width=12
officecli set saas_dashboard.xlsx "/Dashboard/col[G]" --prop width=22
officecli set saas_dashboard.xlsx "/Dashboard/col[H]" --prop width=12

# ── Step 5: Sparklines ──
officecli add saas_dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=B2 \
  --prop range="Sheet1!E2:E13" \
  --prop type=line \
  --prop color=4472C4 \
  --prop highpoint=FF0000

officecli add saas_dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=D2 \
  --prop range="Sheet1!E2:E13" \
  --prop type=column \
  --prop color=4472C4

officecli add saas_dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=F2 \
  --prop range="Sheet1!D2:D13" \
  --prop type=line \
  --prop color=C62828

officecli add saas_dashboard.xlsx /Dashboard --type sparkline \
  --prop cell=H2 \
  --prop range="Sheet1!E2:E13" \
  --prop type=line \
  --prop color=2E7D32

# ── Step 6: Charts ──

# Line chart: Net MRR trend with trendline (left position)
officecli add saas_dashboard.xlsx /Dashboard --type chart \
  --prop chartType=line \
  --prop title="Net MRR Trend" \
  --prop series1.name="Net MRR" \
  --prop series1.values="Sheet1!E2:E13" \
  --prop series1.categories="Sheet1!A2:A13" \
  --prop preset=dashboard \
  --prop trendline=linear \
  --prop axisNumFmt='$#,##0' \
  --prop x=0 --prop y=5 --prop width=10 --prop height=15

# Stacked column: MRR components breakdown (right position)
officecli add saas_dashboard.xlsx /Dashboard --type chart \
  --prop chartType=columnStacked \
  --prop title="MRR Components" \
  --prop series1.name="New MRR" \
  --prop series1.values="Sheet1!B2:B13" \
  --prop series2.name="Expansion" \
  --prop series2.values="Sheet1!C2:C13" \
  --prop series3.name="Churned" \
  --prop series3.values="Sheet1!D2:D13" \
  --prop series1.categories="Sheet1!A2:A13" \
  --prop preset=dashboard \
  --prop axisNumFmt='$#,##0' \
  --prop x=11 --prop y=5 --prop width=10 --prop height=15

# ── Step 7: Conditional formatting ──

# Databar on net_mrr column
officecli add saas_dashboard.xlsx /Sheet1 --type databar \
  --prop sqref=E2:E13 --prop color=4472C4

# Colorscale on churned_mrr (red=high churn, green=low)
officecli add saas_dashboard.xlsx /Sheet1 --type colorscale \
  --prop sqref=D2:D13 --prop mincolor=C8E6C9 --prop maxcolor=FFCDD2

# ── Step 8: Tab colors ──
officecli set saas_dashboard.xlsx /Dashboard --prop tabColor=4472C4
officecli set saas_dashboard.xlsx /Sheet1 --prop tabColor=A5A5A5

# ── Step 9: Polish (skip for 12-row dataset -- optional) ──

# ── Step 10: raw-set (LAST) ──

# Set Dashboard as active tab
officecli raw-set saas_dashboard.xlsx /workbook \
  --xpath "//x:sheets" \
  --action insertbefore \
  --xml '<bookViews><workbookView activeTab="1" /></bookViews>'

# Set fullCalcOnLoad (use high-level API, not raw-set)
officecli set saas_dashboard.xlsx / --prop calc.fullCalcOnLoad=true

# ── Step 11: Close + Validate ──
officecli close saas_dashboard.xlsx
officecli validate saas_dashboard.xlsx
```

---

## Section D: Warnings and Known Issues

> **Read these before building. Each one has caused production failures.**

### D-1: Batch JSON -- All Values Must Be Strings

```json
CORRECT: {"bold":"true","font.size":"24","numFmt":"$#,##0"}
WRONG:   {"bold":true,"font.size":24}
```

Non-string values fail with `JSON value could not be converted to System.String`. This applies to ALL batch prop values including booleans and numbers.

### D-2: DeferredAddKeys -- Add-Only, Not in --help

`preset`, `referenceline`, `trendline`, and `axisNumFmt` are NOT listed in `officecli --help` output. They only work on `add` commands, NOT on `set`. Always include them at chart creation time. You cannot apply a preset to an existing chart.

### D-3: raw-set Ordering -- activeTab LAST

The `raw-set` command for `activeTab` MUST be the last raw-set command in the workflow, after all sheets, charts, CF rules, and sparklines are created. Setting `activeTab` before all sheets exist will produce wrong indices.

### D-4: calcPr -- Use High-Level API

Use `officecli set file.xlsx / --prop calc.fullCalcOnLoad=true` instead of `raw-set` to set calculation properties. The `raw-set` approach creates duplicate `<calcPr>` elements and causes validation errors.

### D-5: formulacf -- No font.bold

`font.bold` in formulacf causes validation error: `unexpected child element <b> in dxf/font`. Use `fill` + `font.color` only for formula-based conditional formatting.

### D-6: Column Widths -- import Does Not Auto-Size

`import --header` sets freeze pane and AutoFilter but does NOT adjust column widths. Always set widths manually after import (Step 2).

### D-7: Shell Quoting -- Formulas with $ and !

- `$` in formulas: use single quotes to prevent shell expansion: `--prop 'formula=$D2>$C2'`
- `!` in cross-sheet references: use double quotes or batch/heredoc: `--prop "formula==SUM(Sheet1!B2:B13)"`
- For batch JSON, use heredoc with single-quoted delimiter: `cat <<'EOF' | officecli batch`

### D-8: Scatter Charts -- Use xValues, Not Categories

Scatter charts use a different OOXML structure than other chart types. They require `<xVal>` (X values) instead of `<cat>` (categories). In officecli:

- **CORRECT:** `--prop series1.xValues="Sheet1!A2:A13"`
- **WRONG:** `--prop series1.categories="Sheet1!A2:A13"` -- produces `<cat>` element which is invalid in `<scatterChart>` and fails validation.

### D-9: Reference Line Format -- Color Before Label

The reference line format is `value:color:label:dash`, NOT `value:label:color:dash`. The parser always treats the second colon-delimited field as a color value.

- **CORRECT:** `--prop "referenceline=0:FF0000:Break-Even:dash"`
- **WRONG:** `--prop "referenceline=0:Break-Even:FF0000:dash"` -- `Break-Even` is parsed as a color and fails.

### D-10: Chart Data -- Always Use Cell Range References

Inline data (`series1="Revenue:100,200,300"`) creates a static chart. Cell range references (`series1.values="Sheet1!B2:B13"`) create live links. Always prefer cell range references unless data requires aggregation impossible in Excel formulas.

### D-11: CF Rules Are Add-Only

Conditional formatting rules cannot be modified or removed after creation. Plan CF rules carefully before adding them. For overlapping ranges, the last rule added takes priority.

### D-12: SUMIFS with Date Criteria -- Do NOT Use Strings

When data contains a date column, `SUMIFS` criteria must NOT be plain strings like `"2025-01-05"`. Excel stores dates as serial numbers internally, so a string comparison will silently match zero rows.

- **CORRECT:** `=SUMIFS(B2:B13,A2:A13,DATE(2025,1,5))` or `=SUMIFS(B2:B13,A2:A13,DATEVALUE("2025-01-05"))`
- **WRONG:** `=SUMIFS(B2:B13,A2:A13,"2025-01-05")` -- returns 0 because the string does not match the numeric date value.

This also applies to `AVERAGEIFS`, `COUNTIFS`, and any other `*IFS` function when the criteria column contains dates.

### D-13: Empty Charts -- officecli Silently Accepts Missing Data

`officecli add --type chart` succeeds (exit 0) even when data params (`series1.values=` or `data=`) are omitted entirely. The result is a chart XML structure with no data -- it renders as a blank box in Excel/WPS. **Always verify chart data after creation** using `get --json` (see QA Checklist step 5b). This bug caused blank charts across 3 rounds of testing before detection.

### D-14: Summary Sheet Percentage Formulas -- Missing numFmt Displays as Float

When `AVERAGEIFS`, `SUMIFS/count`, or any formula on the Summary sheet produces a percentage value (e.g., conversion rate, churn rate, win rate), the result is stored internally as a decimal (0.0983333...). Without `numFmt`, the cell displays as a raw float in the spreadsheet, not a percentage.

- **CORRECT:** Set `numFmt` at the same time as the formula:
  ```bash
  officecli set dashboard.xlsx "Summary!C2" --prop "formula==AVERAGEIFS(Data!C2:C100,Data!A2:A100,B2)" --prop numFmt="0.0%"
  ```
- **WRONG:** Setting only the formula: the cell shows `0.098` instead of `9.8%`.

This applies to ALL formula cells on Summary sheets where the result is a ratio or percentage. Always check Summary sheet percentage columns in QA.

### D-15: Summary Sheet Column Widths -- Formulas Do Not Auto-Size

Like the Data sheet, Summary sheet columns are NOT auto-sized when populated with formulas. Text label columns default to width 8 and will truncate category names. Numeric columns may show `###` for large values.

Always run column width commands after writing Summary sheet data (see Step 2 — Summary sheet column widths section).

---

## Section E: QA Checklist

Run this checklist after every dashboard build. Do not skip any step.

### Automated Checks

```bash
# 1. Validation -- must return zero errors
officecli validate dashboard.xlsx

# 2. Issue detection
officecli view dashboard.xlsx issues

# 3. Verify EVERY KPI cell has a formula (not hardcoded values)
# Check each KPI value cell individually. The "formula" field must be present.
officecli get dashboard.xlsx /Dashboard/A2 --json
officecli get dashboard.xlsx /Dashboard/C2 --json
officecli get dashboard.xlsx /Dashboard/E2 --json
officecli get dashboard.xlsx /Dashboard/G2 --json
# (add more lines for additional KPI cells, e.g., /Dashboard/I2)

# 4. Check for formula errors
officecli query dashboard.xlsx 'cell:contains("#REF!")'
officecli query dashboard.xlsx 'cell:contains("#DIV/0!")'
officecli query dashboard.xlsx 'cell:contains("#VALUE!")'
officecli query dashboard.xlsx 'cell:contains("#NAME?")'
officecli query dashboard.xlsx 'cell:contains("#N/A")'

# 5. Verify chart count matches plan
officecli query dashboard.xlsx 'chart'

# 5b. **CRITICAL: Verify EVERY chart has data (not empty)**
# For EACH chart, run `get --json` and confirm `series[].values` or `series[].valuesRef` is NOT empty.
# An empty chart (no data) is a BLOCKER -- the chart renders as a blank box.
officecli get dashboard.xlsx '/Dashboard/chart[1]' --json
# Check output: each series MUST have non-empty "values" (inline) OR "valuesRef" (cell range).
# NOTE: When using cell range references (series1.values="Sheet1!B2:B13"), the "values" field
# will always be empty -- this is NORMAL. Only "valuesRef" will be populated.
# BLOCKER: If BOTH "values" AND "valuesRef" are empty → chart has no data.
# FIX: remove the chart and re-add with correct series1.values="Sheet1!B2:B13" params.
# Repeat for chart[2], chart[3], etc.

# 6. Verify conditional formatting exists (required for datasets with 10+ rows)
officecli query dashboard.xlsx 'conditionalformatting'
# Must return at least 1 rule applied to the Data sheet.
# Zero CF rules on a 10+ row dataset is a quality failure (Q4 fail).

# 7. Spot-check a cross-sheet formula (no backslash before !)
officecli get dashboard.xlsx /Dashboard/A2 --json

# 8. Visual content verification (MANDATORY)
# View Dashboard content as text to confirm KPIs display actual values (not ###):
officecli view dashboard.xlsx text
# Verify:
#   - KPI values are real numbers (e.g., $88,500 or 14.3%), NOT "###"
#   - Dates display as dates (e.g., 2025-01), NOT serial numbers (e.g., 45658)
#   - Charts are listed with correct titles
# NOTE: Formula cells (KPIs) may appear BLANK in text view. This is NORMAL
# because `view text` does not execute formula calculations. Blank formula
# cells do NOT indicate missing data. Confirm the formula exists by checking
# step 3 above (`get --json` shows the "formula" field).
```

### Manual Verification (Agent Self-Check)

- [ ] KPI count matches the plan from Section A
- [ ] Chart count matches the plan from Section A
- [ ] **Every chart has non-empty data** (verified via `get --json`: series[].values or series[].valuesRef present)
- [ ] Every chart has `preset=dashboard` (or `corporate`/`minimal` per plan)
- [ ] Every chart has a descriptive title (not "Chart 1")
- [ ] Every chart series has a name (not "Series 1")
- [ ] **Header row fill color applied (Q2 — MANDATORY):** Data sheet row 1 and Summary sheet row 1 have a non-white fill color. Dark fill (e.g., `1F3864`) with white font required.
- [ ] **Conditional formatting applied (Q4 — MANDATORY for 10+ row datasets):** At least 1 CF rule (colorscale or databar) present on a numeric column in the Data sheet. Verify with `officecli query dashboard.xlsx 'conditionalformatting'` — zero rules is a quality failure.
- [ ] **KPI card background fill applied (Q3 — Quality Bar):** Dashboard KPI area (rows 1-2) has a light background fill (e.g., `F0F4FF`). Omitting this is a P2 deduction.
- [ ] CF rules use correct color direction (green=good, red=bad)
- [ ] Tab colors are set (Dashboard=blue, data=gray)
- [ ] Dashboard is active on open (activeTab set)
- [ ] fullCalcOnLoad is set
- [ ] Output complexity is proportional to data size (no 3 charts for 5 rows)
- [ ] **Summary sheet column widths set** (if Summary sheet exists): text/label columns 15-20, numeric columns 12-15 (see Step 2 Summary section)
- [ ] **Summary sheet percentage formulas have numFmt** (if applicable): cells with AVERAGEIFS/rate results must have `numFmt="0.0%"` or `"0%"`, not raw float display
- [ ] **Chart data sources reference visible cells only:** No chart `series.values` or `series.categories` points to a hidden column or hidden sheet. Hidden-column formula results are not evaluated by LibreOffice — charts referencing them render blank. Use visible Summary sheet cells as chart data sources.
- [ ] **Charts within print area (if print area is set):** For each chart, confirm `x + width` does not exceed the print area's right boundary. Recommended: chart width ≤ 90% of print area width. Side-by-side charts: each ≤ 45% of print area width.
