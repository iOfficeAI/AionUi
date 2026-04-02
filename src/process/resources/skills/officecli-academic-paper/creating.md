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

| Feature | Social Science (APA) | Physics/Math | CS / Engineering | Life Science / Biomedical | White Paper | Section |
|---------|:---:|:---:|:---:|:---:|:---:|---------|
| TOC | YES | YES | Optional | Optional | YES | C.2 |
| Equations (OMML) | NO | YES | Optional | NO | NO | D.1 |
| Footnotes | YES (endnotes) | YES | YES (see D.3) | NO | YES | D.3 |
| Multi-column abstract | NO | YES | NO | NO | NO | C.1 |
| Landscape sections | NO | YES (figures) | NO | YES (figures) | NO | B.3 |
| Section breaks | NO | YES | NO | YES (cover) | YES (cover) | B.3 |
| Custom styles (Theorem etc.) | NO | Optional | NO | NO | NO | B.2 |
| Paragraph borders | NO | Optional | NO | NO | NO | D.2 |
| Watermark | NO | NO | NO | NO | YES | E.2 |
| Charts | NO | NO | NO | NO | NO | docx creating.md |
| Cross-references (REF) | NO | NO | NO | NO | NO | E.3 |
| Header/footer branding | NO | NO | NO | NO | YES | E.1 |

**CS / Engineering paper defaults:** body `lineSpacing=1.5x`, font `Times New Roman` or `Calibri` 11-12pt, references in numbered `[1]` format with `leftIndent=720 hangingIndent=720`, first-line indent optional (block style also acceptable). Use `spaceBefore=360` on Heading1 (same as Physics/Math). Footnotes are supported (see D.3); inline citations in `[N]` format are more common but footnotes may be used when the venue requires them.

**Life Science / Biomedical paper defaults:** Single-column layout (no multi-column abstract). Body `lineSpacing=1.5x` or `2x` (varies by journal — Nature uses 1.5x, many others require double-spaced). Font `Times New Roman` or `Arial` 11-12pt. References in numbered `[N]` format (ACS/Nature/Vancouver style) with `leftIndent=720 hangingIndent=720`. Key structural additions:
- **Figure captions** are critical — use the Caption style below each image/placeholder (figure caption goes BELOW the figure, unlike table captions which go ABOVE)
- **Ethics statement** / IRB approval section: add as a separate Heading1 section if required by the journal
- **Author contributions** section (CRediT format): recommended for multi-author papers
- Use `spaceBefore=360` on Heading1 (same as other science types)

> **STOP here and plan.** Before writing any commands, write out:
> 1. Which paper type? Which features from the table?
> 2. How many sections, headings, tables, equations, footnotes?
> 3. Will you need section breaks? If yes, plan the index offsets now.

---

## Section B: Setup and Styles

### B.1 Create and Configure

```bash
# Create document
officecli create paper.docx

# Open in resident mode — all subsequent operations run in memory
officecli open paper.docx

# Set default font
officecli set paper.docx / --prop defaultFont="Times New Roman"

# Set metadata
officecli set paper.docx / --prop title="Paper Title" --prop author="Author Name"

# Set margins (1 inch = 1440 twips on all sides)
officecli set paper.docx '/section[1]' --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440

# ... all content operations (styles, headings, body, tables, equations) ...

# Close and validate when done
officecli close paper.docx
officecli validate paper.docx
```

**Paper-type line spacing:**

| Paper Type | Body lineSpacing | Font | Size |
|-----------|-----------------|------|------|
| APA / Social Science | `2x` (double) | Times New Roman | 12pt |
| Physics / Math | `1.5x` (recommended) | Times New Roman | 11pt |
| CS / Engineering | `1.5x` (recommended) | Times New Roman | 11-12pt |
| White Paper | `1.5x` recommended, `1.15x` minimum | Calibri | 11pt |

> **Line spacing note:** Recommended body line spacing is **1.5x** for all academic paper types. `1.15x` passes validation but is below publication norm — use it only for white papers or internal reports where space is at a premium. For manuscripts submitted for peer review, use `1.5x` or `2x` (double). Never use line spacing below `1.15x`.

### B.2 Define ALL Styles Upfront (NON-NEGOTIABLE)

> **WARNING: Skipping style definitions causes formatting failures. Define ALL styles before adding ANY content. This is the #1 failure mode in document creation.**

> **WARNING: Blank documents created with `officecli create` have NO styles part. You MUST use `add /styles --type style` to create heading styles -- `set /styles/Heading1` will FAIL on a blank document because the style does not exist yet.**

```bash
# Create heading styles (add, NOT set -- blank documents have no built-in styles)
officecli add paper.docx /styles --type style --prop id=Heading1 --prop name="Heading 1" --prop type=paragraph --prop font="Times New Roman" --prop size=20 --prop bold=true --prop spaceBefore=360 --prop spaceAfter=120 --prop keepNext=true
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

**Abstract paragraph style — firstLineIndent exemption:**

> Abstract paragraphs use **block paragraph style** (no first-line indent). Do NOT set `firstLineIndent` on the abstract body paragraph.
> - Control spacing via `spaceBefore` / `spaceAfter` only
> - If `view issues` reports "body paragraph missing first-line indent" for the abstract paragraph, this is a **false positive** — ignore it. The abstract is intentionally block-formatted per academic convention.

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

> **Lesson 8/9 Reminder:** A cover page must be content-rich. Do NOT output a sparse cover with only 3 lines of text followed by a full page of whitespace — this is a visual failure. Aim for content occupying ≥ 60% of the cover page area.

> **⚠️ Cover Density Warning:** If you only include title + authors + date, the cover will occupy approximately 30–40% of the page — far below the ≥60% requirement. You MUST supplement with an abstract excerpt AND/OR keywords AND/OR affiliation block to reach the density target. Every academic paper cover must include **at least 8 of the 10 elements** listed below.

**Cover Page Required Elements (≥8 of 10 for ≥60% coverage):**

| # | Element | Required | Notes |
|---|---------|:--------:|-------|
| 1 | Paper title | YES | Large font, **20–24pt**, bold, centered |
| 2 | Subtitle | If applicable | 14–16pt, centered, italic |
| 3 | Author name(s) — all authors listed | YES | 11–12pt, centered |
| 4 | Affiliation block (department, university, institution) | YES | 11–12pt, centered, each on its own line |
| 5 | Submitted to (journal or conference name) | YES | e.g. `"Submitted to: Nature Methods"` |
| 6 | Submission / preparation date | YES | e.g. `"April 2026"` |
| 7 | Abstract excerpt (4–8 lines, italic) | YES | First 3–5 sentences of the abstract; label with `"Abstract:"` prefix |
| 8 | Keywords (5–8 terms, italic) | YES | e.g. `"Keywords: machine learning, NLP, transformer, BERT, fine-tuning"` |
| 9 | Horizontal rule or decorative divider | Recommended | Use a full-width border paragraph to visually separate sections |
| 10 | Contact email / ORCID | Optional | e.g. `"Contact: alice@stanford.edu \| ORCID: 0000-0001-2345-6789"` |

> **Minimum viable cover:** If the scenario is explicitly minimal, include at minimum: title + authors + affiliation + submission target + date + abstract excerpt + keywords (7 elements). Three lines alone is **never** acceptable.

**Rich cover page example (recommended pattern):**

```bash
# Title (large, bold, centered — 20-24pt)
officecli add paper.docx /body --type paragraph \
  --prop text="Deep Learning Approaches to Gene Expression Prediction" \
  --prop alignment=center --prop font="Times New Roman" --prop size=22 \
  --prop bold=true --prop spaceBefore=72pt --prop spaceAfter=18pt
# NOTE: spaceBefore=72pt uses point units (72pt ≈ 1 inch of top padding).
# Other style examples use raw twip values (e.g. spaceBefore=360 = 18pt). Both accepted.

# Authors
officecli add paper.docx /body --type paragraph \
  --prop text="Alice Chen, Bob Martinez" \
  --prop alignment=center --prop font="Times New Roman" --prop size=12 --prop spaceAfter=6pt

# Affiliation
officecli add paper.docx /body --type paragraph \
  --prop text="Department of Computer Science, Stanford University" \
  --prop alignment=center --prop font="Times New Roman" --prop size=12 --prop spaceAfter=6pt

# Contact email
officecli add paper.docx /body --type paragraph \
  --prop text="Contact: alice.chen@stanford.edu" \
  --prop alignment=center --prop font="Times New Roman" --prop size=11 --prop spaceAfter=18pt

# Advisor (if applicable)
officecli add paper.docx /body --type paragraph \
  --prop text="Advisor: Prof. Jane Smith" \
  --prop alignment=center --prop font="Times New Roman" --prop size=11 --prop spaceAfter=6pt

# Submission info
officecli add paper.docx /body --type paragraph \
  --prop text="Submitted to: NeurIPS 2026 Workshop on Computational Biology" \
  --prop alignment=center --prop font="Times New Roman" --prop size=11 --prop spaceAfter=6pt

# Date
officecli add paper.docx /body --type paragraph \
  --prop text="April 2026" \
  --prop alignment=center --prop font="Times New Roman" --prop size=11 --prop spaceAfter=24pt

# Abstract excerpt (2-3 sentences to fill the cover — omit if content is already dense)
officecli add paper.docx /body --type paragraph \
  --prop text="Abstract: This paper presents a transformer-based architecture for predicting gene expression levels from DNA sequence. We achieve state-of-the-art performance on the ENCODE benchmark, demonstrating 12% improvement over prior methods." \
  --prop alignment=center --prop font="Times New Roman" --prop size=11 \
  --prop italic=true --prop spaceBefore=12pt --prop spaceAfter=18pt

# Keywords
officecli add paper.docx /body --type paragraph \
  --prop text="Keywords: gene expression, deep learning, transformer, computational biology, DNA sequence" \
  --prop alignment=center --prop font="Times New Roman" --prop size=11 --prop spaceAfter=0pt

officecli add paper.docx /body --type pagebreak   # or section break for white paper
```

> **Minimum viable cover (simple papers):** If the paper is short or the scenario is minimal, you must still include at minimum: title + authors + affiliation + date + keywords. Three lines alone is never acceptable.

### C.2 Table of Contents

```bash
officecli add paper.docx /body --type toc --prop levels=1-3 --prop title="Table of Contents"
```

The TOC is a native Word field. It shows "Update Field" prompt in Word -- right-click and select "Update entire table" to populate. Add the TOC early in the document; it picks up all headings regardless of section breaks.

> **⚠️ TOC LibreOffice 渲染说明：** TOC 字段在 LibreOffice 中以占位文本 "Update field to see table of contents" 显示。
> 这是正常的 OOXML 行为——在 Microsoft Word 中打开后按 Ctrl+A → F9 更新所有字段即可显示完整目录。
> 如果接收者仅使用 LibreOffice，可以考虑以下替代方案：
> 1. 在 TOC 字段之后手动添加目录段落（静态文本，每个标题一行），作为 LibreOffice 可见的目录
> 2. 或在文档开头的覆信中说明"请在 Word 中更新目录字段（F9）"

Add a page break after the TOC to separate it from body content:

```bash
officecli add paper.docx /body --type pagebreak
```

### C.3 Body Sections with Headings

**Section Numbering Convention:**

Standard academic papers include section numbers directly in the heading text. Use the following format — the number is part of the `text` property, **not** implemented via `numbering` or `listStyle`:

| Level | Format | Example |
|-------|--------|---------|
| H1 (主章节) | `"N. Title"` | `"1. Introduction"`, `"2. Methods"`, `"3. Results"` |
| H2 (子章节) | `"N.M Title"` | `"2.1 Data Collection"`, `"2.2 Analysis"` |
| H3 (三级) | `"N.M.K Title"` | `"2.1.1 Preprocessing"`, `"2.1.2 Normalization"` |

> **Continuous numbering — ALL body sections, no exceptions:** ALL body sections including Conclusion, Discussion, and Policy Recommendations MUST follow the numbered heading convention (e.g., `"5. Conclusion"`, `"6. Policy Recommendations"`). Do NOT leave any content body section unnumbered. Only **References/Bibliography** and **Acknowledgments** are exempt from numbering by academic convention.

```bash
# H1 with number in text (correct approach)
officecli add paper.docx /body --type paragraph --prop text="1. Introduction" --prop style=Heading1
officecli add paper.docx /body --type paragraph --prop text="2. Methods" --prop style=Heading1

# H2 with dotted sub-number
officecli add paper.docx /body --type paragraph --prop text="2.1 Data Collection" --prop style=Heading2
officecli add paper.docx /body --type paragraph --prop text="2.2 Statistical Analysis" --prop style=Heading2

# H3 three-level
officecli add paper.docx /body --type paragraph --prop text="2.1.1 Preprocessing Steps" --prop style=Heading3
```

> **Do NOT use `numbering` or `listStyle` properties for section numbering.** Embed the number directly in the `text` value. This is simpler, more predictable, and avoids list numbering reset issues.

**Body paragraphs:**

```bash
# Body paragraph (adjust lineSpacing per paper type from B.1)
officecli add paper.docx /body --type paragraph --prop text="This paper examines..." --prop font="Times New Roman" --prop size=12 --prop lineSpacing=2x --prop spaceAfter=0pt --prop firstLineIndent=720
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
officecli add paper.docx /body --type equation --prop formula="\frac{1}{2\pi} \int_{BZ} \Omega(\mathbf{k}) \, d^2\mathbf{k}"
```

**Shell escaping:** bash `--prop` = double backslash (`\\frac`), batch JSON = quadruple (`\\\\frac`), heredoc = double (`\\frac`).

> **WARNING: Inline equations are appended to the end of the target paragraph, not inserted at a specific position within the text.** For best results, structure the paragraph so the equation naturally belongs at the end, or split the sentence into two paragraphs with the equation between them.

> **D-2: `\left`/`\right` + subscript/superscript crashes.** Any `\left[...\right]` or `\left(...\right)` containing subscript or superscript content throws a cast error. Use plain `(`, `)`, `[`, `]` instead -- OMML auto-sizes delimiters in display mode.

> **D-3: `\mathcal` causes validation error.** Use `\mathit{L}` or plain letters instead.

See SKILL.md Core Concepts for the full verified LaTeX subset table.

> **Known limitation: Equation numbering (e.g., "(1)", "(2)") is not natively supported.** There is no automatic equation numbering mechanism in the current version. The recommended workaround (Plan A below) uses two consecutive paragraphs — one centered for the equation, one right-aligned for the number.

**Manual equation numbering — recommended implementation (Plan A):**

```bash
# Step 1: display equation paragraph (centered)
officecli add paper.docx /body --type equation --prop "formula=O(n \log n)" 
# The equation is added as its own centered paragraph by default.

# Step 2: equation number paragraph immediately after (right-aligned, no top spacing)
officecli add paper.docx /body --type paragraph --prop text="(1)" \
  --prop alignment=right --prop size=11 --prop spaceBefore=0 --prop spaceAfter=6
```

**Manual equation numbering — Plan B: 3-column table (recommended for precise alignment):**

When equation and number must appear on the same baseline (e.g., journal submission requirements), use a borderless 1×3 table with column proportions 10% : 75% : 15%:

```bash
# Step 1: Add a 1×3 table (left spacer | equation | number)
officecli add paper.docx /body --type table --prop rows=1 --prop cols=3

# Step 2: Set column widths (total page width = ~7920 twips for 1-inch margins)
#   col1 (left spacer): ~792 twips (10%)
#   col2 (equation):   ~5940 twips (75%)
#   col3 (number):     ~1188 twips (15%)
officecli set paper.docx '/body/tbl[N]/tr[1]/tc[1]' --prop width=792
officecli set paper.docx '/body/tbl[N]/tr[1]/tc[2]' --prop width=5940
officecli set paper.docx '/body/tbl[N]/tr[1]/tc[3]' --prop width=1188

# Step 3: Add equation to center column
# CRITICAL: Do NOT use `--type equation` targeting a table cell path (tc) directly.
# That generates oMathPara as a direct w:tc child, which is illegal OOXML and causes validate errors.
# Use --prop mode=inline and target the paragraph inside the cell (tc/p[1]):
officecli add paper.docx '/body/tbl[N]/tr[1]/tc[2]/p[1]' --type equation --prop "formula=E = mc^2" --prop mode=inline

# Step 4: Add number to right column, right-aligned
officecli set paper.docx '/body/tbl[N]/tr[1]/tc[3]' --prop alignment=right
officecli add paper.docx '/body/tbl[N]/tr[1]/tc[3]/p[1]' --type paragraph --prop text="(1)" --prop alignment=right --prop size=11

# Step 5: Hide table borders
officecli set paper.docx '/body/tbl[N]' --prop border.all="none"
```

Replace `tbl[N]` with the correct 1-based table index. For multi-equation papers, repeat Steps 1–5 for each equation and increment the number `(1)`, `(2)`, etc.

> **Plan A vs Plan B:** Plan A (two consecutive paragraphs) is simpler but the number appears on a separate line below the equation. Plan B (3-column table) places equation and number on the same visual line. Use Plan B for formal journal submissions or when reviewers specifically require inline numbering.

For multi-equation papers, keep a running counter and increment `(1)`, `(2)`, etc. manually.

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

> **Note on CLI output:** After adding a footnote, the reference run appears as an **empty string** in `get` and `view annotated` output (`r[N] ""`). This is expected — the run contains a `<w:footnoteReference>` XML element, not visible text. To confirm insertion, use `officecli view paper.docx text` and check the footnote count at the bottom, or `officecli get paper.docx '/footnote[N]'` to verify the footnote content.

```bash
officecli add paper.docx '/body/p[3]' --type footnote --prop text="Smith et al., 2024, Journal of Research, 45(2), pp.112-130."
officecli add paper.docx '/body/p[5]' --type endnote --prop text="See appendix for extended discussion."
```

Batch for performance (not required for correctness):

```bash
officecli add paper.docx /body/p[3] --type footnote --prop text="First footnote."
officecli add paper.docx /body/p[5] --type footnote --prop text="Second footnote."
officecli add paper.docx /body/p[8] --type footnote --prop text="Third footnote."
```

### D.4 Tables and Figures

> **Figure embedding note:** Experimental/empirical papers (lab science, engineering, data-driven research) SHOULD include at least 1 embedded figure — an architecture diagram, results chart, or methodology flowchart. Placeholder captions without embedded images reduce deliverability. If actual image assets are unavailable, generate a representative data chart using `officecli chart` commands and embed it as a figure with caption. Papers that list "Figure 1" in a caption but contain 0 embedded images will be flagged by evaluators.

For table building blocks (header rows, cell styling, merging), see [docx creating.md](../docx/creating.md#tables----creation--basic-styling). Academic table recipe:

> **Caption placement rule (APA / academic standard):**
> - **Table captions appear ABOVE the table** — add the caption paragraph BEFORE adding the table.
> - **Figure captions appear BELOW the figure** — add the caption paragraph AFTER adding the image/placeholder.
>
> Placing a table caption below the table violates APA and most academic style guides. This is a common mistake — always add the table caption first.

```bash
# CORRECT order: caption first, then table
# Step 1: Table caption (ABOVE the table — APA/academic standard)
officecli add paper.docx /body --type paragraph --prop text="Table 1. Participant Demographics" --prop style=Caption --prop spaceAfter=6pt

# Step 2: Table
officecli add paper.docx /body --type table --prop rows=5 --prop cols=4 --prop style=TableGrid --prop alignment=center --prop width=100%
officecli set paper.docx '/body/tbl[1]/tr[1]' --prop c1="Variable" --prop c2="Mean" --prop c3="SD" --prop c4="N" --prop header=true
# Style each header cell individually (row set does NOT support bold/shd/color)
officecli set paper.docx '/body/tbl[1]/tr[1]/tc[1]' --prop bold=true --prop shd=2E4057 --prop color=FFFFFF
# ... repeat for tc[2], tc[3], tc[4] ...
officecli set paper.docx '/body/tbl[1]/tr[2]' --prop c1="Age" --prop c2="38.4" --prop c3="7.2" --prop c4="47"
officecli set paper.docx '/body/tbl[1]' --prop border.all="single;4;CCCCCC;0"
```

**Figure placeholder and Figure legend** (when actual image insertion is not available):

```bash
# Figure placeholder paragraph (describes where the image goes)
officecli add paper.docx /body --type paragraph \
  --prop text="[Figure 1: CRISPR construct design — insert image here]" \
  --prop italic=true --prop alignment=center --prop size=10

# Figure legend paragraph
officecli add paper.docx /body --type paragraph \
  --prop text="Figure 1. CRISPR construct schematic showing guide RNA, Cas9 protein, and target DNA sequence." \
  --prop style=Caption --prop spaceBefore=6
```

Use `italic=true --prop alignment=center` for the placeholder so it is visually distinct from body text. The Figure legend uses the `Caption` style (10pt italic, defined in B.2).

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

> **NOTE:** Adding a field to `footer[1]/p[1]` appends the field to the existing footer paragraph — it does NOT create a new paragraph. A simple centered page number footer works as expected with the two-command sequence below.

> **WARNING: Do NOT execute footer field commands more than once.** Duplicate execution creates duplicate page numbers (e.g., "6\n6"). After adding a footer, verify with `officecli get paper.docx '/footer[1]'` to confirm only one page field exists.

```bash
# Simple footer with centered page number
officecli add paper.docx / --type footer --prop alignment=center
officecli add paper.docx '/footer[1]/p[1]' --type field --prop fieldType=page --prop size=10
```

**Running header — recommended for ALL academic paper types:**

Running headers are expected in academic papers (APA, IEEE, journal submissions, etc.). Add a running header that identifies the document. Typical academic convention:
- **Simple (all pages same):** Shortened paper title, right-aligned, 9pt
- **Mirrored (odd/even pages different):** Odd pages = shortened title; Even pages = author name(s)

```bash
# Academic running header — shortened title, right-aligned (all pages)
officecli add paper.docx / --type header \
  --prop text="Deep Learning for Gene Expression Prediction" \
  --prop alignment=right --prop size=9 --prop color=444444

# Alternative: Author name on all pages (common in APA manuscripts)
officecli add paper.docx / --type header \
  --prop text="Chen & Martinez (2026)" \
  --prop alignment=right --prop size=9 --prop color=444444
```

**Odd/Even page headers (formal journal format):**

For formal journal submissions that require different headers on odd and even pages (e.g., running title on right pages, author names on left pages):

```bash
# Step 1: Enable odd/even page header distinction
officecli set paper.docx / --prop differentOddEven=true

# Step 2: Odd-page header (right-aligned — displays shortened paper title)
officecli add paper.docx / --type header --prop type=default \
  --prop text="Short Title Here" \
  --prop alignment=right --prop size=9

# Step 3: Even-page header (left-aligned — displays author name(s))
officecli add paper.docx / --type header --prop type=even \
  --prop text="Author Names" \
  --prop alignment=left --prop size=9
```

> **Note:** `type=default` sets the odd-page (right-hand) header. `type=even` sets the even-page (left-hand) header. Only use odd/even headers when the journal explicitly requires mirrored pages.

> **White paper / corporate report header:**
> ```bash
> officecli add paper.docx / --type header --prop text="Organization Name | DOC-ID-001" --prop alignment=right --prop size=9 --prop color=888888
> ```

**Cover page page number — known CLI limitation:**

Academic convention requires the cover page to NOT display a page number (or use Roman numerals). The current CLI does not support `differentFirstPage` header/footer control. This means the cover page will show the page number "1" in the footer.

**Known limitation workaround:** After generating the document, inform the user:
> "Note: The cover page displays page number '1' due to a current CLI limitation. To hide it, open the document in Word, go to Insert > Header & Footer, enable 'Different First Page', and delete the content from the first-page footer."

If you want to document this limitation inline in your delivery notes, use this note pattern.

**"Page X of Y" pattern:** Currently there is no single-command way to produce "Page X of Y" on one line. The `fieldType=page` and `fieldType=numpages` each create their own paragraph. For a simple page number, use the pattern above. For "Page X of Y", see [docx creating.md](../docx/creating.md#headers--footers) for raw-set workarounds, or accept the limitation and use a simple page number field.

**Verification after footer setup:**
```bash
officecli get paper.docx '/footer[1]'   # Confirm paragraph count and field presence
```

> **Note on `get /footer[1]` output:** The footer paragraph contains multiple runs (typically 5: field-char-begin, instrText, field-char-separate, result-text, field-char-end). Most runs appear as empty strings — this is normal. A correctly inserted page field shows `r[4]` with value `"1"` (the cached page number). As long as you see exactly one paragraph and one set of field-char runs, the footer is correct.

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

- [ ] **H8 (HARD RULE): References/Bibliography section present** — paper includes a final "References" or "Bibliography" section with at minimum 5 formatted citations using hanging indent. A document with inline citations and no reference list is a delivery failure.
- [ ] TOC lists all Heading1/2/3 entries (`view outline` shows heading tree)
- [ ] Every equation renders as OMML (`view text` shows `[Equation]` markers)
- [ ] Footnote markers at correct paragraphs (`view annotated` shows footnote refs)
- [ ] Bibliography has hanging indent on every reference
- [ ] Font hierarchy is consistent: H1 >= 18pt (20pt preferred), H2 >= 14pt, H3 >= 12pt, body = 11-12pt
- [ ] Page margins are 1 inch (1440 twips) on all sides
- [ ] Line spacing matches paper type (double for APA, 1.5x recommended for physics/CS/engineering, 1.5x recommended / 1.15x minimum for white paper — never below 1.15x)
- [ ] No empty paragraphs used as spacing
- [ ] Abstract paragraph has NO `firstLineIndent` (block style — "missing first-line indent" warning from `view issues` is a false positive for Abstract)
- [ ] Multi-column abstract reverts to single-column (`get '/section[N]'` for each section -- all non-abstract sections must show columns=1)
- [ ] Landscape sections revert to portrait

### F.3 Verification Loop

1. Generate document
2. Run `validate` + `view outline` + `view issues` + `view text`
3. Fix issues found
4. Re-verify -- one fix often creates another problem
5. Repeat until clean pass. **Do not declare success without at least one fix-and-verify cycle.**

NOTE: No visual preview for docx (unlike pptx). User must open in Word for visual confirmation.

**`view issues` 已知误报（可安全忽略）**

Academic papers routinely trigger 12+ warnings from `view issues`. All of the following are false positives:

- **Display equations** (`oMathPara` elements): flagged as "empty paragraph" — renders correctly in Word.
- **First-line indent check**: the following paragraph types all trigger "no first-line indent" warnings and are all safe to ignore:
  - **Abstract paragraphs** — Abstract uses block style (no first-line indent by design)
  - Cover page centered paragraphs (title, authors, affiliations)
  - Block quote paragraphs
  - Bibliography / references paragraphs with hanging indent (`hangingIndent` set)
  - Any paragraph with `leftIndent` or `rightIndent` set (non-zero)
- **Hanging indent false positive**: any paragraph with `leftIndent`/`rightIndent` may also trigger a hanging indent detection warning — ignore.
- **Headings**: headings without first-line indent are expected in all academic styles.

Do not attempt to "fix" these warnings by adding `firstLineIndent` to cover, block-quote, or reference paragraphs — doing so will break formatting.

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

### D-4b: `pbdr.bottom` XML Element Order Bug (Known CLI Bug — P3)

When using `--prop pbdr.bottom=...` to add a bottom border to a paragraph (e.g., a cover page divider line), the CLI may generate `<w:pBdr>` XML with child elements in the wrong order, causing `officecli validate` to report a pBdr-related schema error.

**Symptom:** `validate` reports an error referencing `w:pBdr` or its child elements after a `set --prop pbdr.bottom=...` command.

**Workaround:** If validate fails with a pBdr error, replace the `pbdr.bottom` set command with a `raw-set` that writes the complete `<w:pBdr>` XML directly:

```bash
# Instead of (may fail due to element order bug):
officecli set paper.docx '/body/p[N]' --prop "pbdr.bottom=single;4;000000;4"

# Use raw-set with correct element order (requires --xpath and --action):
# Step 1: Remove any existing pBdr (avoids duplicate element)
officecli raw-set paper.docx /document \
  --xpath "//w:body/w:p[N]/w:pPr/w:pBdr" --action remove
# Step 2: Append corrected pBdr to the paragraph's pPr
officecli raw-set paper.docx '/body/p[N]' \
  --xpath './w:pPr' --action append \
  --xml '<w:pBdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:bottom w:val="single" w:sz="4" w:space="4" w:color="000000"/></w:pBdr>'
```

> **Note:** This is a CLI-level bug (XML serialization order). The skill is not at fault. Mark as P3 — the CLI team is responsible for the fix. Using `raw-set` as shown above is the correct workaround until the bug is resolved.

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
