---
# officecli: v1.0.24
name: officecli-data-dashboard
description: "Use this skill when the user wants to create a data dashboard, analytics dashboard, KPI dashboard, or executive summary from CSV/tabular data in Excel format. Trigger on: 'dashboard', 'KPI report', 'analytics summary', 'data visualization', 'CSV to Excel dashboard', 'executive dashboard', 'metrics dashboard'. Output is always a single .xlsx file."
---

# Data Dashboard Skill

Create professional, formula-driven Excel dashboards from CSV or tabular data. The output is a single `.xlsx` file with a data sheet and a Dashboard sheet -- charts linked to live data, KPIs powered by formulas, and conditional formatting for visual insight.

---

## BEFORE YOU START (CRITICAL)

**If `officecli` is not installed:**

`macOS / Linux`

```bash
if ! command -v officecli >/dev/null 2>&1; then
    curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
fi
```

`Windows (PowerShell)`

```powershell
if (-not (Get-Command officecli -ErrorAction SilentlyContinue)) {
    irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
}
```

Verify: `officecli --version`

If `officecli` is still not found after first install, open a new terminal and run the verify command again.

---

## Use When

- User wants to create a **dashboard** from CSV data or tabular data
- User asks for **KPI reports**, **analytics summaries**, or **metrics dashboards**
- User wants to **visualize data** in Excel with charts, sparklines, and conditional formatting
- User mentions "CSV to Excel", "executive dashboard", or "data visualization"

---

## What This Skill Produces

A single `.xlsx` file with:

| Component | Sheet     | Description                                                                         |
| --------- | --------- | ----------------------------------------------------------------------------------- |
| Raw data  | Sheet1    | Imported CSV with frozen headers, AutoFilter, column widths, conditional formatting |
| Dashboard | Dashboard | KPI cards (formula-driven), sparklines, charts (cell-range-linked), preset styling  |

The Dashboard sheet is **active on open**. All formulas **recalculate on open**.

---

## Core Concepts

### Formula-Driven KPIs

Every KPI value on the Dashboard is a formula referencing the data sheet. Never hardcode calculated values. When the underlying data changes, KPIs update automatically.

### Cell Range References for Charts

Every chart series references data sheet cells directly (`series1.values="Sheet1!B2:B13"`). Charts stay in sync with data. Never use inline data unless aggregation is impossible in Excel formulas.

### Chart Presets

Use `preset=dashboard` on charts for datasets with 10+ rows. For datasets with fewer than 10 rows, use `preset=minimal`. See the complexity table in A.3 of creating.md for the authoritative mapping -- **when any other text in this skill conflicts with that table, the table wins.** Presets are DeferredAddKeys -- they work on `add` only, NOT on `set`. A single preset replaces 5-8 manual styling properties with one consistent look.

### Data-Size-Aware Complexity

The number of KPIs, charts, sparklines, and CF rules scales with the input data size. A 5-row dataset gets 1 chart and no sparklines. A 200-row dataset gets 3-5 KPIs, 2-3 charts, sparklines, and multiple CF rules.

---

## Workflow Overview

### Phase 1: Analyze the Input Data

Count rows and columns. Identify column types (date, numeric, categorical). Determine the primary dimension (X-axis). Look up the data-size-to-complexity table.

### Phase 2: Plan Before Building

Decide how many KPIs, which chart types, which CF rules, and chart layout positions. Write out the plan before executing any commands.

### Phase 3: Build the Workbook

Follow the 11-step workflow: create + import, column widths, Dashboard sheet, KPIs, sparklines, charts, conditional formatting, tab colors, polish, raw-set, validate.

### Phase 4: QA

Run the QA checklist. Fix issues. Re-validate.

### Phase 5: Deliver

Deliver the `.xlsx` file. Tell the user the Dashboard sheet opens first and formulas recalculate automatically.

---

## Full Guide

Read [creating.md](creating.md) and follow it step by step. It contains the complete workflow, decision tables, command templates, a full runnable example, and the QA checklist.

---

## Quick Reference: Key Warnings

| Warning                                             | Detail                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch invocation                                    | `cat <<'EOF' \| officecli batch dashboard.xlsx` — file argument is **required**. `officecli batch` alone fails with "Required argument missing".                                                                                                                                                                                                                                                     |
| Batch JSON values                                   | ALL values must be strings: `"true"` not `true`, `"24"` not `24`                                                                                                                                                                                                                                                                                                                                     |
| Chart preset                                        | Add-only. `preset=dashboard` for 10+ rows, `preset=minimal` for < 10 rows                                                                                                                                                                                                                                                                                                                            |
| Scatter charts                                      | Use `series1.xValues` NOT `series1.categories` (causes validation error)                                                                                                                                                                                                                                                                                                                             |
| Reference lines                                     | Format is `value:color:label:dash` (color BEFORE label)                                                                                                                                                                                                                                                                                                                                              |
| Cell range refs                                     | Always `series1.values="Sheet1!B2:B13"`, never inline data                                                                                                                                                                                                                                                                                                                                           |
| raw-set ordering                                    | activeTab raw-set must be the LAST command. Use `set / --prop calc.fullCalcOnLoad=true` for calcPr (not raw-set).                                                                                                                                                                                                                                                                                    |
| formulacf                                           | Do NOT use `font.bold`. Use `fill` + `font.color` only                                                                                                                                                                                                                                                                                                                                               |
| Column widths                                       | `import --header` does NOT auto-size. Set widths manually on **ALL sheets including Dashboard**                                                                                                                                                                                                                                                                                                      |
| Dashboard ###                                       | KPI cells at 24pt bold WILL show ### if Dashboard columns are not set to width=22. See Step 4b                                                                                                                                                                                                                                                                                                       |
| pie chart                                           | `chartType=pie` has a known rendering issue in LibreOffice — chart renders blank (only legend visible). Use `chartType=doughnut` or `chartType=column` instead for category breakdowns.                                                                                                                                                                                                              |
| Dashboard KPI placement                             | KPI labels and values MUST be on the Dashboard sheet itself, not on Summary/Data sheets. Dashboard must show: KPI area (rows 1-2) + charts (rows 5+). See Step 3 CRITICAL box in creating.md.                                                                                                                                                                                                        |
| Helper columns                                      | After using helper columns on Dashboard for chart data sources, hide them with `officecli set file.xlsx '/Dashboard/col[N]' --prop hidden=true`. Visible helper columns are unprofessional clutter.                                                                                                                                                                                                  |
| **Chart data source (CRITICAL)**                    | **Chart series MUST reference visible cells on the Summary sheet or Data sheet — NEVER reference hidden columns or helper columns.** LibreOffice does not recalculate hidden columns on render; charts referencing hidden columns will display blank/empty data. Correct pattern: aggregate all chart data into visible rows on the Summary sheet, then reference those cells as chart data sources. |
| **Charts within print area**                        | After setting the print area, verify all charts are positioned inside it. Chart `x + width` must not exceed the print area column boundary. Recommended: chart width ≤ 90% of print area width.                                                                                                                                                                                                      |
| Summary sheet col widths                            | Summary sheet columns are NOT auto-sized. Always set widths after writing formulas: text/label cols 15-20, numeric cols 12-15. See Step 2 in creating.md.                                                                                                                                                                                                                                            |
| Percentage numFmt on Summary                        | `AVERAGEIFS`/ratio formula results on Summary sheet display as raw floats (0.083) unless `numFmt="0.0%"` is set at the same time as the formula. Never skip numFmt on percentage cells.                                                                                                                                                                                                              |
| **Header row fill (MANDATORY)**                     | Every sheet with column headers MUST have a dark fill on row 1: `officecli set dashboard.xlsx '/Sheet1/A1:F1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true`. Omitting header fill is a Quality Bar violation (Q2 fail). See Step 2b in creating.md.                                                                                                                             |
| **Conditional formatting (MANDATORY for 10+ rows)** | At least 1 CF rule (colorscale or databar) MUST be applied to a numeric column in the Data sheet for datasets with 10+ rows. Verify presence with `officecli query dashboard.xlsx 'conditionalformatting'`. Zero CF rules is a Q4 quality failure.                                                                                                                                                   |
| **KPI card background fill (Quality Bar)**          | Dashboard KPI card area (rows 1-2) SHOULD have a light background fill, e.g., `fill=F0F4FF`. Omitting this is a P2 deduction. See Step 4b in creating.md.                                                                                                                                                                                                                                            |

---

## Adjustments After Creation

When the user requests changes after the dashboard is built:

| Request                    | Command                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| Swap two sheets            | `officecli swap dashboard.xlsx '/Dashboard' '/Data'`                        |
| Move a sheet after another | `officecli move dashboard.xlsx '/Summary' --after '/Dashboard'`             |
| Edit a cell value          | `officecli set dashboard.xlsx '/Dashboard/A1' --prop value="..."`           |
| Find & replace text        | `officecli set dashboard.xlsx / --prop find=OldText --prop replace=NewText` |
| Update chart data          | `officecli set dashboard.xlsx '/Dashboard/chart[N]' --prop data="A1:D10"`   |

---

## References

- [creating.md](creating.md) -- Complete dashboard creation guide (the main skill file)
- [xlsx SKILL.md](../officecli-xlsx/SKILL.md) -- General xlsx reading, editing, and QA reference
