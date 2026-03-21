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

### Command Rules (read before generating any commands)

**Syntax essentials**:

1. **All properties use `--prop key=value`**: `--prop name="!!bg-glow1"` (not `--name "!!bg-glow1"`)
2. **XPath uses numeric indexing only**: `'/slide[1]/shape[3]'` (not `'/slide[1]/shape[@name="dot-main"]'`)
3. **Wrap XPath in single quotes**: `'/slide[1]/shape[2]'`
4. **Wrap property values in double quotes**: `--prop text="Hello World"`
5. **Coordinates start at 0cm** — ghost position is `x=36cm` (right of canvas)
6. **After creating a file**, `add slide` first — otherwise "Slide not found"

**Shell script rules** (for build.sh generation):

7. **Multi-line text**: use `\\n` (escaped), or split into multiple text boxes
8. **Line continuation `\`**: no trailing spaces after the backslash
9. **Chinese file names** may cause encoding issues in some shells — use English names if needed (e.g., `AionUI-Intro.pptx`)

**Batch JSON rules** (if using `officecli batch`):

10. **Boolean values must be strings**: `{"props":{"bold":"true"}}` (not `{"bold":true}`)
11. **Escape quotes inside JSON strings**: `{"props":{"text":"It\\'s working"}}`

### Shape Index Management

Shape indices are determined by creation order on each slide. Key behaviors:

- **After clone**: the new slide inherits all shapes with the same indices as the source
- **After `add`**: new shapes get the next index (e.g., if slide has 8 shapes, new shape is `shape[9]`)
- **After `remove`**: subsequent shapes shift down (e.g., removing `shape[3]` makes old `shape[4]` become `shape[3]`)

**To check current indices**, run:
```bash
officecli get <file> '/slide[N]' --depth 1
```
This shows all shapes with their names and indices — use it before writing `set` commands.

### Troubleshooting

When a command fails:

1. **Read the error message** — officecli errors are descriptive (e.g., "Unrecognized argument", "Slide not found")
2. **Inspect the current state**: `officecli get <file> '/slide[N]' --depth 1`
3. **Check command syntax**: `officecli pptx set` or `officecli pptx add` for the latest property reference
4. **Common fixes**:
   - "Slide not found" → `add slide` first
   - "Unrecognized argument" → use `--prop key=value` format
   - Shape not where expected → run `get` to verify indices

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
