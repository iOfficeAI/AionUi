---
name: officecli
description: Create, analyze, proofread, and modify Office documents (.docx, .xlsx, .pptx) using the officecli CLI tool. Use when the user wants to create, inspect, check formatting, find issues, add charts, or modify Office documents.
---

# officecli

AI-friendly CLI for .docx, .xlsx, .pptx. Single binary, no dependencies, no Office installation needed.

## Install & Update

Same command for both install and upgrade:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
```

After installation, run `source ~/.zshrc` (macOS) or `source ~/.bashrc` (Linux) to make the `officecli` command available.

Verify: `officecli --version`

officecli auto-updates daily in the background.

---

## Strategy

**L1 (read) → L2 (DOM edit) → L3 (raw XML)**. Always prefer higher layers. Add `--json` for structured output.

---

## Help System (IMPORTANT)

**When unsure about property names, value formats, or command syntax, ALWAYS run help instead of guessing.** One help query is faster than guess-fail-retry loops.

**Three-layer navigation** — start from the deepest level you know:
```bash
officecli pptx set              # All settable elements and their properties
officecli pptx set shape        # Shape properties in detail
officecli pptx set shape.fill   # Specific property format and examples
```

Replace `pptx` with `docx` or `xlsx`. Commands: `view`, `get`, `query`, `set`, `add`, `raw`.

---

## Performance: Resident Mode

For multi-step workflows (3+ commands on the same file), use `open`/`close`:
```bash
officecli open report.docx       # keep in memory — fast subsequent commands
officecli set report.docx ...    # no file I/O overhead
officecli close report.docx      # save and release
```

---

## Quick Start

**PPT:**
```bash
officecli create slides.pptx
officecli add slides.pptx / --type slide --prop title="Q4 Report" --prop background=1A1A2E
officecli add slides.pptx '/slide[1]' --type shape --prop text="Revenue grew 25%" --prop x=2cm --prop y=5cm --prop font=Arial --prop size=24 --prop color=FFFFFF
officecli set slides.pptx '/slide[1]' --prop transition=fade --prop advanceTime=3000
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
officecli set data.xlsx /Sheet1/B1 --prop value="Score" --prop bold=true
officecli set data.xlsx /Sheet1/A2 --prop value="Alice"
officecli set data.xlsx /Sheet1/B2 --prop value=95
```

---

## L1: Create, Read & Inspect

```bash
officecli create <file>               # Create blank .docx/.xlsx/.pptx (type from extension)
officecli view <file> <mode>          # outline | stats | issues | text | annotated
officecli get <file> <path> --depth N # Get a node and its children [--json]
officecli query <file> <selector>     # CSS-like query
officecli validate <file>             # Validate against OpenXML schema
```

### view modes

| Mode | Description | Useful flags |
|------|-------------|-------------|
| `outline` | Document structure | |
| `stats` | Statistics (pages, words, shapes) | |
| `issues` | Formatting/content/structure problems | `--type format\|content\|structure`, `--limit N` |
| `text` | Plain text extraction | `--start N --end N`, `--max-lines N` |
| `annotated` | Text with formatting annotations | |

### get

Any XML path via element localName. Use `--depth N` to expand children. Add `--json` for structured output.

```bash
officecli get report.docx '/body/p[3]' --depth 2 --json
officecli get slides.pptx '/slide[1]' --depth 1          # list all shapes on slide 1
officecli get data.xlsx '/Sheet1/B2' --json
```

Run `officecli docx get` / `officecli xlsx get` / `officecli pptx get` for all available paths.

### Stable ID Addressing

Elements with stable IDs return `@attr=value` paths instead of positional indices. These paths survive insert/delete operations — use them for multi-step workflows.

**Returned path format (output):**
```
/slide[1]/shape[@id=550950021]                    # PPT shape (cNvPr.Id)
/slide[1]/shape[@id=550950021]/paragraph[1]       # child inherits parent's @id=
/slide[1]/table[@id=1388430425]/tr[1]/tc[2]       # PPT table
/body/p[@paraId=1A2B3C4D]                         # Word paragraph
/comments/comment[@commentId=1]                    # Word comment
/footnote[@footnoteId=2]                           # Word footnote
/endnote[@endnoteId=1]                             # Word endnote
/body/sdt[@sdtId=123456]                           # Word content control
```

**All formats accepted as input** — use returned paths directly for subsequent `set`/`remove`:
```bash
officecli set slides.pptx '/slide[1]/shape[@id=550950021]' --prop bold=true
officecli set slides.pptx '/slide[1]/shape[@name=Title 1]' --prop text="New"   # @name= also works (PPT)
officecli set slides.pptx '/slide[1]/shape[2]' --prop color=red                # positional still works
```

Elements without stable IDs (slide, paragraph, run, tr/tc, row) use positional indices as fallback.

**When to use stable IDs:** Prefer `@id=` / `@paraId=` paths in multi-step workflows where you add or remove elements between commands — positional indices shift, but stable IDs do not.

### query

CSS-like selectors: `[attr=value]`, `[attr!=value]`, `[attr~=text]`, `[attr>=value]`, `[attr<=value]`, `:contains("text")`, `:empty`, `:has(formula)`, `:no-alt`.

```bash
officecli query report.docx 'paragraph[style=Normal] > run[font!=Arial]'
officecli query slides.pptx 'shape[fill=FF0000]'
```

### validate

```bash
officecli validate report.docx    # Check for schema errors
officecli validate slides.pptx    # Must pass before delivery
```

**For large documents**, ALWAYS use `--max-lines` or `--start`/`--end` to limit output.

---

## L2: DOM Operations

### set — modify properties

```bash
officecli set <file> <path> --prop key=value [--prop ...]
```

**Any XML attribute is settable** via element path (found via `get --depth N`) — even attributes not currently present.

Without `find=`, `set` applies format to the entire element. To target specific text within a paragraph, use `find=` (see **find** section below).

Run `officecli <format> set` for all settable elements. Run `officecli <format> set <element>` for detail.

**Value formats:**

| Type | Format | Examples |
|------|--------|---------|
| Colors | Hex, named, RGB, theme | `FF0000`, `red`, `rgb(255,0,0)`, `accent1`..`accent6` |
| Spacing | Unit-qualified | `12pt`, `0.5cm`, `1.5x`, `150%` |
| Dimensions | EMU or suffixed | `914400`, `2.54cm`, `1in`, `72pt`, `96px` |

### find — format or replace matched text

Use `find=` with `set` to target specific text within a paragraph (or broader scope) for formatting or replacement. The matched text is automatically split into its own run(s). Add `regex=true` for regex matching. Format props are separate `--prop` flags — do NOT nest them (e.g. `--prop bold=true`, not `--prop format=bold:true`).

```bash
# Format matched text (auto-splits runs)
officecli set doc.docx '/body/p[1]' --prop find=weather --prop highlight=yellow
officecli set doc.docx '/body/p[1]' --prop find=weather --prop bold=true --prop color=red

# Regex matching
officecli set doc.docx '/body/p[1]' --prop 'find=\d+%' --prop regex=true --prop color=red

# Replace text
officecli set doc.docx / --prop find=draft --prop replace=final

# Replace + format
officecli set doc.docx '/body/p[1]' --prop find=TODO --prop replace=DONE --prop bold=true

# Bulk: color all dates red across all paragraphs
officecli set doc.docx / --prop 'find=\d{4}-\d{2}-\d{2}' --prop regex=true --prop color=red

# Replace in header
officecli set doc.docx '/header[1]' --prop find=Draft --prop replace=Final
```

**PPT find works the same way:**

```bash
# Format matched text
officecli set slides.pptx '/slide[1]/shape[1]' --prop find=weather --prop bold=true --prop color=red

# Regex
officecli set slides.pptx '/slide[1]/shape[1]' --prop 'find=\d+%' --prop regex=true --prop color=red

# Replace across all slides
officecli set slides.pptx / --prop find=draft --prop replace=final

# Replace + format
officecli set slides.pptx '/slide[1]/shape[1]' --prop find=TODO --prop replace=DONE --prop bold=true

# Replace in table
officecli set slides.pptx '/slide[1]/table[1]' --prop find=old --prop replace=new
```

Path controls search scope: `/` = all slides, `/slide[N]` = single slide, `/slide[N]/shape[M]` = single shape, `/slide[N]/table[M]` = table, `/slide[N]/notes` = notes pane.

> **Known limitation:** Notes pane find+format writes correctly, but `get` returns plain text only — run-level formatting cannot be verified via CLI.

**Behavior matrix:**

| Props | Effect |
|-------|--------|
| `find` + format props | Split runs, apply format to matched text |
| `find` + `replace` | Replace matched text |
| `find` + `replace` + format props | Replace text and apply format to new text |

- Add `regex=true` to enable regex matching: `--prop 'find=\d+%' --prop regex=true`
  - Batch JSON: `{"props":{"find":"\\d+%","regex":"true","color":"FF0000"}}`
- Path controls search scope: `/` = body only (excludes headers/footers), `/header[1]` = first header, `/footer[1]` = first footer, `/body/p[1]` = specific paragraph, etc.
- If `find=` matches nothing, the command succeeds with no changes (no error)
- `--json` output includes a `"matched": N` field indicating the number of matches found
- Matching is **case-sensitive** by default. For case-insensitive, use regex: `--prop 'find=(?i)error' --prop regex=true`
- `find:` / `find=` matches work across run boundaries — text split across multiple runs is still found

**Excel limitations:** Excel only supports `find` + `replace` (text replacement). `find` + format props (formatting matched text without replacing) is not supported in Excel — use Word or PowerPoint for that. In Excel, `find` without `replace` is treated as an unsupported property.

### add — add elements or clone

```bash
officecli add <file> <parent> --type <type> [--prop ...]
officecli add <file> <parent> --type <type> --after <path> [--prop ...]   # insert after anchor
officecli add <file> <parent> --type <type> --before <path> [--prop ...]  # insert before anchor
officecli add <file> <parent> --type <type> --index N [--prop ...]        # insert at position (legacy)
officecli add <file> <parent> --from <path>                               # clone existing element
```

**Insert position** (`--after`, `--before`, `--index` are mutually exclusive):
- `--after "p[@paraId=1A2B3C4D]"` — insert after the anchor element (short or full path)
- `--before "/body/p[@paraId=5E6F7A8B]"` — insert before the anchor element
- `--index N` — insert at 0-based position (legacy, prefer --after/--before)
- No position flag — append to end (default)

**Element types (with aliases):**

| Format | Types |
|--------|-------|
| **pptx** | slide, shape (textbox), picture (image/img), chart, table, row (tr), connector (connection/line), group, video (audio/media), equation (formula/math), notes, paragraph (para), run, zoom (slidezoom) |
| **docx** | paragraph (para), run, table, row (tr), cell (td), image (picture/img), header, footer, section, bookmark, comment, footnote, endnote, formfield, sdt (contentcontrol), chart, equation (formula/math), field, hyperlink, style, toc, watermark, break (pagebreak/columnbreak) |
| **xlsx** | sheet, row, cell, chart, image (picture), comment, table (listobject), namedrange (definedname), pivottable (pivot), sparkline, validation (datavalidation), autofilter, shape, textbox, databar/colorscale/iconset/formulacf (conditional formatting), csv (tsv) |

**Text-anchored insert** (`--after find:X` / `--before find:X`):

The `--after` and `--before` flags accept a `find:` prefix to locate an insertion point by text match within a paragraph.

```bash
# Insert run after matched text (inline, within the same paragraph)
officecli add doc.docx '/body/p[1]' --type run --after find:weather --prop text=" (sunny)"

# Insert table after matched text (block — auto-splits the paragraph)
officecli add doc.docx '/body/p[1]' --type table --after "find:First sentence." --prop rows=2 --prop cols=2

# Insert before matched text
officecli add doc.docx '/body/p[1]' --type run --before find:weather --prop text="["

```

- Inline types (run, picture, hyperlink...) insert within the paragraph
- Block types (table, paragraph) auto-split the paragraph and insert between the two halves

**PPT text-anchored insert** (inline only):

```bash
officecli add slides.pptx '/slide[1]/shape[1]' --type run --after find:weather --prop text=" (sunny)"
officecli add slides.pptx '/slide[1]/shape[1]' --type run --before find:weather --prop text="["
```

PPT only supports inline types (run) with `find:` anchors — block-type insertion is not supported.

**Clone:** `officecli add <file> / --from '/slide[1]'` — copies with all cross-part relationships.

Run `officecli <format> add` for all addable types and their properties.

### move, swap, remove

```bash
officecli move <file> <path> [--to <parent>] [--index N] [--after <path>] [--before <path>]
officecli swap <file> <path1> <path2>
officecli remove <file> '/body/p[4]'
```

When using `--after` or `--before`, `--to` can be omitted — the target container is inferred from the anchor path.

### batch — multiple operations in one save cycle

Stops on first error by default. Use `--force` to continue past errors.

```bash
# Via stdin
echo '[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Name","bold":"true"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Score","bold":"true"}}
]' | officecli batch data.xlsx --json

# Via --commands (inline, no stdin needed)
officecli batch data.xlsx --commands '[{"op":"set","path":"/Sheet1/A1","props":{"value":"Done"}}]' --json

# Via --input (file)
officecli batch data.xlsx --input updates.json --force --json
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `view`, `raw`, `raw-set`, `validate`.

Batch fields: `command` (or `op`), `path`, `parent`, `type`, `from`, `to`, `index`, `after`, `before`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

JSON output is wrapped in an envelope: `{"results": [...], "summary": {"total", "executed", "succeeded", "failed", "skipped"}}`. On error, each failed result includes the original batch item for debugging. Large outputs automatically spill to a temp file.

---

## L3: Raw XML

Use when L2 cannot express what you need. No xmlns declarations needed — prefixes auto-registered.

```bash
officecli raw <file> <part>                          # view raw XML
officecli raw-set <file> <part> --xpath "..." --action replace --xml '<w:p>...</w:p>'
officecli add-part <file> <parent>                   # create new document part (returns rId)
```

**raw-set actions:** `append`, `prepend`, `insertbefore`, `insertafter`, `replace`, `remove`, `setattr`.

Run `officecli <format> raw` for available parts per format.

---

## Common Pitfalls

| Pitfall | Correct Approach |
|---------|-----------------|
| `--name "foo"` | ❌ Use `--prop name="foo"` — all attributes go through `--prop` |
| `x=-3cm` | ❌ Negative coordinates not supported. Use `x=0cm` or `x=36cm` |
| PPT `shape[1]` for content | ❌ `shape[1]` is typically the title placeholder. Use `shape[2]` or higher for content shapes |
| `/shape[myname]` | ❌ Name indexing not supported. Use numeric index: `/shape[3]` |
| Guessing property names | ❌ Run `officecli <format> set <element>` to see exact names |
| Modifying an open file | ❌ Close the file in PowerPoint/WPS first |
| `\n` in shell strings | ❌ Use `\\n` for newlines in `--prop text="..."` |
| `officecli set f.pptx /slide[1]` | ❌ Shell glob expands brackets. Always single-quote paths: `'/slide[1]'` |

---

## Specialized Skills

This skill covers the officecli CLI basics. For complex scenarios, load the dedicated skill for better results:

| Scenario | Skill | Min Version | When to Use |
|----------|-------|:-----------:|-------------|
| **Word documents** | `officecli-docx` | v1.0.23 | Create, read, edit .docx — reports, letters, memos, proposals |
| **Academic papers** | `officecli-academic-paper` | v1.0.24 | Research papers, white papers with TOC, equations, footnotes, bibliography |
| **Presentations** | `officecli-pptx` | v1.0.23 | Create, read, edit .pptx — general slide decks |
| **Pitch decks** | `officecli-pitch-deck` | v1.0.24 | Investor decks, product launches, sales decks with charts and stat callouts |
| **Morph PPT** | `morph-ppt` | v1.0.24 | Morph-animated cinematic presentations |
| **Excel** | `officecli-xlsx` | v1.0.23 | Create, read, edit .xlsx — financial models, trackers, formulas |
| **Data dashboards** | `officecli-data-dashboard` | v1.0.24 | CSV/tabular data → Excel dashboards with KPI cards, charts, sparklines |

> **How to load:** Ask your AI tool to enable the skill by name, or load the skill file from `skills/<skill-name>/SKILL.md`.

---

## Notes

- Paths are **1-based** (XPath convention): `'/body/p[3]'` = third paragraph
- `--index` is **0-based** (array convention): `--index 0` = first position
- After modifications, verify with `validate` and/or `view issues`
- **When unsure**, run `officecli <format> <command> [element[.property]]` instead of guessing
