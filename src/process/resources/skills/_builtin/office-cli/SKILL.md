---
name: officecli
description: Create, analyze, proofread, and modify Office documents (.docx, .xlsx, .pptx) using the officecli CLI tool. Use when the user wants to create, inspect, check formatting, find issues, add charts, or modify Office documents.
---

# officecli

AI-friendly CLI for .docx, .xlsx, .pptx. Single binary, no dependencies, no Office installation needed.

---

## BEFORE YOU START (CRITICAL)

**Every time before using officecli, run this check:**

```bash
# 1. Check if installed
if ! command -v officecli &> /dev/null; then
    # macOS/Linux
    curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
    # Windows: irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
fi

# 2. Verify version (should be >= 1.0.14 for HTML preview)
officecli --version
```

**Why:** OfficeCli auto-updates daily, but ensure latest version before starting.

---

## How to Learn Commands (CRITICAL)

**DO NOT memorize commands from this document.** Properties and syntax can change between versions.

**Instead, query the CLI for real-time help:**

### Three-Layer Navigation System

```bash
# Layer 1: What can I modify? (shows all elements)
officecli pptx set              # → slide, shape, chart, table...
officecli docx set              # → paragraph, run, table...
officecli xlsx set              # → cell, sheet, chart...

# Layer 2: What are the properties? (shows all properties for ONE element)
officecli pptx set shape        # → text, fill, gradient, x, y, width, height, font, size...
officecli docx set paragraph    # → text, style, alignment, spacing...
officecli xlsx set cell         # → value, formula, bold, fill...

# Layer 3: What's the exact format? (shows examples and accepted values)
officecli pptx set shape.fill       # → Color formats: FF0000, red, rgb(255,0,0), accent1
officecli pptx set shape.gradient   # → gradient="linear:90:FF0000,0000FF"
officecli pptx set shape.animation  # → animation=flyIn-left-300-after-delay=200
```

### Complete Workflow Example

```bash
# Step 1: Discover what's available
$ officecli pptx set shape
# Output:
#   Settable properties for shape:
#     text, fill, gradient, image, opacity
#     x, y, width, height, rotation, flipH, flipV
#     font, size, bold, italic, color
#     shadow, glow, reflection, animation
#     ...

# Step 2: Need gradient? Check the exact format
$ officecli pptx set shape.gradient
# Output:
#   Property: gradient
#   Format: TYPE:ANGLE:COLOR1,COLOR2[,COLOR3...]
#
#   Examples:
#     --prop gradient="linear:90:FF0000,0000FF"
#     --prop gradient="radial:FF0000,FFFF00,00FF00"

# Step 3: Apply it
officecli set demo.pptx '/slide[1]/shape[1]' \
  --prop gradient="linear:90:FF0000,0000FF"

# Step 4: Validate the result
officecli validate demo.pptx
```

**One help query beats guessing 10 times.**

Replace `pptx` with `docx` or `xlsx`. Available commands: `view`, `get`, `query`, `set`, `add`, `move`, `swap`, `remove`, `batch`, `raw`.

---

## Strategy

**L1 (read) → L2 (DOM edit) → L3 (raw XML)**. Always prefer higher layers. Add `--json` for structured output.

---

## Quick Start

**PPT:**

```bash
officecli create slides.pptx
officecli add slides.pptx / --type slide --prop title="Q4 Report" --prop background=1A1A2E
officecli add slides.pptx /slide[1] --type shape --prop text="Revenue grew 25%" --prop x=2cm --prop y=5cm --prop font=Arial --prop size=24 --prop color=FFFFFF
officecli set slides.pptx /slide[1] --prop transition=fade --prop advanceTime=3000
officecli view slides.pptx html    # NEW: Preview in browser
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

## Performance: Resident Mode

For multi-step workflows (3+ commands on the same file), use `open`/`close`:

```bash
officecli open report.docx       # keep in memory — fast subsequent commands
officecli set report.docx ...    # no file I/O overhead
officecli close report.docx      # save and release
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

| Mode        | Description                           | Useful flags                                     |
| ----------- | ------------------------------------- | ------------------------------------------------ |
| `outline`   | Document structure                    |                                                  |
| `stats`     | Statistics (pages, words, shapes)     |                                                  |
| `issues`    | Formatting/content/structure problems | `--type format\|content\|structure`, `--limit N` |
| `text`      | Plain text extraction                 | `--start N --end N`, `--max-lines N`             |
| `annotated` | Text with formatting annotations      |                                                  |
| `html`      | HTML preview (PPT only, 1.0.14+)      | Auto-opens in browser                            |

### get

Any XML path via element localName. Use `--depth N` to expand children. Add `--json` for structured output.

```bash
officecli get report.docx '/body/p[3]' --depth 2 --json
officecli get slides.pptx '/slide[1]' --depth 1          # list all shapes on slide 1
officecli get data.xlsx '/Sheet1/B2' --json
```

**To discover available paths**, run:

```bash
officecli docx get    # Shows all document paths
officecli xlsx get    # Shows all workbook paths
officecli pptx get    # Shows all presentation paths
```

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

**To discover available properties**, run:

```bash
officecli <format> set                # See all settable elements
officecli <format> set <element>      # See all properties for ONE element
officecli <format> set <element.prop> # See format details for ONE property
```

**Value formats:**

| Type       | Format                 | Examples                                              |
| ---------- | ---------------------- | ----------------------------------------------------- |
| Colors     | Hex, named, RGB, theme | `FF0000`, `red`, `rgb(255,0,0)`, `accent1`..`accent6` |
| Spacing    | Unit-qualified         | `12pt`, `0.5cm`, `1.5x`, `150%`                       |
| Dimensions | EMU or suffixed        | `914400`, `2.54cm`, `1in`, `72pt`, `96px`             |

### add — add elements or clone

```bash
officecli add <file> <parent> --type <type> [--index N] [--prop ...]
officecli add <file> <parent> --from <path> [--index N]    # clone existing element
```

**Element types (with aliases):**

| Format   | Types                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pptx** | slide, shape (textbox), picture (image/img), chart, table, row (tr), connector (connection/line), group, video (audio/media), equation (formula/math), notes, paragraph (para), run, zoom (slidezoom) |
| **docx** | paragraph (para), run, table, row (tr), cell (td), image (picture/img), header, footer, section, bookmark, comment, footnote, endnote                                                                 |
| **xlsx** | sheet, row, cell, chart, image (picture), comment, hyperlink                                                                                                                                          |

**Clone:** `officecli add <file> / --from /slide[1]` — copies with all cross-part relationships.

**To discover available element types and their properties**, run:

```bash
officecli <format> add    # Shows all addable types with example syntax
```

### move, swap, remove

```bash
officecli move <file> <path> [--to <parent>] [--index N]
officecli swap <file> <path1> <path2>
officecli remove <file> '/body/p[4]'
```

### batch — multiple operations in one save cycle

```bash
echo '[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Name","bold":"true"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Score","bold":"true"}}
]' | officecli batch data.xlsx --json
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `view`, `raw`, `raw-set`, `validate`.

Batch fields: `command`, `path`, `parent`, `type`, `from`, `to`, `index`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

---

## L3: Raw XML

Use when L2 cannot express what you need. No xmlns declarations needed — prefixes auto-registered.

```bash
officecli raw <file> <part>                          # view raw XML
officecli raw-set <file> <part> --xpath "..." --action replace --xml '<w:p>...</w:p>'
officecli add-part <file> <parent>                   # create new document part (returns rId)
```

**raw-set actions:** `append`, `prepend`, `insertbefore`, `insertafter`, `replace`, `remove`, `setattr`.

**To discover available parts**, run:

```bash
officecli <format> raw    # Shows available parts per format
```

---

## Common Pitfalls

| Pitfall                 | Correct Approach                                                |
| ----------------------- | --------------------------------------------------------------- |
| `--name "foo"`          | ❌ Use `--prop name="foo"` — all attributes go through `--prop` |
| `x=-3cm`                | ❌ Negative coordinates not supported. Use `x=0cm` or `x=36cm`  |
| `/shape[myname]`        | ❌ Name indexing not supported. Use numeric index: `/shape[3]`  |
| Guessing property names | ❌ Run `officecli <format> set <element>` to see exact names    |
| Modifying an open file  | ❌ Close the file in PowerPoint/WPS first                       |
| `\n` in shell strings   | ❌ Use `\\n` for newlines in `--prop text="..."`                |

---

## Troubleshooting Workflow

When a command fails, follow this order:

```bash
# 1. Read the error message (officecli provides descriptive errors)
#    "Unrecognized argument" → check --prop format
#    "Slide not found" → add slide first
#    "Could not find path" → verify file exists

# 2. Inspect current state
officecli get <file> '/slide[N]' --depth 1   # List all shapes + indices
officecli view <file> outline                # Document structure
officecli view <file> issues                 # Validation issues

# 3. Check command syntax (don't guess!)
officecli pptx set shape         # What properties are available?
officecli pptx set shape.fill    # What's the exact format?

# 4. Apply fix and validate
officecli set <file> <path> --prop key=value
officecli validate <file>

# 5. Still stuck? Use HTML preview to debug visually (PPT only)
officecli view deck.pptx html
```

---

## Notes

- Paths are **1-based** (XPath convention): `'/body/p[3]'` = third paragraph
- `--index` is **0-based** (array convention): `--index 0` = first position
- After modifications, verify with `validate` and/or `view issues`
- **When unsure**, run `officecli <format> <command> [element[.property]]` instead of guessing

---

**Remember:** This doc is a quick reference. **For the latest syntax, always query the CLI first** with help commands.
