<!-- officecli: v1.0.23 -->

# Creating Documents from Scratch

Use this guide when creating a new document with no template.

## Workflow Overview

1. **Create** blank document
2. **Plan** document structure (outline + element types)
3. **Build** incrementally — run each command and check output before proceeding; use `batch` only for bulk content entry (many paragraphs or table cells at once)
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

| Paper     | pageWidth | pageHeight |
| --------- | --------- | ---------- |
| US Letter | 12240     | 15840      |
| A4        | 11906     | 16838      |
| Legal     | 12240     | 20160      |

Values are in twips (1440 twips = 1 inch, 567 twips = 1 cm).

---

## Execution Strategy: Batch vs Incremental

**Use INCREMENTAL (one command at a time):**

- `add /styles --type style` — define all styles before using them; verify they exist
- `add / --type header/footer/watermark/toc` — structural; verify before building on top
- `add /body --type table/chart` — creates the container; fill contents after confirming
- `validate` — always run alone
- **When in doubt** — a single command gives immediate feedback; if it fails you know exactly where. Batch errors are harder to diagnose.

**Use BATCH (heredoc):**

- Multiple consecutive `add /body --type paragraph/run` — body content has no structural side effects
- Bulk list items (bullet points, numbered steps)
- Format painting — applying the same props to multiple paragraphs or table cells
- Filling table rows with text

**Always use `officecli open`/`close`.** It keeps the file in memory so every command skips repeated file I/O — this is the smart default, not a special optimization. Batch and resident mode are independent: each works on its own, and they can be combined.

```bash
# Batch: add multiple paragraphs at once
cat <<'EOF' | officecli batch report.docx
[
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Q4 Business Report","alignment":"center","size":"28pt","bold":true,"color":"1F4E79"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Fiscal Year 2025","alignment":"center","size":"14pt","color":"4472C4"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Prepared by: Team Alpha","alignment":"center","color":"666666"}}
]
EOF

# Batch: format painting — same props on multiple table header cells
cat <<'EOF' | officecli batch report.docx
[
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[1]","props":{"bold":true,"shd":"1F4E79","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[2]","props":{"bold":true,"shd":"1F4E79","color":"FFFFFF"}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[3]","props":{"bold":true,"shd":"1F4E79","color":"FFFFFF"}}
]
EOF
```

**Batch chunk size:** Keep batches under 15 operations. Split by section (e.g., one batch per heading + its body paragraphs).

---

## Document Structure Recipes

Complete recipes for common document types. Each recipe shows the full command sequence for reference.

> **Execute recipes incrementally — one command (or one `batch` block) at a time, not as a single shell script.** Read the output after each command. If a command fails, fix it before continuing. After each structural phase (styles, headers/footers, tables, charts), verify with `validate` or `get` before proceeding.

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
officecli add report.docx /styles --type style --prop name="Heading 1" --prop id=Heading1 --prop type=paragraph --prop font=Calibri --prop size=20pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=24pt --prop spaceAfter=12pt --prop keepNext=true
officecli add report.docx /styles --type style --prop name="Heading 2" --prop id=Heading2 --prop type=paragraph --prop font=Calibri --prop size=13pt --prop bold=true --prop color=2E75B6 --prop spaceBefore=18pt --prop spaceAfter=6pt --prop keepNext=true

# Header with company name (default — body pages only)
officecli add report.docx / --type header --prop text="Acme Corporation" --prop type=default --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=right

# Step 1: Empty footer for cover page — adding type=first auto-enables differentFirstPage
# NOTE: Do NOT use `set / --prop differentFirstPage=true` — UNSUPPORTED on current CLI version
officecli add report.docx / --type footer --prop type=first --prop text=""

# Step 2: Default footer with static "Page " text (--prop field=page is SILENTLY IGNORED — do not use)
officecli add report.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt --prop font=Calibri

# Step 3: REQUIRED — inject PAGE field via raw-set (footer[2] = default when first-page footer also exists)
officecli raw-set report.docx "/footer[2]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'

# Watermark
officecli add report.docx / --type watermark --prop text=DRAFT --prop color=C0C0C0 --prop opacity=0.5

# ── Cover Page ──────────────────────────────────────────────────────────────
# REQUIRED minimum elements (content area must fill >= 60% of the page):
#   1. Top accent bar (color block)
#   2. Company / project name (14pt, above title)
#   3. Main title (28-32pt, bold)
#   4. Subtitle / document type (18-20pt)
#   5. Author / department
#   6. Date
#   7. Bottom accent bar + contact / version info
#
# Always set alignment=center and explicit font sizes on every cover element.
# Use shading bars to fill visual space and avoid large blank areas.

# Top color accent bar
officecli add report.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop spaceBefore=0pt --prop spaceAfter=0pt --prop size=20pt
# Spacer
officecli add report.docx /body --type paragraph --prop text="" --prop spaceBefore=36pt --prop spaceAfter=0pt

# Company / project name (element 2)
officecli add report.docx /body --type paragraph --prop text="Acme Corporation" --prop alignment=center --prop size=14pt --prop color=1F4E79 --prop spaceAfter=6pt

# Main title (element 3) — 28-32pt
officecli add report.docx /body --type paragraph --prop text="Q4 Business Report" --prop alignment=center --prop size=30pt --prop bold=true --prop color=1F4E79 --prop spaceAfter=12pt

# Subtitle / document type (element 4) — 18-20pt
officecli add report.docx /body --type paragraph --prop text="Fiscal Year 2025 — Annual Performance Review" --prop alignment=center --prop size=18pt --prop color=4472C4 --prop spaceAfter=36pt

# Mid accent bar (visual separator)
officecli add report.docx /body --type paragraph --prop text="" --prop shd=4472C4 --prop spaceBefore=0pt --prop spaceAfter=24pt --prop size=8pt

# Author / department (element 5)
officecli add report.docx /body --type paragraph --prop text="Prepared by: Team Alpha  |  Finance & Strategy Division" --prop alignment=center --prop size=11pt --prop color=444444 --prop spaceAfter=8pt

# Date (element 6)
officecli add report.docx /body --type paragraph --prop text="March 2026" --prop alignment=center --prop size=11pt --prop color=444444 --prop spaceAfter=8pt

# Version / confidentiality notice
officecli add report.docx /body --type paragraph --prop text="Version 1.0  |  CONFIDENTIAL" --prop alignment=center --prop size=9pt --prop color=888888 --prop spaceAfter=36pt

# Bottom accent bar + contact info (element 7)
officecli add report.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop spaceBefore=0pt --prop spaceAfter=6pt --prop size=12pt
officecli add report.docx /body --type paragraph --prop text="contact@acmecorp.com  |  www.acmecorp.com" --prop alignment=center --prop size=9pt --prop color=888888 --prop spaceAfter=0pt

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

---

### Cover Page Design: Content-Rich Standard

> **RULE: The cover page content area must fill at least 60% of the page. Large blank areas are a deliverability defect.**

#### Minimum Element Checklist by Document Type

| Document Type                       | Required Cover Elements                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Business Report / Annual Report** | Top accent bar · Company name · Main title (28-32pt) · Subtitle/fiscal year (18-20pt) · Author/department · Date · Version/confidentiality · Bottom bar + contact       |
| **Business Proposal**               | Top accent bar · Client name · Proposal title (28-32pt) · Prepared-for / prepared-by block · Date · 3-5 bullet key benefits (optional callout) · Confidentiality notice |
| **Technical Specification**         | Top bar · Product/project name · Document title (28-32pt) · Version number + status (DRAFT/FINAL) · Author · Date · Target audience · Bottom bar                        |

#### Cover Page Lower Half — Must Not Be >40% Empty

A common issue is a cover page where the title block ends near the top or middle, leaving the lower half largely blank. This is a deliverability defect. After placing the title/subtitle/author/date block, check whether the lower half is filled. If not, add one or more of the following blocks before the bottom accent bar:

**Option A — Abstract Excerpt Block** (for reports, technical specs):

```bash
# Abstract excerpt shaded block
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=EBF3FB --prop size=4pt --prop spaceBefore=0pt --prop spaceAfter=0pt
officecli add doc.docx /body --type paragraph --prop text="ABSTRACT" --prop alignment=center --prop font=Calibri --prop size=9pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=10pt --prop spaceAfter=6pt --prop shd=EBF3FB
officecli add doc.docx /body --type paragraph --prop text="This document presents..." --prop alignment=center --prop font=Calibri --prop size=10pt --prop italic=true --prop color=444444 --prop spaceBefore=0pt --prop spaceAfter=10pt --prop shd=EBF3FB --prop leftIndent=720 --prop rightIndent=720
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=EBF3FB --prop size=4pt --prop spaceBefore=0pt --prop spaceAfter=24pt
```

**Option B — Document Scope Statement** (for policy, proposal, formal reports):

```bash
officecli add doc.docx /body --type paragraph --prop text="DOCUMENT SCOPE" --prop alignment=center --prop font=Calibri --prop size=9pt --prop bold=true --prop color=888888 --prop spaceBefore=36pt --prop spaceAfter=6pt
officecli add doc.docx /body --type paragraph --prop text="This document applies to all employees of Acme Corporation and covers Q4 2025 fiscal year results." --prop alignment=center --prop font=Calibri --prop size=10pt --prop color=555555 --prop spaceAfter=8pt --prop leftIndent=720 --prop rightIndent=720
```

**Option C — Key Highlights List** (for annual reports, proposals):

```bash
officecli add doc.docx /body --type paragraph --prop text="KEY HIGHLIGHTS" --prop alignment=center --prop font=Calibri --prop size=9pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=36pt --prop spaceAfter=8pt
officecli add doc.docx /body --type paragraph --prop text="Revenue grew 25% year-over-year" --prop listStyle=bullet --prop font=Calibri --prop size=10pt --prop color=333333 --prop spaceAfter=4pt
officecli add doc.docx /body --type paragraph --prop text="Customer retention reached 94%" --prop listStyle=bullet --prop font=Calibri --prop size=10pt --prop color=333333 --prop spaceAfter=4pt
officecli add doc.docx /body --type paragraph --prop text="Three new markets launched" --prop listStyle=bullet --prop font=Calibri --prop size=10pt --prop color=333333 --prop spaceAfter=24pt
```

> **Rule: Cover page lower half must not be >40% empty.** If your title/author/date block ends in the upper 60% of the page, add Option A, B, or C above before the bottom accent bar.

#### Filling Visual Space

Use shading bars (`--prop shd=HEX`) and explicit `spaceBefore`/`spaceAfter` on every element to distribute content across the page. Even empty paragraphs with a background color create professional visual structure:

```bash
# Color accent bar (full-width colored strip)
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop size=20pt --prop spaceBefore=0pt --prop spaceAfter=0pt

# Thinner accent line
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=4472C4 --prop size=8pt --prop spaceBefore=0pt --prop spaceAfter=16pt
```

#### Cover Alignment Rule

Every cover page paragraph **must** use `--prop alignment=center` (or `alignment=left` for left-aligned corporate style). Never leave cover text at default paragraph alignment.

#### Pitfall: `pbdr` Schema Errors on Cover Elements

If you use paragraph borders (`--prop pbdr.all=...`) on cover elements and validation fails, remove the offending border:

```bash
officecli validate doc.docx
# If a pBdr element causes schema error:
officecli raw-set doc.docx /document --xpath "//w:body/w:p[N]/w:pPr/w:pBdr" --action remove
# Safe alternative: use shd (background shading) alone — it never causes schema errors.
```

---

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
officecli add paper.docx /styles --type style --prop name="Heading 1" --prop id=Heading1 --prop type=paragraph --prop font=Arial --prop size=20pt --prop bold=true --prop color=000000 --prop spaceBefore=24pt --prop spaceAfter=12pt --prop keepNext=true
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

# Step 1: Empty footer for title page — type=first auto-enables differentFirstPage (no separate set needed)
officecli add paper.docx / --type footer --prop type=first --prop text=""

# Step 2: Default footer (--prop field=page is SILENTLY IGNORED — add static text only here)
officecli add paper.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt

# Step 3: REQUIRED — inject PAGE field via raw-set
officecli raw-set paper.docx "/footer[2]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'

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

#### Code Blocks (Preformatted / Monospace Text)

There is no dedicated `code` element type in OfficeCLI. The recommended approach is a paragraph with a monospace font, light background shading, and optional left indent — this reproduces the visual appearance of a code block in Word.

```bash
# Single-line code block (Courier New, 10pt, light gray background, indented)
officecli add doc.docx /body --type paragraph \
  --prop text='GET /api/users HTTP/1.1' \
  --prop font='Courier New' --prop size=10pt \
  --prop indent=720 \
  --prop shd=F5F5F5 \
  --prop spaceBefore=6pt --prop spaceAfter=6pt

# Multi-line code block: add one paragraph per line with the same styling
officecli add doc.docx /body --type paragraph \
  --prop text='POST /api/orders HTTP/1.1' \
  --prop font='Courier New' --prop size=10pt --prop indent=720 --prop shd=F5F5F5
officecli add doc.docx /body --type paragraph \
  --prop text='Content-Type: application/json' \
  --prop font='Courier New' --prop size=10pt --prop indent=720 --prop shd=F5F5F5
officecli add doc.docx /body --type paragraph \
  --prop text='{"orderId": "12345"}' \
  --prop font='Courier New' --prop size=10pt --prop indent=720 --prop shd=F5F5F5 --prop spaceAfter=6pt
```

**Tips for code blocks:**

- Use `shd=F5F5F5` (light gray) or `shd=F0F0F0` for a subtle background. The `shd` property is always reliable (unlike `pbdr` borders).
- Omit `spaceAfter` / `spaceBefore` on continuation lines so they appear as a single visual block; add spacing only on the first and last line.
- To create a reusable style, define a `Code` custom style once via `/styles --type style` and apply `--prop style=Code` to each paragraph instead of repeating all props.
- **Code block indentation pitfall:** Do NOT use consecutive spaces to simulate indentation inside code block text. Use the `ind.left` paragraph property instead: `--prop ind.left=720`. Spaces-as-indent produces `view issues` warnings ("first-line indent missing") and renders inconsistently across fonts. Example: `--prop ind.left=360` for one level, `--prop ind.left=720` for two levels.

```bash
# Define a reusable Code style (do this once per document)
officecli add doc.docx /styles --type style \
  --prop name="Code" --prop id=Code --prop type=paragraph \
  --prop font='Courier New' --prop size=10pt \
  --prop shd=F5F5F5 --prop indent=720 \
  --prop spaceBefore=4pt --prop spaceAfter=4pt

# Then apply it to each code paragraph
officecli add doc.docx /body --type paragraph --prop text='npm install officecli' --prop style=Code
officecli add doc.docx /body --type paragraph --prop text='officecli --version' --prop style=Code
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

**WARNING — LibreOffice PDF: Do NOT use `chartType=pie` or `chartType=doughnut` when the output will be delivered as a LibreOffice PDF.** These chart types render without visible slices in LibreOffice PDF export — only labels and the legend appear; the actual slices are invisible. Use `chartType=column` or `chartType=bar` as a reliable replacement. Both pie and doughnut charts render correctly in Microsoft Word.

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

# Default footer with page number — requires 2-step pattern:
# Step 1: Add footer with static "Page " text (--prop field=page is SILENTLY IGNORED)
officecli add doc.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt
# Step 2: REQUIRED — inject PAGE field via raw-set (footer[1] when no first-page footer)
officecli raw-set doc.docx "/footer[1]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

> **⚠️ Known CLI bug:** `--prop field=page` is **silently ignored** in `add --type footer`. You must always use the `raw-set` step to inject the `<w:fldChar>` PAGE field. Verify with `officecli get doc.docx "/footer[N]" --depth 3` — output must show `fldChar` children.

#### First-Page Footer (Suppress Cover Page Number)

To make the first page footer different from all other pages, add a `type=first` footer. The CLI **automatically** inserts the required `<w:titlePg/>` XML element — no separate command needed.

> **⚠️ Known CLI limitation:** `set / --prop differentFirstPage=true` is **UNSUPPORTED** on current CLI version (silently returns "UNSUPPORTED props"). Do not use it. Just add the `type=first` footer directly — that is sufficient.

```bash
# Step 1: Add first-page footer (empty — suppresses page number on cover)
officecli add doc.docx / --type footer --prop type=first --prop text=""

# Step 2: Add default footer with static "Page " text (field=page is SILENTLY IGNORED)
officecli add doc.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt

# Step 3: REQUIRED — inject PAGE field via raw-set (footer[2] = default when first-page footer exists)
officecli raw-set doc.docx "/footer[2]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

#### Composite Footer (Company Name + Page Number)

For corporate documents with a footer like "Acme Corporation | Confidential · Page 1", each `add / --type footer --prop type=default` call appends a new paragraph inside the same footer region. Use this to build multi-line footers, or keep everything in one command for a single-line footer.

```bash
# Single-line footer: text only (no page number)
officecli add doc.docx / --type footer --prop type=default \
  --prop text="Acme Corporation | Confidential" --prop alignment=left --prop size=9pt --prop font=Calibri

# Two-line footer: company name on left, page number centered below
# Line 1 — company name (left-aligned)
officecli add doc.docx / --type footer --prop type=default \
  --prop text="Acme Corporation | Confidential" --prop alignment=left --prop size=9pt --prop font=Calibri
# Line 2 — add static "Page " text (field=page is SILENTLY IGNORED)
officecli add doc.docx / --type footer --prop text="Page " \
  --prop type=default --prop alignment=center --prop size=9pt --prop font=Calibri
# REQUIRED: inject PAGE field into the last paragraph of footer[1]
# Note: each add --type=default appends a paragraph to the same footer; use the correct XPath
officecli raw-set doc.docx "/footer[1]" \
  --xpath "(//w:p)[last()]" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

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

> **REQUIRED: If a document has 3 or more level-1 headings, you MUST add a TOC.** This is a hard rule — do not skip it.

```bash
# Add TOC immediately after the cover page break, at index 0 (before all body content)
# Use --index 0 so the TOC appears at the top of the body, not at the end
officecli add doc.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true --index 0

# Modify TOC depth
officecli set doc.docx "/toc[1]" --prop levels="1-4"
```

**TOC display note:** After adding a TOC with OfficeCLI, the TOC shows as a field code placeholder in `view text` output — this is expected. In Microsoft Word, press **F9** to update and render the TOC with actual page numbers. The TOC entries and links are fully functional once rendered in Word.

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

## More Recipes

### Complete Business Report

```bash
officecli set doc.docx / --prop title="Q4 Business Report" --prop author="Team Alpha"
officecli add doc.docx /body --type paragraph --prop text="Q4 Business Report" --prop style=Heading1
officecli add doc.docx /body --type paragraph --prop text="This report summarizes Q4 performance across all divisions." --prop font=Calibri --prop size=11pt --prop spaceAfter=12pt
officecli add doc.docx /body --type paragraph --prop text="Revenue Overview" --prop style=Heading2
officecli add doc.docx /body --type paragraph --prop text="Total revenue increased 25% year-over-year." --prop font=Calibri --prop size=11pt
officecli add doc.docx /body --type table --prop rows=3 --prop cols=3 --prop width=100% --prop style=TableGrid
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1=Division --prop c2=Q3 --prop c3=Q4 --prop header=true
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[2]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[3]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[2]" --prop c1="North America" --prop c2='$4.2M' --prop c3='$5.1M'
officecli set doc.docx "/body/tbl[1]/tr[3]" --prop c1=Europe --prop c2='$3.1M' --prop c3='$3.8M'
```

### Table with Merged Headers

```bash
officecli add doc.docx /body --type table --prop rows=4 --prop cols=4 --prop width=100% --prop style=TableGrid
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1=Category --prop c2=2024 --prop c3="" --prop c4=""
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[2]" --prop gridspan=3 --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF --prop alignment=center
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop vmerge=restart --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF --prop valign=center
officecli set doc.docx "/body/tbl[1]/tr[2]" --prop c1="" --prop c2=Q1 --prop c3=Q2 --prop c4=Q3
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[1]" --prop vmerge=continue
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[2]" --prop bold=true --prop shd=4472C4 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[3]" --prop bold=true --prop shd=4472C4 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[4]" --prop bold=true --prop shd=4472C4 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[1]/tr[3]" --prop c1=Revenue --prop c2='$4.2M' --prop c3='$5.1M' --prop c4='$5.8M'
officecli set doc.docx "/body/tbl[1]/tr[4]" --prop c1=Users --prop c2=12K --prop c3=15K --prop c4=18K
```

### Multi-Element Paragraph

```bash
officecli add doc.docx /body --type paragraph --prop text=""
officecli add doc.docx /body/p[1] --type run --prop text="Important: " --prop bold=true --prop color=FF0000 --prop font=Calibri --prop size=11pt
officecli add doc.docx /body/p[1] --type run --prop text="This deadline is " --prop font=Calibri --prop size=11pt
officecli add doc.docx /body/p[1] --type run --prop text="March 31, 2026" --prop bold=true --prop underline=single --prop font=Calibri --prop size=11pt
officecli add doc.docx /body/p[1] --type run --prop text=". Please submit all documents before this date." --prop font=Calibri --prop size=11pt
```

---

## Document Closing (Last Page)

> **RULE: The last page must have content filling at least 40% of the page. A near-empty final page signals an unfinished document.**

Every professional document needs a deliberate closing section. Never end a document with a sparse final paragraph — always add one of the following closing patterns.

### Closing Pattern A: Full Closing Section (Recommended for Reports & Proposals)

Include Conclusion / Summary, Next Steps (if applicable), and contact information. This pattern reliably fills the closing page.

```bash
# Conclusion section heading
officecli add doc.docx /body --type paragraph --prop text="Conclusion" --prop style=Heading1

# Conclusion summary text
officecli add doc.docx /body --type paragraph --prop text="This document has outlined the key findings and recommendations for Q4. The data demonstrates strong performance across all divisions, with particular strength in the APAC region." --prop font=Calibri --prop size=11pt --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Next steps (if applicable)
officecli add doc.docx /body --type paragraph --prop text="Next Steps" --prop style=Heading2
officecli add doc.docx /body --type paragraph --prop text="Finalize Q1 budget allocation by April 15" --prop listStyle=numbered
officecli add doc.docx /body --type paragraph --prop text="Present findings to the board on April 20" --prop listStyle=numbered
officecli add doc.docx /body --type paragraph --prop text="Launch APAC expansion pilot in May 2026" --prop listStyle=numbered

# Contact / acknowledgements section
officecli add doc.docx /body --type paragraph --prop text="Contact Information" --prop style=Heading2
officecli add doc.docx /body --type paragraph --prop text="For questions or follow-up, please contact:" --prop font=Calibri --prop size=11pt --prop spaceAfter=6pt
officecli add doc.docx /body --type paragraph --prop text="Team Alpha — Finance & Strategy" --prop font=Calibri --prop size=11pt --prop bold=true --prop spaceAfter=0pt
officecli add doc.docx /body --type paragraph --prop text="Email: team.alpha@acmecorp.com" --prop font=Calibri --prop size=11pt --prop spaceAfter=0pt
officecli add doc.docx /body --type paragraph --prop text="Phone: +1 (212) 555-0100" --prop font=Calibri --prop size=11pt --prop spaceAfter=24pt

# Bottom accent bar + legal notice
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop size=8pt --prop spaceBefore=0pt --prop spaceAfter=8pt
officecli add doc.docx /body --type paragraph --prop text="© 2026 Acme Corporation. All rights reserved. This document is confidential and intended solely for the named recipients." --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=center --prop spaceAfter=0pt
```

### Closing Pattern B: Minimal Closing Page (Letters, Memos, Short Reports)

When content naturally ends early, add a "Thank You" close plus contact information to reach the 40% threshold.

```bash
# Closing statement
officecli add doc.docx /body --type paragraph --prop text="Thank You" --prop alignment=center --prop font=Calibri --prop size=24pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=48pt --prop spaceAfter=16pt

# Subtitle line
officecli add doc.docx /body --type paragraph --prop text="We appreciate your time and look forward to the next steps." --prop alignment=center --prop font=Calibri --prop size=12pt --prop color=444444 --prop spaceAfter=36pt

# Accent divider
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=4472C4 --prop size=6pt --prop spaceBefore=0pt --prop spaceAfter=24pt

# Contact block
officecli add doc.docx /body --type paragraph --prop text="contact@acmecorp.com  |  www.acmecorp.com  |  +1 (212) 555-0100" --prop alignment=center --prop font=Calibri --prop size=10pt --prop color=666666 --prop spaceAfter=8pt

# Document version/date footer line
officecli add doc.docx /body --type paragraph --prop text="Document Version 1.0  —  March 2026" --prop alignment=center --prop font=Calibri --prop size=9pt --prop color=AAAAAA --prop spaceAfter=0pt
```

### Closing Pattern C: Appendix + Version History (Technical Spec / Formal Reports)

```bash
# Appendix section
officecli add doc.docx /body --type paragraph --prop text="Appendix" --prop style=Heading1

officecli add doc.docx /body --type paragraph --prop text="A. Glossary" --prop style=Heading2
officecli add doc.docx /body --type paragraph --prop text="API — Application Programming Interface" --prop leftIndent=720 --prop hangingIndent=360 --prop font=Calibri --prop size=11pt --prop spaceAfter=4pt
officecli add doc.docx /body --type paragraph --prop text="CI/CD — Continuous Integration / Continuous Deployment" --prop leftIndent=720 --prop hangingIndent=360 --prop font=Calibri --prop size=11pt --prop spaceAfter=4pt

officecli add doc.docx /body --type paragraph --prop text="B. Version History" --prop style=Heading2
officecli add doc.docx /body --type table --prop rows=4 --prop cols=3 --prop width="100%" --prop style=TableGrid
officecli set doc.docx "/body/tbl[last]/tr[1]" --prop c1="Version" --prop c2="Date" --prop c3="Changes" --prop header=true
officecli set doc.docx "/body/tbl[last]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[last]/tr[1]/tc[2]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[last]/tr[1]/tc[3]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[last]/tr[2]" --prop c1="1.0" --prop c2="2026-03-01" --prop c3="Initial draft"
officecli set doc.docx "/body/tbl[last]/tr[3]" --prop c1="1.1" --prop c2="2026-03-15" --prop c3="Review comments incorporated"
officecli set doc.docx "/body/tbl[last]/tr[4]" --prop c1="1.2" --prop c2="2026-03-27" --prop c3="Final approved version"

# Legal notice
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop size=8pt --prop spaceBefore=36pt --prop spaceAfter=8pt
officecli add doc.docx /body --type paragraph --prop text="© 2026 Acme Corporation. Confidential. Do not distribute without written permission." --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=center
```

### Pre-Delivery: Last-Page Density Check

After completing your document, always verify the final page is not sparse:

```bash
# Check total page structure
officecli view doc.docx outline

# Read the last section of content
officecli view doc.docx text --start -30
```

If the last page has fewer than 3-4 substantive paragraphs, add a Closing Pattern (A, B, or C above) before delivering.
