# Visual Explain Studio

Dual-engine interactive visualization workspace — create seeded, reproducible visualizations using **p5.js (2D)** or **Three.js (3D)**.

## Quick Start

1. Open `index.html` in a browser to see the studio
2. Toggle between **p5.js (2D)** and **Three.js (3D)** engines
3. Use seed controls to explore variations
4. Adjust parameters and colors in the sidebar
5. Click **Download PNG** to export

## Engines

| Engine       | Library   | Best For                                                                        |
| ------------ | --------- | ------------------------------------------------------------------------------- |
| **p5.js**    | 2D canvas | Flow fields, fractals, waveforms, signal flow, tessellations, cellular automata |
| **Three.js** | 3D WebGL  | Room acoustics, spatial audio, speaker placement, terrain, parametric surfaces  |

## Agent

| Agent                       | Description                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **visual-explain-engineer** | Dual-engine implementation specialist — produces p5.js or Three.js code from specifications |

The Visualization Consultant role is handled by the `visual-explain.md` system prompt.

## Skills

Each skill is a self-contained subfolder with `SKILL.md` and `references/`:

| Skill                    | Domain                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| **algorithmic-art-p5js** | p5.js 2D engine — canvas setup, techniques, particle systems, fractals, nature simulation     |
| **algorithmic-art-3js**  | Three.js 3D engine — scene setup, room acoustics, spatial audio, terrain, parametric surfaces |

## Templates

Base templates and example templates live inside their respective skills:

- **p5js skill** — `viewer-base.html` + 12 example templates (`.md`)
- **3js skill** — `viewer-base-3js.html`

Example templates (in `.claude/skills/algorithmic-art-p5js/templates/`):

- **Mathematics** — mandelbrot-explorer, phyllotaxis-spiral, lissajous-harmonics
- **Physics** — flow-field-particles, wave-interference, n-body-gravity
- **Biology** — reaction-diffusion, cellular-automata, flocking-boids
- **Geometry** — voronoi-tessellation, fractal-tree, circle-packing

## Resources

- [p5.js Reference](https://p5js.org/reference/)
- [Three.js Documentation](https://threejs.org/docs/)
- [The Coding Train](https://thecodingtrain.com/)
- [Tyler Hobbs — Flow Fields](https://www.tylerxhobbs.com/words/flow-fields)
- [Karl Sims — Reaction-Diffusion](https://www.karlsims.com/rd.html)
- [Nature of Code](https://natureofcode.com/)
