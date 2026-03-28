---
name: data-dashboard
description: "Use this skill when the user wants to create a data dashboard, analytics dashboard, KPI dashboard, or executive summary from CSV/tabular data in Excel format. Trigger on: 'dashboard', 'KPI report', 'analytics summary', 'data visualization', 'CSV to Excel dashboard', 'executive dashboard', 'metrics dashboard'. Output is always a single .xlsx file."
---

# Data Dashboard Skill

Create professional, formula-driven Excel dashboards from CSV or tabular data. The output is a single `.xlsx` file with a data sheet and a Dashboard sheet -- charts linked to live data, KPIs powered by formulas, and conditional formatting for visual insight.

---

## BEFORE YOU START (CRITICAL)

**Every time before using officecli, run this check:**

```bash
if ! command -v officecli &> /dev/null; then
    echo "Installing officecli..."
    curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
    # Windows: irm https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.ps1 | iex
else
    CURRENT=$(officecli --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    LATEST=$(curl -fsSL https://api.github.com/repos/iOfficeAI/OfficeCLI/releases/latest | grep '"tag_name"' | sed -E 's/.*"v?([0-9.]+)".*/\1/')
    if [ "$CURRENT" != "$LATEST" ]; then
        echo "Upgrading officecli $CURRENT -> $LATEST..."
        curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
    else
        echo "officecli $CURRENT is up to date"
    fi
fi
officecli --version
```

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

| Warning           | Detail                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Batch JSON values | ALL values must be strings: `"true"` not `true`, `"24"` not `24`                                |
| Chart preset      | Add-only. `preset=dashboard` for 10+ rows, `preset=minimal` for < 10 rows                       |
| Scatter charts    | Use `series1.xValues` NOT `series1.categories` (causes validation error)                        |
| Reference lines   | Format is `value:color:label:dash` (color BEFORE label)                                         |
| Cell range refs   | Always `series1.values="Sheet1!B2:B13"`, never inline data                                      |
| raw-set ordering  | activeTab and calcPr must be the LAST commands                                                  |
| formulacf         | Do NOT use `font.bold`. Use `fill` + `font.color` only                                          |
| Column widths     | `import --header` does NOT auto-size. Set widths manually on **ALL sheets including Dashboard** |
| Dashboard ###     | KPI cells at 24pt bold WILL show ### if Dashboard columns are not set to width=22. See Step 4b  |

---

## References

- [creating.md](creating.md) -- Complete dashboard creation guide (the main skill file)
- [xlsx SKILL.md](../xlsx/SKILL.md) -- General xlsx reading, editing, and QA reference
