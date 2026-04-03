<!-- officecli: v1.0.23 -->

# Creating Workbooks from Scratch

Use this guide when creating a new workbook with no template.

## Workflow Overview

1. **Create** blank workbook
2. **Plan** sheet structure (sheets, data layout, formulas, charts)
3. **Build** each sheet incrementally — run each command and check output before proceeding; use `batch` only for bulk cell data entry (filling many cells or rows with values/formulas)
4. **QA** (content + formula verification + validation) -- see [SKILL.md](SKILL.md#qa-required)

---

## Setup

```bash
# Create blank workbook (Sheet1 auto-created)
officecli create data.xlsx

# Set metadata
officecli set data.xlsx / --prop title="Q4 Financial Report" --prop author="Finance Team"

# Add sheets
officecli add data.xlsx / --type sheet --prop name="Revenue"
officecli add data.xlsx / --type sheet --prop name="Expenses"
officecli add data.xlsx / --type sheet --prop name="Summary"

# Set tab colors
officecli set data.xlsx "/Revenue" --prop tabColor=4472C4
officecli set data.xlsx "/Expenses" --prop tabColor=FF6600
officecli set data.xlsx "/Summary" --prop tabColor=2C5F2D
```

---

> **Execute recipes incrementally — one command (or one `batch` block) at a time, not as a single shell script.** Read the output after each command. If a command fails, fix it before continuing. After each structural phase (sheet creation, chart insertion, named ranges), verify with `validate` or `get` before proceeding.

## Recipe: Financial Dashboard

Complete, copy-pasteable sequence. Tests: multi-sheet, formulas, cross-sheet references, charts (column, pie, combo), conditional formatting (icon sets, data bars, color scales), number formatting, financial color coding, named ranges, freeze panes, tables, batch mode, resident mode.

```bash
# Create workbook and open in resident mode
officecli create financial-dashboard.xlsx
officecli open financial-dashboard.xlsx

# Metadata
officecli set financial-dashboard.xlsx / --prop title="FY2025 Financial Dashboard" --prop author="Finance Team"

# Add sheets (Sheet1 already exists, rename later or use as-is)
officecli add financial-dashboard.xlsx / --type sheet --prop name="Revenue"
officecli add financial-dashboard.xlsx / --type sheet --prop name="Expenses"
officecli add financial-dashboard.xlsx / --type sheet --prop name="PL"
officecli add financial-dashboard.xlsx / --type sheet --prop name="Dashboard"
officecli remove financial-dashboard.xlsx "/Sheet1"

# Tab colors
officecli set financial-dashboard.xlsx "/Revenue" --prop tabColor=4472C4
officecli set financial-dashboard.xlsx "/Expenses" --prop tabColor=FF6600
officecli set financial-dashboard.xlsx "/PL" --prop tabColor=2C5F2D
officecli set financial-dashboard.xlsx "/Dashboard" --prop tabColor=7030A0

# ── Revenue Sheet ──
# Headers
officecli set financial-dashboard.xlsx /Revenue/A1 --prop value=Month --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Revenue/B1 --prop value="Product A" --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Revenue/C1 --prop value="Product B" --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Revenue/D1 --prop value=Total --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF

# Monthly data -- blue text for hardcoded inputs
officecli set financial-dashboard.xlsx /Revenue/A2 --prop value=Jan
officecli set financial-dashboard.xlsx /Revenue/A3 --prop value=Feb
officecli set financial-dashboard.xlsx /Revenue/A4 --prop value=Mar
officecli set financial-dashboard.xlsx /Revenue/A5 --prop value=Apr
officecli set financial-dashboard.xlsx /Revenue/A6 --prop value=May
officecli set financial-dashboard.xlsx /Revenue/A7 --prop value=Jun
officecli set financial-dashboard.xlsx /Revenue/A8 --prop value=Jul
officecli set financial-dashboard.xlsx /Revenue/A9 --prop value=Aug
officecli set financial-dashboard.xlsx /Revenue/A10 --prop value=Sep
officecli set financial-dashboard.xlsx /Revenue/A11 --prop value=Oct
officecli set financial-dashboard.xlsx /Revenue/A12 --prop value=Nov
officecli set financial-dashboard.xlsx /Revenue/A13 --prop value=Dec

officecli set financial-dashboard.xlsx /Revenue/B2 --prop value=42000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B3 --prop value=45000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B4 --prop value=48000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B5 --prop value=51000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B6 --prop value=53000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B7 --prop value=56000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B8 --prop value=58000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B9 --prop value=55000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B10 --prop value=60000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B11 --prop value=62000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B12 --prop value=65000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B13 --prop value=70000 --prop font.color=0000FF --prop numFmt='$#,##0'

officecli set financial-dashboard.xlsx /Revenue/C2 --prop value=28000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C3 --prop value=30000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C4 --prop value=32000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C5 --prop value=35000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C6 --prop value=36000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C7 --prop value=38000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C8 --prop value=40000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C9 --prop value=37000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C10 --prop value=42000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C11 --prop value=44000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C12 --prop value=46000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C13 --prop value=48000 --prop font.color=0000FF --prop numFmt='$#,##0'

# Total column -- SUM formulas in black text
officecli set financial-dashboard.xlsx /Revenue/D2 --prop formula="SUM(B2:C2)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D3 --prop formula="SUM(B3:C3)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D4 --prop formula="SUM(B4:C4)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D5 --prop formula="SUM(B5:C5)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D6 --prop formula="SUM(B6:C6)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D7 --prop formula="SUM(B7:C7)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D8 --prop formula="SUM(B8:C8)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D9 --prop formula="SUM(B9:C9)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D10 --prop formula="SUM(B10:C10)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D11 --prop formula="SUM(B11:C11)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D12 --prop formula="SUM(B12:C12)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D13 --prop formula="SUM(B13:C13)" --prop font.color=000000 --prop numFmt='$#,##0'

# SUM row at bottom
officecli set financial-dashboard.xlsx /Revenue/A14 --prop value=Total --prop bold=true
officecli set financial-dashboard.xlsx /Revenue/B14 --prop formula="SUM(B2:B13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C14 --prop formula="SUM(C2:C13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D14 --prop formula="SUM(D2:D13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'

# Revenue column widths and freeze
officecli set financial-dashboard.xlsx "/Revenue/col[A]" --prop width=12
officecli set financial-dashboard.xlsx "/Revenue/col[B]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue/col[C]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue/col[D]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue" --prop freeze=A2

# Revenue column chart
officecli add financial-dashboard.xlsx /Revenue --type chart --prop chartType=column --prop title="Monthly Revenue by Product" --prop series1.values="Revenue!B2:B13" --prop series1.categories="Revenue!A2:A13" --prop series1.name="Product A" --prop series2.values="Revenue!C2:C13" --prop series2.categories="Revenue!A2:A13" --prop series2.name="Product B" --prop x=6 --prop y=1 --prop width=12 --prop height=15 --prop colors=1F4E79,4472C4 --prop legend=bottom

# ── Expenses Sheet ──
officecli set financial-dashboard.xlsx /Expenses/A1 --prop value=Category --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Expenses/B1 --prop value=Monthly --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Expenses/C1 --prop value=Annual --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Expenses/A2 --prop value=Rent
officecli set financial-dashboard.xlsx /Expenses/A3 --prop value=Salaries
officecli set financial-dashboard.xlsx /Expenses/A4 --prop value=Marketing
officecli set financial-dashboard.xlsx /Expenses/A5 --prop value=Operations
officecli set financial-dashboard.xlsx /Expenses/A6 --prop value=Technology
officecli set financial-dashboard.xlsx /Expenses/A7 --prop value=Total --prop bold=true
officecli set financial-dashboard.xlsx /Expenses/B2 --prop value=5000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B3 --prop value=45000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B4 --prop value=8000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B5 --prop value=6000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B6 --prop value=4000 --prop font.color=0000FF --prop numFmt='$#,##0'

officecli set financial-dashboard.xlsx /Expenses/B7 --prop formula="SUM(B2:B6)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C2 --prop formula="B2*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C3 --prop formula="B3*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C4 --prop formula="B4*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C5 --prop formula="B5*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C6 --prop formula="B6*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C7 --prop formula="SUM(C2:C6)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'

# Expenses column widths and freeze
officecli set financial-dashboard.xlsx "/Expenses/col[A]" --prop width=15
officecli set financial-dashboard.xlsx "/Expenses/col[B]" --prop width=14
officecli set financial-dashboard.xlsx "/Expenses/col[C]" --prop width=14
officecli set financial-dashboard.xlsx "/Expenses" --prop freeze=A2

# Expense pie chart
officecli add financial-dashboard.xlsx /Expenses --type chart --prop chartType=pie --prop title="Expense Breakdown" --prop categories="Rent,Salaries,Marketing,Operations,Technology" --prop data="Monthly:5000,45000,8000,6000,4000" --prop colors=1F4E79,4472C4,70AD47,FFC000,FF6600 --prop dataLabels=percent --prop x=5 --prop y=1 --prop width=10 --prop height=12

# ── P&L Sheet ──
officecli set financial-dashboard.xlsx /PL/A1 --prop value=Metric --prop bold=true --prop fill=2C5F2D --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /PL/B1 --prop value=Annual --prop bold=true --prop fill=2C5F2D --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /PL/C1 --prop value="Margin %" --prop bold=true --prop fill=2C5F2D --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /PL/A2 --prop value="Total Revenue"
officecli set financial-dashboard.xlsx /PL/A3 --prop value="Total Expenses"
officecli set financial-dashboard.xlsx /PL/A4 --prop value="Net Income" --prop bold=true
officecli set financial-dashboard.xlsx /PL/A5 --prop value="Gross Margin %"

# Cross-sheet formulas -- green text
officecli set financial-dashboard.xlsx /PL/B2 --prop "formula==Revenue!D14" --prop font.color=008000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /PL/B3 --prop "formula==Expenses!C7" --prop font.color=008000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /PL/B4 --prop formula="B2-B3" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /PL/C4 --prop formula="IFERROR(B4/B2,0)" --prop font.color=000000 --prop numFmt=0.0%

# P&L column widths and freeze
officecli set financial-dashboard.xlsx "/PL/col[A]" --prop width=18
officecli set financial-dashboard.xlsx "/PL/col[B]" --prop width=15
officecli set financial-dashboard.xlsx "/PL/col[C]" --prop width=12
officecli set financial-dashboard.xlsx "/PL" --prop freeze=A2

# Combo chart (revenue bars + margin line)
officecli add financial-dashboard.xlsx /PL --type chart --prop chartType=combo --prop title="Revenue vs Margin" --prop categories="Revenue,Expenses,Net Income" --prop series1="Amount:665000,816000,-151000" --prop series2="Margin:100,0,0" --prop comboSplit=1 --prop secondary=2 --prop colors=2C5F2D,FF6600 --prop x=5 --prop y=1 --prop width=12 --prop height=12

# ── Dashboard Sheet ──
officecli set financial-dashboard.xlsx /Dashboard/A1 --prop value="FY2025 Financial Dashboard" --prop bold=true --prop font.size=18 --prop font.color=1F4E79
officecli set financial-dashboard.xlsx /Dashboard/A1:D1 --prop merge=true
officecli set financial-dashboard.xlsx /Dashboard/A3 --prop value="Total Revenue" --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B3 --prop "formula==PL!B2" --prop font.color=008000 --prop font.size=16 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Dashboard/A4 --prop value="Total Expenses" --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B4 --prop "formula==PL!B3" --prop font.color=008000 --prop font.size=16 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Dashboard/A5 --prop value="Net Income" --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B5 --prop "formula==PL!B4" --prop font.color=008000 --prop font.size=16 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Dashboard/A6 --prop value=Margin --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B6 --prop "formula==PL!C4" --prop font.color=008000 --prop font.size=16 --prop numFmt=0.0%

# Dashboard column widths
officecli set financial-dashboard.xlsx "/Dashboard/col[A]" --prop width=20
officecli set financial-dashboard.xlsx "/Dashboard/col[B]" --prop width=18

# Conditional formatting on dashboard KPIs
officecli add financial-dashboard.xlsx /Dashboard --type databar --prop sqref="B3:B5" --prop color=4472C4 --prop min=0 --prop max=1000000
officecli add financial-dashboard.xlsx /Dashboard --type iconset --prop sqref="B6" --prop iconset=3TrafficLights1

# Named ranges for key assumptions
officecli add financial-dashboard.xlsx / --type namedrange --prop name="TotalRevenue" --prop ref="PL!B2" --prop comment="Annual total revenue"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="TotalExpenses" --prop ref="PL!B3" --prop comment="Annual total expenses"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="NetIncome" --prop ref="PL!B4" --prop comment="Annual net income"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="GrossMargin" --prop ref="PL!C4" --prop comment="Gross margin percentage"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="MonthlyRent" --prop ref="Expenses!B2" --prop comment="Monthly rent assumption"

# QA
officecli view financial-dashboard.xlsx issues
officecli validate financial-dashboard.xlsx
officecli close financial-dashboard.xlsx
```

---

## Recipe: Sales Tracker

Complete, copy-pasteable sequence. Tests: data entry layout, validation, autofilter, tables, sparklines, conditional formatting.

```bash
officecli create sales-tracker.xlsx
officecli open sales-tracker.xlsx

# Metadata
officecli set sales-tracker.xlsx / --prop title="Sales Tracker 2025" --prop author="Sales Ops"

# Rename Sheet1 is not directly supported; add new sheet and remove old
officecli add sales-tracker.xlsx / --type sheet --prop name="Sales Data"
officecli add sales-tracker.xlsx / --type sheet --prop name="Summary"
officecli remove sales-tracker.xlsx "/Sheet1"

# ── Sales Data Sheet ──
# Headers
officecli set sales-tracker.xlsx "/Sales Data/A1" --prop value=Date --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/B1" --prop value="Sales Rep" --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/C1" --prop value=Region --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/D1" --prop value=Product --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/E1" --prop value=Amount --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/F1" --prop value=Status --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF

# Sample data rows
officecli set sales-tracker.xlsx "/Sales Data/A2" --prop value=2025-01-15 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B2" --prop value="Alice Chen"
officecli set sales-tracker.xlsx "/Sales Data/C2" --prop value=North
officecli set sales-tracker.xlsx "/Sales Data/D2" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E2" --prop value=12500 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F2" --prop value=Won
officecli set sales-tracker.xlsx "/Sales Data/A3" --prop value=2025-01-22 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B3" --prop value="Bob Martinez"
officecli set sales-tracker.xlsx "/Sales Data/C3" --prop value=South
officecli set sales-tracker.xlsx "/Sales Data/D3" --prop value="Widget Basic"
officecli set sales-tracker.xlsx "/Sales Data/E3" --prop value=8200 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F3" --prop value=Won

officecli set sales-tracker.xlsx "/Sales Data/A4" --prop value=2025-02-03 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B4" --prop value="Carol Wu"
officecli set sales-tracker.xlsx "/Sales Data/C4" --prop value=East
officecli set sales-tracker.xlsx "/Sales Data/D4" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E4" --prop value=15800 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F4" --prop value=Pending
officecli set sales-tracker.xlsx "/Sales Data/A5" --prop value=2025-02-10 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B5" --prop value="Dave Kim"
officecli set sales-tracker.xlsx "/Sales Data/C5" --prop value=West
officecli set sales-tracker.xlsx "/Sales Data/D5" --prop value="Widget Enterprise"
officecli set sales-tracker.xlsx "/Sales Data/E5" --prop value=32000 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F5" --prop value=Won

officecli set sales-tracker.xlsx "/Sales Data/A6" --prop value=2025-02-18 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B6" --prop value="Alice Chen"
officecli set sales-tracker.xlsx "/Sales Data/C6" --prop value=North
officecli set sales-tracker.xlsx "/Sales Data/D6" --prop value="Widget Basic"
officecli set sales-tracker.xlsx "/Sales Data/E6" --prop value=6500 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F6" --prop value=Lost
officecli set sales-tracker.xlsx "/Sales Data/A7" --prop value=2025-03-01 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B7" --prop value="Bob Martinez"
officecli set sales-tracker.xlsx "/Sales Data/C7" --prop value=South
officecli set sales-tracker.xlsx "/Sales Data/D7" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E7" --prop value=18500 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F7" --prop value=Open

officecli set sales-tracker.xlsx "/Sales Data/A8" --prop value=2025-03-12 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B8" --prop value="Carol Wu"
officecli set sales-tracker.xlsx "/Sales Data/C8" --prop value=East
officecli set sales-tracker.xlsx "/Sales Data/D8" --prop value="Widget Enterprise"
officecli set sales-tracker.xlsx "/Sales Data/E8" --prop value=45000 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F8" --prop value=Won
officecli set sales-tracker.xlsx "/Sales Data/A9" --prop value=2025-03-20 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B9" --prop value="Dave Kim"
officecli set sales-tracker.xlsx "/Sales Data/C9" --prop value=West
officecli set sales-tracker.xlsx "/Sales Data/D9" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E9" --prop value=14200 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F9" --prop value=Pending

officecli set sales-tracker.xlsx "/Sales Data/A10" --prop value=2025-04-05 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B10" --prop value="Alice Chen"
officecli set sales-tracker.xlsx "/Sales Data/C10" --prop value=North
officecli set sales-tracker.xlsx "/Sales Data/D10" --prop value="Widget Enterprise"
officecli set sales-tracker.xlsx "/Sales Data/E10" --prop value=52000 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F10" --prop value=Won
officecli set sales-tracker.xlsx "/Sales Data/A11" --prop value=2025-04-15 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B11" --prop value="Bob Martinez"
officecli set sales-tracker.xlsx "/Sales Data/C11" --prop value=South
officecli set sales-tracker.xlsx "/Sales Data/D11" --prop value="Widget Basic"
officecli set sales-tracker.xlsx "/Sales Data/E11" --prop value=7800 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F11" --prop value=Won

# Data validation
officecli add sales-tracker.xlsx "/Sales Data" --type validation --prop sqref="C2:C100" --prop type=list --prop formula1="North,South,East,West" --prop showError=true --prop errorTitle="Invalid Region" --prop error="Select: North, South, East, West"
officecli add sales-tracker.xlsx "/Sales Data" --type validation --prop sqref="F2:F100" --prop type=list --prop formula1="Open,Won,Lost,Pending" --prop showError=true --prop errorTitle="Invalid Status" --prop error="Select: Open, Won, Lost, Pending"
officecli add sales-tracker.xlsx "/Sales Data" --type validation --prop sqref="E2:E100" --prop type=decimal --prop operator=greaterThanOrEqual --prop formula1=0 --prop showError=true --prop error="Amount must be >= 0"

# Table (ListObject)
officecli add sales-tracker.xlsx "/Sales Data" --type table --prop ref="A1:F11" --prop name="SalesData" --prop displayName="SalesData" --prop style=TableStyleMedium2 --prop headerRow=true

# AutoFilter
officecli add sales-tracker.xlsx "/Sales Data" --type autofilter --prop range="A1:F11"

# Column widths and freeze
officecli set sales-tracker.xlsx "/Sales Data/col[A]" --prop width=12
officecli set sales-tracker.xlsx "/Sales Data/col[B]" --prop width=16
officecli set sales-tracker.xlsx "/Sales Data/col[C]" --prop width=10
officecli set sales-tracker.xlsx "/Sales Data/col[D]" --prop width=18
officecli set sales-tracker.xlsx "/Sales Data/col[E]" --prop width=12
officecli set sales-tracker.xlsx "/Sales Data/col[F]" --prop width=10
officecli set sales-tracker.xlsx "/Sales Data" --prop freeze=A2

# Conditional formatting on Amount column
officecli add sales-tracker.xlsx "/Sales Data" --type colorscale --prop sqref="E2:E11" --prop mincolor=FFFFFF --prop maxcolor=4472C4

# Formula-based CF: highlight Won rows
officecli add sales-tracker.xlsx "/Sales Data" --type formulacf --prop sqref="A2:F11" --prop formula='$F2="Won"' --prop fill=D9E2F3

# ── Summary Sheet ──
officecli set sales-tracker.xlsx /Summary/A1 --prop value="Sales Summary" --prop bold=true --prop font.size=16 --prop font.color=1F4E79
officecli set sales-tracker.xlsx /Summary/A1:D1 --prop merge=true
officecli set sales-tracker.xlsx /Summary/A3 --prop value="By Region" --prop bold=true --prop font.size=13
officecli set sales-tracker.xlsx /Summary/A4 --prop value=North
officecli set sales-tracker.xlsx /Summary/A5 --prop value=South
officecli set sales-tracker.xlsx /Summary/A6 --prop value=East
officecli set sales-tracker.xlsx /Summary/A7 --prop value=West

officecli set sales-tracker.xlsx /Summary/B3 --prop value=Total --prop bold=true
officecli set sales-tracker.xlsx /Summary/C3 --prop value=Count --prop bold=true
officecli set sales-tracker.xlsx /Summary/D3 --prop value=Trend --prop bold=true
officecli set sales-tracker.xlsx /Summary/B4 --prop "formula==SUMIF('Sales Data'!C2:C11,\"North\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/B5 --prop "formula==SUMIF('Sales Data'!C2:C11,\"South\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/B6 --prop "formula==SUMIF('Sales Data'!C2:C11,\"East\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/B7 --prop "formula==SUMIF('Sales Data'!C2:C11,\"West\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/C4 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"North\")"
officecli set sales-tracker.xlsx /Summary/C5 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"South\")"
officecli set sales-tracker.xlsx /Summary/C6 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"East\")"
officecli set sales-tracker.xlsx /Summary/C7 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"West\")"

# Status summary
# NOTE: Cross-sheet formulas MUST use batch/heredoc to avoid shell escaping issues with !
officecli set sales-tracker.xlsx /Summary/A9 --prop value="By Status" --prop bold=true --prop font.size=13
officecli set sales-tracker.xlsx /Summary/A10 --prop value=Open
officecli set sales-tracker.xlsx /Summary/A11 --prop value=Won
officecli set sales-tracker.xlsx /Summary/A12 --prop value=Lost
officecli set sales-tracker.xlsx /Summary/A13 --prop value=Pending
officecli set sales-tracker.xlsx /Summary/B9 --prop value=Count --prop bold=true
officecli set sales-tracker.xlsx /Summary/B10 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Open\")"
officecli set sales-tracker.xlsx /Summary/B11 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Won\")"
officecli set sales-tracker.xlsx /Summary/B12 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Lost\")"
officecli set sales-tracker.xlsx /Summary/B13 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Pending\")"

# Sparklines for each region (trend from Amount data)
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D4 --prop range="'Sales Data'!E2:E4" --prop type=line --prop color=4472C4
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D5 --prop range="'Sales Data'!E5:E7" --prop type=line --prop color=FF6600
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D6 --prop range="'Sales Data'!E8:E9" --prop type=line --prop color=70AD47
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D7 --prop range="'Sales Data'!E10:E11" --prop type=line --prop color=FFC000

# Summary column widths
officecli set sales-tracker.xlsx "/Summary/col[A]" --prop width=14
officecli set sales-tracker.xlsx "/Summary/col[B]" --prop width=14
officecli set sales-tracker.xlsx "/Summary/col[C]" --prop width=10
officecli set sales-tracker.xlsx "/Summary/col[D]" --prop width=12

# QA
officecli view sales-tracker.xlsx issues
officecli validate sales-tracker.xlsx
officecli close sales-tracker.xlsx
```

---

## Recipe: Data Analysis Workbook

Complete, copy-pasteable sequence. Tests: pivot tables, multiple chart types, statistical formulas, multi-sheet, CSV import.

```bash
officecli create data-analysis.xlsx
officecli open data-analysis.xlsx

# Metadata
officecli set data-analysis.xlsx / --prop title="Regional Sales Analysis" --prop author="Analytics Team"

# Sheets
officecli add data-analysis.xlsx / --type sheet --prop name="Raw Data"
officecli add data-analysis.xlsx / --type sheet --prop name="Pivot"
officecli add data-analysis.xlsx / --type sheet --prop name="Charts"
officecli add data-analysis.xlsx / --type sheet --prop name="Summary"
officecli remove data-analysis.xlsx "/Sheet1"

# ── Raw Data Sheet ──
# Headers
officecli set data-analysis.xlsx "/Raw Data/A1" --prop value=Date --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/B1" --prop value=Region --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/C1" --prop value=Category --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/D1" --prop value=Amount --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/E1" --prop value=Quantity --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF

# 50 rows of sample data (split into chunks of ~12 for batch reliability)
officecli set data-analysis.xlsx "/Raw Data/A2" --prop value=2025-01-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B2" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C2" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D2" --prop value=4500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E2" --prop value=12
officecli set data-analysis.xlsx "/Raw Data/A3" --prop value=2025-01-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B3" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C3" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D3" --prop value=2800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E3" --prop value=45
officecli set data-analysis.xlsx "/Raw Data/A4" --prop value=2025-01-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B4" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C4" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D4" --prop value=6200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E4" --prop value=18
officecli set data-analysis.xlsx "/Raw Data/A5" --prop value=2025-01-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B5" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C5" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D5" --prop value=1500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E5" --prop value=80
officecli set data-analysis.xlsx "/Raw Data/A6" --prop value=2025-02-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B6" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C6" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D6" --prop value=3200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E6" --prop value=50
officecli set data-analysis.xlsx "/Raw Data/A7" --prop value=2025-02-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B7" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C7" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D7" --prop value=5800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E7" --prop value=15
officecli set data-analysis.xlsx "/Raw Data/A8" --prop value=2025-02-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B8" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C8" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D8" --prop value=1800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E8" --prop value=90
officecli set data-analysis.xlsx "/Raw Data/A9" --prop value=2025-02-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B9" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C9" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D9" --prop value=2100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E9" --prop value=35
officecli set data-analysis.xlsx "/Raw Data/A10" --prop value=2025-02-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B10" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C10" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D10" --prop value=1200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E10" --prop value=60
officecli set data-analysis.xlsx "/Raw Data/A11" --prop value=2025-03-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B11" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C11" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D11" --prop value=1600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E11" --prop value=70

officecli set data-analysis.xlsx "/Raw Data/A12" --prop value=2025-03-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B12" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C12" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D12" --prop value=3800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E12" --prop value=55
officecli set data-analysis.xlsx "/Raw Data/A13" --prop value=2025-03-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B13" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C13" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D13" --prop value=7200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E13" --prop value=22
officecli set data-analysis.xlsx "/Raw Data/A14" --prop value=2025-03-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B14" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C14" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D14" --prop value=5100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E14" --prop value=14
officecli set data-analysis.xlsx "/Raw Data/A15" --prop value=2025-03-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B15" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C15" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D15" --prop value=2500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E15" --prop value=40
officecli set data-analysis.xlsx "/Raw Data/A16" --prop value=2025-04-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B16" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C16" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D16" --prop value=6800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E16" --prop value=20
officecli set data-analysis.xlsx "/Raw Data/A17" --prop value=2025-04-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B17" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C17" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D17" --prop value=1400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E17" --prop value=75
officecli set data-analysis.xlsx "/Raw Data/A18" --prop value=2025-04-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B18" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C18" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D18" --prop value=2900 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E18" --prop value=42
officecli set data-analysis.xlsx "/Raw Data/A19" --prop value=2025-04-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B19" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C19" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D19" --prop value=5500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E19" --prop value=16
officecli set data-analysis.xlsx "/Raw Data/A20" --prop value=2025-04-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B20" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C20" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D20" --prop value=1700 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E20" --prop value=85
officecli set data-analysis.xlsx "/Raw Data/A21" --prop value=2025-05-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B21" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C21" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D21" --prop value=2600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E21" --prop value=38

officecli set data-analysis.xlsx "/Raw Data/A22" --prop value=2025-05-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B22" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C22" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D22" --prop value=1300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E22" --prop value=65
officecli set data-analysis.xlsx "/Raw Data/A23" --prop value=2025-05-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B23" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C23" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D23" --prop value=3100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E23" --prop value=48
officecli set data-analysis.xlsx "/Raw Data/A24" --prop value=2025-05-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B24" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C24" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D24" --prop value=7500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E24" --prop value=25
officecli set data-analysis.xlsx "/Raw Data/A25" --prop value=2025-05-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B25" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C25" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D25" --prop value=6400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E25" --prop value=19
officecli set data-analysis.xlsx "/Raw Data/A26" --prop value=2025-06-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B26" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C26" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D26" --prop value=5600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E26" --prop value=17
officecli set data-analysis.xlsx "/Raw Data/A27" --prop value=2025-06-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B27" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C27" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D27" --prop value=1900 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E27" --prop value=72
officecli set data-analysis.xlsx "/Raw Data/A28" --prop value=2025-06-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B28" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C28" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D28" --prop value=3500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E28" --prop value=52
officecli set data-analysis.xlsx "/Raw Data/A29" --prop value=2025-06-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B29" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C29" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D29" --prop value=1100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E29" --prop value=58
officecli set data-analysis.xlsx "/Raw Data/A30" --prop value=2025-06-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B30" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C30" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D30" --prop value=2700 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E30" --prop value=44
officecli set data-analysis.xlsx "/Raw Data/A31" --prop value=2025-07-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B31" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C31" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D31" --prop value=6100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E31" --prop value=21

officecli set data-analysis.xlsx "/Raw Data/A32" --prop value=2025-07-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B32" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C32" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D32" --prop value=1500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E32" --prop value=82
officecli set data-analysis.xlsx "/Raw Data/A33" --prop value=2025-07-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B33" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C33" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D33" --prop value=2400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E33" --prop value=36
officecli set data-analysis.xlsx "/Raw Data/A34" --prop value=2025-07-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B34" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C34" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D34" --prop value=4800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E34" --prop value=13
officecli set data-analysis.xlsx "/Raw Data/A35" --prop value=2025-07-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B35" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C35" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D35" --prop value=3300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E35" --prop value=47
officecli set data-analysis.xlsx "/Raw Data/A36" --prop value=2025-08-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B36" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C36" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D36" --prop value=7100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E36" --prop value=23
officecli set data-analysis.xlsx "/Raw Data/A37" --prop value=2025-08-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B37" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C37" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D37" --prop value=1600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E37" --prop value=68
officecli set data-analysis.xlsx "/Raw Data/A38" --prop value=2025-08-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B38" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C38" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D38" --prop value=1400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E38" --prop value=62
officecli set data-analysis.xlsx "/Raw Data/A39" --prop value=2025-08-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B39" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C39" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D39" --prop value=5900 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E39" --prop value=18
officecli set data-analysis.xlsx "/Raw Data/A40" --prop value=2025-08-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B40" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C40" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D40" --prop value=4100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E40" --prop value=56
officecli set data-analysis.xlsx "/Raw Data/A41" --prop value=2025-09-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B41" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C41" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D41" --prop value=6600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E41" --prop value=20

officecli set data-analysis.xlsx "/Raw Data/A42" --prop value=2025-09-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B42" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C42" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D42" --prop value=3400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E42" --prop value=46
officecli set data-analysis.xlsx "/Raw Data/A43" --prop value=2025-09-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B43" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C43" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D43" --prop value=2000 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E43" --prop value=76
officecli set data-analysis.xlsx "/Raw Data/A44" --prop value=2025-09-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B44" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C44" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D44" --prop value=7800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E44" --prop value=26
officecli set data-analysis.xlsx "/Raw Data/A45" --prop value=2025-09-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B45" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C45" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D45" --prop value=2300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E45" --prop value=33
officecli set data-analysis.xlsx "/Raw Data/A46" --prop value=2025-10-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B46" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C46" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D46" --prop value=5300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E46" --prop value=15
officecli set data-analysis.xlsx "/Raw Data/A47" --prop value=2025-10-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B47" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C47" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D47" --prop value=4700 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E47" --prop value=14
officecli set data-analysis.xlsx "/Raw Data/A48" --prop value=2025-10-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B48" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C48" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D48" --prop value=1800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E48" --prop value=88
officecli set data-analysis.xlsx "/Raw Data/A49" --prop value=2025-10-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B49" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C49" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D49" --prop value=1200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E49" --prop value=55
officecli set data-analysis.xlsx "/Raw Data/A50" --prop value=2025-10-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B50" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C50" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D50" --prop value=1500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E50" --prop value=70
officecli set data-analysis.xlsx "/Raw Data/A51" --prop value=2025-10-25 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B51" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C51" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D51" --prop value=2800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E51" --prop value=41

# Raw Data column widths and freeze
officecli set data-analysis.xlsx "/Raw Data/col[A]" --prop width=12
officecli set data-analysis.xlsx "/Raw Data/col[B]" --prop width=10
officecli set data-analysis.xlsx "/Raw Data/col[C]" --prop width=14
officecli set data-analysis.xlsx "/Raw Data/col[D]" --prop width=12
officecli set data-analysis.xlsx "/Raw Data/col[E]" --prop width=10
officecli set data-analysis.xlsx "/Raw Data" --prop freeze=A2

# Named ranges for data extent
officecli add data-analysis.xlsx / --type namedrange --prop name="DataRange" --prop ref="'Raw Data'!A1:E51"
officecli add data-analysis.xlsx / --type namedrange --prop name="AmountColumn" --prop ref="'Raw Data'!D2:D51"
officecli add data-analysis.xlsx / --type namedrange --prop name="QuantityColumn" --prop ref="'Raw Data'!E2:E51"

# ── Pivot Sheet ──
officecli add data-analysis.xlsx /Pivot --type pivottable --prop source="'Raw Data'!A1:E51" --prop position="A1" --prop rows="Region,Category" --prop values="Amount:sum,Quantity:avg" --prop name="SalesAnalysis" --prop style=PivotStyleMedium2

# ── Charts Sheet ──
# Bar chart: total by region
officecli add data-analysis.xlsx /Charts --type chart --prop chartType=bar --prop title="Total Sales by Region" --prop categories="North,South,East,West" --prop data="Sales:26900,25400,33800,22200" --prop colors=1F4E79 --prop x=0 --prop y=0 --prop width=12 --prop height=12 --prop dataLabels=true

# Line chart: monthly trend
officecli add data-analysis.xlsx /Charts --type chart --prop chartType=line --prop title="Monthly Sales Trend" --prop categories="Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct" --prop data="Amount:14500,10100,15600,15500,16400,9900,17600,19800,13500,12000" --prop colors=4472C4 --prop x=0 --prop y=14 --prop width=12 --prop height=12 --prop legend=none

# Scatter chart: amount vs quantity
officecli add data-analysis.xlsx /Charts --type chart --prop chartType=scatter --prop title="Amount vs Quantity" --prop categories="12,45,18,80,50,15,90,35,60,70,55,22,14,40,20,75,42,16,85,38,65,48,25,19,17,72,52,58,46,76,26,33,15,14,88,55,70,41" --prop data="Amount:4500,2800,6200,1500,3200,5800,1800,2100,1200,1600,3800,7200,5100,2500,6800,1400,2900,5500,1700,2600,1300,3100,7500,6400,5600,1900,3500,1100,2700,6100,1500,2400,4800,3300,7100,1600,1400,5900" --prop colors=FF6600 --prop x=14 --prop y=0 --prop width=12 --prop height=12

# ── Summary Sheet ──
officecli set data-analysis.xlsx /Summary/A1 --prop value="Data Analysis Summary" --prop bold=true --prop font.size=16 --prop font.color=1F4E79
officecli set data-analysis.xlsx /Summary/A1:D1 --prop merge=true
officecli set data-analysis.xlsx /Summary/A3 --prop value="Overall Statistics" --prop bold=true --prop font.size=13
officecli set data-analysis.xlsx /Summary/A4 --prop value="Total Amount"
officecli set data-analysis.xlsx /Summary/B4 --prop "formula==SUM('Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A5 --prop value="Average Amount"
officecli set data-analysis.xlsx /Summary/B5 --prop "formula==AVERAGE('Raw Data'!D2:D51)" --prop numFmt='$#,##0.00'
officecli set data-analysis.xlsx /Summary/A6 --prop value="Min Amount"
officecli set data-analysis.xlsx /Summary/B6 --prop "formula==MIN('Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A7 --prop value="Max Amount"
officecli set data-analysis.xlsx /Summary/B7 --prop "formula==MAX('Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A8 --prop value="Record Count"
officecli set data-analysis.xlsx /Summary/B8 --prop "formula==COUNTA('Raw Data'!A2:A51)"

officecli set data-analysis.xlsx /Summary/A10 --prop value="By Region" --prop bold=true --prop font.size=13
officecli set data-analysis.xlsx /Summary/A11 --prop value=North
officecli set data-analysis.xlsx /Summary/B11 --prop "formula==SUMIF('Raw Data'!B2:B51,\"North\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A12 --prop value=South
officecli set data-analysis.xlsx /Summary/B12 --prop "formula==SUMIF('Raw Data'!B2:B51,\"South\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A13 --prop value=East
officecli set data-analysis.xlsx /Summary/B13 --prop "formula==SUMIF('Raw Data'!B2:B51,\"East\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A14 --prop value=West
officecli set data-analysis.xlsx /Summary/B14 --prop "formula==SUMIF('Raw Data'!B2:B51,\"West\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'

# Summary column widths
officecli set data-analysis.xlsx "/Summary/col[A]" --prop width=20
officecli set data-analysis.xlsx "/Summary/col[B]" --prop width=15

# QA
officecli view data-analysis.xlsx issues
officecli validate data-analysis.xlsx
officecli close data-analysis.xlsx
```

**CSV import alternative:** If data exists as a CSV file, replace the Raw Data batch commands with:

```bash
officecli import data-analysis.xlsx "/Raw Data" --file data.csv --header
```

The `--header` flag auto-sets AutoFilter and freeze panes on the header row.

---

## Building Blocks

### Cells and Values

```bash
# String value
officecli set data.xlsx "/Sheet1/A1" --prop value="Revenue" --prop type=string

# Number value
officecli set data.xlsx "/Sheet1/B2" --prop value=1234.56

# Formula
officecli set data.xlsx "/Sheet1/B10" --prop formula="SUM(B2:B9)"

# Boolean
officecli set data.xlsx "/Sheet1/C1" --prop value=true --prop type=boolean

# Clear cell
officecli set data.xlsx "/Sheet1/A5" --prop clear=true

# Hyperlink
officecli set data.xlsx "/Sheet1/A1" --prop link="https://example.com"
```

### Cell Formatting

```bash
# Font
officecli set data.xlsx "/Sheet1/A1" --prop font.name=Arial --prop font.size=12 --prop bold=true --prop font.color=1F4E79

# Fill (solid)
officecli set data.xlsx "/Sheet1/A1" --prop fill=D9E2F3

# Fill (gradient)
officecli set data.xlsx "/Sheet1/A1" --prop fill=D9E2F3-1F4E79

# Number format (single-quote $ to prevent shell expansion)
officecli set data.xlsx "/Sheet1/B2" --prop numFmt='$#,##0.00'

# Alignment
officecli set data.xlsx "/Sheet1/A1" --prop halign=center --prop valign=center --prop wrap=true

# Rotation
officecli set data.xlsx "/Sheet1/A1" --prop rotation=45

# Borders
officecli set data.xlsx "/Sheet1/A1:D10" --prop border.all=thin --prop border.color=CCCCCC
officecli set data.xlsx "/Sheet1/A1:D1" --prop border.bottom=medium --prop border.bottom.color=000000

# Merge
officecli set data.xlsx "/Sheet1/A1:D1" --prop merge=true

# Indent
officecli set data.xlsx "/Sheet1/A2" --prop indent=2
```

### Rich Text Runs

Rich text allows mixed formatting within a single cell. Use `add --type run` to create the initial rich text cell, then `set` on existing runs.

```bash
# Create rich text cell with first run
officecli add data.xlsx "/Sheet1/A1" --type run --prop text="Bold part " --prop bold=true --prop color=0000FF

# Add second run with different formatting
officecli add data.xlsx "/Sheet1/A1" --type run --prop text="normal part" --prop bold=false
```

### Formulas (Common Patterns)

```bash
# SUM, AVERAGE, COUNT
officecli set data.xlsx "/Sheet1/B14" --prop formula="SUM(B2:B13)"
officecli set data.xlsx "/Sheet1/C14" --prop formula="AVERAGE(C2:C13)"
officecli set data.xlsx "/Sheet1/D14" --prop formula="COUNT(D2:D13)"

# Cross-sheet reference (use double quotes -- NOT single quotes)
officecli set data.xlsx "/Summary/B2" --prop "formula==Revenue!B14"

# Cross-sheet reference in batch mode (RECOMMENDED -- no quoting issues)
officecli set data.xlsx /Summary/B2 --prop "formula==Revenue!B14"

# VERIFY cross-sheet formulas after setting:
officecli get data.xlsx "/Summary/B2"
# Must show: formula: Revenue!B14 (no backslash before !)

# SUMIF
officecli set data.xlsx "/Summary/B5" --prop formula='SUMIF(Data!C2:C100,"North",Data!E2:E100)'

# VLOOKUP
officecli set data.xlsx "/Summary/C2" --prop formula='VLOOKUP(A2,Data!A:E,5,FALSE)'

# IFERROR (wrapping for safety)
officecli set data.xlsx "/Summary/D2" --prop formula='IFERROR(B2/C2,0)'

# Percentage formula
officecli set data.xlsx "/PL/D2" --prop formula="C2/B2"

# Array formula (multi-cell calculation)
officecli set data.xlsx "/Sheet1/F2" --prop formula="{SUM(A2:A10*B2:B10)}"
```

### Charts

> **WARNING: Chart data accuracy** -- When charting data that comes from formulas (SUMIF, SUM, COUNTIF, etc.), always use cell range references (e.g., `series1.values="Sheet1!B2:B6"`) rather than hardcoding values. Hardcoded chart data will NOT update when formulas change, and manually transcribing values is error-prone -- R2 testing found a 30K discrepancy per rep when chart values were hardcoded instead of referencing SUMIF results. If you must use inline data (e.g., `data="Series:val1,val2"`), you MUST cross-verify every value against the source cell's formula result before delivery.

```bash
# PREFERRED: Column chart with cell-range references (data stays in sync with formulas)
officecli add data.xlsx /Sheet1 --type chart --prop chartType=column --prop title="Monthly Revenue" --prop series1.values="Sheet1!B2:B13" --prop series1.categories="Sheet1!A2:A13" --prop series1.name="Revenue" --prop x=5 --prop y=1 --prop width=15 --prop height=10

# CAUTION: Column chart with inline data (values are hardcoded -- will NOT track formula changes)
officecli add data.xlsx /Sheet1 --type chart --prop chartType=column --prop title="Revenue by Quarter" --prop categories="Q1,Q2,Q3,Q4" --prop series1="2025:42,58,65,78" --prop series2="2026:51,67,74,92" --prop x=5 --prop y=1 --prop width=15 --prop height=10 --prop colors=1F4E79,4472C4

# Pie chart
officecli add data.xlsx /Sheet1 --type chart --prop chartType=pie --prop title="Expense Breakdown" --prop categories="Rent,Salaries,Marketing,Operations" --prop data="Amount:5000,15000,3000,2000" --prop colors=1F4E79,4472C4,70AD47,FFC000 --prop dataLabels=percent

# Line chart
officecli add data.xlsx /Sheet1 --type chart --prop chartType=line --prop title="Trend" --prop categories="Jan,Feb,Mar,Apr,May,Jun" --prop series1="Revenue:10,15,13,20,22,28" --prop legend=bottom

# Combo chart (bar + line on dual axes)
officecli add data.xlsx /Sheet1 --type chart --prop chartType=combo --prop categories="Q1,Q2,Q3,Q4" --prop series1="Revenue:100,200,150,300" --prop series2="Margin:10,15,12,25" --prop comboSplit=1 --prop secondary=2 --prop colors=1F4E79,FF6600

# Scatter chart
officecli add data.xlsx /Sheet1 --type chart --prop chartType=scatter --prop title="Correlation" --prop categories="1,2,3,4,5" --prop data="Values:10,25,18,30,22"
```

**Post-chart QA (MANDATORY after every `add chart`):**

```bash
# Verify chart has data -- an empty chart is a BLOCKER
officecli get data.xlsx '/Sheet1/chart[1]' --json
# Check: each series MUST have non-empty "values" (inline) OR "valuesRef" (cell range).
# NOTE: When using cell range references (series1.values="Sheet1!B2:B13"), the "values" field
# will always be empty -- this is NORMAL. Only "valuesRef" will be populated.
# BLOCKER: If BOTH "values" AND "valuesRef" are empty → chart has no data. Remove and re-add.
```

Chart types: column, columnStacked, columnPercentStacked, column3d, bar, barStacked, barPercentStacked, bar3d, line, lineStacked, linePercentStacked, line3d, pie, pie3d, doughnut, area, areaStacked, areaPercentStacked, area3d, scatter, bubble, radar, stock, combo

Chart styling properties: `plotFill`, `chartFill`, `gridlines`, `dataLabels`, `labelPos`, `labelFont`, `axisFont`, `legendFont`, `title.font`, `title.size`, `title.color`, `series.outline`, `gapwidth`, `overlap`, `lineWidth`, `lineDash`, `marker`, `axisMin`, `axisMax`, `majorUnit`, `minorUnit`

**Important:** Chart series count is fixed at creation. Cannot add new series via `set`. Delete and recreate to change series count.

### Tables (ListObjects)

```bash
officecli add data.xlsx /Sheet1 --type table --prop ref="A1:E20" --prop name="SalesData" --prop displayName="SalesData" --prop style=TableStyleMedium2 --prop headerRow=true
```

Default style is `TableStyleMedium2`. Other options: `TableStyleLight1`..`TableStyleLight21`, `TableStyleMedium1`..`TableStyleMedium28`, `TableStyleDark1`..`TableStyleDark11`.

### Data Validation

```bash
# Dropdown list
officecli add data.xlsx /Sheet1 --type validation --prop sqref="C2:C100" --prop type=list --prop formula1="North,South,East,West"

# Whole number range
officecli add data.xlsx /Sheet1 --type validation --prop sqref="D2:D100" --prop type=whole --prop operator=between --prop formula1=1 --prop formula2=1000

# Date validation
officecli add data.xlsx /Sheet1 --type validation --prop sqref="A2:A100" --prop type=date --prop operator=greaterThan --prop formula1="2025-01-01"

# Custom formula validation
officecli add data.xlsx /Sheet1 --type validation --prop sqref="E2:E100" --prop type=custom --prop formula1="E2>D2"

# With error and input messages
officecli add data.xlsx /Sheet1 --type validation --prop sqref="F2:F100" --prop type=decimal --prop operator=between --prop formula1=0 --prop formula2=100 --prop showError=true --prop errorTitle="Invalid Entry" --prop error="Enter a value between 0 and 100" --prop showInput=true --prop promptTitle="Percentage" --prop prompt="Enter a percentage (0-100)"
```

Validation types: list, whole, decimal, date, time, textLength, custom

Operators: between, notBetween, equal, notEqual, greaterThan, lessThan, greaterThanOrEqual, lessThanOrEqual

### Conditional Formatting

```bash
# Data bars (always specify min and max to avoid invalid XML)
officecli add data.xlsx /Sheet1 --type databar --prop sqref="B2:B20" --prop color=4472C4 --prop min=0 --prop max=100000

# Color scale (2-color)
officecli add data.xlsx /Sheet1 --type colorscale --prop sqref="C2:C20" --prop mincolor=FFFFFF --prop maxcolor=4472C4

# Color scale (3-color)
officecli add data.xlsx /Sheet1 --type colorscale --prop sqref="C2:C20" --prop mincolor=FF0000 --prop midcolor=FFFF00 --prop maxcolor=00FF00

# Icon sets
officecli add data.xlsx /Sheet1 --type iconset --prop sqref="D2:D20" --prop iconset=3TrafficLights1

# Formula-based CF
officecli add data.xlsx /Sheet1 --type formulacf --prop sqref="A2:E20" --prop formula='$E2>10000' --prop fill=D9E2F3 --prop font.bold=true
```

Icon set types (17): 3Arrows, 3ArrowsGray, 3Flags, 3TrafficLights1, 3TrafficLights2, 3Signs, 3Symbols, 3Symbols2, 4Arrows, 4ArrowsGray, 4RedToBlack, 4Rating, 4TrafficLights, 5Arrows, 5ArrowsGray, 5Rating, 5Quarters

### Sparklines

```bash
# Line sparkline
officecli add data.xlsx /Sheet1 --type sparkline --prop cell=G2 --prop range="B2:F2" --prop type=line --prop color=4472C4

# Column sparkline
officecli add data.xlsx /Sheet1 --type sparkline --prop cell=G3 --prop range="B3:F3" --prop type=column --prop color=1F4E79

# With markers
officecli add data.xlsx /Sheet1 --type sparkline --prop cell=G4 --prop range="B4:F4" --prop type=line --prop color=4472C4 --prop markers=true --prop highpoint=FF0000 --prop lowpoint=0000FF
```

### Pivot Tables

```bash
officecli add data.xlsx /Sheet1 --type pivottable --prop source="Data!A1:E200" --prop position="H1" --prop rows="Region,Category" --prop values="Amount:sum,Quantity:avg" --prop name="SalesPivot" --prop style=PivotStyleMedium2
```

Default style is `PivotStyleLight16`. Value aggregation functions: sum, count, average, max, min, product, stddev, var.

### Named Ranges

```bash
officecli add data.xlsx / --type namedrange --prop name="GrowthRate" --prop ref="Assumptions!B2" --prop comment="Annual growth rate assumption"
officecli add data.xlsx / --type namedrange --prop name="DataRange" --prop ref="Data!A1:E200"
```

### Pictures

```bash
officecli add data.xlsx /Sheet1 --type picture --prop path=logo.png --prop x=1 --prop y=1 --prop width=3 --prop height=2 --prop alt="Company logo"
```

### Comments

```bash
officecli add data.xlsx /Sheet1 --type comment --prop ref=B2 --prop text="Source: Annual Report 2025, p.45" --prop author="Analyst"
```

### AutoFilter

```bash
officecli add data.xlsx /Sheet1 --type autofilter --prop range="A1:F100"
```

### Shapes and Textboxes

```bash
# Shape with fill
officecli add data.xlsx /Sheet1 --type shape --prop text="KPI: Revenue" --prop fill=4472C4 --prop color=FFFFFF --prop bold=true --prop x=1 --prop y=1 --prop width=5 --prop height=3

# Transparent textbox (annotation)
officecli add data.xlsx /Sheet1 --type textbox --prop text="Data source: Q4 report" --prop fill=none --prop size=9 --prop color=888888
```

### Row/Column Grouping (Outline)

```bash
# Group rows for expandable detail sections
officecli set data.xlsx "/Sheet1/row[3]" --prop outline=1
officecli set data.xlsx "/Sheet1/row[4]" --prop outline=1
officecli set data.xlsx "/Sheet1/row[5]" --prop outline=1

# Collapse the group
officecli set data.xlsx "/Sheet1/row[3]" --prop collapsed=true
```

Outline levels range from 0 (no grouping) to 7. Also works on columns.

### CSV Import

```bash
# Import CSV into a sheet
officecli import data.xlsx /Sheet1 --file data.csv

# Import with header detection (auto-sets AutoFilter and freeze panes)
officecli import data.xlsx /Sheet1 --file data.csv --header

# Import TSV
officecli import data.xlsx /Sheet1 --file data.tsv --format tsv

# Import from stdin
cat data.csv | officecli import data.xlsx /Sheet1 --stdin

# Import starting at specific cell
officecli import data.xlsx /Sheet1 --file data.csv --start-cell B5
```

---

## More Recipes

### Financial Model Header + Data

```bash
officecli set data.xlsx /Sheet1/A1 --prop value=Month --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data.xlsx /Sheet1/B1 --prop value=Revenue --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data.xlsx /Sheet1/C1 --prop value=Expenses --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data.xlsx /Sheet1/D1 --prop value=Net --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data.xlsx /Sheet1/A2 --prop value=Jan
officecli set data.xlsx /Sheet1/B2 --prop value=42000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/C2 --prop value=28000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/D2 --prop formula="B2-C2" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/A3 --prop value=Feb
officecli set data.xlsx /Sheet1/B3 --prop value=45000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/C3 --prop value=30000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/D3 --prop formula="B3-C3" --prop font.color=000000 --prop numFmt='$#,##0'

officecli set data.xlsx /Sheet1/A4 --prop value=Mar
officecli set data.xlsx /Sheet1/B4 --prop value=48000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/C4 --prop value=31000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/D4 --prop formula="B4-C4" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/A14 --prop value=Total --prop bold=true
officecli set data.xlsx /Sheet1/B14 --prop formula="SUM(B2:B13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/C14 --prop formula="SUM(C2:C13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/D14 --prop formula="SUM(D2:D13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
```

### Dashboard KPIs

```bash
officecli set data.xlsx /Dashboard/A1:C1 --prop merge=true
officecli set data.xlsx /Dashboard/A1 --prop value="Key Performance Indicators" --prop bold=true --prop font.size=18 --prop font.color=1F4E79
officecli set data.xlsx /Dashboard/A3 --prop value="Total Revenue" --prop bold=true --prop font.size=11
officecli set data.xlsx /Dashboard/A4 --prop "formula==Revenue!D14" --prop font.color=008000 --prop font.size=24 --prop numFmt='$#,##0'
officecli set data.xlsx /Dashboard/B3 --prop value="Net Income" --prop bold=true --prop font.size=11
officecli set data.xlsx /Dashboard/B4 --prop "formula==PL!B4" --prop font.color=008000 --prop font.size=24 --prop numFmt='$#,##0'
officecli set data.xlsx /Dashboard/C3 --prop value=Margin --prop bold=true --prop font.size=11
officecli set data.xlsx /Dashboard/C4 --prop "formula==PL!C4" --prop font.color=008000 --prop font.size=24 --prop numFmt=0.0%
```

---

## Advanced: Raw XML for Charts

For advanced chart customization not available through high-level commands (trendlines, custom 3D perspectives, gradient fills on individual series):

```bash
# Create a chart part (--type flag required)
officecli add-part data.xlsx /Sheet1 --type chart

# Inject custom chart XML
officecli raw-set data.xlsx "/Sheet1/chart[1]" --xpath "//c:plotArea" --action append --xml '<c:trendline><c:trendlineType val="linear"/></c:trendline>'
```

Use high-level `add --type chart` first. Fall back to raw XML only for features not exposed by high-level commands.

XPath prefixes: `x` (SpreadsheetML), `r` (Relationships), `a` (DrawingML), `c` (Charts), `xdr` (Spreadsheet Drawing)

raw-set actions: append, prepend, insertbefore, insertafter, replace, remove, setattr
