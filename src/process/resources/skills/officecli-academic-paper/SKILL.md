---
name: academic-paper
description: "Use this skill when the user wants to create an academic paper, research paper, white paper, technical report, policy brief, or any formally structured document with TOC, equations, footnotes, endnotes, or scholarly formatting. Trigger on: 'academic paper', 'research paper', 'white paper', 'technical report', 'policy brief', 'journal paper', 'scholarly document', 'paper with equations', 'paper with footnotes', 'paper with TOC', 'manuscript', 'conference paper'. Output is always a single .docx file."
---

# Academic Paper Skill

Create formally structured Word documents with Table of Contents, equations (LaTeX to OMML), footnotes/endnotes, bibliography, and scholarly formatting. Output is a single `.docx` file. This skill supersedes the docx creating.md Academic Paper recipe -- use THIS skill for any document requiring TOC + equations + footnotes + formal structure.

---

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
        echo "Upgrading officecli $CURRENT -> $LATEST..."
        curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
    else
        echo "officecli $CURRENT is up to date"
    fi
fi
officecli --version
```

---

## Use When

- User wants to create a **research paper, journal manuscript, or conference paper** with academic structure (abstract, numbered sections, references)
- User wants a **white paper, policy brief, or technical report** with formal structure (executive summary, TOC, branded headers)
- User needs **math equations** (LaTeX to OMML) in a Word document
- User needs **footnotes, endnotes, or bibliography** with hanging indent
- User needs a **Table of Contents** that auto-updates in Word
- User mentions "APA", "MLA", "Chicago", or any citation style formatting
- User needs **multi-column abstract** or **mixed portrait/landscape** sections

## Don't Use When

- User wants a **general letter, memo, contract, or simple report** -- use docx skill
- User wants a **presentation** -- use pptx skill
- User wants a **spreadsheet or dashboard** -- use xlsx or data-dashboard skill
- User needs **LaTeX output** (.tex file) -- this skill produces .docx only
- User needs **graduate thesis with Roman numeral front-matter pagination** -- deferred to Phase 2
- User needs **tracked changes or collaborative editing markup** -- use docx skill with raw-set

---

## What This Skill Produces

A single `.docx` file with:

| Component                                                             | Description                                      |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| Cover / title block                                                   | Centered title, authors, affiliations            |
| Table of Contents                                                     | Native Word TOC field (levels 1-3), updateable   |
| Structured sections                                                   | Heading1/2/3 hierarchy with consistent styling   |
| Equations                                                             | Display and inline OMML from LaTeX subset        |
| Footnotes / endnotes                                                  | Inline references at correct paragraph positions |
| Bibliography                                                          | Hanging indent, per-citation-style formatting    |
| Headers / footers                                                     | Page numbers, optional branding                  |
| Optional: watermark, charts, custom bordered blocks, cross-references |

---

## Core Concepts

### Style-First Architecture (NON-NEGOTIABLE)

Define ALL styles before adding ANY content. Skipping style definitions causes formatting failures in 100% of cases. Different Word versions define Heading1 as 14pt, 16pt, or 13pt -- explicit style setup eliminates this variance.

### Font Size Hierarchy

| Style         | Size    | Weight        | spaceBefore    | spaceAfter     |
| ------------- | ------- | ------------- | -------------- | -------------- |
| Heading1      | >= 16pt | bold          | 360 (18pt)     | 120 (6pt)      |
| Heading2      | >= 14pt | bold          | 360 (18pt)     | 80 (4pt)       |
| Heading3      | >= 12pt | bold + italic | 240 (12pt)     | 80 (4pt)       |
| Body (Normal) | 11-12pt | regular       | per paper type | per paper type |
| Caption       | 9-10pt  | italic        | --             | --             |
| FootnoteText  | 9-10pt  | regular       | --             | --             |

### Verified LaTeX Subset

| Category          | LaTeX                                                   | Notes                           |
| ----------------- | ------------------------------------------------------- | ------------------------------- |
| Fractions         | `\frac{a}{b}`                                           | Nested supported                |
| Sub/superscripts  | `x_i`, `x^{n+1}`                                        | Multi-char needs braces         |
| Summation         | `\sum_{n=1}^{\infty}`                                   | Limits above/below in display   |
| Integration       | `\int_0^{\infty}`, `\oint`                              | Single, double, and contour     |
| Products          | `\prod_{i=1}^{n}`                                       |                                 |
| Limits            | `\lim_{x \to 0}`                                        |                                 |
| Square roots      | `\sqrt{x}`, `\sqrt[3]{x}`                               | nth-root supported              |
| Greek letters     | `\alpha` .. `\Omega`                                    | Both cases                      |
| Nabla / partial   | `\nabla`, `\partial`                                    |                                 |
| Accents           | `\hat{x}`, `\bar{x}`, `\tilde{x}`, `\vec{x}`, `\dot{x}` |                                 |
| Bold math         | `\mathbf{x}`                                            | For vectors                     |
| Aligned           | `\begin{aligned}...\end{aligned}`                       | Multi-line systems              |
| Matrices          | `\begin{pmatrix}...\end{pmatrix}`                       | Also bmatrix, vmatrix           |
| Angle brackets    | `\langle`, `\rangle`                                    | For bra-ket notation            |
| Simple delimiters | `\left[...\right]`                                      | ONLY when NO sub/super inside   |
| **DO NOT USE**    | `\left[...\right]` + subscript/superscript inside       | Cast error crash                |
| **DO NOT USE**    | `\left(...\right)` + subscript/superscript inside       | Same crash                      |
| **DO NOT USE**    | `\mathcal{L}`                                           | Invalid XML -- use `\mathit{L}` |

### Footnote Behavior

Footnotes are inline reference runs within the target paragraph. They do NOT create new paragraphs and do NOT shift paragraph indices. You can add footnotes in any order -- forward, reverse, or arbitrary. The old "reverse order" advice is obsolete as of v1.0.24.

---

## Workflow Overview

### Phase 1: Analyze Input

Classify paper type (social science, physics/math, white paper). Look up the Feature Selection Table in creating.md Section A. Plan which sections to follow.

### Phase 2: Setup

Create document, set defaults + margins, define ALL styles upfront. Plan section breaks if multi-column or landscape is needed.

### Phase 3: Build

Add content in order: cover, TOC, abstract, body sections, equations, tables, footnotes, bibliography, headers/footers, watermark.

### Phase 4: QA

Run verification loop: `validate`, `view outline`, `view issues`, `view text`. Fix and re-verify.

---

## Quick Reference: Key Warnings

| Warning                      | Detail                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `\left`/`\right` + sub/super | Crashes with cast error. Use plain `()`, `[]` -- OMML auto-sizes.                                                                                        |
| pbdr at style level          | `add /styles --prop pbdr.all=...` is silently dropped. `set /styles/X --prop pbdr.all=...` is rejected. Always set borders per-paragraph after creation. |
| Section break +1 offset      | Each section break inserts one empty paragraph into /body. Account for +1 index offset on all subsequent `p[N]` references.                              |
| Shell escaping for LaTeX     | Double backslashes in bash: `--prop "formula=\\frac{a}{b}"`. Use heredoc for complex formulas.                                                           |
| Batch JSON values            | ALL values must be strings: `"true"` not `true`, `"24"` not `24`.                                                                                        |
| Batch intermittent failure   | ~1-in-15 failure rate. Retry on error. Keep arrays to 10-15 max.                                                                                         |

---

## Quick Start (Social Science Paper Skeleton)

```bash
officecli create paper.docx
officecli set paper.docx / --prop defaultFont="Times New Roman"
officecli set paper.docx '/section[1]' --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440
officecli add paper.docx /styles --type style --prop id=Heading1 --prop name="Heading 1" --prop type=paragraph --prop font="Times New Roman" --prop size=16 --prop bold=true --prop spaceBefore=360 --prop spaceAfter=120 --prop keepNext=true
officecli add paper.docx /body --type toc --prop levels=1-3 --prop title="Table of Contents"
officecli add paper.docx /body --type paragraph --prop text="Introduction" --prop style=Heading1
officecli add paper.docx /body --type paragraph --prop text="This paper examines..." --prop size=12 --prop lineSpacing=2x
```

Follow [creating.md](creating.md) for the full step-by-step guide.

---

## References

- [creating.md](creating.md) -- Complete academic paper creation guide
- [docx SKILL.md](../docx/SKILL.md) -- General docx reading, editing, and QA reference
- [docx creating.md](../docx/creating.md) -- General building blocks (paragraphs, tables, images, etc.)
