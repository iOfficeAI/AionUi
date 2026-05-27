# 09 Diagonal Cut — Industrial Diagonal Cut

## Style Overview

Bold diagonal rectangle cuts and sharp lines on a near-black background create an industrial sense of power.

- **Scene**: Industrial, engineering, architecture, manufacturing
- **Mood**: Rugged, powerful, industrial, bold
- **Color Tone**: Dark background, high-contrast warm accent colors

## Color Palette

| Name              | Hex     | Usage                                            |
| ----------------- | ------- | ------------------------------------------------ |
| Near Black        | #1A1A1A | Page background                                  |
| Industrial Orange | #FF6600 | Primary accent color, diagonal strips, cut lines |
| Pure White        | #FFFFFF | Title text, secondary diagonal strips            |
| Warning Yellow    | #FFCC00 | Secondary accent color, diagonal strips          |
| Dark Gray         | #333333 | Secondary diagonal strips                        |
| Light Gray        | #CCCCCC | Body/subtitle text                               |

## Typography

| Element        | Font           | Size    |
| -------------- | -------------- | ------- |
| Main Title     | Segoe UI Black | 64-72pt |
| Data Numbers   | Segoe UI Black | 48-64pt |
| Section Titles | Segoe UI Black | 28-40pt |
| Body/Subtitle  | Segoe UI       | 14-24pt |

## Design Techniques

- **Diagonal rectangles**: 4 large rect elements rotated 30-45 degrees spanning across the canvas, creating diagonal cut effects
- **Cut lines**: 2 ultra-thin rects (height 0.1-0.15cm) crossing the full width, simulating industrial cutting marks
- **Circle decorations**: 2 ellipses as corner accents, balancing geometric composition
- **Morph choreography**: Diagonal strips rotate 20-25 degrees + shift 8-12cm between pages, producing dynamic "cut-flip" effects; Slide 3 diagonal strips transform into nearly vertical column dividers, creating a "scattered → orderly" transformation
- **Transparency layering**: Primary colors 0.85-0.9, secondary colors 0.15-0.3, gray 0.5-0.7, creating depth hierarchy

## Scene Elements

| Name             | Type              | Description                                               |
| ---------------- | ----------------- | --------------------------------------------------------- |
| `!!slash-orange` | rect              | Primary orange diagonal strip, largest and most prominent |
| `!!slash-white`  | rect              | White semi-transparent diagonal strip, creating depth     |
| `!!slash-yellow` | rect              | Yellow diagonal strip, secondary accent                   |
| `!!slash-gray`   | rect              | Dark gray diagonal strip, adding layers                   |
| `!!cut-line-1`   | rect (ultra-thin) | Orange crossing cut line                                  |
| `!!cut-line-2`   | rect (ultra-thin) | White semi-transparent cut line                           |
| `!!dot-orange`   | ellipse           | Orange circle decoration                                  |
| `!!dot-yellow`   | ellipse           | Yellow circle decoration                                  |

## Page Structure (5 pages)

| Slide | Type      | Elements                                                                                     | Description |
| ----- | --------- | -------------------------------------------------------------------------------------------- | ----------- |
| S1    | hero      | Cover — diagonal strips scattered + centered large title "CUT THROUGH"                       |
| S2    | statement | Statement — diagonal strips rotate and shift significantly + centered text                   |
| S3    | pillars   | Three columns — diagonal strips become nearly vertical column dividers, three-column content |
| S4    | evidence  | Data — diagonal strips asymmetrically frame data, three groups of large numbers              |
| S5    | cta       | Closing — diagonal strips return to scattered diagonal orientation, call to action           |

## Reference Script

Full build script available in `build.sh`.

**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (hero)** — Initial layout and rotation angles of 8 scene actors
- **Slide 3 (pillars)** — How diagonal strips transform into nearly vertical column dividers, understanding morph transformation magnitude

No need to read all — skim 2-3 representative slides.
