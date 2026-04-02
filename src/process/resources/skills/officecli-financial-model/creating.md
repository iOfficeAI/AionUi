<!-- officecli: v1.0.24 -->

# Creating a Financial Model

Complete guide for building formula-driven, multi-sheet financial models from scratch.

> **Prerequisite:** This guide assumes familiarity with the officecli xlsx building blocks from [data-dashboard creating.md](../officecli-data-dashboard/creating.md). This guide focuses on what is unique to financial models: formula chains, cross-sheet patterns, financial conventions, sensitivity tables, and scenario switching.

---

## Section A: Setup and Conventions

### A.1 What You Will Build

A single `.xlsx` with 4-10 interconnected sheets. Dependency: `Assumptions -> IS -> BS -> CF -> Valuation/DCF -> Sensitivity -> Error Checks -> Dashboard`.

Non-negotiable: all statement values are formulas (only Assumptions has hardcoded numbers), all cross-sheet formulas use heredoc batch, fullCalcOnLoad with iterate is always set.

### A.2 Sheet Structure Convention

| Sheet | Tab Color | Purpose |
|-------|-----------|---------|
| Assumptions | `4472C4` (blue) | All hardcoded inputs |
| Income Statement | `A5A5A5` (gray) | Revenue through Net Income |
| Balance Sheet | `A5A5A5` (gray) | Assets, Liabilities, Equity |
| Cash Flow | `A5A5A5` (gray) | Operating, Investing, Financing |
| Valuation / DCF | `ED7D31` (orange) | WACC, FCF, Terminal Value |
| Scenarios | `4472C4` (blue) | Dropdown + scenario assumptions |
| Error Checks | `FF0000` (red) | Balance, reconciliation, ISERROR |
| Dashboard | `70AD47` (green) | Charts and summary KPIs |

### A.3 Financial Color Coding

| Cell Type | Font Color | Hex |
|-----------|-----------|-----|
| Input (hardcoded) | Blue | `0000FF` |
| Formula (same sheet) | Black | `000000` |
| Cross-sheet reference | Green | `008000` |

Apply colors in the formatting batch (step 8 of build order):

```bash
officecli set model.xlsx /Assumptions/B3:D15 --prop font.color=0000FF
officecli set model.xlsx "/Income Statement/B3:D20" --prop font.color=000000
```

### A.4 Number Format Map

| Type | Format Code | Example |
|------|------------|---------|
| Accounting | `_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)` | `$ 1,234` / `$ (567)` |
| Currency | `$#,##0;($#,##0);"-"` | `$1,234` / `($567)` |
| Percentage | `0.0%` | `12.5%` |
| Multiples | `0.0x` | `3.2x` |
| Shares | `#,##0` | `10,000,000` |
| Per-share | `$#,##0.00` | `$14.50` |

Use heredoc batch for all number formats to avoid shell `$` expansion.

### A.5 Column Width Convention

Row labels (col A): 24-28, year/data columns: 14-18, narrow helpers: 10-12. Set all sheets in one batch (step 2).

**zsh quoting:** `col[A]` paths must use **single quotes** in shell. Double quotes cause zsh glob expansion and an error:

```bash
# WRONG — zsh expands [A]
officecli set model.xlsx "/Assumptions/col[A]" --prop width=26

# CORRECT
officecli set model.xlsx '/Assumptions/col[A]' --prop width=26
```

In JSON batch, no special quoting is needed (path is inside a JSON string).

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Assumptions/col[A]","props":{"width":"26"}},
  {"command":"set","path":"/Assumptions/col[B]","props":{"width":"16"}},
  {"command":"set","path":"/Assumptions/col[C]","props":{"width":"16"}},
  {"command":"set","path":"/Assumptions/col[D]","props":{"width":"16"}},
  {"command":"set","path":"/Income Statement/col[A]","props":{"width":"26"}},
  {"command":"set","path":"/Income Statement/col[B]","props":{"width":"16"}},
  {"command":"set","path":"/Income Statement/col[C]","props":{"width":"16"}},
  {"command":"set","path":"/Income Statement/col[D]","props":{"width":"16"}},
  {"command":"set","path":"/Balance Sheet/col[A]","props":{"width":"26"}},
  {"command":"set","path":"/Balance Sheet/col[B]","props":{"width":"16"}},
  {"command":"set","path":"/Cash Flow/col[A]","props":{"width":"26"}},
  {"command":"set","path":"/Cash Flow/col[B]","props":{"width":"16"}}
]
EOF
```

Freeze panes are INCREMENTAL (one per sheet):

### A.6 Subtotal Row Styling

Bold + `border.top=thin` on subtotals (Gross Profit, EBITDA). `border.top=double` on final totals (Net Income, Total Assets). Apply in formatting batch (step 8).

### A.7 Build Order (MANDATORY)

**Always wrap steps 2–9 in resident mode** — open once, close once, all operations run in memory:

```bash
officecli create model.xlsx
officecli open model.xlsx        # ← open immediately after create

# Step 1: add sheets while resident (INCREMENTAL)
officecli add model.xlsx / --type sheet --prop name=Assumptions
# ... remaining sheets ...
officecli remove model.xlsx /Sheet1

# Steps 2–9: all set/batch/add operations here

officecli close model.xlsx       # ← close AFTER all operations
officecli validate model.xlsx    # ← validate on closed file
```

Follow this exact 10-step sequence. Do not reorder.

| Step | Task | Mode |
|------|------|------|
| 1 | Create workbook + all sheets — plan names upfront (cannot rename) | **INCREMENTAL** |
| 2 | Column widths + freeze panes — set on every sheet (`freeze=B2` or `freeze=B3`) | **BATCH** |
| 3 | Headers + row labels — section headers, year labels, row names | **BATCH** |
| 4 | Assumptions data — hardcoded inputs (blue font in step 8) | **BATCH** |
| 5 | Statement formulas — IS → BS → CF dependency order; verify after each sheet | **BATCH** + verify |
| 6 | Valuation / scenario formulas — DCF, sensitivity, scenario switching, error checks | **BATCH** |
| 7 | Named ranges — define for all key assumptions | **INCREMENTAL** |
| 8 | Formatting + colors — number formats, blue/black font, subtotal styling, tab colors | **BATCH** |
| 9 | Charts — cell range references, `preset=dashboard` | **INCREMENTAL** |
| 10 | Protection + calcPr + validate — lock/unlock, protect, `set / --prop calc.*`, activeTab raw-set (LAST), validate | **INCREMENTAL** |

**Step 8 Formatting — REQUIRED sub-steps (do not skip):**

> **Step 8e: REQUIRED — Freeze panes on all data sheets**
>
> Freeze panes MUST be applied to every sheet with data rows. Row 3 = data starts at row 3 (header + year-label rows above). Failure to freeze panes is a Hard Rule violation that will fail QA.
>
> ```bash
> # Step 8e: Freeze panes — include every sheet that has column headers
> officecli set model.xlsx "/P&L" --prop freeze=B3
> officecli set model.xlsx "/Income Statement" --prop freeze=B3
> officecli set model.xlsx "/Balance Sheet" --prop freeze=B3
> officecli set model.xlsx "/Cash Flow" --prop freeze=B3
> officecli set model.xlsx "/Assumptions" --prop freeze=B2
> # Add any additional data sheets here (Revenue, Debt Schedule, etc.)
> ```

> **Step 8f: REQUIRED — Set formula cells to explicit black font**
>
> All formula cells on statement sheets MUST have `font.color=000000`. This is what visually distinguishes formula cells (black) from input cells (blue `0000FF`). Omitting this makes the color-coding convention invisible and fails the Blue/Black rule.
>
> **Step 8f applies to EVERY formula cell on EVERY statement sheet.** This includes Income Statement, Balance Sheet, Cash Flow, Assumptions (roll-forward/output rows), and any auxiliary sheets (Revenue, Debt Schedule, Valuation, etc.). Apply by row range for each sheet — do NOT apply to only one sheet or one section.
>
> ```bash
> # Step 8f: Apply black font to ALL formula cells across ALL statement sheets
> # Apply by row range for each sheet — must cover EVERY sheet with formula cells
> cat <<'EOF' | officecli batch model.xlsx
> [
>   {"command":"set","path":"/Income Statement/B3:D3","props":{"color":"000000"}},
>   {"command":"set","path":"/Income Statement/B4:D4","props":{"color":"000000"}},
>   {"command":"set","path":"/Income Statement/B5:D20","props":{"color":"000000"}},
>   {"command":"set","path":"/Balance Sheet/B3:D20","props":{"color":"000000"}},
>   {"command":"set","path":"/Cash Flow/B3:D20","props":{"color":"000000"}}
> ]
> EOF
> # Repeat for ALL formula rows on EACH sheet:
> #   - Assumptions output/roll-forward rows (e.g. PP&E schedule, depreciation)
> #   - Revenue / Debt Schedule / Valuation / Scenarios / Error Checks sheets
> #   - Any auxiliary sheet with formula cells
> # Input cells on Assumptions sheet use 0000FF (blue) — do NOT override those with 000000.
> ```
>
> **Pre-Delivery Verification (MANDATORY):** After applying Step 8f, verify font colors visually.
>
> **⚠️ WARNING: There is no reliable CLI command to detect font color.** `officecli view text` does NOT output font color information. A grep-based check like `grep -v "000000" | grep "formula"` is a **false negative** — it always returns 0 lines regardless of actual font colors, and will mistakenly pass a model where formula cells have no explicit color set.
>
> **Correct verification method:**
> ```bash
> # Generate HTML preview and open in browser to visually confirm font colors
> officecli view model.xlsx html > preview.html
> # Open preview.html and confirm:
> #   - Formula cells appear in BLACK
> #   - Input cells (Assumptions) appear in BLUE
> # Alternatively, use screenshot method (see E.8 Step 10)
> ```
>
> Confirm visually that formula cells across all statement sheets render in black. If any formula cell appears in a non-black color (e.g., default automatic color, blue, or gray), re-apply Step 8f for that sheet and verify again.

### A.8 Execution Strategy: When to Use Batch vs Incremental

Financial models involve 200–400 commands. Using the right execution mode per step cuts wall-clock time by 5–10×.

**Use INCREMENTAL (one command at a time):**
- Any `add` command — creates new structure (sheet, chart, named range, validation, color scale)
- Any `remove` command
- Any `raw-set` command
- `validate` — always run alone, read the output before continuing
- First command after each major step — confirm the structure is correct before filling it
- **When uncertain** — single commands give immediate feedback; a failed batch is harder to diagnose than a failed single command

**Use BATCH (heredoc):**
- Any series of `set` commands — filling values, formulas, widths, formats
- This covers steps 2, 3, 4, 5, 6, 8 entirely

**Batch chunk size: 15–20 operations max.** The known-issue "Failed to send to resident" occurs more often with larger arrays. Split by logical group (one sheet per batch, or one formula section per batch):

```bash
# Batch template — one heredoc per logical group
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Assumptions/A1","props":{"value":"Revenue Drivers","bold":true}},
  {"command":"set","path":"/Assumptions/B1","props":{"value":"Year 1","bold":true}},
  {"command":"set","path":"/Assumptions/C1","props":{"value":"Year 2","bold":true}},
  {"command":"set","path":"/Assumptions/D1","props":{"value":"Year 3","bold":true}}
]
EOF
```

**Cross-sheet formulas in batch:** Use the `formula` prop with `=` prefix — the `==` double-equals trick (`--prop "formula==Sheet!Cell"`) is only needed in shell to escape `!`. In JSON batch, write the formula literally:

```json
{"command":"set","path":"/Income Statement/B3","props":{"formula":"=Assumptions!B3"}}
```

---

## Section B: Core Patterns

### B.1 Assumptions Sheet

Create workbook, sheets, then populate. Assumptions is the single source of truth:

```bash
officecli create model.xlsx
officecli add model.xlsx / --type sheet --prop name=Assumptions
officecli add model.xlsx / --type sheet --prop name="Income Statement"
officecli add model.xlsx / --type sheet --prop name="Balance Sheet"
officecli add model.xlsx / --type sheet --prop name="Cash Flow"
officecli add model.xlsx / --type sheet --prop name=Dashboard
officecli remove model.xlsx /Sheet1
```

Populate with sections (Revenue Drivers, Cost Drivers, Working Capital, etc.) -- year columns B/C/D. **Use batch for all cell fills** (steps 3 + 4 are pure `set` operations):

```bash
# Step 3 + 4: Headers, row labels, and input values in one batch per section
# Professional financial models use dark header rows (deep blue/dark gray) + white font to
# visually separate section headers from data rows. Always set `fill` on header rows.
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Assumptions/A1","props":{"value":"Revenue Drivers","bold":true,"font.size":11,"fill":"1F3864","font.color":"FFFFFF"}},
  {"command":"set","path":"/Assumptions/B1","props":{"value":"Year 1","bold":true,"fill":"1F3864","font.color":"FFFFFF"}},
  {"command":"set","path":"/Assumptions/C1","props":{"value":"Year 2","bold":true,"fill":"1F3864","font.color":"FFFFFF"}},
  {"command":"set","path":"/Assumptions/D1","props":{"value":"Year 3","bold":true,"fill":"1F3864","font.color":"FFFFFF"}},
  {"command":"set","path":"/Assumptions/A2","props":{"value":"Revenue Growth Rate"}},
  {"command":"set","path":"/Assumptions/B2","props":{"value":0.15}},
  {"command":"set","path":"/Assumptions/C2","props":{"value":0.12}},
  {"command":"set","path":"/Assumptions/D2","props":{"value":0.10}},
  {"command":"set","path":"/Assumptions/A3","props":{"value":"Gross Margin"}},
  {"command":"set","path":"/Assumptions/B3","props":{"value":0.70}},
  {"command":"set","path":"/Assumptions/C3","props":{"value":0.72}},
  {"command":"set","path":"/Assumptions/D3","props":{"value":0.74}}
]
EOF
# Continue with more sections (Cost Drivers, Working Capital, CapEx, Tax Rate) in separate batches
# Apply the same fill+font.color pattern to ALL section header rows across ALL sheets:
#   "fill":"1F3864","font.color":"FFFFFF"  — dark navy + white text (default recommended)
#   "fill":"2E4057","font.color":"FFFFFF"  — dark slate blue alternative
#   "fill":"243F60","font.color":"FFFFFF"  — dark teal-blue alternative
# Header rows WITHOUT fill look unprofessional — this is a Quality Bar requirement.
```

> **Header 行 fill 必须覆盖整行（A:D 或 A:G）**
>
> Section header 行（如 REVENUE、ASSETS、LIABILITIES）的深色 fill 必须应用到该行的**所有列**，而不仅限于 A 列 label 单元格。
> 仅设置 A 列时，B/C/D 列在同行会显示白色背景 + 黑色文字，与深色 A 列相邻，对比强烈且可读性极低。
>
> **正确做法**（batch 中同时设置整行）：
> ```json
> {"command":"set","path":"/P&L/A5:D5","props":{"shd":"1F3864","color":"FFFFFF","bold":true}}
> ```
> **错误做法**（只设置 A 列）：
> ```json
> {"command":"set","path":"/P&L/A5","props":{"shd":"1F3864","color":"FFFFFF","bold":true}}
> ```
> 规则：header 行的 fill 范围必须与数据列范围一致（年度模型 A:D，月度模型 A:AL 等）。

Add data validation on rates (INCREMENTAL — structural `add`):

```bash
officecli add model.xlsx /Assumptions --type validation \
  --prop sqref=B2:D2 --prop type=decimal --prop min=0 --prop max=1
```

### B.2 Income Statement

All formulas reference Assumptions. Pattern: Revenue row refs Assumptions directly, COGS uses margin, then Gross Profit through Net Income as formulas. **Use batch** — in JSON, write formulas literally with `=` prefix (no `==` double-equals needed).

**Column convention:** Column B = Year 1 data, Column C = Year 2 data, Column D = Year 3 data. Growth rates follow the same column alignment: `Assumptions!C2` is the Year 1→Year 2 growth rate (stored in the Year 2 column, applied to compute Year 2 revenue from Year 1).

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Income Statement/A3","props":{"value":"Revenue"}},
  {"command":"set","path":"/Income Statement/B3","props":{"formula":"=Assumptions!B3"}},
  {"command":"set","path":"/Income Statement/C3","props":{"formula":"=B3*(1+Assumptions!C2)"}},
  {"command":"set","path":"/Income Statement/D3","props":{"formula":"=C3*(1+Assumptions!D2)"}},
  {"command":"set","path":"/Income Statement/A4","props":{"value":"COGS"}},
  {"command":"set","path":"/Income Statement/B4","props":{"formula":"=-B3*(1-Assumptions!B5)"}},
  {"command":"set","path":"/Income Statement/C4","props":{"formula":"=-C3*(1-Assumptions!C5)"}},
  {"command":"set","path":"/Income Statement/D4","props":{"formula":"=-D3*(1-Assumptions!D5)"}}
]
EOF
# Verify cross-sheet refs (INCREMENTAL)
officecli get model.xlsx "/Income Statement/B3"
# Expected: formula="=Assumptions!B3"   BROKEN if: formula="=Assumptions\!B3"
```

**SaaS Revenue Pattern:** For subscription models, use bottoms-up: Starting Customers, + New Customers, - Churned (`=Prior*ChurnRate`), = Ending Customers, Average Customers (`=(Starting+Ending)/2`), Revenue (`=AvgCustomers*ARPU*12`). Place customer metrics on Assumptions, revenue formula on IS.

**SaaS ARR Waterfall:** For SaaS/subscription models, always include an ARR waterfall section on the Revenue or Assumptions sheet. Standard row structure:

| Row | Label | Formula |
|-----|-------|---------|
| 1 | Beginning ARR | Hardcoded (Year 1) or `=Prior Year Ending ARR` |
| 2 | New ARR (+) | From Assumptions (new bookings) |
| 3 | Expansion ARR (+) | From Assumptions (upsell/cross-sell) |
| 4 | Churn ARR (-) | `=-Beginning ARR * ChurnRate` (negative value) |
| 5 | Net New ARR | `=New ARR + Expansion ARR + Churn ARR` |
| 6 | Ending ARR | `=Beginning ARR + Net New ARR` |

```bash
# Example: ARR Waterfall on Revenue sheet, rows 4-9
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Revenue/A4","props":{"value":"Beginning ARR","bold":false}},
  {"command":"set","path":"/Revenue/B4","props":{"formula":"=Assumptions!B50"}},
  {"command":"set","path":"/Revenue/C4","props":{"formula":"=B9"}},
  {"command":"set","path":"/Revenue/D4","props":{"formula":"=C9"}},
  {"command":"set","path":"/Revenue/A5","props":{"value":"New ARR (+)"}},
  {"command":"set","path":"/Revenue/B5","props":{"formula":"=Assumptions!B51"}},
  {"command":"set","path":"/Revenue/C5","props":{"formula":"=Assumptions!C51"}},
  {"command":"set","path":"/Revenue/D5","props":{"formula":"=Assumptions!D51"}},
  {"command":"set","path":"/Revenue/A6","props":{"value":"Expansion ARR (+)"}},
  {"command":"set","path":"/Revenue/B6","props":{"formula":"=Assumptions!B52"}},
  {"command":"set","path":"/Revenue/C6","props":{"formula":"=Assumptions!C52"}},
  {"command":"set","path":"/Revenue/D6","props":{"formula":"=Assumptions!D52"}},
  {"command":"set","path":"/Revenue/A7","props":{"value":"Churn ARR (-)"}},
  {"command":"set","path":"/Revenue/B7","props":{"formula":"=-B4*Assumptions!B53"}},
  {"command":"set","path":"/Revenue/C7","props":{"formula":"=-C4*Assumptions!C53"}},
  {"command":"set","path":"/Revenue/D7","props":{"formula":"=-D4*Assumptions!D53"}},
  {"command":"set","path":"/Revenue/A8","props":{"value":"Net New ARR","bold":true}},
  {"command":"set","path":"/Revenue/B8","props":{"formula":"=B5+B6+B7"}},
  {"command":"set","path":"/Revenue/C8","props":{"formula":"=C5+C6+C7"}},
  {"command":"set","path":"/Revenue/D8","props":{"formula":"=D5+D6+D7"}},
  {"command":"set","path":"/Revenue/A9","props":{"value":"Ending ARR","bold":true}},
  {"command":"set","path":"/Revenue/B9","props":{"formula":"=B4+B8"}},
  {"command":"set","path":"/Revenue/C9","props":{"formula":"=C4+C8"}},
  {"command":"set","path":"/Revenue/D9","props":{"formula":"=D4+D8"}}
]
EOF
```

Assumptions rows needed: B50=Beginning ARR (Year 1 hardcoded), B51:D51=New ARR inputs, B52:D52=Expansion ARR inputs, B53:D53=Churn Rate (as decimal, e.g. 0.05 = 5% annual churn). Adjust row numbers to match your Assumptions sheet layout.

> **Year 2+ Beginning ARR — 必须引用前年 Ending ARR，禁止在 Assumptions 中设独立输入**
>
> Year 2 Beginning ARR = Year 1 Ending ARR（直接公式引用，不要在 Assumptions 中设立独立的 "Year 2 Opening ARR" 输入字段）。
> 在 Assumptions 中设立独立输入会产生双源不一致风险：若两处数值不同步，waterfall 将从 Year 2 起出现跳跃缺口。
>
> 正确做法（参见上方代码示例）：
> - `C4` = `=B9`（Year 2 Beginning ARR = Year 1 Ending ARR，引用上一年的 Ending ARR 单元格）
> - `D4` = `=C9`（Year 3 Beginning ARR = Year 2 Ending ARR）
>
> **只有 Year 1 Beginning ARR（B4）才从 Assumptions 读取**（`=Assumptions!B50`），Year 2+ 均从 waterfall 自身的 Ending ARR 行引用。

**Historical Actuals:** For DCF models with historical columns (2023A, 2024A), hardcode actual values with blue font (`0000FF`). Projected columns use formulas with black font. Label headers with "A" suffix for actuals, "E" for estimates.

Continue: Gross Profit (`=B3+B4`), OpEx lines, EBITDA, D&A, EBIT, Interest, EBT, Tax (`=-EBT*TaxRate`), Net Income. Verify after each batch:

**Sign convention (critical):** Revenue is positive. COGS, OpEx, D&A, Interest are **negative** values. This means `=Gross Profit + Total OpEx` works as a simple sum only if OpEx cells contain negative numbers. `EBITDA = =B5+B10` where B5=GrossProfit and B10=TotalOpEx (negative) gives the correct result. If OpEx rows hold positive values, use subtraction: `=B5-B10`.

```bash
officecli get model.xlsx "/Income Statement/B3"
# Must contain "Assumptions!" without backslash
```

### B.3 Balance Sheet

> **WARNING: Cash Line Circularity.** NEVER use cash-as-plug. BS Cash ALWAYS equals CF Ending Cash (`=Cash Flow!B19`), including Year 1. The CF statement handles opening balance internally (Opening Cash + Net Cash Flow = Ending Cash). Never reference Assumptions for BS Cash directly.

```bash
officecli set model.xlsx "/Balance Sheet/A4" --prop value=Cash
officecli set model.xlsx "/Balance Sheet/B4" --prop "formula==Cash Flow!B19"
officecli set model.xlsx "/Balance Sheet/C4" --prop "formula==Cash Flow!C19"
officecli set model.xlsx "/Balance Sheet/A5" --prop value="Accounts Receivable"
officecli set model.xlsx "/Balance Sheet/B5" --prop "formula==Income Statement!B3*Assumptions!B20/365"
officecli set model.xlsx "/Balance Sheet/A6" --prop value="PP&E (net)"
officecli set model.xlsx "/Balance Sheet/B6" --prop "formula==Assumptions!B15"
officecli set model.xlsx "/Balance Sheet/C6" --prop "formula==B6+Assumptions!C16-Income Statement!C12"
officecli set model.xlsx "/Balance Sheet/A18" --prop value="Balance Check" --prop bold=true
officecli set model.xlsx "/Balance Sheet/B18" --prop formula="=ROUND(B10-B15-B17,0)=0"
```

> **⚠️ Balance Check — 必须使用独立计算路径（HARD RULE）**
>
> Balance check 公式必须分别独立计算 Assets 合计与 Liabilities+Equity 合计，然后做差值。**严禁使用恒真式（tautological formula）**。
>
> | 类型 | 公式示例 | 问题 |
> |------|---------|------|
> | ANTI-PATTERN（恒真式） | `=IF(B10=B10, "Balanced", "Error")` | 两侧引用同一公式，永远为 TRUE，无论 BS 是否真正平衡 |
> | ANTI-PATTERN（恒零差） | `=SUM(B5:B10)-SUM(B5:B10)` | 同一区域相减，永远为 0 |
> | CORRECT | `=ROUND(TotalAssets - (TotalLiabilities + TotalEquity), 0) = 0` | 分别引用 Assets 小计行与 Liabilities/Equity 小计行，差值为 0 才是真正平衡 |
>
> **正确做法：**
> - `TotalAssets` = 所有资产行的独立 SUM（如 `=SUM(B4:B9)`）
> - `TotalLiabilities` = 所有负债行的独立 SUM（如 `=SUM(B12:B14)`）
> - `TotalEquity` = 所有股本行的独立 SUM（如 `=SUM(B16:B17)`）
> - Balance Check = `=ROUND(TotalAssets - (TotalLiabilities + TotalEquity), 0) = 0`
>
> 若 check 显示 FALSE，立即停止交付，检查各行公式。

**PP&E Roll-Forward:** Opening PP&E + CapEx - D&A = Closing PP&E. Year 1 opening = Assumptions starting PP&E. D&A formula: `=Opening*DepreciationRate` (from Assumptions). The D&A value feeds both IS (expense) and BS (reducing PP&E). Balance check (B10=Total Assets, B15=Total Liabilities, B17=Total Equity) must evaluate to TRUE. Replicate across all year columns.

> **Opening Shareholders' Equity（期初股本）必须与期初资产平衡**
>
> Opening Equity = Opening Assets - Opening Liabilities
> = (Opening Cash + Opening PP&E net + Other Opening Assets) - (Opening Long-Term Debt + Opening Other Liabilities)
>
> 此值必须通过公式计算（引用 Assumptions 中的期初资产和负债项目），**不得直接填入估算值**。
>
> 原因：硬编码的期初股本几乎必然与期初资产/负债不匹配，导致 Balance Check Year 1 = FALSE，且该误差会传播到所有后续年份（因为 Year 2 期初股本 = Year 1 期末股本）。
>
> 正确做法：
> ```bash
> # Opening Equity = Opening Assets - Opening Liabilities (从 Assumptions 引用)
> officecli set model.xlsx "/Balance Sheet/B17" --prop "formula==Assumptions!B10+Assumptions!B15-Assumptions!B40"
> # 其中 B10=Opening Cash, B15=Opening PP&E, B40=Opening Long-Term Debt
> # 调整行号以匹配你的 Assumptions 布局
> ```
> **验证**：设置后立即检查 Balance Check 是否为 TRUE。若 Year 1 = FALSE，首先检查期初股本公式。

### B.4 Cash Flow Statement

Operating (Net Income + D&A +/- NWC changes), Investing (-CapEx), Financing. Include reconciliation check:

```bash
officecli set model.xlsx "/Cash Flow/A4" --prop value="Net Income"
officecli set model.xlsx "/Cash Flow/B4" --prop "formula==Income Statement!B20"
officecli set model.xlsx "/Cash Flow/A5" --prop value="Add: D&A"
officecli set model.xlsx "/Cash Flow/B5" --prop "formula==Income Statement!B12"
officecli set model.xlsx "/Cash Flow/A6" --prop value="Change in Working Capital"
officecli set model.xlsx "/Cash Flow/B6" --prop "formula==-(Balance Sheet!B5-0)+(Balance Sheet!B13-0)"
officecli set model.xlsx "/Cash Flow/A8" --prop value="Cash from Operations"
officecli set model.xlsx "/Cash Flow/B8" --prop formula="=SUM(B4:B6)"
officecli set model.xlsx "/Cash Flow/A11" --prop value=CapEx
officecli set model.xlsx "/Cash Flow/B11" --prop "formula==-Assumptions!B16"
officecli set model.xlsx "/Cash Flow/A15" --prop value="Net Cash Flow"
officecli set model.xlsx "/Cash Flow/B15" --prop formula="=B8+B11"
officecli set model.xlsx "/Cash Flow/A17" --prop value="Opening Cash"
officecli set model.xlsx "/Cash Flow/B17" --prop "formula==Assumptions!B10"
officecli set model.xlsx "/Cash Flow/C17" --prop formula="=B19"
officecli set model.xlsx "/Cash Flow/A19" --prop value="Ending Cash"
officecli set model.xlsx "/Cash Flow/B19" --prop formula="=B17+B15"
officecli set model.xlsx "/Cash Flow/A21" --prop value="Reconciliation Check"
officecli set model.xlsx "/Cash Flow/B21" --prop "formula==B19=Balance Sheet!B4"
```

Reconciliation check must evaluate to TRUE: CF ending cash = BS cash for every period. Replicate B columns across C, D for each year.

### B.5 Cross-Sheet Formula Patterns (CRITICAL)

> **#1 risk area.** The `!` in cross-sheet refs (e.g., `Assumptions!B3`) can be corrupted by shell escaping. ALWAYS use heredoc batch.

> **⚠️ Sheet names with special characters** (`&`, spaces, parentheses, etc.) **MUST be wrapped in single quotes** in Excel formulas:
> - Sheet named `P&L` → reference as `'P&L'!B3` (NOT `P&L!B3`)
> - Sheet named `Income Statement` → reference as `'Income Statement'!B3`
> - Sheet names without special characters (e.g., `Assumptions`) → no quotes needed
>
> Using `P&L!B3` without quotes causes `#NAME?` errors at runtime. These errors are NOT detectable by `officecli query` or `validate` — only visible in screenshots or when opening in Excel.

> **⚠️ Sheet names with spaces in CLI path arguments (HARD RULE)**
>
> When using `officecli get`, `officecli set`, or any command where the path includes a sheet name with spaces, the **sheet name portion must be wrapped in single quotes inside the path string**:
>
> ```bash
> # WRONG — Err:509 because shell treats the space as a separator
> officecli get model.xlsx "/Cash Flow/A1"
>
> # CORRECT — single quotes wrap only the sheet name portion
> officecli get model.xlsx "'/Cash Flow/A1'"
> officecli get model.xlsx "'/ARR Waterfall/B5'"
>
> # Also correct in shell using single-quoted outer string
> officecli set model.xlsx "'/Cash Flow/B19'" --prop formula="=B17+B15"
> ```
>
> In JSON batch operations, paths inside JSON strings do NOT need this extra quoting — the JSON string boundary already prevents shell splitting:
> ```json
> {"command":"set","path":"/Cash Flow/B19","props":{"formula":"=B17+B15"}}
> ```

**Correct pattern:**

```bash
# Sheet names WITHOUT special chars — no quotes needed
officecli set model.xlsx "/Assumptions/B3" --prop "formula==Assumptions!B3"

# Sheet names WITH special chars (& or spaces) — must quote
officecli set model.xlsx "/KPIs/B4" --prop "formula=='P&L'!B4/Assumptions!B3"
officecli set model.xlsx "/KPIs/C4" --prop "formula=='Income Statement'!C20"
```

**Verification (MANDATORY after every cross-sheet batch):**

```bash
officecli get model.xlsx "/Income Statement/B3"
# Expected: formula="=Assumptions!B3"
# BROKEN:  formula="=Assumptions\!B3"  <-- CORRUPTED
```

**Recovery if `\!` found:** Delete corrupted cells (`--prop value=""`), re-run batch, verify again.

### B.6 Error Check Sheet

Consolidate all integrity checks. Link to BS balance check and CF reconciliation rows, add ISERROR scan:

```bash
officecli set model.xlsx "/Error Checks/A3" --prop value="Balance Sheet Balances?"
officecli set model.xlsx "/Error Checks/B3" --prop "formula==Balance Sheet!B18"
officecli set model.xlsx "/Error Checks/A4" --prop value="Cash Reconciles?"
officecli set model.xlsx "/Error Checks/B4" --prop "formula==Cash Flow!B21"
officecli set model.xlsx "/Error Checks/A5" --prop value="Formula Errors?"
officecli set model.xlsx "/Error Checks/B5" --prop "formula==SUMPRODUCT(--(ISERROR(Income Statement!B3:D20)))"
officecli set model.xlsx "/Error Checks/A7" --prop value="Overall Status" --prop bold=true
officecli set model.xlsx "/Error Checks/B7" --prop formula="=IF(AND(B3,B4,B5=0),\"ALL CLEAR\",\"ERRORS FOUND\")"
```

Extend across all year columns and include all checks in the AND formula.

### B.7 Monthly Layout Pattern (SaaS / Subscription Models)

For models that need monthly granularity (e.g., 3-year SaaS bottoms-up), use monthly columns instead of annual B/C/D.

**Column mapping — 36-month layout:**

| Year | Months | Columns | Annual Rollup |
|------|--------|---------|---------------|
| Year 1 | Jan–Dec | B–M (12 cols) | AN (or separate section) |
| Year 2 | Jan–Dec | N–Y (12 cols) | AO |
| Year 3 | Jan–Dec | Z–AK (12 cols) | AP |

Row 3: month headers (`Jan-Y1`, `Feb-Y1`, ..., `Dec-Y3`). Row 4+: data rows.

**Annual rollup placement:** Place annual summary columns immediately after the last month column (`AL`, `AM`, `AN`) with `SUM` formulas. Add a bold header row to distinguish:

```bash
# Annual summary header
officecli set model.xlsx '/Revenue/AL2' --prop value="Year 1 Total" --prop bold=true
officecli set model.xlsx '/Revenue/AM2' --prop value="Year 2 Total" --prop bold=true
officecli set model.xlsx '/Revenue/AN2' --prop value="Year 3 Total" --prop bold=true

# Annual sum (Monthly Revenue row = row 10 in this example)
officecli set model.xlsx '/Revenue/AL10' --prop formula="=SUM(B10:M10)"
officecli set model.xlsx '/Revenue/AM10' --prop formula="=SUM(N10:Y10)"
officecli set model.xlsx '/Revenue/AN10' --prop formula="=SUM(Z10:AK10)"
```

**Formula propagation across months:** Month 1 formulas reference Assumptions directly. Month 2+ use prior-month references. Build in batch chunks of 12 (one year per batch):

```bash
# Year 1, months 2-12 (C through M) — all reference column B as prior month
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Revenue/C4","props":{"formula":"=B7"}},
  {"command":"set","path":"/Revenue/C5","props":{"formula":"=C4*Assumptions!B4"}},
  {"command":"set","path":"/Revenue/C6","props":{"formula":"=ROUND(C4*Assumptions!B7,0)"}},
  {"command":"set","path":"/Revenue/C7","props":{"formula":"=C4+C5-C6"}},
  {"command":"set","path":"/Revenue/C8","props":{"formula":"=(C4+C7)/2"}},
  {"command":"set","path":"/Revenue/C9","props":{"formula":"=Assumptions!B6"}},
  {"command":"set","path":"/Revenue/C10","props":{"formula":"=C8*C9"}}
]
EOF
# Repeat for columns D through M (months 3-12), then N-Y (Year 2), Z-AK (Year 3)
```

**Downstream sheets:** Annual IS/P&L sheets reference the rollup columns (`AL`/`AM`/`AN`), not individual months:

```bash
officecli set model.xlsx '/P&L/B4' --prop formula="=Revenue!AL10"
officecli set model.xlsx '/P&L/C4' --prop formula="=Revenue!AM10"
officecli set model.xlsx '/P&L/D4' --prop formula="=Revenue!AN10"
```

---

## Section C: Advanced Patterns

### C.1 DCF Valuation

**WACC + DCF in one batch** (CAPM cost of equity, after-tax cost of debt, discount factors, terminal value, equity bridge):

```bash
officecli set model.xlsx /WACC/A3 --prop value="Cost of Equity (CAPM)"
officecli set model.xlsx /WACC/B3 --prop "formula==Assumptions!B25+Assumptions!B27*Assumptions!B26"
officecli set model.xlsx /WACC/A4 --prop value="After-Tax Cost of Debt"
officecli set model.xlsx /WACC/B4 --prop "formula==Assumptions!B28*(1-Assumptions!B29)"
officecli set model.xlsx /WACC/A5 --prop value=WACC
officecli set model.xlsx /WACC/B5 --prop "formula==Assumptions!B30*B3+(1-Assumptions!B30)*B4"
```

```bash
officecli set model.xlsx "/DCF Valuation/A3" --prop value="Discount Factor"
officecli set model.xlsx "/DCF Valuation/B3" --prop "formula==1/(1+WACC!B5)^1"
officecli set model.xlsx "/DCF Valuation/C3" --prop "formula==1/(1+WACC!B5)^2"
officecli set model.xlsx "/DCF Valuation/A4" --prop value="PV of FCF"
officecli set model.xlsx "/DCF Valuation/B4" --prop "formula==Free Cash Flow!B8*B3"
officecli set model.xlsx "/DCF Valuation/A6" --prop value="Terminal Value (Gordon Growth)"
officecli set model.xlsx "/DCF Valuation/B6" --prop "formula==Free Cash Flow!E8*(1+Assumptions!B31)/(WACC!B5-Assumptions!B31)"
officecli set model.xlsx "/DCF Valuation/A7" --prop value="PV of Terminal Value"
officecli set model.xlsx "/DCF Valuation/B7" --prop formula="=B6*E3"
officecli set model.xlsx "/DCF Valuation/A9" --prop value="Enterprise Value"
officecli set model.xlsx "/DCF Valuation/B9" --prop formula="=SUM(B4:F4)+B7"
officecli set model.xlsx "/DCF Valuation/A10" --prop value="Equity Value"
officecli set model.xlsx "/DCF Valuation/B10" --prop "formula==B9-Assumptions!B32"
officecli set model.xlsx "/DCF Valuation/A11" --prop value="Per Share"
officecli set model.xlsx "/DCF Valuation/B11" --prop "formula==B10/Assumptions!B33"
```

Extend discount factors and PV rows across all projection years (C3, D3... and C4, D4...).

### C.2 Sensitivity Table (2-Variable)

> **WARNING:** Each cell must contain a **self-contained formula** substituting row/column header values. No Excel DATA TABLE. This is the most verbose build section.

Set up headers (WACC values in column A rows 4-8, TGR values in row 3 columns B-F), then build grid cells. Each cell is a self-contained formula using `$A4` (absolute column for WACC) and `B$3` (absolute row for TGR):

```bash
officecli set model.xlsx /Sensitivity/A3 --prop value="WACC \ TGR" --prop bold=true
officecli set model.xlsx /Sensitivity/B3 --prop value=0.015
officecli set model.xlsx /Sensitivity/C3 --prop value=0.020
officecli set model.xlsx /Sensitivity/D3 --prop value=0.025
officecli set model.xlsx /Sensitivity/A4 --prop value=0.080
officecli set model.xlsx /Sensitivity/A5 --prop value=0.100
officecli set model.xlsx /Sensitivity/A6 --prop value=0.120
officecli set model.xlsx /Sensitivity/B4 --prop "formula==(SUM(DCF Valuation!B4:F4)+(Free Cash Flow!F8*(1+B$3)/($A4-B$3))*DCF Valuation!F3-Assumptions!B32)/Assumptions!B33"
officecli set model.xlsx /Sensitivity/C4 --prop "formula==(SUM(DCF Valuation!B4:F4)+(Free Cash Flow!F8*(1+C$3)/($A4-C$3))*DCF Valuation!F3-Assumptions!B32)/Assumptions!B33"
```

Replicate formula across all grid cells, building each row as a separate batch (8-12 ops). After building, add color scale for heat-map:

```bash
officecli add model.xlsx /Sensitivity --type colorscale \
  --prop sqref=B4:F8 --prop mincolor=FFCDD2 --prop midcolor=FFFFFF --prop maxcolor=C8E6C9
```

The center cell (base case WACC + TGR) must match the DCF sheet valuation -- primary correctness check.

**Non-DCF Sensitivity (e.g., Revenue Growth vs Gross Margin -> EBITDA):** Same grid structure but each cell computes: `=BaseRevenue*(1+$A4)*B$3-FixedCosts` where $A4 = revenue growth rate, B$3 = gross margin. Reference active scenario values (Section C.3) so the grid updates with scenario switching.

### C.3 Scenario Switching (Multi-Year, Multi-Assumption)

Data validation dropdown in B1 drives the entire model. Structure: for EACH assumption, provide Base/Bull/Bear rows for EACH year, then an "Active" row with IF formulas. All downstream sheets reference only the Active rows.

**Step 1: Dropdown**

```bash
officecli set model.xlsx "/Scenarios/B1" --prop value=Base
officecli add model.xlsx /Scenarios --type validation \
  --prop sqref=B1 --prop type=list --prop formula1="Base,Bull,Bear"
```

**Step 2: Scenario data + Active rows** (repeat pattern for each assumption variable):

```bash
officecli set model.xlsx /Scenarios/A3 --prop value=Revenue --prop bold=true
officecli set model.xlsx /Scenarios/A4 --prop value="  Base"
officecli set model.xlsx /Scenarios/A5 --prop value="  Bull"
officecli set model.xlsx /Scenarios/A6 --prop value="  Bear"
officecli set model.xlsx /Scenarios/A7 --prop value="  Active" --prop bold=true
officecli set model.xlsx /Scenarios/B4 --prop value=20000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/C4 --prop value=22000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/D4 --prop value=24000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/B5 --prop value=24000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/C5 --prop value=28000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/D5 --prop value=32000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/B6 --prop value=16000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/C6 --prop value=17000000 --prop font.color=0000FF
officecli set model.xlsx /Scenarios/D6 --prop value=18000000 --prop font.color=0000FF
```

```bash
officecli set model.xlsx /Scenarios/B7 --prop formula="=IF($B$1=\"Base\",B4,IF($B$1=\"Bull\",B5,B6))"
officecli set model.xlsx /Scenarios/C7 --prop formula="=IF($B$1=\"Base\",C4,IF($B$1=\"Bull\",C5,C6))"
officecli set model.xlsx /Scenarios/D7 --prop formula="=IF($B$1=\"Base\",D4,IF($B$1=\"Bull\",D5,D6))"
```

Repeat the Base/Bull/Bear/Active block for each variable (OpEx, Gross Margin, CapEx, etc.). Use accounting format on monetary scenario inputs.

**Step 3: Downstream references** -- ALL statement sheets reference only the Active rows:

```bash
# Income Statement references Active Revenue row
{"command":"set","path":"/Income Statement/B3","props":{"formula":"=Scenarios!B7"}}
```

**Step 4: Sensitivity table integration** -- The sensitivity table must also reference Active scenario values so it updates when the dropdown changes. Replace hardcoded base-case references with Active row references in sensitivity formulas.

### C.4 Cap Table and Waterfall

**Ownership Tracking:** Cap Table sheet tracks shares and percentage ownership per class:

```bash
officecli set model.xlsx "/Cap Table/A3" --prop value=Common
officecli set model.xlsx "/Cap Table/B3" --prop value=8000000
officecli set model.xlsx "/Cap Table/A4" --prop value="Seed Preferred"
officecli set model.xlsx "/Cap Table/B4" --prop value=1500000
officecli set model.xlsx "/Cap Table/A5" --prop value="Series A Preferred"
officecli set model.xlsx "/Cap Table/B5" --prop value=2500000
officecli set model.xlsx "/Cap Table/A7" --prop value="Total Shares"
officecli set model.xlsx "/Cap Table/B7" --prop formula="=SUM(B3:B5)"
officecli set model.xlsx "/Cap Table/C3" --prop formula="=B3/B$7"
officecli set model.xlsx "/Cap Table/C4" --prop formula="=B4/B$7"
officecli set model.xlsx "/Cap Table/C5" --prop formula="=B5/B$7"
```

**Liquidation Preferences:** Define investment amounts (= liquidation preference 1x):

```bash
officecli set model.xlsx "/Cap Table/D3" --prop value=0
officecli set model.xlsx "/Cap Table/D4" --prop value=2000000 --prop font.color=0000FF
officecli set model.xlsx "/Cap Table/D5" --prop value=5000000 --prop font.color=0000FF
```

**Waterfall Analysis (Non-Participating Preferred):** Priority order: Series A 1x first, then Seed 1x, then pro-rata to all. Each class decides: take liquidation preference OR convert to common and share pro-rata. Formula: `=MAX(LiqPref, ExitValue * OwnershipPct)`.

Exit scenario columns (e.g., B=$5M, C=$10M, D=$25M, E=$50M, F=$100M):

```bash
officecli set model.xlsx /Waterfall/B2 --prop value=5000000
officecli set model.xlsx /Waterfall/C2 --prop value=10000000
officecli set model.xlsx /Waterfall/D2 --prop value=25000000
officecli set model.xlsx /Waterfall/E2 --prop value=50000000
officecli set model.xlsx /Waterfall/F2 --prop value=100000000
officecli set model.xlsx /Waterfall/A4 --prop value="Series A Payout"
officecli set model.xlsx /Waterfall/B4 --prop "formula==MAX(Cap Table!D$5, B$2*Cap Table!C$5)"
officecli set model.xlsx /Waterfall/A5 --prop value="Seed Payout"
officecli set model.xlsx /Waterfall/B5 --prop "formula==MAX(Cap Table!D$4, B$2*Cap Table!C$4)"
officecli set model.xlsx /Waterfall/A6 --prop value="Common Payout"
officecli set model.xlsx /Waterfall/B6 --prop formula="=MAX(0, B$2-B4-B5)"
officecli set model.xlsx /Waterfall/A8 --prop value="Total Check"
officecli set model.xlsx /Waterfall/B8 --prop formula="=B4+B5+B6"
```

Replicate B4:B8 formulas across columns C through F for each exit scenario. The `MAX` formula handles the conversion decision automatically: when pro-rata share exceeds liquidation preference, the class converts; otherwise it takes the preference. Total Check must equal the exit value in every column.

> **Note:** For participating preferred (double-dip), replace MAX with: LiqPref + MAX(0, (ExitValue - TotalLiqPrefs) * OwnershipPct).

### C.5 Debt Schedule

Running balance with interest on **opening balance** (avoids circularity):

```bash
officecli set model.xlsx "/Debt Schedule/A3" --prop value="Term Loan A" --prop bold=true
officecli set model.xlsx "/Debt Schedule/A4" --prop value="Opening Balance"
officecli set model.xlsx "/Debt Schedule/B4" --prop "formula==Assumptions!B40"
officecli set model.xlsx "/Debt Schedule/C4" --prop formula="=B6"
officecli set model.xlsx "/Debt Schedule/A5" --prop value="Principal Payment"
officecli set model.xlsx "/Debt Schedule/B5" --prop "formula==-Assumptions!B41"
officecli set model.xlsx "/Debt Schedule/A6" --prop value="Closing Balance"
officecli set model.xlsx "/Debt Schedule/B6" --prop formula="=B4+B5"
officecli set model.xlsx "/Debt Schedule/A7" --prop value="Interest Expense"
officecli set model.xlsx "/Debt Schedule/B7" --prop "formula==B4*Assumptions!B42"
```

Closing balance period N = Opening balance period N+1 (continuity check). Interest on opening balance, NOT average -- avoids circularity.

**Revolver:** Available = Facility Limit - Term Loan Outstanding. Draw/Repay = `MIN(CashShortfall, Available)`. Interest = Opening Revolver Balance * Revolver Rate. Place after Term Loan on the same Debt Schedule sheet.

### C.6 Working Capital Model

AR = Revenue x DSO/365, Inventory = COGS x DIO/365, AP = COGS x DPO/365. Net WC = AR + Inv - AP. Delta NWC = current period NWC - prior period NWC. Delta NWC feeds into Cash Flow from Operations.

> **⚠️ WARNING: AP 公式符号必须取负**
>
> AP（Accounts Payable，应付账款）在资产负债表上是**负债（正值）**，但在 NWC 公式中起**减项**作用。公式必须对 COGS 取负：
>
> | 行 | 正确公式 | 错误公式 | 原因 |
> |---|---------|---------|------|
> | AR | `=Revenue * DSO/365` | — | AR 是资产，正值 |
> | Inventory | `=-COGS * DIO/365` | `=COGS * DIO/365` | COGS 为负数，取负后 Inventory 为正值 |
> | AP | `=-COGS * DPO/365` | `=COGS * DPO/365` | COGS 为负数，取负后 AP 为正值；若 COGS 含正号则直接使用 `=COGS * DPO/365` |
>
> **规则：AP 的计算结果必须为正数（表示公司欠供应商的钱）。**
> 若 COGS 行存储负值（如 `-500,000`），则 AP 公式必须取负：`=-COGS*DPO/365`。
> 若 COGS 行存储正值（如 `500,000`），则 AP 公式直接乘：`=COGS*DPO/365`。
> 使用错误符号会导致 NWC 高估、Cash Flow from Operations 方向错误，文件数值不可用。

```bash
officecli set model.xlsx "/Working Capital/A3" --prop value="Accounts Receivable"
officecli set model.xlsx "/Working Capital/B3" --prop "formula==Income Statement!B3*Assumptions!B20/365"
officecli set model.xlsx "/Working Capital/A4" --prop value=Inventory
officecli set model.xlsx "/Working Capital/B4" --prop "formula==-Income Statement!B4*Assumptions!B21/365"
officecli set model.xlsx "/Working Capital/A5" --prop value="Accounts Payable"
officecli set model.xlsx "/Working Capital/B5" --prop "formula==-Income Statement!B4*Assumptions!B22/365"
officecli set model.xlsx "/Working Capital/A7" --prop value="Net Working Capital"
officecli set model.xlsx "/Working Capital/B7" --prop formula="=B3+B4-B5"
officecli set model.xlsx "/Working Capital/A8" --prop value="Change in NWC"
officecli set model.xlsx "/Working Capital/B8" --prop formula="=-B7"
officecli set model.xlsx "/Working Capital/C8" --prop formula="=-(C7-B7)"
```

> **Year 1 Change in NWC:** `=-B7` (no prior period, so all Y1 NWC is a cash outflow). Year 2+: `=-(CurrentNWC - PriorNWC)`. Negative sign because NWC increase = cash outflow.

### C.7 Break-Even Analysis

Fixed Costs / Contribution Margin = Break-Even Units. Key formulas: `Fixed Costs = OpEx + D&A`, `Contribution Margin = Price x Gross Margin`, `Break-Even Units = IFERROR(FixedCosts/ContribMargin,0)`, `Break-Even Revenue = Units x Price`. Show for each scenario if applicable.

---

## Section D: Charts

### D.1 Financial Chart Types

| Data Pattern | Chart Type | Use Case |
|-------------|-----------|----------|
| Revenue + margin trend | `combo` | Revenue bars (left) + Margin line (right) |
| Values over time | `column` | Revenue by year or scenario comparison |
| Trend line | `line` | Cash balance, cumulative FCF |
| Cash progression | `area` | Cash balance over time |
| P&L bridge | `waterfall` | Revenue breakdown, cost waterfall |

### D.2 Chart Recipes

Always use cell range references and `preset=dashboard`. Layout: left chart x=0, right chart x=11.

```bash
officecli add model.xlsx /Dashboard --type chart \
  --prop chartType=column --prop title="Revenue by Year" \
  --prop series1.name="Revenue" --prop series1.values="Income Statement!B3:D3" \
  --prop series1.categories="Income Statement!B2:D2" \
  --prop preset=dashboard --prop axisNumFmt='$#,##0' \
  --prop x=0 --prop y=1 --prop width=10 --prop height=15
```

### D.3 Dual-Axis Combo Chart

`comboSplit=1` = first N series are bars, rest are lines. `secondary=2` = series 2 on right axis. Always use both.

```bash
officecli add model.xlsx /Dashboard --type chart \
  --prop chartType=combo --prop title="Revenue & EBITDA Margin" \
  --prop series1.name="Revenue" --prop series1.values="Income Statement!B3:D3" \
  --prop series2.name="EBITDA Margin" --prop series2.values="Income Statement!B16:D16" \
  --prop series1.categories="Income Statement!B2:D2" \
  --prop comboSplit=1 --prop secondary=2 --prop preset=dashboard \
  --prop x=0 --prop y=17 --prop width=10 --prop height=15
```

---

## Section E: Quality and Polish

### E.1 Named Ranges

Required for key assumptions. Define after formulas are in place. The presence of named ranges determines the calcPr xpath (always `//x:definedNames` for financial models).

```bash
officecli add model.xlsx / --type namedrange --prop name=RevenueGrowth --prop ref="Assumptions!B2:D2"
officecli add model.xlsx / --type namedrange --prop name=GrossMargin --prop ref="Assumptions!B5:D5"
officecli add model.xlsx / --type namedrange --prop name=TaxRate --prop ref="Assumptions!B8:D8"
officecli add model.xlsx / --type namedrange --prop name=WACC --prop ref="WACC!B5"
officecli add model.xlsx / --type namedrange --prop name=TerminalGrowth --prop ref="Assumptions!B31"
```

### E.2 Freeze Panes, Validation, Protection, Grouping, Print Area

Apply these to every sheet as part of build step 8-10:

```bash
# Freeze panes (every sheet): freeze=B2 or freeze=B3
officecli set model.xlsx "/Assumptions" --prop freeze=B2
officecli set model.xlsx "/Income Statement" --prop freeze=B3
# Data validation: type=list (dropdowns), type=decimal (rates 0-1), type=whole (counts)
officecli add model.xlsx /Assumptions --type validation \
  --prop sqref=B2:D2 --prop type=decimal --prop min=0 --prop max=1
# Protection: unlock inputs, then protect each sheet
officecli set model.xlsx "/Assumptions/B2:D15" --prop locked=false
officecli set model.xlsx "/Income Statement" --prop protect=true
# Row grouping: outline=1 on detail rows under subtotals
officecli set model.xlsx "/Income Statement/row[5]" --prop outline=1
# Print area
officecli set model.xlsx "/Income Statement" --prop printArea="A1:D25"
```

### E.7 raw-set Final Steps (MUST BE LAST)

> **CRITICAL:** Run after ALL sheets, formulas, charts, named ranges, and protection.

```bash
# Active tab (0-based)
officecli raw-set model.xlsx /workbook \
  --xpath "//x:sheets" --action insertbefore \
  --xml '<bookViews><workbookView activeTab="0" /></bookViews>'
# calcPr -- use high-level set API (do NOT use raw-set, which creates duplicate calcPr elements)
officecli set model.xlsx / --prop calc.fullCalcOnLoad=true --prop calc.iterate=true --prop calc.iterateCount=100 --prop calc.iterateDelta=0.001
# Validate immediately
officecli validate model.xlsx
```

If validation fails, verify named ranges with explicit path: `officecli get model.xlsx '/namedrange[1]'`. Note: `--depth 1` tree output does NOT include named ranges — always use `/namedrange[N]` path for verification.

### E.8 QA Checklist

Copy-pasteable sequence. Run after every build:

```bash
officecli validate model.xlsx                                    # 1. Zero errors
officecli query model.xlsx 'cell:contains("#REF!")'              # 2. Formula errors
officecli query model.xlsx 'cell:contains("#DIV/0!")'
officecli query model.xlsx 'cell:contains("#VALUE!")'
officecli query model.xlsx 'cell:contains("#NAME?")'
officecli query model.xlsx 'cell:contains("#N/A")'
officecli get model.xlsx "/Income Statement/B3"                  # 3. Cross-sheet integrity
officecli get model.xlsx "/Cash Flow/B4"                         #    (no backslash before !)
officecli get model.xlsx "/Balance Sheet/B18" --json             # 4. Balance check = TRUE
officecli get model.xlsx "/Cash Flow/B21" --json                 # 5. Cash reconciliation = TRUE
officecli get model.xlsx '/namedrange[1]'                         # 6. Named ranges exist (--depth 1 does NOT show them)
officecli get model.xlsx '/Dashboard/chart[1]' --json             # 7. Charts have data
officecli get model.xlsx "/Income Statement/B20" --json          # 8. Key cells are formulas
officecli view model.xlsx text                                   # 9. Visual check (formulas blank = normal)

# 10. MANDATORY screenshot check — required when model contains sheet names with special chars
# officecli query and validate CANNOT detect #NAME? runtime errors caused by unquoted sheet refs.
# These errors are ONLY visible in screenshots or when opening in Excel/WPS.
# Run this step if ANY sheet name contains: & + spaces + parentheses (e.g. "P&L", "Income Statement")
cd /Users/veryliu && node /Users/veryliu/Documents/GitHub/OfficeCli/scripts/screenshot.mjs xlsx model.xlsx ./screenshots
# Then visually inspect screenshots for: #NAME?  #REF!  #VALUE!  #DIV/0!
# Pay special attention to: KPIs sheet, Error Checks sheet, any sheet that cross-references P&L or
# sheets with special characters in their names.
# If #NAME? appears: check that all cross-sheet formulas use single-quoted sheet names (see B.5).
```

> **⚠️ 为什么必须截图？** `officecli query` 扫描的是存储的公式字符串（如 `=P&L!B3`），不执行公式。而 `=P&L!B3`（无引号）在 Excel 运行时会求值为 `#NAME?`，但在 CLI 层面完全透明。只有通过截图或实际打开文件才能发现此类运行时错误。**含特殊字符 sheet 名的模型，截图验证是强制步骤，不可跳过。**

---

## Section F: Known Issues and Workarounds

| # | Issue | Workaround |
|---|-------|------------|
| F-1 | `!` escaping in cross-sheet formulas | Always use heredoc batch. Verify with `officecli get`. If `\!` appears, delete and re-run. |
| F-2 | Batch failure at scale | Use resident mode (`open`/`close`) + batch chunks of 15–20 ops. If a batch still fails with "Failed to send to resident", split into smaller chunks and retry. Fall back to individual commands only as last resort. |
| F-3 | calcPr duplicate elements | Use `set / --prop calc.fullCalcOnLoad=true` (high-level API). Do NOT use raw-set to insert calcPr — it creates duplicates. |
| F-3a | Sheet names with `&` or spaces cause `#NAME?` | Wrap in single quotes: `'P&L'!B3`, `'Income Statement'!C4`. Plain `P&L!B3` fails silently — error only visible in screenshots, not in `validate` or `query`. |
| F-4 | No auto-fit column width | Set explicitly: labels=24-28, numbers=14-18. |
| F-5 | Cannot rename sheets | Plan names upfront. Create with correct name. |
| F-6 | Sensitivity tables are manual | Each cell = explicit self-contained formula. Build row-by-row in separate batches. |
| F-7 | Chart series fixed at creation | Plan all series before `add`. Delete and recreate if wrong. |
| F-8 | Formula cached values blank | `view text` shows blank for formulas. Normal. fullCalcOnLoad ensures calc on open. |
| F-9 | formulacf no font.bold | Use `fill` + `font.color` only. `font.bold` causes validation errors. |
| F-10 | Number format `$` quoting | Use heredoc batch or single quotes: `--prop numFmt='$#,##0'`. |
| F-11 | Waterfall chart totals | Cannot mark as totals. Use totalColor property for visual convention. |
| F-12 | Circular references | Set `iterate="1"` in calcPr. Avoid: use prior-period cash + net CF, interest on opening balance. |
| F-13 | Chart title `$` stripping | Shell expands `$` in `--prop title`. Use heredoc batch for chart titles containing `$`, or omit `$` from titles (e.g., "Exit Waterfall (50M)" not "Exit Waterfall ($50M)"). |
| F-14 | Tautological balance check formula | Balance check formulas must use **independent calculation paths**. ANTI-PATTERN: `=B_assets - B_assets + 1` always equals 1 regardless of whether the BS balances — this is a tautology that provides zero verification value. CORRECT: `=ROUND(TotalAssets - (TotalLiabilities + TotalEquity), 0) = 0` — this equals TRUE only when the BS truly balances. See Pitfall note below. |

> **⚠️ Balance Check Formula Anti-Pattern**
>
> Balance check formulas must be independently verifiable. A tautological formula defeats the entire purpose of the check:
>
> | | Formula | Result | Problem |
> |---|---------|--------|---------|
> | ANTI-PATTERN | `=B19-B19+1` | Always `1` | References the same cell twice — algebraically always equals 1 regardless of actual balance |
> | ANTI-PATTERN | `=SUM(B5:B10)-SUM(B5:B10)` | Always `0` | Same issue — always balanced, never catches errors |
> | CORRECT | `=ROUND(B_total_assets - (B_total_liabilities + B_total_equity), 0) = 0` | `TRUE` only when BS balances | References independent cell ranges for assets vs. liabilities+equity |
>
> The correct formula must reference **separate cell ranges** for total assets and total liabilities+equity. If either side is misstated, the formula evaluates to FALSE — which is the intended behavior.
