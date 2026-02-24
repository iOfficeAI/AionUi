# Visual Explain Studio — Workspace Guide

## Overview

This workspace creates interactive visualizations for education, science, and engineering using **p5.js (2D)** or **Three.js (3D)**. Every visualization is a single self-contained HTML file with seeded randomness, parameter controls, and PNG export.

**`index.html` is the single output file.** The engineer overwrites it each time a new visualization is generated. Open it in a browser to preview.

## Tech Stack

- **p5.js 1.9.0** — 2D creative coding library (bundled locally as `p5.min.js`)
- **Three.js r160** — 3D WebGL library (bundled locally as `three.min.js`)
- **HTML5 / CSS3 / ES6** — No build tools, runs directly in browser

## Single-File Format

All visualizations live in one HTML file:

- `<style>` — inline CSS (dark sidebar + responsive canvas layout, CSS variables)
- `<script src="p5.min.js">` or `<script src="three.min.js">` — local library (NOT CDN)
- `<script>` — all logic inline

### File Structure Pattern

```
viewer-base.html / viewer-base-3js.html (template)
├── CSS: sidebar layout, controls, dark theme
├── HTML: sidebar (header, seed, params, colors, actions, description) + canvas area
└── JS:
    ├── FIXED: Mulberry32 PRNG, seed management, regenerate, download
    └── VARIABLE: CONFIG, syncUIFromConfig, setup/initThree, generateArt
```

## Library Loading (Mandatory)

```html
<script src="p5.min.js"></script>
<!-- p5.js -->
<script src="three.min.js"></script>
<!-- Three.js -->
```

**NEVER** use a CDN URL. Libraries are bundled locally in this workspace.

## Seeded Randomness (Mandatory)

Every visualization uses the Mulberry32 PRNG. Never call `Math.random()` or unseeded `random()`.

Available functions (provided by template):

- `seededRandom()` — returns [0, 1)
- `seededRandomRange(min, max)` — returns float in range
- `seededRandomInt(min, max)` — returns integer in range (inclusive)
- `seededGaussian(mean, sd)` — returns gaussian-distributed value
- `seededShuffle(array)` — returns shuffled copy

Same seed always produces the same visualization.

## Code Organization

```javascript
// 1. CONFIG — All tunable constants
const DEFAULT_CONFIG = {
  param1: 50,
  colors: ['#d97757', '#6a9bcc', '#88d4ab'],
  background: '#0a0a14',
};
const CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

// 2. syncUIFromConfig() — Sync all UI controls from CONFIG
function syncUIFromConfig() {
  /* ... */
}

// 3. setup() — Create canvas, call generateArt
function setup() {
  let canvas = createCanvas(1200, 1200);
  canvas.parent('canvasContainer');
  pixelDensity(1);
  noLoop();
  generateArt();
}

// 4. generateArt() — The core algorithm
function generateArt() {
  background(CONFIG.background);
  // Layer 1: background texture
  // Layer 2: main content
  // Layer 3: foreground accents
}
```

## Visualization Quality Standards

- **Minimum 2 layered techniques** — depth through background + mid + foreground
- **Perlin noise** for organic variation — never raw random for positions
- **Canvas: 1200x1200** render resolution (displays responsively, exports at full resolution)
- **Every seed produces output** — no blank canvases
- **Seeds 0, 42, 100, 999** must produce visually distinct results
- **All parameters in CONFIG** — no magic numbers in generateArt()

## UI Layout

### Sidebar (320px, stacks vertically on narrow screens)

- Header: title + short description
- Seed controls: prev / next / random / input (FIXED — do not modify)
- Parameters: sliders with live value display
- Colors: at least 3 pickers wired to CONFIG.colors
- Actions: Regenerate, Reset, Download PNG (FIXED — do not modify)
- Description: algorithm explanation (2-5 sentences)

### Colors

- Background: `#0a0a14`
- Sidebar gradient: `#16213e` -> `#1a1a2e`
- Accent: `#d97757` (terra cotta)
- All colors are defined as CSS variables (`--accent`, `--bg`, `--surface`, etc.) in `:root`

## FORBIDDEN

- `Math.random()` or unseeded `random()` anywhere
- CDN URLs for libraries (use local bundled files)
- Pre-created `<canvas>` tags in HTML (let p5/Three.js create it)
- Hardcoded values without CONFIG constants
- Missing seed controls or download button
- Blank canvas for any seed value
- External asset files (images, fonts)
- Placeholder/TODO code
- Copying specific artists' visual styles

## Agent & Skills

### Agent

| Agent                      | Role                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `@visual-explain-engineer` | Dual-engine implementation specialist — produces p5.js or Three.js HTML from specifications |

The Visualization Consultant role is handled by the outer `visual-explain.md` system prompt, which consults users and delegates to the engineer.

### Skills

| Skill                  | Domain                                                                      |
| ---------------------- | --------------------------------------------------------------------------- |
| `algorithmic-art-p5js` | p5.js 2D engine — base template, 12 example templates, techniques, palettes |
| `algorithmic-art-3js`  | Three.js 3D engine — base template, 3D techniques, palettes                 |
