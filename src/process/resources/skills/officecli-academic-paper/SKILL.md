---
name: officecli-academic-paper
description: "Use this skill to build academic-style .docx output: journal / conference / thesis chapters carrying formal citation style (APA, Chicago, IEEE, MLA), numbered equations, figure & table cross-references, footnotes/endnotes, bibliography, or multi-column journal layout. Trigger on: 'research paper', 'journal paper', 'conference paper', 'manuscript', 'thesis', 'APA', 'MLA', 'Chicago', 'IEEE two-column', 'bibliography', 'hanging indent', 'citation style', 'abstract + keywords', 'equation numbering', 'cross-reference', paper with footnotes/endnotes. Output is a single .docx."
---

# OfficeCLI Academic Paper Skill

**This skill is a scene layer on top of `officecli-docx`.** Every docx hard rule — style architecture, heading hierarchy, shell quoting, `break=newPage` alias, belt-and-suspenders page breaks, live PAGE field, Delivery Gate, renderer quirks — is inherited, not re-taught. This file adds only what academic papers need on top: citation styles, equations, SEQ / PAGEREF cross-refs, multi-column journal layout, bibliography hanging indent, abstract/keywords/affiliation block.

When the docx base rules cover it, the text here says `→ see docx v2 §X`. Read docx v2 first if you have not.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash`
- **Windows (PowerShell)**: `irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**This skill teaches what an academic paper requires, not every command flag.** When a prop name, enum value, or field instruction is uncertain, consult help BEFORE guessing.

```bash
officecli help docx                          # All docx elements
officecli help docx <element>                # Full schema (e.g. section, equation, field, footnote)
officecli help docx <element> --json         # Machine-readable
```

Help is pinned to the installed CLI version. **When this skill and help disagree, help wins.** Every `--prop X=` in this file has been grep-verified against `officecli help docx <element>` — if help adds / renames a prop in a later version, trust help.

## Mental Model & Inheritance

**Inherits docx v2.** You should have read `skills/officecli-docx/SKILL.md` first. This skill assumes you know how to add paragraphs, set styles, build tables, insert images, manage TOC/footer/headers, force page breaks, and run the Delivery Gate. If any of those are unfamiliar, open a second session on docx v2 before continuing.

## Shell & Execution Discipline

**Shell quoting, incremental execution, `$FILE` convention** → see docx v2 §Shell & Execution Discipline. The same rules apply here verbatim — quote `[N]` paths, single-quote any value containing `$` (including `$2.8B` in a body paragraph or `@` DOIs), never hand-write `\$ \t \n` in executable examples, one command at a time. Academic-paper examples below use `$FILE` as a shell variable (`FILE="thesis.docx"`).

## What "academic" means here (identity)

An academic paper is a docx with a **scholarly layer** on top: verifiable citations, precise equations, cross-refs that stay in sync, a formatted reference list. The base docx rules still apply; academic adds six deltas:

1. **Citation style is a contract.** APA / Chicago / IEEE / MLA each dictate author format, date placement, reference-list order, in-text marker shape. Pick one at the start; every later decision (hanging indent, footnote vs parenthetical, `[1]` vs `(Smith, 2024)`) follows.
2. **Equations are first-class content** — inline `oMath` inside prose, display `oMathPara` as standalone blocks, optionally numbered.
3. **Figures and tables auto-number.** `SEQ Figure` / `SEQ Table` fields count them; `PAGEREF` links "see Fig. 2" to its live page number.
4. **Bibliography uses hanging indent** (first line flush left, continuation lines indented). Not first-line indent. Not left indent alone. Hanging.
5. **Abstract / keywords / affiliation block** is a first-page three-piece, not a cover in the marketing sense. Block-style abstract, no first-line indent, no decoration.
6. **Multi-column layout** appears in IEEE / ACM / Nature / many journals: single-column abstract + two-column body.

### Reverse handoff — when to go BACK to docx

Stay in **docx v2** for white papers, policy briefs, technical reports, HR templates — anything without a venue / citation style. Use **this skill** only when the document will carry at least TWO of: citation-style biblio, equations, SEQ/PAGEREF cross-refs, multi-column, abstract + keywords block.

## Workflow — 5 verbs

1. **Read the venue spec.** APA 7 / Chicago 17 / IEEE / MLA 9 / journal-specific. Line spacing, font, citation shape, biblio sort order — everything downstream follows from this one decision.
2. **Plan the sections.** Abstract → keywords → introduction → methods → results → discussion → conclusion → references. Estimate heading count for TOC decision (3+ headings = add a TOC, see docx v2 §Table of Contents).
3. **Set styles up front.** Heading1 / Heading2 / Heading3 / Caption / AbstractTitle / Bibliography. Define all styles BEFORE any content (→ see docx v2 §Paragraphs and styles — same rule here, same failure mode if skipped).
4. **Build body in order.** Cover / title block → abstract → keywords → TOC (if needed) → body sections in reading order → figures / tables with SEQ captions → bibliography → footnotes are added last by paragraph path.
5. **QA — Delivery Gate.** Inherit docx v2 Gates 1-3, then add academic Gates 4-5 below.

## Requirements (academic floor on top of docx v2)

Everything in docx v2 §Requirements for Outputs applies. On top of that, academic papers MUST meet these additional rules:

### Typography and spacing (venue-aware)

- **Font.** Times New Roman 11-12pt body (default) or venue-specified (IEEE uses Times 10pt 2-col; APA allows Calibri 11pt). Same body font throughout; no decorative heading fonts.
- **Heading hierarchy.** H1 = 20pt bold, H2 = 14pt bold, H3 = 12pt bold italic, body = 11-12pt. (Same numbers as docx v2 — restated because academic papers never rely on Word defaults.)
- **Line spacing.** APA 7 = 2x (double). Chicago / IEEE / most journals = 1.5x. Never below 1.15x. Set on body paragraphs and on References.
- **Margins.** 1 inch (1440 twips) all sides unless the venue says otherwise (some journals require 1.25in left for binding — check the spec).

### Abstract, bibliography, caption placement

- **Abstract is block-style.** NO `firstLineIndent`. Use `spaceAfter=12pt` for paragraph separation. If `view issues` reports "body paragraph missing first-line indent" on an Abstract paragraph, it's a false positive — ignore.
- **Bibliography uses hanging indent.** Each entry is one paragraph with `indent=720 hangingIndent=720` (left indent 0.5", first-line reversed by same amount). First line flush left; wraps indent under author name.
- **Figure captions go BELOW the figure.** Table captions go ABOVE the table. This is the single rule most non-academics get wrong — APA, Chicago, IEEE, MLA all agree on it.
- **Citation round-trip.** Every in-text citation key must resolve to an entry in the reference list. Delivery Gate 4 verifies.
- **SEQ presence.** Any paper with numbered figures or tables must carry live `SEQ Figure` / `SEQ Table` fields (not hardcoded "Figure 1" text that drifts when you insert a new figure mid-document). Delivery Gate 5 verifies.

### Cover / first-page block

Academic covers differ from professional covers. Minimum elements: title (centered, 20-22pt bold), author(s), affiliation, submission target or journal, date, abstract, keywords. The "60% fill" rule from docx v2 §Visual delivery floor still applies — a three-line cover with half a page of whitespace is a fail. See §Abstract / keywords / affiliation block below for the first-page recipe.

### Section numbering convention (STYLE-DEPENDENT — do not apply blindly)

Academic section numbers are **part of the heading text**, not computed via list numbering. `officecli`'s `numId`/`listStyle` mechanism is fragile across Heading1 re-use, so hand-write the prefix. BUT the prefix shape varies by style — DO NOT use the same form for all four:

| Style       | H1 format                              | H2 format                    | Example                                              |
| ----------- | -------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| **APA 7**   | **UNNUMBERED centered bold**           | Unnumbered left-aligned bold | `Introduction` / `Methods` (centered)                |
| **Chicago** | `"N. Title"` left-aligned              | `"N.M Title"`                | `1. Introduction`, `2.1 Policy Formation`            |
| **IEEE**    | `"N. TITLE"` ALL CAPS + Roman numerals | `A. Subtitle` title case     | `I. INTRODUCTION`, `II. RELATED WORK`, `A. Datasets` |
| **MLA 9**   | Unnumbered left-aligned bold           | Same                         | `Literature Review` (no prefix)                      |

APA 7 L1 headings are **centered, bold, unnumbered**; L2 are flush-left bold; L3 flush-left bold italic; L4/L5 run-in. Do NOT prefix APA headings with `1. / 2.` — that is Chicago/IEEE convention. IEEE wants ALL CAPS with Roman numerals (`I. INTRODUCTION`); inside each section, use `A./B./C.` sub-headings (title case). Arabic-numbered body sections are Chicago-style only.

**Exception for all four**: References / Bibliography / Works Cited / Acknowledgments are unnumbered regardless of style — omit the `N.` prefix.

## Quick Start — minimal APA paper

```bash
FILE="paper.docx"
officecli create "$FILE"
officecli open "$FILE"
officecli set "$FILE" / --prop defaultFont="Times New Roman"
officecli add "$FILE" /body --type paragraph --prop text="Remote Work and Team Cohesion" --prop align=center --prop size=20pt --prop bold=true --prop spaceAfter=24pt
officecli add "$FILE" /body --type paragraph --prop text="Alice Chen" --prop align=center --prop size=12pt
officecli add "$FILE" /body --type paragraph --prop text="Department of Psychology, Stanford University" --prop align=center --prop size=11pt --prop spaceAfter=24pt
officecli add "$FILE" /body --type paragraph --prop text="Abstract" --prop align=center --prop size=14pt --prop bold=true --prop spaceBefore=12pt --prop spaceAfter=6pt
officecli add "$FILE" /body --type paragraph --prop text="This study examines remote-work adoption on team cohesion across 18 months..." --prop size=12pt --prop lineSpacing=2x --prop spaceAfter=12pt
officecli add "$FILE" /body --type paragraph --prop text="Keywords: remote work, team cohesion, psychological safety" --prop italic=true --prop size=11pt --prop spaceAfter=18pt
officecli add "$FILE" /body --type paragraph --prop text="1. Introduction" --prop style=Heading1 --prop size=20pt --prop bold=true --prop spaceBefore=18pt --prop spaceAfter=12pt
officecli add "$FILE" /body --type paragraph --prop text="Remote-work research (Smith, 2024) has expanded since 2020..." --prop size=12pt --prop lineSpacing=2x --prop firstLineIndent=720
officecli add "$FILE" /body --type paragraph --prop text="References" --prop style=Heading1 --prop size=20pt --prop bold=true --prop spaceBefore=18pt --prop spaceAfter=12pt
officecli add "$FILE" /body --type paragraph --prop text="Smith, J. (2024). Remote work and cohesion. Journal of Applied Psychology, 109(3), 412-430." --prop size=12pt --prop lineSpacing=2x --prop indent=720 --prop hangingIndent=720
officecli add "$FILE" / --type footer --prop type=default --prop align=center --prop size=10pt --prop field=page
officecli close "$FILE"
officecli validate "$FILE"
```

Ten-line skeleton. Real papers grow by adding more body paragraphs, more bibliography entries (each with the same `indent=720 hangingIndent=720` pair), figures / tables with captions, and a TOC if there are 3+ Heading1s. The Quick Start validates clean; the sections below elaborate each dimension.

## Citation style recipes

Four mainstream families. Pick one at project start; every downstream decision follows. **Per-style decision table:**

| Style                  | In-text shape                     | Reference list order                  | Body line spacing | Footnotes?                              |
| ---------------------- | --------------------------------- | ------------------------------------- | ----------------- | --------------------------------------- |
| APA 7                  | `(Smith, 2024)` or `Smith (2024)` | Alphabetical by author                | 2x (double)       | Rare (content notes only)               |
| Chicago 17 (Notes-Bib) | Superscript footnote number       | Alphabetical by author                | 1.5x-2x           | **Primary** (full citation in footnote) |
| IEEE                   | `[1]`, `[2]`, ..., `[N]`          | Order of first citation               | 1.15x-1.5x, 2-col | Rare                                    |
| MLA 9                  | `(Smith 412)` page-number         | Alphabetical by author, "Works Cited" | 2x                | Rare                                    |

Shared defaults across all four: reference-list paragraphs use `indent=720 hangingIndent=720` (hanging indent 0.5"); add a live TOC if 3+ Heading1s (→ see docx v2 §Table of Contents); static TOC fallback if recipient cannot recalculate (→ see docx v2 §Report-level recipes (f)).

### APA 7 (social sciences — psychology, education, management)

- In-text: `(Author, Year)` or `Author (Year)` for narrative. Page number required on direct quotes: `(Smith, 2024, p. 15)`. Three+ authors: `(Smith et al., 2024)` after first citation.
- Reference list order: **alphabetical by first author's surname**. Title caps: sentence case for article titles, title case for journal names (italic).
- Reference shape: `Author, A. A., & Co-Author, B. B. (Year). Title of article. Journal Name, Volume(Issue), pages.` DOI preferred over URL; present as https URL, not `doi:` prefix.
- Double-space everything (`lineSpacing=2x`) including abstract and references. Body first-line indent = 0.5" (`firstLineIndent=720`).

```bash
# Body paragraph with parenthetical citation
officecli add "$FILE" /body --type paragraph --prop text="Remote work adoption accelerated during the pandemic (Kramer & Kramer, 2020)." --prop size=12pt --prop lineSpacing=2x --prop firstLineIndent=720
# Reference entry with hanging indent
officecli add "$FILE" /body --type paragraph --prop text="Kramer, A., & Kramer, K. Z. (2020). The potential impact of the Covid-19 pandemic on occupational status. Journal of Vocational Behavior, 119, 103442." --prop size=12pt --prop lineSpacing=2x --prop indent=720 --prop hangingIndent=720
# DOI hyperlink appended to the reference paragraph
officecli add "$FILE" "/body/p[last()]" --type hyperlink --prop url="https://doi.org/10.1016/j.jvb.2020.103442" --prop text="https://doi.org/10.1016/j.jvb.2020.103442"
```

QA: `officecli query "$FILE" 'paragraph[hangingIndent]'` returns every reference entry; zero references with first-line indent instead of hanging.

### Chicago 17 — Notes-Bibliography (humanities — history, philosophy, religion)

- In-text: superscript footnote number; full citation in the first footnote (`Timothy Brook, The Troubled Empire (Cambridge, MA: Harvard UP, 2010), 142.`); **shortened form** thereafter (`Brook, Troubled Empire, 150.`).
- **Repeat-citation rule (Chicago 17, op. cit. deprecated):**
  - **Immediately-consecutive** citation of **the same source, same page** → `Ibid.`
  - **Immediately-consecutive, different page** of same source → `Ibid., 22.`
  - Non-consecutive repeat → **shortened form** (`Brook, Troubled Empire, 150.`), NOT `op. cit.`. Chicago 17 drops `op. cit.` — use shortened form every time except for immediate repeats.
- Bibliography at end, **alphabetical by first author's surname** ("Brook, Timothy."), hanging indent. Footnote body renders at the viewer's footnote default (typically 10pt); bibliography entries 12pt. (The `footnote` element exposes only `text` — size is not settable per-footnote; trust renderer defaults.)
- Typical split for primary-source-heavy papers: `Primary Sources` and `Secondary Sources` as two Heading2s under a single `Bibliography` Heading1. Book titles italic in both footnotes and bibliography.
- Chicago also has an Author-Date variant used in the sciences — if the venue specifies Chicago Author-Date, fall back to the APA recipe and change only the punctuation (no comma between author and year: `(Smith 2024)`).

```bash
# Body paragraph that will anchor a footnote, then the footnote itself
officecli add "$FILE" /body --type paragraph --prop text="The Ming dynasty's 海禁 policy shaped coastal trade for two centuries." --prop size=12pt --prop lineSpacing=1.5x --prop firstLineIndent=720
officecli add "$FILE" "/body/p[last()]" --type footnote --prop text="Timothy Brook, The Troubled Empire: China in the Yuan and Ming Dynasties (Cambridge, MA: Harvard University Press, 2010), 142."
# Next footnote — shortened form
officecli add "$FILE" "/body/p[last()]" --type footnote --prop text="Brook, Troubled Empire, 150."
# Bibliography section split — primary sources first
officecli add "$FILE" /body --type paragraph --prop text="Bibliography" --prop style=Heading1 --prop size=20pt --prop bold=true --prop spaceBefore=18pt
officecli add "$FILE" /body --type paragraph --prop text="Primary Sources" --prop style=Heading2 --prop size=14pt --prop bold=true --prop spaceBefore=12pt
officecli add "$FILE" /body --type paragraph --prop text="Ming Shilu 明實錄. Taipei: Academia Sinica, 1966." --prop size=12pt --prop indent=720 --prop hangingIndent=720
officecli add "$FILE" /body --type paragraph --prop text="Secondary Sources" --prop style=Heading2 --prop size=14pt --prop bold=true --prop spaceBefore=12pt
officecli add "$FILE" /body --type paragraph --prop text="Brook, Timothy. The Troubled Empire: China in the Yuan and Ming Dynasties. Cambridge, MA: Harvard University Press, 2010." --prop size=12pt --prop indent=720 --prop hangingIndent=720
```

QA: `officecli query "$FILE" 'footnote'` count ≥ body-paragraph citation count.

### IEEE (engineering — transactions, conference proceedings)

- In-text: `[1]`, `[2]`. Numbered in **order of first appearance**, not alphabetical. Reuse the same number for repeat citations. `[1, p. 15]` for page refs, `[1]-[3]` for a range.
- Reference entry starts with the bracketed number: `[1] A. Smith and B. Jones, "Title," IEEE Trans. X, vol. 5, no. 3, pp. 1-10, 2024, doi: ...`. Authors are initial-first; journal names abbreviated per IEEE list (`IEEE Trans. Neural Netw.`, not full name).
- Body is **two-column** (see §Multi-column below). Abstract is single-column above the fold, 10pt, 1.15x line spacing, typically 200-250 words.
- First-line indent on body paragraphs = 0.2" (`firstLineIndent=288` twips ≈ 14pt). Smaller than APA's 0.5" because the 2-col width is narrower.
- **Section headings: ALL CAPS with Roman numerals** — `I. INTRODUCTION`, `II. RELATED WORK`, `III. METHOD`. Sub-sections `A. Datasets`, `B. Baselines` in title case. Do NOT use `1. Introduction` (Arabic) for IEEE — that is Chicago style.
- **Tables are numbered Roman**: `Table I`, `Table II`, `Table III`. Figures remain Arabic (`Fig. 1`, `Fig. 2`). The `SEQ Table` field emits Arabic cached values — for IEEE, patch the cached `<w:t>` to Roman manually (see §SEQ cached-value trap), or accept Arabic and note in the cover letter.

```bash
# Body citing reference 1
officecli add "$FILE" /body --type paragraph --prop text="Attention-based anomaly detection has been applied to industrial sensor data [1], [2]." --prop size=10pt --prop lineSpacing=1.15x
# Reference list entry — number in the text
officecli add "$FILE" /body --type paragraph --prop text="[1] A. Smith and B. Jones, \"Attention for anomaly detection,\" IEEE Trans. Neural Netw., vol. 35, no. 2, pp. 412-430, 2024." --prop size=10pt --prop indent=720 --prop hangingIndent=720
officecli add "$FILE" /body --type paragraph --prop text="[2] C. Lee, \"Time-series anomaly survey,\" in Proc. ICML, 2023, pp. 1200-1215." --prop size=10pt --prop indent=720 --prop hangingIndent=720
```

QA: the highest `[N]` in body must equal the number of reference-list entries. Grep: `officecli view "$FILE" text | grep -oE '\[[0-9]+\]' | sort -u | tail -5`.

### MLA 9 (literature, languages, cultural studies)

Diff vs APA: in-text is `(Author Page)` **no comma** (e.g. `(Smith 412)`); direct quotes always carry the page number. Reference section titled **Works Cited** (not References / Bibliography). Entries alphabetical by surname, hanging indent, 2x spacing, nine "core elements" separated by periods: `Author. Title. Container, Other Contributors, Version, Number, Publisher, Date, Location.` — skip any that don't apply. Book titles italic; article titles in quotes. Otherwise identical to APA paragraph setup.

## Equations (OMML — inline vs display)

`--type equation` parses a LaTeX-ish formula into OMML. Two modes, selected by `--prop mode=`:

| Mode                | XML                                              | Visual                    | Use                                    |
| ------------------- | ------------------------------------------------ | ------------------------- | -------------------------------------- |
| `display` (default) | `<m:oMathPara>` at `/body`                       | Standalone centered block | Numbered equations, theorem statements |
| `inline`            | `<m:oMath>` appended to a run inside a paragraph | Runs with the text        | `if $x > 0$` style in prose            |

```bash
# Display equation (own paragraph, centered) — explicitly set mode=display for clarity
officecli add "$FILE" /body --type equation --prop mode=display --prop formula="x^2 + y^2 = z^2"
# Display equation with Greek / subscript / integral — verify rendering below
officecli add "$FILE" /body --type equation --prop mode=display --prop formula="\\lambda_1 + \\alpha"
officecli add "$FILE" /body --type equation --prop mode=display --prop formula="\\frac{1}{2\\pi} \\int_0^{\\infty} e^{-x^2} dx"
# Inline equation INSIDE prose — required whenever variables like x_{t+1}, \lambda, etc. appear in a body paragraph:
officecli add "$FILE" /body --type paragraph --prop text="Given the weight " --prop size=11pt
officecli add "$FILE" "/body/p[last()]" --type equation --prop mode=inline --prop formula="W_t"
officecli add "$FILE" "/body/p[last()]" --type run --prop text=" we define the loss..."
```

**Verify equations render as OMML math**, not plain-text LaTeX tokens. After `close`, run:

```bash
officecli view "$FILE" text | head -20       # λ₁ + α, ∫₀∞, x² must appear as unicode math (verified renders)
officecli raw "$FILE" /document | grep -c '<m:oMathPara'   # ≥ 1 per display equation
```

If the body prose contains raw `lambda_1`, `x_{t+1}`, `\alpha` or similar plain-text tokens (i.e., you typed them into a `paragraph --prop text=` instead of wrapping with `--type equation --prop mode=inline`), downstream viewers will render them as literal ASCII. **Rule: every mathematical variable / Greek letter / subscript in prose goes through `--type equation mode=inline`, never through `paragraph --prop text=`.**

**LaTeX subset pitfalls** (non-negotiable):

1. `\left(...\right)` / `\left[...\right]` + sub/superscript inside → **cast error crash**. Use plain `(`, `)`, `[`, `]` — OMML auto-sizes delimiters in display mode.
2. `\mathcal{L}` → invalid OMML. Use `\mathit{L}` or plain uppercase letters.
3. `move` on `/body/oMathPara[N]` does not reliably reposition. Workaround: `add` at target position, `remove` the original.

**Equation numbering** — no native `\eqno`. Add the display equation, then add a right-aligned paragraph `"(1)"` immediately after with `spaceBefore=0 spaceAfter=6pt`. Separate line, works in 2-col. **Do NOT place `--type equation` directly in a table cell `tc[N]`** — it emits `oMathPara` as a direct `<w:tc>` child (illegal OOXML). Target `tc[N]/p[1]` with `mode=inline` if you need equations in cells.

Full equation schema: `officecli help docx equation`.

## Figures, tables, and cross-references (SEQ + PAGEREF)

Two primitives, both **native fieldTypes** (verified against `officecli help docx field` v1.0.63): `seq` for auto-numbered caption counters, `pageref` for "see Fig. 2 on page 7" back-references. Native fields insert correctly, but their **cached rendered values** need a one-shot raw-set patch per field (see §SEQ cached-value trap below) — otherwise downstream viewers that don't recompute cached fields will show every figure as "Fig. 1".

### SEQ auto-numbering — figures and tables

A SEQ field is a counter with a name (`identifier`). Every `SEQ Figure` increments the Figure counter on **recalc**; every `SEQ Table` increments the Table counter.

**⚠️ SEQ cached-value trap (verified on v1.0.63).** The CLI emits every SEQ field with cached result `1` — so a document with 3 Figure captions readbacks as `Figure 1 / Figure 1 / Figure 1` via `view text` or `query field[fieldType=seq]`, and any downstream viewer that doesn't recompute cached fields will display the same `Figure 1 / Figure 1 / Figure 1`. Word and WPS recompute on open when `w:updateFields=true` is set in settings. **Two must-do steps per paper with multiple figures/tables:**

1. Flip `updateFields=true` in settings once per document (right after `create`). **Position matters** — OOXML `CT_Settings` schema rejects `<w:updateFields>` as the first child; insert it _before_ `<w:compat>`:
   ```bash
   officecli raw-set "$FILE" /settings --xpath '//w:compat' --action insertbefore \
     --xml '<w:updateFields xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:val="true"/>'
   ```
2. **Patch the cached `<w:t>` after each SEQ field** so the artifact reads correctly in every viewer:
   ```bash
   # After adding the Nth SEQ Figure caption, override cached "1" to the real number N:
   officecli raw-set "$FILE" /document \
     --xpath "(//w:p[.//w:instrText[contains(text(),'SEQ Figure')]])[N]//w:fldChar[@w:fldCharType='separate']/following::w:t[1]" \
     --action replace \
     --xml '<w:t xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xml:space="preserve">N</w:t>'
   ```
   Repeat for N = 1, 2, 3, ... for every figure; same pattern with `SEQ Table` for tables. After patching, `officecli view "$FILE" text` will show `Figure 1 / Figure 2 / Figure 3` — and downstream viewers will too.

```bash
# Figure with caption BELOW the image. Caption = "Figure <seq>: title" + optional bookmark for cross-ref.
officecli add "$FILE" /body --type picture --prop src=arch.png --prop width=5in
officecli set "$FILE" "/body/p[last()]/r[last()]" --prop alt="Model architecture: attention over time-series sensors"
# Caption paragraph (below the figure, per academic convention)
officecli add "$FILE" /body --type paragraph --prop text="Figure " --prop style=Caption --prop size=10pt --prop italic=true --prop align=center
officecli add "$FILE" "/body/p[last()]" --type field --prop fieldType=seq --prop identifier=Figure
officecli add "$FILE" "/body/p[last()]" --type run --prop text=": Attention-based anomaly detection model."
# Bookmark the caption so other paragraphs can PAGEREF it
officecli add "$FILE" /body --type bookmark --prop name=fig_arch
# Patch cached value — this is Figure 1 (first SEQ Figure in doc)
officecli raw-set "$FILE" /document \
  --xpath "(//w:p[.//w:instrText[contains(text(),'SEQ Figure')]])[1]//w:fldChar[@w:fldCharType='separate']/following::w:t[1]" \
  --action replace --xml '<w:t xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xml:space="preserve">1</w:t>'
```

### PAGEREF — cross-reference by bookmark

```bash
# Cross-ref paragraph: "see Figure 1 on page X"
officecli add "$FILE" /body --type paragraph --prop text="As shown in Figure 1 (see page " --prop size=11pt --prop lineSpacing=1.5x
officecli add "$FILE" "/body/p[last()]" --type field --prop fieldType=pageref --prop name=fig_arch
officecli add "$FILE" "/body/p[last()]" --type run --prop text=")."
```

### Tables — caption ABOVE

```bash
# Caption first (ABOVE the table), THEN the table
officecli add "$FILE" /body --type paragraph --prop text="Table " --prop style=Caption --prop size=10pt --prop italic=true --prop spaceAfter=6pt
officecli add "$FILE" "/body/p[last()]" --type field --prop fieldType=seq --prop identifier=Table
officecli add "$FILE" "/body/p[last()]" --type run --prop text=": Participant demographics (N=47)."
officecli add "$FILE" /body --type table --prop rows=5 --prop cols=4 --prop width=100%
# ... fill header + rows per docx v2 §Tables
```

### Verify SEQ + PAGEREF fields landed

```bash
# At least one SEQ Figure or SEQ Table in the body document part
officecli raw "$FILE" /document | grep -c 'w:instrText[^>]*>[^<]*SEQ'   # expect ≥ 1
officecli raw "$FILE" /document | grep -c 'w:instrText[^>]*>[^<]*PAGEREF' # 0 ok if no cross-refs
```

Live fields carry **cached values** that render stale until a human presses F9 in Word. Expect "Figure 1" to show as `1`, `2`, ... immediately after recalc; before recalc, some viewers render `0` or blank. Judge field presence by `fldChar` existence, not by visible digit (→ see docx v2 §Field / cached-value spot-check).

## Footnotes vs endnotes

**Footnote** — sits at the bottom of the page where its anchor paragraph lives. Used for source citations in Chicago Notes-Bib, content asides in any style.

**Endnote** — sits at the end of the document (or before the bibliography). Used by some venues in place of footnotes, or for long contextual notes that would clutter the page.

```bash
# Footnote anchored to paragraph N
officecli add "$FILE" "/body/p[3]" --type footnote --prop text="Smith et al. reported similar findings in their 2023 review."
# Endnote
officecli add "$FILE" /endnotes --type endnote --prop text="Extended derivation of equation (4) is available at the project repository."
```

Both appear as empty-string runs in `view annotated` output (`r[N] ""`) — the run carries a `<w:footnoteReference>` XML element, not visible text. Confirm insertion with `officecli query "$FILE" 'footnote'` or `officecli get "$FILE" "/footnotes/footnote[N]"`. Footnotes do NOT shift paragraph indices; add them in any order after body content is in place. Full schema: `officecli help docx footnote` / `officecli help docx endnote`.

## Bibliography section

Every academic paper ends with a reference list. The name of the section depends on the style (**References** for APA / IEEE / Chicago Author-Date; **Bibliography** for Chicago Notes-Bib; **Works Cited** for MLA). Each entry is a separate paragraph with **hanging indent**.

```bash
# Section heading — same as body Heading1 (excluded from body numbering by convention)
officecli add "$FILE" /body --type paragraph --prop text="References" --prop style=Heading1 --prop size=20pt --prop bold=true --prop spaceBefore=18pt --prop spaceAfter=12pt
# Each entry: hanging indent 720 twips (0.5"), with indent=720 as the partner (first line flush, wraps indented)
officecli add "$FILE" /body --type paragraph --prop text="Smith, J. (2024). Remote work and cohesion. Journal of Applied Psychology, 109(3), 412-430." --prop size=12pt --prop lineSpacing=2x --prop indent=720 --prop hangingIndent=720
# DOI hyperlink on its own run appended to the entry paragraph
officecli add "$FILE" "/body/p[last()]" --type hyperlink --prop url="https://doi.org/10.1037/apl0001123" --prop text="https://doi.org/10.1037/apl0001123"
```

Verified: `--prop indent=720 --prop hangingIndent=720` is the canonical hanging-indent pair per `officecli help docx paragraph`. The old `ind.firstLine=-720` form (negative first-line indent) is NOT canonical and fails schema on emit — → see docx v2 §Schema-invalid-on-emit.

**Round-trip QA.** Count in-text citation markers (APA `(Author, Year)`, IEEE `[N]`, MLA `(Author N)`) vs reference-list entries. See Delivery Gate 4 below. Every cited key must resolve; every listed entry should be cited at least once.

## Multi-column (IEEE journal two-column recipe)

IEEE and many engineering / physics journals render body text in two columns with a single-column abstract above. The mechanism: a section break with `type=continuous` and `columns=2`, then another section break at the end to **revert** to single-column.

**The reversion step is not optional.** Without it, the rest of the document — including references — renders as two columns. This is the single most common multi-column failure.

```bash
FILE="ieee.docx"
officecli create "$FILE"
officecli open "$FILE"

# 1. Title, authors, affiliation — single-column (the default first section)
officecli add "$FILE" /body --type paragraph --prop text="Attention-Based Anomaly Detection for Industrial Time Series" --prop align=center --prop size=18pt --prop bold=true --prop spaceAfter=12pt
officecli add "$FILE" /body --type paragraph --prop text="Alice Chen, Bob Martinez" --prop align=center --prop size=11pt
officecli add "$FILE" /body --type paragraph --prop text="Department of CS, Stanford University" --prop align=center --prop size=10pt --prop spaceAfter=18pt

# 2. Abstract — still single-column, block-style
officecli add "$FILE" /body --type paragraph --prop text="Abstract" --prop align=center --prop size=12pt --prop bold=true --prop spaceAfter=6pt
officecli add "$FILE" /body --type paragraph --prop text="We present an attention-based model for detecting anomalies in industrial sensor time series..." --prop size=10pt --prop lineSpacing=1.15x --prop spaceAfter=12pt

# 3. Section break + two-column from here on
#    CRITICAL: `/section[last()]` is REJECTED on v1.0.63 (cast-error). Count sections first, use explicit /section[N].
officecli add "$FILE" /body --type section --prop type=continuous
SECTION_COUNT=$(officecli query "$FILE" section --json | jq '.data.results | length')
# After the add, SECTION_COUNT should be 2 — [1] is pre-break, [2] is post-break (2-col body area).
officecli set "$FILE" "/section[2]" --prop columns=2 --prop columnSpace=1cm

# 4. Body — IEEE wants Roman numerals + ALL CAPS section titles (P1.2).
officecli add "$FILE" /body --type paragraph --prop text="I. INTRODUCTION" --prop style=Heading1 --prop size=10pt --prop bold=true
officecli add "$FILE" /body --type paragraph --prop text="Industrial anomaly detection has been studied since [1]..." --prop size=10pt --prop lineSpacing=1.15x --prop firstLineIndent=360

# 5. At the end of 2-column body, ANOTHER section break + revert to single column for references / appendices
# (If you want references in 2-col too, skip step 5 — but most IEEE papers use 2-col for references as well.)
# officecli add "$FILE" /body --type section --prop type=continuous
# Then re-count and use the new explicit /section[N], NOT /section[last()]:
# officecli set "$FILE" "/section[3]" --prop columns=1

# 6. Footer, close, validate
officecli add "$FILE" / --type footer --prop type=default --prop align=center --prop size=9pt --prop field=page
officecli close "$FILE"
officecli validate "$FILE"
```

**Visual verify.** Run `officecli view "$FILE" html` and Read the returned HTML to audit the rendered output. The abstract must render as full-width and the introduction onward as two columns. If the abstract wraps into two narrow columns, the first section break landed before the abstract — move it.

**Section index bookkeeping.** Each `add /body --type section` inserts one empty paragraph into `/body` (the section-break marker). All subsequent `p[N]` indices shift by +1 per section break. Plan section breaks in advance; after adding a break, `officecli get "$FILE" /body --depth 1` to re-index before continuing.

Full section schema (`columns`, `columnSpace`, `orientation`, `pageNumFmt`, `titlePage`, `lineNumbers`): `officecli help docx section`.

## Abstract / keywords / affiliation block

First-page metadata stack: title (centered 20-22pt bold) → authors (centered 12pt, superscript `^1 ^2` for multi-affiliation) → affiliations (centered 11pt, keyed to superscripts) → submission target / date → **Abstract** heading (14pt bold) → abstract body (block-style, **NO `firstLineIndent`**, 150-300 words) → keywords line (italic 11pt). Same "cover ≥ 60% filled" rule as docx v2.

```bash
# Superscript affiliation markers (multi-institution paper)
officecli add "$FILE" /body --type paragraph --prop text="Alice Chen" --prop align=center --prop size=12pt
officecli add "$FILE" "/body/p[last()]" --type run --prop text="1" --prop superscript=true
officecli add "$FILE" "/body/p[last()]" --type run --prop text=", Bob Martinez"
officecli add "$FILE" "/body/p[last()]" --type run --prop text="2" --prop superscript=true
# Running header (skip on cover via type=first empty header — see docx v2 §headers)
officecli add "$FILE" / --type header --prop type=default --prop align=right --prop size=9pt --prop text="Short Running Title"
```

**Nature-family 2-col abstract** is rare — if required, open a `section type=continuous columns=2` BEFORE the abstract heading; short abstracts (<100 words) leave ragged columns. **Mirrored odd/even headers** need `<w:evenAndOddHeaders/>` in settings via `raw-set` — not exposed by high-level API on 1.0.63; deliver without mirroring or inject the flag manually. Full header schema: `officecli help docx header`.

## QA — Delivery Gate (executable)

**Assume there are problems. Your job is to find them.** First render is almost never correct. Run this block before declaring done.

### Gates 1-3 — inherited from docx v2

→ see docx v2 §Delivery Gate. Schema validate, token leak grep, live PAGE field structure. Copy-paste the docx v2 gate block first. Every check must print its success message.

### Gate 4 — citation round-trip

Every in-text citation key should resolve to a bibliography entry. Count mismatches = REJECT.

```bash
# IEEE example (bracketed numerics). Adjust regex for APA (Author, Year) or MLA (Author Page).
CITATIONS=$(officecli view "$FILE" text | grep -oE '\[[0-9]+\]' | sort -u | wc -l)
ENTRIES=$(officecli query "$FILE" 'paragraph[hangingIndent]' --json | jq '.data.results | length')
echo "In-text citation markers: $CITATIONS | Bibliography entries: $ENTRIES"
# REJECT when citations exceed entries (cites without references). Entries > citations is allowed by some venues.
[ "$CITATIONS" -le "$ENTRIES" ] && echo "Gate 4 OK" || { echo "REJECT Gate 4: $CITATIONS in-text markers but only $ENTRIES bibliography entries"; exit 1; }
```

### Gate 5a — SEQ presence + cached numbers distinct

If the paper has any numbered figure or table, the body must carry live `SEQ` fields AND their cached values must show distinct ascending numbers (else `view text` and downstream viewers that don't recompute cached fields will show "Figure 1" for all).

```bash
# Count SEQ fields via query (raw-grep collapses multi-matches on one XML line → undercounts).
SEQ_COUNT=$(officecli query "$FILE" 'field[fieldType=seq]' --json | jq '.data.results | length')
VISIBLE_FIG=$(officecli view "$FILE" text | grep -cE '(Figure|Table) [0-9]+')
if [ "$VISIBLE_FIG" -gt 0 ] && [ "$SEQ_COUNT" -eq 0 ]; then
  echo "REJECT Gate 5a: $VISIBLE_FIG visible Figure/Table labels but 0 SEQ fields."
  exit 1
fi
# Cached values must be distinct (CLI emits "1" per field by default → all three would show "Figure 1").
# After the raw-set patches in §SEQ, view text should show Figure 1 / Figure 2 / Figure 3:
DISTINCT=$(officecli view "$FILE" text | grep -oE '(Figure|Table) [0-9]+' | sort -u | wc -l)
[ "$SEQ_COUNT" -le "$DISTINCT" ] && echo "Gate 5a OK (SEQ=$SEQ_COUNT, distinct=$DISTINCT)" || { echo "REJECT Gate 5a: $SEQ_COUNT SEQ fields but only $DISTINCT distinct rendered labels — patch cached <w:t> after each SEQ field"; exit 1; }
```

### Gate 5b — Visual audit via HTML preview (MANDATORY, not optional)

Gates 1–5a catch schema, token leaks, live-field presence, citation counts. **They do NOT catch physical assembly defects** — scrambled page order, a duplicated Abstract mid-document, three figures all labeled "Fig. 1" despite SEQ field presence, equation variables rendering as plain-text LaTeX (`lambda_1`, `x_{t+1}`) instead of math. Do not skip — Gates 1–5a pass ≠ visual OK.

Run `officecli view "$FILE" html` and Read the returned HTML path. For every page of the paper, answer:

> (a) Are pages in logical academic sequence? (Title → Abstract → Keywords → Introduction → body → References — no forward jumps, no backward leaks.)
> (b) Does the Abstract appear exactly once, not duplicated mid-document?
> (c) Are Figure N / Table N labels distinct and ascending? (Fig. 1, Fig. 2, Fig. 3 — not all "Fig. 1". Same for tables.)
> (d) Do equations render as math? (Italicized variables, Greek letters like λ / α, proper integrals / fractions — NOT plain-text `lambda_1`, `x_{t+1}`, `\int`.)
> (e) For IEEE papers: are section titles ALL CAPS with Roman numerals (`I. INTRODUCTION`)? Are tables Roman (`Table I`, `Table II`)?
> (f) For APA papers: are Level-1 headings centered bold and unnumbered (not `1. Introduction`)?
> (g) Does every in-text "see Fig. N" / "see Table N" resolve to a figure/table that actually carries that number?
> (h) Heading hierarchy visually distinct (size + weight) across H1 / H2 / H3?

Report every instance. If even one defect is present → REJECT; do not deliver until fixed.

**Human preview (optional).** If you want the user to visually preview the paper, run `officecli watch "$FILE"` for a live preview the user can open at their own discretion, or have them open the `.docx` directly in Word / WPS / Pages. For final visual verification, open the file in the target viewer.

### Honest limit

`validate` catches schema errors, not academic-style errors. A document passes `validate` with APA citations in an IEEE paper, footnotes in a style that forbids them, or figures with hardcoded numbers that drift when a new figure is inserted. The gates above — especially Gate 4 (round-trip) and Gate 5 (SEQ presence) — are how you catch what validate cannot.

## Known Issues & Pitfalls (academic-specific)

→ Base pitfalls (shell escape, `\$ \t \n` literals, table cell formatting order, `pageBreakBefore` belt-and-suspenders, `shd.fill` / `ind.firstLine` schema-invalid forms, TOC cached values, watermark two-step): see docx v2 §Known Issues & Pitfalls.

Academic-specific:

- **`\left(...\right)` / `\left[...\right]` + sub/superscript crashes.** Cast error. Use plain `(`, `)`, `[`, `]` — OMML auto-sizes in display mode.
- **`\mathcal{L}` emits invalid OMML.** Use `\mathit{L}` or plain uppercase. `\mathbf`, `\mathit`, `\mathbb` work; `\mathcal` does not.
- **`move` on `/body/oMathPara[N]` not reliable.** Do not rely on `move` to reposition display equations. Workaround: `add` at the target position, `remove` the original.
- **Section break +1 paragraph offset.** Each `add /body --type section` inserts one empty paragraph into `/body`. All `p[N]` indices after the break shift by +1. Plan breaks; after any `add section`, `officecli get "$FILE" /body --depth 1` to re-index.
- **`/section[last()]` is REJECTED on v1.0.63** (cast-error, same family as pptx's `/slide[last()]`). Always resolve to an explicit `/section[N]`:
  ```bash
  SECTION_COUNT=$(officecli query "$FILE" section --json | jq '.data.results | length')
  # then use /section[2], /section[3], ..., NEVER /section[last()]
  ```
  Each `add /body --type section` increments the count. Re-query after every break.
- **Multi-column does NOT auto-revert.** After a `columns=2` section, you must add another section break and explicitly set `columns=1` on the new `/section[N]` (N = post-revert count) — otherwise the rest of the document, including references, renders as two columns. Verify with `officecli get "$FILE" "/section[N]"` for each N.
- **`--type equation` targeting a `tc[N]` path emits illegal OOXML.** Inside a table cell, target `tc[N]/p[1]` with `--prop mode=inline` instead. Display equations (`oMathPara`) are not legal as direct `<w:tc>` children.
- **Hanging-indent canonical form is `indent=720 hangingIndent=720`.** Not `ind.firstLine=-720`. The dotted form emits `<w:ind>` after `<w:jc>` and fails schema on emit.
- **Footnote reference runs show as empty strings in `view annotated`.** The `<w:footnoteReference>` XML element has no visible text on the reference side; the note body lives in `/footnotes/footnote[N]`. Confirm with `officecli query "$FILE" 'footnote'`, not by eyeballing `view text`.
- **Caption placement:** Table caption ABOVE the table; Figure caption BELOW the figure. Every major style (APA, Chicago, IEEE, MLA) agrees. Putting a Table caption below the table is an academic-style error, not a rendering issue — `validate` will not catch it.
- **TOC cached rendering / static fallback / shell-escape:** → see docx v2 §TOC delivery step, §Report-level recipes (f), §Shell escape.

## Renderer quirks (cross-viewer)

→ see docx v2 §Renderer quirks. PAGE / TOC cached values, OMML baseline shifts, scheme colors — all identical quirks apply to academic papers. Before calling an equation or a citation marker broken, open the file in the user's target viewer (Word, WPS, Pages) — if it renders correctly there, it is a viewer quirk, not a skill defect.

## Help pointer

When in doubt: `officecli help docx`, `officecli help docx <element>`, `officecli help docx <element> --json`. Help is the authoritative schema; this skill is the decision guide for academic deltas on top of docx v2.
