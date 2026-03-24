# 01-mono-line — Minimalist Lines

## Style Overview

Using ultra-thin lines and small dots to construct pure black-white minimalist space, conveying professionalism through whitespace and geometric order.

- **Scene**: Minimalist business, academic reports, consulting proposals
- **Mood**: Calm, restrained, professional
- **Tone**: Pure black-white + mid-gray accents

## Color Palette

| Name       | Hex      | Usage                                          |
| ---------- | -------- | ---------------------------------------------- |
| Pure White | `FFFFFF` | Background                                     |
| Near Black | `1A1A1A` | Main lines, title text, main dots              |
| Mid Gray   | `C8C8C8` | Secondary lines, subtitle text, secondary dots |

## Typography

| Role         | Font           | Size | Color  |
| ------------ | -------------- | ---- | ------ |
| Main Title   | Segoe UI Light | 54pt | 1A1A1A |
| Subtitle     | Segoe UI       | 20pt | C8C8C8 |
| Statement    | Segoe UI Light | 64pt | 1A1A1A |
| Numbers      | Segoe UI Light | 40pt | C8C8C8 |
| Column Title | Segoe UI Light | 28pt | 1A1A1A |
| Data Numbers | Segoe UI Light | 54pt | 1A1A1A |
| Data Label   | Segoe UI       | 16pt | C8C8C8 |

## Design Techniques

- **Ultra-thin rectangles simulate lines**: Horizontal lines height=0.05cm / 0.03cm, vertical lines width=0.05cm / 0.03cm, implemented using `rect` preset
- **Small ellipses as decorative dots**: 1cm / 0.8cm `ellipse`, black or gray
- **Abundant whitespace**: Only lines divide space on white background
- **Morph animation**: Lines slide and stretch to change length and position between pages; dots drift to new positions
- **Off-canvas hidden elements**: Text elements initially placed outside canvas (x=36cm), slide into view through morph

## Scene Elements

6 scene elements with different positions on each page, animated through Morph transitions:

| Name             | preset  | fill   | Typical Size  | Description               |
| ---------------- | ------- | ------ | ------------- | ------------------------- |
| `!!line-h-top`   | rect    | 1A1A1A | 20cm x 0.05cm | Horizontal main line      |
| `!!line-h-mid`   | rect    | C8C8C8 | 15cm x 0.03cm | Horizontal secondary line |
| `!!line-v-left`  | rect    | 1A1A1A | 0.05cm x 12cm | Vertical main line        |
| `!!line-v-right` | rect    | C8C8C8 | 0.03cm x 8cm  | Vertical secondary line   |
| `!!dot-accent-1` | ellipse | 1A1A1A | 1cm x 1cm     | Main dot                  |
| `!!dot-accent-2` | ellipse | C8C8C8 | 0.8cm x 0.8cm | Secondary dot             |

## Page Structure

5 pages total, Slides 2-5 set `transition=morph`:

| Slide   | Type               | Elements                                                                         | Description |
| ------- | ------------------ | -------------------------------------------------------------------------------- | ----------- |
| Slide 1 | Hero               | Large title + subtitle left-aligned, lines construct asymmetric framework        |
| Slide 2 | Statement          | Centered large text statement, lines intersect at center of canvas               |
| Slide 3 | 3-Column Pillars   | Lines as column dividers, numbered 01/02/03 + titles, three columns side by side |
| Slide 4 | Metrics / Evidence | Data display, left large numbers + right metrics, lines divide areas             |
| Slide 5 | CTA / Closing      | Lines converge into canvas border frame, centered CTA text + contact info        |

## Reference Script

Complete build script available in `build.sh`.
**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (Hero)** — Demonstrates initial layout of lines+dots and placement of off-canvas text elements
- **Slide 3 (Pillars)** — How lines transform into column dividers, grid arrangement of three columns of content
- **Slide 5 (CTA)** — Animation effect of lines converging into full-canvas border frame

No need to read all — skim 2-3 representative slides.
