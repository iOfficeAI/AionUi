<!-- officecli: v1.0.23 -->

# Creating Documents from Scratch

Use this guide when creating a new document with no template.

## Workflow Overview

1. **Create** blank document
2. **Plan** document structure (outline + element types)
3. **Build** content (add elements, style, repeat)
4. **QA** (content + validation) -- see [SKILL.md](SKILL.md#qa-required)

---

## Setup

```bash
# Create blank document
officecli create doc.docx

# Set metadata
officecli set doc.docx / --prop title="Q4 Report" --prop author="Team Alpha"

# Set page size (US Letter with 1" margins)
officecli set doc.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440

# Set default font
officecli set doc.docx / --prop defaultFont=Calibri
```

### Page Size Reference

| Paper | pageWidth | pageHeight |
|-------|-----------|------------|
| US Letter | 12240 | 15840 |
| A4 | 11906 | 16838 |
| Legal | 12240 | 20160 |

Values are in twips (1440 twips = 1 inch, 567 twips = 1 cm).

---

## Document Structure Recipes

Complete recipes for common document types. Each recipe is a full, copy-pasteable sequence.

### Recipe: Business Report

```bash
# Create and open (resident mode for many operations)
officecli create report.docx
officecli open report.docx

# Metadata and page setup
officecli set report.docx / --prop title="Q4 Business Report" --prop author="Team Alpha"
officecli set report.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440
officecli set report.docx / --prop defaultFont=Calibri

# Define heading styles (blank documents have no built-in style formatting)
officecli add report.docx /styles --type style --prop name="Heading 1" --prop id=Heading1 --prop type=paragraph --prop font=Calibri --prop size=16pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=24pt --prop spaceAfter=12pt --prop keepNext=true
officecli add report.docx /styles --type style --prop name="Heading 2" --prop id=Heading2 --prop type=paragraph --prop font=Calibri --prop size=13pt --prop bold=true --prop color=2E75B6 --prop spaceBefore=18pt --prop spaceAfter=6pt --prop keepNext=true

# Header with company name
officecli add report.docx / --type header --prop text="Acme Corporation" --prop type=default --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=right

# Footer with page numbers
officecli add report.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt
officecli add report.docx "/footer[1]" --type field --prop fieldType=page --prop font=Calibri --prop size=9pt

# Watermark
officecli add report.docx / --type watermark --prop text=DRAFT --prop color=C0C0C0 --prop opacity=0.5

# Title page
officecli add report.docx /body --type paragraph --prop text="Acme Corporation" --prop alignment=center --prop size=14pt --prop color=1F4E79 --prop spaceBefore=72pt
officecli add report.docx /body --type paragraph --prop text="Q4 Business Report" --prop alignment=center --prop size=28pt --prop bold=true --prop color=1F4E79 --prop spaceAfter=12pt
officecli add report.docx /body --type paragraph --prop text="Fiscal Year 2025" --prop alignment=center --prop size=14pt --prop color=4472C4 --prop spaceAfter=24pt
officecli add report.docx /body --type paragraph --prop text="Prepared by: Team Alpha" --prop alignment=center --prop color=666666 --prop spaceAfter=6pt
officecli add report.docx /body --type paragraph --prop text="March 2026" --prop alignment=center --prop color=666666
officecli add report.docx /body --type pagebreak

# Table of Contents
officecli add report.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true --index 0

# Title and executive summary
officecli add report.docx /body --type paragraph --prop text="Q4 Business Report" --prop style=Heading1
officecli add report.docx /body --type paragraph --prop text="Executive Summary" --prop style=Heading2
officecli add report.docx /body --type paragraph --prop text="This report summarizes Q4 performance across all divisions. Revenue grew 25% year-over-year while operating costs decreased 12%." --prop font=Calibri --prop size=11pt --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Key highlights (bulleted list)
officecli add report.docx /body --type paragraph --prop text="Key Highlights" --prop style=Heading2
officecli add report.docx /body --type paragraph --prop text="Revenue increased to $5.1M (+25% YoY)" --prop listStyle=bullet
officecli add report.docx /body --type paragraph --prop text="Customer retention rate reached 94%" --prop listStyle=bullet
officecli add report.docx /body --type paragraph --prop text="New market expansion on track for Q1 launch" --prop listStyle=bullet

# Revenue section with table
officecli add report.docx /body --type paragraph --prop text="Revenue Overview" --prop style=Heading2
officecli add report.docx /body --type table --prop rows=4 --prop cols=3 --prop width="100%" --prop style=TableGrid

# Set header row text and flag
officecli set report.docx "/body/tbl[1]/tr[1]" --prop c1="Division" --prop c2="Q3" --prop c3="Q4" --prop header=true

# Style header cells individually (row set does NOT support bold/shd/color)
officecli set report.docx "/body/tbl[1]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set report.docx "/body/tbl[1]/tr[1]/tc[2]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set report.docx "/body/tbl[1]/tr[1]/tc[3]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF

# Fill data rows
officecli set report.docx "/body/tbl[1]/tr[2]" --prop c1="North America" --prop c2="$4.2M" --prop c3="$5.1M"
officecli set report.docx "/body/tbl[1]/tr[3]" --prop c1="Europe" --prop c2="$3.1M" --prop c3="$3.8M"
officecli set report.docx "/body/tbl[1]/tr[4]" --prop c1="APAC" --prop c2="$1.8M" --prop c3="$2.3M"

# Set table borders
officecli set report.docx "/body/tbl[1]" --prop border.all="single;4;CCCCCC;0"

# Column chart
officecli add report.docx /body --type paragraph --prop text="Revenue Trend" --prop style=Heading2
officecli add report.docx /body --type chart --prop chartType=column --prop title="Quarterly Revenue" --prop categories="Q1,Q2,Q3,Q4" --prop series1="2024:42,58,65,78" --prop series2="2025:51,67,74,92" --prop width=15cm --prop height=10cm --prop colors=1F4E79,4472C4 --prop legend=bottom

# Validate and close
officecli validate report.docx
officecli close report.docx
```

### Recipe: Formal Letter

```bash
officecli create letter.docx

# Page setup
officecli set letter.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440

# Date
officecli add letter.docx /body --type paragraph --prop text="March 27, 2026" --prop alignment=right --prop spaceAfter=24pt

# Sender address (right-aligned)
officecli add letter.docx /body --type paragraph --prop text="Jane Smith" --prop alignment=right
officecli add letter.docx /body --type paragraph --prop text="Acme Corporation" --prop alignment=right
officecli add letter.docx /body --type paragraph --prop text="123 Business Ave, Suite 400" --prop alignment=right
officecli add letter.docx /body --type paragraph --prop text="New York, NY 10001" --prop alignment=right --prop spaceAfter=24pt

# Recipient address
officecli add letter.docx /body --type paragraph --prop text="John Doe" --prop spaceAfter=0pt
officecli add letter.docx /body --type paragraph --prop text="Partner Corp" --prop spaceAfter=0pt
officecli add letter.docx /body --type paragraph --prop text="456 Commerce St" --prop spaceAfter=0pt
officecli add letter.docx /body --type paragraph --prop text="Chicago, IL 60601" --prop spaceAfter=24pt

# Subject line
officecli add letter.docx /body --type paragraph --prop text="RE: Partnership Agreement Q2 2026" --prop bold=true --prop spaceAfter=12pt

# Body paragraphs
officecli add letter.docx /body --type paragraph --prop text="Dear Mr. Doe," --prop spaceAfter=12pt --prop lineSpacing=1.15x
officecli add letter.docx /body --type paragraph --prop text="Thank you for your continued partnership with Acme Corporation. We are pleased to present the updated terms for our Q2 2026 collaboration agreement." --prop spaceAfter=12pt --prop lineSpacing=1.15x
officecli add letter.docx /body --type paragraph --prop text="As discussed during our March 15th meeting, the revised pricing structure reflects a 10% volume discount applicable to all orders exceeding 500 units per quarter." --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Closing
officecli add letter.docx /body --type paragraph --prop text="Sincerely," --prop spaceAfter=36pt
officecli add letter.docx /body --type paragraph --prop text="Jane Smith" --prop bold=true
officecli add letter.docx /body --type paragraph --prop text="VP of Business Development"

# Footnote
officecli add letter.docx "/body/p[9]" --type footnote --prop text="Volume discount applies to combined orders across all product categories."

officecli validate letter.docx
```

### Recipe: Academic/Research Paper

```bash
officecli create paper.docx
officecli open paper.docx

# Page setup
officecli set paper.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440
officecli set paper.docx / --prop defaultFont=Calibri

# Define heading styles
officecli add paper.docx /styles --type style --prop name="Heading 1" --prop id=Heading1 --prop type=paragraph --prop font=Arial --prop size=16pt --prop bold=true --prop color=000000 --prop spaceBefore=24pt --prop spaceAfter=12pt --prop keepNext=true
officecli add paper.docx /styles --type style --prop name="Heading 2" --prop id=Heading2 --prop type=paragraph --prop font=Arial --prop size=14pt --prop bold=true --prop color=000000 --prop spaceBefore=18pt --prop spaceAfter=6pt --prop keepNext=true

# Define custom styles
officecli add paper.docx /styles --type style --prop name="Abstract" --prop id=Abstract --prop type=paragraph --prop basedOn=Normal --prop font=Calibri --prop size=11 --prop italic=true --prop color=333333 --prop leftIndent=720 --prop rightIndent=720 --prop spaceBefore=12pt --prop spaceAfter=12pt

officecli add paper.docx /styles --type style --prop name="Block Quote" --prop id=BlockQuote --prop type=paragraph --prop basedOn=Normal --prop font=Georgia --prop size=11 --prop italic=true --prop color=555555 --prop leftIndent=720 --prop rightIndent=720 --prop spaceBefore=12pt --prop spaceAfter=12pt

# Title page
officecli add paper.docx /body --type paragraph --prop text="On the Convergence Properties of Iterative Gradient Methods" --prop alignment=center --prop font=Calibri --prop size=18pt --prop bold=true --prop spaceBefore=72pt --prop spaceAfter=24pt

officecli add paper.docx /body --type paragraph --prop text="A. Researcher, B. Scientist" --prop alignment=center --prop size=12pt --prop spaceAfter=6pt
officecli add paper.docx /body --type paragraph --prop text="Department of Mathematics, University of Example" --prop alignment=center --prop size=11pt --prop italic=true --prop spaceAfter=24pt

# Section break after title page
officecli add paper.docx /body --type section --prop type=nextPage

# Footer with page numbers
officecli add paper.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt
officecli add paper.docx "/footer[1]" --type field --prop fieldType=page --prop size=9pt

# Table of Contents
officecli add paper.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true

# Abstract
officecli add paper.docx /body --type paragraph --prop text="Abstract" --prop style=Heading1
officecli add paper.docx /body --type paragraph --prop text="This paper examines convergence properties of gradient descent variants in high-dimensional optimization landscapes. We prove that under mild regularity conditions, the adaptive learning rate achieves optimal convergence rates." --prop style=Abstract

# Introduction with bookmark
officecli add paper.docx /body --type paragraph --prop text="Introduction" --prop style=Heading1
officecli add paper.docx "/body/p[7]" --type bookmark --prop name=introduction

officecli add paper.docx /body --type paragraph --prop text="Gradient-based optimization is fundamental to modern machine learning. Given the objective function, we seek to minimize the expected risk." --prop font=Calibri --prop size=11pt --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Footnote
officecli add paper.docx "/body/p[8]" --type footnote --prop text="See Bottou et al. (2018) for a comprehensive survey of optimization methods."

# Display equation
officecli add paper.docx /body --type equation --prop "formula=x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}" --prop mode=display

# Inline equation in paragraph
officecli add paper.docx /body --type paragraph --prop text="The loss function is defined as " --prop font=Calibri --prop size=11pt
officecli add paper.docx "/body/p[10]" --type equation --prop "formula=L(\theta) = \frac{1}{N}\sum_{i=1}^{N} \ell(f(x_i; \theta), y_i)" --prop mode=inline

# Methods section with bookmark
officecli add paper.docx /body --type paragraph --prop text="Methodology" --prop style=Heading1
officecli add paper.docx "/body/p[11]" --type bookmark --prop name=methodology

officecli add paper.docx /body --type paragraph --prop text="Convergence Analysis" --prop style=Heading2

# Integral equation
officecli add paper.docx /body --type equation --prop "formula=\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}" --prop mode=display

# Endnote
officecli add paper.docx "/body/p[12]" --type endnote --prop text="Full convergence proofs are provided in Appendix A."

# Cross-reference to bookmark (internal hyperlinks require raw XML -- see L3 section)
officecli add paper.docx /body --type paragraph --prop text="As established in the Introduction," --prop font=Calibri --prop size=11pt
# NOTE: To make "Introduction" a clickable internal link, use raw-set with w:hyperlink w:anchor="introduction"

# Bibliography with hanging indent
officecli add paper.docx /body --type paragraph --prop text="References" --prop style=Heading1
officecli add paper.docx /body --type paragraph --prop text="Bottou, L., Curtis, F. E., & Nocedal, J. (2018). Optimization methods for large-scale machine learning. SIAM Review, 60(2), 223-311." --prop leftIndent=720 --prop hangingIndent=720 --prop font=Calibri --prop size=11pt --prop spaceAfter=6pt
officecli add paper.docx /body --type paragraph --prop text="Kingma, D. P., & Ba, J. (2015). Adam: A method for stochastic optimization. Proceedings of ICLR." --prop leftIndent=720 --prop hangingIndent=720 --prop font=Calibri --prop size=11pt --prop spaceAfter=6pt

officecli validate paper.docx
officecli close paper.docx
```

---

## Building Blocks

### Paragraphs & Text

```bash
# Simple paragraph
officecli add doc.docx /body --type paragraph --prop text="Hello world" --prop font=Calibri --prop size=11pt

# Heading
officecli add doc.docx /body --type paragraph --prop text="Chapter 1" --prop style=Heading1
```

**IMPORTANT: Blank documents created with `officecli create` have no formatting for built-in styles (Heading1, Heading2, etc.). You MUST define heading styles explicitly via `/styles --type style` before using `--prop style=Heading1`, or headings will appear as unstyled text. See the Business Report and Academic Paper recipes for examples.**

```bash
# Styled paragraph
officecli add doc.docx /body --type paragraph --prop text="Important notice" --prop bold=true --prop color=FF0000 --prop alignment=center

# Paragraph with spacing
officecli add doc.docx /body --type paragraph --prop text="Body text here" --prop spaceBefore=12pt --prop spaceAfter=6pt --prop lineSpacing=1.15x

# Paragraph with indent
officecli add doc.docx /body --type paragraph --prop text="Indented paragraph" --prop leftIndent=720 --prop firstLineIndent=360

# Hanging indent (for bibliographies)
officecli add doc.docx /body --type paragraph --prop text="Author, A. (2025). Title of work..." --prop leftIndent=720 --prop hangingIndent=720

# Paragraph with shading (callout box) -- shd is reliable
officecli add doc.docx /body --type paragraph --prop text="Note: This is important." --prop shd=D9EAD3

# Callout box with border (optional -- validate after adding; pbdr may cause schema errors in some contexts)
officecli add doc.docx /body --type paragraph --prop text="Note: This is important." --prop shd=D9EAD3 --prop pbdr.all="single;4;A9D18E;4"

# Horizontal rule via bottom border (validate after adding)
officecli add doc.docx /body --type paragraph --prop text="" --prop pbdr.bottom="single;6;CCCCCC;1"
```

**NOTE: `pbdr` properties may produce schema validation errors in certain contexts. Always run `officecli validate` after adding paragraph borders. If validation fails on a pBdr element, remove it with `raw-set --xpath "//w:body/w:p[N]/w:pPr/w:pBdr" --action remove`. The `shd` (shading) property alone is always safe.**

```bash
# Page break before paragraph
officecli add doc.docx /body --type paragraph --prop text="New Chapter" --prop style=Heading1 --prop pageBreakBefore=true
```

### Runs (Inline Formatting)

```bash
# Add run to existing paragraph
officecli add doc.docx "/body/p[1]" --type run --prop text="bold text" --prop bold=true

# Superscript/subscript
officecli add doc.docx "/body/p[1]" --type run --prop text="2" --prop superscript=true

# Highlighted text
officecli add doc.docx "/body/p[1]" --type run --prop text="highlighted" --prop highlight=yellow

# Small caps
officecli add doc.docx "/body/p[1]" --type run --prop text="Small Caps" --prop smallCaps=true

# Strikethrough
officecli add doc.docx "/body/p[1]" --type run --prop text="deleted" --prop strike=true

# W14 text effects (Word 2010+)
officecli set doc.docx "/body/p[1]/r[1]" --prop textOutline="1pt;4472C4"
officecli set doc.docx "/body/p[1]/r[1]" --prop textFill="FF0000;0000FF"
```

**textFill format**: `"C1;C2[;ANGLE]"` for linear gradient, `"radial:C1;C2"` for radial, or `"COLOR"` for solid fill. Do NOT prefix with `gradient;`.

### Lists

```bash
# Bulleted list
officecli add doc.docx /body --type paragraph --prop text="First item" --prop listStyle=bullet
officecli add doc.docx /body --type paragraph --prop text="Second item" --prop listStyle=bullet
officecli add doc.docx /body --type paragraph --prop text="Third item" --prop listStyle=bullet

# Numbered list
officecli add doc.docx /body --type paragraph --prop text="Step one" --prop listStyle=numbered
officecli add doc.docx /body --type paragraph --prop text="Step two" --prop listStyle=numbered
officecli add doc.docx /body --type paragraph --prop text="Step three" --prop listStyle=numbered

# Remove list style
officecli set doc.docx "/body/p[5]" --prop listStyle=none
```

**WARNING**: Do not set `listStyle` on a run -- it is a paragraph-level property only.

### Tables -- Creation & Basic Styling

```bash
# Create table
officecli add doc.docx /body --type table --prop rows=4 --prop cols=3 --prop width="100%" --prop style=TableGrid

# Set header row text and flag
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1="Metric" --prop c2="Q3" --prop c3="Q4" --prop header=true

# Style header cells (row set does NOT support bold/shd/color -- use cell level)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[2]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[3]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF

# Fill data rows (c1/c2/c3 text shortcuts work at row level)
officecli set doc.docx "/body/tbl[1]/tr[2]" --prop c1="Revenue" --prop c2="$4.2M" --prop c3="$5.1M"
officecli set doc.docx "/body/tbl[1]/tr[3]" --prop c1="Users" --prop c2="12,400" --prop c3="15,800"
officecli set doc.docx "/body/tbl[1]/tr[4]" --prop c1="NPS" --prop c2="72" --prop c3="81"

# Table borders
officecli set doc.docx "/body/tbl[1]" --prop border.all="single;4;CCCCCC;0"

# Cell-level text styling
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[3]" --prop bold=true --prop color=2C5F2D

# Add row to existing table
officecli add doc.docx "/body/tbl[1]" --type row --prop c1="New Item" --prop c2="$1.5M" --prop c3="+12%"

# Set row height
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop height=480
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop height.exact=480

# Table cell padding (use cell-level, NOT table-level padding)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop padding.top=40 --prop padding.bottom=40 --prop padding.left=80 --prop padding.right=80
```

**WARNING: Do NOT use table-level `--prop padding=N`. It generates invalid `tblCellMar` XML that fails schema validation. Apply padding at the cell level instead.**

**CRITICAL: Row-level `set` only supports `height`, `height.exact`, `header`, and `c1/c2/c3...` text shortcuts.** It does NOT accept `bold`, `shd`, `color`, or `font`. All formatting must be applied at the cell level (`/body/tbl[N]/tr[M]/tc[K]`).

### Tables -- Cell Merging & Advanced Formatting

```bash
# Vertical merge (spanning rows)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop vmerge=restart
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[1]" --prop vmerge=continue

# Horizontal merge (spanning columns) -- use lowercase gridspan
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop gridspan=2

# Cell vertical alignment
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop valign=center

# Cell shading (solid)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop shd=E8F0FE

# Cell shading (gradient)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "shd=gradient;1F4E79;4472C4;90"

# Cell text direction
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop textDirection=btlr

# Cell padding (individual sides)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop padding.top=40 --prop padding.bottom=40

# Diagonal cell borders
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "border.tl2br=single;4;000000;0"
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "border.tr2bl=single;4;000000;0"

# Individual cell borders
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "border.bottom=single;6;1F4E79;0"
```

### Images

```bash
# Inline image in body
officecli add doc.docx /body --type picture --prop path=photo.jpg --prop width=15cm --prop height=10cm --prop alt="Team photo"

# Image in paragraph (inline with text)
officecli add doc.docx "/body/p[3]" --type picture --prop path=icon.png --prop width=1cm --prop height=1cm --prop alt="Check icon"

# Image from URL
officecli add doc.docx /body --type picture --prop path=https://example.com/logo.png --prop width=5cm --prop height=3cm --prop alt="Company logo"

# Floating/anchored image
officecli add doc.docx /body --type picture --prop path=sidebar.png --prop width=5cm --prop height=8cm --prop anchor=true --prop wrap=square --prop alt="Sidebar graphic"

# Image in table cell
officecli add doc.docx "/body/tbl[1]/tr[1]/tc[1]" --type picture --prop path=avatar.jpg --prop width=2cm --prop height=2cm --prop alt="User avatar"

# Replace existing image
officecli set doc.docx "/body/p[5]/r[1]" --prop path=new-photo.jpg
```

### Charts

```bash
# Column chart
officecli add doc.docx /body --type chart --prop chartType=column --prop title="Quarterly Revenue" --prop categories="Q1,Q2,Q3,Q4" --prop series1="2024:42,58,65,78" --prop series2="2025:51,67,74,92" --prop width=15cm --prop height=10cm --prop colors=1F4E79,4472C4

# Pie chart
officecli add doc.docx /body --type chart --prop chartType=pie --prop title="Market Share" --prop categories="Product A,Product B,Product C" --prop data="Share:40,35,25" --prop colors=1F4E79,4472C4,A9D18E --prop dataLabels=percent --prop legend=right

# Line chart
officecli add doc.docx /body --type chart --prop chartType=line --prop title="Trend" --prop categories="Jan,Feb,Mar,Apr,May,Jun" --prop series1="Revenue:10,15,13,20,22,28" --prop legend=bottom

# Bar chart (horizontal)
officecli add doc.docx /body --type chart --prop chartType=bar --prop categories="US,EU,APAC" --prop data="Sales:30,40,25"

# Doughnut chart
officecli add doc.docx /body --type chart --prop chartType=doughnut --prop categories="Complete,Remaining" --prop data="Progress:75,25" --prop colors=2C5F2D,E8E8E8

# Combo chart (bar + line)
officecli add doc.docx /body --type chart --prop chartType=combo --prop categories="Q1,Q2,Q3,Q4" --prop series1="Revenue:100,200,150,300" --prop series2="Growth:10,15,12,25" --prop comboSplit=1 --prop secondary=2

# Radar chart
officecli add doc.docx /body --type chart --prop chartType=radar --prop categories="Quality,Speed,Cost,Innovation,Support" --prop data="Score:8,7,6,9,8"

# Stacked column
officecli add doc.docx /body --type chart --prop chartType=columnStacked --prop categories="Q1,Q2,Q3,Q4" --prop series1="Product A:10,20,15,25" --prop series2="Product B:8,12,18,22" --prop colors=1F4E79,4472C4

# Scatter chart
officecli add doc.docx /body --type chart --prop chartType=scatter --prop categories="1,2,3,4,5" --prop data="Values:10,25,18,30,22"
```

**Chart types:** column, columnStacked, bar, barStacked, line, lineStacked, pie, pie3d, doughnut, area, areaStacked, scatter, bubble, radar, stock, combo, column3d, bar3d, line3d, area3d

**WARNING**: Chart series cannot be added after creation. Include all series in the `add` command. To change series count, delete and recreate.

### Equations

```bash
# Display equation (own paragraph)
officecli add doc.docx /body --type equation --prop "formula=E = mc^2" --prop mode=display

# Inline equation (within paragraph)
officecli add doc.docx "/body/p[3]" --type equation --prop "formula=x^2 + y^2 = r^2" --prop mode=inline

# Quadratic formula
officecli add doc.docx /body --type equation --prop "formula=x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}" --prop mode=display

# Integral
officecli add doc.docx /body --type equation --prop "formula=\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}" --prop mode=display

# Sum
officecli add doc.docx /body --type equation --prop "formula=\sum_{n=1}^{N} n = \frac{N(N+1)}{2}" --prop mode=display

# Matrix
officecli add doc.docx /body --type equation --prop "formula=\begin{pmatrix} a & b \\ c & d \end{pmatrix}" --prop mode=display

# Set equation on paragraph (replaces content with display math)
officecli set doc.docx "/body/p[10]" --prop "formula=\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}"

# Inline equation via run
officecli set doc.docx "/body/p[5]/r[2]" --prop "formula=\alpha + \beta = \gamma"
```

**LaTeX subset reference**: `\frac{}{}`, `\sqrt{}`, `\sum`, `\int`, `\lim`, `\nabla`, `\partial`, Greek letters (`\alpha`, `\beta`, etc.), subscripts (`_`), superscripts (`^`), `\binom{}{}`, `\rightarrow`, `\rightleftharpoons`, `\pm`, `\times`, `\cdot`, `\infty`, `\begin{pmatrix}...\end{pmatrix}`

**Equation caveats:**
- `\mathcal` is NOT reliably supported -- it generates invalid `m:scr` XML. Use `\mathit{L}` or plain italic letters instead.
- After adding equations, immediately verify with `view text` -- equations appear as `[Equation]` markers. If the marker is missing, the equation was not created correctly.
- When fixing validation errors or removing empty paragraphs, re-check that `[Equation]` markers are still present. Equation paragraphs (oMathPara) share the paragraph index space and can be accidentally deleted.

### Hyperlinks

```bash
# External hyperlink in paragraph
officecli add doc.docx "/body/p[1]" --type hyperlink --prop url=https://example.com --prop text="Visit our website" --prop font=Calibri --prop size=11pt

# Make existing run a hyperlink
officecli set doc.docx "/body/p[3]/r[1]" --prop link=https://example.com

# Remove hyperlink from run
officecli set doc.docx "/body/p[3]/r[1]" --prop link=none
```

### Bookmarks & Internal Links

```bash
# Add bookmark at a paragraph
officecli add doc.docx "/body/p[5]" --type bookmark --prop name=chapter1 --prop text="Chapter 1: Introduction"

# Rename bookmark
officecli set doc.docx "/bookmark[chapter1]" --prop name=intro

# Replace bookmark content
officecli set doc.docx "/bookmark[chapter1]" --prop text="Updated Chapter Title"
```

### Footnotes & Endnotes

```bash
# Add footnote to paragraph
officecli add doc.docx "/body/p[3]" --type footnote --prop text="Source: Annual Report 2025"

# Add endnote
officecli add doc.docx "/body/p[5]" --type endnote --prop text="See appendix for methodology"

# Edit existing footnote
officecli set doc.docx "/footnote[1]" --prop text="Updated source reference"
```

### Headers & Footers

```bash
# Default header
officecli add doc.docx / --type header --prop text="Acme Corporation" --prop type=default --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=right

# First page header (different from default)
officecli add doc.docx / --type header --prop text="CONFIDENTIAL" --prop type=first --prop bold=true --prop color=FF0000 --prop alignment=center

# Default footer with page number
officecli add doc.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt

# Add page number field to footer
officecli add doc.docx "/footer[1]" --type field --prop fieldType=page --prop font=Calibri --prop size=9pt
```

**NOTE: Adding a field to an existing footer creates a new paragraph, so "Page " and the number will appear on separate lines. For single-line "Page N", create the footer and field together, or use `raw-set` to append the field run into the existing footer paragraph.**

```bash
# Edit header text
officecli set doc.docx "/header[1]" --prop text="Updated Header"
```

Header/footer types: `default`, `first`, `even`

### Watermarks

```bash
# Add text watermark
officecli add doc.docx / --type watermark --prop text=DRAFT --prop color=C0C0C0 --prop font=Calibri --prop opacity=0.5 --prop rotation=315

# Modify watermark
officecli set doc.docx /watermark --prop text=CONFIDENTIAL --prop color=FF0000
```

**Note**: Default rotation is `315` degrees. Use positive degree values, not negative.

### Sections & Page Layout

```bash
# Add section break (next page)
officecli add doc.docx /body --type section --prop type=nextPage

# Continuous section break (for column changes)
officecli add doc.docx /body --type section --prop type=continuous

# Set section to landscape (note: section uses lowercase pagewidth/pageheight)
officecli set doc.docx "/section[2]" --prop orientation=landscape --prop pagewidth=15840 --prop pageheight=12240

# Multi-column section
officecli set doc.docx "/section[2]" --prop columns=2 --prop separator=true

# Custom column widths
officecli set doc.docx "/section[2]" --prop columns=2 --prop "colWidths=5400,3600"

# Even/odd page section break
officecli add doc.docx /body --type section --prop type=evenPage

# Section margins (lowercase)
officecli set doc.docx "/section[2]" --prop margintop=1440 --prop marginbottom=1440
```

**CRITICAL**: Section properties use lowercase names (`pagewidth`, `pageheight`, `margintop`, etc.). Document root (`/`) uses camelCase (`pageWidth`, `pageHeight`, `marginTop`, etc.). Do not confuse the two.

### Page Breaks & Column Breaks

```bash
# Page break
officecli add doc.docx /body --type pagebreak

# Page break within paragraph
officecli add doc.docx "/body/p[5]" --type break --prop type=page

# Column break
officecli add doc.docx "/body/p[10]" --type break --prop type=column
```

### Fields

```bash
# Page number field
officecli add doc.docx "/body/p[1]" --type pagenum

# Total pages field
officecli add doc.docx "/body/p[1]" --type numpages

# Date field
officecli add doc.docx "/body/p[1]" --type date

# Custom date format
officecli add doc.docx "/body/p[1]" --type field --prop instruction=" DATE \\@ \"yyyy-MM-dd\" " --prop text="2026-01-01"

# Author field
officecli add doc.docx "/body/p[1]" --type field --prop fieldType=author

# Field at body level (creates paragraph)
officecli add doc.docx /body --type pagenum --prop alignment=center
```

### Comments

```bash
# Add comment to paragraph
officecli add doc.docx "/body/p[3]" --type comment --prop text="Please review this section" --prop author="Claude" --prop initials="C"

# Add comment to specific run
officecli add doc.docx "/body/p[3]/r[1]" --type comment --prop text="Is this figure correct?" --prop author="Claude"
```

### Table of Contents

```bash
# Add TOC at beginning (default levels 1-3)
officecli add doc.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true --index 0

# Modify TOC
officecli set doc.docx "/toc[1]" --prop levels="1-4"
```

### Content Controls (SDT)

```bash
# Text content control
officecli add doc.docx /body --type sdt --prop sdtType=text --prop alias="Company Name" --prop tag=company --prop text="Enter company name"

# Rich text content control
officecli add doc.docx /body --type sdt --prop sdtType=richtext --prop alias="Description" --prop tag=description --prop text="Enter description"

# Dropdown
officecli add doc.docx /body --type sdt --prop sdtType=dropdown --prop alias="Status" --prop tag=status --prop "items=Draft,In Review,Final"

# Date picker
officecli add doc.docx /body --type sdt --prop sdtType=date --prop alias="Due Date" --prop tag=duedate --prop format="MM/dd/yyyy"

# Combobox (editable dropdown)
officecli add doc.docx /body --type sdt --prop sdtType=combobox --prop alias="Department" --prop tag=dept --prop "items=Engineering,Marketing,Sales,HR"

# Locked content control
officecli add doc.docx /body --type sdt --prop sdtType=richtext --prop lock=contentlocked --prop text="Protected content"

# Inline SDT within paragraph
officecli add doc.docx "/body/p[1]" --type sdt --prop sdtType=text --prop alias="Inline Field" --prop text="fill in"
```

SDT types: `text`, `richtext`, `dropdown`, `combobox`, `date`

### Custom Styles

```bash
# Create paragraph style
officecli add doc.docx /styles --type style --prop name="Block Quote" --prop id=BlockQuote --prop type=paragraph --prop basedOn=Normal --prop font=Georgia --prop size=11 --prop italic=true --prop color=555555 --prop leftIndent=720 --prop rightIndent=720 --prop spaceBefore=12pt --prop spaceAfter=12pt

# Create character style
officecli add doc.docx /styles --type style --prop name="Emphasis Bold" --prop id=EmphasisBold --prop type=character --prop bold=true --prop color=1F4E79

# Apply custom style
officecli set doc.docx "/body/p[10]" --prop style=BlockQuote
```

### Find/Replace

```bash
# Find and replace across entire document
officecli set doc.docx / --prop find="2024" --prop replace="2025"

# Scoped find/replace (body only, not headers/footers)
officecli set doc.docx / --prop find="old text" --prop replace="new text" --prop scope=body

# Replace in headers/footers only
officecli set doc.docx / --prop find="Company Name" --prop replace="Acme Corp" --prop scope=headers
```

**WARNING: Find/replace performs substring matching, not whole-word matching. Replacing "ACME" in "ACME Corporation" produces "New Name Corporation". After any find/replace, review with `view text` and run a second cleanup pass if needed.**

### Track Changes

```bash
# Accept all tracked changes
officecli set doc.docx / --prop accept-changes=all

# Reject all tracked changes
officecli set doc.docx / --prop reject-changes=all
```

**WARNING**: Creating tracked changes (insertions/deletions with author markup) is NOT supported via high-level commands. Use `raw-set` with XML. See L3 escalation section below.

### Clone Elements

```bash
# Clone a paragraph
officecli add doc.docx /body --from "/body/p[1]"

# Clone a table
officecli add doc.docx /body --from "/body/tbl[1]"
```

### Remove / Move / Swap

```bash
# Remove element
officecli remove doc.docx "/body/p[5]"

# Move element
officecli move doc.docx "/body/p[5]" --index 0

# Swap elements
officecli swap doc.docx "/body/p[1]" "/body/p[3]"
```

---

## Advanced Features

### Batch Set with Selectors

```bash
# Set font on all Heading1 paragraphs
officecli set doc.docx 'paragraph[style=Heading1]' --prop font=Georgia --prop color=1F4E79

# Bold all paragraphs containing "important"
officecli set doc.docx 'p:contains("important")' --prop bold=true

# Find all images missing alt text (query first, then set individually)
officecli query doc.docx 'image:no-alt'
```

### L1, L2, L3 Escalation (When to Use Raw XML)

**L1 -- High-level commands (use first)**:
- `add`, `set`, `get`, `query`, `remove`, `move`, `swap`
- Covers 90% of use cases

**L2 -- Batch with selectors**:
- `set doc.docx 'selector' --prop key=value`
- For bulk modifications across document

**L3 -- Raw XML (last resort)**:
- `raw` to inspect XML
- `raw-set` to modify XML directly
- `add-part` to create new document parts (returns rId)
- **Use for**: tracked change creation, tab stops, complex numbering definitions, advanced SmartArt, anything not exposed by L1/L2

```bash
# View raw XML of document body
officecli raw doc.docx /document

# View raw XML of styles
officecli raw doc.docx /styles

# View raw XML of numbering
officecli raw doc.docx /numbering

# Modify XML attribute
officecli raw-set doc.docx /document --xpath "//w:body/w:p[1]/w:pPr/w:jc" --action setattr --xml "w:val=center"

# Append XML element (e.g., tab stops)
officecli raw-set doc.docx /document --xpath "//w:body/w:p[1]/w:pPr" --action append --xml '<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>'

# Remove XML element
officecli raw-set doc.docx /document --xpath "//w:body/w:p[3]" --action remove

# Internal hyperlink via raw XML (link to bookmark named "methodology")
officecli raw-set doc.docx /document --xpath "//w:body/w:p[14]" --action append --xml '<w:hyperlink w:anchor="methodology"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>Methodology</w:t></w:r></w:hyperlink>'

# Create tracked change via raw XML (insertion)
officecli raw-set doc.docx /document --xpath "//w:body/w:p[5]" --action append --xml '<w:ins w:id="1" w:author="Claude" w:date="2026-03-27T00:00:00Z"><w:r><w:t>inserted text</w:t></w:r></w:ins>'

# Add new document part
officecli add-part doc.docx /document
```

**Raw XML parts**: /document, /styles, /numbering, /settings, /header[N], /footer[N], /comments, /chart[N]

**XPath prefixes**: w (WordprocessingML), r (Relationships), a (DrawingML), mc (Markup Compatibility), wp (Word Drawing)

**raw-set actions**: append, prepend, insertbefore, insertafter, replace, remove, setattr

---

## Batch Recipes

### Complete Business Report (Batch)

```bash
cat <<'EOF' | officecli batch doc.docx
[
  {"command":"set","path":"/","props":{"title":"Q4 Business Report","author":"Team Alpha"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Q4 Business Report","style":"Heading1"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"This report summarizes Q4 performance across all divisions.","font":"Calibri","size":"11pt","spaceAfter":"12pt"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Revenue Overview","style":"Heading2"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Total revenue increased 25% year-over-year.","font":"Calibri","size":"11pt"}},
  {"command":"add","parent":"/body","type":"table","props":{"rows":"3","cols":"3","width":"100%","style":"TableGrid"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]","props":{"c1":"Division","c2":"Q3","c3":"Q4","header":"true"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[1]","props":{"bold":"true","shd":"1F4E79","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[2]","props":{"bold":"true","shd":"1F4E79","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[3]","props":{"bold":"true","shd":"1F4E79","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[2]","props":{"c1":"North America","c2":"$4.2M","c3":"$5.1M"}},
  {"command":"set","path":"/body/tbl[1]/tr[3]","props":{"c1":"Europe","c2":"$3.1M","c3":"$3.8M"}}
]
EOF
```

### Table with Merged Headers (Batch)

```bash
cat <<'EOF' | officecli batch doc.docx
[
  {"command":"add","parent":"/body","type":"table","props":{"rows":"4","cols":"4","width":"100%","style":"TableGrid"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]","props":{"c1":"Category","c2":"2024","c3":"","c4":""}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[2]","props":{"gridspan":"3","bold":"true","shd":"1F4E79","color":"FFFFFF","alignment":"center"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[1]","props":{"vmerge":"restart","bold":"true","shd":"1F4E79","color":"FFFFFF","valign":"center"}},
  {"command":"set","path":"/body/tbl[1]/tr[2]","props":{"c1":"","c2":"Q1","c3":"Q2","c4":"Q3"}},
  {"command":"set","path":"/body/tbl[1]/tr[2]/tc[1]","props":{"vmerge":"continue"}},
  {"command":"set","path":"/body/tbl[1]/tr[2]/tc[2]","props":{"bold":"true","shd":"4472C4","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[2]/tc[3]","props":{"bold":"true","shd":"4472C4","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[2]/tc[4]","props":{"bold":"true","shd":"4472C4","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[3]","props":{"c1":"Revenue","c2":"$4.2M","c3":"$5.1M","c4":"$5.8M"}},
  {"command":"set","path":"/body/tbl[1]/tr[4]","props":{"c1":"Users","c2":"12K","c3":"15K","c4":"18K"}}
]
EOF
```

### Multi-Element Paragraph (Batch)

```bash
cat <<'EOF' | officecli batch doc.docx
[
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":""}},
  {"command":"add","parent":"/body/p[1]","type":"run","props":{"text":"Important: ","bold":"true","color":"FF0000","font":"Calibri","size":"11pt"}},
  {"command":"add","parent":"/body/p[1]","type":"run","props":{"text":"This deadline is ","font":"Calibri","size":"11pt"}},
  {"command":"add","parent":"/body/p[1]","type":"run","props":{"text":"March 31, 2026","bold":"true","underline":"single","font":"Calibri","size":"11pt"}},
  {"command":"add","parent":"/body/p[1]","type":"run","props":{"text":". Please submit all documents before this date.","font":"Calibri","size":"11pt"}}
]
EOF
```
