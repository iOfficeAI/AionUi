<!-- officecli: v1.0.23 -->

# Creating Presentations from Scratch

Use this guide when creating a new presentation with no template.

## Workflow Overview

1. **Create** blank presentation
2. **Plan** slide structure (content outline + layout types)
3. **Build** each slide (add slide -> add elements -> style)
4. **QA** (content + visual + validation) -- see [SKILL.md](SKILL.md#qa-required)

---

## Setup

```bash
# Create blank presentation (16:9 default)
officecli create slides.pptx

# Set metadata
officecli set slides.pptx / --prop title="Q4 Report" --prop author="Team Alpha"

# Change slide size if needed
officecli set slides.pptx / --prop slideSize=16:9
# Other presets: 4:3, 16:10, a4, a3, letter, widescreen
# Custom: --prop slideWidth=24cm --prop slideHeight=13.5cm
```

Default 16:9 dimensions: 33.867cm x 19.05cm (13.333in x 7.5in).

---

## Slide Structure Patterns

Each pattern below is a complete recipe. Adapt colors, fonts, and positions to your palette.

### Title Slide (Dark Background)

```bash
# Add slide with dark background
officecli add slides.pptx / --type slide --prop layout=blank --prop background=1E2761

# Large centered title
officecli add slides.pptx /slide[1] --type shape --prop text="Quarterly Business Review" --prop x=2cm --prop y=5cm --prop width=29.87cm --prop height=4cm --prop font=Georgia --prop size=44 --prop bold=true --prop color=FFFFFF --prop align=center --prop valign=center --prop fill=none

# Subtitle
officecli add slides.pptx /slide[1] --type shape --prop text="Q4 2025 | Finance Division" --prop x=2cm --prop y=10cm --prop width=29.87cm --prop height=2cm --prop font=Calibri --prop size=20 --prop color=CADCFC --prop align=center --prop fill=none

# Date/footer
officecli add slides.pptx /slide[1] --type shape --prop text="December 2025" --prop x=2cm --prop y=16cm --prop width=29.87cm --prop height=1.5cm --prop font=Calibri --prop size=12 --prop color=8899BB --prop align=center --prop fill=none
```

### Content Slide (Title + Body Text)

```bash
officecli add slides.pptx / --type slide --prop layout=blank --prop background=F5F5F5

# Title bar with accent background
# margin format: left,top,right,bottom (text inset padding)
officecli add slides.pptx /slide[2] --type shape --prop text="Key Findings" --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=3.5cm --prop fill=1E2761 --prop color=FFFFFF --prop font=Georgia --prop size=32 --prop bold=true --prop align=left --prop valign=center --prop margin=2cm,0cm,0cm,0cm

# Body text (left-aligned, bulleted)
officecli add slides.pptx /slide[2] --type shape --prop "text=Revenue grew 25% year-over-year\\nCustomer retention rate reached 94%\\nNew market expansion on track\\nOperating costs reduced by 12%" --prop x=2cm --prop y=5cm --prop width=29.87cm --prop height=12cm --prop font=Calibri --prop size=18 --prop color=333333 --prop list=bullet --prop align=left --prop fill=none --prop lineSpacing=1.5x
```

### Two-Column Layout (Text + Visual)

```bash
officecli add slides.pptx / --type slide --prop layout=blank --prop background=FFFFFF

# Title
officecli add slides.pptx /slide[3] --type shape --prop text="Market Overview" --prop x=2cm --prop y=1cm --prop width=29.87cm --prop height=3cm --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop align=left --prop fill=none

# Left column -- text
officecli add slides.pptx /slide[3] --type shape --prop "text=Our market position has strengthened significantly in Q4.\\n\\nThree key drivers:\\n  1. Product innovation\\n  2. Strategic partnerships\\n  3. Customer-first approach" --prop x=2cm --prop y=5cm --prop width=14cm --prop height=12cm --prop font=Calibri --prop size=16 --prop color=333333 --prop align=left --prop fill=none --prop lineSpacing=1.4x

# Right column -- image or chart placeholder
officecli add slides.pptx /slide[3] --type shape --prop preset=roundRect --prop x=18cm --prop y=5cm --prop width=14cm --prop height=12cm --prop fill=E8EDF3 --prop line=CADCFC --prop lineWidth=1pt

# Or add an actual image:
# officecli add slides.pptx /slide[3] --type picture --prop path=market-chart.png --prop x=18cm --prop y=5cm --prop width=14cm --prop height=12cm --prop alt="Market share chart"
```

### Stats / Callout Slide (Big Numbers)

```bash
officecli add slides.pptx / --type slide --prop layout=blank --prop background=1E2761

# Title
officecli add slides.pptx /slide[4] --type shape --prop text="By The Numbers" --prop x=2cm --prop y=1cm --prop width=29.87cm --prop height=2.5cm --prop font=Georgia --prop size=32 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none

# Stat 1
officecli add slides.pptx /slide[4] --type shape --prop text="25%" --prop x=2cm --prop y=5cm --prop width=9cm --prop height=4cm --prop font=Georgia --prop size=64 --prop bold=true --prop color=CADCFC --prop align=center --prop valign=bottom --prop fill=none
officecli add slides.pptx /slide[4] --type shape --prop text="Revenue Growth" --prop x=2cm --prop y=9.5cm --prop width=9cm --prop height=2cm --prop font=Calibri --prop size=14 --prop color=8899BB --prop align=center --prop fill=none

# Stat 2
officecli add slides.pptx /slide[4] --type shape --prop text="94%" --prop x=12.5cm --prop y=5cm --prop width=9cm --prop height=4cm --prop font=Georgia --prop size=64 --prop bold=true --prop color=CADCFC --prop align=center --prop valign=bottom --prop fill=none
officecli add slides.pptx /slide[4] --type shape --prop text="Customer Retention" --prop x=12.5cm --prop y=9.5cm --prop width=9cm --prop height=2cm --prop font=Calibri --prop size=14 --prop color=8899BB --prop align=center --prop fill=none

# Stat 3
officecli add slides.pptx /slide[4] --type shape --prop text="1.2M" --prop x=23cm --prop y=5cm --prop width=9cm --prop height=4cm --prop font=Georgia --prop size=64 --prop bold=true --prop color=CADCFC --prop align=center --prop valign=bottom --prop fill=none
officecli add slides.pptx /slide[4] --type shape --prop text="Active Users" --prop x=23cm --prop y=9.5cm --prop width=9cm --prop height=2cm --prop font=Calibri --prop size=14 --prop color=8899BB --prop align=center --prop fill=none
```

### Chart Slide (Modern Styled)

```bash
officecli add slides.pptx / --type slide --prop layout=blank --prop background=FFFFFF

# Title
officecli add slides.pptx /slide[5] --type shape --prop text="Revenue Trend" --prop x=2cm --prop y=1cm --prop width=29.87cm --prop height=2.5cm --prop font=Georgia --prop size=32 --prop bold=true --prop color=1E2761 --prop align=left --prop fill=none

# Modern styled chart
officecli add slides.pptx /slide[5] --type chart --prop chartType=column --prop title="Quarterly Revenue ($M)" --prop categories="Q1,Q2,Q3,Q4" --prop series1="2024:42,58,65,78" --prop series2="2025:51,67,74,92" --prop x=2cm --prop y=4cm --prop width=29.87cm --prop height=14cm --prop colors=1E2761,CADCFC --prop legend=bottom --prop plotFill=none --prop chartFill=none --prop gridlines="E2E8F0:0.5" --prop dataLabels=value --prop labelPos=outsideEnd --prop labelFont="10:64748B:false" --prop axisFont="10:64748B:Calibri" --prop legendFont="10:64748B:Calibri" --prop title.font=Georgia --prop title.size=14 --prop title.color=333333 --prop series.outline="FFFFFF-0.5" --prop gap=80
```

### Comparison Slide (Before / After)

```bash
officecli add slides.pptx / --type slide --prop layout=blank --prop background=F5F5F5

# Title
officecli add slides.pptx /slide[6] --type shape --prop text="Before & After" --prop x=2cm --prop y=1cm --prop width=29.87cm --prop height=2.5cm --prop font=Georgia --prop size=32 --prop bold=true --prop color=1E2761 --prop align=center --prop fill=none

# Left card -- Before
officecli add slides.pptx /slide[6] --type shape --prop preset=roundRect --prop x=2cm --prop y=4.5cm --prop width=14.5cm --prop height=13cm --prop fill=FFFFFF --prop line=E0E0E0 --prop lineWidth=1pt
officecli add slides.pptx /slide[6] --type shape --prop text="Before" --prop x=3cm --prop y=5cm --prop width=12.5cm --prop height=2cm --prop font=Georgia --prop size=24 --prop bold=true --prop color=B85042 --prop align=left --prop fill=none
officecli add slides.pptx /slide[6] --type shape --prop "text=Manual data entry\\nFragmented workflows\\n48-hour turnaround\\nError rate: 12%" --prop x=3cm --prop y=7.5cm --prop width=12.5cm --prop height=9cm --prop font=Calibri --prop size=16 --prop color=555555 --prop list=bullet --prop align=left --prop fill=none --prop lineSpacing=1.6x

# Right card -- After
officecli add slides.pptx /slide[6] --type shape --prop preset=roundRect --prop x=17.5cm --prop y=4.5cm --prop width=14.5cm --prop height=13cm --prop fill=FFFFFF --prop line=E0E0E0 --prop lineWidth=1pt
officecli add slides.pptx /slide[6] --type shape --prop text="After" --prop x=18.5cm --prop y=5cm --prop width=12.5cm --prop height=2cm --prop font=Georgia --prop size=24 --prop bold=true --prop color=2C5F2D --prop align=left --prop fill=none
officecli add slides.pptx /slide[6] --type shape --prop "text=Automated pipelines\\nUnified platform\\n4-hour turnaround\\nError rate: 0.3%" --prop x=18.5cm --prop y=7.5cm --prop width=12.5cm --prop height=9cm --prop font=Calibri --prop size=16 --prop color=555555 --prop list=bullet --prop align=left --prop fill=none --prop lineSpacing=1.6x
```

**Z-order tip:** When adding card backgrounds (roundRect) and then text on top, always add the background shape first. If shapes overlap incorrectly, fix with `--prop zorder=back` on the background shape or `--prop zorder=front` on the text shape.

### Section Divider

```bash
officecli add slides.pptx / --type slide --prop layout=blank --prop "background=1E2761-CADCFC-180"

# Section number
officecli add slides.pptx /slide[7] --type shape --prop text="02" --prop x=2cm --prop y=5cm --prop width=29.87cm --prop height=3cm --prop font=Georgia --prop size=72 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none --prop opacity=0.3

# Section title
officecli add slides.pptx /slide[7] --type shape --prop text="Financial Performance" --prop x=2cm --prop y=8cm --prop width=29.87cm --prop height=3cm --prop font=Georgia --prop size=40 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none
```

### Closing / CTA Slide

```bash
officecli add slides.pptx / --type slide --prop layout=blank --prop background=1E2761

# Main message
officecli add slides.pptx /slide[8] --type shape --prop text="Thank You" --prop x=2cm --prop y=5cm --prop width=29.87cm --prop height=4cm --prop font=Georgia --prop size=48 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none

# Contact / CTA
officecli add slides.pptx /slide[8] --type shape --prop "text=Questions? Reach out at team@company.com" --prop x=2cm --prop y=10cm --prop width=29.87cm --prop height=2cm --prop font=Calibri --prop size=18 --prop color=CADCFC --prop align=center --prop fill=none
```

---

## Building Blocks

### Shapes & Text Boxes

```bash
# Simple text box
officecli add slides.pptx /slide[1] --type shape --prop text="Hello" --prop x=2cm --prop y=3cm --prop width=10cm --prop height=3cm

# Styled shape with fill
officecli add slides.pptx /slide[1] --type shape --prop text="Important" --prop x=5cm --prop y=5cm --prop width=15cm --prop height=3cm --prop fill=4472C4 --prop color=FFFFFF --prop size=24 --prop bold=true --prop align=center --prop preset=roundRect

# Shape without text (decorative)
officecli add slides.pptx /slide[1] --type shape --prop preset=ellipse --prop fill=FF6600 --prop x=15cm --prop y=5cm --prop width=5cm --prop height=5cm

# Gradient fill
officecli add slides.pptx /slide[1] --type shape --prop text="Gradient Box" --prop x=2cm --prop y=2cm --prop width=10cm --prop height=5cm --prop gradient=4472C4-1A1A2E --prop color=FFFFFF

# Z-order: send a card background behind text shapes
officecli set slides.pptx "/slide[1]/shape[5]" --prop zorder=back
# Or bring a shape to front
officecli set slides.pptx "/slide[1]/shape[3]" --prop zorder=front
# Relative: move one step back/forward
officecli set slides.pptx "/slide[1]/shape[3]" --prop zorder=backward

# WARNING: Z-order changes cause shape index renumbering!
# After any zorder change, shape indices shift immediately.
# Re-query with `get --depth 1` before referencing shapes by index.
# When changing z-order for multiple shapes, process highest index first.

# Radial gradient
officecli add slides.pptx /slide[1] --type shape --prop x=2cm --prop y=2cm --prop width=10cm --prop height=5cm --prop "gradient=radial:FFFFFF-4472C4-center"

# IMPORTANT: gradient fills use the `gradient` property, NOT `fill`.
# fill=COLOR1-COLOR2 will ERROR -- use gradient=COLOR1-COLOR2 instead.

# Custom gradient stops
officecli add slides.pptx /slide[1] --type shape --prop x=2cm --prop y=2cm --prop width=10cm --prop height=5cm --prop "gradient=FF0000@0-FFFF00@50-00FF00@100"

# Bulleted list
officecli add slides.pptx /slide[1] --type shape --prop "text=First point\\nSecond point\\nThird point" --prop list=bullet --prop x=2cm --prop y=5cm --prop width=20cm --prop height=8cm --prop size=16

# Numbered list
officecli add slides.pptx /slide[1] --type shape --prop "text=Step one\\nStep two\\nStep three" --prop list=numbered --prop x=2cm --prop y=5cm --prop width=20cm --prop height=8cm
```

**Shape presets:** rect, roundRect, ellipse, diamond, triangle, rtTriangle, parallelogram, trapezoid, pentagon, hexagon, octagon, star4, star5, star6, star8, star10, star12, star16, star24, star32, heart, cloud, lightning, sun, moon, rightArrow, leftArrow, upArrow, downArrow, chevron, plus, cross, ribbon

**List styles:** bullet, dash, arrow, check, star, numbered, alpha, roman, none

#### Icon in Colored Circle Pattern

There is no dedicated `icon` element type. Build icons from a colored circle + centered text (emoji, number, or letter):

```bash
# Colored circle background
officecli add slides.pptx /slide[1] --type shape --prop preset=ellipse --prop fill=1E2761 --prop x=2cm --prop y=5cm --prop width=2.5cm --prop height=2.5cm --prop line=none

# Centered text overlay (emoji, number, or letter as icon)
officecli add slides.pptx /slide[1] --type shape --prop text="01" --prop x=2cm --prop y=5cm --prop width=2.5cm --prop height=2.5cm --prop fill=none --prop color=FFFFFF --prop size=16 --prop bold=true --prop align=center --prop valign=center --prop font=Calibri

# Or use an SVG icon file
officecli add slides.pptx /slide[1] --type picture --prop path=icon.svg --prop x=2.3cm --prop y=5.3cm --prop width=1.9cm --prop height=1.9cm --prop alt="Settings icon"
```

For icon + text rows, repeat the pattern at consistent vertical intervals (e.g., y=5cm, y=8.5cm, y=12cm) with a bold label and description text box to the right of each circle.

### Aligning & Distributing Shapes

After placing multiple shapes, align and distribute them for precise layouts:

```bash
# Align specific shapes to slide center
officecli set slides.pptx "/slide[1]" --prop align=slide-center --prop "targets=shape[1],shape[2]"

# Align shapes to each other (left edges)
officecli set slides.pptx "/slide[1]" --prop align=left --prop "targets=shape[1],shape[2],shape[3]"

# Distribute shapes evenly (horizontal spacing)
officecli set slides.pptx "/slide[1]" --prop distribute=horizontal --prop "targets=shape[1],shape[2],shape[3]"

# Distribute vertically
officecli set slides.pptx "/slide[1]" --prop distribute=vertical --prop "targets=shape[2],shape[3],shape[4]"
```

Align values (shape-relative): left, center, right, top, middle, bottom
Align values (slide-relative): slide-left, slide-center, slide-right, slide-top, slide-middle, slide-bottom

Omit `targets` to apply to all shapes on the slide.

### Multi-Paragraph Text (Rich Text)

**When to use rich text vs. \\n:**

- Use `\\n` within a single `--prop text="..."` for simple same-style paragraphs
- Use paragraph/run operations when you need mixed formatting (bold heading + normal body in the same text box)

For text with mixed formatting, build paragraph by paragraph:

```bash
# Create empty text box
officecli add slides.pptx /slide[1] --type shape --prop x=2cm --prop y=5cm --prop width=20cm --prop height=10cm --prop fill=none

# Add heading paragraph
officecli add slides.pptx /slide[1]/shape[1] --type paragraph --prop text="Key Metrics" --prop bold=true --prop size=24 --prop color=1E2761 --prop font=Georgia

# Add body paragraphs
officecli add slides.pptx /slide[1]/shape[1] --type paragraph --prop text="Revenue exceeded targets by 15%" --prop size=16 --prop color=333333 --prop font=Calibri --prop list=bullet

officecli add slides.pptx /slide[1]/shape[1] --type paragraph --prop text="Customer satisfaction at all-time high" --prop size=16 --prop color=333333 --prop font=Calibri --prop list=bullet
```

For inline formatting within a paragraph, use runs:

```bash
# Add run with different styling to existing paragraph
officecli add slides.pptx /slide[1]/shape[1]/paragraph[1] --type run --prop text=" (verified)" --prop italic=true --prop color=888888 --prop size=12
```

### Pictures & Images

```bash
# Local file
officecli add slides.pptx /slide[1] --type picture --prop path=photo.jpg --prop x=2cm --prop y=4cm --prop width=14cm --prop height=10cm --prop alt="Team photo"

# HTTP URL
officecli add slides.pptx /slide[1] --type picture --prop path=https://example.com/logo.png --prop x=28cm --prop y=16cm --prop width=4cm --prop height=2cm --prop alt="Company logo"

# Base64 data URI
officecli add slides.pptx /slide[1] --type picture --prop "path=data:image/png;base64,iVBORw0KGgo..." --prop width=10cm --prop height=8cm

# Clipped to circle (for avatars)
officecli add slides.pptx /slide[1] --type picture --prop path=avatar.jpg --prop geometry=ellipse --prop width=5cm --prop height=5cm --prop alt="Profile photo"

# Clipped to rounded rectangle
officecli add slides.pptx /slide[1] --type picture --prop path=screenshot.png --prop shape=roundRect --prop x=2cm --prop y=4cm --prop width=14cm --prop height=10cm

# SVG image (native support, no rasterization needed)
officecli add slides.pptx /slide[1] --type picture --prop path=icon.svg --prop x=2cm --prop y=2cm --prop width=2cm --prop height=2cm --prop alt="Settings icon"
```

Supported formats: png, jpg, gif, bmp, tiff, emf, wmf, svg. HTTP URLs have 30s timeout.

#### Picture Cropping

```bash
# Crop all sides equally (percentage 0-100)
officecli set slides.pptx /slide[1]/picture[1] --prop crop=10

# Crop individual sides
officecli set slides.pptx /slide[1]/picture[1] --prop cropLeft=10 --prop cropRight=10 --prop cropTop=5 --prop cropBottom=5
```

#### Shape Image Fill

Fill any shape with an image (useful for textured backgrounds or image-masked shapes):

```bash
officecli set slides.pptx /slide[1]/shape[1] --prop image=texture.jpg
```

### Charts

```bash
# Column chart
officecli add slides.pptx /slide[1] --type chart --prop chartType=column --prop title="Sales" --prop categories="Q1,Q2,Q3,Q4" --prop series1="2024:100,200,150,300" --prop series2="2025:120,250,180,350" --prop x=2cm --prop y=4cm --prop width=20cm --prop height=12cm --prop colors=1E2761,CADCFC

# Pie chart
officecli add slides.pptx /slide[1] --type chart --prop chartType=pie --prop title="Market Share" --prop categories="Product A,Product B,Product C" --prop data="Share:40,35,25" --prop colors=1E2761,CADCFC,F5F5F5 --prop dataLabels=percent --prop legend=right

# Line chart
officecli add slides.pptx /slide[1] --type chart --prop chartType=line --prop title="Trend" --prop categories="Jan,Feb,Mar,Apr,May,Jun" --prop series1="Revenue:10,15,13,20,22,28" --prop axisTitle="USD (M)" --prop catTitle="Month" --prop legend=bottom --prop marker="circle:6:1E2761"

# Stacked bar
officecli add slides.pptx /slide[1] --type chart --prop chartType=barStacked --prop categories="US,EU,APAC" --prop series1="Product A:30,40,25" --prop series2="Product B:20,35,40" --prop colors=1E2761,CADCFC --prop legend=bottom

# Doughnut
officecli add slides.pptx /slide[1] --type chart --prop chartType=doughnut --prop categories="Complete,Remaining" --prop data="Progress:75,25" --prop colors=2C5F2D,E8E8E8

# Combo chart (bar + line)
officecli add slides.pptx /slide[1] --type chart --prop chartType=combo --prop categories="Q1,Q2,Q3,Q4" --prop series1="Revenue:100,200,150,300" --prop series2="Growth:10,15,12,25" --prop comboSplit=1 --prop secondary=2 --prop colors=1E2761,F96167

# Radar/spider chart
officecli add slides.pptx /slide[1] --type chart --prop chartType=radar --prop categories="Quality,Speed,Cost,Innovation,Support" --prop data="Score:8,7,6,9,8"
```

**Chart types:** column, columnStacked, columnPercentStacked, column3d, bar, barStacked, barPercentStacked, bar3d, line, lineStacked, line3d, pie, pie3d, doughnut, area, areaStacked, area3d, scatter, bubble, radar, stock, combo

#### Modern Chart Styling Recipe

Default charts look dated. Apply these properties for a clean, modern look:

```bash
officecli add slides.pptx /slide[1] --type chart \
  --prop chartType=column \
  --prop categories="Q1,Q2,Q3,Q4" \
  --prop series1="Revenue:42,58,65,78" \
  --prop x=2cm --prop y=4cm --prop width=29cm --prop height=13cm \
  --prop colors=1E2761,CADCFC \
  --prop plotFill=none \
  --prop chartFill=none \
  --prop gridlines="E2E8F0:0.5" \
  --prop dataLabels=value \
  --prop labelPos=outsideEnd \
  --prop labelFont="10:64748B:false" \
  --prop axisFont="10:64748B:Calibri" \
  --prop legendFont="10:64748B:Calibri" \
  --prop title.font=Georgia \
  --prop title.size=14 \
  --prop title.color=333333 \
  --prop series.outline="FFFFFF-0.5" \
  --prop gap=80 \
  --prop legend=bottom
```

Key styling properties:

- `plotFill=none` and `chartFill=none` -- clean transparent background
- `gridlines="E2E8F0:0.5"` -- subtle, light gridlines
- `series.outline="FFFFFF-0.5"` -- thin white border between bars
- `axisFont` and `legendFont` -- muted gray labels
- `gap=80` -- comfortable spacing between bar groups

**Note:** `gap`/`gapwidth` is ignored during `add` -- apply it separately after creation:

```bash
officecli set slides.pptx "/slide[1]/chart[1]" --prop gap=80
```

#### Multi-Series Column Chart

Include all series in the `add` command using `series1`, `series2`, etc. or the `data` prop. Both forms work in single commands and in batch mode:

```bash
# Using seriesN props
officecli add slides.pptx "/slide[1]" --type chart --prop chartType=column \
  --prop categories="Q1,Q2,Q3,Q4" \
  --prop series1="2024:42,58,65,78" \
  --prop series2="2025:51,67,74,92" \
  --prop x=2cm --prop y=4cm --prop width=29cm --prop height=13cm \
  --prop colors=1E2761,CADCFC

# Or using data prop (equivalent)
officecli add slides.pptx "/slide[1]" --type chart --prop chartType=column \
  --prop categories="Q1,Q2,Q3,Q4" \
  --prop data="2024:42,58,65,78;2025:51,67,74,92" \
  --prop x=2cm --prop y=4cm --prop width=29cm --prop height=13cm \
  --prop colors=1E2761,CADCFC
```

Batch mode:

```bash
cat <<'EOF' | officecli batch slides.pptx
[
  {"command":"add","parent":"/slide[1]","type":"chart","props":{"chartType":"column","categories":"Q1,Q2,Q3,Q4","series1":"2024:42,58,65,78","series2":"2025:51,67,74,92","x":"2cm","y":"4cm","width":"29cm","height":"13cm","colors":"1E2761,CADCFC"}}
]
EOF
```

**Important:** Once a chart is created, `set --prop data=` and `set --prop seriesN=` can only update existing series -- they cannot add new series. To add series to an existing chart, delete it and recreate with all series in the `add` command. See [editing.md](editing.md#update-charts) for the delete-and-recreate pattern.

### Tables

```bash
# Create table
officecli add slides.pptx /slide[1] --type table --prop rows=4 --prop cols=3 --prop x=2cm --prop y=5cm --prop width=29cm --prop height=12cm

# Style header row
officecli set slides.pptx /slide[1]/table[1]/tr[1] --prop c1="Metric" --prop c2="Q3" --prop c3="Q4" --prop bold=true --prop fill=1E2761 --prop color=FFFFFF

# Fill data rows
officecli set slides.pptx /slide[1]/table[1]/tr[2] --prop c1="Revenue" --prop c2="$4.2M" --prop c3="$5.1M"
officecli set slides.pptx /slide[1]/table[1]/tr[3] --prop c1="Users" --prop c2="12,400" --prop c3="15,800"
officecli set slides.pptx /slide[1]/table[1]/tr[4] --prop c1="NPS" --prop c2="72" --prop c3="81"

# Apply table style
officecli set slides.pptx /slide[1]/table[1] --prop style=medium2

# Cell-level styling
officecli set slides.pptx /slide[1]/table[1]/tr[2]/tc[3] --prop bold=true --prop color=2C5F2D

# Set font size on all cells in a row (default is 18pt -- often too large for data tables)
officecli set slides.pptx /slide[1]/table[1]/tr[2] --prop size=12 --prop font=Calibri

# Set font size on a single cell
officecli set slides.pptx /slide[1]/table[1]/tr[2]/tc[1] --prop size=11

# Set font size on the entire table at once (cascades to all cells)
officecli set slides.pptx /slide[1]/table[1] --prop size=12 --prop font=Calibri

# Merge cells
officecli set slides.pptx /slide[1]/table[1]/tr[1]/tc[1] --prop merge.right=2
```

**Table font size tip:** The default table font size is 18pt, which is too large for most data tables. Set `size=11` or `size=12` on the table after creation. **Important ordering:** Set table-level `size`/`font` **after** populating all row content. Row-level `set` commands (e.g., `set tr[1] --prop c1=...`) reset font properties on that row to defaults, overwriting any prior table-level cascade. The correct order is: (1) create table, (2) populate all rows, (3) set table-level `size`/`font`. Alternatively, include `size`/`font` in each row-level `set` command.

**Table border cascading:** Setting `border*`, `text`, `bold`, `italic`, `size`, `font`, `color`, `underline`, `strike`, `valign`, `fill` on the table path cascades to all cells. This is useful for applying uniform borders across the entire table:

```bash
# Apply uniform borders to all cells
officecli set slides.pptx /slide[1]/table[1] --prop border=CCCCCC

# Individual cell borders
officecli set slides.pptx /slide[1]/table[1]/tr[1]/tc[1] --prop border.bottom=1E2761
```

Table style presets: medium1, medium2, medium3, medium4, light1, light2, light3, dark1, dark2, none

### Connectors & Arrows

```bash
# Horizontal line
officecli add slides.pptx /slide[1] --type connector --prop x=2cm --prop y=10cm --prop width=29cm --prop height=0 --prop line=CCCCCC --prop lineWidth=1pt

# Arrow
officecli add slides.pptx /slide[1] --type connector --prop x=5cm --prop y=8cm --prop width=10cm --prop height=0 --prop tailEnd=triangle --prop line=1E2761 --prop lineWidth=2pt

# Curved connector between shapes
officecli add slides.pptx /slide[1] --type connector --prop preset=curve --prop startShape=1 --prop endShape=2 --prop line=4472C4 --prop lineWidth=1.5pt

# Dashed line
officecli add slides.pptx /slide[1] --type connector --prop x=2cm --prop y=5cm --prop width=10cm --prop height=0 --prop lineDash=dash --prop line=999999
```

Connector presets: straight, elbow, curve.
Arrow types: none, triangle, stealth, diamond, oval, arrow.

### Speaker Notes

```bash
officecli add slides.pptx /slide[1] --type notes --prop text="Key talking point: emphasize the 25% growth figure"

# Or set notes on existing slide
officecli set slides.pptx /slide[1]/notes --prop text="Discuss quarterly trends and outlook"
```

---

## Advanced Features

### Gradient Backgrounds

```bash
# Linear gradient (two colors)
officecli set slides.pptx /slide[1] --prop "background=1E2761-0D1433"

# Linear with angle
officecli set slides.pptx /slide[1] --prop "background=1E2761-0D1433-45"

# Three-color gradient
officecli set slides.pptx /slide[1] --prop "background=1E2761-4472C4-CADCFC"

# Radial gradient
officecli set slides.pptx /slide[1] --prop "background=radial:FFFFFF-1E2761-center"

# Custom stop positions
officecli set slides.pptx /slide[1] --prop "background=1E2761@0-4472C4@70-CADCFC@100"

# Image background
officecli set slides.pptx /slide[1] --prop background=image:bg.jpg
```

### Animations

Format: `EFFECT[-CLASS][-DIRECTION][-DURATION][-TRIGGER][-delay=N][-easein=N][-easeout=N]`

Segments after the effect name are identified by content, not position, so they can appear in flexible order.

```bash
# Fade entrance
officecli set slides.pptx /slide[1]/shape[1] --prop animation=fade

# Fly in from left
officecli set slides.pptx /slide[1]/shape[2] --prop animation=fly-entrance-left-400-after

# Zoom exit
officecli set slides.pptx /slide[1]/shape[3] --prop animation=zoom-exit-500-with

# With delay and easing
officecli set slides.pptx /slide[1]/shape[4] --prop animation=fade-entrance-600-after-delay=200-easein=50

# Remove animation
officecli set slides.pptx /slide[1]/shape[1] --prop animation=none
```

Effects: appear, fade, fly, zoom, wipe, bounce, float, split, wheel, spin, grow, swivel, checkerboard, blinds, bars, box, circle, diamond, dissolve, flash, plus, random, strips, wedge, bold, wave, crawl, swipe

Classes: entrance (default), exit, emphasis

Triggers: click (default for 1st on slide), after (default for subsequent), with

**Timing guidance:**

- Entrance animations: 300-500ms (fast enough to not feel sluggish)
- Emphasis: 600-800ms
- Sequential element reveals: use `after` trigger with 100-200ms delay between elements
- Avoid animating every element -- reserve animations for key data points and section reveals.

### Transitions

```bash
# Basic transitions
officecli set slides.pptx /slide[1] --prop transition=fade
officecli set slides.pptx /slide[2] --prop transition=push-left
officecli set slides.pptx /slide[3] --prop transition=wipe-right-slow

# Morph transitions (shapes with same name animate between slides)
officecli set slides.pptx /slide[2] --prop transition=morph
officecli set slides.pptx /slide[2] --prop transition=morph-byWord
officecli set slides.pptx /slide[2] --prop transition=morph-byChar

# With auto-advance
officecli set slides.pptx /slide[1] --prop transition=fade --prop advanceTime=3000 --prop advanceClick=true
```

Morph transitions automatically add `!!` prefix to shape names for cross-slide matching. Give shapes the same name on consecutive slides to pair them for morph animation. **When editing templates:** Shapes with `!!`-prefixed names (e.g., `!!bar1`, `!!dot3`) are decorative elements used for morph transitions. Leave them in place -- removing or renaming them breaks the animation. These shapes may be positioned off-screen (x>33cm) to morph-in on transition.

**Recommended pairings:**

- Title/closing slides: `fade` (clean, professional)
- Content slides: `push-left` or `wipe-right` (directional flow)
- Section dividers: `fade` or `dissolve` (signals topic change)
- Data/chart slides: `fade` (don't distract from data)
- Avoid using more than 2-3 different transition types per deck.

### 3D Effects

```bash
# 3D rotation
officecli set slides.pptx /slide[1]/shape[1] --prop "rot3d=15,30,0"

# Bevel
officecli set slides.pptx /slide[1]/shape[1] --prop bevel=circle --prop depth=5 --prop material=plastic --prop lighting=balanced

# Individual rotation axes
officecli set slides.pptx /slide[1]/shape[1] --prop rotX=20 --prop rotY=30

# Bevel with custom dimensions
officecli set slides.pptx /slide[1]/shape[1] --prop bevel=relaxedInset-8-4
```

Bevel presets: circle, relaxedInset, cross, coolSlant, angle, softRound, convex, slope, divot, riblet, hardEdge, artDeco

Materials: plastic, metal, warmMatte, matte, flat, clear, softMetal, powder, translucentPowder, darkEdge

Lighting: threePt, balanced, soft, harsh, flood, contrasting, morning, sunrise, sunset, flat, glow, brightRoom

### Motion Paths

```bash
# Diagonal motion path
officecli set slides.pptx /slide[1]/shape[1] --prop "motionPath=M 0.0 0.0 L 1.0 1.0 E-500-click"

# Remove motion path
officecli set slides.pptx /slide[1]/shape[1] --prop motionPath=none
```

Coordinates are normalized 0.0-1.0 relative to slide dimensions.

### Custom Geometry

```bash
# Triangle (coordinates in 0-100 relative space)
officecli add slides.pptx /slide[1] --type shape --prop "geometry=M 0,100 L 50,0 L 100,100 Z" --prop fill=4472C4 --prop x=5cm --prop y=5cm --prop width=10cm --prop height=8cm

# Custom arrow
officecli add slides.pptx /slide[1] --type shape --prop "geometry=M 0,40 L 60,40 L 60,0 L 100,50 L 60,100 L 60,60 L 0,60 Z" --prop fill=1E2761 --prop x=5cm --prop y=5cm --prop width=8cm --prop height=4cm
```

Syntax: M=moveTo, L=lineTo, C=cubicBezier, Q=quadBezier, Z=close. Coordinate space is 0-100.

### Text Effects

```bash
# Text shadow (on shapes with fill=none)
officecli add slides.pptx /slide[1] --type shape --prop text="Shadow Text" --prop fill=none --prop shadow="000000-4-135-2-50" --prop size=36 --prop bold=true

# Text glow
officecli add slides.pptx /slide[1] --type shape --prop text="Glow Text" --prop fill=none --prop glow="FF0000-8-75" --prop size=36

# Text gradient fill
officecli add slides.pptx /slide[1] --type shape --prop text="Gradient Text" --prop fill=none --prop textFill=FF0000-0000FF --prop size=48 --prop bold=true

# WordArt / text warp
officecli set slides.pptx /slide[1]/shape[1] --prop textWarp=textWave1
```

Shadow format: `COLOR-BLUR-ANGLE-DIST-OPACITY` (e.g., "000000-6-135-4-60")
Glow format: `COLOR-RADIUS-OPACITY` (e.g., "FF0000-8-75")

Note: When a shape has `fill=none`, shadow/glow/reflection/softEdge apply to text runs instead of the shape itself.

---

## Batch Recipes

For complex slides with many elements, use batch mode to create everything in one command.

**Shell quoting:** Use heredoc (`cat <<'EOF'`) instead of `echo '...'` when JSON values contain apostrophes, dollar signs, or other shell-special characters. Heredoc with a single-quoted delimiter prevents all shell interpolation:

```bash
cat <<'EOF' | officecli batch slides.pptx
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"It's a $5M opportunity",...}}
]
EOF
```

### Complete Title Slide (Batch)

```bash
echo '[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"1E2761"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Quarterly Review","x":"2cm","y":"5cm","width":"29.87cm","height":"4cm","font":"Georgia","size":"44","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Q4 2025 | Finance Division","x":"2cm","y":"10cm","width":"29.87cm","height":"2cm","font":"Calibri","size":"20","color":"CADCFC","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"December 2025","x":"2cm","y":"16cm","width":"29.87cm","height":"1.5cm","font":"Calibri","size":"12","color":"8899BB","align":"center","fill":"none"}}
]' | officecli batch slides.pptx
```

### Complete Stats Slide (Batch)

```bash
echo '[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"1E2761"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"By The Numbers","x":"2cm","y":"1cm","width":"29.87cm","height":"2.5cm","font":"Georgia","size":"32","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"25%","x":"2cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"CADCFC","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"Revenue Growth","x":"2cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"14","color":"8899BB","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"94%","x":"12.5cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"CADCFC","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"Customer Retention","x":"12.5cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"14","color":"8899BB","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"1.2M","x":"23cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"CADCFC","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"Active Users","x":"23cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"14","color":"8899BB","align":"center","fill":"none"}}
]' | officecli batch slides.pptx
```

### Table + Chart Slide (Batch)

```bash
echo '[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"FFFFFF"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"Performance Dashboard","x":"2cm","y":"0.5cm","width":"29.87cm","height":"2.5cm","font":"Georgia","size":"28","bold":"true","color":"1E2761","align":"left","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"chart","props":{"chartType":"column","categories":"Q1,Q2,Q3,Q4","series1":"Revenue:42,58,65,78","x":"2cm","y":"3.5cm","width":"14cm","height":"8cm","colors":"1E2761","plotFill":"none","chartFill":"none","gridlines":"E2E8F0:0.5","legend":"none","gap":"80"}},
  {"command":"add","parent":"/slide[3]","type":"table","props":{"rows":"3","cols":"4","x":"18cm","y":"3.5cm","width":"14cm","height":"8cm"}},
  {"command":"set","path":"/slide[3]/table[1]/tr[1]","props":{"c1":"Metric","c2":"Q2","c3":"Q3","c4":"Q4","bold":"true","fill":"1E2761","color":"FFFFFF"}},
  {"command":"set","path":"/slide[3]/table[1]/tr[2]","props":{"c1":"Revenue","c2":"$58M","c3":"$65M","c4":"$78M"}},
  {"command":"set","path":"/slide[3]/table[1]/tr[3]","props":{"c1":"Growth","c2":"12%","c3":"15%","c4":"20%"}}
]' | officecli batch slides.pptx
```

### Timeline / Roadmap (Batch)

Horizontal timeline with milestone circles and alternating above/below labels.

```bash
cat <<'EOF' | officecli batch slides.pptx
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"FFFFFF"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Milestones & Roadmap","x":"2cm","y":"1cm","width":"29.87cm","height":"2.5cm","font":"Georgia","size":"36","bold":"true","color":"1E2761","align":"left","fill":"none"}},
  {"command":"add","parent":"/slide[N]","type":"connector","props":{"x":"2cm","y":"10cm","width":"29.87cm","height":"0","line":"CADCFC","lineWidth":"2pt"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"ellipse","fill":"1E2761","x":"4cm","y":"8.5cm","width":"3cm","height":"3cm","line":"none"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Q1","x":"4cm","y":"8.5cm","width":"3cm","height":"3cm","fill":"none","color":"FFFFFF","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Product Launch","x":"2.5cm","y":"5.5cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"14","bold":"true","color":"1E2761","align":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"iOS & Android app\n50K users target","x":"2.5cm","y":"7cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"11","color":"8899BB","align":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"ellipse","fill":"CADCFC","x":"12cm","y":"8.5cm","width":"3cm","height":"3cm","line":"none"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Q2","x":"12cm","y":"8.5cm","width":"3cm","height":"3cm","fill":"none","color":"1E2761","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"B2B Launch","x":"10.5cm","y":"12cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"14","bold":"true","color":"1E2761","align":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Enterprise platform\n10 pilot customers","x":"10.5cm","y":"13.5cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"11","color":"8899BB","align":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"ellipse","fill":"1E2761","x":"20cm","y":"8.5cm","width":"3cm","height":"3cm","line":"none"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Q3","x":"20cm","y":"8.5cm","width":"3cm","height":"3cm","fill":"none","color":"FFFFFF","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Scale Phase","x":"18.5cm","y":"5.5cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"14","bold":"true","color":"1E2761","align":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"500K users\nEU expansion","x":"18.5cm","y":"7cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"11","color":"8899BB","align":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"ellipse","fill":"CADCFC","x":"28cm","y":"8.5cm","width":"3cm","height":"3cm","line":"none"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Q4","x":"28cm","y":"8.5cm","width":"3cm","height":"3cm","fill":"none","color":"1E2761","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Profitability","x":"26.5cm","y":"12cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"14","bold":"true","color":"1E2761","align":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"2M users\nBreak-even","x":"26.5cm","y":"13.5cm","width":"6cm","height":"1.5cm","fill":"none","font":"Calibri","size":"11","color":"8899BB","align":"center"}}
]
EOF
```

Pattern: **The horizontal connector is required** -- it is the visual spine that connects milestone circles. Without it, the milestones appear as disconnected circles. Place it at the vertical center of the milestone circles. Circle nodes at even intervals. Odd milestones labeled above the line, even milestones below. Alternating primary/secondary fill colors on circles for visual rhythm. Replace `/slide[N]` with the actual slide index.

### Conversion Funnel (Batch)

Decreasing-width trapezoids stacked vertically with centered labels.

```bash
cat <<'EOF' | officecli batch slides.pptx
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"FFFFFF"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Conversion Funnel","x":"2cm","y":"0.5cm","width":"29.87cm","height":"2.5cm","font":"Georgia","size":"36","bold":"true","color":"1E2761","align":"left","fill":"none"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"trapezoid","text":"Visitors: 48.2M","x":"4cm","y":"3.5cm","width":"26cm","height":"2.5cm","fill":"1E2761","color":"FFFFFF","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"trapezoid","text":"Product Views: 28.9M (60%)","x":"6.5cm","y":"6.5cm","width":"21cm","height":"2.5cm","fill":"2C5F2D","color":"FFFFFF","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"trapezoid","text":"Add to Cart: 8.7M (18%)","x":"9cm","y":"9.5cm","width":"16cm","height":"2.5cm","fill":"97BC62","color":"2D2D2D","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"trapezoid","text":"Checkout: 3.5M (7.3%)","x":"11cm","y":"12.5cm","width":"12cm","height":"2.5cm","fill":"D4A843","color":"FFFFFF","size":"16","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"preset":"trapezoid","text":"Purchase: 2.2M (4.6%)","x":"13cm","y":"15.5cm","width":"8cm","height":"2.5cm","fill":"8B6B00","color":"FFFFFF","size":"14","bold":"true","align":"center","valign":"center"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"Drop-off Rates","x":"27cm","y":"3.5cm","width":"5cm","height":"1.5cm","fill":"none","font":"Calibri","size":"14","bold":"true","color":"333333","align":"left"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"-40%","x":"27cm","y":"6.5cm","width":"5cm","height":"1cm","fill":"none","font":"Calibri","size":"12","color":"B85042","align":"left"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"-70%","x":"27cm","y":"9.5cm","width":"5cm","height":"1cm","fill":"none","font":"Calibri","size":"12","color":"B85042","align":"left"}},
  {"command":"add","parent":"/slide[N]","type":"shape","props":{"text":"-60%","x":"27cm","y":"12.5cm","width":"5cm","height":"1cm","fill":"none","font":"Calibri","size":"12","color":"B85042","align":"left"}}
]
EOF
```

Pattern: Each trapezoid is progressively narrower (x inset increases, width decreases). Color gradient from dark to light communicates volume reduction. Drop-off rate annotations in a column on the right. Replace `/slide[N]` with the actual slide index.

---

## Other Element Types

### Video / Audio

```bash
# Embed video with autoplay
officecli add slides.pptx /slide[1] --type video --prop path=demo.mp4 --prop x=3cm --prop y=3cm --prop width=18cm --prop height=10cm --prop autoplay=true

# Background audio
officecli add slides.pptx /slide[1] --type audio --prop path=bgm.mp3 --prop volume=50 --prop autoplay=true
```

### Equations

```bash
officecli add slides.pptx /slide[1] --type equation --prop "formula=E = mc^2" --prop x=5cm --prop y=10cm
officecli add slides.pptx /slide[1] --type equation --prop "formula=x = (-b +/- sqrt(b^2 - 4ac)) / 2a" --prop x=3cm --prop y=5cm --prop width=8cm --prop height=2cm
```

### Slide Zoom

```bash
# Add zoom element linking to slide 3
officecli add slides.pptx /slide[1] --type zoom --prop target=3 --prop x=2cm --prop y=3cm --prop returntoparent=true
```

### 3D Models

```bash
# Insert .glb 3D model
officecli add slides.pptx /slide[1] --type 3dmodel --prop path=model.glb --prop x=5cm --prop y=3cm --prop width=12cm --prop height=12cm --prop rotx=30 --prop roty=45
```

### Groups

```bash
# Group shapes 1, 2, and 3 together
officecli add slides.pptx /slide[1] --type group --prop shapes=1,2,3 --prop name="CardGroup"
```
