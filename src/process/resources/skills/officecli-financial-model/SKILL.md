---
# officecli: v1.0.24
name: officecli-financial-model
description: "Use this skill when the user wants to build a financial model,
  3-statement model, DCF valuation, cap table, scenario analysis, or
  financial projections in Excel. Trigger on: 'financial model',
  '3-statement model', 'DCF', 'cap table', 'pro forma', 'projections',
  'sensitivity analysis', 'waterfall', 'debt schedule', 'break-even',
  'discounted cash flow', 'capitalization table', 'fundraising model',
  'WACC calculation', 'scenario analysis model'.
  Input is a text prompt with assumptions. Output is a single .xlsx file
  with formula-driven, interconnected statement sheets."
---

# Financial Model Skill

Build formula-driven, multi-sheet financial models from scratch in Excel. Every number on every statement sheet is a formula referencing the Assumptions sheet. Output is a single `.xlsx` file with interconnected sheets -- Income Statement, Balance Sheet, Cash Flow Statement, and optional valuation or scenario analysis sheets.

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

- User provides assumptions and asks for financial projections or a financial model
- User asks for an "income statement", "balance sheet", or "cash flow statement"
- User asks for DCF valuation, WACC calculation, or discounted cash flow analysis
- User asks for a cap table, waterfall analysis, or fundraising model
- User asks for scenario analysis, sensitivity table, debt schedule, or break-even model

## Do NOT Use When

| User Request | Correct Skill |
|-------------|--------------|
| CSV data to dashboard / charts | officecli-data-dashboard |
| Edit/modify an existing .xlsx | officecli-xlsx (editing.md) |
| KPI dashboard or metrics summary | officecli-data-dashboard |
| 1-2 sheet visualization from existing data | officecli-data-dashboard |
| Word document or PowerPoint | officecli-docx / officecli-pitch-deck |

---

## What This Skill Produces

A single `.xlsx` file with 4-10 interconnected sheets:

| Sheet Type | Purpose | Key Characteristic |
|------------|---------|-------------------|
| Assumptions | All hardcoded inputs in one place | Blue font (`0000FF`) on every input cell |
| Income Statement | Revenue through Net Income | All rows are formulas referencing Assumptions |
| Balance Sheet | Assets, Liabilities, Equity | Must balance every period; includes check row |
| Cash Flow Statement | Operating, Investing, Financing | Ending Cash must equal BS Cash |
| DCF / Valuation | WACC, FCF, Terminal Value, Equity Value | Named ranges for key inputs |
| Sensitivity Table | 2-variable grid of implied values | Each cell is a self-contained formula |
| Scenarios | Dropdown-driven Base/Bull/Bear | IF/INDEX formulas reference dropdown |
| Error Checks | Balance, cash reconciliation, ISERROR scan | "ALL CLEAR" or "ERRORS FOUND" summary |
| Dashboard / Charts | Visual summary of model outputs | Charts use cell range references |

ALL values on statement sheets are formulas. The only hardcoded numbers are on the Assumptions sheet.

---

## Core Concepts

- **Assumptions-First Architecture** -- ALL hardcoded inputs go on the Assumptions sheet. Every other sheet references Assumptions. Changing one assumption recalculates the entire model.
- **Financial Color Coding** -- `font.color=0000FF` (blue) for inputs, `font.color=000000` (black) for formulas, `font.color=008000` (green) for cross-sheet references. Non-negotiable convention.
- **Formula Chain Integrity** -- Every derived value traces back to the Assumptions sheet through an unbroken chain of formula references.
- **Error Checking** -- Balance checks (Assets = Liabilities + Equity), cash reconciliation (CF ending cash = BS cash), and ISERROR scans on every sheet.
- **Batch-First Workflow** -- Use heredoc batch for ALL multi-cell operations, especially cross-sheet formulas. Verify after each batch.

---

## Workflow Overview

**Phase 1: Understand** -- Identify model type (3-statement, DCF, cap table, scenario). Determine which sheets are needed and the formula dependency chain.

**Phase 2: Plan** -- Map sheet structure, column layout (labels + year columns), and cross-sheet formula dependencies. Define the build order.

**Phase 3: Build** -- Follow the mandatory 10-step build sequence in creating.md Section A.7. Build in layers: structure, assumptions, formulas (IS then BS then CF), formatting, charts, protection, raw-set, validate.

**Phase 4: QA** -- Run the QA checklist: validate, formula error scan, cross-sheet verification, balance check, cash reconciliation, chart data check.

**Phase 5: Deliver** -- Deliver the `.xlsx` file. Note that formulas recalculate on open (fullCalcOnLoad is set).

---

## Quick Reference: Key Warnings

| Warning | Detail |
|---------|--------|
| Cross-sheet `!` escaping | Use heredoc batch for ALL cross-sheet formulas. Verify with `officecli get` after each batch. |
| Batch size limit | 8-12 operations per batch, non-resident mode. Larger batches have ~33% failure rate. |
| Batch JSON values | ALL values must be strings: `"true"` not `true`, `"24"` not `24` |
| fullCalcOnLoad + iterate | MANDATORY. Always use `//x:definedNames --action insertafter` (financial models always have named ranges) |
| Blue inputs / black formulas | `font.color=0000FF` on Assumptions inputs, `font.color=000000` on all formula cells |
| Balance sheet must balance | Explicit check formula: `=TotalAssets - TotalLiabilities - TotalEquity` must equal 0 |
| Cash reconciliation | CF ending cash must equal BS cash for every period |
| No Excel Data Tables | Sensitivity tables must be manual formula grids. Each cell is an explicit self-contained formula. |
| Number format `$` quoting | Use heredoc batch or single quotes to prevent shell expansion of `$` |
| Named ranges required | Define for all key assumptions (WACC, growth rates, tax rate). Required for auditability. |
| Column widths | No auto-fit. Set explicitly: labels=22-28, numbers=14-18, year headers=12-14 |
| formulacf no font.bold | Use `fill` + `font.color` only. `font.bold` causes validation errors. |
| raw-set ordering | activeTab and calcPr MUST be the absolute last commands |
| BS Cash = CF Ending Cash | BS Cash ALWAYS equals `=Cash Flow!B19`, including Year 1. Never use cash-as-plug or reference Assumptions directly. |
| Chart title `$` in shell | Use heredoc batch for chart titles containing `$` to prevent shell expansion. |

---

## Known Issues

| Issue | Workaround |
|-------|------------|
| `!` escaping in cross-sheet formulas | Always use heredoc batch. Verify with `officecli get`. |
| Batch failure at scale | Keep batches to 8-12 ops. Non-resident mode. Retry individually on failure. |
| Cannot rename sheets | Plan sheet names upfront before creation. |
| Sensitivity tables are manual | Each cell needs an explicit formula. No Excel DATA TABLE support. |
| Chart series fixed at creation | Cannot add series later. Plan all series before `add`. |
| Formula cached values blank | `view text` shows blank for formula cells. This is normal. Set fullCalcOnLoad. |
| Waterfall chart totals | Cannot mark bars as totals programmatically. Use color convention. |
| Circular references | Use `<calcPr iterate="1" ...>`. Design model to avoid unnecessary circularity. |
| Chart title `$` stripping | Shell expands `$` in `--prop title`. Use heredoc batch for chart titles with `$`, or omit `$` from titles. |

---

## Full Guide

Read [creating.md](creating.md) and follow it step by step. It contains setup conventions, core financial statement patterns, advanced patterns (DCF, sensitivity, scenarios), chart recipes, QA checklist, and known issues with workarounds.

## References

- [creating.md](creating.md) -- Complete financial model creation guide
- [xlsx SKILL.md](../xlsx/SKILL.md) -- General xlsx reading, editing, and QA reference
- [data-dashboard creating.md](../officecli-data-dashboard/creating.md) -- Batch syntax, chart presets, and CF basics
