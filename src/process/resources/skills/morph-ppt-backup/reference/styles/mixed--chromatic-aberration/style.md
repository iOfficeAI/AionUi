# Chromatic Aberration — CRT RGB Split

## Style Overview

Dramatic tech-creative design simulating CRT monitor chromatic aberration effect. Uses ultra-dark navy background with cyan and hot pink offset text layers that morph from tight alignment to maximum spread and back. Perfect for tech startups, AI platforms, and creative technology showcases.

- **Scenario**: Tech startups, AI platforms, creative technology, developer tools, futuristic product launches
- **Mood**: Futuristic, glitch aesthetic, high-tech, edgy, cyber
- **Tone**: Ultra-dark with neon cyan and hot pink accents

## Color Palette

| Name         | Hex     | Usage                                        |
| ------------ | ------- | -------------------------------------------- |
| Background   | #050814 | Ultra-dark navy (almost black)               |
| Background 2 | #0A1030 | Slightly lighter navy for variation          |
| Cyan         | #00F5E4 | Bright cyan for aberration layer and accents |
| Pink         | #FF0066 | Hot pink for aberration layer and accents    |
| White        | #FFFFFF | White for main text layer                    |
| Dim          | #334466 | Dark blue-grey for lines and dividers        |
| Pale         | #8899CC | Light blue-grey for supporting text          |

## Typography

| Element        | Font           | Size             |
| -------------- | -------------- | ---------------- |
| Hero title     | Segoe UI Black | 68pt             |
| Section labels | Segoe UI       | 10pt (uppercase) |
| Stats          | Segoe UI Black | 18pt             |
| Body           | Segoe UI       | 13-14pt          |

## Design Techniques

- **Triple-layer text**: Same text rendered 3 times with horizontal offsets (pink left, cyan right, white center)
- **Animated aberration**: Offset distance morphs across slides (0.3cm → 1.5cm → 4cm → 0cm → vertical shift → converge)
- **Ghost text as actors**: Cyan and pink layers are actual morph actors (`!!cyan-layer`, `!!pink-layer`) with semi-transparent opacity (0.20-0.45)
- **Minimal decoration**: Thin horizontal lines (0.10cm height) in cyan/pink
- **CRT/glitch aesthetic**: Simulates analog RGB color separation
- **Opacity variation**: Aberration layers fade in/out (0.20-0.45) as they spread/collapse

## Page Structure (6 slides)

| Slide | Type      | Aberration Pattern | Description                                  |
| ----- | --------- | ------------------ | -------------------------------------------- |
| 1     | hero      | Tight (±0.3cm)     | Opening with company name, minimal split     |
| 2     | statement | Spread (±1.5cm)    | Product intro, aberration widens             |
| 3     | statement | Maximum (±4cm)     | Technology, ghostly CRT effect at peak split |
| 4     | evidence  | Collapsed (0cm)    | Metrics, all layers converge (no aberration) |
| 5     | statement | Vertical shift     | Pricing, aberration shifts to Y-axis         |
| 6     | cta       | Reconverge (0cm)   | Call to action, perfect alignment returns    |

## Key Morph Patterns

- **!!pink-layer**: Pink ghost text that moves left as aberration spreads
  - S1: x=1.7cm (tight left) → S2: x=0.5cm → S3: x=0cm (maximum left) → S4: x=2cm (converged) → S5: y=4cm (vertical shift) → S6: x=2cm (reconverged)

- **!!cyan-layer**: Cyan ghost text that moves right as aberration spreads
  - S1: x=2.3cm (tight right) → S2: x=3.5cm → S3: x=6cm (maximum right) → S4: x=2cm (converged) → S5: y=2cm (vertical shift) → S6: x=2cm (reconverged)

- **White main text**: Always centered at x=2cm (anchor point)

- **Opacity dynamics**: As aberration spreads, opacity decreases (0.45 → 0.35 → 0.22) for ghostly effect; increases when converged

## Aberration Stages

1. **Tight** (S1): ±0.3cm offset, opacity 0.40-0.45 — subtle RGB split
2. **Spread** (S2): ±1.5cm offset, opacity 0.35 — noticeable separation
3. **Maximum** (S3): ±4cm offset, opacity 0.20-0.22 — extreme CRT glitch, white text also semi-transparent (0.90)
4. **Collapsed** (S4): All layers at x=2cm, opacity 0.35 — perfect alignment, effect "resolved"
5. **Vertical** (S5): Horizontal converged, vertical offset (y diff) — axis shift
6. **Reconverged** (S6): All layers perfectly aligned — clarity restored

## Technical Notes

- **Morph actors are text shapes**: The pink and cyan layers are actual text boxes with `!!` prefix names, not decorative shapes
- **Stacking order**: Pink (bottom) → Cyan (middle) → White (top) for proper layering
- **Thin accent lines**: 0.10cm height rects in cyan/pink provide minimal structure
- **Dark background essential**: Ultra-dark (#050814) makes neon colors pop and aberration effect visible

## Reference Script

Complete build script available in `build.py` (Python with officecli).

**Recommended slides to read for core techniques**:

- **Slide 1 (hero)** — triple-layer text setup with tight aberration (±0.3cm)
- **Slide 3 (statement)** — maximum aberration spread (±4cm) with opacity fade for ghostly CRT effect
- **Slide 5 (statement)** — vertical axis shift demonstrating aberration can move in Y dimension
