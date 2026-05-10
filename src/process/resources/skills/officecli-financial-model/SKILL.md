---
name: officecli-financial-model
description: "Use this skill when the user wants to build a financial model — 3-statement model, DCF valuation, LBO, SaaS unit economics, sensitivity / scenario analysis, debt schedule, or fundraising projections — in Excel. Trigger on: 'financial model', '3-statement model', 'P&L + BS + CF', 'DCF', 'WACC', 'NPV', 'terminal value', 'LBO', 'debt schedule', 'cash sweep', 'MOIC', 'IRR / XIRR', 'sensitivity table', 'scenario analysis', 'ARR model', 'unit economics', 'CAC / LTV', 'cap table forecast'. Output is a single formula-driven .xlsx. This skill is a scene layer on top of officecli-xlsx — it inherits every xlsx v2 rule (4-color code, visual floor, number formats, cache-drift, Known Issues, Delivery Gate minimum cycle). DO NOT invoke for a simple budget tracker, CSV dump, or operational KPI sheet — route those to officecli-xlsx base."
---

# OfficeCLI Financial-Model Skill

**This skill is a scene layer on top of `officecli-xlsx`.** Every xlsx hard rule — shell quoting, incremental execution, Help-First Rule, visual delivery floor, CFO 4-color code (blue input / black formula / green cross-sheet / yellow-fill assumption), number-format standards (years as text, zero as `-`, `%` one decimal, negatives in parens), assumption-cell discipline, CSV batch import, chart data-feed forms (a/b/c), the 5-gate Delivery cycle, cache-drift guidance, Known Issues (the cross-sheet `!` trap, batch + resident for formulas, renderer caveats) — is **inherited, not re-taught**. This file adds only what a **financial model** requires on top: three-zone architecture, 3 model-type recipes (3-statement / DCF / LBO), sensitivity + scenario protocols, financial-function patterns, circular-reference discipline, and model-specific Delivery Gates 4–6.

When the xlsx base rules cover it, the text here says `→ see xlsx v2 §X`. Read `skills/officecli-xlsx/SKILL.md` first if you have not.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash`
- **Windows (PowerShell)**: `irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## Help-First Rule

This skill teaches what a financial model requires, not every CLI flag. When a prop name / alias / enum is uncertain, consult help BEFORE guessing: `officecli help xlsx [element] [--json]`. Help is pinned to installed version — when this skill and help disagree, **help wins**. Every `--prop X=` below was verified against `officecli help xlsx <element>` on v1.0.63.

## Mental Model & Inheritance

**Inherits xlsx v2.** Read `skills/officecli-xlsx/SKILL.md` first. This skill assumes you know `create` / `open` / `close`, `set` values/formulas, `batch` heredocs for cross-sheet formulas, `/SheetName/A1` paths, named ranges, the 5-gate Delivery cycle, the cross-sheet `!` trap, and that **cross-sheet formulas go non-resident (single batch OR individual `set`), never batch-while-resident**.

## Shell & Execution Discipline

Shell quoting, incremental execution, `$FILE` convention → see xlsx v2 §Shell & Execution Discipline. Same rules: quote every `[N]` path, single-quote any prop containing `$` (every number format here — `$#,##0;($#,##0);"-"` — needs single quotes), no hand-written `\$`/`\t`/`\n`, one command at a time. Examples below use `$FILE` (`FILE="model.xlsx"`).

## Core Principles (identity)

A financial model is an xlsx with a **decision-grade, formula-driven layer**: every output traces an unbroken chain to blue-font assumptions, every statement balances every period, every valuation is re-auditable. Eight deltas on top of a general xlsx:

1. **Three-zone architecture mandatory:** Inputs → Calc → Outputs. Collapsing zones → unauditable.
2. **Assumptions live in cells, never inside formulas.** `=B5*(1+Assumptions!GrowthRate)`, never `=B5*1.05`.
3. **Statements balance every period.** `Assets − Liab − Equity = 0`, `CF.EndingCash = BS.Cash`. Gate 4 fails on `IMBALANCED`.
4. **Hardcodes audited.** Calc sheets carry zero hardcoded numbers; Gate 6 counts.
5. **Sensitivity / scenario is first-class.** 2-axis grid, dropdown `INDEX/MATCH` switch, or Base/Upside/Downside cols. Excel Data Tables not reliably supported — manual grids only.
6. **Cached values on valuation cells load-bearing.** NPV / IRR / XNPV caching `0` ships a wrong number to non-recalculating readers. Gate 5 spot-checks.
7. **Circularity is a design choice.** Legitimate rings (interest ↔ cash, revolver plug ↔ ending cash) use `calc.iterate=true`. Accidental circularity is broken algebra — never papered with `iterate`.
8. **Named ranges for ≥ 3-use assumptions.** `WACC`, `TaxRate`, `TerminalGrowth`, `ExitMultiple`, `ChurnRate`. Declared-unused names are dead decoration — Gate 6 flags.

### Reverse handoff — when to go BACK to xlsx base

Stay in **xlsx base** for: budget trackers, CSV-to-report dumps, operational KPI sheets, simple templates, cap tables without forecast logic. Use **this skill** only when the ask mentions: 3-statement / DCF / WACC / NPV / TV / LBO / debt schedule / MOIC / IRR / unit economics / ARR roll-forward / sensitivity grid / scenario switch / pro forma.

## Three-zone architecture (hard rule)

Every model in this skill builds on three zones. **Name them, tab-color them, and enforce them with executable audits.** Breaking the zone rule is the single most common cause of an unauditable model.

| Zone        | Sheet names (convention)                                  | Tab color       | Content                                                                           | Hardcodes                                                          | Formulas                                                      |
| ----------- | --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Inputs**  | `Assumptions`, `Inputs`, `Drivers`                        | Yellow `FFC000` | Raw drivers: growth rates, margins, tax, WACC, FTE, pricing, working-capital days | Blue `0000FF` on every cell                                        | Allowed only for derived assumptions (e.g. `=MonthlyARPU*12`) |
| **Calc**    | `P&L`, `Balance Sheet`, `Cash Flow`, `DCF`, `Debt`, `ARR` | Blue `4472C4`   | All derivations and statements                                                    | **Zero** (enforced by Gate 6)                                      | Black `000000` for same-sheet, green `008000` for cross-sheet |
| **Outputs** | `Summary`, `Dashboard`, `Sensitivity`, `Returns`          | Green `70AD47`  | KPIs, sensitivity grids, charts, returns waterfall                                | Only for labels (non-numeric); Gate 6 counts numeric hardcodes → 0 | Black / green per above                                       |

**Build order is cross-zone-aware.** Assumptions first, then Calc bottom-up on the dependency chain (`IS → BS → CF` for 3-statement; `FCF → WACC → NPV` for DCF), then Outputs last. Building Outputs first caches `0` everywhere and downstream inherits zeros.

**Executable zone audit** (run before Gate 4):

```bash
# Calc zone: zero numeric hardcodes allowed. NOTE: `:not(:has(formula))` pseudo doesn't filter on v1.0.63+ — filter via jq on .format.formula == null.
HARDCODE=$(officecli query "$FILE" 'cell[type=Number]' --json | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/(P&L|Balance Sheet|Cash Flow|DCF|Debt|ARR)/"))] | length')
[ "$HARDCODE" -eq 0 ] && echo "Zone audit OK" || { echo "REJECT: $HARDCODE hardcoded numeric cells on Calc sheets — move to Assumptions"; exit 1; }
# Assumptions zone: should be non-zero.
INPUTS=$(officecli query "$FILE" '/Assumptions/cell[type=Number]' --json | jq '[.data.results[] | select(.format.formula == null)] | length')
[ "$INPUTS" -ge 5 ] && echo "Assumptions has $INPUTS hardcoded drivers" || echo "WARN: Assumptions has only $INPUTS inputs"
```

## Print delivery (board / IC / LP)

When the ask contains "print" / "一页" / "董事会" / "投资人" / "IC memo" / "LP update", the print pipeline must emit **only** the Outputs zone. Two artefacts:

```bash
# 1. Print_Area scoped to the Outputs sheet (Summary or Dashboard).
officecli add "$FILE" / --type namedrange --prop name=_xlnm.Print_Area --prop scope=Summary --prop 'refersTo=Summary!$A$1:$H$40'
# 2. Hide every non-Outputs sheet — Print_Area scope alone does NOT stop the print pipeline from emitting every visible sheet.
for S in Assumptions 'P&L' 'Balance Sheet' 'Cash Flow' DCF WACC Debt FCF 'S&U' Exit Returns; do
  officecli raw-set "$FILE" /workbook --xpath "//x:sheet[@name='$S']" --action setattr --xml "state=hidden" || true
done
# 3. fit-to-page landscape on Outputs sheet.
officecli raw-set "$FILE" /Summary --xpath "//x:worksheet" --action prepend --xml '<sheetPr xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><pageSetUpPr fitToPage="1"/></sheetPr>'
```

Delete any `Print_Area` set on Calc sheets — conflicting scopes emit multi-page output with Assumptions / statement sheets leaking.

## Build-order & cache-drift rule (critical for 3-statement)

Three facts cause silent wrong numbers: (1) new formulas ship without cached values — Excel recomputes on open, HTML preview / older viewers do not; (2) downstream written in the same sequence as upstream caches `0` from upstream's pre-cache state; (3) cross-sheet `batch` while resident is open deadlocks at 3–5 ops.

**Discipline (every recipe):**

- Build order follows the data chain: `P&L → BS → CF` (3-statement); `FCF → WACC → NPV → Sensitivity` (DCF); `S&U → Debt → P&L → CF → Returns` (LBO).
- After the cross-sheet chain, **cache-refresh pass:** re-issue `set` on every summary / valuation / balance-check cell, non-resident.
- Spot-check: `officecli get "$FILE" /Summary/B2 --json | jq .format.cachedValue` returns non-zero non-null. `null` ≠ `0`: `null` means Excel will compute on open (OK for delivery); `0` is a cached lie. If `0` persists: close residents, re-set; still `0` → cache-fallback (§Financial function patterns).

## Recipes — three model types

Each recipe below is **runnable skeleton, not finance theory**. Substitute numbers; don't restructure. All recipes assume `FILE="model.xlsx"` is set and you have run `officecli create "$FILE"` + `officecli open "$FILE"`. Close with `officecli close "$FILE"` at the end.

### Recipe A — 3-statement model (P&L + BS + CF)

**What this recipe produces.** 4 sheets: `Assumptions`, `P&L`, `Balance Sheet`, `Cash Flow`, plus `Summary`. Year columns 2024A · 2025E · 2026E · 2027E. Balance-check row on BS; cash-reconciliation row on CF. Every statement row = formula → Assumptions.

**Build order (MANDATORY).** `Assumptions → P&L → Balance Sheet → Cash Flow → Summary`. Do NOT build BS before P&L — `RetainedEarnings` depends on `NI`. Do NOT build CF before BS — `CF.OpeningCash = prior period CF.EndingCash` self-chain requires BS cash anchored for Y1. The skill's Gate 4 balance check fails silently if order is wrong.

**Step 1 — sheets + tab colors + freeze panes.**

```bash
officecli add "$FILE" / --type sheet --prop name=Assumptions --prop tabColor=FFC000
officecli add "$FILE" / --type sheet --prop name=P&L --prop tabColor=4472C4
officecli add "$FILE" / --type sheet --prop name='Balance Sheet' --prop tabColor=4472C4
officecli add "$FILE" / --type sheet --prop name='Cash Flow' --prop tabColor=4472C4
officecli add "$FILE" / --type sheet --prop name=Summary --prop tabColor=70AD47
officecli set "$FILE" /Assumptions --prop freeze=B2
officecli set "$FILE" /P&L --prop freeze=B3
officecli set "$FILE" "/Balance Sheet" --prop freeze=B3
officecli set "$FILE" "/Cash Flow" --prop freeze=B3
```

**Step 2 — assumptions (blue, yellow-fill on key drivers).** Year headers row 2, labels down col A, blue numeric inputs on B:E. Drivers: `RevenueGrowth`, `GrossMargin`, `OpExRatio`, `TaxRate`, `DaysReceivable/Inventory/Payable`, `CapExRatio`, `DepreciationYears`. `font.color=0000FF` on B:E. Yellow-fill (`fill=FFFF00`) the 3–5 scenario-switched drivers.

**Declare named ranges for ≥3-use drivers and reference them** (`StartingARR`, `TaxRate`, `OpeningCash`, `GrowthRate`, `GrossMargin`). Formulas: `=StartingARR` not `=Assumptions!B4`; `=EBT*TaxRate` not `=EBT*Assumptions!B8`. Declared-unused names = dead decoration, Gate 6 rejects.

**Step 3 — P&L rows (all formulas).** Rows: `Revenue` / `COGS` / `Gross Profit` / `OpEx` / `EBITDA` / `D&A` / `EBIT` / `Interest` / `EBT` / `Tax` / `Net Income`. Every row = formula referencing `Assumptions` or prior-row cells. Example revenue-side block — **substitute your row numbers**. Row-map for this example: `B3=Revenue, B4=COGS, B5=Gross Profit, B7=OpEx, B9=EBITDA, B10=EBIT, B15=Net Income`. Submit as single non-resident batch:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/P&L/B3","props":{"formula":"Assumptions!B5","font.color":"008000"}},
  {"command":"set","path":"/P&L/C3","props":{"formula":"B3*(1+Assumptions!C6)"}},
  {"command":"set","path":"/P&L/D3","props":{"formula":"C3*(1+Assumptions!D6)"}},
  {"command":"set","path":"/P&L/E3","props":{"formula":"D3*(1+Assumptions!E6)"}},
  {"command":"set","path":"/P&L/B4","props":{"formula":"-B3*(1-Assumptions!B7)"}},
  {"command":"set","path":"/P&L/B5","props":{"formula":"B3+B4"}}
]
EOF
```

Assumptions refs (`B5`, `C6`, `B7`) are also placeholder rows — better: **define named ranges** for each driver (Step 2) so formulas read `=StartingRevenue*(1+RevenueGrowth_Y2)` regardless of row layout. Repeat for `OpEx` / `D&A` / `Interest` / `Tax` / `NI`. `font.color=008000` on every cross-sheet-reference cell; same-sheet cells default `000000`. `numFmt='$#,##0;($#,##0);"-"'` on all $ rows.

**Step 4 — Balance Sheet rows (all formulas).** Assets = `Cash + AR + Inventory + Net PP&E`. Liab = `AP + Debt`. Equity = `OpeningEquity + RetainedEarnings`. Working-capital rows use Days assumptions: `AR = Revenue × DaysReceivable / 365`. `Net PP&E` rolls forward: `Beg + CapEx − Depreciation`. **`BS.Cash` is NOT an independent plug** — it MUST equal `'Cash Flow'!B<ending-cash-row>` (populated in Step 5).

**Retained Earnings — live formula every period.** `BS.RE(t) = BS.RE(t-1) + 'P&L'!NI(t) − Dividends(t)`. Hardcoded RE rounds to whole dollar → BS shows ±$1 off every period (CFO reads "model doesn't balance"). For Y1 Historical RE (no prior NI), compute via BS identity as a **live formula**: `BS!RE_Y1 = TotalAssets − TotalLiabilities − PaidInCapital`. Blue-font + classic comment on the Y1 cell; Y2..Y5 stay NI-driven.

**Step 5 — Cash Flow rows (all formulas).** Operating: `NI + D&A − ΔWorkingCapital`. Investing: `−CapEx`. Financing: `ΔDebt − Dividends`. Ending Cash = `Opening + Operating + Investing + Financing`. **Year 2+ Opening Cash = prior period Ending Cash** — self-chain on the same sheet: `C17 = B19`, `D17 = C19`, `E17 = D19`. The Y1 `OpeningCash` is an Assumptions input.

**Step 6 — Balance check + cash reconciliation rows (hard delivery checks).** Row-map for this example: `Balance Sheet: B10=Total Assets, B15=Total Liab, B17=Total Equity, B18=Balance Check`; `Cash Flow: B5=BS.Cash (cross-sheet anchor), B19=CF.Ending Cash, B21=CF-BS Cash Recon`. Substitute your layout's rows — the logic is the check, not the cell addresses.

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/Balance Sheet/B18","props":{"formula":"IF(ABS(B10-B15-B17)<0.01,\"OK\",\"IMBALANCED: \"&ROUND(B10-B15-B17,0))","bold":"true","font.color":"000000"}},
  {"command":"set","path":"/Cash Flow/B21","props":{"formula":"IF(ABS(B19-'Balance Sheet'!B5)<0.01,\"OK\",\"CF != BS CASH: \"&ROUND(B19-'Balance Sheet'!B5,0))","bold":"true"}}
]
EOF
```

Replicate across columns C/D/E. Apply red fill (`fill=FFC7CE`) conditionally via `type=containsText --prop text=IMBALANCED` or `text="CF !="`. Gate 4 queries these rows and refuses delivery on any `IMBALANCED`.

**Step 7 — cache refresh + format pass.** Re-set every summary cell on `Summary`, every balance-check / recon cell, and every cross-sheet reference on BS / CF (non-resident, single batch per sheet). Apply column widths (`col[A]=28`, `col[B:E]=15`), `numberformat='$#,##0;($#,##0);"-"'` on all dollar rows, header fills (`fill=1F3864`, `font.color=FFFFFF`, `bold=true`) on section-header rows (REVENUE / COGS / ASSETS / LIABILITIES). Header fill must cover A:E, not just the label cell (→ xlsx v2 §visual floor).

**Step 8 — Summary / Dashboard KPIs + charts.** Minimum 4 KPIs: `Revenue 27E`, `EBITDA Margin 27E`, `Ending Cash 27E`, `Net Income CAGR` — each a formula referencing a statement cell, green font.

**Minimum 3 charts on any Dashboard delivered to a board / executive audience** — one chart is a draft, three is a deliverable. Pre-populate `Summary!A10:E13` with Gross Margin / EBITDA Margin / NI Margin ratio rows (formulas referencing `P&L`) before adding the margin chart.

```bash
# (1) Top-line trend (Revenue + EBITDA).
officecli add "$FILE" /Summary --type chart --prop chartType=column --prop dataRange='P&L!A2:E5' --prop title='Revenue & EBITDA' --prop width=14cm --prop height=8cm
# (2) Margin trend (Gross / EBITDA / NI margin).
officecli add "$FILE" /Summary --type chart --prop chartType=line --prop dataRange='Summary!A10:E13' --prop title='Margin trend' --prop width=14cm --prop height=8cm
# (3) Cash trajectory (Ending Cash ± Runway).
officecli add "$FILE" /Summary --type chart --prop chartType=area --prop dataRange='Cash Flow!A19:E19' --prop title='Ending cash' --prop width=14cm --prop height=8cm
```

**Verification (run all three):**

```bash
# Balance check every period must say OK
officecli get "$FILE" "/Balance Sheet/B18:E18" --json | jq '.data[].cachedValue // .data[].value'
# Cash recon every period must say OK
officecli get "$FILE" "/Cash Flow/B21:E21" --json | jq '.data[].cachedValue // .data[].value'
# Summary KPIs are plausible numbers, not 0 or null
officecli get "$FILE" "/Summary/B2:B5" --json | jq '.data[].cachedValue'
```

### Recipe B — DCF valuation

**What this recipe produces.** Sheets: `Assumptions`, `FCF` (10-year forecast), `WACC` (panel), `DCF` (NPV + TV + equity bridge), `Sensitivity` (2-axis grid). Output: `Implied Equity Value` + `Implied Per-Share`, with a `WACC × g` sensitivity.

**Build order.** `Assumptions → FCF → WACC → DCF → Sensitivity`.

**Step 1 — named ranges for key drivers.** DCF's readability depends on names. Every formula below uses `WACC`, `TaxRate`, `g` — not `$B$6`:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"WACC","ref":"WACC!$B$12"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"TaxRate","ref":"Assumptions!$B$8"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"TerminalGrowth","ref":"Assumptions!$B$15"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"NetDebt","ref":"Assumptions!$B$20"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"SharesOut","ref":"Assumptions!$B$21"}}
]
EOF
```

**Step 2 — FCF build (10 years).** Columns B:K = Y1..Y10. Rows: `Revenue` (from growth) / `EBIT` (revenue × margin) / `EBIT × (1 − TaxRate)` (NOPAT) / `+ D&A` / `− CapEx` / `− ΔNWC` / `= FCF`. Use Assumptions-driven ratios (`CapEx = Revenue × CapExRatio`). All cells formulas, black font, `numFmt='$#,##0;($#,##0);"-"'`.

**Step 3 — WACC panel.** On `WACC` sheet, an 8-row panel: `Risk-free rate` / `Equity risk premium` / `Beta` / `Cost of equity` (=Rf + β×ERP) / `Pre-tax debt cost` / `After-tax debt cost` (=×(1−TaxRate)) / `Equity weight` / `Debt weight` / `WACC` (=We×Re + Wd×Rd_after_tax). Inputs blue; derived rows black.

**Step 4 — Terminal value + NPV + equity bridge.** Row-map: `DCF: B/C 3=TV, 4=PV explicit FCF, 5=PV terminal, 6=EV, 7=Net Debt, 8=Equity Value, 9=Per-Share`; `FCF: row 2 = periods (1..10), row 11 = FCF, B:K = Y1..Y10`. Substitute your rows. Notes column cells use `{"value":"text"}`, never `{"formula":"..."}` — formula-style prose yields `#NAME?` on open (see callout after Recipe C Step 5). On `DCF` sheet:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/DCF/B3","props":{"value":"Terminal value (Gordon growth)"}},
  {"command":"set","path":"/DCF/C3","props":{"formula":"FCF!K11*(1+TerminalGrowth)/(WACC-TerminalGrowth)","font.color":"008000","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/DCF/B4","props":{"value":"PV of explicit-period FCF (10 yr)"}},
  {"command":"set","path":"/DCF/C4","props":{"formula":"SUMPRODUCT(FCF!B11:K11/(1+WACC)^FCF!B2:K2)","font.color":"008000","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/DCF/B5","props":{"value":"PV of terminal value"}},
  {"command":"set","path":"/DCF/C5","props":{"formula":"C3/(1+WACC)^10","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/DCF/B6","props":{"value":"Enterprise value"}},
  {"command":"set","path":"/DCF/C6","props":{"formula":"C4+C5","bold":"true","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/DCF/B7","props":{"value":"Less: Net debt"}},
  {"command":"set","path":"/DCF/C7","props":{"formula":"-NetDebt","font.color":"008000","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/DCF/B8","props":{"value":"Equity value"}},
  {"command":"set","path":"/DCF/C8","props":{"formula":"C6+C7","bold":"true","font.color":"000000","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/DCF/B9","props":{"value":"Implied per-share"}},
  {"command":"set","path":"/DCF/C9","props":{"formula":"C8/SharesOut","bold":"true","numberformat":"$0.00"}}
]
EOF
```

**Why `SUMPRODUCT` not `NPV`.** `NPV(rate, cross_sheet_range)` silently caches `0` on v1.0.63 — ships a wrong valuation to any non-recalculating reader. `SUMPRODUCT(values/(1+rate)^periods)` is algebraically equivalent and caches correctly (period row `FCF!B2:K2 = 1..10` is a one-time setup). For irregular dates (`XNPV`), use `SUMPRODUCT(values/(1+rate)^((dates-base_date)/365))`. See §Known Issues.

**Step 5 — 2-axis sensitivity grid (WACC × g).** 5×5 grid. Rows = WACC values `7.5% ... 11.5%`, cols = `g` values `1.5% ... 3.5%`. Each cell = one self-contained formula re-running the DCF with the grid's WACC and g substituted. Template:

```bash
# Cell D14 (first data cell, grid anchor at C14 = WACC label, C15 = first WACC value)
# Substitute $D$13 (this cell's g) and $C15 (this cell's WACC) into a replicated EV + equity formula.
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/Sensitivity/D15","props":{"formula":"(NPV($C15,FCF!$B$11:$K$11)+(FCF!$K$11*(1+D$14)/($C15-D$14))/(1+$C15)^10+(-NetDebt))/SharesOut","numberformat":"$0.00"}}
]
EOF
```

Copy the formula across D15:H19 (5×5 grid). Row 14 carries g values (blue input); column C carries WACC values (blue input). Row 13 and column B carry labels. Apply 3-color gradient CF for quick-read (green = upside, red = downside):

```bash
officecli add "$FILE" /Sensitivity --type conditionalformatting \
  --prop type=colorScale --prop ref=D15:H19
```

**No Excel Data Tables.** Excel's native `/Data/Table` 2-variable table is not reliably supported via the CLI — each grid cell MUST be an explicit formula. Copy the template, do not try `Data Table` input cells.

**Verification.**

```bash
officecli get "$FILE" "/DCF/C8" --json | jq .format.cachedValue   # equity value, plausible $
officecli get "$FILE" "/DCF/C9" --json | jq .format.cachedValue   # per-share, in $XX.XX range
officecli get "$FILE" "/Sensitivity/F17" --json | jq .format.cachedValue   # grid center cell, plausible
```

If `C8` or `C9` cache `0`, re-set them (non-resident) — see §Build-order & cache-drift.

### Recipe C — LBO model

**What this recipe produces.** Sheets: `Assumptions`, `S&U` (Sources & Uses), `Debt` (multi-tranche schedule), `P&L` (5-yr), `CF`, `Exit` / `Returns`. Outputs: `MOIC`, `IRR`, and a 4-tier returns waterfall. LBO is the stress test — expect circular refs (interest ↔ cash), deepest cross-sheet chains, and the heaviest use of named ranges.

**Build order.** `Assumptions → S&U → P&L → Debt → CF → Exit → Returns`. P&L before Debt (debt interest depends on P&L EBIT for coverage checks); Debt before CF (CF uses interest + principal amortization). Enable `calc.iterate` before Step 5.

**Step 1 — Sources & Uses (balance required, every fee line itemized).**

```
Uses    = Purchase_EV (EntryEBITDA × EntryMultiple) + Transaction_fees (Purchase_EV × TxnFeePct, typ 1.5–2.5%)
        + Financing_fees ((Senior + Mezz) × FinFeePct, typ 1–3%) + Refinanced_debt
Sources = Senior_TLB + Mezz + Revolver_drawn + Sponsor_equity
```

**Sponsor equity — pick one, never both.** (a) **Stated:** `Sponsor_equity = Assumptions!SponsorEquity`, then scale senior/mezz so Sources = Uses (fees absorbed by debt, not a silent plug). (b) **Solved:** `Sponsor_equity = Uses − Senior − Mezz − Revolver − Refinanced`, label "Sponsor Equity (solved)", no standalone Assumptions ref. Hardcoded `SponsorEquity` PLUS a `=Uses − Senior − Mezz` plug guarantees silent fee absorption — stated $140M vs plug $194.67M = $54.67M unaccounted fees, CFO rejection on sight.

```bash
# Sources = Uses hard check.
officecli set "$FILE" /S&U/B12 --prop formula='IF(ABS(SUM(B4:B7)-SUM(B9:B11))<1,"BALANCED","S&U IMBALANCE: "&ROUND(SUM(B4:B7)-SUM(B9:B11),0))' --prop bold=true

# Stated-vs-plug consistency (Gate 4 addendum; only run if you chose pattern (a)).
STATED=$(officecli get "$FILE" /Assumptions/B12 --json | jq -r '.format.cachedValue // "null"')
PLUGGED=$(officecli get "$FILE" /S&U/B10 --json | jq -r '.format.cachedValue // "null"')   # B10 = sponsor-equity row on S&U
DELTA=$(python3 -c "print(abs(float('$STATED') - float('$PLUGGED')))" 2>/dev/null || echo 99999)
python3 -c "import sys; sys.exit(0 if float('$DELTA') <= 1 else 1)" && echo "S&U sponsor OK (stated=$STATED plug=$PLUGGED)" || { echo "REJECT Gate 4 S&U: stated $STATED ≠ plug $PLUGGED (Δ=$DELTA) — fees silently absorbed"; exit 1; }
```

Every non-sponsor line on `S&U` is a blue Assumptions input (target EBITDA, entry multiple, fee %s) or a derived formula. No hardcoded Uses / Sources numbers.

**Step 2 — Debt schedule (multi-tranche).** One row per tranche per year. Columns: `BeginningBalance` / `Mandatory amortization` / `Cash sweep` / `EndingBalance` / `AverageBalance` / `InterestExpense`. Senior TLB: 1% mandatory amortization + all excess cash to sweep. Mezz: 0% amortization, interest-only cash-pay. Row-map for this example (senior TLB tranche, year 2 column C): `C4=Beginning Balance, C5=Mandatory Amort, C6=Ending Balance, C7=Cash Sweep, C8=Average Balance, C9=Interest Expense`. `CF!C20` = free cash available to sweep (year-2 ending cash pre-sweep on CF sheet). Substitute your tranche row block per layout.

```bash
# year 2 senior TLB
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/Debt/C4","props":{"formula":"B6"}},
  {"command":"set","path":"/Debt/C5","props":{"formula":"-C4*Assumptions!$B$30","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/Debt/C6","props":{"formula":"C4+C5+C7","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/Debt/C7","props":{"formula":"-MIN(-CF!C20,C4+C5)"}},
  {"command":"set","path":"/Debt/C8","props":{"formula":"(C4+C6)/2","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/Debt/C9","props":{"formula":"-C8*Assumptions!$B$31","numberformat":"$#,##0;($#,##0);\"-\""}}
]
EOF
# Add the sweep-rule comment as a classic comment (comment is NOT a cell prop — separate --type comment).
officecli add "$FILE" /Debt --type comment --prop ref=C7 --prop text='cash sweep capped at available cash and remaining tranche balance'
```

**Revolver capacity cap.** If your deal uses a revolver tranche, the revolver balance each period is bounded by the commitment ceiling:

```
Revolver_Balance = MIN(Assumptions!RevolverCapacity, MAX(0, prior_revolver + draw − paydown))
```

Without the `MIN(capacity, ...)` outer, a shortfall quarter silently over-draws the facility.

Adjust row indices to your layout. Repeat for each tranche (senior / mezz / revolver) and each year.

**Step 3 — P&L (5-year) + interest from Debt.** P&L interest row pulls from Debt: `Interest = 'Debt'!TotalInterestRowY<N>`. This creates the **circular reference**: Interest → NI → CF → Cash Sweep → Debt balance → Interest.

**Write-order warning.** `calc.iterate=true` governs _recalculation_, not write-phase. Appending the closing leg of a cross-sheet ring to a file that already contains the ring deadlocks the engine at 100% CPU regardless of `iterate`. For complex rings (multi-tranche LBO, revolver + TLB + mezz), use §Write-order surgery below (de-ring → write downstream → re-ring). Enable `calc.iterate=true` BEFORE writing ring formulas:

```bash
officecli set "$FILE" / --prop calc.iterate=true --prop calc.iterateCount=100 --prop calc.iterateDelta=0.001
```

`iterate` converges via successive approximation for naturally-dampening loops (higher interest → less cash → less sweep → higher balance, bounded by EBIT). `#REF!` or divergent values = pause; fix algebra, do not raise `iterateCount` to 1000.

**Step 4 — CF + cash sweep.** Ending cash = Opening + CFO − CapEx − Mandatory amort − Cash sweep. Cash sweep = `MIN(freeCashAfterCapEx, seniorDebtBalance + seniorMandatoryAmort)`. The `MIN` cap prevents swept-below-zero.

**Step 5 — Exit + Returns.** Row-map: `Exit: B3=Exit EV, B4=Less: remaining debt, B5=Exit equity to sponsor`; `Returns: B3=MOIC, B4=IRR`.

```bash
# Values/formulas — single non-resident batch.
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/Exit/B3","props":{"formula":"'P&L'!F8*Assumptions!$B$25","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/Exit/B4","props":{"formula":"-('Debt'!F6+'Debt'!F13)","font.color":"008000","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/Exit/B5","props":{"formula":"B3+B4","bold":"true","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/Returns/B3","props":{"formula":"'Exit'!B5/('S&U'!B9)","numberformat":"0.00\"x\""}},
  {"command":"set","path":"/Returns/B4","props":{"formula":"IRR({-'S&U'!B9,0,0,0,0,'Exit'!B5})","numberformat":"0.0%"}}
]
EOF
# Classic comments — one --type comment per anchor cell.
officecli add "$FILE" /Exit --type comment --prop ref=B3 --prop text='Exit EV = Y5 EBITDA × exit multiple'
officecli add "$FILE" /Returns --type comment --prop ref=B3 --prop text='MOIC = exit equity / sponsor equity'
officecli add "$FILE" /Returns --type comment --prop ref=B4 --prop text='IRR — 5-yr, entry + exit only; use XIRR for mid-year dividends'
```

**Callout — labels: `comment` element vs Notes column vs `formula` (three distinct mechanics).**

- **Hover tooltip** → `officecli add ... --type comment --prop ref=<cell> --prop text='...'`. The **`comment` key is NOT a valid prop on `set cell`** (not in `officecli help xlsx cell` on v1.0.63) — it silently drops when embedded inside a `set cell` props dict. Use the dedicated element.
- **Visible text in an adjacent Notes column** → `{"command":"set","path":"/DCF/D3","props":{"value":"TV = FCF × (1+g) / (WACC−g)"}}` — **`value`, not `formula`**, plain quoted string.
- **Formula-style prose written as a real formula** → NEVER. `{"formula":"FCF10*(1+g)/(WACC-g)"}` produces `#NAME?` in Excel (`FCF10`, `g`, `WACC` are unbound identifiers in that cell context).

For mid-year dividends or partial exits, use `XIRR({cashflows}, {dates})` instead of `IRR`.

**Step 6 — Returns waterfall (optional, 4-tier LP/GP).** Tiers: (1) LP preferred return 8% ; (2) GP catch-up to 20% ; (3) 80/20 split above hurdle ; (4) 100% to LP on loss. Each tier is a `MAX(0, MIN(...))` clamp. See §Sensitivity & scenarios for the general grid pattern.

**Verification.**

```bash
officecli get "$FILE" /S&U/B12 --json | jq '.data.value // .data.cachedValue'   # must say BALANCED
officecli get "$FILE" /Returns/B3 --json | jq .format.cachedValue                # MOIC, expect 2.0x-4.0x typical
officecli get "$FILE" /Returns/B4 --json | jq .format.cachedValue                # IRR, expect 0.15-0.30 typical
# Iterate converged?
officecli query "$FILE" 'cell:contains("#REF!")' --json | jq '.data.results | length'   # must be 0
```

## Sensitivity & scenarios

**Three patterns, pick one:**

- **(a) Base / Upside / Downside columns** on Assumptions — side-by-side scenarios, dropdown-less switch via an "Active" column + `INDEX/MATCH`.
- **(b) Dropdown + `INDEX/MATCH` switch** — one validation dropdown on Summary drives every driver via `INDEX(Base:Downside, MATCH(Dropdown, ScenLabels, 0))`.
- **(c) 2-axis sensitivity grid** — 5×5 or 7×7, one self-contained formula per cell, row/col headers are the two drivers. See Recipe B Step 5 for WACC × g.

Mixing (a)+(b) creates circular input (scenario picked by dropdown AND overwritten by Active column) — pick one.

**Grid rule:** each cell substitutes row-driver and col-driver into a self-contained copy of the output formula. Cannot reference the `WACC` named range (that's the panel) — reference the grid's axis cell.

**Dropdown scenario switch.** One `validation` dropdown on Summary drives every `Assumptions` row:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"add","parent":"/Summary","type":"validation","props":{"sqref":"B1","type":"list","formula1":"Base,Upside,Downside"}},
  {"command":"set","path":"/Assumptions/B5","props":{"formula":"INDEX(C5:E5,MATCH(Summary!$B$1,$C$4:$E$4,0))"}}
]
EOF
# If you want a hover tooltip on B5, add it separately:
officecli add "$FILE" /Assumptions --type comment --prop ref=B5 --prop text='Revenue growth — picked by Summary!B1 scenario dropdown'
```

Every `Assumptions` driver row gets the same `INDEX/MATCH`. Base / Upside / Downside columns on C:E stay blue (hardcoded scenario inputs).

**Football-field chart pattern (DCF valuation summary).** Horizontal Low→High bars for 3–5 valuation methods (DCF base, DCF bear, Trading comps, Precedent txns, LBO floor) stacked vertically. On a `Football` sheet: col A = method label, col B = Low $, col C = High $, col D = `=C−B` (width). Chart as a stacked bar with column B as an invisible first series (white/no-fill) and column D as the visible series — `dataRange=Football!A3:D7`, `chartType=bar`. Excel reads this as a floating bar per method.

## Financial function patterns

Terse reference — not a finance textbook. If you don't know what these do, pause and ask the user.

| Function                                            | Prefer over               | Why                                                                                                       |
| --------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `XNPV(rate, values, dates)`                         | `NPV`                     | Irregular cash flow dates (M&A close mid-year, staggered tranches)                                        |
| `XIRR(values, dates)`                               | `IRR`                     | Irregular dates; multiple sign changes handled better                                                     |
| `INDEX(range, MATCH(lookup, key, 0))`               | `VLOOKUP`                 | Insert-safe (VLOOKUP breaks when a column is inserted in the source range)                                |
| `IFERROR(x/y, 0)` or `IF(y=0, 0, x/y)`              | bare division             | Guard every `/` in a financial model — `#DIV/0!` shipped = delivery failure                               |
| `MIRR(values, financeRate, reinvestRate)`           | `IRR` with sign flips     | When cash-flow pattern has 2+ sign changes                                                                |
| `SUMIFS(sumRange, criteriaRange1, criterion1, ...)` | `SUMPRODUCT((...))` array | Avoids the cached-value trap on array formulas (→ xlsx v2 §Common Workflow Step 5 array-formula fallback) |

**`SUMPRODUCT(1/COUNTIF(...))` distinct-count trap.** The CLI engine caches the inner division per-row → `1/N` (e.g. `0.001543`) rather than the true distinct count. `SUMPRODUCT(--((range<>"")/COUNTIF(range,range&"")))` pattern is likewise affected. **Fallback (from xlsx v2):** hardcode the correct distinct count with a blue font + adjacent comment `"hardcoded distinct count; update if rows change"`, and disclose at delivery. LBO deal-count or portfolio headcount from a transactions list is the typical pattern that hits this.

**Cross-sheet `NPV()` / `XNPV()` cache-0 fallback (preferred).** When the engine caches `0` on a cross-sheet `NPV()` / `XNPV()`, replace the formula with its algebraic equivalent `SUMPRODUCT(values/(1+rate)^periods)` — same result, caches correctly, audits cleanly. This is the first-line fix, used in Recipe B Step 4 by default. For `XNPV`, the period exponent is `(dates - base_date) / 365`.

**Cache fallback on `IRR` / `MOIC` / summary KPI cells (last resort).** If a valuation cell still ships with `cachedValue = 0` after algebraic rewrite + re-set after close, hardcode the computed value with a blue font and add a classic comment via `officecli add "$FILE" /Sheet --type comment --prop ref=<cell> --prop text='cached valuation; refreshes on open in Excel — do not edit'`. Disclose in delivery notes. Prefer re-set after close first.

## Circular references & iterative calc

**Enable `calc.iterate` ONLY when circularity is algebraically justified:** Interest ↔ Cash (LBO revolver / cash sweep), Tax shield ↔ NI (rare — most 3-statement models compute interest before tax and avoid), Revolver plug ↔ Ending cash (corporate cash waterfall with min-cash).

```bash
officecli set "$FILE" / --prop calc.iterate=true --prop calc.iterateCount=100 --prop calc.iterateDelta=0.001
```

`iterateCount=100` / `iterateDelta=0.001` are Excel defaults, fine for naturally dampening loops.

### Write-order surgery (de-ring → write downstream → re-ring)

`calc.iterate` controls recalc, not write-phase. Appending the closing leg of an already-wired cross-sheet ring (Debt.Interest ↔ CF.Cash ↔ Debt.CashSweep) deadlocks at 100% CPU; `view html` / `get` also hang on a non-converged ring.

**3-step playbook:**

1. **De-ring** — write Debt with the 10–20 ring cells set to literal `0` (e.g. `C7=0`, not `=-MIN(...)`). Removes the ring.
2. **Write downstream** — build all non-circular chains (P&L, CF, Exit, Returns, Summary, grid) non-resident, one heredoc per sheet. Everything caches against the zeroed cells.
3. **Re-ring** — close all residents, re-set each circular cell with its real formula, one `set` per cell, non-resident.

**Acceptance.** `get /Debt/C7 --json | jq .format.cachedValue` returns non-zero non-null. If a cell still deadlocks, leave `=0` + classic comment `"circular; recalculates in Excel on F9"`, flag at delivery. Never paper over with `iterateCount=1000`.

**Do NOT use `iterate` as a band-aid for `#REF!` / divergent values.** Raising `iterateCount` to 1000 hides the bug and ships a plausibly-wrong value; `validate` does not catch it. Break the loop algebraically (e.g. interest on opening balance only, not average).

**Verify convergence.** Read the loop cell, bump a driving assumption and back, re-read — values must match:

```bash
V1=$(officecli get "$FILE" /Debt/C9 --json | jq .format.cachedValue)
officecli set "$FILE" /Assumptions/B31 --prop value=0.085
officecli set "$FILE" /Assumptions/B31 --prop value=0.0845
V2=$(officecli get "$FILE" /Debt/C9 --json | jq .format.cachedValue)
[ "$V1" = "$V2" ] && echo "Iterate converged" || echo "WARN: drift V1=$V1 V2=$V2 — tighten iterateDelta or check algebra"
```

## Audit & Delivery Gate

**Assume there are problems.** First build is almost never correct. Run every gate below; every check must print its success line. `validate` passing is not delivery — the model can pass schema and still be wrong by a factor of 10.

### Gates 1–3 — inherited from xlsx v2 verbatim

→ see xlsx v2 §QA minimum cycle (Gates 1–3 cover `view issues`, error-cell query, `validate` after close). Run them first, exactly as written in xlsx v2. No financial-model-specific tweaks.

### Gate 4 — statement integrity (3-statement & LBO)

Balance-check and cash-reconciliation rows produced by Recipe A / C must show `OK` / `BALANCED` every period. `query` the check rows and refuse on any `IMBALANCED` / `CF !=`:

```bash
BS_FAIL=$(officecli query "$FILE" 'cell:contains("IMBALANCED")' --json | jq '.data.results | length')
CF_FAIL=$(officecli query "$FILE" 'cell:contains("CF !=")' --json | jq '.data.results | length')
SU_FAIL=$(officecli query "$FILE" 'cell:contains("S&U IMBALANCE")' --json | jq '.data.results | length')
if [ "$BS_FAIL" -eq 0 ] && [ "$CF_FAIL" -eq 0 ] && [ "$SU_FAIL" -eq 0 ]; then
  echo "Gate 4 OK (balance + recon + S&U all pass)"
else
  echo "REJECT Gate 4: BS=$BS_FAIL CF=$CF_FAIL S&U=$SU_FAIL"; exit 1
fi
```

If any fail, the model is silently wrong — fix the upstream chain before delivery. Most common cause: a cross-sheet formula stored `\!` (shell-mangled) — run `officecli query "$FILE" 'cell:contains("\\\\!")'` and re-enter via batch heredoc.

### Gate 5 — cached-value sanity on valuation cells

NPV / IRR / XIRR / equity-bridge / MOIC / summary KPI cells cached `0` = wrong number shipped to a reader who does not recalc on open. List every valuation cell and check `cachedValue`:

```bash
# Customize the path list per recipe — this is the DCF example
for P in "/DCF/C4" "/DCF/C5" "/DCF/C6" "/DCF/C8" "/DCF/C9"; do
  V=$(officecli get "$FILE" "$P" --json | jq -r '.format.cachedValue // "null"')
  if [ "$V" = "0" ] || [ "$V" = "null" ]; then
    echo "REJECT Gate 5: $P cached $V — re-set after close (see §Build-order & cache-drift)"; exit 1
  fi
  echo "Gate 5 $P: cached=$V OK"
done
```

For LBO, extend the list: `/Exit/B5`, `/Returns/B3`, `/Returns/B4`. For 3-statement, extend with `/Summary/B2:B5`.

### Gate 6 — hardcode / zone discipline

Every Calc sheet has zero numeric hardcodes. Executable:

```bash
HARDCODE=$(officecli query "$FILE" 'cell[type=Number]:not(:has(formula))' --json \
  | jq '[.data.results[] | select(.path | test("/(P&L|Balance Sheet|Cash Flow|DCF|Debt|FCF|WACC|Exit|Returns)/"))] | length')
[ "$HARDCODE" -eq 0 ] && echo "Gate 6 OK (no hardcodes on Calc sheets)" || { echo "REJECT Gate 6: $HARDCODE hardcoded numeric cells on Calc zone — move to Assumptions"; exit 1; }

# Named-range coverage + dead-decoration audit: ≥3 ranges declared AND each referenced by ≥1 formula.
NR=$(officecli query "$FILE" namedrange --json | jq '.data.results | length')
[ "$NR" -ge 3 ] && echo "Gate 6 OK ($NR named ranges)" || echo "WARN Gate 6: only $NR named ranges"
DEAD=0
for NR_NAME in $(officecli query "$FILE" namedrange --json | jq -r '.data.results[].name'); do
  USES=$(officecli query "$FILE" "cell:has(formula):contains(\"$NR_NAME\")" --json | jq '.data.results | length')
  [ "$USES" -ge 1 ] && echo "  $NR_NAME: $USES uses OK" || { echo "  WARN: $NR_NAME unused"; DEAD=$((DEAD+1)); }
done
[ "$DEAD" -eq 0 ] && echo "Gate 6 named-range audit OK" || { echo "REJECT Gate 6: $DEAD dead-decoration name(s)"; exit 1; }
```

### Gate 5b — visual audit via HTML preview (mandatory)

Gates 1–4/6 are grep defenses — they cannot see a rendered sheet. Run `officecli view "$FILE" html` and Read the returned HTML. Walk every sheet (inherits xlsx v2 visual floor):

- No `###` in any numeric cell (widen column).
- No truncated labels / section headers (widen column or `alignment.wrapText=true`).
- No placeholder tokens (`TBD`, `{var}`, `xxxx`) — Gate 6.1 grep below.
- Balance-check / recon rows say `OK` / `BALANCED` every period column.
- Dashboard charts render, y-axis = 0 on ARR/revenue lines, source data matches statement sheet.
- Sensitivity grid colors read green (upside) → red (downside) — color-scale CF applied.
- No stale cached `0` on summary KPIs; if present, run cache-refresh pass.

REJECT on any defect. **Human preview:** `officecli watch "$FILE"`, or open in Excel / WPS / Numbers — final colors + chart fidelity only fully render in the target viewer.

### Gate 6.1 — token / placeholder sweep

```bash
LEAK=$(officecli view "$FILE" text | grep -niE 'TBD|\(fill in\)|xxxx|lorem|\{\{|placeholder|coming soon')
[ -z "$LEAK" ] && echo "Gate 6.1 OK (no placeholder tokens)" || { echo "REJECT Gate 6.1:"; echo "$LEAK"; exit 1; }
```

### Honest limit

`validate` catches schema errors, not finance errors. A model passes `validate` with `BS.Cash` hardcoded to force balance, an `NPV` cached at `0`, a sensitivity grid all-zero because it was built before FCF, a `#NAME?` runtime on a `P&L`-named sheet with unquoted refs. Gates 4 / 5 / 6 / 5b exist because schema-level `validate` cannot catch any of this.

## Known Issues & Pitfalls

→ Base pitfalls (cross-sheet `!` trap, batch JSON dotted-name rule, resident + formula batch deadlock, renderer caveats, `labelRotation` / `pareto` / databar-min-max bugs, `validate` while resident): see xlsx v2 §Known Issues & Pitfalls — all apply.

Financial-model-specific:

- **AP sign on COGS.** Accounts Payable: if COGS is stored negative on the P&L, AP formula must negate — `=-COGS*DaysPayable/365`. Wrong sign inflates NWC and flips CF direction. Silent; passes `validate`.
- **`#NAME?` not caught by `query` / `validate`.** A cross-sheet formula referencing `P&L!B3` without quoting the sheet name (because `&` is special) lands at runtime as `#NAME?`. Always write cross-sheet refs as `'P&L'!B3` — single-quote the sheet name if it contains `&`, space, `(`, `)`, etc. Gate 5b visual check is the only detection.
- **Iterative calc silent non-convergence.** `calc.iterate=true iterateCount=100` converges at whatever the cap lands on — even if the true answer is 2× that. Always run convergence verify (§Circular references). Complex LBO rings (multi-tranche debt + sweep + tax shield) may not converge; when `cachedValue=0` on a ring cell, use §Write-order surgery.
- **Batch-while-resident deadlock on circular writes.** Writing the closing leg of a cross-sheet ring via `batch` with a resident open deadlocks at 100% CPU. Even single `set` on a ring cell can hang. Fix: close residents, write the ring in two passes per §Write-order surgery. Non-resident single-heredoc is the only safe form.
- **Cross-sheet cached value stale in `view html`.** Downstream written in the same sequence as upstream caches `0`. Excel resolves on open; HTML preview does NOT. Re-set every downstream non-resident after the chain (§Build-order & cache-drift).
- **`NPV()` / `XNPV()` cross-sheet caches `0` on v1.0.63.** Rewrite as `SUMPRODUCT(values/(1+rate)^periods)` — algebraically equivalent, caches correctly. Applied by default in Recipe B Step 4.
- **Sensitivity-grid cache trap.** Grid built before FCF/WACC → every cell caches `0`. Build FCF + WACC + DCF first, then grid in a separate non-resident batch. Fallback: hardcode blue + comment `"hardcoded sensitivity; refresh on assumption change"`.
- **`BS.Cash` = CF ending cash always** (including Y1: `BS.Cash = 'Cash Flow'!B19`). Never an independent plug or Assumptions ref — a plugged `BS.Cash` hides balance errors.
- **Year 2+ `Opening Cash` = prior period `Ending Cash`** (`C17=B19`, `D17=C19`). Independent Y2+ opening-cash inputs silently drift from BS.
- **Waterfall chart "total" bars.** `chartType=waterfall` cannot mark total programmatically — use `colors=` convention (dark = total, medium = positive, red = negative). See `help xlsx chart`.
- **DCF per-share when `SharesOut` is a formula.** `=BasicShares + OptionPool × ExerciseAssumption` → add a blue-font assumption cell and point the `SharesOut` named range at the computed cell, not the raw input.

## Help pointer

When in doubt: `officecli help xlsx [element] [--json]`. Help is the authoritative schema; this skill is the decision guide for financial-modeling deltas.
