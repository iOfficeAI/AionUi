# Phyllotaxis Spiral

Golden angle sunflower pattern. Elements are placed using the divergence angle found in nature, creating the iconic spiral arrangement seen in sunflower heads and pinecones.

## Category

mathematics

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  elementCount: 1500,
  scale: 8,
  angleOffsetSlider: 50,
  colors: ['#d97757', '#6a9bcc', '#88d4ab'],
  background: '#0a0a14',
};
```

## Parameters

| Name          | ID                | Min | Max  | Default |
| ------------- | ----------------- | --- | ---- | ------- |
| Element Count | elementCount      | 100 | 3000 | 1500    |
| Scale         | scale             | 3   | 15   | 8       |
| Angle Offset  | angleOffsetSlider | 0   | 100  | 50      |

## Colors

| Label     | Default |
| --------- | ------- |
| Primary   | #d97757 |
| Secondary | #6a9bcc |
| Accent    | #88d4ab |

## Helpers

```javascript
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerpRgb(c1, c2, t) {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

function paletteColor(t, colors) {
  t = ((t % 1) + 1) % 1;
  let n = colors.length;
  let scaled = t * n;
  let idx = Math.floor(scaled) % n;
  let frac = scaled - Math.floor(scaled);
  return lerpRgb(colors[idx], colors[(idx + 1) % n], frac);
}
```

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  let cx = CANVAS_SIZE / 2;
  let cy = CANVAS_SIZE / 2;
  let n = CONFIG.elementCount;
  let sc = CONFIG.scale;

  let angleDeg = 137.0 + CONFIG.angleOffsetSlider / 100;
  let angleRad = (angleDeg * Math.PI) / 180;

  let paletteOffset = seededRandomRange(0, 1);
  let shapeMode = seededRandomInt(0, 3); // 0=circle, 1=diamond, 2=hexagon, 3=mixed
  let sizeVariation = seededRandomRange(0.5, 1.5);
  let rotationBase = seededRandomRange(0, Math.PI * 2);

  let rgbColors = CONFIG.colors.map(hexToRgb);

  // ── Layer 1: Subtle radial gradient background ──
  noStroke();
  let bgRgb = hexToRgb(CONFIG.background);
  let gradientSteps = 60;
  for (let i = gradientSteps; i >= 0; i--) {
    let t = i / gradientSteps;
    let radius = CANVAS_SIZE * 0.75 * t;
    let glowColor = lerpRgb(bgRgb, rgbColors[0], (1 - t) * 0.08);
    fill(glowColor[0], glowColor[1], glowColor[2], 255);
    ellipse(cx, cy, radius * 2, radius * 2);
  }

  // ── Layer 2: Phyllotaxis spiral elements ──
  let maxRadius = sc * Math.sqrt(n);

  for (let i = 0; i < n; i++) {
    let angle = i * angleRad;
    let r = sc * Math.sqrt(i);
    let x = cx + r * Math.cos(angle);
    let y = cy + r * Math.sin(angle);

    let colorT = (i / n + paletteOffset) % 1;
    let col = paletteColor(colorT, rgbColors);

    let normalizedR = r / maxRadius;
    let baseSize = (1 - normalizedR * 0.6) * sc * 0.9 * sizeVariation;
    let elemVariation = seededRandomRange(0.7, 1.3);
    let elemSize = baseSize * elemVariation;
    if (elemSize < 1) elemSize = 1;

    let alpha = 200 - normalizedR * 80 + seededRandomRange(-20, 20);
    alpha = Math.max(60, Math.min(255, alpha));

    fill(col[0], col[1], col[2], alpha);

    let currentShape = shapeMode;
    if (shapeMode === 3) currentShape = seededRandomInt(0, 2);

    let elemRotation = rotationBase + angle * 0.3;

    if (currentShape === 0) {
      noStroke();
      ellipse(x, y, elemSize, elemSize);
    } else if (currentShape === 1) {
      push();
      translate(x, y);
      rotate(elemRotation);
      noStroke();
      let half = elemSize / 2;
      beginShape();
      vertex(0, -half);
      vertex(half, 0);
      vertex(0, half);
      vertex(-half, 0);
      endShape(CLOSE);
      pop();
    } else {
      push();
      translate(x, y);
      rotate(elemRotation);
      noStroke();
      let hr = elemSize / 2;
      beginShape();
      for (let a = 0; a < 6; a++) {
        let ha = (a * Math.PI) / 3;
        vertex(hr * Math.cos(ha), hr * Math.sin(ha));
      }
      endShape(CLOSE);
      pop();
    }

    if (i % 5 === 0 && elemSize > 3) {
      noFill();
      stroke(col[0], col[1], col[2], alpha * 0.3);
      strokeWeight(0.5);
      ellipse(x, y, elemSize * 1.5, elemSize * 1.5);
      noStroke();
    }
  }

  // ── Layer 2b: Center glow accent ──
  noStroke();
  let accentRgb = hexToRgb(CONFIG.colors[2]);
  for (let i = 20; i >= 0; i--) {
    let t = i / 20;
    let glowR = 60 * t;
    let glowA = (1 - t) * 25;
    fill(accentRgb[0], accentRgb[1], accentRgb[2], glowA);
    ellipse(cx, cy, glowR * 2, glowR * 2);
  }
}
```

## Algorithm

Phyllotaxis describes the arrangement of leaves, seeds, or florets in plants. Each element is placed at a fixed divergence angle (approximately 137.508 degrees, the golden angle) from the previous one, at a distance proportional to the square root of its index. This produces Fibonacci spirals visible in sunflower heads. The angle offset parameter lets you explore how tiny deviations from the golden angle create dramatically different patterns.
