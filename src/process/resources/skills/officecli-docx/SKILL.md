---
# officecli: v1.0.23
name: officecli-docx
description: "Use this skill any time a .docx file is involved -- as input, output, or both. This includes: creating Word documents, reports, letters, memos, or proposals; reading, parsing, or extracting text from any .docx file; editing, modifying, or updating existing documents; working with templates, tracked changes, comments, headers/footers, or tables of contents. Trigger whenever the user mentions 'Word doc', 'document', 'report', 'letter', 'memo', or references a .docx filename."
---

# officecli: v1.0.23

# OfficeCLI DOCX Skill

## BEFORE YOU START (CRITICAL)

**If `officecli` is not installed:**

`macOS / Linux`

```bash
if ! command -v officecli >/dev/null 2>&1; then
    curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
fi
```

`Windows (PowerShell)`

```powershell
if (-not (Get-Command officecli -ErrorAction SilentlyContinue)) {
    irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
}
```

Verify: `officecli --version`

If `officecli` is still not found after first install, open a new terminal and run the verify command again.

---

# officecli: v1.0.23

## Quick Reference

| Task                   | Action                              |
| ---------------------- | ----------------------------------- |
| Read / analyze content | Use `view` and `get` commands below |
| Edit existing document | Read [editing.md](editing.md)       |
| Create from scratch    | Read [creating.md](creating.md)     |

---

# officecli: v1.0.23

## Execution Model

**Run commands one at a time. Do not write all commands into a shell script and execute it as a single block.**

OfficeCLI is incremental: every `add`, `set`, and `remove` immediately modifies the file and returns output. Use this to catch errors early:

1. **One command at a time, then read the output.** Check the exit code before proceeding.
2. **Non-zero exit = stop and fix immediately.** Do not continue building on a broken state.
3. **Verify after structural operations.** After adding a style, table, chart, or section, run `get` or `validate` before building on top of it.

Running a 50-command script all at once means the first error cascades silently through every subsequent command. Running incrementally means the failure context is immediate and local — fix it and move on.

---

# officecli: v1.0.23

## Reading & Analyzing

### Text Extraction

```bash
officecli view doc.docx text
officecli view doc.docx text --max-lines 200
officecli view doc.docx text --start 1 --end 50
```

`text` mode shows `[/body/p[N]] text content`, tables as `[Table: N rows]`, equations as readable math. Use `--max-lines` or `--start`/`--end` for large documents to avoid dumping entire content.

### Structure Overview

```bash
officecli view doc.docx outline
```

Output shows file stats (paragraph count, tables, images, equations), watermark presence, headers/footers, and heading hierarchy tree.

### Detailed Inspection

```bash
officecli view doc.docx annotated
```

Shows style, font, size, bold/italic per run; equations as LaTeX; images with alt text. Empty paragraphs shown as `[] <-- empty paragraph`.

### Statistics

```bash
officecli view doc.docx stats
```

Paragraph count, style distribution, font usage, font size usage, empty paragraph count.

### Element Inspection

```bash
# Document root (metadata, page setup)
officecli get doc.docx /

# List body children at depth 1
officecli get doc.docx /body --depth 1

# Specific paragraph
officecli get doc.docx "/body/p[1]"

# Specific run
officecli get doc.docx "/body/p[1]/r[1]"

# Table structure
officecli get doc.docx "/body/tbl[1]" --depth 3

# Style definitions
officecli get doc.docx /styles

# Specific style
officecli get doc.docx "/styles/Heading1"

# Header/footer
officecli get doc.docx "/header[1]"
officecli get doc.docx "/footer[1]"

# Numbering definitions
officecli get doc.docx /numbering

# JSON output for scripting
officecli get doc.docx "/body/p[1]" --json
```

### CSS-like Queries

```bash
# Find paragraphs by style
officecli query doc.docx 'paragraph[style=Heading1]'

# Find paragraphs containing text
officecli query doc.docx 'p:contains("quarterly")'

# Find empty paragraphs
officecli query doc.docx 'p:empty'

# Find images without alt text
officecli query doc.docx 'image:no-alt'

# Find bold runs in centered paragraphs
officecli query doc.docx 'p[alignment=center] > r[bold=true]'

# Find large text
officecli query doc.docx 'paragraph[size>=24pt]'

# Find fields by type
officecli query doc.docx 'field[fieldType!=page]'
```

---

# officecli: v1.0.23

## Design Principles

**Professional documents need clear structure and consistent formatting.**

### Document Structure

Every document needs clear hierarchy -- title, headings, subheadings, body text. Don't create a wall of unstyled Normal paragraphs.

### Typography

Choose a readable body font (Calibri, Cambria, Georgia, Times New Roman). Keep body at 11-12pt. Headings should step up: **H1=18pt minimum (20pt preferred for long documents)**, H2=14pt bold, H3=12pt bold.

### Spacing

Use paragraph spacing (`spaceBefore`/`spaceAfter`) instead of empty paragraphs. Line spacing of 1.15x-1.5x for body text.

### Page Setup

Always set margins explicitly. US Letter default: `pageWidth=12240`, `pageHeight=15840`, margins=1440 (1 inch).

### Headers & Footers

Professional documents include page numbers at minimum. Consider company name in header, page X of Y in footer.

**Standard footer setup (always use this pattern for documents with a cover page):**

> **⚠️ Known CLI bug:** `--prop field=page` is **silently ignored** in `add --type footer` commands. The footer is created with static text only. You **must** use `raw-set` to inject the PAGE field after creating the footer. See the 3-step pattern below.

```bash
# Adding type=first footer automatically enables differentFirstPage — no separate set command needed

# Step 1. Empty footer for cover page (CLI auto-inserts <w:titlePg/> — suppresses cover page number)
officecli add doc.docx / --type footer --prop type=first --prop text=""

# Step 2. Default footer with static "Page " text (field=page is silently ignored — do NOT rely on it)
officecli add doc.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt --prop font=Calibri

# Step 3. Inject PAGE field via raw-set (footer[2] = default when first-page footer also exists)
officecli raw-set doc.docx "/footer[2]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

> **Footer index rule:** When both a first-page footer and a default footer are added, the default footer is `/footer[2]`. If there is no first-page footer, the default footer is `/footer[1]`. Always verify with `officecli get doc.docx "/footer[2]"` (or `"/footer[1]"`) to confirm the `<w:fldChar>` element is present.

> **LibreOffice rendering note:** Page number fields may display as static "Page" (not "Page 1") in LibreOffice PDF preview — this is a LibreOffice limitation. Open in Microsoft Word to see actual page numbers. Confirm the field is present with `officecli get doc.docx "/footer[2]"` — the output must show `fldChar` children, not just a plain run.

### Table Design

Alternate row shading for readability. Header row with contrasting background. Consistent cell padding.

### Color Usage

Use color sparingly in documents -- accent color for headings or table headers, not rainbow formatting.

### Content-to-Element Mapping

| Content Type          | Recommended Element(s)                   | Why                                    |
| --------------------- | ---------------------------------------- | -------------------------------------- |
| Sequential items      | Bulleted list (`listStyle=bullet`)       | Scanning is faster than inline commas  |
| Step-by-step process  | Numbered list (`listStyle=numbered`)     | Numbers communicate order              |
| Comparative data      | Table with header row                    | Columns enable side-by-side comparison |
| Trend data            | Embedded chart (`chartType=line/column`) | Visual pattern recognition             |
| Key definition        | Hanging indent paragraph                 | Offset term from definition            |
| Legal/contract clause | Numbered list with bookmarks             | Cross-referencing via bookmarks        |
| Mathematical content  | Equation element (`formula=LaTeX`)       | Proper OMML rendering                  |
| Citation/reference    | Footnote or endnote                      | Keeps body text clean                  |
| Pull quote / callout  | Paragraph with border + shading          | Visual distinction from body           |
| Multi-section layout  | Section breaks with columns              | Column control per section             |

---

# officecli: v1.0.23

## QA (Required)

**Assume there are problems. Your job is to find them.**

### Issue Detection

```bash
# Check for formatting, content, and structure issues automatically
officecli view doc.docx issues

# Filter by issue type
officecli view doc.docx issues --type format
officecli view doc.docx issues --type content
officecli view doc.docx issues --type structure
```

### Content QA

```bash
# Extract all text, check for missing content, typos, wrong order
officecli view doc.docx text

# Check structure
officecli view doc.docx outline

# Check for empty paragraphs (common clutter)
officecli query doc.docx 'p:empty'

# Check for images without alt text
officecli query doc.docx 'image:no-alt'
```

When editing templates, check for leftover placeholder text:

```bash
officecli query doc.docx 'p:contains("lorem")'
officecli query doc.docx 'p:contains("xxxx")'
officecli query doc.docx 'p:contains("placeholder")'
```

### Validation

```bash
officecli validate doc.docx
```

### Pre-Delivery Checklist

- [ ] Metadata set (title, author)
- [ ] 页码字段已注入 — 用 `officecli get doc.docx "/footer[2]" --depth 3` 确认输出中有 `fldChar` 元素。
      ⚠️ `view outline` 显示 "Footer: Page" 时**无法**区分静态文字和动态字段 — 必须用 `get --depth 3` 命令验证 `fldChar` 存在。
      如无 first-page footer，用 `"/footer[1]"` 替代 `"/footer[2]"`。**Required: raw-set PAGE field injection** — `--prop field=page` in add command is silently ignored.
- [ ] First-page footer added (`--type footer --prop type=first --prop text=""`) if document has a cover page — CLI automatically enables differentFirstPage (no separate set command needed)
- [ ] Cover page content fills >= 60% of the page (has accent bars, subtitle, author, date, contact info) — **lower half must not be >40% empty**: if the title block ends above the page midpoint, add an abstract excerpt block, document scope statement, key highlights list, or decorative closing band. See creating.md → Cover Page Design for templates.
- [ ] **[REQUIRED]** TOC present when document has 3 or more headings — add with `officecli add doc.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true --index 0`; TOC displays as a field code in CLI output — press F9 in Word to refresh/render it
- [ ] Last page content fills >= 40% of the page (has conclusion / next steps / contact info / legal notice)
- [ ] Heading hierarchy is correct (no skipped levels, e.g., H1 -> H3)
- [ ] No empty paragraphs used as spacing (use spaceBefore/spaceAfter instead)
- [ ] All images have alt text
- [ ] Tables have header rows
- [ ] Document validates with `officecli validate`
- [ ] No placeholder text remaining

### Verification Loop

1. Generate document
2. Run `view issues` + `view outline` + `view text` + `validate`
3. List issues found (if none found, look again more critically)
4. Fix issues
5. Re-verify -- one fix often creates another problem
6. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

**NOTE**: Unlike pptx, there is no visual preview mode (`view svg`/`view html`) for docx. Content verification relies on `view text`, `view annotated`, `view outline`, `view issues`, and `validate`. For visual verification, the user must open the file in Word.

**QA display notes:**

- `view text` shows "1." for ALL numbered list items regardless of their actual rendered number. This is a display limitation -- the actual document renders correct auto-incrementing numbers (1, 2, 3...) in Word and LibreOffice. Do not treat this as a defect.
- `view issues` flags "body paragraph missing first-line indent" on any paragraph that lacks a first-line indent — this includes cover page paragraphs, centered headings, list items, bibliography entries, callout boxes, and any block-style paragraph with explicit `spaceAfter`. These warnings are expected and can be ignored. First-line indent is only required in APA/academic body text — most professional documents use block style (no first-line indent) by default.

---

# officecli: v1.0.23

## Common Pitfalls

| Pitfall                               | Correct Approach                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--name "foo"`                        | Use `--prop name="foo"` -- all attributes go through `--prop`                                                                                                                                                                  |
| Guessing property names               | Run `officecli docx set paragraph` to see exact names                                                                                                                                                                          |
| `\n` in shell strings                 | Use `\\n` for newlines in `--prop text="line1\\nline2"`                                                                                                                                                                        |
| Modifying an open file                | Close the file in Word first                                                                                                                                                                                                   |
| Hex colors with `#`                   | Use `FF0000` not `#FF0000` -- no hash prefix                                                                                                                                                                                   |
| Paths are 1-based                     | `/body/p[1]`, `/body/tbl[1]` -- XPath convention                                                                                                                                                                               |
| `--index` is 0-based                  | `--index 0` = first position -- array convention                                                                                                                                                                               |
| Unquoted `[N]` in zsh/bash            | Shell glob-expands `/body/p[1]` -- always quote paths: `"/body/p[1]"`                                                                                                                                                          |
| Spacing in raw numbers                | Use unit-qualified values: `'12pt'`, `'0.5cm'`, `'1.5x'` not raw twips                                                                                                                                                         |
| Empty paragraphs for spacing          | Use `spaceBefore`/`spaceAfter` properties on paragraphs                                                                                                                                                                        |
| `$` in `--prop text=` (shell)         | `--prop text="$50M"` strips the value. Use single quotes: `--prop text='$50M'`                                                                                                                                                 |
| `$` and `'` in batch JSON             | Use heredoc: `cat <<'EOF' \| officecli batch` -- single-quoted delimiter prevents shell expansion                                                                                                                              |
| Wrong border format                   | Use `style;size;color;space` format: `single;4;FF0000;1`                                                                                                                                                                       |
| listStyle on run instead of paragraph | `listStyle` is a paragraph property, not a run property                                                                                                                                                                        |
| Row-level bold/color/shd              | Row `set` only supports `height`, `header`, and `c1/c2/c3` text shortcuts. Use cell-level `set` for formatting (bold, shd, color, font)                                                                                        |
| Section vs root property names        | Section uses `pagewidth`/`pageheight` (lowercase). Document root uses `pageWidth`/`pageHeight` (camelCase)                                                                                                                     |
| `--prop field=page` in footer         | **SILENTLY IGNORED** in `add --type footer` commands. The footer is created with static text only. Must use `raw-set` to inject `<w:fldChar>` after creating the footer. See Headers & Footers section for the 3-step pattern. |
| Page number on cover                  | Adding `--type footer --prop type=first` automatically enables differentFirstPage. Do NOT use `set / --prop differentFirstPage=true` — that prop is UNSUPPORTED and silently fails                                             |
| TOC skipped for multi-heading docs    | Any document with 3+ headings requires a TOC. It is not optional — add with `--type toc --index 0` after the cover page break                                                                                                  |
| Code block indentation via spaces     | Use the `ind.left` paragraph property (e.g. `--prop ind.left=720`) for code block indentation — consecutive spaces as padding produce `view issues` warnings and visually inconsistent results                                 |

---

# officecli: v1.0.23

## Performance: Resident Mode

**Always use `open`/`close` — it is the smart default, not a special-case optimization.** Every command benefits: no repeated file I/O.

```bash
officecli open doc.docx           # Load once into memory
officecli add doc.docx ...        # All commands run in memory — fast
officecli set doc.docx ...
officecli close doc.docx          # Write once to disk
```

Use this pattern for every document build, regardless of command count.

## Performance: Batch Mode

Execute multiple operations in a single open/save cycle:

```bash
cat <<'EOF' | officecli batch doc.docx
[
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Introduction","style":"Heading1"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"This report covers Q4 results.","font":"Calibri","size":"11pt"}}
]
EOF
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `view`, `raw`, `raw-set`, `validate`.

Batch fields: `command`, `path`, `parent`, `type`, `from`, `to`, `index`, `after`, `before`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

`parent` = container to add into (for `add`). `path` = element to modify (for `set`, `get`, `remove`, `move`, `swap`).

---

# officecli: v1.0.23

## Known Issues

| Issue                                                | Workaround                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No visual preview**                                | Unlike pptx (SVG/HTML), docx has no built-in rendering. Use `view text`/`view outline`/`view annotated`/`view issues` for verification. Users must open in Word for visual check.                                                                                                                                                     |
| **Track changes creation requires raw XML**          | OfficeCLI can accept/reject tracked changes (`set / --prop accept-changes=all`) but cannot create tracked changes (insertions/deletions with author markup) via high-level commands. Use `raw-set` with XML for tracked change creation.                                                                                              |
| **Tab stops may require raw XML**                    | Tab stop creation is not exposed in officecli docx high-level commands. Use `raw-set` to add tab stop definitions in paragraph properties.                                                                                                                                                                                            |
| **Chart series cannot be added after creation**      | Same as pptx: `set --prop data=` can only update existing series, not add new ones. Delete and recreate the chart with all series in the `add` command.                                                                                                                                                                               |
| **Complex numbering definitions**                    | `listStyle=bullet/numbered` covers simple cases. For multi-level lists with custom formatting, use `numId`/`numLevel` properties. Creating new numbering definitions may require understanding the numbering part.                                                                                                                    |
| **Shell quoting in batch with echo**                 | `echo '...' \| officecli batch` fails when JSON values contain apostrophes or `$`. Use heredoc: `cat <<'EOF' \| officecli batch doc.docx`.                                                                                                                                                                                            |
| **Batch intermittent failure**                       | Approximately 1-in-15 batch operations may fail with "Failed to send to resident" when using batch+resident mode. Retry the command, or close/reopen the file. Split large batch arrays into 10-15 operation chunks.                                                                                                                  |
| **Table-level `padding` produces invalid XML**       | Do not use `set tbl[N] --prop padding=N`. It creates invalid `tblCellMar`. Use cell-level `padding.top`/`padding.bottom` instead. If already applied, remove with `raw-set --xpath "//w:tbl[N]/w:tblPr/w:tblCellMar" --action remove`.                                                                                                |
| **Internal hyperlinks not supported**                | The `hyperlink` command only accepts absolute URIs (`https://...`). Fragment URLs (`#bookmark`) are rejected. For internal cross-references, use descriptive text or `raw-set` with `<w:hyperlink w:anchor="bookmarkName">`.                                                                                                          |
| **Table `--index` positioning unreliable**           | `--index N` on `add /body --type table` may be ignored (table appends to end). `move` also may not work for tables. Workaround: add content in the desired order, or remove/re-add surrounding elements.                                                                                                                              |
| **`\mathcal` in equations causes validation errors** | The `\mathcal` LaTeX command generates invalid `m:scr` XML. Use `\mathit` or plain letters instead.                                                                                                                                                                                                                                   |
| **`view text` shows "1." for all numbered items**    | Display-only limitation. Rendered output in Word/LibreOffice shows correct auto-incrementing numbers.                                                                                                                                                                                                                                 |
| **`chartType=pie`/`doughnut` in LibreOffice PDF**    | **Do NOT use `chartType=pie` or `chartType=doughnut` when LibreOffice PDF delivery is required.** These chart types render without visible slices in LibreOffice PDF export — only labels and legend appear, slices are invisible. Use `chartType=column` or `chartType=bar` instead. Charts render correctly in Microsoft Word only. |

---

# officecli: v1.0.23

## Help System

**When unsure about property names, value formats, or command syntax, run help instead of guessing.** One help query is faster than guess-fail-retry loops.

```bash
officecli docx set              # All settable elements and their properties
officecli docx set paragraph    # Paragraph properties in detail
officecli docx set table        # Table properties
officecli docx add              # All addable element types
officecli docx view             # All view modes
officecli docx get              # All navigable paths
officecli docx query            # Query selector syntax
```
