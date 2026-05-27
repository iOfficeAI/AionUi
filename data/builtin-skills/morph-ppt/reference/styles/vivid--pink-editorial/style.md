# Pink Editorial — Gradient Stats

## Style Overview

Contemporary editorial design with dark purple to dusty rose gradient background. Features massive bold numbers (100-200pt) as visual anchors, simulated grain texture, and dramatic morph transitions. Perfect for data-driven annual reports and statistical presentations.

- **Scenario**: Annual reports, statistical showcases, editorial publications, data journalism, executive summaries
- **Mood**: Contemporary, editorial, sophisticated, data-driven
- **Tone**: Dark purple-pink gradient with high-contrast white typography

## Color Palette

| Name           | Hex                               | Usage                              |
| -------------- | --------------------------------- | ---------------------------------- |
| Background     | #160B33 → #7B2D52 (gradient 135°) | Dark purple to dusty rose          |
| Primary accent | #C85080                           | Pink for gradient overlays         |
| Secondary      | #FF8DB8                           | Acid pink for accent dots          |
| Blush          | #E8A0BC                           | Light pink for decorative elements |
| Primary text   | #FFFFFF                           | White for main text                |
| Secondary text | #C090A8                           | Dimmed pink for supporting text    |
| Cream          | #F5E8F0                           | Off-white for descriptions         |

## Typography

| Element      | Font           | Size      |
| ------------ | -------------- | --------- |
| Hero numbers | Segoe UI Black | 160-200pt |
| Title        | Segoe UI Black | 28-36pt   |
| Stat numbers | Segoe UI Black | 52-64pt   |
| Body         | Segoe UI       | 14-22pt   |

## Design Techniques

- **Massive editorial numbers**: 73%, 99.2% at 160-200pt size as hero elements
- **Gradient overlays**: Semi-transparent rect with gradients (opacity 0.35-0.40)
- **Simulated grain**: 11 scattered white ellipses at 0.04 opacity for texture
- **Morph actors**: `!!num-sweep` (rect/ellipse) and `!!accent-dot` (ellipse) transform across slides
- **Dual gradient system**: Pink-purple and purple-pink for visual variety
- **High typography contrast**: White bold text on dark gradient background

## Page Structure (6 slides)

| Slide | Type       | Description                                        |
| ----- | ---------- | -------------------------------------------------- |
| 1     | hero       | Massive "73%" with full-width gradient sweep       |
| 2     | evidence   | "99.2%" stat, accent dot moves to top-left         |
| 3     | comparison | Left gradient panel + right text (editorial split) |
| 4     | grid       | 4 stat blocks with gradient backgrounds, 2×2 grid  |
| 5     | quote      | Large quotation with circular gradient overlay     |
| 6     | cta        | Call to action with full-screen gradient return    |

## Key Morph Patterns

- **!!num-sweep**: Transforms from full-width rect → narrower rect → large ellipse (opacity 0.06) → ellipse (opacity 0.28) → large ellipse → full-gradient
- **!!accent-dot**: Acid pink ellipse that moves: bottom-right (5.5cm) → top-left (4cm) → mid-right (3cm) → embedded in grid (5.5cm) → left (4cm) → center
- **Gradient direction changes**: Alternates between 90°, 135°, 45° for visual variety
- **Size drama**: Numbers scale from 200pt → 160pt → 52-64pt grid

## Special Effects

- **Grain texture function**: Adds 11 white ellipses at random positions, 0.04 opacity on every slide for analog feel
- **Gradient actor animation**: Semi-transparent gradient rects morph in position, size, and opacity
- **Typography as decoration**: Massive numbers serve dual purpose as content and visual structure

## Reference Script

Complete build script available in `build.py` (Python with officecli).

**Recommended slides to read for core techniques**:

- **Slide 1 (hero)** — massive 200pt number with full-width gradient sweep and grain texture
- **Slide 4 (grid)** — 4-block stats layout with embedded gradient actors and nested ellipses
- **Slide 5 (quote)** — large circular gradient overlay with quotation mark typography
