<!-- officecli: v1.0.24 -->

# Creating an Academic Paper

Complete guide for building a formally structured Word document with TOC, equations, footnotes, and scholarly formatting. Follow this step by step. For general building blocks (paragraphs, runs, tables, images, lists, charts), see [docx creating.md](../docx/creating.md).

---

## Section A: Overview and Decision Logic

### A.1 What You Will Build

A single `.docx` file with: cover page, Table of Contents, structured sections with headings, optional equations/footnotes/endnotes, bibliography with hanging indent, and professional formatting throughout.

Three non-negotiable principles:

- **All styles defined BEFORE any content** -- never rely on Word defaults
- **TOC uses native Word field** -- updateable, not manually typed
- **Bibliography uses hanging indent paragraphs** -- each reference is a separate paragraph

### A.2 Analyze the Input (MANDATORY FIRST STEP)

Before writing any commands:

1. **Classify the paper type** -- social science (APA), physics/math, white paper, or closest match
2. **List required features** -- TOC, equations, footnotes, multi-column, landscape, custom styles
3. **Look up the Feature Selection Table** (A.3) to confirm which sections to follow
4. **Estimate command count** -- 45-60 (simple), 55-70 (medium), 80-100 (complex)

### A.3 Feature Selection Table

> **This table is the authoritative navigation aid.** Use it to decide which sections of this guide to follow. Skip sections marked NO for your paper type.

| Feature                      | Social Science (APA) | Physics/Math  | White Paper | Section          |
| ---------------------------- | :------------------: | :-----------: | :---------: | ---------------- |
| TOC                          |         YES          |      YES      |     YES     | C.2              |
| Equations (OMML)             |          NO          |      YES      |     NO      | D.1              |
| Footnotes                    |    YES (endnotes)    |      YES      |     YES     | D.3              |
| Multi-column abstract        |          NO          |      YES      |     NO      | C.1              |
| Landscape sections           |          NO          | YES (figures) |     NO      | B.3              |
| Section breaks               |          NO          |      YES      | YES (cover) | B.3              |
| Custom styles (Theorem etc.) |          NO          |   Optional    |     NO      | B.2              |
| Paragraph borders            |          NO          |   Optional    |     NO      | D.2              |
| Watermark                    |          NO          |      NO       |     YES     | E.2              |
| Charts                       |          NO          |      NO       |     NO      | docx creating.md |
| Cross-references (REF)       |          NO          |      NO       |     NO      | E.3              |
| Header/footer branding       |          NO          |      NO       |     YES     | E.1              |

> **STOP here and plan.** Before writing any commands, write out:
>
> 1. Which paper type? Which features from the table?
> 2. How many sections, headings, tables, equations, footnotes?
> 3. Will you need section breaks? If yes, plan the index offsets now.

---

## Section B: Setup and Styles

### B.1 Create and Configure

```bash
# Create document
officecli create paper.docx

# Set default font
officecli set paper.docx / --prop defaultFont="Times New Roman"

# Set metadata
officecli set paper.docx / --prop title="Paper Title" --prop author="Author Name"

# Set margins (1 inch = 1440 twips on all sides)
officecli set paper.docx '/section[1]' --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440
```

**Paper-type line spacing:**

| Paper Type           | Body lineSpacing | Font            | Size |
| -------------------- | ---------------- | --------------- | ---- |
| APA / Social Science | `2x` (double)    | Times New Roman | 12pt |
| Physics / Math       | `1.5x`           | Times New Roman | 11pt |
| White Paper          | `1.15x`          | Calibri         | 11pt |

### B.2 Define ALL Styles Upfront (NON-NEGOTIABLE)

> **WARNING: Skipping style definitions causes formatting failures. Define ALL styles before adding ANY content. This is the #1 failure mode in document creation.**

> **WARNING: Blank documents created with `officecli create` have NO styles part. You MUST use `add /styles --type style` to create heading styles -- `set /styles/Heading1` will FAIL on a blank document because the style does not exist yet.**

```bash
# Create heading styles (add, NOT set -- blank documents have no built-in styles)
officecli add paper.docx /styles --type style --prop id=Heading1 --prop name="Heading 1" --prop type=paragraph --prop font="Times New Roman" --prop size=16 --prop bold=true --prop spaceBefore=360 --prop spaceAfter=120 --prop keepNext=true
officecli add paper.docx /styles --type style --prop id=Heading2 --prop name="Heading 2" --prop type=paragraph --prop font="Times New Roman" --prop size=14 --prop bold=true --prop spaceBefore=360 --prop spaceAfter=80 --prop keepNext=true
officecli add paper.docx /styles --type style --prop id=Heading3 --prop name="Heading 3" --prop type=paragraph --prop font="Times New Roman" --prop size=12 --prop bold=true --prop italic=true --prop spaceBefore=240 --prop spaceAfter=80 --prop keepNext=true

# Create custom styles (only if needed per Feature Selection Table)
officecli add paper.docx /styles --type style --prop id=AbstractTitle --prop name="Abstract Title" --prop basedOn=Normal --prop font="Times New Roman" --prop size=14 --prop bold=true --prop alignment=center
# AbstractTitle is a separate style (not Heading1) to prevent the abstract from appearing
# in the TOC. If you use Heading1 for "Abstract", it will be listed in the Table of Contents
# alongside body sections.
officecli add paper.docx /styles --type style --prop id=Caption --prop name=Caption --prop basedOn=Normal --prop font="Times New Roman" --prop size=10 --prop italic=true

# Physics/Math only: Theorem, Definition, Proof styles
officecli add paper.docx /styles --type style --prop id=Theorem --prop name=Theorem --prop basedOn=Normal --prop italic=true --prop font="Times New Roman" --prop size=11 --prop spaceBefore=240 --prop spaceAfter=120
officecli add paper.docx /styles --type style --prop id=Definition --prop name=Definition --prop basedOn=Normal --prop font="Times New Roman" --prop size=11 --prop spaceBefore=240 --prop spaceAfter=120
officecli add paper.docx /styles --type style --prop id=Proof --prop name=Proof --prop basedOn=Normal --prop italic=true --prop font="Times New Roman" --prop size=11
```

### B.3 Section Break Strategy

> **D-1: Section break inserts an empty paragraph.** After `add /body --type section`, one empty paragraph is added to `/body`. All subsequent `p[N]` indices shift by +1.

**Before section break:**

```
p[6] = "Methods text"
```

**After `officecli add paper.docx /body --type section --prop type=continuous`:**

```
p[6] = "Methods text"
p[7] = ""                  <-- empty paragraph (section break marker)
p[8] = next content         <-- shifted +1
```

**Plan all section breaks BEFORE building.** Count them and add their +1 offsets to your paragraph index plan.

**Multi-column abstract** -- section break pair with columns=2, then explicit revert. For dual-column abstracts, ensure at least 150-200 words so both columns are filled evenly. Short abstracts (< 100 words) will appear only in the left column.

> **WARNING: The final sectPr inherits the last section's properties. Adding a section break does NOT automatically revert columns to 1. You MUST explicitly set `columns=1` on the section after the multi-column zone, or the rest of the document (including body text, references, etc.) will render as 2-column.**

```bash
officecli add paper.docx /body --type section --prop type=continuous    # start 2-col zone
officecli set paper.docx '/section[N]' --prop columns=2
# ... add abstract content here ...
officecli add paper.docx /body --type section --prop type=continuous    # end 2-col zone
officecli set paper.docx '/section[N+1]' --prop columns=1              # REQUIRED: explicitly reset to 1 column
```

**Verification (REQUIRED after multi-column setup):**

```bash
# Check columns on each section -- all sections after the abstract must show columns=1
officecli get paper.docx '/section[1]'
officecli get paper.docx '/section[2]'
officecli get paper.docx '/section[3]'
# ... check every section. If any non-abstract section shows columns=2, fix with:
# officecli set paper.docx '/section[K]' --prop columns=1
```

**Landscape section** -- for wide tables/figures:

```bash
officecli add paper.docx /body --type section --prop type=nextPage --prop orientation=landscape
# ... add wide content ...
officecli add paper.docx /body --type section --prop type=nextPage --prop orientation=portrait
```

---

## Section C: Structure

### C.1 Title Block / Cover Page

```bash
officecli add paper.docx /body --type paragraph --prop text="Paper Title Here" --prop alignment=center --prop font="Times New Roman" --prop size=20 --prop bold=true --prop spaceBefore=72pt --prop spaceAfter=24pt
officecli add paper.docx /body --type paragraph --prop text="Author One, Department, University" --prop alignment=center --prop size=12 --prop spaceAfter=6pt
officecli add paper.docx /body --type paragraph --prop text="Author Two, Department, University" --prop alignment=center --prop size=12 --prop spaceAfter=24pt
officecli add paper.docx /body --type pagebreak   # or section break for white paper
```

### C.2 Table of Contents

```bash
officecli add paper.docx /body --type toc --prop levels=1-3 --prop title="Table of Contents"
```

The TOC is a native Word field. It shows "Update Field" prompt in Word -- right-click and select "Update entire table" to populate. Add the TOC early in the document; it picks up all headings regardless of section breaks.

Add a page break after the TOC to separate it from body content:

```bash
officecli add paper.docx /body --type pagebreak
```

### C.3 Body Sections with Headings

```bash
# Heading1 section
officecli add paper.docx /body --type paragraph --prop text="Introduction" --prop style=Heading1

# Body paragraph (adjust lineSpacing per paper type from B.1)
officecli add paper.docx /body --type paragraph --prop text="This paper examines..." --prop font="Times New Roman" --prop size=12 --prop lineSpacing=2x --prop spaceAfter=0pt --prop firstLineIndent=720

# Heading2 sub-section
officecli add paper.docx /body --type paragraph --prop text="1.1 Background" --prop style=Heading2
```

For APA style: use `firstLineIndent=720` (0.5") on body paragraphs, `lineSpacing=2x`, no extra `spaceAfter`.

---

## Section D: Content

### D.1 Equations -- Display and Inline

```bash
# Display equation (centered, own line)
officecli add paper.docx /body --type equation --prop "formula=E = mc^2"

# Inline equation (within existing paragraph)
officecli add paper.docx '/body/p[N]' --type equation --prop "formula=x^2 + y^2 = r^2" --prop mode=inline

# Complex equation via heredoc (avoids escaping)
cat <<'EOF' | officecli batch paper.docx
[{"command":"add","parent":"/body","type":"equation","props":{"formula":"\\frac{1}{2\\pi} \\int_{BZ} \\Omega(\\mathbf{k}) \\, d^2\\mathbf{k}"}}]
EOF
```

**Shell escaping:** bash `--prop` = double backslash (`\\frac`), batch JSON = quadruple (`\\\\frac`), heredoc = double (`\\frac`).

> **WARNING: Inline equations are appended to the end of the target paragraph, not inserted at a specific position within the text.** For best results, structure the paragraph so the equation naturally belongs at the end, or split the sentence into two paragraphs with the equation between them.

> **D-2: `\left`/`\right` + subscript/superscript crashes.** Any `\left[...\right]` or `\left(...\right)` containing subscript or superscript content throws a cast error. Use plain `(`, `)`, `[`, `]` instead -- OMML auto-sizes delimiters in display mode.

> **D-3: `\mathcal` causes validation error.** Use `\mathit{L}` or plain letters instead.

See SKILL.md Core Concepts for the full verified LaTeX subset table.

> **Known limitation: Equation numbering (e.g., "(1)", "(2)") is not natively supported.** There is no automatic equation numbering mechanism in the current version. For papers requiring numbered equations (especially physics/math), manually add the number as a right-aligned tab stop in the same paragraph using `raw-set`, or accept unnumbered display equations.

### D.2 Custom Blocks: Theorem, Definition, Proof

Two-step pattern required -- borders cannot be set at the style level (see D-4 in Section G).

```bash
# Step 1: add paragraph with style. Step 2: set border.
officecli add paper.docx /body --type paragraph --prop text="Theorem 1 (Central Limit Theorem). Let X_1, X_2, ..., X_n be i.i.d..." --prop style=Theorem
officecli set paper.docx '/body/p[N]' --prop "pbdr.all=single;4;4472C4;4"

officecli add paper.docx /body --type paragraph --prop text="Definition 1 (Convergence). A sequence converges..." --prop style=Definition
officecli set paper.docx '/body/p[M]' --prop "pbdr.all=single;4;888888;4"

# Proof (italic, no border needed)
officecli add paper.docx /body --type paragraph --prop text="Proof. Follows from characteristic function approach. QED." --prop style=Proof
```

Multi-paragraph bordered blocks: each paragraph needs its own `pbdr.all` set command. Border format: `style;size;color;space` (e.g., `single;4;4472C4;4` = blue, ~0.5pt, 4pt padding).

### D.3 Footnotes and Endnotes

Footnotes are inline reference runs -- they do NOT create new paragraphs and do NOT shift indices. Add in any order. Recommended workflow: add all body content first, then footnotes in forward order.

```bash
officecli add paper.docx '/body/p[3]' --type footnote --prop text="Smith et al., 2024, Journal of Research, 45(2), pp.112-130."
officecli add paper.docx '/body/p[5]' --type endnote --prop text="See appendix for extended discussion."
```

Batch for performance (not required for correctness):

```bash
cat <<'EOF' | officecli batch paper.docx
[
  {"command":"add","parent":"/body/p[3]","type":"footnote","props":{"text":"First footnote."}},
  {"command":"add","parent":"/body/p[5]","type":"footnote","props":{"text":"Second footnote."}},
  {"command":"add","parent":"/body/p[8]","type":"footnote","props":{"text":"Third footnote."}}
]
EOF
```

### D.4 Tables

For table building blocks (header rows, cell styling, merging), see [docx creating.md](../docx/creating.md#tables----creation--basic-styling). Academic table recipe:

```bash
officecli add paper.docx /body --type table --prop rows=5 --prop cols=4 --prop style=TableGrid --prop alignment=center --prop width=100%
officecli set paper.docx '/body/tbl[1]/tr[1]' --prop c1="Variable" --prop c2="Mean" --prop c3="SD" --prop c4="N" --prop header=true
# Style each header cell individually (row set does NOT support bold/shd/color)
officecli set paper.docx '/body/tbl[1]/tr[1]/tc[1]' --prop bold=true --prop shd=2E4057 --prop color=FFFFFF
# ... repeat for tc[2], tc[3], tc[4] ...
officecli set paper.docx '/body/tbl[1]/tr[2]' --prop c1="Age" --prop c2="38.4" --prop c3="7.2" --prop c4="47"
officecli set paper.docx '/body/tbl[1]' --prop border.all="single;4;CCCCCC;0"
# Caption
officecli add paper.docx /body --type paragraph --prop text="Table 1. Participant Demographics" --prop style=Caption
```

### D.5 Bibliography

Each reference is a separate paragraph with hanging indent (0.5" = 720 twips).

```bash
officecli add paper.docx /body --type paragraph --prop text="References" --prop style=Heading1
# APA: Author (Year) format, double-spaced
officecli add paper.docx /body --type paragraph --prop text="Barley, S. R., & Kunda, G. (2001). Bringing work back in. Organization Science, 12(1), 76-95." --prop leftIndent=720 --prop hangingIndent=720 --prop font="Times New Roman" --prop size=12 --prop lineSpacing=2x
# Physics: [N] numbered format, 1.5-spaced
officecli add paper.docx /body --type paragraph --prop text="[1] Haldane, F. D. M. (1988). Model for a quantum Hall effect. PRL, 61, 2015." --prop leftIndent=720 --prop hangingIndent=720 --prop font="Times New Roman" --prop size=11 --prop lineSpacing=1.5x
```

---

## Section E: Polish

### E.1 Headers and Footers

> **WARNING: `add /footer[1]/p[1] --type field` creates a NEW paragraph in the footer.** This means text like "Page " and the page number will appear on separate lines (e.g., "Page\n3"). This is a known CLI limitation. The recommended approach is to create the footer with initial text and then add the field, accepting the 2-line layout, or use the single-command approach below.

> **WARNING: Do NOT execute footer field commands more than once.** Duplicate execution creates duplicate page numbers (e.g., "6\n6"). After adding a footer, verify with `officecli get paper.docx '/footer[1]'` to confirm only one page field exists.

```bash
# Simple footer with centered page number
officecli add paper.docx / --type footer --prop alignment=center
officecli add paper.docx '/footer[1]/p[1]' --type field --prop fieldType=page --prop size=10

# Header with branding (white paper only)
officecli add paper.docx / --type header --prop text="Organization Name | DOC-ID-001" --prop alignment=right --prop size=9 --prop color=888888
```

**"Page X of Y" pattern:** Currently there is no single-command way to produce "Page X of Y" on one line. The `fieldType=page` and `fieldType=numpages` each create their own paragraph. For a simple page number, use the pattern above. For "Page X of Y", see [docx creating.md](../docx/creating.md#headers--footers) for raw-set workarounds, or accept the limitation and use a simple page number field.

**Verification after footer setup:**

```bash
officecli get paper.docx '/footer[1]'   # Confirm paragraph count and field presence
```

### E.2 Watermark

```bash
officecli add paper.docx / --type watermark --prop text=CONFIDENTIAL --prop color=DDDDDD
```

Watermark, footnotes, and TOC coexist without interference -- verified in v1.0.24. No special ordering required.

### E.3 Bookmarks and Cross-References

```bash
# Add bookmark on a heading paragraph
officecli add paper.docx '/body/p[N]' --type bookmark --prop name="thm_chern" --prop text="Theorem 1"

# Cross-reference from another paragraph (REF field)
officecli add paper.docx '/body/p[M]' --type field --prop instruction=" REF thm_chern \\h " --prop text="Theorem 1"
```

> **WARNING: `--prop text="..."` on a bookmark creates a visible text run appended to the paragraph.** If the paragraph already contains the target text (e.g., "Theorem 1"), omit the `text` property to avoid duplicate visible text. Use `--prop text=` only when the paragraph is empty or you want to insert new visible text at the bookmark location.

REF field text is static until the user updates fields in Word (Ctrl+A, F9). Internal hyperlinks (`#anchor`) are not supported -- use REF field + bookmark instead. For other field types (page numbers, dates), see [docx creating.md](../docx/creating.md#fields).

---

## Section F: QA Checklist

### F.1 Verification Commands

```bash
officecli validate paper.docx          # XML structure -- must return 0 errors
officecli view paper.docx outline      # Heading hierarchy + element counts
officecli view paper.docx issues       # Automated issue detection
officecli view paper.docx text         # Content verification
officecli view paper.docx annotated    # Formatting verification
officecli query paper.docx 'p:empty'   # Check for empty spacing paragraphs
```

### F.2 Academic-Specific Checks

- [ ] TOC lists all Heading1/2/3 entries (`view outline` shows heading tree)
- [ ] Every equation renders as OMML (`view text` shows `[Equation]` markers)
- [ ] Footnote markers at correct paragraphs (`view annotated` shows footnote refs)
- [ ] Bibliography has hanging indent on every reference
- [ ] Font hierarchy is consistent: H1 >= 16pt, H2 >= 14pt, H3 >= 12pt, body = 11-12pt
- [ ] Page margins are 1 inch (1440 twips) on all sides
- [ ] Line spacing matches paper type (double for APA, 1.5 for physics, 1.15 for white paper)
- [ ] No empty paragraphs used as spacing
- [ ] Multi-column abstract reverts to single-column (`get '/section[N]'` for each section -- all non-abstract sections must show columns=1)
- [ ] Landscape sections revert to portrait

### F.3 Verification Loop

1. Generate document
2. Run `validate` + `view outline` + `view issues` + `view text`
3. Fix issues found
4. Re-verify -- one fix often creates another problem
5. Repeat until clean pass. **Do not declare success without at least one fix-and-verify cycle.**

NOTE: No visual preview for docx (unlike pptx). User must open in Word for visual confirmation.

---

## Section G: Known Bugs and Lessons

> **Read these before building. Each one has caused failures in testing.**

### D-1: Section Break Inserts Empty Paragraph (+1 Index Offset)

Each `add /body --type section` inserts one empty paragraph. All subsequent `p[N]` indices shift by +1 per section break.

```
Before: p[6] = "Methods text"
After section break: p[7] = "" (empty), p[8] = "Results" (shifted +1)
```

Always plan section break count and add their offsets to your index calculations.

### D-2: `\left`/`\right` + Subscript/Superscript Crashes

```
WRONG:  \left[ x_{i}^{2} \right]  --> cast error crash
CORRECT: [ x_{i}^{2} ]            --> OMML auto-sizes brackets
```

Use plain delimiters `(`, `)`, `[`, `]` in ALL equations. OMML automatically sizes them in display mode.

### D-3: `\mathcal` Causes Validation Error

```
WRONG:  \mathcal{L}  --> invalid m:scr XML
CORRECT: \mathit{L}  --> renders as italic L
```

### D-4: Paragraph Borders Cannot Be Set at Style Level

```
SILENTLY DROPPED: add /styles --prop "pbdr.all=single;4;4472C4;4"
REJECTED:         set /styles/Theorem --prop "pbdr.all=single;4;4472C4;4"
CORRECT:          set '/body/p[N]' --prop "pbdr.all=single;4;4472C4;4"
```

The raw XML confirms: no `<w:pBdr>` element is written to the style definition even though the `add` command succeeds without error.

### D-5: Shell Escaping for LaTeX Formulas

- Direct `--prop`: double backslash -- `"formula=\\frac{a}{b}"`
- Batch JSON (no heredoc): quadruple backslash -- `"formula": "\\\\frac{a}{b}"`
- Heredoc batch (recommended): double backslash -- `"formula": "\\frac{a}{b}"`

For `$` dollar signs in text, see D-10.

### D-6: Batch JSON Values Must Be Strings

`CORRECT: {"bold":"true","size":"11"}` / `WRONG: {"bold":true,"size":11}` -- non-string values fail with deserialization error.

### D-7: Batch Intermittent Failure (~1-in-15)

May fail with "Failed to send to resident". Keep arrays to 10-15 max, retry on failure, use heredoc syntax.

### D-8: Table `--index` Positioning Unreliable

`--index N` on `add /body --type table` may be ignored. Add content in desired order instead.

### D-9: Internal Hyperlinks Not Supported

`hyperlink` only accepts `https://...` URIs. Use REF field + bookmark for internal cross-references (Section E.3).

### D-10: Dollar Sign `$` in Text Content

Bash interprets `$` inside double quotes as variable expansion. `--prop text="costs $2.8 billion"` silently drops `$2` (undefined variable → empty string).

```
WRONG:  --prop text="costs $2.8 billion"     → "costs .8 billion"
CORRECT: --prop text='costs $2.8 billion'     → single quotes prevent expansion
CORRECT: --prop text="costs \$2.8 billion"    → escaped dollar sign
```

Use single quotes for any text containing `$`. If the text also contains single quotes, use heredoc batch syntax.
