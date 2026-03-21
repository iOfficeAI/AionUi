# 02 Playful Blocks — Building Block Paradise

## Style Overview

Colorful rounded rectangles scattered, rotated, and reorganized like building blocks on warm beige background, full of playfulness and creativity.

- **Scene**: Children's education, creative workshops, team building
- **Mood**: Warm, lively, playful, Lego-style
- **Tone**: Warm base, colorful building block colors

## Color Palette

| Name         | Hex     | Usage             |
| ------------ | ------- | ----------------- |
| Warm Beige   | #FFF8F0 | Page background   |
| Block Red    | #FF4444 | Main blocks, dots |
| Block Blue   | #3388FF | Blocks, dots      |
| Block Yellow | #FFCC00 | Blocks, dots      |
| Block Green  | #44BB44 | Blocks            |
| Block Orange | #FF8833 | Blocks            |
| Title Dark   | #2D2D2D | Title text        |
| Body Gray    | #666666 | Body text         |

## Typography

| Element       | Font           | Size    |
| ------------- | -------------- | ------- |
| Main Title    | Segoe UI Black | 54-72pt |
| Data Numbers  | Segoe UI Black | 48pt    |
| Column Title  | Segoe UI Black | 28-40pt |
| Body/Subtitle | Segoe UI       | 16-28pt |

## Design Techniques

- **Rounded building blocks**: 5 roundRect as colorful blocks, scattered in four corners and edges of canvas
- **Dot decorations**: 3 ellipse as small dots, semi-transparent, adding liveliness
- **Scatter and rotation**: Blocks move and rotate significantly (5-15 degrees) between pages, morph produces "flying and reorganizing" block effect
- **Functional transformation**: S1 scattered in corners → S2 rotated and gathered to edges → S3 becomes three-column card backgrounds (opacity reduced to 0.12) → S4 becomes data block backgrounds (opacity 0.3-0.5) → S5 returns to scattered with rotation
- **Transparency layering**: 0.5-1.0 as decoration, reduced to 0.12-0.5 as content backgrounds

## Scene Elements

| Name             | Type      | Description           |
| ---------------- | --------- | --------------------- |
| `!!block-red`    | roundRect | Red building block    |
| `!!block-blue`   | roundRect | Blue building block   |
| `!!block-yellow` | roundRect | Yellow building block |
| `!!block-green`  | roundRect | Green building block  |
| `!!block-orange` | roundRect | Orange building block |
| `!!dot-red`      | ellipse   | Red dot decoration    |
| `!!dot-blue`     | ellipse   | Blue dot decoration   |
| `!!dot-yellow`   | ellipse   | Yellow dot decoration |

## Page Structure (5 pages)

| Slide | Type      | Elements                                                                               | Description |
| ----- | --------- | -------------------------------------------------------------------------------------- | ----------- |
| S1    | hero      | Cover — blocks scattered in corners, centered large title                              |
| S2    | statement | Statement — blocks rotated and gathered to edges and bottom, centered large title      |
| S3    | pillars   | Three-column — blocks become three-column light card backgrounds, three content groups |
| S4    | evidence  | Data — blocks become semi-transparent data block backgrounds, three large numbers      |
| S5    | cta       | Closing — blocks return to scattered + rotation, call to action                        |

## Reference Script

Complete build script available in `build.sh`.

**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (hero)** — Initial scattered positions of 8 scene actors
- **Slide 3 (pillars)** — How blocks transform into three-column card backgrounds, understanding opacity + size changes
- **Slide 5 (cta)** — Rotation angle settings for blocks returning to scattered state

No need to read all — skim 2-3 representative slides.
