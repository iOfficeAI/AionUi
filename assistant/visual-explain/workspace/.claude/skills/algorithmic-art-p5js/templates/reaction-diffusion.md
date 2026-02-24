# Reaction-Diffusion

Gray-Scott model simulation generating Turing patterns. Two virtual chemicals diffuse and react to create organic spots, stripes, and labyrinthine structures.

## Category

biology

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  feedRate: 55,
  killRate: 62,
  simulationSteps: 800,
  colors: ['#0b1628', '#d97757', '#f0e6d3'],
  background: '#0a0a14',
};
```

## Parameters

| Name             | ID              | Min | Max  | Default |
| ---------------- | --------------- | --- | ---- | ------- |
| Feed Rate        | feedRate        | 30  | 80   | 55      |
| Kill Rate        | killRate        | 45  | 70   | 62      |
| Simulation Steps | simulationSteps | 200 | 2000 | 800     |

## Colors

| Label | Default |
| ----- | ------- |
| Low   | #0b1628 |
| Mid   | #d97757 |
| High  | #f0e6d3 |

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  const N = 300;
  const f = CONFIG.feedRate / 1000;
  const k = CONFIG.killRate / 1000;
  const dA = 1.0;
  const dB = 0.5;
  const dt = 1.0;
  const steps = CONFIG.simulationSteps;

  let gridA = new Float32Array(N * N);
  let gridB = new Float32Array(N * N);
  let nextA = new Float32Array(N * N);
  let nextB = new Float32Array(N * N);

  for (let i = 0; i < N * N; i++) {
    gridA[i] = 1.0;
    gridB[i] = 0.0;
  }

  // Seed B at random spots
  let numSeeds = seededRandomInt(8, 25);
  for (let s = 0; s < numSeeds; s++) {
    let cx = seededRandomInt(20, N - 20);
    let cy = seededRandomInt(20, N - 20);
    let radius = seededRandomInt(3, 10);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          let px = cx + dx;
          let py = cy + dy;
          if (px >= 0 && px < N && py >= 0 && py < N) {
            gridB[py * N + px] = 1.0;
          }
        }
      }
    }
  }

  // Run Gray-Scott simulation
  for (let step = 0; step < steps; step++) {
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        let idx = y * N + x;
        let a = gridA[idx];
        let b = gridB[idx];

        let lapA = gridA[idx - 1] + gridA[idx + 1] + gridA[idx - N] + gridA[idx + N] - 4 * a;
        let lapB = gridB[idx - 1] + gridB[idx + 1] + gridB[idx - N] + gridB[idx + N] - 4 * b;

        let abb = a * b * b;
        nextA[idx] = a + dt * (dA * lapA - abb + f * (1.0 - a));
        nextB[idx] = b + dt * (dB * lapB + abb - (k + f) * b);

        if (nextA[idx] < 0) nextA[idx] = 0;
        if (nextA[idx] > 1) nextA[idx] = 1;
        if (nextB[idx] < 0) nextB[idx] = 0;
        if (nextB[idx] > 1) nextB[idx] = 1;
      }
    }

    let tmpA = gridA;
    let tmpB = gridB;
    gridA = nextA;
    gridB = nextB;
    nextA = tmpA;
    nextB = tmpB;
  }

  // Parse colors
  function hexToRGB(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  let c0 = hexToRGB(CONFIG.colors[0]);
  let c1 = hexToRGB(CONFIG.colors[1]);
  let c2 = hexToRGB(CONFIG.colors[2]);

  function lerpColor3(t) {
    if (t <= 0.5) {
      let s = t * 2;
      return [c0[0] + (c1[0] - c0[0]) * s, c0[1] + (c1[1] - c0[1]) * s, c0[2] + (c1[2] - c0[2]) * s];
    } else {
      let s = (t - 0.5) * 2;
      return [c1[0] + (c2[0] - c1[0]) * s, c1[1] + (c2[1] - c1[1]) * s, c1[2] + (c2[2] - c1[2]) * s];
    }
  }

  // Layer 1: Render pattern
  loadPixels();
  let scale = CANVAS_SIZE / N;
  for (let cy = 0; cy < CANVAS_SIZE; cy++) {
    for (let cx = 0; cx < CANVAS_SIZE; cx++) {
      let gx = Math.floor(cx / scale);
      let gy = Math.floor(cy / scale);
      if (gx >= N) gx = N - 1;
      if (gy >= N) gy = N - 1;

      let idx = gy * N + gx;
      let val = gridA[idx] - gridB[idx];
      val = (val + 1) * 0.5;
      val = Math.max(0, Math.min(1, val));

      let col = lerpColor3(val);
      let pIdx = (cy * CANVAS_SIZE + cx) * 4;
      pixels[pIdx] = col[0];
      pixels[pIdx + 1] = col[1];
      pixels[pIdx + 2] = col[2];
      pixels[pIdx + 3] = 255;
    }
  }
  updatePixels();

  // Layer 2: Circular vignette
  let vignetteGfx = createGraphics(CANVAS_SIZE, CANVAS_SIZE);
  vignetteGfx.noStroke();
  let maxRadius = CANVAS_SIZE * 0.75;
  let numRings = 80;
  for (let i = numRings; i >= 0; i--) {
    let t = i / numRings;
    let radius = maxRadius * t + CANVAS_SIZE * 0.5 * (1 - t);
    let alpha = (1 - t) * 180;
    vignetteGfx.fill(0, 0, 0, alpha);
    vignetteGfx.ellipse(CANVAS_SIZE / 2, CANVAS_SIZE / 2, radius * 2, radius * 2);
  }
  image(vignetteGfx, 0, 0);
  vignetteGfx.remove();
}
```

## Algorithm

This artwork simulates the Gray-Scott reaction-diffusion model, where two chemicals (A and B) diffuse at different rates and react with each other. Chemical A is continuously fed into the system while the reaction product B is removed at a kill rate. The interplay produces a rich variety of Turing patterns — from spots and loops to complex labyrinthine structures. Each seed determines unique initial B chemical placements.
