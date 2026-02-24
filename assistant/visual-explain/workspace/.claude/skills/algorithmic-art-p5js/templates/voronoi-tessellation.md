# Voronoi Tessellation

Colored cell decomposition of the plane based on nearest-neighbor distance partitioning. Each cell region is closer to its seed point than to any other.

## Category

geometry

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  cellCount: 60,
  jitter: 50,
  strokeWeightParam: 15,
  colors: ['#d97757', '#6a9bcc', '#88d4ab', '#e8c547', '#c75b9b'],
  background: '#0a0a14',
};
```

## Parameters

| Name          | ID                | Min | Max | Default |
| ------------- | ----------------- | --- | --- | ------- |
| Cell Count    | cellCount         | 10  | 200 | 60      |
| Jitter        | jitter            | 0   | 100 | 50      |
| Stroke Weight | strokeWeightParam | 0   | 30  | 15      |

## Colors

| Label     | Default |
| --------- | ------- |
| Primary   | #d97757 |
| Secondary | #6a9bcc |
| Accent    | #88d4ab |
| Highlight | #e8c547 |
| Deep      | #c75b9b |

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

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
```

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  let numCells = CONFIG.cellCount;
  let jitterAmount = CONFIG.jitter / 100.0;
  let edgeWeight = CONFIG.strokeWeightParam / 10.0;

  let points = [];
  let cellColors = [];

  for (let i = 0; i < numCells; i++) {
    let px, py;
    if (jitterAmount < 0.5) {
      let cols = Math.ceil(Math.sqrt(numCells));
      let rows = Math.ceil(numCells / cols);
      let cellW = CANVAS_SIZE / cols;
      let cellH = CANVAS_SIZE / rows;
      let row = Math.floor(i / cols);
      let col = i % cols;
      let baseX = col * cellW + cellW / 2;
      let baseY = row * cellH + cellH / 2;
      let maxJitter = Math.min(cellW, cellH) * 0.5;
      px = baseX + seededRandomRange(-maxJitter, maxJitter) * jitterAmount * 2;
      py = baseY + seededRandomRange(-maxJitter, maxJitter) * jitterAmount * 2;
    } else {
      px = seededRandomRange(20, CANVAS_SIZE - 20);
      py = seededRandomRange(20, CANVAS_SIZE - 20);
    }
    px = Math.max(0, Math.min(CANVAS_SIZE, px));
    py = Math.max(0, Math.min(CANVAS_SIZE, py));
    points.push({ x: px, y: py });

    let baseColor = CONFIG.colors[i % CONFIG.colors.length];
    let rgb = hexToRgb(baseColor);
    let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    cellColors.push({
      h: (hsl.h + seededRandomRange(-15, 15) + 360) % 360,
      s: Math.max(20, Math.min(100, hsl.s + seededRandomRange(-10, 10))),
      l: Math.max(15, Math.min(85, hsl.l + seededRandomRange(-12, 12))),
    });
  }

  let step = 3;
  let gridW = Math.ceil(CANVAS_SIZE / step);
  let gridH = Math.ceil(CANVAS_SIZE / step);

  let cellGrid = new Int16Array(gridW * gridH);
  let distGrid = new Float32Array(gridW * gridH);
  let dist2Grid = new Float32Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    let py = gy * step + step / 2;
    for (let gx = 0; gx < gridW; gx++) {
      let px = gx * step + step / 2;
      let minDist = Infinity,
        minDist2 = Infinity,
        minIdx = 0;

      for (let i = 0; i < points.length; i++) {
        let dx = px - points[i].x;
        let dy = py - points[i].y;
        let d = dx * dx + dy * dy;
        if (d < minDist) {
          minDist2 = minDist;
          minDist = d;
          minIdx = i;
        } else if (d < minDist2) {
          minDist2 = d;
        }
      }

      let idx = gy * gridW + gx;
      cellGrid[idx] = minIdx;
      distGrid[idx] = Math.sqrt(minDist);
      dist2Grid[idx] = Math.sqrt(minDist2);
    }
  }

  // Layer 1: Draw colored cells
  noStroke();
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      let idx = gy * gridW + gx;
      let cc = cellColors[cellGrid[idx]];
      let distRatio = distGrid[idx] / (CANVAS_SIZE * 0.5);

      colorMode(HSL, 360, 100, 100, 1);
      fill(cc.h, cc.s, Math.max(10, cc.l - distRatio * 8));
      rect(gx * step, gy * step, step, step);
    }
  }

  // Layer 2: Draw cell edges with glow
  if (edgeWeight > 0.05) {
    let edgeThreshold = 6 + edgeWeight * 4;

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        let idx = gy * gridW + gx;
        let edgeness = dist2Grid[idx] - distGrid[idx];
        if (edgeness < edgeThreshold) {
          let alpha = 1 - edgeness / edgeThreshold;
          alpha = alpha * alpha;
          colorMode(HSL, 360, 100, 100, 1);
          fill(0, 0, 95, alpha * 0.15 * edgeWeight);
          rect(gx * step - 1, gy * step - 1, step + 2, step + 2);
        }
      }
    }

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        let idx = gy * gridW + gx;
        let edgeness = dist2Grid[idx] - distGrid[idx];
        let sharpThreshold = 3 + edgeWeight * 2;
        if (edgeness < sharpThreshold) {
          let alpha = Math.pow(1 - edgeness / sharpThreshold, 1.5);
          colorMode(HSL, 360, 100, 100, 1);
          fill(0, 0, 100, alpha * 0.7 * Math.min(edgeWeight, 1));
          rect(gx * step, gy * step, step, step);
        }
      }
    }
  }

  // Seed point markers
  colorMode(RGB, 255);
  for (let i = 0; i < points.length; i++) {
    let cc = cellColors[i];
    colorMode(HSL, 360, 100, 100, 1);
    fill(cc.h, Math.min(100, cc.s + 20), Math.min(95, cc.l + 25), 0.5);
    noStroke();
    ellipse(points[i].x, points[i].y, 4, 4);
  }
  colorMode(RGB, 255);
}
```

## Algorithm

Voronoi tessellation partitions the plane into regions based on distance to a set of seed points. Each pixel is assigned to the nearest point, creating a mosaic of colored cells. Cell edges form where pixels are equidistant between two or more sources. The jitter parameter controls how irregularly the seed points are distributed.
