<!-- officecli: v1.0.23 -->

# Editing Existing Documents

Use this guide when modifying an existing .docx file (template-based or content update).

## Workflow Overview

1. **Analyze** the document (structure, styles, content)
2. **Plan** content mapping (what to change, what to keep)
3. **Structural changes** (add/remove sections, reorder elements) -- **do this FIRST**
4. **Content edits** (text, images, charts, tables)
5. **QA** (content + validation) -- see [SKILL.md](SKILL.md#qa-required)

---

## Analyzing the Document

### Step 1: Issue Detection

```bash
officecli view doc.docx issues
```

Start with issues to understand existing problems before making changes.

### Step 2: Structure Overview

```bash
officecli view doc.docx outline
```

Look for: heading hierarchy, section count, headers/footers presence, watermarks.

### Step 3: Content Extraction

```bash
# Full text with element paths
officecli view doc.docx text

# Limit output for large documents
officecli view doc.docx text --max-lines 100

# Annotated view (formatting details)
officecli view doc.docx annotated
```

### Step 4: Style & Font Analysis

```bash
officecli view doc.docx stats
```

Use stats to understand the document's style palette before making changes. Match existing styles rather than introducing inline formatting.

### Step 5: Element Inspection

```bash
# Document-level properties
officecli get doc.docx /

# Body structure at depth 1
officecli get doc.docx /body --depth 1

# Specific table
officecli get doc.docx "/body/tbl[1]" --depth 3

# Styles in use
officecli get doc.docx /styles

# Specific style definition
officecli get doc.docx "/styles/Heading1"

# Header/footer content
officecli get doc.docx "/header[1]"
officecli get doc.docx "/footer[1]"
```

### Step 6: Find Specific Elements

```bash
officecli query doc.docx 'paragraph[style=Heading1]'
officecli query doc.docx 'p:contains("quarterly")'
officecli query doc.docx 'image:no-alt'
officecli query doc.docx 'p:empty'
```

---

## Planning Content Mapping

Before making changes, plan which elements to keep, modify, or remove:

```
Source content              Action
--------------              ------
Title paragraph          -> Update text
Executive summary        -> Rewrite paragraph content
Revenue table            -> Update data in rows 2-4
Q3 chart                 -> Delete and recreate with Q4 data
Header                   -> Update company name
Footer                   -> Keep (page numbers)
Appendix section         -> Remove entirely
New conclusions section  -> Add after main body
```

---

## Structural Changes (Do First)

**WARNING**: Complete ALL structural changes before editing content. Structural changes shift element indices.

### Add/Remove Paragraphs

```bash
# Add paragraph at specific position
officecli add doc.docx /body --type paragraph --prop text="New section" --prop style=Heading1 --index 5

# Remove paragraph (highest index first if removing multiple)
officecli remove doc.docx "/body/p[15]"
officecli remove doc.docx "/body/p[10]"
```

**Remove from highest index to lowest** to avoid index shifting problems.

### Add/Remove Sections

```bash
# Add section break
officecli add doc.docx /body --type section --prop type=nextPage --index 12
```

### Reorder Elements

```bash
# Move paragraph to position
officecli move doc.docx "/body/p[8]" --index 2

# Swap two paragraphs
officecli swap doc.docx "/body/p[3]" "/body/p[7]"
```

### Re-query After Structural Changes

After any add/remove/move operation, indices shift. Always re-query:

```bash
officecli get doc.docx /body --depth 1
```

---

## Content Editing

### Modify Text

```bash
# Set paragraph text
officecli set doc.docx "/body/p[1]" --prop text="Updated Title"

# Set text with formatting
officecli set doc.docx "/body/p[3]" --prop text="New body content" --prop font=Calibri --prop size=11pt

# Multi-line text
officecli set doc.docx "/body/p[5]" --prop "text=First point\\nSecond point\\nThird point"

# Set specific run text
officecli set doc.docx "/body/p[3]/r[2]" --prop text="modified phrase" --prop bold=true
```

### Update Tables

```bash
# Update row data (text shortcuts only at row level)
officecli set doc.docx "/body/tbl[1]/tr[2]" --prop c1="Updated" --prop c2="$5.5M" --prop c3="$6.2M"

# Update individual cell with formatting
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[3]" --prop text="$6.2M" --prop bold=true --prop color=2C5F2D

# Add new row
officecli add doc.docx "/body/tbl[1]" --type row --prop c1="Totals" --prop c2="$10.5M" --prop c3="$12.1M"

# Style the new row's cells
officecli set doc.docx "/body/tbl[1]/tr[5]/tc[1]" --prop bold=true
officecli set doc.docx "/body/tbl[1]/tr[5]/tc[2]" --prop bold=true
officecli set doc.docx "/body/tbl[1]/tr[5]/tc[3]" --prop bold=true

# Remove row (remove from highest index first)
officecli remove doc.docx "/body/tbl[1]/tr[5]"
```

**CRITICAL**: Row-level `set` only supports `height`, `height.exact`, `header`, and `c1/c2/c3...` text shortcuts. For formatting (bold, shd, color, font, alignment), use cell-level `set` on each `tc[N]` individually.

### Replace Images

```bash
# Replace image file
officecli set doc.docx "/body/p[5]/r[1]" --prop path=new-image.jpg

# Update image dimensions
officecli set doc.docx "/body/p[5]/r[1]" --prop width=12cm --prop height=8cm

# Update alt text
officecli set doc.docx "/body/p[5]/r[1]" --prop alt="Updated chart screenshot"
```

### Update Headers/Footers

```bash
officecli set doc.docx "/header[1]" --prop text="New Company Name" --prop font=Calibri --prop size=9pt
officecli set doc.docx "/footer[1]" --prop text="Confidential - Page "
```

### Update Charts

```bash
# Update chart data (existing series only)
officecli set doc.docx "/chart[1]" --prop data="2025:51,67,74,92"

# Update chart title
officecli set doc.docx "/chart[1]" --prop title="Updated Revenue Trend"

# Update categories
officecli set doc.docx "/chart[1]" --prop categories="Q1,Q2,Q3,Q4"

# Delete and recreate chart (to change series count)
officecli remove doc.docx "/body/chart[1]"
officecli add doc.docx /body --type chart --prop chartType=column --prop categories="Q1,Q2,Q3,Q4" --prop series1="Rev:51,67,74,92" --prop series2="Cost:30,35,38,42" --prop width=15cm --prop height=10cm --prop colors=1F4E79,4472C4
```

**WARNING**: `set --prop data=` can only update existing series -- it cannot add new series. If you need more series than the chart currently has, delete and recreate.

### Find/Replace

```bash
# Global find/replace
officecli set doc.docx / --prop find="2024" --prop replace="2025"

# Scoped find/replace
officecli set doc.docx / --prop find="Acme Inc" --prop replace="Acme Corporation" --prop scope=all

# Body only (skip headers/footers)
officecli set doc.docx / --prop find="old term" --prop replace="new term" --prop scope=body

# Headers/footers only
officecli set doc.docx / --prop find="Company Name" --prop replace="Acme Corp" --prop scope=headers
```

**WARNING: Find/replace performs substring matching, not whole-word matching. Replacing "ACME" in "ACME Corporation" produces "New Name Corporation". After any find/replace, review with `view text` and run a second cleanup pass if needed.**

### Accept/Reject Tracked Changes

```bash
officecli set doc.docx / --prop accept-changes=all
officecli set doc.docx / --prop reject-changes=all
```

**Note**: Only `all` is supported for accept/reject scope. Selective acceptance by author or range is not available via high-level commands.

### Update Metadata

```bash
officecli set doc.docx / --prop title="Updated Report Title" --prop author="New Author" --prop lastModifiedBy="Editor"
```

---

## Template Editing Pitfalls

### Pitfall: Style Drift

When editing a document with established styles, always check what styles exist before adding content:

```bash
officecli view doc.docx stats
officecli get doc.docx /styles
```

Use existing style names rather than inline formatting to maintain consistency. If the document uses `Heading1` with Georgia 16pt, apply `--prop style=Heading1` instead of manually setting font/size.

### Pitfall: Index Shifting After Structural Changes

**CRITICAL**: When you remove `/body/p[5]`, what was `p[6]` becomes `p[5]`. Always:
- Remove from highest index to lowest
- Complete all structural changes before content edits
- Re-query with `get /body --depth 1` after structural changes

### Pitfall: Overwriting Headers/Footers

Setting a new header replaces the existing one. If the document has different first-page and default headers, setting the default header does not affect the first-page header (and vice versa). Check which header types exist:

```bash
officecli get doc.docx "/header[1]"
```

### Pitfall: Row-Level Formatting

Row-level `set` does NOT support `bold`, `shd`, `color`, or `font`. These properties are silently ignored or error. All formatting must go through cell-level paths:

```bash
# WRONG -- bold/shd/color ignored at row level
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1="Header" --prop bold=true --prop shd=1F4E79

# CORRECT -- text at row level, formatting at cell level
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1="Header"
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
```

---

## Bulk Modifications with Query

```bash
# Find all Heading1 paragraphs
officecli query doc.docx 'paragraph[style=Heading1]'

# Batch-set font on all Heading1 paragraphs
officecli set doc.docx 'paragraph[style=Heading1]' --prop font=Georgia --prop color=1F4E79

# Find and review empty paragraphs
officecli query doc.docx 'p:empty'

# Set style on all paragraphs matching text
officecli set doc.docx 'p:contains("important")' --prop bold=true
```

---

## Raw XML Escape Hatch

When the high-level CLI cannot express what you need, fall back to raw XML. See [creating.md](creating.md#l1-l2-l3-escalation-when-to-use-raw-xml) for the full L1/L2/L3 escalation guide.

```bash
# View raw XML
officecli raw doc.docx /document

# Modify raw XML
officecli raw-set doc.docx /document --xpath "//w:body/w:p[1]/w:pPr/w:jc" --action setattr --xml "w:val=center"

# Add tab stops (not available via high-level commands)
officecli raw-set doc.docx /document --xpath "//w:body/w:p[1]/w:pPr" --action append --xml '<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>'
```

**Use raw XML only as a last resort.** The high-level CLI handles most operations correctly without XML knowledge.

**NOTE: Comments can only be attached to paragraphs (`/body/p[N]`) or runs (`/body/p[N]/r[M]`), not to table cells directly. To comment on a table cell value, add the comment to a nearby paragraph instead.**
