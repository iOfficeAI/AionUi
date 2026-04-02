<!-- officecli: v1.0.23 -->

# Editing Existing Workbooks

Use this guide when modifying an existing .xlsx file or working from a template.

## Workflow Overview

1. **Analyze** the workbook (structure, sheets, formulas, formatting)
2. **Plan** content mapping (what to change, what to keep, what to add)
3. **Structural changes** (add/remove sheets, rows, columns) -- **do this FIRST**
4. **Content edits** (data updates, formula changes, chart updates)
5. **QA** (content + formula verification + validation) -- see [SKILL.md](SKILL.md#qa-required)

---

## Analyzing the Workbook

### Step 1: Issue Detection

```bash
officecli view data.xlsx issues
```

### Step 2: Structure Overview

```bash
officecli view data.xlsx outline
```

Look for: sheet names, row/column counts, formula counts per sheet.

### Step 3: Content Inspection

```bash
# Full text dump
officecli view data.xlsx text

# Limited range
officecli view data.xlsx text --start 1 --end 20 --cols A,B,C,D

# Annotated (shows formulas, types, formatting)
officecli view data.xlsx annotated
```

### Step 4: Statistics

```bash
officecli view data.xlsx stats
```

### Step 5: Element Inspection

```bash
# Workbook root
officecli get data.xlsx /

# Sheet overview
officecli get data.xlsx "/Revenue"

# Specific cells
officecli get data.xlsx "/Revenue/B2"
officecli get data.xlsx "/Revenue/A1:F20"

# Chart details
officecli get data.xlsx "/Revenue/chart[1]"

# Named ranges
officecli get data.xlsx "/namedrange[GrowthRate]"
```

### Step 6: Find Specific Elements

```bash
officecli query data.xlsx 'cell:has(formula)'
officecli query data.xlsx 'cell:contains("{{")'
officecli query data.xlsx 'table'
officecli query data.xlsx 'chart'
officecli query data.xlsx 'pivottable'
```

---

## Planning Content Mapping

Before editing, map every element to an action:

```
Source element              Action
--------------              ------
Revenue sheet headers    -> Keep (preserve formatting)
Revenue data rows        -> Update values
Revenue SUM formulas     -> Verify ranges still correct after row adds
Revenue chart            -> Delete and recreate (new series needed)
Expenses sheet           -> Add new category rows
P&L cross-sheet formulas -> Update ranges if rows added
Dashboard CF rules       -> Keep
Named ranges             -> Update refs if structure changed
```

---

## Structural Changes (Do First)

**WARNING: Complete ALL structural changes before editing content. Adding/removing rows shifts cell references and can break formulas.**

### Add/Remove Sheets

```bash
officecli add data.xlsx / --type sheet --prop name="NewSheet"
officecli remove data.xlsx "/OldSheet"
```

### Reorder Sheets

```bash
officecli swap data.xlsx "/Sheet1" "/Sheet2"
```

### Add/Remove Rows

```bash
# Add row (inserts at index position within sheet)
officecli add data.xlsx /Sheet1 --type row --index 5

# Remove row
officecli remove data.xlsx "/Sheet1/row[10]"
```

**Remove from highest index to lowest** to avoid index shifting.

### Re-query After Structural Changes

```bash
officecli get data.xlsx "/Sheet1" --depth 1
officecli view data.xlsx outline
```

---

## Content Editing

### Update Cell Values

```bash
# Update single cell
officecli set data.xlsx "/Sheet1/B5" --prop value=12500

# Update formula
officecli set data.xlsx "/Sheet1/B14" --prop formula="SUM(B2:B13)"

# Update formatting
officecli set data.xlsx "/Sheet1/B5" --prop numFmt='$#,##0' --prop font.color=0000FF
```

### Update Charts

```bash
# Update existing series data
officecli set data.xlsx "/Sheet1/chart[1]" --prop data="2026:51,67,74,92"

# Update chart title
officecli set data.xlsx "/Sheet1/chart[1]" --prop title="Updated Revenue"

# Delete and recreate (to change series count)
officecli remove data.xlsx "/Sheet1/chart[1]"
officecli add data.xlsx /Sheet1 --type chart --prop chartType=column --prop categories="Q1,Q2,Q3,Q4" --prop series1="Rev:51,67,74,92" --prop series2="Cost:30,35,38,42" --prop colors=1F4E79,4472C4 --prop x=5 --prop y=1 --prop width=15 --prop height=10
```

### Update Tables

```bash
# Update table range (after adding rows)
officecli set data.xlsx "/Sheet1/table[1]" --prop ref="A1:E25"

# Update table style
officecli set data.xlsx "/Sheet1/table[1]" --prop style=TableStyleMedium9
```

### Template Merge

```bash
# Replace {{key}} placeholders with JSON data
officecli merge template.xlsx output.xlsx data.json
```

Where `data.json` contains `{"key": "value", ...}`.

### Bulk Updates via Query-then-Batch

`set` does not accept query selectors directly. To apply changes to multiple matching cells, use a two-step workflow:

```bash
# Step 1: Find matching cells
officecli query data.xlsx 'cell[type=Number]' --json

# Step 2: Use the returned paths in a batch command
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"set","path":"/Sheet1/B2","props":{"numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/B3","props":{"numFmt":"$#,##0"}},
  {"command":"set","path":"/Sheet1/C2","props":{"numFmt":"$#,##0"}}
]
EOF
```

### CSV Data Refresh

When updating a workbook with fresh data from a CSV file:

```bash
officecli import data.xlsx /Sheet1 --file updated-data.csv --header
```

---

## Formula Preservation Pitfalls

### Pitfall: Row Insertion Breaks Formula Ranges

When you insert a row inside a formula range (e.g., insert row 5 within `SUM(B2:B10)`), Excel auto-expands the range. But when modifying via CLI, formulas may NOT auto-adjust. Always:

- Check formula ranges after structural changes
- Update formula ranges manually if needed

```bash
# After inserting rows, verify and update formula ranges
officecli get data.xlsx "/Sheet1/B14"
officecli set data.xlsx "/Sheet1/B15" --prop formula="SUM(B2:B14)"
```

### Pitfall: Cross-Sheet Reference After Sheet Rename

If you rename a sheet, cross-sheet references break. Check for references to the old sheet name:

```bash
officecli query data.xlsx 'cell:has(formula)'
officecli view data.xlsx annotated
```

### Pitfall: Cross-Sheet Formula `!` Escaping

The `!` character in cross-sheet references (e.g., `Revenue!B14`) can be corrupted by shell quoting, producing `Revenue\!B14` in the XML. This renders ALL affected formulas broken (Err:508 in Excel/LibreOffice). The `validate` command does NOT catch this.

**Safe patterns:**
```bash
# SAFE: batch/heredoc (recommended)
cat <<'EOF' | officecli batch data.xlsx
[{"command":"set","path":"/PL/B2","props":{"formula":"Revenue!D14"}}]
EOF

# SAFE: double quotes
officecli set data.xlsx "/PL/B2" --prop "formula==Revenue!D14"
```

**Broken patterns:**
```bash
# BROKEN: single quotes
officecli set data.xlsx "/PL/B2" --prop 'formula==Revenue!D14'

# BROKEN: escaped ! in double quotes
officecli set data.xlsx "/PL/B2" --prop "formula==Revenue\!D14"
```

**Always verify after setting cross-sheet formulas:**
```bash
officecli get data.xlsx "/PL/B2"
# GOOD: formula: Revenue!D14
# BAD:  formula: Revenue\!D14
```

### Pitfall: Overwriting Formulas with Values

```bash
# WRONG -- overwrites the formula with a static value
officecli set data.xlsx "/Sheet1/B14" --prop value=5000

# CORRECT -- updates the formula
officecli set data.xlsx "/Sheet1/B14" --prop formula="SUM(B2:B13)"
```

Always check whether a cell has a formula before setting `value`. Use `get` to inspect first.

### Pitfall: Named Range Refs After Structural Changes

After adding/removing rows or sheets, named range `ref` values may point to wrong locations. Verify and update:

```bash
officecli get data.xlsx "/namedrange[GrowthRate]"
officecli set data.xlsx "/namedrange[GrowthRate]" --prop ref="Assumptions!B3"
```

---

## Raw XML Escape Hatch

When high-level commands cannot express the needed change:

```bash
# View raw XML
officecli raw data.xlsx "/Sheet1"

# View styles XML
officecli raw data.xlsx /styles

# Modify raw XML
officecli raw-set data.xlsx "/Sheet1" --xpath "//x:sheetData/x:row[1]" --action setattr --xml 'ht="25"'
```

XPath prefixes: `x` (SpreadsheetML), `r` (Relationships), `a` (DrawingML), `c` (Charts), `xdr` (Spreadsheet Drawing)

raw-set actions: append, prepend, insertbefore, insertafter, replace, remove, setattr

Use raw XML only as a last resort. The high-level CLI handles most operations correctly without XML knowledge.
