# Fractal Tree

Recursive branching structure with natural variation. Each branch splits into child branches with seeded randomness controlling angles, lengths, and density.

## Category

geometry

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  maxDepth: 8,
  branchAngle: 30,
  lengthRatio: 70,
  colors: ['#5c3a1e', '#7a6b3a', '#88d4ab'],
  background: '#0a0a14',
};
```

## Parameters

| Name         | ID          | Min | Max | Default |
| ------------ | ----------- | --- | --- | ------- |
| Max Depth    | maxDepth    | 4   | 10  | 8       |
| Branch Angle | branchAngle | 15  | 60  | 30      |
| Length Ratio | lengthRatio | 40  | 90  | 70      |

## Colors

| Label    | Default |
| -------- | ------- |
| Trunk    | #5c3a1e |
| Branches | #7a6b3a |
| Leaves   | #88d4ab |

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

function lerpColorRgb(hex1, hex2, t) {
  let c1 = hexToRgb(hex1);
  let c2 = hexToRgb(hex2);
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

let leafPositions = [];
```

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);
  leafPositions = [];

  let ratio = CONFIG.lengthRatio / 100.0;
  let baseAngle = CONFIG.branchAngle;
  let maxD = CONFIG.maxDepth;

  drawGround();

  let trunkLength = CANVAS_SIZE * 0.22;
  let startX = CANVAS_SIZE / 2 + seededRandomRange(-30, 30);
  let startY = CANVAS_SIZE * 0.88;

  drawBranch(startX, startY, -90, trunkLength, 0, maxD, ratio, baseAngle);
  drawLeaves();
}

function drawGround() {
  noStroke();
  let groundStart = CANVAS_SIZE * 0.85;
  let bgRgb = hexToRgb(CONFIG.background);
  let groundColor = hexToRgb(CONFIG.colors[0]);

  for (let y = groundStart; y < CANVAS_SIZE; y++) {
    let t = (y - groundStart) / (CANVAS_SIZE - groundStart);
    fill(Math.round(bgRgb.r + (groundColor.r * 0.4 - bgRgb.r) * t * t), Math.round(bgRgb.g + (groundColor.g * 0.4 - bgRgb.g) * t * t), Math.round(bgRgb.b + (groundColor.b * 0.4 - bgRgb.b) * t * t));
    rect(0, y, CANVAS_SIZE, 1);
  }

  for (let i = 0; i < 800; i++) {
    let gx = seededRandomRange(0, CANVAS_SIZE);
    let gy = seededRandomRange(groundStart + 10, CANVAS_SIZE);
    fill(groundColor.r * 0.6, groundColor.g * 0.6, groundColor.b * 0.5, seededRandomRange(10, 40));
    ellipse(gx, gy, seededRandomRange(1, 4), seededRandomRange(0.5, 2));
  }

  let leafC = hexToRgb(CONFIG.colors[2]);
  for (let i = 0; i < 150; i++) {
    let gx = seededRandomRange(0, CANVAS_SIZE);
    let gy = seededRandomRange(groundStart - 5, groundStart + 30);
    let gh = seededRandomRange(5, 20);
    let gAngle = seededRandomRange(-30, 30);
    stroke(leafC.r * 0.5, leafC.g * 0.5, leafC.b * 0.4, seededRandomRange(30, 80));
    strokeWeight(seededRandomRange(0.5, 1.5));
    let radAngle = ((gAngle - 90) * Math.PI) / 180;
    line(gx, gy, gx + Math.cos(radAngle) * gh, gy + Math.sin(radAngle) * gh);
  }
}

function drawBranch(x, y, angle, len, depth, maxD, ratio, baseAngle) {
  if (depth > maxD || len < 2) return;

  let radAngle = (angle * Math.PI) / 180;
  let endX = x + Math.cos(radAngle) * len;
  let endY = y + Math.sin(radAngle) * len;

  let depthFraction = depth / maxD;
  let branchColor;
  if (depthFraction < 0.5) {
    branchColor = lerpColorRgb(CONFIG.colors[0], CONFIG.colors[1], depthFraction * 2);
  } else {
    branchColor = lerpColorRgb(CONFIG.colors[1], CONFIG.colors[2], (depthFraction - 0.5) * 2);
  }

  let sw = 18 * Math.pow(1 - depthFraction, 1.8) + 0.5;

  let ctrlX1 = x + ((x + endX) / 2 - x) * 0.5 + seededRandomRange(-3, 3);
  let ctrlY1 = y + ((y + endY) / 2 - y) * 0.5 + seededRandomRange(-3, 3);
  let ctrlX2 = (x + endX) / 2 + (endX - (x + endX) / 2) * 0.5 + seededRandomRange(-3, 3);
  let ctrlY2 = (y + endY) / 2 + (endY - (y + endY) / 2) * 0.5 + seededRandomRange(-3, 3);

  stroke(branchColor.r, branchColor.g, branchColor.b);
  strokeWeight(sw);
  strokeCap(ROUND);
  noFill();
  bezier(x, y, ctrlX1, ctrlY1, ctrlX2, ctrlY2, endX, endY);

  if (depth >= maxD - 1) {
    leafPositions.push({ x: endX, y: endY, size: seededRandomRange(3, 10), depthFrac: depthFraction });
  }

  let numChildren = seededRandom() < 0.35 ? 3 : 2;
  let childLen = len * ratio * seededRandomRange(0.85, 1.15);

  if (numChildren === 2) {
    let spread = baseAngle * seededRandomRange(0.7, 1.3);
    drawBranch(endX, endY, angle - spread + seededRandomRange(-8, 8), childLen, depth + 1, maxD, ratio, baseAngle);
    drawBranch(endX, endY, angle + spread + seededRandomRange(-8, 8), childLen * seededRandomRange(0.9, 1.1), depth + 1, maxD, ratio, baseAngle);
  } else {
    let spread = baseAngle * seededRandomRange(0.7, 1.3);
    drawBranch(endX, endY, angle - spread + seededRandomRange(-6, 6), childLen, depth + 1, maxD, ratio, baseAngle);
    drawBranch(endX, endY, angle + seededRandomRange(-10, 10), childLen * seededRandomRange(0.8, 1.0), depth + 1, maxD, ratio, baseAngle);
    drawBranch(endX, endY, angle + spread + seededRandomRange(-6, 6), childLen * seededRandomRange(0.85, 1.05), depth + 1, maxD, ratio, baseAngle);
  }
}

function drawLeaves() {
  noStroke();
  let leafRgb = hexToRgb(CONFIG.colors[2]);
  let branchRgb = hexToRgb(CONFIG.colors[1]);

  for (let i = 0; i < leafPositions.length; i++) {
    let leaf = leafPositions[i];
    let leafSize = leaf.size * seededRandomRange(0.6, 1.4);
    let lr = Math.max(0, Math.min(255, leafRgb.r + seededRandomRange(-20, 20)));
    let lg = Math.max(0, Math.min(255, leafRgb.g + seededRandomRange(-15, 15)));
    let lb = Math.max(0, Math.min(255, leafRgb.b + seededRandomRange(-10, 10)));
    let alpha = seededRandomRange(100, 220);

    fill(lr, lg, lb, alpha * 0.2);
    ellipse(leaf.x, leaf.y, leafSize * 2.5, leafSize * 2.5);

    fill(lr, lg, lb, alpha);
    ellipse(leaf.x, leaf.y, leafSize, leafSize * seededRandomRange(0.7, 1.3));

    if (seededRandom() < 0.3) {
      fill(255, 255, 240, seededRandomRange(40, 90));
      ellipse(leaf.x + seededRandomRange(-2, 2), leaf.y + seededRandomRange(-2, 2), leafSize * 0.4, leafSize * 0.4);
    }
  }

  for (let i = 0; i < 60; i++) {
    let fx = seededRandomRange(CANVAS_SIZE * 0.15, CANVAS_SIZE * 0.85);
    let fy = seededRandomRange(CANVAS_SIZE * 0.05, CANVAS_SIZE * 0.75);
    let mixT = seededRandom();
    fill(Math.round(leafRgb.r * mixT + branchRgb.r * (1 - mixT)), Math.round(leafRgb.g * mixT + branchRgb.g * (1 - mixT)), Math.round(leafRgb.b * mixT + branchRgb.b * (1 - mixT)), seededRandomRange(15, 60));
    ellipse(fx, fy, seededRandomRange(2, 5), seededRandomRange(2, 5));
  }
}
```

## Algorithm

This fractal tree is generated through recursive branching. Starting from a trunk at the bottom center, each branch splits into 2-3 child branches with seeded random variation in angle, length, and count. Stroke width tapers with depth, and colors transition from dark trunk tones to bright leaf tips. Terminal branches are adorned with leaf-like dots. A subtle ground gradient anchors the composition.
