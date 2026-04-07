<!-- officecli: v1.0.23 -->

# Editing Existing Presentations

Use this guide when modifying an existing .pptx file (template-based or content update).

## Workflow Overview

1. **Analyze** the template (structure, layouts, shapes)
2. **Plan** slide mapping (content -> layout)
3. **Structural changes** (clone, remove, reorder slides) -- **do this FIRST**
4. **Content edits** (text, images, charts, tables)
5. **QA** (content + visual + validation) -- see [SKILL.md](SKILL.md#qa-required)

---

## Analyzing the Template

### Step 1: Structure Overview

```bash
# See slide count, titles, shape counts
officecli view template.pptx outline
```

Output:

```
File: template.pptx | 8 slides
-- Slide 1: "Welcome" - 3 text box(es), 1 picture(s)
-- Slide 2: "Agenda" - 2 text box(es)
-- Slide 3: "(untitled)" - 4 text box(es), 2 picture(s)
...
```

### Step 2: Detailed Shape Inspection

```bash
# See shape types, fonts, sizes per slide
officecli view template.pptx annotated
```

Output:

```
[/slide[1]]
  [Title] "Welcome to Our Company" <- Georgia 44pt
  [Text Box] "Q4 2025 Report" <- Calibri 20pt
  [Picture] "Logo" <- alt="Company logo"
```

**Note:** `view annotated` shows only text-bearing shapes (content shapes), while `get --depth 1` shows ALL shapes including decorative elements (bars, frames, dots). Use `get --depth 1` to see the complete shape list and indices for targeting specific elements.

> **WARNING: `view annotated` hides non-text shapes.** The annotated view only displays shapes that contain text. Non-text decorative shapes (lines, dots, rectangles without text) are invisible in annotated output. This means shape indices shown in annotated view are NOT contiguous -- there are gaps where non-text shapes exist. **Always use `get --depth 1` to see the true shape indices before targeting shapes by index.** Relying on annotated view alone will cause you to modify the wrong shapes.

**Template decorative elements:** Many templates contain shapes with `!!`-prefixed names (e.g., `!!bar1`, `!!frame2`). These are decorative elements used for morph transitions between slides. They may be positioned off-screen (x>33cm) to animate into view on slide transition. **Do not rename `!!`-prefixed shapes** -- renaming breaks morph animations. Whether to leave them in place, send them to back, or neutralize them depends on their visual impact on your content. See "Step 2b: Decorative Element Triage" below.

### Step 2b: Decorative Element Triage

After identifying all `!!`-prefixed shapes with `get --depth 1`, classify each one:

**Category A -- Framing elements (leave in place):**
Shapes positioned outside the content zone (x > 30cm, y < 0, or placed at slide edges/corners). These are morph transition elements or border decorations. No action needed.

**Category B -- Background watermarks (send to back):**
Shapes positioned within the content zone but using light/muted colors (fill or text color with lightness > 80%, e.g., E0E0E0, F2F2F2). These are decorative watermarks. Send them behind content:

```bash
# Send decorative watermark to back of z-order
officecli set template.pptx "/slide[1]/shape[3]" --prop zorder=back
```

**Category C -- Opaque overlays (neutralize):**
Shapes positioned within the content zone with dark/opaque colors (black, dark gray) AND large font sizes (100pt+). These WILL obscure your content. You have two options:

Option 1 -- Convert to subtle watermark (preserves template design intent):

```bash
# Change giant dark number to light gray watermark and send to back
officecli set template.pptx "/slide[1]/shape[3]" --prop color=E8E8E8 --prop zorder=back
```

Option 2 -- Remove entirely (if watermark effect is not desired):

```bash
officecli remove template.pptx "/slide[1]/shape[3]"
```

**How to classify:** After running `get --depth 1` on each slide, check each `!!`-prefixed shape:

1. Is it positioned within the content zone (0cm < x < 30cm, 0cm < y < 19cm)? If no -> Category A.
2. Is its text/fill color light (RGB values all > 200)? If yes -> Category B.
3. Is it dark/opaque AND has large font size (>80pt)? -> Category C.

**Do this BEFORE editing content.** If you skip triage and edit content first, you will not discover the collision until visual QA, at which point you must retroactively fix z-order on every affected slide.

> **WARNING: Z-order changes cause shape index renumbering.** When you change a shape's z-order (e.g., `zorder=back`), the shape is physically moved in the ShapeTree XML. ALL shape indices shift immediately. After any z-order change, re-query the slide with `get --depth 1` before referencing shapes by index. When changing z-order for multiple shapes on the same slide, **process from highest index to lowest** to minimize cascading index shifts. Combining `zorder` with other properties in a single `set` command is safe -- z-order is applied first, then other properties are applied to the same shape at its new position.

### Step 3: Per-Slide Deep Inspection

```bash
# List all shapes on slide 1 with properties
officecli get template.pptx /slide[1] --depth 1

# Get specific shape details (position, fill, font, animation)
officecli get template.pptx /slide[1]/shape[1]

# Get placeholder by type
officecli get template.pptx "/slide[1]/placeholder[title]"

# Get chart data
officecli get template.pptx /slide[2]/chart[1]

# Get table structure
officecli get template.pptx /slide[3]/table[1] --depth 3
```

### Step 4: Visual Inspection

```bash
# HTML preview in browser (recommended -- shows all slides, charts, gradients)
officecli view template.pptx html --browser

# SVG preview of a single slide (SVG renders only one slide per invocation)
officecli view template.pptx svg --start 2 --end 2 --browser
```

### Step 5: Find Specific Elements

```bash
# Find all pictures without alt text
officecli query template.pptx "picture:no-alt"

# Find shapes with specific text
officecli query template.pptx 'shape:contains("placeholder")'

# Find all title shapes
officecli query template.pptx "title"

# Find shapes on a specific slide
officecli query template.pptx 'slide[2] > shape'
```

---

## Planning Slide Mapping

Before making changes, plan which template slides to keep, clone, or remove.

**Use varied layouts** -- monotonous presentations are a common failure mode. Don't reuse the same layout for every slide.

Match content type to layout style:

- Key points -> bullet slide
- Team info -> multi-column or icon grid
- Testimonials -> quote/callout slide
- Data -> chart slide or stats callout
- Comparison -> two-column side-by-side
- New section -> section divider slide

**Example mapping:**

```
Source content          Template slide to use
--------------          ---------------------
Title + subtitle     -> Slide 1 (title layout)
Executive summary    -> Slide 3 (content layout)
Revenue data         -> Slide 5 (chart layout) -- clone for each quarter
Team overview        -> Slide 4 (multi-column) -- needs 3 members, template has 4
Conclusion           -> Slide 8 (closing layout)

Action: Remove slides 2, 6, 7. Clone slide 5 twice. Adjust slide 4.
```

---

## Structural Changes (Do First)

**Complete ALL structural changes before editing content.** This prevents path index shifts that break subsequent commands.

### Clone Slides

```bash
# Clone slide 5 and append to end
officecli add template.pptx / --from /slide[5]

# Clone slide 3 and insert at position 2
officecli add template.pptx / --from /slide[3] --index 2
```

### Remove Slides

```bash
# Remove slide 7
officecli remove template.pptx /slide[7]

# Remove slide 3 (indices shift after each removal -- remove from highest index first)
officecli remove template.pptx /slide[3]
```

**Remove from highest index to lowest** to avoid index shifting problems.

### Reorder Slides

```bash
# Move slide 5 to position index 1 (becomes second slide)
officecli move template.pptx /slide[5] --index 1

# Move slide after another slide (anchor-based)
officecli move template.pptx /slide[5] --after /slide[2]

# Swap two slides
officecli swap template.pptx /slide[2] /slide[4]
```

### Add New Slides

```bash
# Add blank slide at end
officecli add template.pptx / --type slide --prop layout=blank

# Add slide with specific layout
officecli add template.pptx / --type slide --prop layout=title

# Insert at specific position
officecli add template.pptx / --type slide --prop layout=blank --index 3
```

Layout types: title, blank, twoContent, titleOnly, titleContent, section, comparison

---

## Content Editing

### Modify Text

**WARNING: Template shapes inherit their original font formatting.** Always include `--prop size=N --prop font=FAMILY --prop color=HEX` when setting text on template shapes. Omitting these causes text to render at the template's original display size (often 40-60pt), producing word-wrapping and overlap. See "Font Cascade from Template Shapes" below.

```bash
# Replace shape text
officecli set template.pptx /slide[1]/shape[1] --prop text="New Title Text"

# Set placeholder by type
officecli set template.pptx "/slide[1]/placeholder[title]" --prop text="Q4 Business Review"
officecli set template.pptx "/slide[1]/placeholder[body]" --prop text="Financial highlights and key metrics"

# Update text with styling
officecli set template.pptx /slide[2]/shape[1] --prop text="Revenue Report" --prop bold=true --prop size=36 --prop color=1E2761

# Multi-line text
officecli set template.pptx /slide[3]/shape[2] --prop "text=Point one\\nPoint two\\nPoint three" --prop list=bullet
```

### Replace Images

```bash
# Replace image source
officecli set template.pptx /slide[1]/picture[1] --prop path=new-photo.jpg

# Update alt text
officecli set template.pptx /slide[1]/picture[1] --prop alt="Updated product photo"

# Resize and reposition
officecli set template.pptx /slide[2]/picture[1] --prop path=chart-screenshot.png --prop width=14cm --prop height=10cm --prop x=2cm --prop y=5cm
```

### Update Charts

```bash
# Replace chart data (updates values of existing series only)
officecli set template.pptx /slide[3]/chart[1] --prop data="2024:42,58,65,78;2025:51,67,74,92"

# Update categories
officecli set template.pptx /slide[3]/chart[1] --prop categories="Q1,Q2,Q3,Q4"

# Update individual series
officecli set template.pptx /slide[3]/chart[1] --prop series1="Revenue:51,67,74,92"

# Update title and styling
officecli set template.pptx /slide[3]/chart[1] --prop title="Updated Revenue Trend" --prop colors=1E2761,CADCFC
```

**`set --prop data=` and `set --prop seriesN=` can only update existing series -- they cannot add new series to a chart.** If you need more series than the chart currently has, you must delete the chart and recreate it with all series included in the `add` command:

```bash
# Remove existing chart
officecli remove template.pptx "/slide[3]/chart[1]"

# Recreate with all series (both series1+series2 props and data prop work)
officecli add template.pptx "/slide[3]" --type chart --prop chartType=column \
  --prop categories="Q1,Q2,Q3,Q4" \
  --prop series1="Revenue:51,67,74,92" --prop series2="Costs:30,35,38,42" \
  --prop x=2cm --prop y=4cm --prop width=29cm --prop height=13cm --prop colors=1E2761,CADCFC
```

### Update Tables

**Cascade ordering:** Row-level `set` commands reset font properties (`size`, `font`) to defaults, overwriting prior table-level settings. Apply cell-level overrides **after** row-level defaults. The recommended order: (1) populate row content, (2) set table-level `size`/`font`, (3) apply cell-level overrides last. The default table font size is 18pt -- almost always too large for data tables.

```bash
# Set cell text via row shorthand
officecli set template.pptx /slide[4]/table[1]/tr[1] --prop c1="Product" --prop c2="Revenue" --prop c3="Growth"

# Set individual cell
officecli set template.pptx /slide[4]/table[1]/tr[2]/tc[1] --prop text="Widget A" --prop bold=true

# Style a cell
officecli set template.pptx /slide[4]/table[1]/tr[1]/tc[1] --prop fill=1E2761 --prop color=FFFFFF --prop bold=true --prop align=center

# Add a new row
officecli add template.pptx /slide[4]/table[1] --type row --prop c1="New Product" --prop c2="$2.1M" --prop c3="+18%"
```

### Update Slide Properties

```bash
# Change background
officecli set template.pptx /slide[1] --prop background=1E2761

# Set gradient background
officecli set template.pptx /slide[1] --prop "background=1E2761-0D1433"

# Add transition
officecli set template.pptx /slide[2] --prop transition=fade

# Set speaker notes
officecli set template.pptx /slide[1] --prop notes="Opening remarks: welcome the audience"
```

### Add New Elements to Existing Slides

**When adding new slides to an existing template:** Inspect the template's existing slides first (`get /slide[1]`) to match the background color, font family, and color scheme. For layout patterns (stat callouts, charts, card grids, timelines), refer to [creating.md](creating.md) -- adapt its recipes to the template's color palette.

```bash
# Add text box to slide
officecli add template.pptx /slide[2] --type shape --prop text="Additional Note" --prop x=2cm --prop y=15cm --prop width=20cm --prop height=2cm --prop font=Calibri --prop size=12 --prop color=888888

# Add picture to slide
officecli add template.pptx /slide[3] --type picture --prop path=infographic.png --prop x=18cm --prop y=4cm --prop width=13cm --prop height=12cm --prop alt="Q4 infographic"

# Add chart to slide
officecli add template.pptx /slide[5] --type chart --prop chartType=pie --prop categories="A,B,C" --prop data="Share:40,35,25" --prop x=18cm --prop y=4cm --prop width=12cm --prop height=10cm
```

### Remove Elements

```bash
# Remove a shape
officecli remove template.pptx /slide[3]/shape[4]

# Remove a picture
officecli remove template.pptx /slide[2]/picture[2]

# Remove a chart
officecli remove template.pptx /slide[5]/chart[1]
```

---

## Template Adaptation Pitfalls

### Dark Background Table Text Color

Tables default to black text. On dark backgrounds (navy, charcoal, etc.), table content will be invisible unless you explicitly set `color` to a light value. After creating or populating a table on a dark slide, set the text color on the table element:

```bash
# Set white text on entire table (cascades to all cells)
officecli set template.pptx "/slide[5]/table[1]" --prop color=FFFFFF

# Or set per-row when populating
officecli set template.pptx "/slide[5]/table[1]/tr[1]" --prop c1="Metric" --prop c2="Value" --prop color=FFFFFF
```

This applies to any slide where the background color is dark -- whether from the original template or from a `background=` you set on a new slide.

### Chart Colors on Dark Backgrounds

Charts default to colors that may be invisible on dark slide backgrounds. When placing a chart on a dark background slide, explicitly set `colors` using the template's light/accent palette values:

```bash
# BAD -- default colors invisible on navy background
officecli add template.pptx "/slide[6]" --type chart --prop chartType=column ...

# GOOD -- explicit light colors for dark background
officecli add template.pptx "/slide[6]" --type chart --prop chartType=column \
  --prop colors=CADCFC,D4A843 \
  --prop axisFont="10:AABBCC:Calibri" \
  --prop legendFont="10:AABBCC:Calibri" \
  --prop gridlines="334466:0.5" \
  --prop plotFill=none --prop chartFill=none ...
```

Use the template's secondary or accent colors (not the primary dark color) for chart series. Set axis and legend fonts to a light/muted color. Set gridlines to a subtle mid-tone that is visible but not dominant.

### Slot Count Mismatch

When your content has fewer items than the template provides:

**Remove excess elements entirely** -- don't just clear their text. Empty text boxes and orphaned images create visual clutter.

```bash
# Template has 4 team member cards, you only need 3
# Remove the 4th card's shape group (check shape indices first)
officecli get template.pptx /slide[4] --depth 1

# Remove excess elements (highest index first)
officecli remove template.pptx /slide[4]/shape[8]    # 4th member text
officecli remove template.pptx /slide[4]/picture[4]   # 4th member photo
officecli remove template.pptx /slide[4]/shape[7]     # 4th member name
```

When your content has more items than the template:

- Clone the slide and split content across two slides
- Or add new shapes to the existing slide

### Text Length Mismatch

- **Shorter replacements**: Usually safe
- **Longer replacements**: May overflow or wrap unexpectedly
- After replacing text, always verify visually with `officecli view template.pptx html --browser`
- Consider truncating or splitting long content to fit the template design

### Font Cascade from Template Shapes

**This is the #1 cause of undeliverable template edits.**

Template shapes (cards, headers, callout boxes) often have font size, font family, and color baked into their text run properties. When you `set --prop text="..."` on these shapes, the NEW text inherits the TEMPLATE's original run formatting, NOT the size/font/color you might expect.

**Symptom:** Text appears at enormous size (40-60pt), wraps mid-word, or overlaps with other elements.

**Fix: ALWAYS include explicit size, font, and color when setting text on template shapes:**

```bash
# BAD -- inherits template's original 48pt display size
officecli set template.pptx "/slide[3]/shape[2]" --prop text="Enterprise"

# GOOD -- explicit size override
officecli set template.pptx "/slide[3]/shape[2]" --prop text="Enterprise" --prop size=20 --prop font=Arial --prop color=D4A843
```

**Before editing any template shape, inspect it first:**

```bash
officecli get template.pptx "/slide[3]/shape[2]"
```

Look at the reported font size. If it is larger than you want for your content, you MUST override it in your set command.

**Batch mode:** Include size, font, and color in the props object for every text-setting operation on template shapes:

```bash
cat <<'EOF' | officecli batch template.pptx
[
  {"command":"set","path":"/slide[3]/shape[2]","props":{"text":"Enterprise","size":"20","font":"Arial","color":"D4A843"}},
  {"command":"set","path":"/slide[3]/shape[3]","props":{"text":"Platform","size":"20","font":"Arial","color":"D4A843"}}
]
EOF
```

**If `set --prop size=N` does not visually change the size** (some templates embed formatting at the XML run level that resists high-level overrides), fall back to `raw-set` to directly set the run-level font size:

```bash
officecli raw-set template.pptx "/slide[3]" \
  --xpath "//p:sp[2]//a:rPr" \
  --action setattr \
  --xml "sz=2000"
```

(where `sz=2000` = 20pt in half-points; `sz=2400` = 24pt, etc.)

### Formatting Preservation

When setting text with `--prop text="..."`, the first run's formatting is preserved. For mixed formatting, use paragraph and run operations:

```bash
# Bold header + normal body in same shape
officecli set template.pptx /slide[2]/shape[1]/paragraph[1] --prop bold=true --prop text="Summary"
officecli add template.pptx /slide[2]/shape[1] --type paragraph --prop text="Revenue grew 25% this quarter." --prop bold=false --prop size=16
```

---

## Parallel Editing with Subagents

Slides are independent elements. When editing multiple slides, use subagents for parallel execution.

**Provide each subagent with:**

- The file path
- Specific slide numbers to edit
- The content/data for those slides
- Design guidelines (fonts, colors, spacing)

```
Edit slides 3-5 in /path/to/template.pptx.

Slide 3: Replace title with "Revenue Overview", update chart data to Q1=42,Q2=58,Q3=65,Q4=78
Slide 4: Replace team member names and photos (see data below)
Slide 5: Update table with new metrics (see data below)

Style: font=Calibri, title size=32, body size=16, primary color=1E2761
Use officecli set/add commands. Do NOT modify structural slide order.
```

**Important:** Only use subagents for content editing (step 4). All structural changes (step 3) must be done sequentially in the main thread first.

---

## Template Merge (Placeholder-Based)

For templates with `{{key}}` placeholders in text:

```bash
# Merge template with JSON data
officecli merge template.pptx output.pptx --data '{"company":"Acme Corp","quarter":"Q4 2025","revenue":"$5.1M","growth":"25%"}'

# Or from a JSON file
officecli merge template.pptx output.pptx --data data.json
```

This replaces all `{{key}}` placeholders across all slides in a single operation.

---

## Bulk Modifications with Query

Use CSS-like queries to find and modify elements across the entire presentation:

```bash
# Find all shapes with Arial font
officecli query template.pptx "shape[font=Arial]"

# Find all pictures missing alt text
officecli query template.pptx "picture:no-alt"

# Find shapes containing placeholder text
officecli query template.pptx 'shape:contains("lorem")'

# Find shapes larger than 15cm wide
officecli query template.pptx "shape[width>=15cm]"
```

Then modify found elements by their path:

```bash
# After finding shape paths from query results, update them
officecli set template.pptx /slide[2]/shape[3] --prop font=Calibri
officecli set template.pptx /slide[4]/picture[1] --prop alt="Product dashboard screenshot"
```

---

## Raw XML Escape Hatch

When the high-level CLI cannot express what you need, fall back to raw XML:

```bash
# View raw XML of a slide
officecli raw template.pptx /slide[1]

# Modify raw XML
officecli raw-set template.pptx /slide[1] \
  --xpath "//p:sp[1]//a:solidFill/a:srgbClr" \
  --action setattr \
  --xml "val=FF0000"

# Remove all animations from a slide
officecli raw-set template.pptx /slide[1] \
  --xpath "//p:timing" \
  --action remove
```

Raw-set actions: append, prepend, insertbefore, insertafter, replace, remove, setattr.

XPath namespace prefixes: p (PresentationML), a (DrawingML), r (Relationships), c (Charts).

**Use raw XML only as a last resort.** The high-level CLI handles most operations correctly without XML knowledge.
