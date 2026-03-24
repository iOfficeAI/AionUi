# S15-blueprint-grid — Engineering Blueprint Grid

## Style Overview

Deep blue background with white grid lines and gold markers creates a precise engineering drafting aesthetic.

- **Scene**: Technical planning, engineering blueprints, system architecture
- **Mood**: Precise, professional, engineering-oriented
- **Color Tone**: Deep blue + white grid + gold accents

## Color Palette

| Name         | Hex    | Usage                        |
| ------------ | ------ | ---------------------------- |
| Deep Blue    | 1B3A5C | Background                   |
| Bright Blue  | 4A90D9 | Highlight color, titles      |
| White        | FFFFFF | Grid lines, body text        |
| Gold Warning | E8C547 | Warning markers, CTA buttons |

## Design Techniques

- Use rect to draw evenly spaced horizontal/vertical grid lines (opacity 0.25), simulating blueprint graph paper
- Use ellipse as positioning marker points, suggesting key nodes in a coordinate system
- All shapes use low transparency overlay to maintain blueprint hierarchy
- Typography uses monospace or bold sans-serif fonts to reinforce engineering drafting aesthetic

## Reference Script

Full build script available in `build.sh`.
**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (hero)** — Grid line drawing method and layout spacing
- **Slide 3 (pillars)** — Multi-column layout + grid-aligned typesetting technique
  No need to read all — skim 2-3 representative slides.
