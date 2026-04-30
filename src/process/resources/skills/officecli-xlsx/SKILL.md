---
# officecli: v1.0.63
name: officecli-xlsx
description: "Use this skill any time a .xlsx file is involved -- as input, output, or both. This includes: creating spreadsheets, financial models, dashboards, or trackers; reading, parsing, or extracting data from any .xlsx file; editing, modifying, or updating existing workbooks; working with formulas, charts, pivot tables, or templates; importing CSV/TSV data into Excel format. Trigger whenever the user mentions 'spreadsheet', 'workbook', 'Excel', 'financial model', 'tracker', 'dashboard', or references a .xlsx/.csv filename."
---

# OfficeCLI XLSX Skill

## BEFORE YOU START

**Install check.** If `officecli --version` fails:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
```

If still not found, open a new terminal, then `officecli --version` should report `1.0.63`.

**Shell quoting (zsh / bash).** Excel paths contain `[]`, and number formats contain `$`. Both are shell metacharacters. Rules:

- ALWAYS quote element paths: `"/Sheet1/row[1]"`, not `/Sheet1/row[1]`.
- Use **single quotes** for any prop value containing `$`: `numFmt='$#,##0'`.
- For formulas with cross-sheet `!` references, use `batch` with a `<<'EOF'` heredoc (see Known Issues).
- NEVER hand-write `\$`, `\t`, `\n` inside executable examples. The CLI does not interpret backslash escapes; they will land in your file as literal characters.

**Incremental execution.** Run commands one at a time and read each exit code. `officecli` mutates the file on every call; a 50-command script that fails at command 3 will cascade silently. One command → check output → continue.

## ⚠️ Help-First Rule

**This skill teaches what good xlsx looks like, not every command flag. When a property name, enum value, or alias is uncertain, consult help BEFORE guessing.**

```bash
officecli help xlsx                         # List all xlsx elements
officecli help xlsx <element>               # Full element schema (e.g. pivottable, chart, cf)
officecli help xlsx <verb> <element>        # Verb-scoped (e.g. add chart, set cell)
officecli help xlsx <element> --json        # Machine-readable schema
```

Help is pinned to the installed CLI version (v1.0.63). When this skill and help disagree, **help is authoritative**.

## Requirements for Outputs

Before reaching for a command, know what a good xlsx looks like. These are the deliverable standards every workbook MUST meet.

### All Excel files

**Zero formula errors.** Every delivered workbook MUST have ZERO `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`. No exceptions — guard denominators with `IFERROR` or `IF(x=0,...)`.

**Formulas, not hardcoded values.** If a number can be computed from other cells, it is a formula. Hardcoding `5000` where `=SUM(B2:B9)` belongs breaks the contract that the workbook stays live when inputs change. This is the single most important rule in this skill.

**Professional font.** Use one consistent, professional font across the workbook (Arial / Calibri / Times New Roman). Don't mix four fonts because one sheet came from CSV.

**Explicit widths.** There is no auto-fit. Any column the user will read MUST have `width` set — default 8.43 chars clips everything. Sensible starts: labels 20-25, numbers 12-15, dates 12, short codes 8-10.

**Preserve existing templates.** When editing a file that already has a look, match it. Existing conventions override these guidelines.

### Visual delivery floor (applies to EVERY workbook)

Before you declare done, open `officecli view "$FILE" html --browser` and confirm all of these:

- **No `###` in any cell.** `###` means a column is too narrow for its widest value. Every column the user reads needs an explicit `width`. `###` in a delivered file is unfinished work, never "a small visual nit".
- **No truncated titles.** Sheet titles, section headers, long labels must fit. Widen the column or apply `wrapText=true` on the cell.
- **No placeholder tokens rendered as data.** `$fy$24`, `{var}`, `<TODO>`, `xxxx` must never appear in a cell, chart title, series name, or legend. These are build-time tokens that escaped replacement.
- **Pie / doughnut slices have distinct fill colors.** If the slices render same-colored, switch to `bar` / `column` or set `colors=...` explicitly.
- **No empty trailing pages / empty chart anchors.** `anchor=D2:J18` over empty source cells looks like a broken chart.

If any of the above fails, STOP and fix before declaring done.

### Financial models only — skip this section if you are building a template, tracker, CSV import, or operational sheet

Scope: budgets, forecasts, 3-statement models, valuation, any `$`-heavy analytical workbook. A customer-support tracker or onboarding template does not need this section.

**Color coding — industry standard.** Four core colors used as a language, not decoration. A reviewer should tell what a cell IS by color: blue = hardcoded input, black = formula, green = cross-sheet link, yellow fill = assumption needing review. (See a dedicated financial-model skill for red external links, multi-scenario conventions, or audit colors.)

| Color                | Role                                   | Example             |
| -------------------- | -------------------------------------- | ------------------- |
| Blue text `0000FF`   | Hardcoded inputs, scenario variables   | `font.color=0000FF` |
| Black text `000000`  | ALL formulas and calculations          | default             |
| Green text `008000`  | Cross-sheet links inside this workbook | `font.color=008000` |
| Yellow fill `FFFF00` | Key assumptions needing review         | `fill=FFFF00`       |

**Number formatting — standards, not preferences.**

- **Years** are text, not numbers. Format `2026` not `2,026` — use `numFmt="@"` or set `type=string`.
- **Currency** carries its unit in the header (`Revenue ($mm)`), not in every cell.
- **Zeros display as `-`**, not `0`. Use `$#,##0;($#,##0);"-"`.
- **Percentages** default to one decimal: `0.0%`.
- **Negatives use parentheses**: `(1,234)` not `-1,234`.

**Assumptions live in cells, not inside formulas.** `=B5*(1+$B$6)` is correct; `=B5*1.05` is a bug. Document each blue input with an adjacent "Source: ..." cell or comment.

## Common Workflow

Six steps. Every non-trivial build follows this shape.

1. **Choose the mode.** Always use `officecli open <file>` at the start and `officecli close <file>` at the end. Resident mode is the default, not an optimization — it avoids re-parsing the file on every command. For many cells, use `batch`: **≤ 50 ops/block recommended; pure value-set batches run fine at 80+ ops (Tester verified 82 × 80-op chunks, 0 failures). Keep ≤ 12 only for mixed formula + resident scenarios**.
2. **Create or load.** `officecli create foo.xlsx` (new) or `officecli view foo.xlsx outline` (existing — get the lay of the land first).
3. **Build incrementally.** One command, read the output, continue. After any structural op (new sheet, chart, named range, pivot), run `get` on it to confirm shape before stacking more on top.
4. **Format.** Column widths, number formats, freeze panes, tab colors, header fills. Formatting is not optional polish — per "Requirements for Outputs" it is part of the deliverable.
5. **Close, then reckon with the cache.** `officecli close <file>` writes to disk. Newly-added formulas ship without cached values; when a human opens the file in a spreadsheet app, the app recalculates and populates them. **But your downstream `INDEX/MATCH`, `SUMPRODUCT`, or any formula that references an upstream formula will cache whatever the upstream cached at write-time — often `0` or a stale value — and that cached lie survives into non-recalculating readers.** After any multi-formula build involving array formulas (`SUMPRODUCT`, `SUMIFS` with dynamic criteria) or cross-sheet chains, **re-touch every downstream cell** (run `set` again with the same formula) so the engine recomputes its cache from the freshly-cached upstream. Then `officecli get` a few downstream cells and eyeball that their `cachedValue=` is plausible. **Array-formula fallback:** for `SUMPRODUCT(1/COUNTIF(range, range))` distinct-count patterns, the CLI engine treats the inner division as scalar and caches `1/N` (e.g. `0.001543`) rather than the true distinct count. Re-touching won't fix it. **Fallback: hardcode the correct value + an adjacent comment `"hardcoded distinct count; update if Data rows change"`, and tell the reader at delivery**. Better than shipping a cached lie. Do NOT run `validate` while a resident is open — it reports spurious drawing errors.
6. **QA — assume there are problems.** See the QA section. You are not done when your last command exited 0; you are done after one fix-and-verify cycle finds zero new issues.

## Quick Start

Minimal viable xlsx: 3 months of revenue + a total formula + column widths + a currency format. Adapt, don't copy-paste — your file, your data.

```bash
officecli create revenue.xlsx
officecli open revenue.xlsx
officecli set revenue.xlsx /Sheet1/A1 --prop value=Month --prop bold=true
officecli set revenue.xlsx /Sheet1/B1 --prop value=Revenue --prop bold=true
officecli set revenue.xlsx /Sheet1/A2 --prop value=Jan
officecli set revenue.xlsx /Sheet1/A3 --prop value=Feb
officecli set revenue.xlsx /Sheet1/A4 --prop value=Mar
officecli set revenue.xlsx /Sheet1/B2 --prop value=42000 --prop numFmt='$#,##0'
officecli set revenue.xlsx /Sheet1/B3 --prop value=45000 --prop numFmt='$#,##0'
officecli set revenue.xlsx /Sheet1/B4 --prop value=48000 --prop numFmt='$#,##0'
officecli set revenue.xlsx /Sheet1/A5 --prop value=Total --prop bold=true
officecli set revenue.xlsx /Sheet1/B5 --prop formula="SUM(B2:B4)" --prop bold=true --prop numFmt='$#,##0'
officecli set revenue.xlsx "/Sheet1/col[A]" --prop width=12
officecli set revenue.xlsx "/Sheet1/col[B]" --prop width=15
officecli close revenue.xlsx
officecli validate revenue.xlsx
```

Verified: `validate` returns `no errors found`, `B5` resolves to `135000`. This is the shape of every build: open → set cells/formulas → format → close → validate.

## CSV / bulk import (no native `import` command)

There is no `officecli import csv`. Pattern: read the CSV in Python, emit a batch JSON, pipe via heredoc. Recipe for 600-6000+ cells:

```python
# gen_batch.py — produces batch chunks of 80 value-set ops each
import csv, json
ops = []
with open("data.csv") as f:
    reader = csv.reader(f)
    for r, row in enumerate(reader, start=1):
        for c, val in enumerate(row):
            col = chr(ord('A') + c)
            ops.append({"command":"set","path":f"/Data/{col}{r}",
                        "props":{"value": val}})
for i in range(0, len(ops), 80):
    print(json.dumps(ops[i:i+80]))
```

```bash
python gen_batch.py | while IFS= read -r chunk; do
  printf '%s\n' "$chunk" | officecli batch data.xlsx
done
```

Outcome: 648-row retail CSV (6490 cells) loads in ~30s, zero failures. Tune: start at 80 ops/chunk, drop to 40 if any chunk fails. Numeric type inference and formulas come later via targeted `set` — batch in this recipe is pure value injection.

## Reading & Analysis

Start wide, then narrow. `outline` first tells you what sheets exist and where the data is; jump into `view` / `get` / `query` only once you know where to look.

**Open the rendered workbook to eyeball your own work.**

- `officecli view $FILE html --browser` opens the workbook as a browser tab. Each sheet is addressable, charts render inline. Catches `###`, placeholder leakage, pivot layout, row-height clipping.
- `officecli watch $FILE` keeps the preview live as you iterate (optional).
  Use this as your **first visual check after a batch of edits** — fix at source.

**Orient.** Sheets, dimensions, formula counts.

```bash
officecli view data.xlsx outline
```

**Extract.** Plain text dump for content QA or LLM context; scope with `--start` / `--end` / `--cols` for big files.

```bash
officecli view data.xlsx text --start 1 --end 50 --cols A,B,C
```

Other `view` modes worth knowing: `annotated` (cell values + types/formulas + warnings), `stats` (numeric summaries), `issues` (broken formulas, empty sheets, missing refs).

**Inspect one element.** Use XPath-style paths. Always quote — shells glob `[N]`.

```bash
officecli get data.xlsx "/Sheet1/A1"            # one cell
officecli get data.xlsx "/Sheet1/A1:D10"        # range
officecli get data.xlsx "/Sheet1/chart[1]"      # chart
officecli get data.xlsx "/Sheet1/table[1]"      # ListObject
officecli get data.xlsx "/namedrange[1]"        # workbook-level named range
```

Add `--depth N` to expand children; add `--json` for machine output. Full element list: `officecli help xlsx`.

**Query across the workbook.** CSS-like selectors. Use for systematic checks (formula coverage, error cells, empty headers) rather than hand-walking.

```bash
officecli query data.xlsx 'cell:has(formula)'       # every formula cell
officecli query data.xlsx 'cell:contains("#REF!")'  # broken references
officecli query data.xlsx 'cell[type=Number]'       # typed filter
officecli query data.xlsx 'Sheet1!B[value!=0]'      # sheet-scoped
```

Operators: `=`, `!=`, `~=` (contains), `>=`, `<=`, `[attr]` (exists).

**Merge cells shortcut.** `officecli query $FILE merge` or `mergedrange` — both are aliases for `mergeCell` (1.0.60+). Returns every merged range in the workbook without hand-walking `<mergeCell>` entries.

**When the data is big enough that a row-walk is useless**, reach for Excel's own analytical elements:

- Build a **pivot table** with `officecli add` (`--type pivottable`) to group/aggregate without writing 20 SUMIFs. Attach a **slicer** (`--type slicer`) to give the reader a filter UI.
- Drop a **sparkline** (`--type sparkline`) in a row to show per-row trends — cheaper than one line chart per row and they print inline. `type` is a strict enum: **`line | column | stacked`** (plus aliases `winloss` / `win-loss` → `stacked`). Invalid `type=` values hard-fail on 1.0.58+ — no silent fallback to `line` anymore.
- Run `officecli help xlsx pivottable`, `officecli help xlsx slicer`, `officecli help xlsx sparkline` for the exact prop names.

## Creating & Editing

Ninety percent of a build is cells, formulas, formatting, and one or two charts. The verbs: `add` (new element), `set` (change a prop), `remove`, `move`, `swap`, `batch`.

### Cells and formulas

Set a value and its format in one call. Never write `=` at the start of a formula — the CLI strips it.

```bash
officecli set data.xlsx /Sheet1/B5 --prop formula="SUM(B2:B4)" --prop numFmt='$#,##0'
officecli set data.xlsx /Sheet1/C5 --prop formula="B5/A5" --prop numFmt="0.0%"
```

Structural properties (width, height, freeze, tabColor) live on row / col / sheet nodes:

```bash
officecli set data.xlsx "/Sheet1/col[A]" --prop width=20
officecli set data.xlsx "/Sheet1/row[1]" --prop height=22
officecli set data.xlsx "/Sheet1" --prop freeze=A2 --prop tabColor=1F4E79
```

### Named ranges

Prefer named ranges over `$B$6` in formulas. They self-document (`GrowthRate` beats `$B$6`) and they let you move the assumption cell without breaking formulas. Because `ref` values contain both `!` and `$`, add them through a batch heredoc:

```bash
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"GrowthRate","ref":"Sheet1!$B$6"}}
]
EOF
```

See `officecli help xlsx namedrange` for the full schema.

**Batch JSON does NOT accept shell aliases.** Inside batch `props`, always use the full dotted name — `"font.color": "FF0000"`, `"font.size": 14`, never `"color": "FF0000"` (ambiguous: text vs fill). On a bare cell, even the shell form is rejected: `--prop color=1F4E79` errors with `ambiguous in cell context — use 'font.color' (text) or 'fill' (bg)`. Rule: in any batch JSON or cell prop, write `font.color` / `fill` explicitly. `parent` should be `"/"` for workbook-level elements and `"/SheetName"` for sheet-scoped; empty string is not equivalent.

### Charts

Chart types live under `officecli help xlsx chart` — the enum is long (20+). Pick the right one for the message: column for category comparison, line for time series, pie only when slices are self-evidently proportional, scatter for correlation. Avoid exotic types unless they answer a specific question.

**Three ways to feed chart data. Pick one per chart — mixing them at add-time is a common trap.**

| Form                  | Shape                                                                                                     | When to use                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) inline `data`     | `--prop data="Sales:100,200,300" --prop categories="Jan,Feb,Mar"`                                         | Tiny demo charts, numbers you will not edit. Source of truth lives in the chart XML, not a cell.                                                                                              |
| (b) 2D `dataRange`    | `--prop dataRange="Sheet1!A1:B4"` (first col = categories, first row = header / series name)              | Normal case. Must be **2-D** — single column fails with "Chart requires data".                                                                                                                |
| (c) dotted per-series | `--prop series1.name=Sales --prop series1.values="Sheet1!B2:B4" --prop series1.categories="Sheet1!A2:A4"` | Multi-series charts where each series points at non-contiguous ranges, or you want explicit series naming. `series1.values` alone (no `categories`) emits a chart with `1,2,3` as the x-axis. |

**The single-column trap.** `dataRange="Sheet1!B2:B13"` looks like "value column" but the engine rejects it with `Chart requires data`. Either widen the range to include the category column (`A2:B13`), or switch to form (c) with explicit `series1.categories`.

**Chart `anchor` and series are immutable after create.** `set chart[N] --prop anchor=...` is rejected (`UNSUPPORTED props: anchor`); likewise new series cannot be appended. To resize, move, or add a series: `officecli remove` the chart, then `officecli add` with the new anchor / full series list. Also note: `remove chart[1]` shifts `chart[2] → chart[1]`, and re-add **appends at the end** — to preserve chart order, remove all and rebuild in order.

**Anchor sizing.** No auto-fit. A column chart with 5-6 categories + 2 series needs roughly `A5:L22` (12 cols × 18 rows) to show all labels uncut. Narrower and X-axis labels clip; wider and the chart can split across pages on print/export. If in doubt, start narrow, preview via `view html --browser`, widen in increments. Page layout (below) is the other half of the fix.

**Chart `dataRange` — always prefix with the sheet.** Even when the chart lives on the same sheet, write `dataRange="Summary!A17:C22"`, not `A17:C22`. The sheet-less form works inconsistently; the prefixed form is 100% reliable.

officecli adds extended chart types the classic Excel object model lacks: `boxWhisker`, `waterfall`, `funnel`, `histogram`, `treemap`, `sunburst`. Use them when the data calls for them. Known-bad: `chartType=pareto` (produces invalid XML — use `column` or `boxWhisker`).

**NEVER put unreplaced template tokens in chart title / series name / legend / axis title.** `$fy$24`, `{var}`, `<TODO>`, `$VAR`, `{{placeholder}}` render **literally** in the legend — validate passes, but a CFO sees `$fy$24` where "FY2024" should be. Always bind to final text or a cell reference (`title="FY2024 Revenue"` or `series1.name="Sheet1!A1"`).

### Conditional formatting

Three common flavors, each with its own prop shape (consult `officecli help xlsx cf`):

- **Color scales**: cells shaded on a gradient by value — `type=colorscale` with `minColor` / `midColor` / `maxColor`.
- **Data bars**: in-cell bars showing magnitude — `type=databar`. ALWAYS set explicit `min` and `max`; defaults emit invalid XML (see Known Issues).
- **Formula rules**: highlight row when a condition is true — `type=formulacf` with `formula="$C2>1000"` and a fill/font.

Rule: apply CF sparingly. A workbook where every cell is colored tells the reader nothing.

### Data validation

Input cells in trackers and templates MUST carry data validation. It's cheap and it stops entire classes of downstream bugs. **Three list-source patterns** — pick based on where the allowed values live.

**(a) Inline list** — allowed values are short and fixed in the rule itself.

```bash
officecli add data.xlsx /Sheet1 --type validation \
  --prop sqref="C2:C100" --prop type=list \
  --prop formula1="Yes,No,Maybe" \
  --prop showError=true --prop errorTitle="Invalid" --prop error="Select from list"
```

**(b) Named range (preferred for cross-sheet lookups)** — allowed values live in another sheet and may grow. Define the named range first, then reference it. Use a batch heredoc because `ref` contains `!` and `$`:

```bash
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"StatusList","ref":"Lookups!$A$2:$A$4"}},
  {"command":"add","parent":"/Sheet1","type":"validation","props":{"sqref":"B2:B100","type":"list","formula1":"=StatusList"}}
]
EOF
```

**(c) Direct cross-sheet range** — no named range, raw `Lookups!$A$2:$A$4` inside `formula1`. Also needs a batch heredoc to keep `!` and `$` intact:

```bash
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"add","parent":"/Sheet1","type":"validation","props":{"sqref":"C2:C100","type":"list","formula1":"Lookups!$A$2:$A$4"}}
]
EOF
```

If you write the cross-sheet variant as `--prop formula1=...` on the shell, the `!` gets shell-mangled into `\!` and the dropdown will silently fall back to no list. Verify with `officecli get data.xlsx /Sheet1/validation[N]` — `formula1=` must show a plain `!`, no backslash.

Other common `type` values: `decimal`, `whole`, `date`, `textLength`, `custom`. See `officecli help xlsx validation` for operators and the full prop list.

### Other elements (one-liners)

- **Tables** (ListObjects) — `add --type table` with a range; gives auto-filter + structured refs. `officecli help xlsx table`.
- **Comments** — `add --type comment`; use for documenting hardcoded assumptions. `officecli help xlsx comment`.
- **Sheet reordering** — `officecli move`, not `swap`. `swap` only works on row/cell paths.

## Chart Axis-by-Role

Editing a chart axis in place is cheaper than rebuilding the chart. Address axes by **role** (`value` = Y, `category` = X), not by index — the XML order isn't stable.

```bash
officecli get data.xlsx "/Sheet1/chart[1]/axis[@role=value]"
officecli set data.xlsx "/Sheet1/chart[1]/axis[@role=value]" --prop min=0 --prop max=100000
officecli set data.xlsx "/Sheet1/chart[1]/axis[@role=category]" --prop title="Month"
```

Safe props: `title`, `min`, `max`, `majorGridlines`, `visible`. Do NOT use `labelRotation` — it emits invalid XML today (see Known Issues).

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first workbook is almost never correct. Treat QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you were not looking hard enough. The formulas look fine **until** you check two of them against source cells.

### Minimum cycle before "done"

1. `officecli view data.xlsx issues` — empty sheets, broken formulas, missing refs.
2. `officecli view data.xlsx annotated` (sample ranges) — values + types + warnings.
3. For every Excel error type, query it:
   ```bash
   officecli query data.xlsx 'cell:contains("#REF!")'
   officecli query data.xlsx 'cell:contains("#DIV/0!")'
   officecli query data.xlsx 'cell:contains("#VALUE!")'
   officecli query data.xlsx 'cell:contains("#NAME?")'
   officecli query data.xlsx 'cell:contains("#N/A")'
   ```
4. `officecli validate data.xlsx` — close any resident first (see Known Issues).
5. **Visual pass — walk every sheet in the browser preview.** `officecli view "$FILE" html --browser` renders each sheet, charts inline. Scan for `###`, truncated titles, placeholder tokens (`$fy$24`, `{var}`, `<TODO>`), sliced charts, white-slice pie charts, empty chart anchors — **STOP and fix before declaring done**. "validate pass" is not delivery; "the browser preview looks like a real workbook" is delivery.
6. **Print / export layout fix (wide tables / multi-chart sheets).** When a sheet holds a chart or a wide table and the user will print or export it, set per-sheet page layout so it fits on one page:
   ```bash
   officecli set data.xlsx "/Summary" --prop orientation=landscape --prop fitToPage=true
   ```
   Outcome: each sheet's print/export layout is one page with no mid-chart splits. Apply to every sheet that holds a chart or a > 8-column table.
7. If anything failed, fix, then **rerun the full cycle**. One fix commonly creates another problem.

`officecli view issues` + `view html --browser` are the structural QA pair: `issues` catches broken formulas and empty sheets; `html --browser` catches `###`, truncation, and token leakage. Chart fill colors / theme tints can vary across viewers — spot-check in the user's target viewer when color fidelity matters.

### Formula verification checklist

- [ ] Pick 2-3 formulas at random. Run `officecli get` on each. Confirm the formula string is what you intended **and** `cachedValue=` is what you expect — arithmetic in your head.
- [ ] **Cached value sanity on every summary cell.** Any cell that aggregates (COUNTA / COUNTIF / SUMPRODUCT / INDEX&MATCH) must have a plausible `cachedValue`. If a progress tracker shows `199 / 199 / 100%` on a blank template, the cache is lying — re-touch the formula via `set` (forces recompute) or manually set a correct cached value. Do NOT ship "validate passes but the numbers are fiction".
- [ ] **Spot-check one cell per numeric column.** `%` columns showing integer `0.0%` throughout means the denominator is wrong or the numerator is cached stale — investigate one cell, fix the pattern.
- [ ] Ranges include every row: off-by-one on `SUM(B2:B12)` when data goes to `B13` is the most common bug.
- [ ] Cross-sheet formulas (`Sheet1!A1`) contain no `\!`. If `officecli get` shows `Sheet1\!A1`, the `!` was shell-corrupted — delete and re-enter via batch/heredoc.
- [ ] Named ranges (`officecli get data.xlsx "/namedrange[1]"`) point at what their names claim.
- [ ] Every `/` denominator is guarded — `IFERROR(x/y, 0)` or `IF(y=0, 0, x/y)`.
- [ ] Chart data vs source cells: for every chart with inline data, spot-check data points against `officecli get` of the source cells.
- [ ] Chart title / series name / legend contain **no** unreplaced tokens (`$...$`, `{var}`, `<TODO>`). Grep the chart via `officecli get /Sheet1/chart[N]`.

### Template QA

When editing a template, check for leftover placeholders — they look like content and slip past `validate`:

```bash
officecli query data.xlsx 'cell:contains("{{")'
officecli query data.xlsx 'cell:contains("xxxx")'
officecli query data.xlsx 'cell:contains("TBD")'
```

### Fresh eyes (subagent)

xlsx has no visual preview (unlike pptx). You are reading the same cells you wrote. Spawn a subagent with the single instruction: "Open `data.xlsx`, list every problem you see — formulas, numbers that look off, formatting inconsistency, missing data." Fresh eyes find what the builder's eyes confirm.

### Honest limit

`validate` catches schema errors, not design errors. A workbook can pass `validate` with every number wrong. The checklist above — especially spot-checking formulas against source cells — is how you catch what validation can't.

## Known Issues & Pitfalls

### The cross-sheet `!` trap (short)

Shells (bash history expansion, zsh splitting) and CLI arg parsing mangle `!` in `Sheet1!A1` into `\!`. A formula containing `\!` is silently broken — it renders as literal text and references nothing.

**Fix.** Use a batch heredoc with single-quoted delimiter (`<<'EOF'`), which disables all shell expansion:

```bash
cat <<'EOF' | officecli batch data.xlsx
[{"command":"set","path":"/Summary/B2","props":{"formula":"Revenue!B13"}}]
EOF
```

**Verify.** After writing, `officecli get` the cell; `formula=` must show a plain `!` with no backslash.

### CLI bug backlog (short)

Avoid these until fixed; they produce invalid XML or silent breakage. Full details in `reports/` on the repo.

- **`chartType=pareto`** — emits empty `cx:axisId val=""`; `validate` fails after `close`. Substitute `column` or `boxWhisker`.
- **`labelRotation` on axis-by-role** — inserts bad `a:endParaRPr`. Use `title`/`min`/`max`/`majorGridlines`/`visible` only.
- **Data bar without explicit min/max** — default cfvo `val=""` is invalid. Always pass `--prop min=N --prop max=N`.
- **Line chart `showMarker` defaults to `true`** — omitting the prop is NOT enough. The default emits markers, which in some viewers render as scatter dots (no connecting line). Always pass `--prop showMarker=false` explicitly on line charts. (Older validate bug `c:marker unexpected child` appears fixed in 1.0.57+.)
- **Chart `anchor` and series are immutable after create** — to resize/move/add-series: `remove` + `add`. `remove chart[N]` shifts subsequent indices down; re-add appends at end.
- **`validate` while resident open** — reports spurious `tableParts` / `drawing` errors. Always `close` first.
- **Batch + resident** — intermittent failure (up to 1-in-3) for **mixed formula batches**. For formula batches in resident mode, stay ≤ 12 ops, check output every block, retry failed ops individually; critical cross-sheet formulas prefer individual `set` (100% reliable). Pure value-set batches (no formulas) run reliably at 50-80+ ops even in resident.
- **Conditional formatting naming asymmetry** — the element name for `--type` is `conditionalformatting`; the path suffix is `/cf[N]`. Use `officecli help xlsx conditionalformatting` for schema, `/cf[N]` for paths.
- **Sheet `position` prop on add** — help says Add processes `position`, but the prop is often ignored. Reorder with `officecli move --index` / `--after` / `--before` after creating the sheet.
- **`remove /sheet[N]` cascade guard** — 1.0.59+ rejects sheet remove/rename when the sheet is referenced by validation / conditional format / sparkline / hyperlink / named range on another sheet. Remove those dependent elements first, then remove the sheet.

### Renderer caveats (cross-viewer color fidelity)

`officecli view html --browser` is the right tool for structural QA (overflow, truncation, placeholder leakage, layout). Some chart rendering details vary across the viewer the end user opens the file in. Observed divergences:

- **Pie / doughnut fill colors may collapse to a single theme tint** in some viewers (slices look "all white" or "all one color"). The file may be fine in the user's target viewer.
- **Line chart / column chart series colors may drift** from the workbook theme in some viewers.
- **Form-control checkboxes may render as double-boxed** in some viewers.

Before calling a color or chart "broken", open the file in the user's actual target viewer. If it looks correct there, the problem is viewer rendering, not data — do not chase it. The CLI's structural checks (`###`, truncation, placeholder text, layout) remain authoritative.

### Escape layers (shell quoting is above; these are the extras)

The CLI does not interpret `\$` / `\t` / `\n` — they land as literal characters. Shell-level rules are in L25-30. Two additional layers:

- **JSON level (batch).** Standard JSON escapes — `"\n"`, `"\t"`, `"\""`. A real backslash in the final string is `"\\\\"`.
- **Excel level.** `\n` in a cell for line break → write `"\n"` **inside JSON**. In a shell-quoted prop it stays literal (Excel shows `\n` text). When in doubt, `officecli get` the cell and compare character-for-character.

### Other common pitfalls

| Pitfall                           | Fix                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--name "foo"`                    | All attrs go through `--prop`: `--prop name="foo"`                                                                                    |
| Guessing a prop name              | `officecli help xlsx <element>` — don't improvise                                                                                     |
| `--prop color=...` on a cell      | Ambiguous — use `font.color` (text) or `fill` (bg). Also applies inside batch JSON: always use full dotted names, never shell aliases |
| `#FF0000` hex colors              | Drop the `#`: `FF0000`                                                                                                                |
| `--index` vs `[N]`                | `--index` is 0-based (array); `[N]` paths are 1-based (XPath)                                                                         |
| Unquoted `[N]` in zsh/bash        | Quote every path: `"/Sheet1/row[1]"`                                                                                                  |
| Sheet name with spaces            | Quote full path: `"/My Sheet/A1"`                                                                                                     |
| Year showing as `2,026`           | `--prop type=string` or `numFmt="@"`                                                                                                  |
| Modifying a file open in Excel    | Close it in Excel first                                                                                                               |
| `swap` not reordering sheets      | `swap` is for rows/cells. Use `move --after` / `--before` / `--index` for sheets                                                      |
| Cached values missing after write | New formulas get cached values when a human opens the file; `validate` accepts them either way                                        |
