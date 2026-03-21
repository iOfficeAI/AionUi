# 12 Duotone Split — Duotone Split

## Style Overview

Charcoal and terracotta dual-color panels split the canvas in different proportions, morph produces "shifting canvas" effect.

- **Scene**: Brand launches, architectural design, high-end presentations
- **Mood**: Bold, architectural feel, high-end, minimalist
- **Tone**: Dual-color contrast (deep dark + warm color), white dividers

## Color Palette

| Name          | Hex     | Usage                          |
| ------------- | ------- | ------------------------------ |
| Pure White    | #FFFFFF | Page background, divider lines |
| Charcoal Gray | #2D3436 | Dark panel                     |
| Terracotta    | #E17055 | Warm panel                     |

## Typography

| Element       | Font           | Size    |
| ------------- | -------------- | ------- |
| Main Title    | Segoe UI Black | 40-64pt |
| Data Numbers  | Segoe UI Black | 48-64pt |
| Column Title  | Segoe UI Black | 28pt    |
| Body/Subtitle | Segoe UI Light | 16-24pt |

## Design Techniques

- **Dual-panel split**: Two large rect (!!panel-dark + !!panel-warm) cover entire canvas, split in different proportions
- **White divider line**: 0.3cm wide white rect as precise divider between two panels
- **Split proportion changes**: S1 left-right 50/50 → S2 top-bottom 70/30 → S3 left-right 30/70 → S4 diagonal rotation → S5 top-bottom 80/20
- **Morph choreography**: Massive changes in panel size and position produce "shifting canvas" effect, divider line follows movement
- **Rotation variation**: S4 panels rotated -8 degrees, breaking orthogonal layout for added dynamism
- **Restrained decoration**: Only 2 semi-transparent dots + 1 ultra-thin line, maintaining minimalism

## Scene Elements

| Name             | Type              | Description                                |
| ---------------- | ----------------- | ------------------------------------------ |
| `!!panel-dark`   | rect              | Charcoal main panel                        |
| `!!panel-warm`   | rect              | Terracotta warm panel                      |
| `!!divider`      | rect (0.3cm)      | White panel divider line                   |
| `!!accent-dot-1` | ellipse           | White semi-transparent decorative dot      |
| `!!accent-dot-2` | ellipse           | Terracotta semi-transparent decorative dot |
| `!!accent-line`  | rect (ultra-thin) | White semi-transparent decorative line     |

## Page Structure (5 pages)

| Slide | Type      | Elements                                                                                                        | Description |
| ----- | --------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| S1    | hero      | Cover — left-right 50/50 split, title on dark panel                                                             |
| S2    | statement | Statement — top-bottom 70/30 split (dark occupies top 70%), centered large title                                |
| S3    | pillars   | Three-column — left-right 30/70 (narrow dark left column + wide warm right column), three pillars on warm panel |
| S4    | evidence  | Data — panels rotated -8 degrees forming diagonal split, data scattered across both panels                      |
| S5    | cta       | Closing — top-bottom 80/20 (dark occupies top 80%), call to action centered                                     |

## Reference Script

Complete build script available in `build.sh`.

**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (hero)** — Initial layout of 6 scene actors, understanding panel + divider line structure
- **Slide 4 (evidence)** — Panel rotation + diagonal split implementation

No need to read all — skim 2-3 representative slides.
