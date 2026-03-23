# Energy Neon — Editorial Conference

## Style Overview
High-energy editorial design with light grey background and bold neon green blocks. Features condensed black typography and multi-column layouts, ideal for conferences, events, and dynamic presentations.

- **Scenario**: Conferences, energy summits, tech events, editorial publications, speaker showcases
- **Mood**: Energetic, modern, impactful, editorial
- **Tone**: Light grey with neon green accent blocks

## Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Background | #E8E8E8 | Light grey canvas |
| Primary accent | #00FF41 | Neon green for blocks and highlights |
| Primary text | #111111 | Near-black for main text |
| Secondary text | #555555 | Mid-grey for supporting text |
| White | #FFFFFF | White for text on green blocks |

## Typography
| Element | Font |
|---------|------|
| Title | Segoe UI Black |
| Body | Segoe UI |

## Design Techniques
- Large neon green rect blocks as morph actors
- Condensed bold typography for impact
- Multi-column text layouts
- Asymmetric block positioning that morphs across slides
- Editorial conference aesthetic
- Light background for high energy feel

## Page Structure (7 slides)
| Slide | Type | Description |
|-------|------|-------------|
| 1 | hero | Neon block left-half, large title right |
| 2 | pillars | 4-column speaker showcase, small neon block top-right |
| 3 | statement | Centered message, neon blocks morph to corners |
| 4 | pillars | 3-column benefits, neon top stripe |
| 5 | evidence | Large stat with neon background block |
| 6 | timeline | 4-step process, vertical neon accent |
| 7 | cta | Call to action, neon block returns to center |

## Key Morph Patterns
- **Neon block actor** (`!!neon-block`): Large rect that moves from left-half → top-right → corners → top-stripe → background → vertical bar → center
- **Dramatic size changes**: Block scales from 16cm wide full-height down to 4cm accent strips
- **Color consistency**: Neon green stays constant, creating visual thread across slides

## Reference Script
Complete build script available in `build.py` (Python with officecli).

**Recommended slides to read for core techniques**:
- **Slide 1 (hero)** — asymmetric neon block composition with condensed title
- **Slide 5 (evidence)** — neon block as content background with white text overlay
