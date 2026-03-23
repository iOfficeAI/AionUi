# S18-spotlight-stage — Stage Spotlight

## Style Overview

Large elliptical light spots on a near-black background simulate stage spotlight effects, with spots shifting dramatically between pages to create dramatic atmosphere.

- **Scene**: Speeches, product launches, TED-style, annual meetings
- **Mood**: Dramatic, focused, theatrical
- **Color Tone**: Near-black background + warm white/gold spotlight

## Color Palette

| Name       | Hex                      | Usage                       |
| ---------- | ------------------------ | --------------------------- |
| Near Black | 0A0A0A                   | Background (stage darkness) |
| Spotlight  | Warm white/gold gradient | Spotlight beam              |

## Design Techniques

- Spotlights implemented using large ellipses, shifting 15cm+ between pages, creating beam-sweeping effect during Morph transitions
- Use ellipse for light spots and halos, rect for stage elements (floor lines, text panels)
- Multiple ellipse layers overlay to simulate halo diffusion (bright center, faint edges)
- Text placed in spotlight center area, dark areas left empty, guiding visual focus

## Reference Script

Full build script available in `build.sh`.
**Recommended slides to read for understanding core design techniques**:

- **Slide 1 (hero)** — Spotlight ellipse size, position, and transparency settings
- **Slide 2 (statement)** — Morph transition effect with large spot shifts
- **Slide 5 (cta)** — Multi-light layering for stage finale effect
  No need to read all — skim 2-3 representative slides.
