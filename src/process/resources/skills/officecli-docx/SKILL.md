---
# officecli: v1.0.63
name: officecli-docx
description: "Use this skill any time a .docx file is involved -- as input, output, or both. This includes: creating Word documents, reports, letters, memos, or proposals; reading, parsing, or extracting text from any .docx file; editing, modifying, or updating existing documents; working with templates, tracked changes, comments, headers/footers, or tables of contents. Trigger whenever the user mentions 'Word doc', 'document', 'report', 'letter', 'memo', or references a .docx filename."
---

# officecli: v1.0.63

# OfficeCLI DOCX Skill

## BEFORE YOU START

**Mental model.** A `.docx` is a ZIP of XML parts (`document.xml`, `styles.xml`, `numbering.xml`, `header*.xml`, `footer*.xml`, `comments.xml`, ...). Everything the user sees — headings, tables, page numbers, TOC, tracked changes — is XML inside that ZIP. `officecli` gives you a semantic-path API (`/body/p[1]/r[2]`) over it, so you almost never touch raw XML; when you must, use `raw-set`.

**Install check.** If `officecli --version` fails:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
```

If still not found, open a new terminal, then `officecli --version` should report `1.0.63` or newer.

**Shell quoting (zsh / bash).** docx paths contain `[]`, some prop values contain `$`. Both are shell metacharacters. Rules:

- ALWAYS quote element paths: `"/body/p[1]"`, not `/body/p[1]`.
- Use **single quotes** for any prop value containing `$`: `--prop text='$50M'`.
- NEVER hand-write `\$`, `\t`, `\n` inside executable examples. The CLI does not interpret backslash escapes; they will land in your file as literal characters. In a cell / paragraph text, a real newline goes through the JSON layer (`batch` heredoc with `"\n"` inside the JSON string).

**Incremental execution.** Run commands one at a time and read each exit code. `officecli` mutates the file on every call; a 50-command script that fails at command 3 will cascade silently. One command → check output → continue. After any structural op (new style, table, TOC, section break) run `get` on it before stacking more on top.

**File-name convention in this skill.** Fixed-command examples (Reading & Analysis, Creating & Editing) use the literal `doc.docx` — swap in your own filename. Copy-paste blocks and recipes that you will run _as-is_ (Quick Start, Delivery Gate, Report-level recipes (a)-(f)) use `"$FILE"` — set once at the top of your script (`FILE="annual-review.docx"`) and every command picks it up. When in doubt, treat `$FILE` blocks as drop-in and `doc.docx` blocks as patterns.

## ⚠️ Help-First Rule

**This skill teaches what good docx looks like, not every command flag. When a property name, enum value, or alias is uncertain, consult help BEFORE guessing.**

```bash
officecli help docx                         # List all docx elements
officecli help docx <element>               # Full element schema (e.g. paragraph, field, numbering, watermark, toc)
officecli help docx <verb> <element>        # Verb-scoped (e.g. add field, set section)
officecli help docx <element> --json        # Machine-readable schema
```

Help is pinned to the installed CLI version. When this skill and help disagree, **help is authoritative**. Special-topic mini-sections below end with an explicit pointer back to help.

## Requirements for Outputs

Before reaching for a command, know what a good docx looks like. These are the deliverable standards every document MUST meet.

### All documents

**Clear hierarchy.** Every non-trivial document has Title → Heading 1 → Heading 2 → body, not a wall of unstyled `Normal` paragraphs. A reader scans headings first. If `view outline` shows one flat list of paragraphs, the hierarchy is missing.

**Explicit heading sizes.** Do NOT rely on Word default style sizes — they drift between templates. Set sizes explicitly: **H1 = 18pt minimum (20pt preferred for long reports)**, H2 = 14pt bold, H3 = 12pt bold. Body = 11-12pt. Line spacing 1.15-1.5x.

**One body font, one accent.** Pick one readable body font (Calibri, Cambria, Georgia, Times New Roman) and keep it consistent. Accent color for heading emphasis or table headers — not rainbow formatting.

**Spacing through properties, not empty paragraphs.** Use `spaceBefore` / `spaceAfter` on paragraphs. Rows of empty paragraphs render as spacing in Word but break pagination and `view issues` will flag them.

**Smart quotes and typographic quality.** New content uses curly quotes (`'`, `'`, `"`, `"`) not ASCII `'` and `"`. Use Unicode directly (`'smart'`) or the XML entities `&#x2018;` / `&#x2019;` / `&#x201C;` / `&#x201D;` inside `raw-set`. En-dash `–` for ranges (`2024–2026`), em-dash `—` for parenthetical breaks.

**Headers, footers, page numbers on any document > 1 page.** Page numbers go through a live `PAGE` field, not the literal text "Page 1". Use `--prop field=page` on a footer add — the CLI injects `<w:fldChar>` for you (see Creating & Editing → Headers & Footers).

**Preserve existing templates.** When editing a file that already has a look, match it. Existing conventions override these guidelines.

### Visual delivery floor (applies to EVERY document)

Before you declare done, open `officecli view "$FILE" html --browser` and confirm all of these:

- **No placeholder tokens rendered as data.** `$xxx$`, `{var}`, `{{name}}`, `<TODO>`, `lorem`, `xxxx` must never appear in a heading, body paragraph, cover page, TOC, caption, header, or footer. These are build-time tokens that escaped replacement. If you want a literal `{name}` in a template for a human to fill, wrap it in a visible instruction paragraph ("Replace `{name}` before sending") so no one confuses it with finished content.
- **No truncated titles or overflowing cells.** Long headings / table cell values must fit the page and the column. If a cell overflows, widen the column or set `wrapText` on the cell.
- **Page numbers render as real numbers.** Confirm `get --depth 3` on the footer shows `<w:fldChar>` children — not just a run with literal text `"Page"`. The footer must contain a live field, not a static word.
- **TOC present when document has 3+ headings.** Add with `--type toc`. The TOC is a live field — some viewers show the heading list immediately, others show `Update field to see table of contents` until the user recalculates (F9 in Word).
- **Cover page ≥ 60% filled, last page ≥ 40% filled.** A cover that is 80% blank space looks unfinished. Pad with subtitle / author / date / scope statement / key highlights / decorative band. A last page with just "Thank you" centered also reads as unfinished — add conclusion, next steps, contact, legal notice.
- **No `\$`, `\t`, `\n` literals in document text.** If you see these in `view text`, a shell-escape layer leaked. Delete the paragraph and re-enter it.

If any of the above fails, STOP and fix before declaring done.

### Hard rules worth repeating (they are how docx goes wrong)

- Single-command footer with page number: `add / --type footer --prop field=page ...` — do NOT pass `--prop fldChar=...` or hand-compose the field. The CLI handles it.
- First-page footer `--type footer --prop type=first --prop text=""` automatically triggers `differentFirstPage`. Do NOT `set / --prop differentFirstPage=true` separately — that prop is UNSUPPORTED and silently fails.
- TOC add: `--type toc --prop levels="1-3" --prop hyperlinks=true --index 0`. Do NOT pass `--prop pagenumbers=true` — UNSUPPORTED (page numbers render automatically).

## Common Workflow

Six steps. Every non-trivial build follows this shape.

1. **Choose the mode.** Always use `officecli open <file>` at the start and `officecli close <file>` at the end. Resident mode is the default, not an optimization — it avoids re-parsing the XML on every command. For many paragraphs of the same style, use `batch` (≤ 12 ops per block for reliability).
2. **Orient.** For a new file, `officecli create doc.docx`. For existing, `officecli view doc.docx outline` first — get the heading tree, section count, whether a TOC / watermark / tracked changes are already there. Never start editing blind.
3. **Build incrementally.** Structural first, content next, formatting last. Styles and numbering defs → sections / page setup → headings and body → tables / images / fields / TOC → headers / footers → comments. After each structural op, `get` it back to confirm shape before stacking on top.
4. **Format to spec.** Explicit heading sizes, spacing, widths, alignment, tabs, list indents. Formatting is not optional polish — per Requirements for Outputs it is part of the deliverable.
5. **Close, then recalculate fields.** `officecli close doc.docx` writes XML to disk. TOC / PAGE / NUMPAGES / SEQ / PAGEREF fields have **cached values** that may be stale or empty. When a human opens the file in Word, they press F9 to recalc. For the CLI's purposes, confirm fields _exist_ (via `get --depth 3` finding `<w:fldChar>`) rather than trusting the text value — the text is the cached render, the field is the truth.
6. **QA — assume there are problems.** See the QA section. You are not done when your last command exited 0; you are done after one fix-and-verify cycle finds zero new issues.

## Quick Start

Minimal viable docx: a heading, a body paragraph, a subheading, and a footer with a live page-number field. Adapt, don't copy-paste — your file, your content.

```bash
FILE="review.docx"
officecli create "$FILE"
officecli open "$FILE"
officecli add "$FILE" /body --type paragraph --prop text="Q4 2026 Review" --prop style=Heading1 --prop size=20pt --prop bold=true --prop spaceAfter=12pt
officecli add "$FILE" /body --type paragraph --prop text="Revenue grew 18% year-over-year, ahead of plan." --prop size=11pt --prop spaceAfter=8pt
officecli add "$FILE" /body --type paragraph --prop text="Key Drivers" --prop style=Heading2 --prop size=14pt --prop bold=true --prop spaceBefore=12pt --prop spaceAfter=6pt
officecli add "$FILE" /body --type paragraph --prop text="Enterprise renewals, upsell, and a new EMEA region." --prop size=11pt
officecli add "$FILE" / --type footer --prop type=default --prop alignment=center --prop size=9pt --prop text="Page " --prop field=page
officecli close "$FILE"
officecli validate "$FILE"
```

Verified: `validate` returns `no errors found`; `get /footer[1] --depth 3` shows the 5-run PAGE field chain (the begin / instrText / separate / cached value / end runs that wrap the live field), not a static `"Page"` string; for the raw `<w:fldChar>` XML behind those runs, use `officecli raw doc.docx "/footer[1]" | grep fldChar`. This is the shape of every build: open → structure → content → format → footer/fields → close → validate.

## Reading & Analysis

Start wide, then narrow. `outline` tells you what structure is already there; jump into `view text` / `get` / `query` only once you know where to look.

**Open the rendered document to eyeball your own work.**

- `officecli view $FILE html --browser` opens the document in a browser tab. Headings, tables, page breaks visible. Catches heading hierarchy issues, empty paragraphs-as-spacing, missing TOC entries.
- `officecli watch $FILE` keeps the preview live as you iterate (optional).
  Use this as your **first visual check after a batch of edits**.

**Orient.** Heading tree, section count, table / image counts, watermark, tracked changes presence.

```bash
officecli view doc.docx outline
```

**Extract text for content QA or LLM context.** Paths are shown as `[/body/p[N]]` so you can jump back with `get`. Scope with `--start` / `--end` / `--max-lines` on long documents.

```bash
officecli view doc.docx text --start 1 --end 80
officecli view doc.docx annotated          # values + style/font/size + warnings per run
officecli view doc.docx stats              # paragraph counts, font usage, style distribution
officecli view doc.docx issues             # empty paras, missing alt text, spacing anomalies
```

**Inspect one element.** XPath-style semantic paths (1-based, like XPath). Always quote — shells glob `[N]`.

```bash
officecli get doc.docx /                          # document root: metadata, page setup
officecli get doc.docx /body --depth 1            # body children overview
officecli get doc.docx "/body/p[1]"                # one paragraph
officecli get doc.docx "/body/p[1]/r[1]"           # one run (character-level formatting)
officecli get doc.docx "/body/tbl[1]" --depth 3    # table with rows and cells
officecli get doc.docx "/footer[1]" --depth 3      # footer — check for fldChar
officecli get doc.docx "/styles/Heading1"          # style definition
officecli get doc.docx /numbering --depth 2        # numbering abstractNum + num bindings
```

Add `--json` for machine output. Use `[last()]` (with parentheses) to address the last element: `/body/tbl[last()]/tr[1]`. `[last]` without parens errors.

**Query across the document.** CSS-like selectors, for systematic checks rather than hand-walking.

```bash
officecli query doc.docx 'paragraph[style=Heading1]'       # all H1s
officecli query doc.docx 'p:contains("quarterly")'         # text match
officecli query doc.docx 'p:empty'                         # empty paragraphs (clutter)
officecli query doc.docx 'image:no-alt'                    # accessibility gaps
officecli query doc.docx 'paragraph[size>=24pt]'           # numeric comparison
officecli query doc.docx 'field[fieldType!=page]'          # fields other than PAGE
```

Operators: `=`, `!=`, `~=` (contains), `>=`, `<=`, `[attr]` (exists). Full selector reference: `officecli query --help`.

**Large documents.** When a document is long enough that `view text` is unwieldy, use `view outline` to navigate by heading and `query` to jump directly to what you need — don't dump the whole body into context.

## Creating & Editing

The verbs: `add` (new element), `set` (change a prop), `remove`, `move`, `swap`, `batch`, `raw-set` (last-resort XML). Ninety percent of a docx build is paragraphs, runs, tables, a couple of images, a TOC, and a footer.

### Paragraphs, runs, styles

A paragraph (`p`) is a block; a run (`r`) is a span of consistent character formatting inside it. Set paragraph-level properties (style, alignment, spacing, indent) on the `p`; set font / size / color / bold on the `r`.

```bash
officecli add doc.docx /body --type paragraph --prop text="Executive Summary" --prop style=Heading1 --prop size=18pt --prop bold=true --prop spaceAfter=12pt
officecli set doc.docx "/body/p[1]/r[1]" --prop color=1F4E79
```

**Use styles, not ad-hoc formatting.** `style=Heading1` references the document's style definition — change the definition once, all headings update. Inline `size=18pt` on every heading is a style-bypass; when you need to retheme you have to touch every paragraph.

Use `spaceBefore` / `spaceAfter` for vertical spacing. Never use chains of empty paragraphs — they break pagination and are flagged by `view issues`.

### Tables

Tables are `/body/tbl[N]` with rows `tr[N]` and cells `tc[N]`. Add the table with a row and column count, then fill.

```bash
officecli add doc.docx /body --type table --prop rows=4 --prop cols=3 --prop width=100%
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop header=true --prop c1=Quarter --prop c2="Revenue" --prop c3="Growth"
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]/p[1]/r[1]" --prop bold=true
```

Row-level `set` supports `height`, `header`, and `c1 / c2 / ... / cN` text shortcuts — `cN` generalises, use as many as the table has columns (Tester #1 R2 shipped a 5-column Scenario matrix with `c1..c5`; earlier skill versions falsely capped at `c3`). Cell formatting (bold, fill, color) goes on the cell's paragraph / run. For per-cell borders, use the paragraph-level `pbdr.*` dotted-attr on the cell's inner paragraph instead of cell-level `border.bottom` (the cell-level border prop currently places `<w:tcBorders>` in the wrong XML position and fails `validate` — see Known Issues).

### Lists (bullets, numbered, multi-level)

For single-level bullets or numbers, set `listStyle` on the paragraph (`listStyle` is a paragraph prop, NOT a run prop — common mistake):

```bash
officecli add doc.docx /body --type paragraph --prop text="First item" --prop listStyle=bullet
officecli add doc.docx /body --type paragraph --prop text="Second item" --prop listStyle=bullet
```

For multi-level (legal-style 1 / 1.1 / 1.1.1 / appendix numbering), add an `abstractNum` then a `num`, then reference the `numId` from each paragraph:

```bash
officecli add doc.docx /numbering --type abstractnum --prop format=decimal
officecli add doc.docx /numbering --type num --prop abstractNumId=1
officecli add doc.docx /body --type paragraph --prop text="Section one" --prop numId=1 --prop ilvl=0
```

After adding, verify with `officecli query doc.docx 'paragraph[numId>0]'` that every `numId` reference points at a real `<w:num>`. See `officecli help docx abstractnum` and `officecli help docx num` for all level and format options.

### Tab stops (dot leaders, right-aligned page numbers)

Used for positional layout — a signature line, a TOC-entry-style "Chapter 1 ........ 12" row, a form field slot. Tab stops are a first-class `tab` element added as a child of the paragraph:

```bash
officecli add doc.docx "/body/p[1]" --type tab --prop pos=6in --prop val=right --prop leader=dot
officecli add doc.docx "/body/p[2]" --type tab --prop pos=3cm --prop val=left --prop leader=underscore
```

`pos` accepts `6in` / `6cm` / twips. `val` ∈ `left` / `center` / `right`. `leader` ∈ `none` / `dot` / `hyphen` / `underscore`. Paths are 1-based: `/body/p[N]/tab[K]`. See `officecli help docx tab` for the full grammar.

**Leader rendering caveat.** `leader=dot` / `underscore` on a tab definition alone does not emit dots/underscore in the output — the leader only renders when a real `<w:tab/>` character is present inside a run of that paragraph, and the high-level API does not insert `<w:tab/>` runs. For visible signature lines or dot-leader TOC-style rows you have two working options: (a) use literal characters — `text="_______________________________________"` for a signature line, or `"Chapter 1 ............ 12"` for a leader row — visually equivalent and ships reliably; or (b) `raw-set` a `<w:r><w:tab/></w:r>` into the paragraph before the leading line. Tester #2 took option (a) after the tab element produced an empty tabs container that then needed cleanup.

### Fields (PAGE / NUMPAGES / DATE / MERGEFIELD / REF)

Fields are live values computed at render time. Two props carry all the info: `fieldType` picks the field; `name` supplies the target (merge field name or bookmark for `ref`); `format` adds switches (date patterns, number formats).

| Field        | Use                           | Example                                                          |
| ------------ | ----------------------------- | ---------------------------------------------------------------- |
| `page`       | current page number           | `--prop field=page` on footer, or `--prop fieldType=page` inline |
| `numpages`   | total pages                   | `--prop field=numpages` / `--prop fieldType=numpages`            |
| `date`       | today                         | `--prop fieldType=date --prop format='yyyy-MM-dd'`               |
| `mergefield` | template merge token          | `--prop fieldType=mergefield --prop name=CustomerName`           |
| `ref`        | cross-reference to a bookmark | `--prop fieldType=ref --prop name=bookmarkName`                  |

The full `fieldType` enum (13 values: `page`, `pagenum`, `pagenumber`, `numpages`, `date`, `author`, `title`, `time`, `filename`, `section`, `sectionpages`, `mergefield`, `ref`) is in `officecli help docx field`. **There is NO `fieldInstr`, `seq`, or `pageref` fieldType** — old skill versions showed these; they will error. Numbered captions (`SEQ Figure`) and `PAGEREF` cross-refs currently require `raw-set` with a `<w:fldChar>` chain.

For a standalone MERGEFIELD inside a paragraph:

```bash
officecli add doc.docx "/body/p[3]" --type field --prop fieldType=mergefield --prop name=customer_name
# Renders as «customer_name» — visible placeholder, replaced in Word at mail-merge time.
```

Verified: canonical form passes `validate` and renders `«customer_name»` on open. Confirm all MERGEFIELDs exist with `officecli query doc.docx 'field[fieldType=mergefield]'`.

**MERGEFIELD templates: do NOT render placeholder literals.** If a template shows `{{customer_name}}` or `$NAME$` as body text, a human recipient sees the literal token — that is a failed template. Either (a) insert a real MERGEFIELD via the `field` type above, which Word replaces at mail-merge time, or (b) put literal tokens only inside an obvious instruction paragraph ("Replace `{{customer_name}}` before sending"). See Requirements for Outputs → Visual delivery floor.

### Headers & Footers (page numbering)

The single-command pattern — the CLI injects `<w:fldChar>` so you do not compose the field by hand:

```bash
# Empty first-page footer — auto-enables differentFirstPage so the cover has no page number
officecli add doc.docx / --type footer --prop type=first --prop text=""

# Default footer with live page number
officecli add doc.docx / --type footer --prop type=default --prop alignment=center --prop size=9pt --prop text="Page " --prop field=page
```

When both a first-page footer and a default footer exist, the default footer is `/footer[2]`. If only a default footer, it is `/footer[1]`. **Verify**: `get --depth 3` must show `fldChar` children, not just a run with literal text `"Page"`. `view outline` prints "Footer: Page" for both live fields AND static text — do not rely on it.

Do NOT `set / --prop differentFirstPage=true` separately — that prop is UNSUPPORTED and silently fails. Adding a first-type footer is how you flip the bit.

For composite footers like "Page X of Y" (PAGE + NUMPAGES in one paragraph), see `officecli help docx footer` and use `raw-set` with two `<w:fldChar>` field instructions — high-level single-command does not compose two fields in one run.

### Table of Contents

For any document with 3+ headings (Requirements):

```bash
officecli add doc.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --index 0
```

The TOC is a live field — when a human opens the file, the viewer either populates it on open or shows it after the user recalculates (F9 in Word). Do NOT pass `--prop pagenumbers=true` — UNSUPPORTED; page numbers render automatically.

**Addressing the TOC (1.0.60+).** Direct paths `/toc[1]` or `/tableofcontents` resolve to the first TOC field without hand-walking XPath — use these as the primary path for `get` / `set` / `remove`:

```bash
officecli get doc.docx "/toc[1]" --depth 2            # primary path — no raw-set needed to locate
officecli get doc.docx "/tableofcontents" --depth 2   # alias, same target
```

**TOC delivery step — treat this as mandatory before handing the file off.** **The live TOC field is a placeholder until recalculated.** Some viewers show the real heading list on first open; others show the literal string `Update field to see table of contents` until the reader recalculates. Two workarounds — pick one based on who reads the file:

- **Recipients who will open in a viewer that recalculates (or who will press F9)**: add a visible instruction ("Press F9 to refresh the TOC and page numbers"). No further action needed.
- **Recipients who cannot / will not recalculate**: use the **static TOC fallback — see Report-level recipes (f) below**. No CLI-only pipeline currently populates `<w:sdtContent>` with the cached heading rows that Word writes on save. `raw-set` on `//w:sdt/w:sdtContent` is theoretically possible but requires reconstructing the exact per-heading XML (with correct bookmarks, PAGEREF chains, and cached page numbers) and has not worked for any R1/R2 Tester. Hand-write the static fallback instead.

Ship-check: `officecli query "$FILE" 'p:contains("Update field to see")'` must return empty whenever the reader won't recalculate. If it matches, the TOC is unpopulated — switch to recipe (f).

### Images

Pictures go inside a run. Alt text is mandatory for accessibility, but **add rejects `alt` at create time** (CLI bug C-D-3): add first, then `set`.

```bash
officecli add doc.docx "/body/p[5]" --type picture --prop src=chart.png --prop width=4in
officecli set doc.docx "/body/p[5]/r[last()]" --prop alt="Q4 revenue by region, bar chart"
```

Confirm with `officecli query doc.docx 'image:no-alt'` — output should be empty before delivery.

### Hyperlinks and bookmarks

External links go via `hyperlink`:

```bash
officecli add doc.docx "/body/p[2]" --type hyperlink --prop uri="https://example.com" --prop text="our site"
```

**Internal links (to a bookmark within the document) are NOT supported by the high-level `hyperlink` command** — it rejects fragment URLs. Use `raw-set` with `<w:hyperlink w:anchor="bookmarkName">`, or pair a `PAGEREF` field with visible text. See `officecli help docx hyperlink` and `officecli help docx bookmark`.

### Sections and page setup

Document root `/` carries page setup (`pageWidth`, `pageHeight`, margins). Multi-section documents (landscape insert, column layout) add a `section` break; use `officecli help docx section` for the section prop list.

```bash
officecli set doc.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginLeft=1440
```

Section accepts both camelCase (`pageWidth`, canonical) and lowercase alias (`pagewidth`). Prefer camelCase.

### Report-level recipes

Four patterns that come up on every long-form report and aren't covered by the Quick Start. Each has been executed and `validate`-passed.

**(a) Rich cover page — hit the ≥ 60% filled floor.** A bare title + date cover reads as unfinished. Stack a confidentiality banner, title, subtitle, client/project/date block, and a 3-line key-themes strip:

```bash
officecli add "$FILE" /body --type paragraph --prop text="CONFIDENTIAL — CLIENT USE ONLY" --prop alignment=center --prop size=9pt --prop color=C00000 --prop spaceAfter=24pt
officecli add "$FILE" /body --type paragraph --prop text="Strategic Growth Review" --prop style=Title --prop size=32pt --prop bold=true --prop alignment=center --prop font=Cambria --prop spaceAfter=8pt
officecli add "$FILE" /body --type paragraph --prop text="FY26 Outlook and Scenario Planning" --prop italic=true --prop size=16pt --prop alignment=center --prop spaceAfter=36pt
officecli add "$FILE" /body --type paragraph --prop text='Prepared for: Acme Corp. Leadership Team' --prop alignment=center --prop size=11pt
officecli add "$FILE" /body --type paragraph --prop text='Engagement: 2026-04 — 2026-06' --prop alignment=center --prop size=11pt
officecli add "$FILE" /body --type paragraph --prop text='Author: Advisory Partners' --prop alignment=center --prop size=11pt --prop spaceAfter=36pt
officecli add "$FILE" /body --type paragraph --prop text="Key themes: 1) margin resilience, 2) EMEA expansion, 3) capital allocation." --prop alignment=center --prop italic=true --prop size=10pt
# Force the next section to start on a new page — belt-and-suspenders for cross-viewer reliability
# (pageBreakBefore alone is unreliable across viewers; --type pagebreak alone also flaked in earlier rounds)
officecli add "$FILE" /body --type pagebreak
officecli set "$FILE" "/body/p[last()]" --prop pageBreakBefore=true
```

**(b) Page X of Y footer — composite PAGE + NUMPAGES.** Add the footer paragraph first, then three child ops build `Page <X> of <Y>` in one paragraph. Visual outcome: footer reads `Page 3 of 12` with both numbers live. This is the official `officecli help docx footer` recipe.

```bash
officecli add "$FILE" / --type footer --prop type=default --prop text="Page " --prop alignment=center --prop size=9pt
officecli add "$FILE" "/footer[1]/p[1]" --type field --prop fieldType=page
officecli add "$FILE" "/footer[1]/p[1]" --type run --prop text=" of "
officecli add "$FILE" "/footer[1]/p[1]" --type field --prop fieldType=numpages
# Verify the 3 field fragments exist:
officecli get "$FILE" "/footer[1]/p[1]" --depth 1 | grep -c fldChar   # expect ≥ 4 (begin+separate+end per field)
```

**(c) Header row with fill and white bold text.** Don't chain `shd.fill=` (broken). Order matters: populate the header row's cell text FIRST (runs don't exist in empty cells, so a `set .../tc[N]/p[1]/r[1]` on empty cells errors with "No r found"), THEN apply cell fill, THEN run formatting. Visual outcome: dark-blue header band with white bold labels, zebra-striped data rows.

```bash
officecli add "$FILE" /body --type table --prop rows=5 --prop cols=4 --prop width=100%
# 1. Populate header cell text — creates the runs we'll style next
officecli set "$FILE" "/body/tbl[1]/tr[1]" --prop header=true --prop c1=Quarter --prop c2=Revenue --prop c3=Growth --prop c4=Status
# 2. Header cells — dark fill + white bold text
for col in 1 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[1]/tc[$col]" --prop fill=1F4E79
  officecli set "$FILE" "/body/tbl[1]/tr[1]/tc[$col]/p[1]/r[1]" --prop bold=true --prop color=FFFFFF
done
# 3. Alternating row fills for rows 3, 5 (zebra)
for row in 3 5; do for col in 1 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[$row]/tc[$col]" --prop fill=D9E2F3
done; done
```

Verified: without step 1, step 2's run-level `set` errors because empty cells have no `r`. This is the most common trip in R1 table builds.

**(d) Financial table style — right-align numbers, bold totals, bottom border on total row.** Numbers read right-aligned; totals read bold; a `pbdr.bottom` under the last data row visually separates the total:

```bash
# Right-align number columns (cols 2-4), paragraph-level
for row in 2 3 4 5; do for col in 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[$row]/tc[$col]/p[1]" --prop alignment=right
done; done
# Total row (row 5) bold + bottom border on the data paragraphs
for col in 1 2 3 4; do
  officecli set "$FILE" "/body/tbl[1]/tr[5]/tc[$col]/p[1]/r[1]" --prop bold=true
  officecli set "$FILE" "/body/tbl[1]/tr[4]/tc[$col]/p[1]" --prop pbdr.bottom="single;6;000000;0"
done
```

**(e) Cell with multiple bullets — SWOT / risk matrix / timeline.** Row-level `c1="line1\nline2"` drops a literal `\n`; one cell = one paragraph by default. To stack N bullets inside a single cell, seed the first via `set c1=`, then `add paragraph` under the cell for each subsequent bullet, then `move --index 1` to push the seeded line above its siblings if needed. Visual outcome: a 2×2 SWOT where each quadrant lists 3-5 bullets, each on its own line.

```bash
# 2x2 SWOT, cell (1,1) = Strengths with 3 bullets
officecli set "$FILE" "/body/tbl[1]/tr[1]" --prop c1="Installed base of 18k enterprise seats"
officecli add "$FILE" "/body/tbl[1]/tr[1]/tc[1]" --type paragraph --prop text="Margin structure above peer median" --prop listStyle=bullet
officecli add "$FILE" "/body/tbl[1]/tr[1]/tc[1]" --type paragraph --prop text="Founder-led sales motion in mid-market" --prop listStyle=bullet
# (optional) If the seeded line should also render as a bullet, style it:
officecli set "$FILE" "/body/tbl[1]/tr[1]/tc[1]/p[1]" --prop listStyle=bullet
```

If your seed paragraph lands at the bottom instead of the top (row-level `set c1=` sometimes appends), re-order: `officecli move "$FILE" "/body/tbl[1]/tr[1]/tc[1]/p[N]" --index 0`. Tester #1 shipped SWOT + risk matrix + scenario matrix with this pattern after `\n` literal failed.

**(f) Static TOC fallback (cross-viewer reliability).** When delivering to viewers that don't auto-recalculate fields, the live TOC field renders as the literal `Update field to see table of contents`. No CLI-only pipeline can pre-populate a TOC field the way Word does on save — this is a hard black hole, not a recipe gap. Workaround: remove the TOC field, keep the `TOCHeading` style paragraph as a visible header, then hand-write one paragraph per heading with a literal dot-leader line. Visual outcome: a plain text TOC with dots trailing to page numbers, no live field, ships correctly in any reader.

```bash
# 1. Locate and remove the raw TOC field paragraph(s) that carry the "Update field to see..." cached text
officecli query "$FILE" 'p:contains("Update field to see")'        # note the /body/p[N] paths
officecli remove "$FILE" "/body/p[N]"                              # repeat per hit

# 2. Add a visible heading where the TOC used to be (if not already present)
officecli add "$FILE" /body --type paragraph --prop text="Contents" --prop style=TOCHeading --prop size=14pt --prop bold=true --index <pos>

# 3. Hand-write one line per heading with literal dots and page number
officecli add "$FILE" /body --type paragraph --prop text="1. Executive Summary ......................................... 3" --prop size=11pt --index <pos+1>
officecli add "$FILE" /body --type paragraph --prop text="2. Market Diagnosis .......................................... 5" --prop size=11pt --index <pos+2>
# ... one per heading
```

Tester #1 shipped 13 static TOC lines this way after the live-field option left the literal prompt visible to the reader. Page numbers are manually set — open the file in Word once to learn the real numbers, then fill. The trade-off: no click-to-jump, but no placeholder text either. `add --type toc` (live field) remains correct for recipients whose viewer recalculates on open (or who will press F9) — this recipe is for everyone else.

### Forcing page breaks — belt-and-suspenders for cross-viewer reliability

Two mechanisms exist; **neither alone is reliable across every viewer**. Pagination is heuristic — depending on the viewer and preceding content state, it may silently ignore `<w:pageBreakBefore/>` OR render `<w:br w:type="page"/>` as a soft break. Cross-round testers observed the two failures in opposite directions. Apply BOTH on every H1 you want on a fresh page:

```bash
# 1. Prepend a pagebreak element BEFORE the heading
officecli add "$FILE" /body --type pagebreak --index <N>
# 2. Set pageBreakBefore=true on the heading paragraph itself
officecli set "$FILE" "/body/p[<N+1>]" --prop pageBreakBefore=true
```

Neither alone guarantees a break in every client. Observed on officecli 1.0.60: `pageBreakBefore` alone left 9 chapters mashed into 6 pages in one viewer; `--type pagebreak` alone flaked in earlier rounds. The redundant pair closes the gap.

**`break=newPage` alias (1.0.61+).** The paragraph / section prop `--prop break=newPage` is a shorter alias that maps to `pageBreakBefore=true` (accepts `newPage | page | nextPage | pageBreak`). Same underlying XML, same behavior — so the belt-and-suspenders rule still applies: use `add --type pagebreak` before the heading AND set `pageBreakBefore=true` / `break=newPage` on the heading paragraph itself.

Apply to every H1, the TOC heading, and the cover-closing paragraph. Preview via `view html --browser` and count pages to confirm.

### Template delivery — separating Template Notes from end-user content

HR / legal / vendor templates commonly carry internal-only guidance ("replace `{{CompanyName}}`", "list of expected merge columns") that must NOT ship to the end recipient. Two working patterns:

- **Trailing "Template Notes" section with a clear heading.** Add a `Heading 1` titled "Template Notes for HR Users" (or similar) at the bottom of the document, then all instruction paragraphs underneath. Before distribution, `officecli remove doc.docx /body/p[N]` every paragraph from the heading downward, or `officecli query doc.docx 'paragraph[style=Heading1]:contains("Template Notes")'` to locate the boundary. A visible heading makes the section unmistakable at review time and scriptable at delivery time. This is what Tester #2 shipped.
- **Bookmark-bounded internal section.** Wrap the guidance between two bookmarks (`add --type bookmark --prop name=__template_notes_start` / `_end`) on the paragraphs before and after the internal content. At delivery, `raw-set` removes everything between the two anchors in one pass. Slightly more fragile but more robust to accidental heading edits.

Either way, the ship-check is: after removal, `officecli query doc.docx 'p:contains("Template Notes")'` returns empty AND `query 'p:contains("{{")` (literal tokens the guide referenced) also returns empty. If the template notes paragraph survives, a downstream employee will read internal HR language. Treat this as a delivery gate for template builds.

### Advanced / specialty topics (skip if you are writing a report)

Reports, memos, letters, proposals, and HR templates don't need this section — skip to Raw-set escape hatch. Keep reading only if your document is academic (equations, footnotes, bibliography), a reviewed draft (comments, tracked changes), or marked (watermark).

**Equations and footnotes.** `--type equation` takes LaTeX — `\frac`, `\sum`, Greek letters, `\mathit` render; `\mathcal` emits invalid XML (use `\mathit` instead). Footnotes auto-number by paragraph index.

```bash
officecli add doc.docx /body --type equation --prop formula="\\frac{a}{b} + \\sum_{i=1}^{n} x_i"
officecli add doc.docx "/body/p[3]" --type footnote --prop text="See Appendix A for methodology."
```

`--type equation` always creates a standalone `/body/oMathPara[N]` block — never an inline run, even if you pass a paragraph path. For inline math inside running text, `raw-set` an `<m:oMath>` (not `<m:oMathPara>`) as a run child. Bibliography with hanging indent: `firstLineIndent=-720 indent=720` per entry (dotted `ind.hanging` is not canonical — see Known Issues).

**docx vs academic-paper skill — when to switch.** Stay in docx for: chapter drafts, ≤ 3 footnotes, ≤ 2 equations, no bibliography, no cross-refs. Switch to `academic-paper` when you need ANY of: citation styles (APA / Chicago / Harvard / IEEE / GB 7714), in-text ↔ reference list auto-linking, numbered equations with `\ref`, "List of Figures", auto-updating "see Section 3.2" cross-refs, or author-year ↔ numeric style toggles.

**Comments and tracked changes.** Bulk accept/reject: `set / --prop accept-changes=all` (or `reject-changes=all`). Locate individual changes with `query ins` and `query del` — NOT `query trackedchange` (CLI bug C-D-1). Adding an `<w:ins>` or `<w:del>` from scratch requires `raw-set`. Add a comment with `add "/body/p[4]" --type comment --prop author=... --prop text=...`. Reply threading (`parentId`) and `done=true` resolution are UNSUPPORTED — see C-D-2 / C-D-5 for `raw-set` workarounds.

**Watermark.** Two steps because `add --prop opacity=...` is UNSUPPORTED (C-D-7): `add / --type watermark --prop text="DRAFT" --prop color=BFBFBF`, then `set /watermark --prop opacity=0.8`. Default opacity is 0.5.

### Raw-set escape hatch (L1 / L2 / L3)

Three tiers of precision; use the lowest that does the job.

- **L1 — high-level props** (`--prop text=...`, `--prop style=Heading1`): your default. Works for 80% of cases.
- **L2 — dotted-attr fallback** (`pbdr.top=`, `ind.left=`, `padding.top=`, `border.*`, `font.size=`, `font.color=`): when L1 lacks the exact knob. Schema-safe for most props. Example: `--prop pbdr.bottom="single;6;1F4E79;0"`. Prefer this over raw-set when the whitelist covers your need. **Two dotted props emit invalid XML today** — `shd.fill=` (missing `w:val`) and `ind.firstLine=` (placed after `w:jc` in `pPr`). Use the canonical L1 form of these instead: `shd=clear;FFFF00` and `firstLineIndent=360`. See Known Issues → Schema-invalid-on-emit.
- **L3 — `raw-set` with XML**: last resort. Tied to OOXML knowledge; no schema protection. Use for tracked-change creation, internal hyperlinks, composite PAGE+NUMPAGES, comment `parentId`, `commentsExtended` `done=1`.

Borders go through the format `style;size;color;space`: `single;4;FF0000;1`. Hex colors never start with `#`: `FF0000`, not `#FF0000`. Scheme color names (`accent1..6`, `dark1`/`dark2`, `light1`/`light2`, `hyperlink`) are also accepted anywhere a hex color is (1.0.60+) — prefer hex when you need stable colors across themes.

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first document is almost never correct. Treat QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you were not looking hard enough. Headings look fine **until** you `view outline` and notice an H3 directly under an H1. The footer shows "Page 1" in `view text` **until** you `get --depth 3` and find it is a static run, not a field.

### Minimum cycle before "done"

1. `officecli view doc.docx issues` — empty paras, missing alt text, formatting anomalies.
2. `officecli view doc.docx outline` — heading hierarchy, TOC presence, section count. No skipped levels (H1 → H3).
3. `officecli view doc.docx text --max-lines 400` — content pass: typos, stray `\$` / `\t` / `\n` literals, placeholder tokens.
4. Query for known classes of defect:
   ```bash
   officecli query doc.docx 'p:contains("lorem")'
   officecli query doc.docx 'p:contains("xxxx")'
   officecli query doc.docx 'p:contains("TODO")'
   officecli query doc.docx 'p:contains("{{")'
   officecli query doc.docx 'p:empty'
   officecli query doc.docx 'image:no-alt'
   ```
5. `officecli validate doc.docx` — schema check. Close any resident first (see Known Issues).
6. **Visual pass — walk every page in the browser preview.** `officecli view doc.docx html --browser` renders the document. Walk every page. "validate pass" is not delivery; "the preview looks like a real document" is delivery.
7. If anything failed, fix, then **rerun the full cycle**. One fix commonly creates another problem.

### Delivery Gate (run before handing off — any failure = REJECT, do NOT deliver)

The three checks below are the automated half of the QA cycle; they catch the five defect classes that burnt R1 testers (228 `shd` schema errors, shell-escape leak into cover titles, TOC placeholder visible to reader, static-text footer instead of live PAGE, unreplaced template tokens). Copy-paste this block, substitute your file, and refuse to declare done until every command prints OK.

```bash
FILE="doc.docx"

# Gate 1 — schema. Any error = REJECT.
officecli close "$FILE" 2>/dev/null
officecli validate "$FILE" | grep -q "no errors found" || { echo "REJECT: validate failed"; exit 1; }

# Gate 2 — token leak via CLI text-layer view. Greps for tokens that must NEVER appear in a delivered file.
officecli view "$FILE" text | \
  grep -nE '(\$[A-Za-z_]+\$|\{\{[^}]+\}\}|<TODO>|xxxx|lorem|Update field to see|\\[\$tn])' && \
  { echo "REJECT: token leak (see line(s) above)"; exit 1; } || echo "Gate 2 OK"

# Gate 3 — live-field structural spot-check. A footer showing the literal word "Page" with no live PAGE field is a static run.
# Use `query` (operates on semantic elements) OR `raw` (inspects the XML part) — both reveal fldChar.
officecli query "$FILE" 'field[fieldType=page]' | grep -q . || \
  officecli raw "$FILE" "/footer[1]" 2>/dev/null | grep -q fldChar || \
  { echo "REJECT: no live PAGE field found"; exit 1; }
echo "Delivery Gate PASS"
```

The greps above correspond one-to-one with R1 failures: `$...$` catches shell-escape leaks (Tester #1's `USM` after `US$22B` got eaten), `{{...}}` catches unmigrated template tokens, `Update field to see` catches the unpopulated-TOC placeholder, `\$`/`\t`/`\n` catches shell-escape literals dropped into text. Every gate must print its success message before you declare the file delivered.

### Field / cached-value spot-check

TOC, PAGE, NUMPAGES, MERGEFIELD are all fields with **cached values** that may be stale or empty at write time. Confirm existence by structure, not by text.

- [ ] Footer PAGE field: `get /footer[N] --depth 3` lists the runs that carry the `fldChar begin` / `instrText` / `fldChar separate` / cached value / `fldChar end` chain — expect ≥ 5 runs for a single PAGE, ≥ 11 for composite "Page X of Y". For the underlying `<w:fldChar>` XML, use `officecli raw doc.docx "/footer[1]" | grep -c fldChar`, or run `officecli query doc.docx 'field[fieldType=page]'` for a semantic match. If you see a single run with text `"Page"`, the field is missing — re-add with `--prop field=page`.
- [ ] TOC: `get /body/toc[1] --depth 2` must show field structure. In some viewers the TOC shows `1 1 1 1` for page numbers or the literal `Update field to see table of contents` until recalculated (see TOC delivery step).
- [ ] MERGEFIELD: `query 'field[fieldType=mergefield]'` — one entry per template slot. No literal `{{name}}` text elsewhere.
- [ ] SEQ / PAGEREF (if your document uses them via raw-set): confirm each `<w:fldChar>` chain exists by `raw`-inspecting the `document.xml`.

**Cross-viewer caveat on PAGE fields**: some viewers render PAGE field text as the literal word "Page" (no number) until the reader recalculates. This is a [RENDERER-BUG], not a skill defect. Judge by whether `fldChar` children exist, not by whether the visible text shows a digit.

### Fresh eyes (subagent)

You are reading the same document you wrote. Spawn a subagent with the single instruction: "Open `doc.docx`, list every problem you see — typos, formatting inconsistencies, missing headings, orphaned paragraphs, placeholder text that looks like content." Fresh eyes find what the builder's eyes confirm.

### Honest limit

`officecli validate` catches schema errors, not design errors. A document can pass `validate` with:

- wrong heading hierarchy (H1 → H3)
- wrong font sizes that "look like" Heading 1 but are literal 14pt on Normal
- placeholder tokens rendered as body text
- an empty first-page footer attached to a document that has no cover

The checklist above — especially the browser-preview visual pass and the field structure check — is how you catch what validation can't.

### QA display notes (don't chase these)

- `view text` shows `"1."` for every numbered list item regardless of rendered number. The actual rendered output increments correctly. Not a defect.
- `view issues` flags "body paragraph missing first-line indent" on cover-page paragraphs, centered headings, list items, bibliography entries, callout boxes. First-line indent is only required for APA/academic body text. On professional documents (block style) these warnings are expected.

## Known Issues & Pitfalls

Organized by source. When something "looks broken", attribute it before chasing it:

- **[AGENT-ERROR]** — the document itself is wrong (structure / data / formatting). Fix the document.
- **[RENDERER-BUG]** — the document is correct; a specific viewer renders it differently. Don't chase.
- **[SKILL gap]** — the skill didn't teach the relevant rule. Open an issue against the skill.

### Schema-invalid-on-emit — disabled APIs + working forms

These props exit 0 at write time but produce XML that fails `validate` on close. All three are from real R1 failures. Use the working form on the right.

| Disabled (causes schema error)                    | Working form                                                                                   | Where it hurts                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prop shd.fill=XXXXXX` on paragraph             | `--prop shd="clear;XXXXXX"` (canonical) — or for table cells, `--prop fill=XXXXXX` on the cell | `<w:shd>` emitted without required `w:val`; affects every paragraph-shaded row / cover band / callout                                        |
| `--prop ind.firstLine=360` (dotted)               | `--prop firstLineIndent=360` (canonical)                                                       | Dotted form emits `<w:ind>` AFTER `<w:jc>` in `pPr` — ordering violation. Breaks every indented body paragraph in APA-style academic writing |
| `--prop border.bottom=...` on a table cell (`tc`) | `--prop pbdr.bottom="single;6;1F4E79;0"` on the cell's inner paragraph                         | `<w:tcBorders>` placed wrong inside `<w:tcPr>`. See C-D-4                                                                                    |

**Before shipping, confirm these props are not in your build pipeline**:

```bash
# In the command log / batch JSON, grep for the three failing forms
grep -nE '(shd\.fill|ind\.firstLine|border\.(top|bottom|left|right)[^a-z])' commands.log
# Any hit = rewrite the command with the working form on the right.
```

`raw-set` escape hatch if neither form fits: inject `<w:shd w:val="clear" w:color="auto" w:fill="1F4E79"/>` or reorder `<w:ind>` / `<w:jc>` after emit. Post-patching with a Python `zipfile` + XML edit is acceptable; Tester #3 did exactly this to ship.

### Shell escape — three layers to keep separate

The CLI does not interpret `\$`, `\t`, `\n`. They land in your document as literal characters.

1. **Shell level.** `$` in a prop value → single-quote the whole value: `--prop text='$50M'`. Unescaped `$50M` gets stripped to `M` by the shell.
2. **JSON level (batch).** Standard JSON escapes — `"\n"`, `"\t"`, `"\""`. A real newline inside a cell/paragraph goes via `"\n"` in JSON (CLI passes the real `\n` char to Word). Writing `\n` (two characters) in a shell-quoted `--prop text=` is a bug — Word shows `\n` text.
3. **Word level.** Word's own literal `\n` is not a newline — it is two characters. If you need a soft line break inside a run, use `<w:br/>` via `raw-set`, or split into separate paragraphs.

If in doubt, `view text` after writing and compare character-for-character.

### CLI bug backlog (short workarounds)

Skill-layer workarounds; full CLI fixes pending. C-D-3 and C-D-4 are the two you will actually hit on a report build — the rest cluster around academic / reviewed-document territory (see Advanced / specialty topics).

- **C-D-3 `add picture --prop alt=` silent drop.** Add the picture first, then `set` the `alt` on the resulting run — two commands. Confirm with `query 'image:no-alt'`.
- **C-D-4 cell-level `border.bottom` / per-side `border.*` schema error.** `<w:tcBorders>` is placed in the wrong position inside `<w:tcPr>` and `validate` fails. Workaround: use paragraph-level `pbdr.*` on the cell's inner paragraph (`--prop pbdr.bottom="single;6;1F4E79;0"`), or fix structure with `raw-set`.

Specialty-only (skip unless you hit them):

- **C-D-1** `query trackedchange` returns empty → use `query ins` + `query del`.
- **C-D-2** `set /comments/comment[N] --prop done=true` silent no-op → `raw-set` into `commentsExtended.xml`.
- **C-D-5** Comment `--prop parentId=N` UNSUPPORTED → sibling comment, or `raw-set` `<w:comment w:parentId="N">`.
- **C-D-6** `add num --prop abstractNumId=N` may silent-bind wrong when built-ins exist → `get /numbering --depth 2` after add, correct with `set /numbering/num[N] --prop abstractNumId=...`.
- **C-D-7** Watermark `opacity` asymmetric — `add` rejects, `set` accepts → two-step (see Advanced topics).

### Renderer quirks (cross-viewer)

`officecli view html --browser` is the right tool for structural QA (overflow, placeholder leakage, hierarchy, layout). Some features vary by the viewer the end user opens the file in. Observed divergences, all [RENDERER-BUG]:

- **PAGE field may render as literal "Page" (no number)** in some viewers until the reader recalculates. Judge field presence by `get --depth 3` finding `<w:fldChar>`, not by eyeballing a digit.
- **TOC cached page numbers may read "1 1 1 1"** until a human opens the file and recalculates (F9 in Word).
- **Pie / doughnut chart fill may collapse to one color** in some viewers (column / bar render fine). Switch to column / bar or accept the render caveat.
- **Form-control checkboxes may render double-boxed** in some viewers.
- **OMML equation baselines** may shift across viewers; the underlying XML is identical.

Before calling a color, field, or chart broken, open the file in the user's target viewer. If it looks correct there, it is a viewer quirk — do not chase.

### `validate` caveats

- **Do NOT run `validate` while a resident is open.** `view --open` and `validate` briefly conflict on the file; `validate` reports spurious `drawing` / `tableParts` errors. Always `officecli close <file>` first.
- **`validate` does not check design.** Heading hierarchy, typography, placeholder leakage, empty covers pass validate but fail delivery. See QA section.

### Batch / resident mode

- **Batch + resident occasional failure** (1-in-10 to 1-in-15). Symptom: "Failed to send to resident". Retry the command, or close/reopen the file. Split large batch arrays into ≤ 12-op chunks for reliability.
- **Echo into batch breaks on `$` / `'`.** Use heredoc: `cat <<'EOF' | officecli batch doc.docx` — single-quoted delimiter prevents shell expansion.
- **Table `--index` positioning unreliable.** `--index N` on table add may be ignored. Add content in the intended order; or remove/re-add surrounding elements.

### Common pitfalls

| Pitfall                                                                   | Correct approach                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--index` vs `[N]`                                                        | `--index` is 0-based (array convention); `[N]` paths are 1-based (XPath)                                                                                                                                                                                |
| Unquoted `[N]` in zsh/bash                                                | Quote every path: `"/body/p[1]"`                                                                                                                                                                                                                        |
| `[last]` as predicate                                                     | Must be `[last()]` with parens. `/body/tbl[last()]/tr[1]` valid; `[last]` throws "Malformed path segment"                                                                                                                                               |
| Raw twips in spacing                                                      | Use unit-qualified values: `12pt`, `0.5cm`, `1.5x`                                                                                                                                                                                                      |
| Empty paragraphs for spacing                                              | Use `spaceBefore` / `spaceAfter` on paragraphs                                                                                                                                                                                                          |
| Row-level `set` for formatting                                            | Row `set` only supports `height`, `header`, `c1..cN` text. Format goes on cell paragraph / run                                                                                                                                                          |
| `listStyle` on a run                                                      | `listStyle` is a paragraph property                                                                                                                                                                                                                     |
| Indent via leading spaces                                                 | Use `--prop indent=720` (twips) for left indent, `--prop firstLineIndent=360` for first line, `--prop hangingIndent=720` for hanging. Leading spaces fire `view issues`. Dotted `ind.left` works; dotted `ind.firstLine` does NOT — use canonical names |
| Cover page number suppression via `set differentFirstPage=true`           | UNSUPPORTED. Add a first-type footer instead: `--type footer --prop type=first --prop text=""`                                                                                                                                                          |
| TOC `--prop pagenumbers=true`                                             | UNSUPPORTED. Page numbers render automatically                                                                                                                                                                                                          |
| `--type pagebreak` OR `pageBreakBefore` alone not breaking across viewers | Apply BOTH: `add /body --type pagebreak` before the heading AND `set /body/p[N+1] --prop pageBreakBefore=true`. Some viewers heuristically drop either one; the pair is the only reliable recipe (see Forcing page breaks)                              |
| Row-level `c1="line1\nline2"` for multi-line cell                         | `\n` lands as a literal. Use recipe (e): seed one bullet, then `add paragraph` to the cell for each subsequent line                                                                                                                                     |
| Raw-set when dotted-attr would work                                       | Prefer L2 (`pbdr.top=`, `ind.left=`, `font.size=`) over L3 raw-set. `shd.fill=` and `ind.firstLine=` are NOT safe — use canonical `shd=clear;XXXXXX` and `firstLineIndent=N`                                                                            |
| Next paragraph picks up the previous Heading style                        | If a Heading2 `Next body line` sneaks through, set explicit `--prop style=Normal` on the following paragraph                                                                                                                                            |
| Modifying a file open in Word                                             | Close it in Word first                                                                                                                                                                                                                                  |

### Help pointer

When in doubt: `officecli help docx`, `officecli help docx <element>`, `officecli help docx <verb> <element>`, `--json` for agents. Help is the authoritative schema; this skill is the decision guide.
