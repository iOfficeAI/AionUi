---
# officecli: v1.0.23
name: officecli-xlsx
description: "Use this skill any time a .xlsx file is involved -- as input, output, or both. This includes: creating spreadsheets, financial models, dashboards, or trackers; reading, parsing, or extracting data from any .xlsx file; editing, modifying, or updating existing workbooks; working with formulas, charts, pivot tables, or templates; importing CSV/TSV data into Excel format. Trigger whenever the user mentions 'spreadsheet', 'workbook', 'Excel', 'financial model', 'tracker', 'dashboard', or references a .xlsx/.csv filename."
---

# OfficeCLI XLSX Skill

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
        echo "Upgrading officecli $CURRENT → $LATEST..."
        curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
    else
        echo "officecli $CURRENT is up to date"
    fi
fi
officecli --version
```

---

## Quick Reference

| Task | Action |
|------|--------|
| Read / analyze content | Use `view` and `get` commands below |
| Edit existing workbook | Read [editing.md](editing.md) |
| Create from scratch | Read [creating.md](creating.md) |

---

## Execution Model

**Run commands one at a time. Do not write all commands into a shell script and execute it as a single block.**

OfficeCLI is incremental: every `add`, `set`, and `remove` immediately modifies the file and returns output. Use this to catch errors early:

1. **One command at a time, then read the output.** Check the exit code before proceeding.
2. **Non-zero exit = stop and fix immediately.** Do not continue building on a broken state.
3. **Verify after structural operations.** After adding a sheet, chart, pivot table, or named range, run `get` or `validate` before building on top of it.

Running a 50-command script all at once means the first error cascades silently through every subsequent command. Running incrementally means the failure context is immediate and local — fix it and move on.

---

## Reading & Analyzing

### Text Extraction

```bash
officecli view data.xlsx text
officecli view data.xlsx text --start 1 --end 50 --cols A,B,C
```

Plain text dump, tab-separated per row, with `[/Sheet1/row[N]]` prefixes. Flags: `--mode`, `--start N`, `--end N`, `--max-lines N`, `--cols A,B,C`.

### Structure Overview

```bash
officecli view data.xlsx outline
```

Sheets with row/column counts and formula counts per sheet.

### Detailed Inspection

```bash
officecli view data.xlsx annotated
```

Cell values with type/formula annotations, warnings for errors and empty cells.

### Statistics

```bash
officecli view data.xlsx stats
```

Summary statistics across all sheets.

### Issue Detection

```bash
officecli view data.xlsx issues
```

Empty sheets, broken formulas, missing references.

### Element Inspection

```bash
# Workbook root (lists all sheets, doc properties)
officecli get data.xlsx /

# Sheet overview (freeze, autoFilter, zoom, tabColor)
officecli get data.xlsx "/Sheet1"

# Single cell (value, type, formula, font, fill, borders, numFmt)
officecli get data.xlsx "/Sheet1/A1"

# Cell range
officecli get data.xlsx "/Sheet1/A1:D10"

# Row properties
officecli get data.xlsx "/Sheet1/row[1]"

# Column properties
officecli get data.xlsx "/Sheet1/col[A]"

# Chart
officecli get data.xlsx "/Sheet1/chart[1]"

# Table (ListObject)
officecli get data.xlsx "/Sheet1/table[1]"

# Data validation rule
officecli get data.xlsx "/Sheet1/validation[1]"

# Conditional formatting rule
officecli get data.xlsx "/Sheet1/cf[1]"

# Comment
officecli get data.xlsx "/Sheet1/comment[1]"

# Named range
officecli get data.xlsx "/namedrange[1]"
```

Add `--depth N` to expand children, `--json` for structured output. Excel-native notation also supported: `Sheet1!A1`, `Sheet1!A1:D10`.

### CSS-like Queries

```bash
# Cells with formulas
officecli query data.xlsx 'cell:has(formula)'

# Cells containing text
officecli query data.xlsx 'cell:contains("Revenue")'

# Empty cells
officecli query data.xlsx 'cell:empty'

# Cells by type
officecli query data.xlsx 'cell[type=Number]'

# Cells by formatting
officecli query data.xlsx 'cell[font.bold=true]'

# Column B non-zero
officecli query data.xlsx 'B[value!=0]'

# Sheet-scoped
officecli query data.xlsx 'Sheet1!cell[value="100"]'

# Find all charts
officecli query data.xlsx 'chart'

# Find all tables
officecli query data.xlsx 'table'

# Find all pivot tables
officecli query data.xlsx 'pivottable'
```

Operators: `=`, `!=`, `~=` (contains), `>=`, `<=`, `[attr]` (exists).

---

## Design Principles

**Professional spreadsheets need clear structure, correct formulas, and intentional formatting.**

### Use Formulas, Not Hardcoded Values (MANDATORY)

This is the single most important principle. The spreadsheet must remain dynamic -- when source data changes, formulas recalculate automatically. Hardcoded values break this contract.

```bash
# WRONG -- hardcoded calculation result
officecli set data.xlsx "/Sheet1/B10" --prop value=5000

# CORRECT -- let Excel calculate
officecli set data.xlsx "/Sheet1/B10" --prop formula="SUM(B2:B9)"
```

### Financial Model Color Coding

| Convention | Color | Use For |
|-----------|-------|---------|
| Blue text | `font.color=0000FF` | Hardcoded inputs, scenario-variable numbers |
| Black text | `font.color=000000` | ALL formulas and calculations |
| Green text | `font.color=008000` | Cross-sheet links within same workbook |
| Red text | `font.color=FF0000` | External references |
| Yellow background | `fill=FFFF00` | Key assumptions needing attention |

These are industry-standard financial modeling conventions. Apply when building financial models. For non-financial workbooks, use project-appropriate styling.

### Number Format Strings

| Type | Format String | Example Output | Code |
|------|--------------|----------------|------|
| Currency | `$#,##0` | $1,234 | `--prop numFmt='$#,##0'` |
| Currency (neg parens) | `$#,##0;($#,##0);"-"` | ($1,234) | `--prop numFmt='$#,##0;($#,##0);"-"'` |
| Percentage | `0.0%` | 12.5% | `--prop numFmt="0.0%"` |
| Decimal | `#,##0.00` | 1,234.56 | `--prop numFmt="#,##0.00"` |
| Accounting | `_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)` | $ 1,234 | `--prop numFmt='_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)'` |
| Date | `yyyy-mm-dd` | 2026-03-27 | `--prop numFmt="yyyy-mm-dd"` |
| Date (long) | `mmmm d, yyyy` | March 27, 2026 | `--prop numFmt="mmmm d, yyyy"` |
| Year as text | `@` | 2026 (not 2,026) | `--prop type=string` |
| Multiples | `0.0x` | 12.5x | `--prop numFmt="0.0x"` |
| Zeros as dash | `#,##0;-#,##0;"-"` | - | `--prop numFmt='#,##0;-#,##0;"-"'` |

**Shell quoting:** Number formats containing `$` must use single quotes (`'$#,##0'`) or heredoc in batch mode. Double quotes cause shell variable expansion.

### Column Width and Row Height

```bash
# Set column width (character units, ~1 char = 7px)
officecli set data.xlsx "/Sheet1/col[A]" --prop width=15
officecli set data.xlsx "/Sheet1/col[B]" --prop width=12

# Set row height (points)
officecli set data.xlsx "/Sheet1/row[1]" --prop height=20

# Hide column/row
officecli set data.xlsx "/Sheet1/col[D]" --prop hidden=true
officecli set data.xlsx "/Sheet1/row[5]" --prop hidden=true
```

There is no auto-fit. Set column widths explicitly. Common widths: labels=20-25, numbers=12-15, dates=12, short codes=8-10.

### Freeze Panes

```bash
# Freeze first row (headers)
officecli set data.xlsx "/Sheet1" --prop freeze=A2

# Freeze first column and first row
officecli set data.xlsx "/Sheet1" --prop freeze=B2
```

### Print Area

```bash
# Set print area on a sheet
officecli set data.xlsx "/Sheet1" --prop printArea="A1:F20"
```

### Data Validation for Input Cells

```bash
# Dropdown list
officecli add data.xlsx /Sheet1 --type validation --prop sqref="C2:C100" --prop type=list --prop formula1="Yes,No,Maybe" --prop showError=true --prop errorTitle="Invalid" --prop error="Select from list"

# Number range
officecli add data.xlsx /Sheet1 --type validation --prop sqref="D2:D100" --prop type=decimal --prop operator=between --prop formula1=0 --prop formula2=100 --prop showError=true --prop error="Enter 0-100"
```

Always add data validation on input cells in financial models and trackers. It prevents data entry errors.

### Print Area and Page Setup

For print-ready workbooks, set appropriate column widths and row heights. Consider which sheets need headers repeated on each page.

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first spreadsheet build is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you were not looking hard enough.

### Content QA

```bash
# Extract text, check for missing data
officecli view data.xlsx text

# Check structure
officecli view data.xlsx outline

# Check for issues (broken formulas, missing refs, empty sheets)
officecli view data.xlsx issues

# Verify formulas exist where expected
officecli query data.xlsx 'cell:has(formula)'

# Check for formula errors in cell values
officecli query data.xlsx 'cell:contains("#REF!")'
officecli query data.xlsx 'cell:contains("#DIV/0!")'
officecli query data.xlsx 'cell:contains("#VALUE!")'
officecli query data.xlsx 'cell:contains("#NAME?")'
officecli query data.xlsx 'cell:contains("#N/A")'
```

When editing templates, check for leftover placeholders:

```bash
officecli query data.xlsx 'cell:contains("{{")'
officecli query data.xlsx 'cell:contains("xxxx")'
officecli query data.xlsx 'cell:contains("placeholder")'
```

### Formula Verification Checklist

- [ ] Test 2-3 sample cell references: verify they pull correct values
- [ ] Column mapping: confirm cell references point to intended columns
- [ ] Row offsets: check formula ranges include all data rows
- [ ] Division by zero: verify denominators are non-zero or wrapped in IFERROR
- [ ] Cross-sheet references: use correct `Sheet1!A1` format
- [ ] Cross-sheet formula escaping: run `officecli get` on 2-3 cross-sheet formula cells and confirm no `\!` in the formula string. If `\!` is present, the formula is broken -- delete and re-set using batch/heredoc.
- [ ] Named ranges: verify `ref` values match actual data locations
- [ ] Edge cases: test with zero values, negative numbers, empty cells
- [ ] **Chart data vs formula results**: for every chart with hardcoded/inline data, verify each data point matches the corresponding formula cell result. Use `officecli get` on the source cells and compare against chart series values. Mismatches here are silent data integrity bugs.

### Validation

```bash
officecli validate data.xlsx
```

### Pre-Delivery Checklist

- [ ] Metadata set (title, author)
- [ ] All formula cells contain formulas (not hardcoded values)
- [ ] No formula error values (#REF!, #DIV/0!, #VALUE!, #NAME?, #N/A)
- [ ] Number formats applied (currency, percentage, dates)
- [ ] Column widths set explicitly (no default 8.43)
- [ ] Header row styled (bold, fill, freeze panes)
- [ ] Data validation on input cells
- [ ] Charts have titles and readable axis labels
- [ ] **Chart data matches source cells** -- charts with hardcoded/inline data can drift from formula results. For each chart, verify every data point against the corresponding cell value. Prefer cell-range references (`series1.values="Sheet1!B2:B6"`) over inline data to avoid transcription errors.
- [ ] Named ranges defined for key assumptions
- [ ] Document validates with `officecli validate`
- [ ] No placeholder text remaining
- [ ] Comments on hardcoded assumption values documenting their source

**NOTE**: Unlike pptx (SVG/HTML), xlsx has no visual preview mode. Verification relies on `view text`, `view annotated`, `view stats`, `view issues`, `validate`, and formula queries. For visual verification, the user must open the file in Excel.

### Verification Loop

1. Generate workbook
2. Run `view issues` + `view annotated` (sample ranges) + `validate`
3. Run formula error queries (all 5 error types)
4. List issues found (if none found, look again more critically)
5. Fix issues
6. Re-verify affected areas -- one fix often creates another problem
7. Repeat until a full pass reveals no new issues

**Do not declare success until you have completed at least one fix-and-verify cycle.**

---

## Common Pitfalls

| Pitfall | Correct Approach |
|---------|-----------------|
| `--name "foo"` | Use `--prop name="foo"` -- all attributes go through `--prop` |
| Guessing property names | Run `officecli xlsx set cell` to see exact names |
| `\n` in shell strings | Use `\\n` for newlines in `--prop text="line1\\nline2"` |
| Modifying an open file | Close the file in Excel first |
| Hex colors with `#` | Use `FF0000` not `#FF0000` -- no hash prefix |
| Paths are 1-based | `"/Sheet1/row[1]"`, `"/Sheet1/col[1]"` -- XPath convention |
| `--index` is 0-based | `--index 0` = first position -- array convention |
| Unquoted `[N]` in zsh/bash | Shell glob-expands `/Sheet1/row[1]` -- always quote paths: `"/Sheet1/row[1]"` |
| Sheet names with spaces | Quote the full path: `"/My Sheet/A1"` |
| Formula prefix `=` | OfficeCLI strips the `=` -- use `formula="SUM(A1:A10)"` not `formula="=SUM(A1:A10)"` |
| Cross-sheet `!` in formulas | **CRITICAL:** The `!` in `Sheet1!A1` can be corrupted by shell quoting. Use batch/heredoc for cross-sheet formulas, or double quotes: `--prop "formula==Sheet1!A1"`. NEVER use single quotes for formulas containing `!`. After setting, verify with `officecli get` that the formula shows `Sheet1!A1` (no backslash before `!`). |
| Hardcoded calculated values | Use `--prop formula="SUM(B2:B9)"` not `--prop value=5000` |
| `$` and `'` in batch JSON | Use heredoc: `cat <<'EOF' \| officecli batch` -- single-quoted delimiter prevents shell expansion |
| Number format with `$` | Shell interprets `$` -- use single quotes: `numFmt='$#,##0'` |
| Year displayed as "2,026" | Set cell type to string: `--prop type=string` or use `numFmt="@"` |

---

## Performance: Resident Mode

**Always use `open`/`close` — it is the smart default, not a special-case optimization.** Every command benefits: no repeated file I/O, no repeated parse/serialize cycles.

```bash
officecli open data.xlsx        # Load once into memory
officecli add data.xlsx ...     # All commands run in memory — fast
officecli set data.xlsx ...
officecli close data.xlsx       # Write once to disk
```

Use this pattern for every workbook build, regardless of command count.

## Performance: Batch Mode

```bash
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Revenue","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Q1","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}}
]
EOF
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `view`, `raw`, `raw-set`, `validate`.

Batch fields: `command`, `path`, `parent`, `type`, `from`, `to`, `index`, `after`, `before`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

`parent` = container to add into (for `add`). `path` = element to modify (for `set`, `get`, `remove`, `move`, `swap`).

Batch mode executes multiple operations in a single open/save cycle.

---

## Known Issues

| Issue | Workaround |
|---|---|
| **Chart series cannot be added after creation** | `set --prop data=` and `set --prop seriesN=` on an existing chart can only update existing series. To add series, delete and recreate: `officecli remove data.xlsx "/Sheet1/chart[1]"` then `officecli add` with all series. |
| **No visual preview** | Unlike pptx (SVG/HTML), xlsx has no built-in rendering. Use `view text`/`view annotated`/`view stats`/`view issues` for verification. Users must open in Excel for visual check. |
| **Formula cached values for new formulas** | OfficeCLI writes formula strings natively. For newly added formulas, the cached value may not update until the file is opened in Excel/LibreOffice. Existing formula cached values are preserved. |
| **No auto-fit column width** | No "auto-fit" column width based on content. Set `width` explicitly on each column. |
| **Shell quoting in batch with echo** | `echo '...' \| officecli batch` fails when JSON values contain apostrophes or `$`. Use heredoc: `cat <<'EOF' \| officecli batch data.xlsx`. |
| **Batch intermittent failure** | Batch+resident mode has a high failure rate (up to 1-in-3 in some sessions). For maximum reliability: (1) prefer batch WITHOUT resident mode, (2) keep batches to 8-12 operations, (3) always check batch output for failures, (4) retry failed operations individually. For critical formulas (especially cross-sheet), consider using individual `set` commands which have 100% reliability. |
| **Data bar default min/max invalid** | Creating a data bar without `--prop min=N --prop max=N` produces empty `val` attributes in cfvo elements, which may be rejected by strict XML validators or Excel. Always specify explicit min and max values. |
| **Cell protection requires sheet protection** | `locked` and `formulahidden` properties only take effect when the sheet itself is protected. |

---

## Help System

**When unsure about property names, value formats, or command syntax, run help instead of guessing.** One help query is faster than guess-fail-retry loops.

```bash
officecli xlsx set              # All settable elements and their properties
officecli xlsx set cell         # Cell properties in detail
officecli xlsx set cell.font    # Specific property format and examples
officecli xlsx add              # All addable element types
officecli xlsx view             # All view modes
officecli xlsx get              # All navigable paths
officecli xlsx query            # Query selector syntax
```
