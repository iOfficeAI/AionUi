# Bauhaus Color Block — Geometric Grid

## Style Overview

Bold modernist design inspired by Bauhaus movement. Features flat solid color blocks in geometric grid compositions, high-contrast typography, and signature Bauhaus elements (stacked circles, vertical bar clusters). Perfect for creative studios, branding agencies, and portfolio presentations.

- **Scenario**: Creative studios, design portfolios, branding agencies, architectural firms, art galleries
- **Mood**: Bold, modernist, geometric, artistic, confident
- **Tone**: Cream background with forest green, amber, tangerine, and dark accents

## Color Palette

| Name       | Hex     | Usage                           |
| ---------- | ------- | ------------------------------- |
| Background | #F0EBE0 | Warm cream canvas               |
| Forest     | #1D5C38 | Deep green for primary blocks   |
| Amber      | #F4C040 | Golden yellow for accents       |
| Tangerine  | #E06828 | Orange for secondary blocks     |
| Teal       | #1B6060 | Dark teal for variation         |
| Dark       | #1E1818 | Near-black for headers and text |
| White      | #FFFFFF | White for text on dark blocks   |
| Dim        | #888878 | Muted grey for supporting text  |

## Typography

| Element        | Font           | Size             |
| -------------- | -------------- | ---------------- |
| Hero title     | Segoe UI Black | 40pt             |
| Stats          | Segoe UI Black | 48pt             |
| Section labels | Segoe UI       | 10pt (uppercase) |
| Body           | Segoe UI       | 11-13pt          |

## Design Techniques

- **Flat color mosaic**: Rect blocks in solid colors with no gradients or shadows
- **Bauhaus signature elements**:
  - 3 stacked circles with progressive opacity (0.90 → 0.70 → 0.50)
  - Vertical bar cluster (0.5cm width bars in alternating colors)
- **Geometric grid layouts**: Asymmetric divisions creating visual rhythm
- **High-contrast flat typography**: Bold black text on colored blocks or vice versa
- **Stat badges**: Rounded rect buttons with bold numbers
- **!!panel morph actor**: Large rect that transforms across slides (right-block → top-stripe → left-col → top-band → accent-bar → full-slide)

## Page Structure (7 slides)

| Slide | Type       | !!panel Position                      | Description                                                  |
| ----- | ---------- | ------------------------------------- | ------------------------------------------------------------ |
| 1     | hero       | Right block (13.5cm-28.37cm)          | Mosaic: left content / right color grid with stacked circles |
| 2     | grid       | Top stripe (full-width, 2.8cm height) | 2×2 stat cards in forest/amber/tangerine/teal                |
| 3     | pillars    | Left column (0-12.5cm)                | Forest left panel + 4 feature rows right                     |
| 4     | comparison | Top band (8cm height)                 | Amber top band + 2-column content below                      |
| 5     | timeline   | Vertical accent bar (4cm width)       | Tangerine left bar + 3-step process right                    |
| 6     | hero       | Full slide (33.87cm width)            | Complete forest background                                   |
| 7     | cta        | Full forest background                | Call to action with centered content                         |

## Key Morph Patterns

- **!!panel actor**: Main geometric block that morphs through dramatic transformations:
  1. S1: Right block (14.87×16.55cm) with stacked circles
  2. S2: Top stripe (33.87×2.8cm) header
  3. S3: Left column (12.5cm width, full height)
  4. S4: Top band (33.87×8cm)
  5. S5: Vertical accent bar (4×19.05cm, left edge)
  6. S6: Full slide (33.87×19.05cm)
  7. S7: Full slide (maintained)

- **Position changes**: Panel moves from right → top → left → top → left → full
- **Size changes**: From partial block → thin stripe → column → band → narrow bar → full canvas
- **Color consistency**: Panel stays forest green across all transformations

## Bauhaus Signature Elements

1. **3 Stacked Circles** (S1, S4):
   - Cream ellipses with progressive opacity (0.90, 0.70, 0.50)
   - Overlapping placement creating depth
   - Positioned on forest green background

2. **Vertical Bar Cluster** (S1, S5):
   - 0.5cm width bars in alternating colors (cream, amber, cream, tangerine)
   - 1.9cm height, 1cm spacing
   - Creates rhythmic visual accent

3. **Rounded Rect Badges**:
   - Stat badges with bold numbers
   - High contrast: forest/dark background + white/cream text

## Grid Compositions

- **Mosaic Grid** (S1): Asymmetric division with multiple rect blocks
- **2×2 Grid** (S2): Four equal stat cards with consistent padding
- **Left-Right Split** (S3): 12.5cm left column + remaining right content
- **Top-Bottom Split** (S4): 8cm top band + lower content area

## Reference Script

Complete build script available in `build.py` (Python with officecli).

**Recommended slides to read for core techniques**:

- **Slide 1 (hero)** — mosaic composition with stacked circles and bar cluster
- **Slide 2 (grid)** — 2×2 stat cards with !!panel as thin top stripe
- **Slide 3 (pillars)** — left panel with numbered feature rows and ellipse badge system
