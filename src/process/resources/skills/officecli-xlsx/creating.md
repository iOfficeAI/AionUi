<!-- officecli: v1.0.23 -->

# Creating Workbooks from Scratch

Use this guide when creating a new workbook with no template.

## Workflow Overview

1. **Create** blank workbook
2. **Plan** sheet structure (sheets, data layout, formulas, charts)
3. **Build** each sheet (data -> formulas -> formatting -> charts/tables)
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
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Revenue/A1","props":{"value":"Month","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Revenue/B1","props":{"value":"Product A","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Revenue/C1","props":{"value":"Product B","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Revenue/D1","props":{"value":"Total","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}}
]
EOF

# Monthly data -- blue text for hardcoded inputs
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Revenue/A2","props":{"value":"Jan"}},
  {"command":"set","path":"/Revenue/A3","props":{"value":"Feb"}},
  {"command":"set","path":"/Revenue/A4","props":{"value":"Mar"}},
  {"command":"set","path":"/Revenue/A5","props":{"value":"Apr"}},
  {"command":"set","path":"/Revenue/A6","props":{"value":"May"}},
  {"command":"set","path":"/Revenue/A7","props":{"value":"Jun"}},
  {"command":"set","path":"/Revenue/A8","props":{"value":"Jul"}},
  {"command":"set","path":"/Revenue/A9","props":{"value":"Aug"}},
  {"command":"set","path":"/Revenue/A10","props":{"value":"Sep"}},
  {"command":"set","path":"/Revenue/A11","props":{"value":"Oct"}},
  {"command":"set","path":"/Revenue/A12","props":{"value":"Nov"}},
  {"command":"set","path":"/Revenue/A13","props":{"value":"Dec"}}
]
EOF

cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Revenue/B2","props":{"value":"42000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B3","props":{"value":"45000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B4","props":{"value":"48000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B5","props":{"value":"51000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B6","props":{"value":"53000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B7","props":{"value":"56000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B8","props":{"value":"58000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B9","props":{"value":"55000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B10","props":{"value":"60000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B11","props":{"value":"62000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B12","props":{"value":"65000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/B13","props":{"value":"70000","font.color":"0000FF","numFmt":"$#,##0"}}
]
EOF

cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Revenue/C2","props":{"value":"28000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C3","props":{"value":"30000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C4","props":{"value":"32000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C5","props":{"value":"35000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C6","props":{"value":"36000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C7","props":{"value":"38000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C8","props":{"value":"40000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C9","props":{"value":"37000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C10","props":{"value":"42000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C11","props":{"value":"44000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C12","props":{"value":"46000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C13","props":{"value":"48000","font.color":"0000FF","numFmt":"$#,##0"}}
]
EOF

# Total column -- SUM formulas in black text
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Revenue/D2","props":{"formula":"SUM(B2:C2)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D3","props":{"formula":"SUM(B3:C3)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D4","props":{"formula":"SUM(B4:C4)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D5","props":{"formula":"SUM(B5:C5)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D6","props":{"formula":"SUM(B6:C6)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D7","props":{"formula":"SUM(B7:C7)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D8","props":{"formula":"SUM(B8:C8)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D9","props":{"formula":"SUM(B9:C9)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D10","props":{"formula":"SUM(B10:C10)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D11","props":{"formula":"SUM(B11:C11)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D12","props":{"formula":"SUM(B12:C12)","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D13","props":{"formula":"SUM(B13:C13)","font.color":"000000","numFmt":"$#,##0"}}
]
EOF

# SUM row at bottom
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Revenue/A14","props":{"value":"Total","bold":"true"}},
  {"command":"set","path":"/Revenue/B14","props":{"formula":"SUM(B2:B13)","font.color":"000000","bold":"true","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/C14","props":{"formula":"SUM(C2:C13)","font.color":"000000","bold":"true","numFmt":"$#,##0"}},
  {"command":"set","path":"/Revenue/D14","props":{"formula":"SUM(D2:D13)","font.color":"000000","bold":"true","numFmt":"$#,##0"}}
]
EOF

# Revenue column widths and freeze
officecli set financial-dashboard.xlsx "/Revenue/col[A]" --prop width=12
officecli set financial-dashboard.xlsx "/Revenue/col[B]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue/col[C]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue/col[D]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue" --prop freeze=A2

# Revenue column chart
officecli add financial-dashboard.xlsx /Revenue --type chart --prop chartType=column --prop title="Monthly Revenue by Product" --prop series1.values="Revenue!B2:B13" --prop series1.categories="Revenue!A2:A13" --prop series1.name="Product A" --prop series2.values="Revenue!C2:C13" --prop series2.categories="Revenue!A2:A13" --prop series2.name="Product B" --prop x=6 --prop y=1 --prop width=12 --prop height=15 --prop colors=1F4E79,4472C4 --prop legend=bottom

# ── Expenses Sheet ──
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Expenses/A1","props":{"value":"Category","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Expenses/B1","props":{"value":"Monthly","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Expenses/C1","props":{"value":"Annual","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Expenses/A2","props":{"value":"Rent"}},
  {"command":"set","path":"/Expenses/A3","props":{"value":"Salaries"}},
  {"command":"set","path":"/Expenses/A4","props":{"value":"Marketing"}},
  {"command":"set","path":"/Expenses/A5","props":{"value":"Operations"}},
  {"command":"set","path":"/Expenses/A6","props":{"value":"Technology"}},
  {"command":"set","path":"/Expenses/A7","props":{"value":"Total","bold":"true"}},
  {"command":"set","path":"/Expenses/B2","props":{"value":"5000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/B3","props":{"value":"45000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/B4","props":{"value":"8000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/B5","props":{"value":"6000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/B6","props":{"value":"4000","font.color":"0000FF","numFmt":"$#,##0"}}
]
EOF

cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Expenses/B7","props":{"formula":"SUM(B2:B6)","font.color":"000000","bold":"true","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/C2","props":{"formula":"B2*12","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/C3","props":{"formula":"B3*12","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/C4","props":{"formula":"B4*12","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/C5","props":{"formula":"B5*12","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/C6","props":{"formula":"B6*12","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Expenses/C7","props":{"formula":"SUM(C2:C6)","font.color":"000000","bold":"true","numFmt":"$#,##0"}}
]
EOF

# Expenses column widths and freeze
officecli set financial-dashboard.xlsx "/Expenses/col[A]" --prop width=15
officecli set financial-dashboard.xlsx "/Expenses/col[B]" --prop width=14
officecli set financial-dashboard.xlsx "/Expenses/col[C]" --prop width=14
officecli set financial-dashboard.xlsx "/Expenses" --prop freeze=A2

# Expense pie chart
officecli add financial-dashboard.xlsx /Expenses --type chart --prop chartType=pie --prop title="Expense Breakdown" --prop categories="Rent,Salaries,Marketing,Operations,Technology" --prop data="Monthly:5000,45000,8000,6000,4000" --prop colors=1F4E79,4472C4,70AD47,FFC000,FF6600 --prop dataLabels=percent --prop x=5 --prop y=1 --prop width=10 --prop height=12

# ── P&L Sheet ──
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/PL/A1","props":{"value":"Metric","bold":"true","fill":"2C5F2D","font.color":"FFFFFF"}},
  {"command":"set","path":"/PL/B1","props":{"value":"Annual","bold":"true","fill":"2C5F2D","font.color":"FFFFFF"}},
  {"command":"set","path":"/PL/C1","props":{"value":"Margin %","bold":"true","fill":"2C5F2D","font.color":"FFFFFF"}},
  {"command":"set","path":"/PL/A2","props":{"value":"Total Revenue"}},
  {"command":"set","path":"/PL/A3","props":{"value":"Total Expenses"}},
  {"command":"set","path":"/PL/A4","props":{"value":"Net Income","bold":"true"}},
  {"command":"set","path":"/PL/A5","props":{"value":"Gross Margin %"}}
]
EOF

# Cross-sheet formulas -- green text
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/PL/B2","props":{"formula":"Revenue!D14","font.color":"008000","numFmt":"$#,##0"}},
  {"command":"set","path":"/PL/B3","props":{"formula":"Expenses!C7","font.color":"008000","numFmt":"$#,##0"}},
  {"command":"set","path":"/PL/B4","props":{"formula":"B2-B3","font.color":"000000","bold":"true","numFmt":"$#,##0"}},
  {"command":"set","path":"/PL/C4","props":{"formula":"IFERROR(B4/B2,0)","font.color":"000000","numFmt":"0.0%"}}
]
EOF

# P&L column widths and freeze
officecli set financial-dashboard.xlsx "/PL/col[A]" --prop width=18
officecli set financial-dashboard.xlsx "/PL/col[B]" --prop width=15
officecli set financial-dashboard.xlsx "/PL/col[C]" --prop width=12
officecli set financial-dashboard.xlsx "/PL" --prop freeze=A2

# Combo chart (revenue bars + margin line)
officecli add financial-dashboard.xlsx /PL --type chart --prop chartType=combo --prop title="Revenue vs Margin" --prop categories="Revenue,Expenses,Net Income" --prop series1="Amount:665000,816000,-151000" --prop series2="Margin:100,0,0" --prop comboSplit=1 --prop secondary=2 --prop colors=2C5F2D,FF6600 --prop x=5 --prop y=1 --prop width=12 --prop height=12

# ── Dashboard Sheet ──
cat <<'EOF' | officecli batch financial-dashboard.xlsx
[
  {"command":"set","path":"/Dashboard/A1","props":{"value":"FY2025 Financial Dashboard","bold":"true","font.size":"18","font.color":"1F4E79"}},
  {"command":"set","path":"/Dashboard/A1:D1","props":{"merge":"true"}},
  {"command":"set","path":"/Dashboard/A3","props":{"value":"Total Revenue","bold":"true"}},
  {"command":"set","path":"/Dashboard/B3","props":{"formula":"PL!B2","font.color":"008000","font.size":"16","numFmt":"$#,##0"}},
  {"command":"set","path":"/Dashboard/A4","props":{"value":"Total Expenses","bold":"true"}},
  {"command":"set","path":"/Dashboard/B4","props":{"formula":"PL!B3","font.color":"008000","font.size":"16","numFmt":"$#,##0"}},
  {"command":"set","path":"/Dashboard/A5","props":{"value":"Net Income","bold":"true"}},
  {"command":"set","path":"/Dashboard/B5","props":{"formula":"PL!B4","font.color":"008000","font.size":"16","bold":"true","numFmt":"$#,##0"}},
  {"command":"set","path":"/Dashboard/A6","props":{"value":"Margin","bold":"true"}},
  {"command":"set","path":"/Dashboard/B6","props":{"formula":"PL!C4","font.color":"008000","font.size":"16","numFmt":"0.0%"}}
]
EOF

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
cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Sales Data/A1","props":{"value":"Date","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sales Data/B1","props":{"value":"Sales Rep","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sales Data/C1","props":{"value":"Region","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sales Data/D1","props":{"value":"Product","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sales Data/E1","props":{"value":"Amount","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sales Data/F1","props":{"value":"Status","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}}
]
EOF

# Sample data rows
cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Sales Data/A2","props":{"value":"2025-01-15","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B2","props":{"value":"Alice Chen"}},
  {"command":"set","path":"/Sales Data/C2","props":{"value":"North"}},
  {"command":"set","path":"/Sales Data/D2","props":{"value":"Widget Pro"}},
  {"command":"set","path":"/Sales Data/E2","props":{"value":"12500","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F2","props":{"value":"Won"}},
  {"command":"set","path":"/Sales Data/A3","props":{"value":"2025-01-22","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B3","props":{"value":"Bob Martinez"}},
  {"command":"set","path":"/Sales Data/C3","props":{"value":"South"}},
  {"command":"set","path":"/Sales Data/D3","props":{"value":"Widget Basic"}},
  {"command":"set","path":"/Sales Data/E3","props":{"value":"8200","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F3","props":{"value":"Won"}}
]
EOF

cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Sales Data/A4","props":{"value":"2025-02-03","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B4","props":{"value":"Carol Wu"}},
  {"command":"set","path":"/Sales Data/C4","props":{"value":"East"}},
  {"command":"set","path":"/Sales Data/D4","props":{"value":"Widget Pro"}},
  {"command":"set","path":"/Sales Data/E4","props":{"value":"15800","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F4","props":{"value":"Pending"}},
  {"command":"set","path":"/Sales Data/A5","props":{"value":"2025-02-10","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B5","props":{"value":"Dave Kim"}},
  {"command":"set","path":"/Sales Data/C5","props":{"value":"West"}},
  {"command":"set","path":"/Sales Data/D5","props":{"value":"Widget Enterprise"}},
  {"command":"set","path":"/Sales Data/E5","props":{"value":"32000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F5","props":{"value":"Won"}}
]
EOF

cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Sales Data/A6","props":{"value":"2025-02-18","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B6","props":{"value":"Alice Chen"}},
  {"command":"set","path":"/Sales Data/C6","props":{"value":"North"}},
  {"command":"set","path":"/Sales Data/D6","props":{"value":"Widget Basic"}},
  {"command":"set","path":"/Sales Data/E6","props":{"value":"6500","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F6","props":{"value":"Lost"}},
  {"command":"set","path":"/Sales Data/A7","props":{"value":"2025-03-01","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B7","props":{"value":"Bob Martinez"}},
  {"command":"set","path":"/Sales Data/C7","props":{"value":"South"}},
  {"command":"set","path":"/Sales Data/D7","props":{"value":"Widget Pro"}},
  {"command":"set","path":"/Sales Data/E7","props":{"value":"18500","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F7","props":{"value":"Open"}}
]
EOF

cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Sales Data/A8","props":{"value":"2025-03-12","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B8","props":{"value":"Carol Wu"}},
  {"command":"set","path":"/Sales Data/C8","props":{"value":"East"}},
  {"command":"set","path":"/Sales Data/D8","props":{"value":"Widget Enterprise"}},
  {"command":"set","path":"/Sales Data/E8","props":{"value":"45000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F8","props":{"value":"Won"}},
  {"command":"set","path":"/Sales Data/A9","props":{"value":"2025-03-20","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B9","props":{"value":"Dave Kim"}},
  {"command":"set","path":"/Sales Data/C9","props":{"value":"West"}},
  {"command":"set","path":"/Sales Data/D9","props":{"value":"Widget Pro"}},
  {"command":"set","path":"/Sales Data/E9","props":{"value":"14200","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F9","props":{"value":"Pending"}}
]
EOF

cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Sales Data/A10","props":{"value":"2025-04-05","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B10","props":{"value":"Alice Chen"}},
  {"command":"set","path":"/Sales Data/C10","props":{"value":"North"}},
  {"command":"set","path":"/Sales Data/D10","props":{"value":"Widget Enterprise"}},
  {"command":"set","path":"/Sales Data/E10","props":{"value":"52000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F10","props":{"value":"Won"}},
  {"command":"set","path":"/Sales Data/A11","props":{"value":"2025-04-15","numFmt":"yyyy-mm-dd"}},
  {"command":"set","path":"/Sales Data/B11","props":{"value":"Bob Martinez"}},
  {"command":"set","path":"/Sales Data/C11","props":{"value":"South"}},
  {"command":"set","path":"/Sales Data/D11","props":{"value":"Widget Basic"}},
  {"command":"set","path":"/Sales Data/E11","props":{"value":"7800","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sales Data/F11","props":{"value":"Won"}}
]
EOF

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
cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Summary/A1","props":{"value":"Sales Summary","bold":"true","font.size":"16","font.color":"1F4E79"}},
  {"command":"set","path":"/Summary/A1:D1","props":{"merge":"true"}},
  {"command":"set","path":"/Summary/A3","props":{"value":"By Region","bold":"true","font.size":"13"}},
  {"command":"set","path":"/Summary/A4","props":{"value":"North"}},
  {"command":"set","path":"/Summary/A5","props":{"value":"South"}},
  {"command":"set","path":"/Summary/A6","props":{"value":"East"}},
  {"command":"set","path":"/Summary/A7","props":{"value":"West"}}
]
EOF

cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Summary/B3","props":{"value":"Total","bold":"true"}},
  {"command":"set","path":"/Summary/C3","props":{"value":"Count","bold":"true"}},
  {"command":"set","path":"/Summary/D3","props":{"value":"Trend","bold":"true"}},
  {"command":"set","path":"/Summary/B4","props":{"formula":"SUMIF('Sales Data'!C2:C11,\"North\",'Sales Data'!E2:E11)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/B5","props":{"formula":"SUMIF('Sales Data'!C2:C11,\"South\",'Sales Data'!E2:E11)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/B6","props":{"formula":"SUMIF('Sales Data'!C2:C11,\"East\",'Sales Data'!E2:E11)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/B7","props":{"formula":"SUMIF('Sales Data'!C2:C11,\"West\",'Sales Data'!E2:E11)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/C4","props":{"formula":"COUNTIF('Sales Data'!C2:C11,\"North\")"}},
  {"command":"set","path":"/Summary/C5","props":{"formula":"COUNTIF('Sales Data'!C2:C11,\"South\")"}},
  {"command":"set","path":"/Summary/C6","props":{"formula":"COUNTIF('Sales Data'!C2:C11,\"East\")"}},
  {"command":"set","path":"/Summary/C7","props":{"formula":"COUNTIF('Sales Data'!C2:C11,\"West\")"}}
]
EOF

# Status summary
# NOTE: Cross-sheet formulas MUST use batch/heredoc to avoid shell escaping issues with !
cat <<'EOF' | officecli batch sales-tracker.xlsx
[
  {"command":"set","path":"/Summary/A9","props":{"value":"By Status","bold":"true","font.size":"13"}},
  {"command":"set","path":"/Summary/A10","props":{"value":"Open"}},
  {"command":"set","path":"/Summary/A11","props":{"value":"Won"}},
  {"command":"set","path":"/Summary/A12","props":{"value":"Lost"}},
  {"command":"set","path":"/Summary/A13","props":{"value":"Pending"}},
  {"command":"set","path":"/Summary/B9","props":{"value":"Count","bold":"true"}},
  {"command":"set","path":"/Summary/B10","props":{"formula":"COUNTIF('Sales Data'!F2:F11,\"Open\")"}},
  {"command":"set","path":"/Summary/B11","props":{"formula":"COUNTIF('Sales Data'!F2:F11,\"Won\")"}},
  {"command":"set","path":"/Summary/B12","props":{"formula":"COUNTIF('Sales Data'!F2:F11,\"Lost\")"}},
  {"command":"set","path":"/Summary/B13","props":{"formula":"COUNTIF('Sales Data'!F2:F11,\"Pending\")"}}
]
EOF

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
cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Raw Data/A1","props":{"value":"Date","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Raw Data/B1","props":{"value":"Region","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Raw Data/C1","props":{"value":"Category","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Raw Data/D1","props":{"value":"Amount","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Raw Data/E1","props":{"value":"Quantity","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}}
]
EOF

# 50 rows of sample data (split into chunks of ~12 for batch reliability)
cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Raw Data/A2","props":{"value":"2025-01-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B2","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C2","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D2","props":{"value":"4500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E2","props":{"value":"12"}},
  {"command":"set","path":"/Raw Data/A3","props":{"value":"2025-01-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B3","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C3","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D3","props":{"value":"2800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E3","props":{"value":"45"}},
  {"command":"set","path":"/Raw Data/A4","props":{"value":"2025-01-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B4","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C4","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D4","props":{"value":"6200","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E4","props":{"value":"18"}},
  {"command":"set","path":"/Raw Data/A5","props":{"value":"2025-01-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B5","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C5","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D5","props":{"value":"1500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E5","props":{"value":"80"}},
  {"command":"set","path":"/Raw Data/A6","props":{"value":"2025-02-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B6","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C6","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D6","props":{"value":"3200","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E6","props":{"value":"50"}},
  {"command":"set","path":"/Raw Data/A7","props":{"value":"2025-02-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B7","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C7","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D7","props":{"value":"5800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E7","props":{"value":"15"}},
  {"command":"set","path":"/Raw Data/A8","props":{"value":"2025-02-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B8","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C8","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D8","props":{"value":"1800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E8","props":{"value":"90"}},
  {"command":"set","path":"/Raw Data/A9","props":{"value":"2025-02-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B9","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C9","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D9","props":{"value":"2100","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E9","props":{"value":"35"}},
  {"command":"set","path":"/Raw Data/A10","props":{"value":"2025-02-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B10","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C10","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D10","props":{"value":"1200","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E10","props":{"value":"60"}},
  {"command":"set","path":"/Raw Data/A11","props":{"value":"2025-03-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B11","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C11","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D11","props":{"value":"1600","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E11","props":{"value":"70"}}
]
EOF

cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Raw Data/A12","props":{"value":"2025-03-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B12","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C12","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D12","props":{"value":"3800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E12","props":{"value":"55"}},
  {"command":"set","path":"/Raw Data/A13","props":{"value":"2025-03-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B13","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C13","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D13","props":{"value":"7200","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E13","props":{"value":"22"}},
  {"command":"set","path":"/Raw Data/A14","props":{"value":"2025-03-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B14","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C14","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D14","props":{"value":"5100","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E14","props":{"value":"14"}},
  {"command":"set","path":"/Raw Data/A15","props":{"value":"2025-03-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B15","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C15","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D15","props":{"value":"2500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E15","props":{"value":"40"}},
  {"command":"set","path":"/Raw Data/A16","props":{"value":"2025-04-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B16","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C16","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D16","props":{"value":"6800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E16","props":{"value":"20"}},
  {"command":"set","path":"/Raw Data/A17","props":{"value":"2025-04-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B17","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C17","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D17","props":{"value":"1400","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E17","props":{"value":"75"}},
  {"command":"set","path":"/Raw Data/A18","props":{"value":"2025-04-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B18","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C18","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D18","props":{"value":"2900","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E18","props":{"value":"42"}},
  {"command":"set","path":"/Raw Data/A19","props":{"value":"2025-04-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B19","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C19","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D19","props":{"value":"5500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E19","props":{"value":"16"}},
  {"command":"set","path":"/Raw Data/A20","props":{"value":"2025-04-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B20","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C20","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D20","props":{"value":"1700","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E20","props":{"value":"85"}},
  {"command":"set","path":"/Raw Data/A21","props":{"value":"2025-05-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B21","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C21","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D21","props":{"value":"2600","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E21","props":{"value":"38"}}
]
EOF

cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Raw Data/A22","props":{"value":"2025-05-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B22","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C22","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D22","props":{"value":"1300","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E22","props":{"value":"65"}},
  {"command":"set","path":"/Raw Data/A23","props":{"value":"2025-05-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B23","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C23","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D23","props":{"value":"3100","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E23","props":{"value":"48"}},
  {"command":"set","path":"/Raw Data/A24","props":{"value":"2025-05-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B24","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C24","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D24","props":{"value":"7500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E24","props":{"value":"25"}},
  {"command":"set","path":"/Raw Data/A25","props":{"value":"2025-05-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B25","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C25","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D25","props":{"value":"6400","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E25","props":{"value":"19"}},
  {"command":"set","path":"/Raw Data/A26","props":{"value":"2025-06-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B26","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C26","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D26","props":{"value":"5600","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E26","props":{"value":"17"}},
  {"command":"set","path":"/Raw Data/A27","props":{"value":"2025-06-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B27","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C27","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D27","props":{"value":"1900","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E27","props":{"value":"72"}},
  {"command":"set","path":"/Raw Data/A28","props":{"value":"2025-06-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B28","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C28","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D28","props":{"value":"3500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E28","props":{"value":"52"}},
  {"command":"set","path":"/Raw Data/A29","props":{"value":"2025-06-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B29","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C29","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D29","props":{"value":"1100","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E29","props":{"value":"58"}},
  {"command":"set","path":"/Raw Data/A30","props":{"value":"2025-06-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B30","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C30","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D30","props":{"value":"2700","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E30","props":{"value":"44"}},
  {"command":"set","path":"/Raw Data/A31","props":{"value":"2025-07-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B31","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C31","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D31","props":{"value":"6100","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E31","props":{"value":"21"}}
]
EOF

cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Raw Data/A32","props":{"value":"2025-07-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B32","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C32","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D32","props":{"value":"1500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E32","props":{"value":"82"}},
  {"command":"set","path":"/Raw Data/A33","props":{"value":"2025-07-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B33","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C33","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D33","props":{"value":"2400","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E33","props":{"value":"36"}},
  {"command":"set","path":"/Raw Data/A34","props":{"value":"2025-07-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B34","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C34","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D34","props":{"value":"4800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E34","props":{"value":"13"}},
  {"command":"set","path":"/Raw Data/A35","props":{"value":"2025-07-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B35","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C35","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D35","props":{"value":"3300","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E35","props":{"value":"47"}},
  {"command":"set","path":"/Raw Data/A36","props":{"value":"2025-08-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B36","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C36","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D36","props":{"value":"7100","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E36","props":{"value":"23"}},
  {"command":"set","path":"/Raw Data/A37","props":{"value":"2025-08-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B37","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C37","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D37","props":{"value":"1600","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E37","props":{"value":"68"}},
  {"command":"set","path":"/Raw Data/A38","props":{"value":"2025-08-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B38","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C38","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D38","props":{"value":"1400","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E38","props":{"value":"62"}},
  {"command":"set","path":"/Raw Data/A39","props":{"value":"2025-08-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B39","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C39","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D39","props":{"value":"5900","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E39","props":{"value":"18"}},
  {"command":"set","path":"/Raw Data/A40","props":{"value":"2025-08-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B40","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C40","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D40","props":{"value":"4100","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E40","props":{"value":"56"}},
  {"command":"set","path":"/Raw Data/A41","props":{"value":"2025-09-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B41","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C41","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D41","props":{"value":"6600","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E41","props":{"value":"20"}}
]
EOF

cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Raw Data/A42","props":{"value":"2025-09-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B42","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C42","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D42","props":{"value":"3400","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E42","props":{"value":"46"}},
  {"command":"set","path":"/Raw Data/A43","props":{"value":"2025-09-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B43","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C43","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D43","props":{"value":"2000","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E43","props":{"value":"76"}},
  {"command":"set","path":"/Raw Data/A44","props":{"value":"2025-09-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B44","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C44","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D44","props":{"value":"7800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E44","props":{"value":"26"}},
  {"command":"set","path":"/Raw Data/A45","props":{"value":"2025-09-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B45","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C45","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D45","props":{"value":"2300","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E45","props":{"value":"33"}},
  {"command":"set","path":"/Raw Data/A46","props":{"value":"2025-10-01","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B46","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C46","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D46","props":{"value":"5300","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E46","props":{"value":"15"}},
  {"command":"set","path":"/Raw Data/A47","props":{"value":"2025-10-05","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B47","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C47","props":{"value":"Electronics"}},{"command":"set","path":"/Raw Data/D47","props":{"value":"4700","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E47","props":{"value":"14"}},
  {"command":"set","path":"/Raw Data/A48","props":{"value":"2025-10-10","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B48","props":{"value":"East"}},{"command":"set","path":"/Raw Data/C48","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D48","props":{"value":"1800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E48","props":{"value":"88"}},
  {"command":"set","path":"/Raw Data/A49","props":{"value":"2025-10-15","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B49","props":{"value":"West"}},{"command":"set","path":"/Raw Data/C49","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D49","props":{"value":"1200","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E49","props":{"value":"55"}},
  {"command":"set","path":"/Raw Data/A50","props":{"value":"2025-10-20","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B50","props":{"value":"North"}},{"command":"set","path":"/Raw Data/C50","props":{"value":"Food"}},{"command":"set","path":"/Raw Data/D50","props":{"value":"1500","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E50","props":{"value":"70"}},
  {"command":"set","path":"/Raw Data/A51","props":{"value":"2025-10-25","numFmt":"yyyy-mm-dd"}},{"command":"set","path":"/Raw Data/B51","props":{"value":"South"}},{"command":"set","path":"/Raw Data/C51","props":{"value":"Clothing"}},{"command":"set","path":"/Raw Data/D51","props":{"value":"2800","numFmt":"$#,##0"}},{"command":"set","path":"/Raw Data/E51","props":{"value":"41"}}
]
EOF

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
cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Summary/A1","props":{"value":"Data Analysis Summary","bold":"true","font.size":"16","font.color":"1F4E79"}},
  {"command":"set","path":"/Summary/A1:D1","props":{"merge":"true"}},
  {"command":"set","path":"/Summary/A3","props":{"value":"Overall Statistics","bold":"true","font.size":"13"}},
  {"command":"set","path":"/Summary/A4","props":{"value":"Total Amount"}},
  {"command":"set","path":"/Summary/B4","props":{"formula":"SUM('Raw Data'!D2:D51)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/A5","props":{"value":"Average Amount"}},
  {"command":"set","path":"/Summary/B5","props":{"formula":"AVERAGE('Raw Data'!D2:D51)","numFmt":"$#,##0.00"}},
  {"command":"set","path":"/Summary/A6","props":{"value":"Min Amount"}},
  {"command":"set","path":"/Summary/B6","props":{"formula":"MIN('Raw Data'!D2:D51)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/A7","props":{"value":"Max Amount"}},
  {"command":"set","path":"/Summary/B7","props":{"formula":"MAX('Raw Data'!D2:D51)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/A8","props":{"value":"Record Count"}},
  {"command":"set","path":"/Summary/B8","props":{"formula":"COUNTA('Raw Data'!A2:A51)"}}
]
EOF

cat <<'EOF' | officecli batch data-analysis.xlsx
[
  {"command":"set","path":"/Summary/A10","props":{"value":"By Region","bold":"true","font.size":"13"}},
  {"command":"set","path":"/Summary/A11","props":{"value":"North"}},
  {"command":"set","path":"/Summary/B11","props":{"formula":"SUMIF('Raw Data'!B2:B51,\"North\",'Raw Data'!D2:D51)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/A12","props":{"value":"South"}},
  {"command":"set","path":"/Summary/B12","props":{"formula":"SUMIF('Raw Data'!B2:B51,\"South\",'Raw Data'!D2:D51)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/A13","props":{"value":"East"}},
  {"command":"set","path":"/Summary/B13","props":{"formula":"SUMIF('Raw Data'!B2:B51,\"East\",'Raw Data'!D2:D51)","numFmt":"$#,##0"}},
  {"command":"set","path":"/Summary/A14","props":{"value":"West"}},
  {"command":"set","path":"/Summary/B14","props":{"formula":"SUMIF('Raw Data'!B2:B51,\"West\",'Raw Data'!D2:D51)","numFmt":"$#,##0"}}
]
EOF

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
cat <<'EOF' | officecli batch data.xlsx
[{"command":"set","path":"/Summary/B2","props":{"formula":"Revenue!B14"}}]
EOF

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

## Batch Recipes

### Financial Model Header + Data (Batch)

```bash
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Month","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Revenue","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sheet1/C1","props":{"value":"Expenses","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sheet1/D1","props":{"value":"Net","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sheet1/A2","props":{"value":"Jan"}},
  {"command":"set","path":"/Sheet1/B2","props":{"value":"42000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/C2","props":{"value":"28000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/D2","props":{"formula":"B2-C2","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/A3","props":{"value":"Feb"}},
  {"command":"set","path":"/Sheet1/B3","props":{"value":"45000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/C3","props":{"value":"30000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/D3","props":{"formula":"B3-C3","font.color":"000000","numFmt":"$#,##0"}}
]
EOF

cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"set","path":"/Sheet1/A4","props":{"value":"Mar"}},
  {"command":"set","path":"/Sheet1/B4","props":{"value":"48000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/C4","props":{"value":"31000","font.color":"0000FF","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/D4","props":{"formula":"B4-C4","font.color":"000000","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/A14","props":{"value":"Total","bold":"true"}},
  {"command":"set","path":"/Sheet1/B14","props":{"formula":"SUM(B2:B13)","font.color":"000000","bold":"true","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/C14","props":{"formula":"SUM(C2:C13)","font.color":"000000","bold":"true","numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/D14","props":{"formula":"SUM(D2:D13)","font.color":"000000","bold":"true","numFmt":"$#,##0"}}
]
EOF
```

### Dashboard KPIs (Batch)

```bash
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"set","path":"/Dashboard/A1:C1","props":{"merge":"true"}},
  {"command":"set","path":"/Dashboard/A1","props":{"value":"Key Performance Indicators","bold":"true","font.size":"18","font.color":"1F4E79"}},
  {"command":"set","path":"/Dashboard/A3","props":{"value":"Total Revenue","bold":"true","font.size":"11"}},
  {"command":"set","path":"/Dashboard/A4","props":{"formula":"Revenue!D14","font.color":"008000","font.size":"24","numFmt":"$#,##0"}},
  {"command":"set","path":"/Dashboard/B3","props":{"value":"Net Income","bold":"true","font.size":"11"}},
  {"command":"set","path":"/Dashboard/B4","props":{"formula":"PL!B4","font.color":"008000","font.size":"24","numFmt":"$#,##0"}},
  {"command":"set","path":"/Dashboard/C3","props":{"value":"Margin","bold":"true","font.size":"11"}},
  {"command":"set","path":"/Dashboard/C4","props":{"formula":"PL!C4","font.color":"008000","font.size":"24","numFmt":"0.0%"}}
]
EOF
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
