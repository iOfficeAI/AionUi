# 10 Candy Stripe — Rainbow Candy Stripes

## Style Overview

Six full-width rainbow stripes slide, stretch, and gather across pages on white background, creating festive joyful atmosphere.

- **Scene**: Celebrations, festivals, children's education, creative marketing
- **Mood**: Joyful, lively, festive, rainbow
- **Tone**: White base, six-color rainbow accents

## Color Palette

| Name         | Hex     | Usage            |
| ------------ | ------- | ---------------- |
| Pure White   | #FFFFFF | Page background  |
| Candy Red    | #FF5252 | Rainbow stripe 1 |
| Orange       | #FF7B39 | Rainbow stripe 2 |
| Lemon Yellow | #FFD740 | Rainbow stripe 3 |
| Mint Green   | #69F0AE | Rainbow stripe 4 |
| Sky Blue     | #40C4FF | Rainbow stripe 5 |
| Violet       | #7C4DFF | Rainbow stripe 6 |
| Title Black  | #1A1A1A | Title text       |
| Body Gray    | #555555 | Body text        |

## Typography

| Element       | Font           | Size    |
| ------------- | -------------- | ------- |
| Main Title    | Segoe UI Black | 54-64pt |
| Data Numbers  | Segoe UI Black | 48-72pt |
| Column Title  | Segoe UI Black | 28-40pt |
| Body/Subtitle | Segoe UI       | 16-28pt |

## Design Techniques

- **Full-width rainbow stripes**: 6 full-width rect (width=34cm), creating visual rhythm through y position and height changes only
- **Vertical sliding**: Stripes slide up and down between pages, morph produces smooth vertical movement
- **Stretch variation**: Stripe height changes from 2cm (evenly spread) to 0.3cm (compressed into thin lines) to 8cm (expanded into large color block backgrounds)
- **Opacity adjustment**: 0.12 (faded as card background) to 0.85 (normal display) to 1.0 (deepened when compressed)
- **Functional transformation**: S1 evenly distributed → S2 compressed into top color bar → S3 becomes three-column card backgrounds → S4 blue expands as data background → S5 gathers into bottom gradient color bar

## Scene Elements

| Name              | Type | Description                      |
| ----------------- | ---- | -------------------------------- |
| `!!stripe-red`    | rect | Red full-width rainbow stripe    |
| `!!stripe-orange` | rect | Orange full-width rainbow stripe |
| `!!stripe-yellow` | rect | Yellow full-width rainbow stripe |
| `!!stripe-green`  | rect | Green full-width rainbow stripe  |
| `!!stripe-blue`   | rect | Blue full-width rainbow stripe   |
| `!!stripe-purple` | rect | Purple full-width rainbow stripe |

## Page Structure (5 pages)

| Slide | Type      | Elements                                                                                                 | Description |
| ----- | --------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| S1    | hero      | Cover — 6 rainbow stripes evenly distributed (3.4cm spacing), centered title                             |
| S2    | statement | Statement — 6 stripes compressed to top 4cm forming color title bar, white space below for text          |
| S3    | pillars   | Three-column — stripes paired into three column card backgrounds (red+orange, yellow+green, blue+purple) |
| S4    | evidence  | Data — blue stripe expands to 8cm high data background, other stripes retreat to top and bottom edges    |
| S5    | cta       | Closing — stripes gather at bottom forming inverted rainbow gradient footer                              |

## Reference Script

Complete build script available in `build.sh`.

**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (hero)** — Initial even layout of 6 rainbow stripes
- **Slide 2 (statement)** — Stripe compression effect, understanding height and y position change logic
- **Slide 4 (evidence)** — Technique for expanding single stripe into large area background

No need to read all — skim 2-3 representative slides.
