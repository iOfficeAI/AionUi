---
name: officecli
description: Create, analyze, proofread, and modify Office documents (.docx, .xlsx, .pptx) using the officecli CLI tool. Use when the user wants to create, inspect, check formatting, find issues, add charts, or modify Office documents.
---

# officecli

AI-friendly CLI for .docx, .xlsx, .pptx. Single binary, no dependencies, no Office installation needed.

## Install

If `officecli` is not installed:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
```

Verify with `officecli --version`. If still not found after install, open a new terminal.

---

## Strategy

**L1 (read) → L2 (DOM edit) → L3 (raw XML)**. Always prefer higher layers. Add `--json` for structured output.

---

## Help System (IMPORTANT)

**When unsure about property names, value formats, or command syntax, ALWAYS run help instead of guessing.** One help query beats guess-fail-retry loops.

`officecli help` ≡ `officecli --help`, and `officecli <cmd> --help` ≡ `officecli help <cmd>` — same content.

```bash
officecli help                                  # All commands + global options + schema entry points
officecli help docx                             # List all docx elements
officecli help docx paragraph                   # Full schema: properties, aliases, examples, readbacks
officecli help docx set paragraph               # Verb-filtered: only props usable with `set`
officecli help docx paragraph --json            # Structured schema (machine-readable)
```

Format aliases: `word`→`docx`, `excel`→`xlsx`, `ppt`/`powerpoint`→`pptx`. Verbs: `add`, `set`, `get`, `query`, `remove`. MCP exposes the same schema via `{"command":"help","format":"docx","type":"paragraph"}`.

---

## Performance: Resident Mode

**Every command auto-starts a resident on first access** (60s idle timeout) — file-lock conflicts are automatically avoided. Explicit `open`/`close` is still recommended for longer sessions (12min idle):

```bash
officecli open report.docx       # explicitly keep in memory
officecli set report.docx ...    # no file I/O overhead
officecli close report.docx      # save and release
```

Opt out of auto-start: `OFFICECLI_NO_AUTO_RESIDENT=1`.

---

## Quick Start

**PPT:**

```bash
officecli create slides.pptx
officecli add slides.pptx / --type slide --prop title="Q4 Report" --prop background=1A1A2E
officecli add slides.pptx '/slide[1]' --type shape --prop text="Revenue grew 25%" --prop x=2cm --prop y=5cm --prop font=Arial --prop size=24 --prop color=FFFFFF
```

**Word:**

```bash
officecli create report.docx
officecli add report.docx /body --type paragraph --prop text="Executive Summary" --prop style=Heading1
officecli add report.docx /body --type paragraph --prop text="Revenue increased by 25% year-over-year."
```

**Excel:**

```bash
officecli create data.xlsx
officecli set data.xlsx /Sheet1/A1 --prop value="Name" --prop bold=true
officecli set data.xlsx /Sheet1/A2 --prop value="Alice"
```

---

## L1: Create, Read & Inspect

```bash
officecli create <file>               # Create blank .docx/.xlsx/.pptx (type from extension)
officecli view <file> <mode>          # outline | stats | issues | text | annotated | html
officecli get <file> <path> --depth N # Get a node and its children [--json]
officecli query <file> <selector>     # CSS-like query
officecli validate <file>             # Validate against OpenXML schema
```

### view modes

| Mode        | Description                                                       | Useful flags                                               |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `outline`   | Document structure                                                |                                                            |
| `stats`     | Statistics (pages, words, shapes)                                 |                                                            |
| `issues`    | Formatting/content/structure problems                             | `--type format\|content\|structure`, `--limit N`           |
| `text`      | Plain text extraction                                             | `--start N --end N`, `--max-lines N`                       |
| `annotated` | Text with formatting annotations                                  |                                                            |
| `html`      | Static HTML snapshot — same renderer as `watch`, no server needed | `--browser`, `--page N` (docx), `--start N --end N` (pptx) |

Use `view html` for one-shot snapshots (CI artifacts, archival, diffing); use `watch` when you need live refresh or browser-side click-to-select.

### get

Any XML path via element localName. Use `--depth N` to expand children. Add `--json` for structured output. Default text output is grep-friendly: `path (type) "text" key=val key=val ...`

```bash
officecli get report.docx '/body/p[3]' --depth 2 --json
officecli get slides.pptx '/slide[1]' --depth 1          # list all shapes on slide 1
officecli get data.xlsx '/Sheet1/B2' --json
```

### Stable ID Addressing

Elements with stable IDs return `@attr=value` paths instead of positional indices. Prefer these in multi-step workflows — positional indices shift on insert/delete, stable IDs do not.

```
/slide[1]/shape[@id=550950021]                    # PPT shape
/slide[1]/table[@id=1388430425]/tr[1]/tc[2]       # PPT table
/body/p[@paraId=1A2B3C4D]                         # Word paragraph
/comments/comment[@commentId=1]                    # Word comment
```

PPT also accepts `@name=` (e.g. `shape[@name=Title 1]`), with morph `!!` prefix awareness. Elements without stable IDs (slide, run, tr/tc, row) fall back to positional indices.

### query

CSS-like selectors: `[attr=value]`, `[attr!=value]`, `[attr~=text]`, `[attr>=value]`, `[attr<=value]`, `:contains("text")`, `:empty`, `:has(formula)`, `:no-alt`.

```bash
officecli query report.docx 'paragraph[style=Normal] > run[font!=Arial]'
officecli query slides.pptx 'shape[fill=FF0000]'
```

For large documents, use `--max-lines` to limit output.

---

## Watch & Interactive Selection

Live HTML preview that auto-refreshes on every file change. Browsers can click / shift-click / box-drag to select shapes; the CLI can read the current browser selection and act on it.

```bash
officecli watch <file> [--port N]      # Start preview server (default port 18080)
officecli unwatch <file>               # Stop
officecli goto <file> <path>           # Scroll watching browser(s) to element (docx: p / table / tr / tc)
```

Open the printed `http://localhost:N` URL. Click to select; shift/cmd/ctrl+click to multi-select; drag from empty space to box-select. PPT/Word use blue outline; Excel uses native-style green selection (double-click cell to edit inline; drag a chart to reposition).

### `get <file> selected` — read what the user clicked

```bash
officecli get <file> selected [--json]
```

Returns DocumentNodes for whatever is currently selected. Empty result if nothing selected. Exit code != 0 if no watch is running.

```bash
# User clicks shapes in the browser, then asks "make these red"
PATHS=$(officecli get deck.pptx selected --json | jq -r '.data.Results[].path')
for p in $PATHS; do officecli set deck.pptx "$p" --prop fill=FF0000; done
```

### Key properties

- **Selection survives file edits.** Paths use stable `@id=` form.
- **All connected browsers share one selection.** Last-write-wins.
- **Same-file single-watch.** A given file can have only one watch process at a time.
- **Group shapes select as a whole.** Drilling into individual children of a group is not supported in v1.
- **Coverage:** `.pptx` shapes/pictures/tables/charts/connectors/groups; `.docx` top-level paragraphs and tables. Inherited layout/master decorations and Word nested elements (table cells, run-level) are not addressable. **`.xlsx` does not emit `data-path`** — `mark`/`selection` on xlsx always resolve `stale=true` (v2 candidate).

### Marks — edit proposals waiting for review

Use `mark` when changes need human review BEFORE they hit the file. Marks live in the watch process only; a separate `set` pipeline applies accepted ones. For one-shot changes use `set` directly; for permanent file annotations use `add --type comment` (Word native).

```bash
officecli mark <file> <path> [--prop find=... color=... note=... tofix=... regex=true] [--json]
officecli unmark <file> [--path <p> | --all] [--json]
officecli get-marks <file> [--json]
```

Props: `find` (literal or regex when `regex=true`; raw form `find='r"[abc]"'`), `color` (hex / `rgb(...)` / 22 named whitelist), `note`, `tofix` (drives apply pipeline). **Path** must be `data-path` format from watch HTML — see subskills for full pipeline.

---

## L2: DOM Operations

### set — modify properties

```bash
officecli set <file> <path> --prop key=value [--prop ...]
```

**Any XML attribute is settable** via element path (found via `get --depth N`) — even attributes not currently present. Without `find=`, `set` applies format to the entire element.

**Value formats:**

| Type       | Format                                    | Examples                                                         |
| ---------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Colors     | Hex (with/without `#`), named, RGB, theme | `FF0000`, `#FF0000`, `red`, `rgb(255,0,0)`, `accent1`..`accent6` |
| Spacing    | Unit-qualified                            | `12pt`, `0.5cm`, `1.5x`, `150%`                                  |
| Dimensions | EMU or suffixed                           | `914400`, `2.54cm`, `1in`, `72pt`, `96px`                        |

**Dotted-attr aliases** — `font.<attr>` forms accepted on shape/run/paragraph/table/row/cell/section/styles, e.g. `--prop font.color=red --prop font.bold=true --prop font.size=14pt`. Run `officecli help <fmt> <element>` for the full list.

### find — format or replace matched text

Use `find=` with `set` to target specific text for formatting or replacement. Format props are separate `--prop` flags — do NOT nest them.

```bash
# Format matched text (auto-splits runs)
officecli set doc.docx '/body/p[1]' --prop find=weather --prop bold=true --prop color=red

# Regex matching
officecli set doc.docx '/body/p[1]' --prop 'find=\d+%' --prop regex=true --prop color=red

# Replace text (use `/` for whole-document scope)
officecli set doc.docx / --prop find=draft --prop replace=final

# PPT — same syntax, different paths
officecli set slides.pptx / --prop find=draft --prop replace=final
```

**Path controls search scope:** `/` = whole document, `/body/p[1]` or `/slide[N]/shape[M]` = specific element, `/header[1]` / `/footer[1]` = headers/footers.

**Notes:**

- Case-sensitive by default. Case-insensitive: `--prop 'find=(?i)error' --prop regex=true`
- Matches work across run boundaries
- No match = silent success. `--json` includes `"matched": N`
- **Excel:** only `find` + `replace` supported (no find + format props)

### add — add elements or clone

```bash
officecli add <file> <parent> --type <type> [--prop ...]
officecli add <file> <parent> --type <type> --after <path> [--prop ...]   # insert after anchor
officecli add <file> <parent> --type <type> --before <path> [--prop ...]  # insert before anchor
officecli add <file> <parent> --type <type> --index N [--prop ...]        # 0-based position (legacy)
officecli add <file> <parent> --from <path>                               # clone existing element
```

`--after`, `--before`, `--index` are mutually exclusive. No position flag = append to end.

**Element types (with aliases):**

| Format   | Types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pptx** | slide, shape (textbox), picture (image/img — SVG supported), chart, table, row (tr), connector (connection/line), group, video (audio/media), equation (formula/math), notes, paragraph (para), run, zoom (slidezoom), ole (oleobject/object/embed), placeholder (phType=title/body/subtitle/footer/...)                                                                                                                                                                                                                                                                               |
| **docx** | paragraph (para), run, table, row (tr), cell (td), image (picture/img — SVG supported), header, footer, section, bookmark, comment, footnote, endnote, formfield (text/checkbox/dropdown), sdt (contentcontrol), chart, equation, field (28 types incl. mergefield/ref/seq/styleref/docproperty/if), hyperlink, style, toc, watermark, break (pagebreak/columnbreak), ole, **num / abstractNum / lvl** (numbering/list system), **tab** (paragraph or paragraph/table style tab stops). Document protection: `set / --prop protection=forms\|readOnly\|comments\|trackedChanges\|none` |
| **xlsx** | sheet, row, cell, chart (incl. pareto with auto-sort + cumulative-%), image (picture — SVG supported), comment, table (listobject), namedrange (definedname), pivottable (pivot, supports calculatedField), sparkline, validation (datavalidation), autofilter, shape, textbox, databar/colorscale/iconset/formulacf/cellIs/topN/aboveAverage (conditional formatting), ole, csv (tsv). `value="=SUM(...)"` auto-detects as formula. Formulas auto-evaluated on write (150+ functions). Chart/picture/shape/slicer accept `anchor=A1:E10`.                                             |

### Pivot tables (xlsx)

```bash
officecli add data.xlsx /Sheet1 --type pivottable \
  --prop source="Sheet1!A1:E100" --prop rows=Region,Category \
  --prop cols=Year --prop values="Sales:sum,Qty:count" \
  --prop grandTotals=rows --prop subtotals=off --prop sort=asc
```

Key props: `rows`, `cols`, `values` (Field:func[:showDataAs]), `filters`, `source`, `position`, `layout` (compact/outline/tabular), `repeatLabels`, `blankRows`, `aggregate`, `showDataAs` (percent_of_total/row/col, running_total), `grandTotals`, `subtotals`, `sort`. Aggregators: sum, count, average, max, min, product, stdDev, stdDevp, var, varp, countNums. Date columns auto-group. Run `officecli help xlsx pivottable` for full schema.

### Document-level properties (all formats)

```bash
officecli set doc.docx / --prop docDefaults.font=Arial --prop docDefaults.fontSize=11pt
officecli set doc.docx / --prop protection=forms --prop evenAndOddHeaders=true
officecli set data.xlsx / --prop calc.mode=manual --prop calc.refMode=r1c1
officecli set slides.pptx / --prop defaultFont=Arial --prop show.loop=true --prop print.what=handouts
```

Run `officecli help <format> /` for all document-level properties (docDefaults, docGrid, CJK spacing, calc, print, show, theme, extended).

### Sort (xlsx)

```bash
officecli set data.xlsx /Sheet1 --prop sort="C desc" --prop sortHeader=true
officecli set data.xlsx '/Sheet1/A1:D100' --prop sort="A asc" --prop sortHeader=true
```

Format: `COL DIR[, COL DIR ...]`. Rejects ranges with merged cells or formulas. Sidecar metadata (hyperlinks, comments, conditional formatting, drawings) follows rows automatically.

### Text-anchored insert (`--after find:X` / `--before find:X`)

Locate an insertion point by text match within a paragraph. Inline types (run, picture, hyperlink) insert within the paragraph; block types (table, paragraph) auto-split it. PPT only supports inline.

```bash
# Word: inline run after matched text
officecli add doc.docx '/body/p[1]' --type run --after find:weather --prop text=" (sunny)"

# Word: block table after matched text (auto-splits paragraph)
officecli add doc.docx '/body/p[1]' --type table --after "find:First sentence." --prop rows=2 --prop cols=2
```

### Clone

`officecli add <file> / --from '/slide[1]'` — copies with all cross-part relationships.

### move, swap, remove

```bash
officecli move <file> <path> [--to <parent>] [--index N] [--after <path>] [--before <path>]
officecli swap <file> <path1> <path2>
officecli remove <file> '/body/p[4]'
```

When using `--after` or `--before`, `--to` can be omitted — the target container is inferred from the anchor.

### batch — multiple operations in one save cycle

Stops on first error by default. Use `--force` to continue.

```bash
echo '[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Name","bold":"true"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Score","bold":"true"}}
]' | officecli batch data.xlsx --json

officecli batch data.xlsx --commands '[{"op":"set","path":"/Sheet1/A1","props":{"value":"Done"}}]' --json
officecli batch data.xlsx --input updates.json --force --json
```

Supports: `add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `view`, `raw`, `raw-set`, `validate`. Fields: `command` (or `op`), `path`, `parent`, `type`, `from`, `to`, `index`, `after`, `before`, `props`, `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

---

## L3: Raw XML

Use when L2 cannot express what you need. No xmlns declarations needed — prefixes auto-registered.

```bash
officecli raw <file> <part>                          # view raw XML
officecli raw-set <file> <part> --xpath "..." --action replace --xml '<w:p>...</w:p>'
officecli add-part <file> <parent>                   # create new document part (returns rId)
```

`raw-set` actions: `append`, `prepend`, `insertbefore`, `insertafter`, `replace`, `remove`, `setattr`. Run `officecli help <format> raw` for available parts.

---

## Common Pitfalls

| Pitfall                          | Correct Approach                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `--name "foo"`                   | Use `--prop name="foo"` — all attributes go through `--prop`                                 |
| Unquoted `[N]` paths in zsh/bash | Always quote: `'/slide[1]'` or `"/slide[1]"` (shell glob-expands brackets)                   |
| PPT `shape[1]` for content       | `shape[1]` is typically the title placeholder. Use `shape[2]+` for content shapes            |
| `/shape[myname]`                 | Name indexing not supported. Use numeric index or `@name=` (PPT only)                        |
| Guessing property names          | Run `officecli help <format> <element>` to see exact names                                   |
| Modifying an open file           | Close the file in PowerPoint/WPS first                                                       |
| `\n` in shell strings            | Use `\\n` for newlines in `--prop text="..."`                                                |
| `$` in shell text                | `--prop text="$15M"` strips `$15`. Use single quotes: `--prop text='$15M'`, or heredoc batch |

---

## Specialized Skills

For complex scenarios, load the dedicated skill from `skills/<skill-name>/SKILL.md`:

| Skill                       | Scope                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `officecli-docx`            | Word documents — reports, letters, memos                     |
| `officecli-academic-paper`  | Academic papers with TOC, equations, footnotes, bibliography |
| `officecli-pptx`            | Presentations — general slide decks                          |
| `officecli-pitch-deck`      | Investor/product/sales decks with charts and callouts        |
| `morph-ppt`                 | Morph-animated cinematic presentations                       |
| `morph-ppt-3d`              | 3D Morph effects (camera, depth)                             |
| `officecli-xlsx`            | Excel — workbooks, formulas, pivots                          |
| `officecli-financial-model` | Financial models, scenarios, projections                     |
| `officecli-data-dashboard`  | CSV/tabular data → Excel dashboards with charts, sparklines  |

---

## Notes

- Paths are **1-based** (XPath convention): `'/body/p[3]'` = third paragraph
- `--index` is **0-based** (array convention): `--index 0` = first position
- After modifications, verify with `validate` and/or `view issues`
- **When unsure**, run `officecli help <format> <element>` instead of guessing
