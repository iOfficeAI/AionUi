# Visual Explain — p5.js (2D Engine)

Expertise in 2D interactive visualizations using p5.js. Use this skill for flat, canvas-based visualizations: waveforms, signal flow diagrams, frequency curves, flow fields, fractals, tessellations, particle systems, and all traditional 2D algorithmic visualizations.

## When to Use p5.js

p5.js is the right choice when the visualization is inherently **two-dimensional**:

| Concept                          | Why p5.js                                      |
| -------------------------------- | ---------------------------------------------- |
| Flow fields, curl noise          | 2D vector field → particle traces              |
| Waveforms, signal flow           | Time-domain plots, oscilloscope style          |
| Frequency curves, spectrums      | FFT-like visualizations, harmonic series       |
| Fractals (Mandelbrot, Julia)     | Complex plane iteration, pixel-level rendering |
| Tessellations (Voronoi, Penrose) | Planar subdivision, polygon fills              |
| Cellular automata                | Grid-based state evolution                     |
| Reaction-diffusion               | 2D chemical simulation                         |
| Phyllotaxis, spirals             | Polar coordinate patterns                      |
| Circle/sphere packing (2D)       | Greedy placement in plane                      |
| L-systems, fractal trees         | Turtle graphics, recursive branching           |
| Lissajous, rose curves           | Parametric 2D curves                           |
| Boids flocking                   | 2D agent simulation                            |
| Data visualization               | Charts, node-link diagrams, treemaps           |

## Template

All p5.js visualizations start from `viewer-base.html` (located in this skill folder). This template provides:

- **FIXED sections** (do not modify): CSS layout (CSS variables in `:root`, responsive at <900px), Mulberry32 PRNG, seed controls, action buttons
- **VARIABLE sections** (customize): title, parameters, colors, `DEFAULT_CONFIG`, `syncUIFromConfig()`, `generateArt()`

### Canvas Setup

```javascript
const CANVAS_SIZE = 1200;

function setup() {
  let canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  canvas.parent('canvasContainer');
  pixelDensity(1);
  noLoop();
  generateArt();
}
```

p5.js creates its own `<canvas>` element inside `#canvasContainer`. Never pre-create a `<canvas>` tag.

### Library Loading

```html
<script src="p5.min.js"></script>
```

Always use the local bundled `p5.min.js` — never CDN.

## Randomness Rules

All randomness must use the Mulberry32 PRNG:

| Function                      | Usage                           |
| ----------------------------- | ------------------------------- |
| `seededRandom()`              | Float in [0, 1)                 |
| `seededRandomRange(min, max)` | Float in [min, max)             |
| `seededRandomInt(min, max)`   | Integer in [min, max] inclusive |
| `seededGaussian(mean, sd)`    | Normal distribution             |
| `seededShuffle(arr)`          | Shuffled copy of array          |

**Never** use `Math.random()`, `random()`, or any unseeded randomness in art generation code. The only exception is `randomSeed()` for the seed-jump button (which is intentionally non-deterministic).

Use p5's `noise()` for Perlin noise — it's seeded via `noiseSeed()` or offset by seeded random values.

## Layering Strategy

Every p5.js visualization must have at least 2 distinct algorithmic layers:

1. **Background layer** — subtle texture, gradient, or noise-based pattern
2. **Primary layer** — the main algorithmic content (flow curves, fractal, etc.)
3. **Detail layer** (recommended) — highlights, accents, small markers

Draw back-to-front. Use `blendMode()` for compositing effects:

- `BLEND` (default) — normal layering
- `ADD` — glow/light accumulation
- `MULTIPLY` — shadow/depth
- `SCREEN` — bright overlay

## Key p5.js APIs

| Category  | Functions                                                             |
| --------- | --------------------------------------------------------------------- |
| Drawing   | `line()`, `rect()`, `ellipse()`, `arc()`, `bezier()`, `curveVertex()` |
| Shape     | `beginShape()`, `vertex()`, `endShape()`                              |
| Color     | `color()`, `fill()`, `stroke()`, `colorMode(HSL)`, `.setAlpha()`      |
| Transform | `translate()`, `rotate()`, `scale()`, `push()`, `pop()`               |
| Noise     | `noise()`, `noiseSeed()`, `noiseDetail()`                             |
| Pixel     | `loadPixels()`, `pixels[]`, `updatePixels()`                          |
| Image     | `createGraphics()`, `image()`, `blend()`                              |
| Math      | `map()`, `constrain()`, `lerp()`, `dist()`                            |
| Export    | `saveCanvas()` — for Download PNG                                     |

## Performance Tips

- Use `noLoop()` for static visualizations — single render
- Use `pixelDensity(1)` to avoid HiDPI doubling
- For pixel manipulation, use `loadPixels()`/`updatePixels()` with direct array access
- Batch similar draw operations (all strokes together, all fills together)
- For large particle counts (>5000), consider reducing stroke detail
- Pre-compute noise grids rather than calling `noise()` per-particle per-step

## 2D-Specific Techniques

### Signal & Waveform Visualization

```javascript
// Composite waveform with harmonics
for (let x = 0; x < width; x++) {
  let t = (x / width) * TWO_PI * CONFIG.cycles;
  let y = 0;
  for (let h = 1; h <= CONFIG.harmonics; h++) {
    y += Math.sin(t * h) / h; // Fourier series
  }
  vertex(x, height / 2 + y * CONFIG.amplitude);
}
```

### Frequency Domain

```javascript
// Visualize frequency bins as vertical bars or curves
for (let i = 0; i < CONFIG.bins; i++) {
  let freq = i / CONFIG.bins;
  let magnitude = computeMagnitude(freq); // from your algorithm
  rect(i * binWidth, height, binWidth, -magnitude * height);
}
```

### Flow Field

```javascript
// Perlin noise vector field with particle advection
let angle = noise(x * scale + offsetX, y * scale + offsetY) * TWO_PI * 2;
px += Math.cos(angle) * stepLength;
py += Math.sin(angle) * stepLength;
```

## Templates

Complete example visualizations live in `templates/` as markdown files. Each template contains:

- Title, description, and category
- `DEFAULT_CONFIG` with all parameters and colors
- Parameters table (name, range, default)
- Colors table (label, default hex)
- Helper functions (if any)
- Full `generateArt()` implementation
- Algorithm description

Available templates:

| Template                | Category    | Technique                                      |
| ----------------------- | ----------- | ---------------------------------------------- |
| flow-field-particles.md | physics     | Perlin noise vector field with particle trails |
| wave-interference.md    | physics     | Overlapping circular wave superposition        |
| n-body-gravity.md       | physics     | Newtonian gravitational orbital trails         |
| mandelbrot-explorer.md  | mathematics | Escape-time fractal with smooth coloring       |
| phyllotaxis-spiral.md   | mathematics | Golden angle sunflower pattern                 |
| lissajous-harmonics.md  | mathematics | Parametric harmonic oscillation curves         |
| reaction-diffusion.md   | biology     | Gray-Scott model Turing patterns               |
| cellular-automata.md    | biology     | 1D Wolfram elementary rules                    |
| flocking-boids.md       | biology     | Reynolds flocking with trail rendering         |
| voronoi-tessellation.md | geometry    | Nearest-neighbor distance partitioning         |
| fractal-tree.md         | geometry    | Recursive branching with bezier curves         |
| circle-packing.md       | geometry    | Greedy non-overlapping circle placement        |

Use these as reference implementations when generating new visualizations.

## References

Detailed guides live in `references/`:

- **techniques.csv** — 25 algorithmic visualization techniques with parameters, algorithms, and complexity ratings
- **particle-systems.md** — flow fields, boids, N-body, trails
- **fractals-and-math.md** — Mandelbrot, Julia, L-systems, parametric curves, strange attractors
- **nature-simulation.md** — reaction-diffusion, cellular automata, DLA, wave interference
- **color-and-composition.md** — palette theory, harmony rules, layering strategy, composition principles
- **palettes.csv** — 26 curated palettes with mood, colors, background, and keywords
- **references.csv** — 15 notable educational and visualization references (Nature of Code, Coding Train, etc.)

## Output Format

Single self-contained HTML file with:

- Inline `<style>` (same sidebar CSS as viewer-base)
- Local `<script src="p5.min.js">`
- Inline `<script>` with all JavaScript
- No external assets (images, fonts, data files)
- Minimum 1200x1200 canvas
- Download PNG button via `saveCanvas()`
