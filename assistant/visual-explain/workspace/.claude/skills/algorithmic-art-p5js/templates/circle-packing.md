# Circle Packing

Space-filling arrangement of non-overlapping circles. The algorithm greedily places circles from large to small, filling the canvas with a dense, organic mosaic.

## Category

geometry

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  maxCircles: 800,
  minRadius: 4,
  maxRadius: 80,
  padding: 3,
  colors: ['#d97757', '#6a9bcc', '#88d4ab', '#e8c547', '#c75b9b'],
  background: '#0a0a14',
};
```

## Parameters

| Name        | ID         | Min | Max  | Default |
| ----------- | ---------- | --- | ---- | ------- |
| Max Circles | maxCircles | 100 | 2000 | 800     |
| Min Radius  | minRadius  | 2   | 10   | 4       |
| Max Radius  | maxRadius  | 20  | 200  | 80      |
| Padding     | padding    | 0   | 10   | 3       |

## Colors

| Label     | Default |
| --------- | ------- |
| Primary   | #d97757 |
| Secondary | #6a9bcc |
| Accent    | #88d4ab |
| Warm      | #e8c547 |
| Cool      | #c75b9b |

## Helpers

```javascript
function hexToRgb(hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function createSeededNoise() {
  let size = 32;
  let grid = [];
  for (let i = 0; i < size * size; i++) grid.push(seededRandom());

  return function (x, y, scale) {
    x = x * scale;
    y = y * scale;
    let xi = Math.floor(x) % size,
      yi = Math.floor(y) % size;
    let xf = x - Math.floor(x),
      yf = y - Math.floor(y);
    let u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);

    let x0 = (xi + size) % size,
      x1 = (xi + 1) % size;
    let y0 = (yi + size) % size,
      y1 = (yi + 1) % size;

    let nx0 = grid[y0 * size + x0] + (grid[y0 * size + x1] - grid[y0 * size + x0]) * u;
    let nx1 = grid[y1 * size + x0] + (grid[y1 * size + x1] - grid[y1 * size + x0]) * u;
    return nx0 + (nx1 - nx0) * v;
  };
}
```

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  let maxC = CONFIG.maxCircles;
  let minR = CONFIG.minRadius;
  let maxR = CONFIG.maxRadius;
  let pad = CONFIG.padding;

  // Layer 1: Noise background texture
  let noiseFunc = createSeededNoise();
  let bgRgb = hexToRgb(CONFIG.background);
  noStroke();
  let texStep = 6;
  for (let y = 0; y < CANVAS_SIZE; y += texStep) {
    for (let x = 0; x < CANVAS_SIZE; x += texStep) {
      let n = noiseFunc(x, y, 0.003);
      let n2 = noiseFunc(x + 100, y + 100, 0.008);
      let brightness = (n * 0.6 + n2 * 0.4) * 20 - 8;
      fill(Math.max(0, Math.min(255, bgRgb.r + brightness)), Math.max(0, Math.min(255, bgRgb.g + brightness)), Math.max(0, Math.min(255, bgRgb.b + brightness * 1.2)));
      rect(x, y, texStep, texStep);
    }
  }

  // Layer 2: Packed circles with spatial grid
  let circles = [];
  let maxAttempts = maxC * 15;
  let attempts = 0,
    placed = 0;

  let gridCellSize = maxR * 2 + pad * 2;
  let gridCols = Math.ceil(CANVAS_SIZE / gridCellSize) + 1;
  let gridRows = Math.ceil(CANVAS_SIZE / gridCellSize) + 1;
  let spatialGrid = [];
  for (let i = 0; i < gridCols * gridRows; i++) spatialGrid.push([]);

  function getGridCell(x, y) {
    return Math.max(0, Math.min(gridRows - 1, Math.floor(y / gridCellSize))) * gridCols + Math.max(0, Math.min(gridCols - 1, Math.floor(x / gridCellSize)));
  }

  function checkOverlap(cx, cy, cr) {
    let col = Math.floor(cx / gridCellSize),
      row = Math.floor(cy / gridCellSize);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        let nc = col + dx,
          nr = row + dy;
        if (nc < 0 || nc >= gridCols || nr < 0 || nr >= gridRows) continue;
        let cell = spatialGrid[nr * gridCols + nc];
        for (let i = 0; i < cell.length; i++) {
          let other = cell[i];
          let distSq = (cx - other.x) ** 2 + (cy - other.y) ** 2;
          if (distSq < (cr + other.r + pad) ** 2) return true;
        }
      }
    }
    return false;
  }

  while (placed < maxC && attempts < maxAttempts) {
    let progress = attempts / maxAttempts;
    let currentMaxR = maxR * (1 - progress * 0.85);
    let attemptRadius = seededRandomRange(minR, Math.max(minR, currentMaxR));
    let cx = seededRandomRange(attemptRadius, CANVAS_SIZE - attemptRadius);
    let cy = seededRandomRange(attemptRadius, CANVAS_SIZE - attemptRadius);
    attempts++;

    if (cx - attemptRadius < 0 || cx + attemptRadius > CANVAS_SIZE || cy - attemptRadius < 0 || cy + attemptRadius > CANVAS_SIZE) continue;

    if (!checkOverlap(cx, cy, attemptRadius)) {
      let circleObj = { x: cx, y: cy, r: attemptRadius };
      circles.push(circleObj);
      spatialGrid[getGridCell(cx, cy)].push(circleObj);
      placed++;
    }
  }

  // Draw circles
  let colorPalette = CONFIG.colors.map(hexToRgb);
  for (let i = 0; i < circles.length; i++) {
    let c = circles[i];
    let rgb = colorPalette[i % colorPalette.length];
    let radiusFraction = (c.r - minR) / Math.max(1, maxR - minR);
    let alpha = seededRandomRange(120, 220) * (1 - radiusFraction * 0.3);

    let fr = Math.max(0, Math.min(255, rgb.r + seededRandomRange(-15, 15)));
    let fg = Math.max(0, Math.min(255, rgb.g + seededRandomRange(-15, 15)));
    let fb = Math.max(0, Math.min(255, rgb.b + seededRandomRange(-15, 15)));

    fill(fr, fg, fb, alpha);
    stroke(Math.max(0, fr - 30), Math.max(0, fg - 30), Math.max(0, fb - 30), Math.min(255, alpha + 40) * 0.5);
    strokeWeight(0.8);
    ellipse(c.x, c.y, c.r * 2, c.r * 2);

    if (c.r > minR * 2) {
      noStroke();
      fill(Math.min(255, fr + 50), Math.min(255, fg + 50), Math.min(255, fb + 50), alpha * 0.2);
      ellipse(c.x - c.r * 0.25, c.y - c.r * 0.25, c.r * 0.6, c.r * 0.6);
    }
  }
}
```

## Algorithm

Circle packing fills a region with non-overlapping circles of varying sizes. The algorithm attempts to place circles at seeded random positions, starting with larger radii and progressively shrinking. Each candidate is checked against all existing circles for overlap using a spatial grid for performance. Colors cycle through the palette with varying opacity for visual depth.
