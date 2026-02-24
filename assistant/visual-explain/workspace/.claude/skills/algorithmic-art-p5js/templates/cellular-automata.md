# Cellular Automata

1D Elementary Cellular Automata using Wolfram rules. Simple local rules produce complex emergent patterns from a single row of cells evolving over time.

## Category

biology

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  ruleNumber: 110,
  cellSize: 2,
  randomInit: 0,
  colors: ['#0b1628', '#d97757', '#0a0a14'],
  background: '#0a0a14',
};
```

## Parameters

| Name        | ID         | Min | Max | Default |
| ----------- | ---------- | --- | --- | ------- |
| Rule Number | ruleNumber | 0   | 255 | 110     |
| Cell Size   | cellSize   | 1   | 8   | 2       |
| Random Init | randomInit | 0   | 1   | 0       |

## Colors

| Label      | Default |
| ---------- | ------- |
| Dead Cell  | #0b1628 |
| Live Cell  | #d97757 |
| Background | #0a0a14 |

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  let cellSize = CONFIG.cellSize;
  let cols = Math.floor(CANVAS_SIZE / cellSize);
  let rows = Math.floor(CANVAS_SIZE / cellSize);
  let rule = CONFIG.ruleNumber;

  // Parse rule into 8-bit lookup table
  let ruleBits = [];
  for (let i = 0; i < 8; i++) {
    ruleBits[i] = (rule >> i) & 1;
  }

  function hexToRGB(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  let deadColor = hexToRGB(CONFIG.colors[0]);
  let liveColor = hexToRGB(CONFIG.colors[1]);

  // Initialize first row
  let currentRow = new Uint8Array(cols);

  if (CONFIG.randomInit === 1) {
    for (let i = 0; i < cols; i++) {
      currentRow[i] = seededRandom() < 0.5 ? 1 : 0;
    }
  } else {
    currentRow[Math.floor(cols / 2)] = 1;
  }

  // Layer 1: Render cellular automata
  loadPixels();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let alive = currentRow[col];

      let posVariation = (row / rows) * 0.15;
      let colVariation = (col / cols) * 0.05;
      let variation = posVariation + colVariation;

      let r, g, b;
      if (alive) {
        r = Math.min(255, liveColor[0] + variation * 40);
        g = Math.min(255, liveColor[1] + variation * 20);
        b = Math.min(255, liveColor[2] - variation * 30);
      } else {
        r = Math.min(255, deadColor[0] + variation * 15);
        g = Math.min(255, deadColor[1] + variation * 15);
        b = Math.min(255, deadColor[2] + variation * 20);
      }

      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          let px = col * cellSize + dx;
          let py = row * cellSize + dy;
          if (px < CANVAS_SIZE && py < CANVAS_SIZE) {
            let idx = (py * CANVAS_SIZE + px) * 4;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
            pixels[idx + 3] = 255;
          }
        }
      }
    }

    // Compute next row
    let nextRow = new Uint8Array(cols);
    for (let col = 0; col < cols; col++) {
      let left = col > 0 ? currentRow[col - 1] : currentRow[cols - 1];
      let center = currentRow[col];
      let right = col < cols - 1 ? currentRow[col + 1] : currentRow[0];

      let neighborhood = (left << 2) | (center << 1) | right;
      nextRow[col] = ruleBits[neighborhood];
    }

    currentRow = nextRow;
  }

  updatePixels();

  // Layer 2: Subtle overlay for depth
  let overlayGfx = createGraphics(CANVAS_SIZE, CANVAS_SIZE);
  overlayGfx.noStroke();

  let bandCount = 40;
  for (let i = 0; i < bandCount; i++) {
    let t = i / bandCount;
    let alphaLeft = (1 - t) * 50;
    overlayGfx.fill(0, 0, 0, alphaLeft);
    let xLeft = t * CANVAS_SIZE * 0.2;
    overlayGfx.rect(xLeft, 0, (CANVAS_SIZE * 0.2) / bandCount + 1, CANVAS_SIZE);

    overlayGfx.fill(0, 0, 0, alphaLeft);
    let xRight = CANVAS_SIZE - xLeft - (CANVAS_SIZE * 0.2) / bandCount;
    overlayGfx.rect(xRight, 0, (CANVAS_SIZE * 0.2) / bandCount + 1, CANVAS_SIZE);
  }

  for (let y = 0; y < CANVAS_SIZE; y++) {
    let t = y / CANVAS_SIZE;
    let alpha = t * 30;
    overlayGfx.fill(0, 0, 20, alpha);
    overlayGfx.rect(0, y, CANVAS_SIZE, 1);
  }

  image(overlayGfx, 0, 0);
  overlayGfx.remove();
}
```

## Algorithm

Elementary cellular automata are one-dimensional systems studied by Stephen Wolfram. Each cell's next state is determined by its current state and its two neighbors, encoded in a single rule number (0-255). Despite their simplicity, certain rules (like Rule 30 and Rule 110) produce remarkably complex, even computationally universal, behavior. The initial condition — a single center cell or a random row — dramatically affects the resulting pattern.
