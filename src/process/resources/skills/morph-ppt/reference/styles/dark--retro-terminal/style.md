# Retro Terminal — Retro Terminal

## Style Overview

Terminal black background + phosphor green text + monospace fonts, simulating CRT terminal interface.

- **Scene**: Developer conferences, tech talks, hackathons, programming education
- **Mood**: Geeky, retro, technical, mysterious
- **Color Tone**: Pure black + phosphor green

## Color Palette

| Name           | Hex     | Usage                                  |
| -------------- | ------- | -------------------------------------- |
| Terminal Black | #0D1117 | Page background                        |
| Terminal Green | #00FF41 | Primary color (text, lines, code rows) |
| Bright Green   | #39FF14 | Accent color (cursor, highlights)      |
| Panel Green    | #1A3A1A | Terminal window background             |

## Typography

| Element | Font             | Description                        |
| ------- | ---------------- | ---------------------------------- |
| Title   | Courier New 44pt | Monospace font, terminal aesthetic |
| Body    | Courier New      | All text uses monospace            |

## Design Techniques

- **Terminal window**: Dark green panel (#1A3A1A) + green thin border, simulating terminal window
- **Code rows**: Ultra-thin rects (0.3cm height) + low opacity green, simulating code lines
- **Cursor**: Small rect (0.4×0.8cm) high opacity bright green, simulating blinking cursor
- **Scan lines**: Ultra-thin horizontal rects (0.02cm height) + very low opacity, simulating CRT scan line effect
- **Morph choreography**: Terminal windows move and scale between pages, code rows expand/contract

## Reference Script

Full build script available in `build.sh`.

**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (hero)** — Combination of terminal window + code rows + cursor + scan lines
- **Slide 3** — How terminal window coordinates with content display

No need to read all — skim 2-3 representative slides.
