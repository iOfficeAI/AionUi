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

| User Request                               | Correct Skill                         |
| ------------------------------------------ | ------------------------------------- |
| CSV data to dashboard / charts             | officecli-data-dashboard              |
| Edit/modify an existing .xlsx              | officecli-xlsx (editing.md)           |
| KPI dashboard or metrics summary           | officecli-data-dashboard              |
| 1-2 sheet visualization from existing data | officecli-data-dashboard              |
| Word document or PowerPoint                | officecli-docx / officecli-pitch-deck |

---

## What This Skill Produces

A single `.xlsx` file with 4-10 interconnected sheets:

| Sheet Type          | Purpose                                    | Key Characteristic                            |
| ------------------- | ------------------------------------------ | --------------------------------------------- |
| Assumptions         | All hardcoded inputs in one place          | Blue font (`0000FF`) on every input cell      |
| Income Statement    | Revenue through Net Income                 | All rows are formulas referencing Assumptions |
| Balance Sheet       | Assets, Liabilities, Equity                | Must balance every period; includes check row |
| Cash Flow Statement | Operating, Investing, Financing            | Ending Cash must equal BS Cash                |
| DCF / Valuation     | WACC, FCF, Terminal Value, Equity Value    | Named ranges for key inputs                   |
| Sensitivity Table   | 2-variable grid of implied values          | Each cell is a self-contained formula         |
| Scenarios           | Dropdown-driven Base/Bull/Bear             | IF/INDEX formulas reference dropdown          |
| Error Checks        | Balance, cash reconciliation, ISERROR scan | "ALL CLEAR" or "ERRORS FOUND" summary         |
| Dashboard / Charts  | Visual summary of model outputs            | Charts use cell range references              |

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

| Warning                                                 | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sheet names with spaces in CLI paths (REQUIRED)**     | When using `officecli get` or `officecli set` with a sheet name that contains spaces (e.g., "Cash Flow", "ARR Waterfall"), the sheet name portion of the path MUST be wrapped in single quotes: `officecli get model.xlsx "'/Cash Flow/A1'"`. Without single quotes, the command fails with Err:509. In JSON batch paths, no extra quoting is needed (the JSON string already handles it).                                                                   |
| Cross-sheet `!` escaping                                | Use heredoc batch for ALL cross-sheet formulas. Verify with `officecli get` after each batch.                                                                                                                                                                                                                                                                                                                                                                |
| Batch size limit                                        | 15-20 ops per batch in resident mode (recommended). 8-12 ops without resident mode.                                                                                                                                                                                                                                                                                                                                                                          |
| Batch JSON values                                       | ALL values must be strings: `"true"` not `true`, `"24"` not `24`                                                                                                                                                                                                                                                                                                                                                                                             |
| fullCalcOnLoad + iterate                                | MANDATORY. Use `officecli set model.xlsx / --prop calc.fullCalcOnLoad=true --prop calc.iterate=true`. Do NOT use raw-set (creates duplicates).                                                                                                                                                                                                                                                                                                               |
| Blue inputs / black formulas                            | `font.color=0000FF` on Assumptions inputs, `font.color=000000` on all formula cells                                                                                                                                                                                                                                                                                                                                                                          |
| **Header row background color (REQUIRED)**              | All section header rows MUST have `fill` set. Use `"fill":"1F3864","font.color":"FFFFFF"` (dark navy + white text). Header rows without fill fail the Quality Bar check (Q2).                                                                                                                                                                                                                                                                                |
| **Header row fill MUST cover ALL columns (A:D or A:G)** | Section header rows (REVENUE, ASSETS, etc.) must apply the dark fill to ALL columns in that row, not just the A-column label cell. If only A is filled, B/C/D columns on that row show black text on a white background — extremely poor readability against the dark header. Correct: `{"command":"set","path":"/P&L/A5:D5","props":{"shd":"1F3864","color":"FFFFFF","bold":true}}`. Wrong: set only `/P&L/A5`.                                             |
| Balance sheet must balance                              | Explicit check formula: `=TotalAssets - TotalLiabilities - TotalEquity` must equal 0                                                                                                                                                                                                                                                                                                                                                                         |
| Cash reconciliation                                     | CF ending cash must equal BS cash for every period                                                                                                                                                                                                                                                                                                                                                                                                           |
| No Excel Data Tables                                    | Sensitivity tables must be manual formula grids. Each cell is an explicit self-contained formula.                                                                                                                                                                                                                                                                                                                                                            |
| Number format `$` quoting                               | Use heredoc batch or single quotes to prevent shell expansion of `$`                                                                                                                                                                                                                                                                                                                                                                                         |
| Named ranges required                                   | Define for all key assumptions (WACC, growth rates, tax rate). Required for auditability.                                                                                                                                                                                                                                                                                                                                                                    |
| Column widths                                           | No auto-fit. Set explicitly: labels=22-28, numbers=14-18, year headers=12-14                                                                                                                                                                                                                                                                                                                                                                                 |
| formulacf no font.bold                                  | Use `fill` + `font.color` only. `font.bold` causes validation errors.                                                                                                                                                                                                                                                                                                                                                                                        |
| raw-set ordering                                        | activeTab raw-set MUST be the last command. calcPr uses high-level `set / --prop calc.*` instead of raw-set.                                                                                                                                                                                                                                                                                                                                                 |
| BS Cash = CF Ending Cash                                | BS Cash ALWAYS equals `=Cash Flow!B19`, including Year 1. Never use cash-as-plug or reference Assumptions directly.                                                                                                                                                                                                                                                                                                                                          |
| Chart title `$` in shell                                | Use heredoc batch for chart titles containing `$` to prevent shell expansion.                                                                                                                                                                                                                                                                                                                                                                                |
| **Freeze panes (REQUIRED on every data sheet)**         | Every sheet with column headers must have freeze panes set (`freeze=B2` or `freeze=B3`). Missing freeze panes is a Hard Rule violation. Apply in Step 8e of build sequence.                                                                                                                                                                                                                                                                                  |
| **Formula cells black font (REQUIRED)**                 | All formula cells on statement sheets must have `font.color=000000`. Omitting this makes the Blue=Input / Black=Formula color convention invisible. Apply in Step 8f of build sequence. **Step 8f applies to EVERY formula cell on EVERY statement sheet** — Income Statement, Balance Sheet, Cash Flow, Assumptions (roll-forward/output rows), and all auxiliary sheets. Apply by row range for each sheet; do NOT apply to only one sheet or one section. |
| **H8: Summary or Dashboard sheet (REQUIRED)**           | Every financial model output MUST include a Summary or Dashboard sheet containing at least 4 KPI values sourced from the statement sheets (e.g., Revenue, EBITDA, Net Income, Ending Cash, or equivalent). A model delivered without a Summary/Dashboard sheet fails this Hard Rule. Specialized single-purpose models (ARR Waterfall, DCF-only) satisfy this with a dedicated Summary tab. Tab color: `70AD47` (green).                                     |

---

## Pre-Delivery Checklist

Before delivering the `.xlsx` file, verify all items:

| #   | Check                                                 | How to Verify                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Freeze panes on every data sheet                      | `officecli get model.xlsx "/Sheet"` — confirm `freeze` property is set                                                                                                                                                                                                                                                                                                                                                                                   |
| 2   | Formula cells have black font (`000000`)              | **No CLI command can reliably detect font color.** `officecli view text` does NOT output font color information — any grep-based check against color values is a false negative and always returns 0 lines regardless of actual color. **Must verify visually:** run `officecli view model.xlsx html > preview.html` and open in browser, or take a screenshot, and confirm formula cells appear in black. Apply Step 8f to ALL sheets before verifying. |
| 3   | Input cells have blue font (`0000FF`)                 | Assumptions sheet cells B:D must be blue                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | Header rows fill covers ALL columns (A:D or wider)    | Screenshot check — no white-background cells in header rows                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | Balance Check = TRUE every period                     | `officecli get model.xlsx "/Balance Sheet/B18" --json`                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | Cash Reconciliation = TRUE every period               | `officecli get model.xlsx "/Cash Flow/B21" --json`                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | No `\!` in cross-sheet formulas                       | `officecli get model.xlsx "/Income Statement/B3"` — no backslash                                                                                                                                                                                                                                                                                                                                                                                         |
| 8   | fullCalcOnLoad + iterate set                          | `officecli validate model.xlsx` passes                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9   | Year 2+ Beginning ARR = Prior Year Ending ARR         | No independent "Opening ARR" input in Assumptions for Year 2+                                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | Opening Equity = Opening Assets - Opening Liabilities | Balance Check Year 1 = TRUE (not hardcoded equity value)                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## Known Issues

| Issue                                     | Workaround                                                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `!` escaping in cross-sheet formulas      | Always use heredoc batch. Verify with `officecli get`.                                                                                                                                                                                   |
| Batch failure at scale                    | Use resident mode + 15-20 ops per batch. If failure persists, reduce to 8-12. Retry individually as last resort.                                                                                                                         |
| Cannot rename sheets                      | Plan sheet names upfront before creation.                                                                                                                                                                                                |
| Sensitivity tables are manual             | Each cell needs an explicit formula. No Excel DATA TABLE support.                                                                                                                                                                        |
| Chart series fixed at creation            | Cannot add series later. Plan all series before `add`.                                                                                                                                                                                   |
| Formula cached values blank               | `view text` shows blank for formula cells. This is normal. Set fullCalcOnLoad.                                                                                                                                                           |
| Waterfall chart totals                    | Cannot mark bars as totals programmatically. Use color convention.                                                                                                                                                                       |
| Circular references                       | Use `<calcPr iterate="1" ...>`. Design model to avoid unnecessary circularity.                                                                                                                                                           |
| Chart title `$` stripping                 | Shell expands `$` in `--prop title`. Use heredoc batch for chart titles with `$`, or omit `$` from titles.                                                                                                                               |
| AP formula sign error                     | AP (Accounts Payable) must be a positive number. If COGS is stored as a negative value, AP formula must negate it: `=-COGS*DPO/365`. Wrong sign causes NWC overstatement and incorrect Cash Flow direction. See creating.md C.6 WARNING. |
| `#NAME?` not detectable by query/validate | `officecli query` and `validate` cannot detect runtime `#NAME?` errors from unquoted sheet names (e.g., `P&L!B3`). Run screenshot check (creating.md E.8 Step 10) when any sheet name contains `&`, spaces, or parentheses.              |

---

## Adjustments After Creation

When the user requests changes after the model is built:

| Request                    | Command                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| Swap two sheets            | `officecli swap model.xlsx '/Sheet1' '/Sheet2'`                         |
| Move a sheet after another | `officecli move model.xlsx '/Scenarios' --after '/Assumptions'`         |
| Edit a cell value          | `officecli set model.xlsx '/SheetName/A1' --prop value="..."`           |
| Find & replace text        | `officecli set model.xlsx / --prop find=OldText --prop replace=NewText` |
| Remove a row               | `officecli remove model.xlsx '/SheetName/row[N]'`                       |

---

## Full Guide

Read [creating.md](creating.md) and follow it step by step. It contains setup conventions, core financial statement patterns, advanced patterns (DCF, sensitivity, scenarios), chart recipes, QA checklist, and known issues with workarounds.

## References

- [creating.md](creating.md) -- Complete financial model creation guide
- [xlsx SKILL.md](../xlsx/SKILL.md) -- General xlsx reading, editing, and QA reference
- [data-dashboard creating.md](../officecli-data-dashboard/creating.md) -- Batch syntax, chart presets, and CF basics
