# Mandelbrot Set Explorer

Escape-time fractal visualization with smooth continuous coloring. Explore the infinite complexity of the Mandelbrot set through parametric zoom and custom color gradients.

## Category

mathematics

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  maxIterations: 200,
  colorCycles: 3,
  zoomSlider: 1,
  colors: ['#d97757', '#6a9bcc', '#88d4ab'],
  background: '#0a0a14',
};
```

## Parameters

| Name           | ID            | Min | Max | Default |
| -------------- | ------------- | --- | --- | ------- |
| Max Iterations | maxIterations | 50  | 500 | 200     |
| Color Cycles   | colorCycles   | 1   | 10  | 3       |
| Zoom           | zoomSlider    | 1   | 100 | 1       |

## Colors

| Label     | Default |
| --------- | ------- |
| Primary   | #d97757 |
| Secondary | #6a9bcc |
| Accent    | #88d4ab |

## Helpers

```javascript
function hexToRgb(hex) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerpColor3(c1, c2, t) {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

function buildPalette(size) {
  let colors = CONFIG.colors.map(hexToRgb);
  let palette = [];
  let segments = colors.length;
  for (let i = 0; i < size; i++) {
    let t = (i / size) * segments;
    let segIndex = Math.floor(t) % segments;
    let segT = t - Math.floor(t);
    let c1 = colors[segIndex];
    let c2 = colors[(segIndex + 1) % segments];
    palette.push(lerpColor3(c1, c2, segT));
  }
  return palette;
}
```

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  let centerX = -0.5 + seededRandomRange(-0.3, 0.3);
  let centerY = 0.0 + seededRandomRange(-0.3, 0.3);
  let zoomLevel = Math.pow(10, ((CONFIG.zoomSlider - 1) / 99) * 4);

  let maxIter = CONFIG.maxIterations;
  let cycles = CONFIG.colorCycles;

  let paletteSize = 512;
  let palette = buildPalette(paletteSize);
  let bgRgb = hexToRgb(CONFIG.background);

  // ── Layer 1: The Mandelbrot fractal ──
  loadPixels();
  let d = pixelDensity();
  let totalW = width * d;
  let totalH = height * d;

  let rangeX = 3.5 / zoomLevel;
  let rangeY = 3.5 / zoomLevel;
  let xMin = centerX - rangeX / 2;
  let yMin = centerY - rangeY / 2;

  for (let px = 0; px < totalW; px++) {
    for (let py = 0; py < totalH; py++) {
      let cr = xMin + (px / totalW) * rangeX;
      let ci = yMin + (py / totalH) * rangeY;

      let zr = 0,
        zi = 0;
      let zr2 = 0,
        zi2 = 0;
      let iter = 0;

      while (zr2 + zi2 <= 4 && iter < maxIter) {
        zi = 2 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
        zr2 = zr * zr;
        zi2 = zi * zi;
        iter++;
      }

      let idx = 4 * (py * totalW + px);
      if (iter === maxIter) {
        pixels[idx] = bgRgb[0];
        pixels[idx + 1] = bgRgb[1];
        pixels[idx + 2] = bgRgb[2];
        pixels[idx + 3] = 255;
      } else {
        let log2 = Math.log(2);
        let smoothVal = iter + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / log2;

        let palIdx = ((smoothVal * cycles * paletteSize) / maxIter) % paletteSize;
        if (palIdx < 0) palIdx += paletteSize;
        let palFloor = Math.floor(palIdx) % paletteSize;
        let palCeil = (palFloor + 1) % paletteSize;
        let palFrac = palIdx - Math.floor(palIdx);

        let col = lerpColor3(palette[palFloor], palette[palCeil], palFrac);

        pixels[idx] = col[0];
        pixels[idx + 1] = col[1];
        pixels[idx + 2] = col[2];
        pixels[idx + 3] = 255;
      }
    }
  }
  updatePixels();

  // ── Layer 2: Vignette overlay for depth ──
  let vignetteGfx = createGraphics(CANVAS_SIZE, CANVAS_SIZE);
  vignetteGfx.noStroke();
  let steps = 80;
  for (let i = steps; i >= 0; i--) {
    let t = i / steps;
    let radius = CANVAS_SIZE * 0.85 * t;
    let alpha = Math.pow(1 - t, 2.5) * 180;
    vignetteGfx.fill(0, 0, 0, alpha);
    vignetteGfx.ellipse(CANVAS_SIZE / 2, CANVAS_SIZE / 2, radius * 2, radius * 2);
  }
  image(vignetteGfx, 0, 0);
  vignetteGfx.remove();

  // ── Layer 2b: Subtle glow at center of interest ──
  let glowGfx = createGraphics(CANVAS_SIZE, CANVAS_SIZE);
  glowGfx.noStroke();
  let glowX = CANVAS_SIZE / 2 + seededRandomRange(-80, 80);
  let glowY = CANVAS_SIZE / 2 + seededRandomRange(-80, 80);
  let accentRgb = hexToRgb(CONFIG.colors[2]);
  let glowSteps = 40;
  for (let i = glowSteps; i >= 0; i--) {
    let t = i / glowSteps;
    let r = 250 * t;
    let alpha = (1 - t) * 15;
    glowGfx.fill(accentRgb[0], accentRgb[1], accentRgb[2], alpha);
    glowGfx.ellipse(glowX, glowY, r * 2, r * 2);
  }
  blendMode(ADD);
  image(glowGfx, 0, 0);
  blendMode(BLEND);
  glowGfx.remove();
}
```

## Algorithm

The Mandelbrot set is defined by iterating z = z² + c for each point c in the complex plane. Points that remain bounded belong to the set. This visualization uses smooth (continuous) iteration counting to eliminate banding artifacts, creating fluid color gradients. A trilinear interpolation palette maps escape values through your three chosen colors. The seed shifts the viewport center slightly, revealing different regions of the fractal boundary.
