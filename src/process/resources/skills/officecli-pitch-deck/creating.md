<!-- officecli: v1.0.24 -->

# Creating a Pitch Deck

Complete guide for building professional pitch presentations from scratch. Follow the workflow: decide structure, set up, build slides pattern-by-pattern, polish, QA.

For general pptx building blocks (shapes, pictures, rich text, animations, batch syntax), see [pptx creating.md](../officecli-pptx/creating.md). This document focuses on pitch-deck-specific patterns and recipes.

---

## Section A: Decision Logic

### A.1 Deck Type Selection

| Deck Type        | Slides | When to Use                           | Recommended Slide Sequence                                                                                       |
| ---------------- | ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Seed Pitch       | 6      | Pre-seed/seed, < $1M, early metrics   | Title, Problem+Solution, Market, Traction, Team, Ask                                                             |
| Product Launch   | 8      | Feature announcement, product release | Title, Problem, Features, Before/After, Demo, Results, Pricing, CTA                                              |
| Full Investor    | 10-12  | Series A+, significant traction       | Title, Problem, Solution, Market, Product, Traction, Business Model, Competitive, Roadmap, Team, Financials, Ask |
| Enterprise Sales | 10     | B2B, C-level audience, data-heavy     | Title, Threat/Problem, Solution, Architecture, ROI, Case Study, Competitive, Impact, Timeline, Next Steps        |

These are starting points. **Respect the user's slide count** -- never pad to a longer deck. Adapt the sequence to the user's specific request.

### A.2 Color Palette Reference

Define palette as shell variables before building. All subsequent commands reference variables.

**Professional Navy** (investor decks):

```bash
PRIMARY="0F2B46"; SECONDARY="1A73E8"; ACCENT1="34A853"; ACCENT2="F9AB00"; DARK="0A1628"; LIGHT="F0F4F8"
```

**Tech Purple** (product launches):

```bash
PRIMARY="6C2BD9"; SECONDARY="1DB954"; ACCENT1="FF6B35"; ACCENT2="00B4D8"; DARK="1A1A2E"; LIGHT="F8F7FF"
```

**Dark Premium** (enterprise sales):

```bash
PRIMARY="0D0D1A"; SECONDARY="00D4AA"; ACCENT1="FF4757"; ACCENT2="FFA502"; ACCENT3="2ED573"; LIGHT_TEXT="E8E8E8"; MUTED="6B7B8D"
```

If the user provides specific colors, use those. If not, select the closest palette and adapt.

### A.3 Font Pairing

| Element        | Font                     | Size    |
| -------------- | ------------------------ | ------- |
| Slide title    | Georgia, bold            | 32-44pt |
| Section header | Georgia or Calibri, bold | 18-24pt |
| Body text      | Calibri                  | 14-16pt |
| Stat number    | Georgia, bold            | 36-64pt |
| Stat label     | Calibri                  | 12-14pt |
| Caption/footer | Calibri                  | 10-12pt |

---

## Section B: Setup

### B.1 Create File and Set Metadata

```bash
officecli create deck.pptx
officecli set deck.pptx / --prop title="Deck Title" --prop author="Author Name"
```

### B.2 Define Color Palette

```bash
# Example: Professional Navy
PRIMARY="0F2B46"
SECONDARY="1A73E8"
ACCENT1="34A853"
ACCENT2="F9AB00"
DARK="0A1628"
LIGHT="F0F4F8"
```

### B.3 Resident Mode (Optional, 3+ Commands)

```bash
officecli open deck.pptx        # Keep in memory
# ... build slides ...
officecli close deck.pptx       # Save and release
```

---

## Section C: Slide Patterns

Each pattern includes: visual description, positioning table, and batch template skeleton. Replace placeholder text, colors, and data with scenario content. **Add speaker notes after each slide is built.** **Never use the same pattern on two consecutive slides.**

> **Vertical centering:** When a slide has fewer elements than the pattern maximum, adjust y-positions downward by 2-3cm to center the visual weight. The positions in these patterns assume maximum content.

### C.1 Title / Cover (Dark Gradient)

3-4 text shapes on gradient background. Slide 1 in all decks. Transition: `fade`.

| Element | X   | Y    | Width   | Height | Font/Size         |
| ------- | --- | ---- | ------- | ------ | ----------------- |
| Title   | 2cm | 5cm  | 29.87cm | 4cm    | Georgia bold 44pt |
| Tagline | 2cm | 10cm | 29.87cm | 2cm    | Calibri 20pt      |
| Footer  | 2cm | 13cm | 29.87cm | 1.5cm  | Calibri 12pt      |

Background: `"$DARK-$DARK2-180"` (linear gradient). See SKILL.md Quick Start for full batch template.

### C.2 Stat Callout Row (3-Stat)

Title + 3 number/label pairs. Numbers: Georgia bold 64pt. Labels: Calibri 14pt, muted.

| Stat | Number X | Label X | Width | Number Y | Label Y |
| ---- | -------- | ------- | ----- | -------- | ------- |
| 1    | 2cm      | 2cm     | 9cm   | 5cm      | 9.5cm   |
| 2    | 12.5cm   | 12.5cm  | 9cm   | 5cm      | 9.5cm   |
| 3    | 23cm     | 23cm    | 9cm   | 5cm      | 9.5cm   |

Title at y=1cm, height 3cm. Number height 4cm, label height 2cm.

### C.3 Stat Callout Row (4-Stat)

Same as C.2 but 4 columns. Numbers: Georgia bold 60pt.

Stat X positions: 1.5cm, 9.5cm, 17.5cm, 25.5cm. Width: 7cm each.

> **HARD RULE: At 60pt in 7cm width, stat values must be 4 characters or fewer for dollar-amount patterns containing both `$` and `.` (e.g., `$9.4M` is 5 chars but the wide `$` and `.` glyphs in Georgia bold make it effectively 6 — it WILL wrap). Safe dollar patterns: `$9M`, `$96B`, `$4K` (3-4 chars). For non-dollar values, 5 characters is the limit (e.g., "340%", "4.2m", "12.3" are safe). Values of 6+ characters (e.g., "197min", "3 Days") WILL wrap to 2 lines and destroy the stat callout. For longer values: (a) reduce font to 44-48pt, (b) abbreviate (e.g., "197m" instead of "197min", "$9M" instead of "$9.4M"), or (c) use the wider 3-stat layout (C.2, 9cm per stat). Single tokens only — no spaces.**

### C.4 Chart + Context (Chart Left, Stats Right)

Chart on left 55%, stat callouts stacked on right. Post-batch: `officecli set "/slide[N]/chart[1]" --prop gap=80` for column/bar.

| Element | X    | Y    | Width   | Height                     |
| ------- | ---- | ---- | ------- | -------------------------- |
| Title   | 2cm  | 1cm  | 29.87cm | 3cm                        |
| Chart   | 2cm  | 4cm  | 17cm    | 13cm                       |
| Stats   | 21cm | 4cm+ | 11cm    | 2.5cm number + 1.2cm label |

Stat spacing: ~3.7cm per pair. For 5 stats, use size=44pt.

### C.5 Icon-in-Circle Grid (3-Row Vertical)

3 rows at y=4.5cm, 8.5cm, 12.5cm. Each: ellipse 2.5x2.5cm at x=2cm + text overlay (same pos) + label at x=5.5cm (bold 18pt, width 25cm) + description below (14pt, muted). 13 elements total.

### C.6 Icon-in-Circle Grid (5-Across Horizontal)

5 icons at x=1.5, 7.5, 13.5, 19.5, 25.5cm. Circle 2x2cm at y=5cm. Label below at y+2.5cm, desc at y+4cm, width 5cm each. 21 elements -- use batch. Post-placement: `distribute=horizontal` for precision.

### C.7 Two-Column Split

Problem+solution, before/after. Card backgrounds (roundRect) first, then text on top.

| Element       | X      | Y     | Width  | Height |
| ------------- | ------ | ----- | ------ | ------ |
| Left card bg  | 2cm    | 4.5cm | 14.5cm | 13cm   |
| Left header   | 3cm    | 5cm   | 12.5cm | 2cm    |
| Left body     | 3cm    | 7.5cm | 12.5cm | 9cm    |
| Right card bg | 17.5cm | 4.5cm | 14.5cm | 13cm   |
| Right header  | 18.5cm | 5cm   | 12.5cm | 2cm    |
| Right body    | 18.5cm | 7.5cm | 12.5cm | 9cm    |

### C.8 Comparison Table (Full-Width)

Title (2cm, 1cm) + table (2cm, 4.5cm, 29.87cm x 13cm). See Section E for construction.

### C.9 Flow Diagram (Connectors)

4-node: x=1, 8.5, 16, 23.5cm. Width 6cm, y=8cm, height 3cm.
5-node: x=0.5, 7, 13.5, 20, 26.5cm. Width 5.5cm.

Title = shape[1]. Flow shapes start at shape[2]. Add all shapes BEFORE connectors. Connectors work within the same batch.

> **Connector reliability:** Add connectors in a separate batch AFTER all node shapes are created. Verify each connector is visible. If batch connectors are unreliable, add them one at a time with individual `add` commands.

### C.10 Timeline / Roadmap (Horizontal)

Spine: connector at y=10cm, full width. 4 milestones (3x3cm circles) at x=4, 12, 20, 28cm, y=8.5cm. Alternating above/below labels: odd at y=5.5cm/7cm, even at y=12cm/13.5cm. ~19 elements -- single batch (reliable).

Add the spine connector first:

```bash
officecli add deck.pptx "/slide[N]" --type connector --prop preset=straight --prop startX=2cm --prop startY=10cm --prop endX=32cm --prop endY=10cm --prop line=$SECONDARY --prop lineWidth=2pt
```

### C.11 Avatar Grid

**2x2**: circles at (6cm, 4.5cm), (20cm, 4.5cm), (6cm, 12.5cm), (20cm, 12.5cm). Size 3.5x3.5cm.
**3-row**: circles at x=4.5, 15.5, 26.5cm, y=5cm. Size 3x3cm.

Each member: ellipse + initials overlay + name (bold 14pt) + role (11pt) = 4 elements. Name width 6cm centered.

### C.12 Closing / CTA (Dark Gradient)

Mirror slide 1 gradient. Main CTA (44-48pt) at y=4cm, details (16pt) at y=9cm, contact (12pt) at y=15cm. Transition: `fade`.

---

## Section D: Charts

### D.0 Chart Styling Baseline (Mandatory)

Apply to EVERY chart. No default PowerPoint styling is acceptable.

**Light theme** (white/light backgrounds):

```
plotFill=none, chartFill=none, gridlines="E2E8F0:0.5",
axisFont="10:64748B:Calibri", legendFont="10:64748B:Calibri",
series.outline="FFFFFF-0.5", legend=bottom
```

**Dark theme** (dark backgrounds):

```
plotFill=none, chartFill=none, gridlines="2A2A4A:0.5",
axisFont="10:6B7B8D:Calibri", legendFont="10:6B7B8D:Calibri",
series.outline="FFFFFF-0.5", legend=bottom
```

> **`gap` MUST be set via a separate `set` command after chart creation. It is ignored during `add`.**

### D.1 Column Chart (Single Series)

```bash
officecli add deck.pptx "/slide[N]" --type chart \
  --prop chartType=column --prop title="Quarterly ARR ($K)" \
  --prop categories="Q1,Q2,Q3,Q4" --prop series1="ARR:1400,1720,2060,2400" \
  --prop x=2cm --prop y=4cm --prop width=18cm --prop height=13cm \
  --prop colors=1A73E8 --prop plotFill=none --prop chartFill=none \
  --prop "gridlines=E2E8F0:0.5" --prop dataLabels=value --prop labelPos=outsideEnd \
  --prop "labelFont=10:64748B:false" --prop "axisFont=10:64748B:Calibri" \
  --prop "legendFont=10:64748B:Calibri" --prop "series.outline=FFFFFF-0.5" --prop legend=bottom
officecli set deck.pptx "/slide[N]/chart[1]" --prop gap=80
```

All subsequent chart recipes include the same D.0 baseline props. Only type-specific differences are noted.

### D.2 Multi-Series Column

Same as D.1 but with `series1` + `series2` and two colors. Post-creation `gap=80` required.

> **Empty series values are not supported.** Use `0` for missing data points: `series1="Actual:1400,1720,2060,2400,0,0,0,0"` / `series2="Projected:0,0,0,0,3000,3800,4700,5800"`. Note: this produces zero-height bars instead of gaps. For true gap visualization, use separate charts.

### D.3 Doughnut

`chartType=doughnut`, `data="Rating:42,38,14,4,2"`, `dataLabels=percent`, `legend=right`. No `gap` step needed. Use 5 colors from strong to muted.

> **Known limitation: The `colors` parameter may not apply to doughnut charts.** PowerPoint may render doughnut segments in default Office colors instead of specified colors. This is a CLI limitation. Verify colors via screenshot after creation. If colors are wrong, there is currently no workaround.

### D.4 Combo Chart (Dual-Axis) -- HIGHEST RISK

> Both `comboSplit=1` AND `secondary=2` are REQUIRED. Missing either causes incorrect rendering.

> **HARD RULE: Before creating a combo chart, verify that both series use similar ranges (e.g., both 0-100 or both 0-10). If ranges differ by more than 10x (e.g., $M values vs % values), DO NOT use a combo chart. Instead, create two separate side-by-side charts: a bar chart for the absolute values and a line chart for the percentages. Place them using pattern C.4 (chart left + stats right) or use two 50% width charts.**

**Single combo chart (ONLY when both series have similar ranges):**

```bash
officecli add deck.pptx "/slide[N]" --type chart \
  --prop chartType=combo --prop categories="Year 0,Year 1,Year 2,Year 3" \
  --prop "series1=Cost Savings ($M):-0.8,1.2,2.8,3.5" \
  --prop "series2=Cumulative ROI (%):-100,50,250,340" \
  --prop comboSplit=1 --prop secondary=2 \
  --prop colors=00D4AA,FFA502 \
  --prop plotFill=none --prop chartFill=none --prop "gridlines=2A2A4A:0.5" \
  --prop "axisFont=10:6B7B8D:Calibri" --prop "legendFont=10:6B7B8D:Calibri" \
  --prop "series.outline=FFFFFF-0.5" --prop legend=bottom \
  --prop x=2cm --prop y=4cm --prop width=29cm --prop height=13cm
officecli set deck.pptx "/slide[N]/chart[1]" --prop gap=80
```

`comboSplit=1` = first series as bars, rest as lines. `secondary=2` = series 2 on secondary Y-axis.

**Two-Chart Alternative (REQUIRED when ranges differ by >10x):**

Use two separate charts side by side instead of a single combo chart. This avoids the dual-axis scale mismatch that makes the smaller series invisible.

```bash
# Left chart: bar chart for absolute values (55% width)
officecli add deck.pptx "/slide[N]" --type chart \
  --prop chartType=column --prop title="Cost Savings ($M)" \
  --prop categories="Year 0,Year 1,Year 2,Year 3" \
  --prop "series1=Cost Savings:-0.8,1.2,2.8,3.5" \
  --prop colors=00D4AA \
  --prop plotFill=none --prop chartFill=none --prop "gridlines=2A2A4A:0.5" \
  --prop "axisFont=10:6B7B8D:Calibri" --prop "legendFont=10:6B7B8D:Calibri" \
  --prop "series.outline=FFFFFF-0.5" --prop legend=bottom \
  --prop x=2cm --prop y=4cm --prop width=15cm --prop height=13cm
officecli set deck.pptx "/slide[N]/chart[1]" --prop gap=80

# Right chart: line chart for percentages (45% width)
officecli add deck.pptx "/slide[N]" --type chart \
  --prop chartType=line --prop title="Cumulative ROI (%)" \
  --prop categories="Year 0,Year 1,Year 2,Year 3" \
  --prop "series1=ROI:-100,50,250,340" \
  --prop colors=FFA502 \
  --prop plotFill=none --prop chartFill=none --prop "gridlines=2A2A4A:0.5" \
  --prop "axisFont=10:6B7B8D:Calibri" --prop "legendFont=10:6B7B8D:Calibri" \
  --prop "series.outline=FFFFFF-0.5" --prop legend=bottom \
  --prop x=18cm --prop y=4cm --prop width=14cm --prop height=13cm
```

### D.5 Radar Chart

`chartType=radar`, 3 series via `series1`/`series2`/`series3`. Position: x=4cm, width=26cm, height=14cm. Include D.0 dark-theme baseline. No `gap` step needed.

### D.6 Stacked Area Chart

`chartType=areaStacked`, 3 series. Position: x=2cm, width=17cm, height=13cm. Include D.0 light-theme baseline. No `gap` step needed.

---

## Section E: Tables

> **CONSTRUCTION ORDER (violating this produces inconsistent fonts):**
>
> 1. Create table (`add --type table`)
> 2. Populate all rows with `set tr[N]`
> 3. Set table-level `size`/`font`/`border`
> 4. Apply cell-level styling (`fill`, `bold` only -- NOT cell-level `color`)

> **Cell-level `color` produces validation errors.** Use row-level `color` when populating rows. For cell-level styling, use only `fill` and `bold`.

### E.1 Comparison Table

```bash
officecli add deck.pptx "/slide[N]" --type table \
  --prop rows=7 --prop cols=5 --prop x=2cm --prop y=4.5cm --prop width=29.87cm --prop height=13cm
officecli set deck.pptx "/slide[N]/table[1]/tr[1]" \
  --prop c1="Feature" --prop c2="DataFlow" --prop c3="Fivetran" --prop c4="Airbyte" --prop c5="Stitch" \
  --prop bold=true --prop fill=0F2B46 --prop color=FFFFFF --prop size=12
officecli set deck.pptx "/slide[N]/table[1]/tr[2]" \
  --prop c1="No-code setup" --prop c2="Yes" --prop c3="Partial" --prop c4="No" --prop c5="Partial" --prop size=11
# ... populate remaining rows, then table-level font ...
officecli set deck.pptx "/slide[N]/table[1]" --prop size=11 --prop font=Calibri --prop border=E0E0E0
# Highlight "your product" column: cell-level fill + bold only (NO cell-level color)
officecli set deck.pptx "/slide[N]/table[1]/tr[2]/tc[2]" --prop fill=E8F0FE --prop bold=true
```

### E.2 Pricing Table (3-Tier)

Same create -> populate -> table-level font -> cell-level fill pattern. 6 rows x 4 cols. Header: `fill=$PRIMARY, color=FFFFFF, bold, size=14`. Recommended column: highlight header cell `fill=F9AB00`, body cells `fill=F0EEFF` (fill only, no cell-level color).

### E.3 Financial Impact Table (with Cell Merge)

```bash
officecli add deck.pptx "/slide[N]" --type table \
  --prop rows=10 --prop cols=4 --prop x=2cm --prop y=5cm --prop width=29.87cm --prop height=13cm
# Header
officecli set deck.pptx "/slide[N]/table[1]/tr[1]" \
  --prop c1="" --prop c2="Without" --prop c3="With" --prop c4="Improvement" \
  --prop bold=true --prop fill=00D4AA --prop color=0D0D1A --prop size=12
# Section header: populate THEN merge
officecli set deck.pptx "/slide[N]/table[1]/tr[2]" \
  --prop c1="INCIDENT METRICS" --prop bold=true --prop fill=1A1A3E --prop color=00D4AA --prop size=11
officecli set deck.pptx "/slide[N]/table[1]/tr[2]/tc[1]" --prop merge.right=3
# Data rows, more section headers, then table-level styling...
officecli set deck.pptx "/slide[N]/table[1]" --prop size=11 --prop font=Calibri --prop border=2A2A4A
```

`merge.right=3` merges tc[1] with 3 cells to its right (4-column span). After merge, only set content on tc[1]. See H-5 for validation warning.

---

## Section F: Visual Polish

### F.1 Gradient Backgrounds

```bash
# Linear 2-color with angle
officecli add deck.pptx / --type slide --prop layout=blank --prop "background=0F2B46-0A1628-180"

# Radial gradient
officecli add deck.pptx / --type slide --prop layout=blank --prop "background=radial:0D0D1A-1A1A3E-center"

# Linear 3-color (no custom stops)
officecli set deck.pptx "/slide[N]" --prop "background=1E2761-4472C4-CADCFC"
```

> **Custom gradient stop positions (`@` syntax) are NOT supported for slide backgrounds.** Both `add` and `set` fail with "Invalid color value" when using `C1@0-C2@70-C3@100` on slide backgrounds. Use simple 2-color or 3-color gradients. The `@` syntax works only on shape `gradient` fills (e.g., `--prop "gradient=FF0000@0-FFFF00@50-00FF00@100"` on a shape).

### F.2 Transitions

```bash
# Title and closing slides
officecli set deck.pptx "/slide[1]" --prop transition=fade
officecli set deck.pptx "/slide[N]" --prop transition=fade

# Content slides
officecli set deck.pptx "/slide[2]" --prop transition=push-left
```

Use at most 2-3 transition types per deck. Dark themes may use `fade` throughout.

### F.3 Entrance Animations (Case Study Reveals Only)

Use sparingly -- only for sequential stat reveals on case study slides.

```bash
# First stat: click-triggered
officecli set deck.pptx "/slide[N]/shape[2]" --prop animation=fade-entrance-400-click

# Subsequent stats: auto-after with 200ms delay
officecli set deck.pptx "/slide[N]/shape[3]" --prop animation=fade-entrance-400-after-delay=200
officecli set deck.pptx "/slide[N]/shape[4]" --prop animation=fade-entrance-400-after-delay=200
```

Transitions and animations coexist without conflict.

### F.4 z-Order Management

Add background shapes first, content shapes second to avoid z-order changes. If needed: `--prop zorder=back` / `zorder=front`. Warning: z-order changes renumber shape indices -- process highest index first.

### F.5 Connectors

Add all shapes BEFORE connectors. Title = shape[1], flow shapes start at shape[2]. Connectors can reference shapes from the same batch.

```bash
officecli add deck.pptx "/slide[N]" --type connector \
  --prop preset=elbow --prop startShape=2 --prop endShape=3 \
  --prop line=1A73E8 --prop lineWidth=2pt --prop tailEnd=triangle
```

### F.6 Align and Distribute

```bash
officecli set deck.pptx "/slide[N]" --prop distribute=horizontal --prop "targets=shape[2],shape[4],shape[6]"
officecli set deck.pptx "/slide[N]" --prop align=bottom --prop "targets=shape[2],shape[4],shape[6]"
```

---

## Section G: QA Checklist

Run before every delivery.

### Automated

```bash
# Must return zero errors (see H-5 for cell merge exception)
officecli validate deck.pptx

# Check for issues
officecli view deck.pptx issues
```

### Manual Verification

- [ ] `officecli validate` = 0 errors (exception: cell merge slides may report schema warnings)
- [ ] Every chart is editable in PowerPoint (click -> Edit Data appears)
- [ ] Every table is a native table object (click -> table editing mode)
- [ ] No two consecutive slides share the same layout structure
- [ ] Speaker notes on every content slide (all except title and closing), >= 2 sentences each
- [ ] All text fully visible (no overflow, no overlap, no off-slide)
- [ ] At least one slide has 3+ stat callouts with number >= 36pt and label <= 16pt
- [ ] Gradient background on both slide 1 and last slide
- [ ] Color palette consistent across all slides (no random/default colors)
- [ ] On dark-background slides, verify all text uses light colors (no default black text)
- [ ] Charts use modern styling (plotFill=none, chartFill=none, subtle gridlines)

---

## Section H: Known Bugs & Lessons

> **Read these before building. Each one has caused production failures.**
>
> **HARD RULE items are non-negotiable -- violation produces broken output. WARNING items are strong guidance that should be followed unless you have a specific reason not to. Known limitation items cannot be worked around.**

| #    | Issue                                                      | Workaround                                                                                                           |
| ---- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| H-1  | `gap` ignored during chart `add`                           | Apply via `officecli set "/slide[N]/chart[1]" --prop gap=80` after creation                                          |
| H-2  | Table font cascade overwritten by row `set`                | Set table-level `size`/`font` AFTER all rows populated                                                               |
| H-3  | Shell `$` in batch JSON (e.g., `$10M`)                     | Use heredoc: `cat <<'EOF' \| officecli batch`                                                                        |
| H-4  | Combo chart requires both `comboSplit=1` AND `secondary=2` | Missing either causes incorrect rendering. Always include both                                                       |
| H-5  | Cell merge (`merge.right=N`) produces validation errors    | PowerPoint renders correctly. Note in delivery message                                                               |
| H-6  | Cell-level `color` on table cells causes validation errors | Use row-level `color` instead; cell-level `fill` + `bold` only                                                       |
| H-7  | Custom gradient stops (`@`) fail on slide backgrounds      | Use 2/3-color gradients. `@` syntax works only on shape `gradient` fills                                             |
| H-8  | Connector shape indices: title = shape[1]                  | Flow shapes start at shape[2]. Count from first shape on slide                                                       |
| H-9  | z-order changes cause shape index renumbering              | Process highest index first. Re-query with `get --depth 1` if needed                                                 |
| H-10 | Chart series count fixed at creation                       | Include ALL series in `add`. To add series, delete and recreate                                                      |
| H-11 | Dark theme text invisible (defaults to black)              | Explicitly set light `color` on every text shape on dark backgrounds                                                 |
| H-12 | zsh glob-expands `[N]` in paths                            | Always double-quote: `"/slide[1]/chart[1]"`                                                                          |
| H-13 | Batch threshold                                            | Reliable for up to ~20 operations per batch. Split larger batches into groups of 15-20. Heredoc syntax mandatory     |
| H-14 | Connector arrows may not all render in batch               | Add connectors in separate batch after shapes. If still missing, add one at a time                                   |
| H-15 | Doughnut chart `colors` parameter may not apply            | CLI accepts the parameter without error but PowerPoint renders default colors. No workaround. Verify via screenshot. |
| H-16 | Empty table cell string `c1=""` causes validation error    | Use a space character `c1=" "` instead of empty string for blank cells                                               |
