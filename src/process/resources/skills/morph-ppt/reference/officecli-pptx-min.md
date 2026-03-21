---
name: officecli-commands
description: OfficeCli Command Reference — PPT generation and validation commands
---

# OfficeCli PPT Command Reference

## 0) Install & Update

```bash
# Check if installed
officecli --version

# Not installed -> Install (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash

# Not installed -> Install (Windows PowerShell)
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.ps1 | iex

# Already installed -> Update to latest (same command)
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
```

## 1) Query Command Usage (dynamic; always matches the current version)

**Prefer CLI help for the latest syntax** — do not rely on the snapshot below:

```bash
officecli pptx set    # View all PPT set properties
officecli pptx add    # View all PPT add types
officecli help        # General help
```

If you need a full reference but CLI help is insufficient, consult the official wiki:
https://github.com/iOfficeAI/OfficeCli/wiki/agent-guide

## 2) Morph-Specific Knowledge (unique to this skill)

### Morph Pairing Mechanism

- `transition=morph` achieves morph animation through shape name matching
- **Adjacent slides must have shapes with the same names** for morph to produce smooth transitions
- If adjacent slides have completely different shape names -> only fade in/out, no morph animation
- **Best practice**: define all actors on slide 1 (with fixed names like `!!dot-main`), then clone and adjust properties on subsequent slides
- Shapes not needed on a slide -> move off-screen (ghost); do not delete

### Morph Variants

```
transition=morph          # Match by object (default, most common)
transition=morph-byWord   # Match by word (word-by-word text animation)
transition=morph-byChar   # Match by character (character-by-character text animation)
```

### Pitfalls (Important! Common Errors)

**Coordinates**:

- **Negative coordinates are not supported** (`x=-3cm` will error); use `x=36cm` uniformly for ghosting
- After creating a file, you must `add slide` first; otherwise you get "Slide not found"

**Path indexing**:

- **Name-based indexing is not supported**: `/slide[1]/shape[dot-main]` will error
- **Only numeric indexing works**: `/slide[1]/shape[3]`
- To find a shape's index by name, first run `officecli get <file> '/slide[1]' --depth 1`

**Parameter format**:

- **Standalone arguments are not supported**: `--name "!!bg-glow1"` will error (Unrecognized argument)
- **All properties go through `--prop`**: `--prop name="!!bg-glow1"`
- All officecli properties (name, text, fill, x, y, etc.) must use the `--prop key=value` format

**File names**:

- officecli supports Chinese file names, but some shell environments may have encoding issues
- If you encounter garbled Chinese file names -> switch to English names (e.g., `AionUI-Intro.pptx`)

**Animations**:

- Do not add entrance animations by default (each animation adds one extra click)
- If an entrance is truly needed, use the `with` trigger: `animation=fade-entrance-300-with`

### Shell Script Rules (CRITICAL — read before generating any commands)

**⚠️ TOP 3 MOST COMMON ERRORS**:

1. **XPath only supports numeric indexing — NEVER use name-based indexing**
   - ✅ `'/slide[1]/shape[3]'` (numeric index)
   - ❌ `'/slide[1]/shape[@name="dot-main"]'` (will error)
   - To find a shape's index by name: `officecli get <file> '/slide[1]' --depth 1`

2. **Negative coordinates are NOT supported**
   - ❌ `x=-3cm` (will error)
   - ✅ `x=36cm` (ghost position, off right edge of canvas)

3. **ALL properties use `--prop key=value`** — no standalone arguments
   - ✅ `--prop name="!!bg-glow1"`
   - ❌ `--name "!!bg-glow1"` (Unrecognized argument)

**`set` command rules** (used for slide-by-slide generation):

4. **Path wrapping**: Wrap XPath in single quotes
   - ✅ `'/slide[1]/shape[2]'`
   - ❌ `/slide[1]/shape[2]` (shell may expand brackets)

5. **Property value wrapping**: Wrap values in double quotes
   - ✅ `--prop text="Hello World"`
   - ❌ `--prop text=Hello World` (shell splits on space)

6. **Multi-line text**: Do NOT use `\n` inside `--prop text="..."`
   - ✅ `--prop text="Line 1\\nLine 2"` (escaped) or split into multiple text boxes
   - ❌ `--prop text="Line 1\nLine 2"` (shell parsing error)

7. **Line continuation**: NO trailing spaces after `\`

**`batch` JSON rules** (only if you choose to use batch — individual `set` commands are preferred):

8. **Boolean values MUST be strings**
   - ✅ `{"props":{"bold":"true"}}`
   - ❌ `{"props":{"bold":true}}` (officecli rejects non-string values)

9. **Escape quotes in JSON strings**
   - ✅ `{"props":{"text":"It\\'s working"}}`
   - ❌ `{"props":{"text":"It's working"}}` (breaks JSON)

## 3) Command Reference

**Prefer running `officecli pptx set/add` for the latest syntax**

### Create & Add

```bash
officecli create deck.pptx
officecli add deck.pptx '/' --type slide --prop layout=blank --prop background=FFFFFF --prop transition=morph
officecli add deck.pptx '/slide[1]' --type shape --prop text="Hello" --prop preset=ellipse --prop fill=FF0000 --prop x=4cm --prop y=3cm --prop width=10cm --prop height=5cm
officecli add deck.pptx '/slide[1]' --type picture --prop path=photo.jpg --prop width=12cm
officecli add deck.pptx '/slide[1]' --type chart --prop chartType=column --prop categories="Q1,Q2" --prop data="Sales:100,200"
officecli add deck.pptx '/slide[1]' --type table --prop rows=3 --prop cols=4
officecli add deck.pptx '/slide[1]' --type connector --prop preset=straight --prop line=FF0000
officecli add deck.pptx '/slide[1]/shape[1]' --type paragraph --prop text="New para" --prop align=center
officecli add deck.pptx '/slide[1]/shape[1]' --type run --prop text=" bold" --prop bold=true --prop color=FF0000
officecli add deck.pptx '/slide[1]' --type group --prop shapes=1,2,3
officecli add deck.pptx '/slide[1]' --type equation --prop "formula=E = mc^2"
officecli add deck.pptx '/slide[1]' --type video --prop path=demo.mp4 --prop autoplay=true
officecli add deck.pptx '/slide[1]' --type zoom --prop target=3
officecli add deck.pptx '/slide[1]' --type notes --prop text="Speaker notes"
officecli add deck.pptx '/' --from '/slide[1]'  # clone
```

### Modify

```bash
officecli set deck.pptx '/slide[1]/shape[1]' --prop text="New" --prop fill=0000FF --prop opacity=0.5
officecli set deck.pptx '/slide[2]' --prop transition=morph --prop background=080A1F
officecli move deck.pptx '/slide[3]' --index 0
officecli remove deck.pptx '/slide[2]/shape[5]'
```

### Batch

```bash
echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Hi","fill":"FF0000","x":"2cm","y":"3cm","width":"8cm","height":"4cm"}},
  {"command":"set","path":"/slide[2]","props":{"transition":"morph"}}
]' | officecli batch deck.pptx
```

### Inspect

```bash
officecli validate deck.pptx
officecli view deck.pptx outline
officecli get deck.pptx '/slide[1]' --depth 2
```

## 4) Element Types & Key Properties

### Supported Element Types

| Type        | Purpose          | Parent                             |
| ----------- | ---------------- | ---------------------------------- |
| slide       | Slide            | /                                  |
| shape       | Shape / text box | /slide[N]                          |
| picture     | Image            | /slide[N]                          |
| chart       | Chart            | /slide[N]                          |
| table       | Table            | /slide[N]                          |
| connector   | Connector line   | /slide[N]                          |
| group       | Grouped shapes   | /slide[N]                          |
| video/audio | Video / audio    | /slide[N]                          |
| equation    | Math formula     | /slide[N]                          |
| zoom        | Slide zoom       | /slide[N]                          |
| notes       | Speaker notes    | /slide[N]                          |
| paragraph   | Paragraph        | /slide[N]/shape[M]                 |
| run         | Text run         | /slide[N]/shape[M] or paragraph[P] |

### Shape Properties

| Category  | Properties                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Position  | x, y, width, height, rotation, flipH, flipV                                                                                        |
| Fill      | fill, gradient, image, opacity                                                                                                     |
| Border    | line, lineWidth, lineDash, lineOpacity                                                                                             |
| Text      | text, font, size, bold, italic, underline, strikethrough, color, textFill, textGradient, spacing, baseline, superscript, subscript |
| Alignment | align, valign, margin, lineSpacing, spaceBefore, spaceAfter, indent, marginLeft, marginRight, list                                 |
| Geometry  | preset (ellipse/rect/roundRect/triangle/...), geometry (SVG path)                                                                  |
| 3D        | rot3d, rotX, rotY, rotZ, bevel, bevelTop, bevelBottom, depth, material, lighting                                                   |
| Effects   | shadow, glow, reflection, textWarp, softEdge                                                                                       |
| Animation | animation, motionPath                                                                                                              |
| Other     | name, zorder, autoFit, link                                                                                                        |

### Animation Format

```
Format: EFFECT[-DIRECTION][-DURATION][-TRIGGER][-delay=N][-easein=N][-easeout=N]

Examples:
animation=flyIn-left-300-after-delay=200-easein=50
animation=fade-entrance-400-with
animation=zoom-exit-500-click
animation=none
```

### Motion Path Format

```
Format: M x y L x y E[-DURATION[-TRIGGER[-delay=N][-easing=N]]]
Coordinates: 0.0-1.0 normalized

Examples:
motionPath=M 0.0 0.0 L 1.0 1.0 E-500-click
motionPath=none
```

### Chart Properties

Labels: labelPos, labelFont
Gridlines: gridlines, minorGridlines
Fill: plotFill, chartFill
Markers: marker/markers
Style: style (1-48)
Transparency: transparency, opacity
Secondary axis: secondaryAxis
Title: title.font, title.size, title.color, title.bold, title.glow, title.shadow
Fonts: legendfont, axisfont
Series: series.shadow, series.outline
Column chart: gapwidth, overlap
3D: view3d/camera/perspective

### Slide Properties

background: color / gradient / image
transition: morph, fade, wipe, push, split, vortex, switch, flip, ripple, glitter, prism, flash, honeycomb
advanceTime, advanceClick
align: align shapes (slide-center, slide-left, slide-right, slide-top, slide-middle, slide-bottom)
distribute: distribute shapes (horizontal, vertical)

### Picture Properties

path, alt, x, y, width, height
crop, cropLeft, cropTop, cropRight, cropBottom

### Table Properties

rows, cols, style
Cell: text, fill, image, border.\*, gridSpan, rowSpan
