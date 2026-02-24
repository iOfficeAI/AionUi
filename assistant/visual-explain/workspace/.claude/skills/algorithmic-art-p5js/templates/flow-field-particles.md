# Flow Field Particles

Perlin noise vector field with particle trails. Thousands of particles follow invisible currents defined by layered noise, creating organic fluid-like patterns.

## Category

physics

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  noiseScale: 50,
  particleCount: 1000,
  stepLength: 4,
  numSteps: 200,
  colors: ['#d97757', '#6a9bcc', '#88d4ab', '#e8c547'],
  background: '#0a0a14',
};
```

## Parameters

| Name           | ID            | Min | Max  | Default |
| -------------- | ------------- | --- | ---- | ------- |
| Noise Scale    | noiseScale    | 1   | 100  | 50      |
| Particle Count | particleCount | 100 | 3000 | 1000    |
| Step Length    | stepLength    | 1   | 10   | 4       |
| Num Steps      | numSteps      | 50  | 500  | 200     |

## Colors

| Label    | Default |
| -------- | ------- |
| Stream 1 | #d97757 |
| Stream 2 | #6a9bcc |
| Stream 3 | #88d4ab |
| Stream 4 | #e8c547 |

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  // Map noiseScale slider (1-100) to actual noise scale (0.001-0.02)
  let ns = map(CONFIG.noiseScale, 1, 100, 0.001, 0.02);

  // Seeded noise offset so different seeds produce different patterns
  let noiseOffX = seededRandom() * 10000;
  let noiseOffY = seededRandom() * 10000;

  // ── Layer 1: Subtle noise-based background texture ──
  loadPixels();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = noise((x + noiseOffX) * 0.005, (y + noiseOffY) * 0.005);
      let brightness = map(n, 0, 1, 6, 22);
      let idx = (y * width + x) * 4;
      pixels[idx] = brightness * 0.4;
      pixels[idx + 1] = brightness * 0.4;
      pixels[idx + 2] = brightness * 0.7;
      pixels[idx + 3] = 255;
    }
  }
  updatePixels();

  // ── Layer 2: Flow field particle curves ──
  let pCount = CONFIG.particleCount;
  let stepLen = CONFIG.stepLength;
  let steps = CONFIG.numSteps;
  let margin = 50;

  for (let i = 0; i < pCount; i++) {
    // Spawn particle at seeded random position
    let x = seededRandomRange(-margin, width + margin);
    let y = seededRandomRange(-margin, height + margin);

    // Pick a color from CONFIG.colors
    let colIdx = seededRandomInt(0, CONFIG.colors.length - 1);
    let c = color(CONFIG.colors[colIdx]);

    // Vary opacity and stroke weight per particle
    let alpha = seededRandomRange(15, 80);
    let sw = seededRandomRange(0.3, 1.8);

    c.setAlpha(alpha);
    stroke(c);
    strokeWeight(sw);
    noFill();

    // Walk through the flow field using curveVertex
    beginShape();
    curveVertex(x, y);

    for (let s = 0; s < steps; s++) {
      let angle = noise((x + noiseOffX) * ns, (y + noiseOffY) * ns) * TWO_PI * 2;
      x += Math.cos(angle) * stepLen;
      y += Math.sin(angle) * stepLen;

      curveVertex(x, y);

      // Stop if particle leaves canvas significantly
      if (x < -margin * 2 || x > width + margin * 2 || y < -margin * 2 || y > height + margin * 2) {
        break;
      }
    }

    curveVertex(x, y);
    endShape();
  }
}
```

## Algorithm

A Perlin noise field defines a continuous vector field across the canvas. Particles are spawned at seeded random positions and follow the field for hundreds of steps, tracing smooth curves with curveVertex. Each seed produces a unique noise offset, generating entirely different flow patterns. A subtle noise-based background texture adds depth beneath the flowing particle trails.
