<!-- officecli: v1.0.24 -->

# Creating a Financial Model

Complete guide for building formula-driven, multi-sheet financial models from scratch.

> **Prerequisite:** This guide assumes familiarity with officecli batch syntax from [data-dashboard creating.md](../officecli-data-dashboard/creating.md). This guide focuses on what is unique to financial models: formula chains, cross-sheet patterns, financial conventions, sensitivity tables, and scenario switching.

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
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Assumptions/B3:D15","props":{"font.color":"0000FF"}},
  {"command":"set","path":"/Income Statement/B3:D20","props":{"font.color":"000000"}}
]
EOF
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

Row labels (col A): 24-28, year/data columns: 14-18, narrow helpers: 10-12. Set in batch step 2: `{"command":"set","path":"/Income Statement/col[A]","props":{"width":"26"}}`.

### A.6 Subtotal Row Styling

Bold + `border.top=thin` on subtotals (Gross Profit, EBITDA). `border.top=double` on final totals (Net Income, Total Assets). Apply in formatting batch (step 8).

### A.7 Build Order (MANDATORY)

Follow this exact 10-step sequence. Do not reorder.

1. **Create workbook + all sheets** -- Plan names upfront (cannot rename).
2. **Column widths + freeze panes** -- Set on every sheet. `freeze=B2` or `freeze=B3`.
3. **Headers + row labels** -- Section headers, year labels, row names.
4. **Assumptions data** -- Hardcoded inputs (blue font applied later in step 8).
5. **Statement formulas** -- Dependency order: IS, then BS, then CF. Heredoc batch. Verify after each.
6. **Valuation / scenario formulas** -- DCF, sensitivity, scenario switching, error checks.
7. **Named ranges** -- Define for all key assumptions.
8. **Formatting + colors** -- Number formats, blue/black font colors, subtotal styling, tab colors.
9. **Charts** -- Cell range references and `preset=dashboard`.
10. **Protection + raw-set + validate** -- Lock/unlock, protect, activeTab, calcPr (LAST), validate.

---

## Section B: Core Patterns

### B.1 Assumptions Sheet

Create workbook, sheets, then populate. Assumptions is the single source of truth:

```bash
officecli create model.xlsx
officecli add model.xlsx / --type sheet --prop name="Income Statement"
officecli add model.xlsx / --type sheet --prop name="Balance Sheet"
officecli add model.xlsx / --type sheet --prop name="Cash Flow"
officecli add model.xlsx / --type sheet --prop name=Dashboard
officecli remove model.xlsx /Sheet1
officecli add model.xlsx / --type sheet --prop name=Assumptions --prop position=0
```

Populate with sections (Revenue Drivers, Cost Drivers, Working Capital, etc.) -- year columns B/C/D:

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Assumptions/A1","props":{"value":"Revenue Drivers","bold":"true","font.size":"11"}},
  {"command":"set","path":"/Assumptions/B1","props":{"value":"Year 1","bold":"true"}},
  {"command":"set","path":"/Assumptions/C1","props":{"value":"Year 2","bold":"true"}},
  {"command":"set","path":"/Assumptions/D1","props":{"value":"Year 3","bold":"true"}},
  {"command":"set","path":"/Assumptions/A2","props":{"value":"Revenue Growth Rate"}},
  {"command":"set","path":"/Assumptions/B2","props":{"value":"0.15"}},
  {"command":"set","path":"/Assumptions/C2","props":{"value":"0.12"}},
  {"command":"set","path":"/Assumptions/D2","props":{"value":"0.10"}}
]
EOF
```

Continue with Cost Drivers, Working Capital, CapEx, Tax Rate, etc. Add data validation on rates:

```bash
officecli add model.xlsx /Assumptions --type validation \
  --prop sqref=B2:D2 --prop type=decimal --prop min=0 --prop max=1
```

### B.2 Income Statement

All formulas reference Assumptions. Pattern: Revenue row refs Assumptions directly, COGS uses margin, then Gross Profit through Net Income as formulas:

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Income Statement/A3","props":{"value":"Revenue"}},
  {"command":"set","path":"/Income Statement/B3","props":{"formula":"=Assumptions!B3"}},
  {"command":"set","path":"/Income Statement/C3","props":{"formula":"=B3*(1+Assumptions!C2)"}},
  {"command":"set","path":"/Income Statement/A4","props":{"value":"COGS"}},
  {"command":"set","path":"/Income Statement/B4","props":{"formula":"=-B3*(1-Assumptions!B5)"}},
  {"command":"set","path":"/Income Statement/C4","props":{"formula":"=-C3*(1-Assumptions!C5)"}}
]
EOF
```

**SaaS Revenue Pattern:** For subscription models, use bottoms-up: Starting Customers, + New Customers, - Churned (`=Prior*ChurnRate`), = Ending Customers, Average Customers (`=(Starting+Ending)/2`), Revenue (`=AvgCustomers*ARPU*12`). Place customer metrics on Assumptions, revenue formula on IS.

**Historical Actuals:** For DCF models with historical columns (2023A, 2024A), hardcode actual values with blue font (`0000FF`). Projected columns use formulas with black font. Label headers with "A" suffix for actuals, "E" for estimates.

Continue: Gross Profit (`=B3+B4`), OpEx lines, EBITDA, D&A, EBIT, Interest, EBT, Tax (`=-EBT*TaxRate`), Net Income. Verify after each batch:

```bash
officecli get model.xlsx "/Income Statement/B3"
# Must contain "Assumptions!" without backslash
```

### B.3 Balance Sheet

> **WARNING: Cash Line Circularity.** NEVER use cash-as-plug. BS Cash ALWAYS equals CF Ending Cash (`=Cash Flow!B19`), including Year 1. The CF statement handles opening balance internally (Opening Cash + Net Cash Flow = Ending Cash). Never reference Assumptions for BS Cash directly.

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Balance Sheet/A4","props":{"value":"Cash"}},
  {"command":"set","path":"/Balance Sheet/B4","props":{"formula":"=Cash Flow!B19"}},
  {"command":"set","path":"/Balance Sheet/C4","props":{"formula":"=Cash Flow!C19"}},
  {"command":"set","path":"/Balance Sheet/A5","props":{"value":"Accounts Receivable"}},
  {"command":"set","path":"/Balance Sheet/B5","props":{"formula":"=Income Statement!B3*Assumptions!B20/365"}},
  {"command":"set","path":"/Balance Sheet/A6","props":{"value":"PP&E (net)"}},
  {"command":"set","path":"/Balance Sheet/B6","props":{"formula":"=Assumptions!B15"}},
  {"command":"set","path":"/Balance Sheet/C6","props":{"formula":"=B6+Assumptions!C16-Income Statement!C12"}},
  {"command":"set","path":"/Balance Sheet/A18","props":{"value":"Balance Check","bold":"true"}},
  {"command":"set","path":"/Balance Sheet/B18","props":{"formula":"=ROUND(B10-B15-B17,0)=0"}}
]
EOF
```

**PP&E Roll-Forward:** Opening PP&E + CapEx - D&A = Closing PP&E. Year 1 opening = Assumptions starting PP&E. D&A formula: `=Opening*DepreciationRate` (from Assumptions). The D&A value feeds both IS (expense) and BS (reducing PP&E). Balance check (B10=Total Assets, B15=Total Liabilities, B17=Total Equity) must evaluate to TRUE. Replicate across all year columns.

### B.4 Cash Flow Statement

Operating (Net Income + D&A +/- NWC changes), Investing (-CapEx), Financing. Include reconciliation check:

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Cash Flow/A4","props":{"value":"Net Income"}},
  {"command":"set","path":"/Cash Flow/B4","props":{"formula":"=Income Statement!B20"}},
  {"command":"set","path":"/Cash Flow/A5","props":{"value":"Add: D&A"}},
  {"command":"set","path":"/Cash Flow/B5","props":{"formula":"=Income Statement!B12"}},
  {"command":"set","path":"/Cash Flow/A6","props":{"value":"Change in Working Capital"}},
  {"command":"set","path":"/Cash Flow/B6","props":{"formula":"=-(Balance Sheet!B5-0)+(Balance Sheet!B13-0)"}},
  {"command":"set","path":"/Cash Flow/A8","props":{"value":"Cash from Operations"}},
  {"command":"set","path":"/Cash Flow/B8","props":{"formula":"=SUM(B4:B6)"}},
  {"command":"set","path":"/Cash Flow/A11","props":{"value":"CapEx"}},
  {"command":"set","path":"/Cash Flow/B11","props":{"formula":"=-Assumptions!B16"}},
  {"command":"set","path":"/Cash Flow/A15","props":{"value":"Net Cash Flow"}},
  {"command":"set","path":"/Cash Flow/B15","props":{"formula":"=B8+B11"}},
  {"command":"set","path":"/Cash Flow/A17","props":{"value":"Opening Cash"}},
  {"command":"set","path":"/Cash Flow/B17","props":{"formula":"=Assumptions!B10"}},
  {"command":"set","path":"/Cash Flow/C17","props":{"formula":"=B19"}},
  {"command":"set","path":"/Cash Flow/A19","props":{"value":"Ending Cash"}},
  {"command":"set","path":"/Cash Flow/B19","props":{"formula":"=B17+B15"}},
  {"command":"set","path":"/Cash Flow/A21","props":{"value":"Reconciliation Check"}},
  {"command":"set","path":"/Cash Flow/B21","props":{"formula":"=B19=Balance Sheet!B4"}}
]
EOF
```

Reconciliation check must evaluate to TRUE: CF ending cash = BS cash for every period. Replicate B columns across C, D for each year.

### B.5 Cross-Sheet Formula Patterns (CRITICAL)

> **#1 risk area.** The `!` in cross-sheet refs (e.g., `Assumptions!B3`) can be corrupted by shell escaping. ALWAYS use heredoc batch.

**Correct pattern:**

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Income Statement/B3","props":{"formula":"=Assumptions!B3"}},
  {"command":"set","path":"/Cash Flow/B4","props":{"formula":"=Income Statement!B20"}},
  {"command":"set","path":"/Balance Sheet/C4","props":{"formula":"=B4+Cash Flow!C15"}}
]
EOF
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
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Error Checks/A3","props":{"value":"Balance Sheet Balances?"}},
  {"command":"set","path":"/Error Checks/B3","props":{"formula":"=Balance Sheet!B18"}},
  {"command":"set","path":"/Error Checks/A4","props":{"value":"Cash Reconciles?"}},
  {"command":"set","path":"/Error Checks/B4","props":{"formula":"=Cash Flow!B21"}},
  {"command":"set","path":"/Error Checks/A5","props":{"value":"Formula Errors?"}},
  {"command":"set","path":"/Error Checks/B5","props":{"formula":"=SUMPRODUCT(--(ISERROR(Income Statement!B3:D20)))"}},
  {"command":"set","path":"/Error Checks/A7","props":{"value":"Overall Status","bold":"true"}},
  {"command":"set","path":"/Error Checks/B7","props":{"formula":"=IF(AND(B3,B4,B5=0),\"ALL CLEAR\",\"ERRORS FOUND\")"}}
]
EOF
```

Extend across all year columns and include all checks in the AND formula.

---

## Section C: Advanced Patterns

### C.1 DCF Valuation

**WACC + DCF in one batch** (CAPM cost of equity, after-tax cost of debt, discount factors, terminal value, equity bridge):

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/WACC/A3","props":{"value":"Cost of Equity (CAPM)"}},
  {"command":"set","path":"/WACC/B3","props":{"formula":"=Assumptions!B25+Assumptions!B27*Assumptions!B26"}},
  {"command":"set","path":"/WACC/A4","props":{"value":"After-Tax Cost of Debt"}},
  {"command":"set","path":"/WACC/B4","props":{"formula":"=Assumptions!B28*(1-Assumptions!B29)"}},
  {"command":"set","path":"/WACC/A5","props":{"value":"WACC"}},
  {"command":"set","path":"/WACC/B5","props":{"formula":"=Assumptions!B30*B3+(1-Assumptions!B30)*B4"}}
]
EOF
```

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/DCF Valuation/A3","props":{"value":"Discount Factor"}},
  {"command":"set","path":"/DCF Valuation/B3","props":{"formula":"=1/(1+WACC!B5)^1"}},
  {"command":"set","path":"/DCF Valuation/C3","props":{"formula":"=1/(1+WACC!B5)^2"}},
  {"command":"set","path":"/DCF Valuation/A4","props":{"value":"PV of FCF"}},
  {"command":"set","path":"/DCF Valuation/B4","props":{"formula":"=Free Cash Flow!B8*B3"}},
  {"command":"set","path":"/DCF Valuation/A6","props":{"value":"Terminal Value (Gordon Growth)"}},
  {"command":"set","path":"/DCF Valuation/B6","props":{"formula":"=Free Cash Flow!E8*(1+Assumptions!B31)/(WACC!B5-Assumptions!B31)"}},
  {"command":"set","path":"/DCF Valuation/A7","props":{"value":"PV of Terminal Value"}},
  {"command":"set","path":"/DCF Valuation/B7","props":{"formula":"=B6*E3"}},
  {"command":"set","path":"/DCF Valuation/A9","props":{"value":"Enterprise Value"}},
  {"command":"set","path":"/DCF Valuation/B9","props":{"formula":"=SUM(B4:F4)+B7"}},
  {"command":"set","path":"/DCF Valuation/A10","props":{"value":"Equity Value"}},
  {"command":"set","path":"/DCF Valuation/B10","props":{"formula":"=B9-Assumptions!B32"}},
  {"command":"set","path":"/DCF Valuation/A11","props":{"value":"Per Share"}},
  {"command":"set","path":"/DCF Valuation/B11","props":{"formula":"=B10/Assumptions!B33"}}
]
EOF
```

Extend discount factors and PV rows across all projection years (C3, D3... and C4, D4...).

### C.2 Sensitivity Table (2-Variable)

> **WARNING:** Each cell must contain a **self-contained formula** substituting row/column header values. No Excel DATA TABLE. This is the most verbose build section.

Set up headers (WACC values in column A rows 4-8, TGR values in row 3 columns B-F), then build grid cells. Each cell is a self-contained formula using `$A4` (absolute column for WACC) and `B$3` (absolute row for TGR):

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Sensitivity/A3","props":{"value":"WACC \\ TGR","bold":"true"}},
  {"command":"set","path":"/Sensitivity/B3","props":{"value":"0.015"}},
  {"command":"set","path":"/Sensitivity/C3","props":{"value":"0.020"}},
  {"command":"set","path":"/Sensitivity/D3","props":{"value":"0.025"}},
  {"command":"set","path":"/Sensitivity/A4","props":{"value":"0.080"}},
  {"command":"set","path":"/Sensitivity/A5","props":{"value":"0.100"}},
  {"command":"set","path":"/Sensitivity/A6","props":{"value":"0.120"}},
  {"command":"set","path":"/Sensitivity/B4","props":{"formula":"=(SUM(DCF Valuation!B4:F4)+(Free Cash Flow!F8*(1+B$3)/($A4-B$3))*DCF Valuation!F3-Assumptions!B32)/Assumptions!B33"}},
  {"command":"set","path":"/Sensitivity/C4","props":{"formula":"=(SUM(DCF Valuation!B4:F4)+(Free Cash Flow!F8*(1+C$3)/($A4-C$3))*DCF Valuation!F3-Assumptions!B32)/Assumptions!B33"}}
]
EOF
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
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Scenarios/A3","props":{"value":"Revenue","bold":"true"}},
  {"command":"set","path":"/Scenarios/A4","props":{"value":"  Base"}},
  {"command":"set","path":"/Scenarios/A5","props":{"value":"  Bull"}},
  {"command":"set","path":"/Scenarios/A6","props":{"value":"  Bear"}},
  {"command":"set","path":"/Scenarios/A7","props":{"value":"  Active","bold":"true"}},
  {"command":"set","path":"/Scenarios/B4","props":{"value":"20000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/C4","props":{"value":"22000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/D4","props":{"value":"24000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/B5","props":{"value":"24000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/C5","props":{"value":"28000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/D5","props":{"value":"32000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/B6","props":{"value":"16000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/C6","props":{"value":"17000000","font.color":"0000FF"}},
  {"command":"set","path":"/Scenarios/D6","props":{"value":"18000000","font.color":"0000FF"}}
]
EOF
```

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Scenarios/B7","props":{"formula":"=IF($B$1=\"Base\",B4,IF($B$1=\"Bull\",B5,B6))"}},
  {"command":"set","path":"/Scenarios/C7","props":{"formula":"=IF($B$1=\"Base\",C4,IF($B$1=\"Bull\",C5,C6))"}},
  {"command":"set","path":"/Scenarios/D7","props":{"formula":"=IF($B$1=\"Base\",D4,IF($B$1=\"Bull\",D5,D6))"}}
]
EOF
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
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Cap Table/A3","props":{"value":"Common"}},
  {"command":"set","path":"/Cap Table/B3","props":{"value":"8000000"}},
  {"command":"set","path":"/Cap Table/A4","props":{"value":"Seed Preferred"}},
  {"command":"set","path":"/Cap Table/B4","props":{"value":"1500000"}},
  {"command":"set","path":"/Cap Table/A5","props":{"value":"Series A Preferred"}},
  {"command":"set","path":"/Cap Table/B5","props":{"value":"2500000"}},
  {"command":"set","path":"/Cap Table/A7","props":{"value":"Total Shares"}},
  {"command":"set","path":"/Cap Table/B7","props":{"formula":"=SUM(B3:B5)"}},
  {"command":"set","path":"/Cap Table/C3","props":{"formula":"=B3/B$7"}},
  {"command":"set","path":"/Cap Table/C4","props":{"formula":"=B4/B$7"}},
  {"command":"set","path":"/Cap Table/C5","props":{"formula":"=B5/B$7"}}
]
EOF
```

**Liquidation Preferences:** Define investment amounts (= liquidation preference 1x):

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Cap Table/D3","props":{"value":"0"}},
  {"command":"set","path":"/Cap Table/D4","props":{"value":"2000000","font.color":"0000FF"}},
  {"command":"set","path":"/Cap Table/D5","props":{"value":"5000000","font.color":"0000FF"}}
]
EOF
```

**Waterfall Analysis (Non-Participating Preferred):** Priority order: Series A 1x first, then Seed 1x, then pro-rata to all. Each class decides: take liquidation preference OR convert to common and share pro-rata. Formula: `=MAX(LiqPref, ExitValue * OwnershipPct)`.

Exit scenario columns (e.g., B=$5M, C=$10M, D=$25M, E=$50M, F=$100M):

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Waterfall/B2","props":{"value":"5000000"}},
  {"command":"set","path":"/Waterfall/C2","props":{"value":"10000000"}},
  {"command":"set","path":"/Waterfall/D2","props":{"value":"25000000"}},
  {"command":"set","path":"/Waterfall/E2","props":{"value":"50000000"}},
  {"command":"set","path":"/Waterfall/F2","props":{"value":"100000000"}},
  {"command":"set","path":"/Waterfall/A4","props":{"value":"Series A Payout"}},
  {"command":"set","path":"/Waterfall/B4","props":{"formula":"=MAX(Cap Table!D$5, B$2*Cap Table!C$5)"}},
  {"command":"set","path":"/Waterfall/A5","props":{"value":"Seed Payout"}},
  {"command":"set","path":"/Waterfall/B5","props":{"formula":"=MAX(Cap Table!D$4, B$2*Cap Table!C$4)"}},
  {"command":"set","path":"/Waterfall/A6","props":{"value":"Common Payout"}},
  {"command":"set","path":"/Waterfall/B6","props":{"formula":"=MAX(0, B$2-B4-B5)"}},
  {"command":"set","path":"/Waterfall/A8","props":{"value":"Total Check"}},
  {"command":"set","path":"/Waterfall/B8","props":{"formula":"=B4+B5+B6"}}
]
EOF
```

Replicate B4:B8 formulas across columns C through F for each exit scenario. The `MAX` formula handles the conversion decision automatically: when pro-rata share exceeds liquidation preference, the class converts; otherwise it takes the preference. Total Check must equal the exit value in every column.

> **Note:** For participating preferred (double-dip), replace MAX with: LiqPref + MAX(0, (ExitValue - TotalLiqPrefs) * OwnershipPct).

### C.5 Debt Schedule

Running balance with interest on **opening balance** (avoids circularity):

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Debt Schedule/A3","props":{"value":"Term Loan A","bold":"true"}},
  {"command":"set","path":"/Debt Schedule/A4","props":{"value":"Opening Balance"}},
  {"command":"set","path":"/Debt Schedule/B4","props":{"formula":"=Assumptions!B40"}},
  {"command":"set","path":"/Debt Schedule/C4","props":{"formula":"=B6"}},
  {"command":"set","path":"/Debt Schedule/A5","props":{"value":"Principal Payment"}},
  {"command":"set","path":"/Debt Schedule/B5","props":{"formula":"=-Assumptions!B41"}},
  {"command":"set","path":"/Debt Schedule/A6","props":{"value":"Closing Balance"}},
  {"command":"set","path":"/Debt Schedule/B6","props":{"formula":"=B4+B5"}},
  {"command":"set","path":"/Debt Schedule/A7","props":{"value":"Interest Expense"}},
  {"command":"set","path":"/Debt Schedule/B7","props":{"formula":"=B4*Assumptions!B42"}}
]
EOF
```

Closing balance period N = Opening balance period N+1 (continuity check). Interest on opening balance, NOT average -- avoids circularity.

**Revolver:** Available = Facility Limit - Term Loan Outstanding. Draw/Repay = `MIN(CashShortfall, Available)`. Interest = Opening Revolver Balance * Revolver Rate. Place after Term Loan on the same Debt Schedule sheet.

### C.6 Working Capital Model

AR = Revenue x DSO/365, Inventory = COGS x DIO/365, AP = COGS x DPO/365. Net WC = AR + Inv - AP. Delta NWC = current period NWC - prior period NWC. Delta NWC feeds into Cash Flow from Operations.

```bash
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"set","path":"/Working Capital/A3","props":{"value":"Accounts Receivable"}},
  {"command":"set","path":"/Working Capital/B3","props":{"formula":"=Income Statement!B3*Assumptions!B20/365"}},
  {"command":"set","path":"/Working Capital/A4","props":{"value":"Inventory"}},
  {"command":"set","path":"/Working Capital/B4","props":{"formula":"=-Income Statement!B4*Assumptions!B21/365"}},
  {"command":"set","path":"/Working Capital/A5","props":{"value":"Accounts Payable"}},
  {"command":"set","path":"/Working Capital/B5","props":{"formula":"=-Income Statement!B4*Assumptions!B22/365"}},
  {"command":"set","path":"/Working Capital/A7","props":{"value":"Net Working Capital"}},
  {"command":"set","path":"/Working Capital/B7","props":{"formula":"=B3+B4-B5"}},
  {"command":"set","path":"/Working Capital/A8","props":{"value":"Change in NWC"}},
  {"command":"set","path":"/Working Capital/B8","props":{"formula":"=-B7"}},
  {"command":"set","path":"/Working Capital/C8","props":{"formula":"=-(C7-B7)"}}
]
EOF
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
cat <<'EOF' | officecli batch model.xlsx
[
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"RevenueGrowth","ref":"Assumptions!B2:D2"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"GrossMargin","ref":"Assumptions!B5:D5"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"TaxRate","ref":"Assumptions!B8:D8"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"WACC","ref":"WACC!B5"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"TerminalGrowth","ref":"Assumptions!B31"}}
]
EOF
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
# calcPr -- ONE canonical recipe. ALWAYS //x:definedNames (financial models always have named ranges)
officecli raw-set model.xlsx /workbook \
  --xpath "//x:definedNames" --action insertafter \
  --xml '<calcPr fullCalcOnLoad="1" iterate="1" iterateCount="100" iterateDelta="0.001" />'
# Validate immediately
officecli validate model.xlsx
```

If validation fails, check named ranges: `officecli get model.xlsx --depth 1` and look for `definedName` entries.

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
officecli get model.xlsx --depth 1                                # 6. Named ranges exist (look for definedName)
officecli get model.xlsx '/Dashboard/chart[1]' --json             # 7. Charts have data
officecli get model.xlsx "/Income Statement/B20" --json          # 8. Key cells are formulas
officecli view model.xlsx text                                   # 9. Visual check (formulas blank = normal)
```

---

## Section F: Known Issues and Workarounds

| # | Issue | Workaround |
|---|-------|------------|
| F-1 | `!` escaping in cross-sheet formulas | Always use heredoc batch. Verify with `officecli get`. If `\!` appears, delete and re-run. |
| F-2 | Batch failure at scale | 8-12 ops per batch. Non-resident mode. Retry individually. Build time ~3-5 min for complex models. |
| F-3 | calcPr XML ordering | Always `//x:definedNames --action insertafter` (financial models always have named ranges). Validate after. |
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
