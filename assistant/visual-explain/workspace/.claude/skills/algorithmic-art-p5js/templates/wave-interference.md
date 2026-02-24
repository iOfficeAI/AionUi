# Wave Interference

Overlapping circular waves creating interference patterns. Multiple point sources emit sine waves that constructively and destructively combine across the canvas.

## Category

physics

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  sourceCount: 4,
  frequency: 25,
  amplitude: 50,
  colors: ['#1a0533', '#0f3460', '#e8c547'],
  background: '#0a0a14',
};
```

## Parameters

| Name         | ID          | Min | Max | Default |
| ------------ | ----------- | --- | --- | ------- |
| Source Count | sourceCount | 2   | 8   | 4       |
| Frequency    | frequency   | 1   | 50  | 25      |
| Amplitude    | amplitude   | 10  | 100 | 50      |

## Colors

| Label    | Default |
| -------- | ------- |
| Negative | #1a0533 |
| Zero     | #0f3460 |
| Positive | #e8c547 |

## Helpers

```javascript
function hexToRGB(hex) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function lerpRGB(c1, c2, t) {
  t = constrain(t, 0, 1);
  return {
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t,
  };
}
```

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  // Map frequency slider (1-50) to actual frequency (0.02-0.2)
  let freq = map(CONFIG.frequency, 1, 50, 0.02, 0.2);
  let amp = CONFIG.amplitude;
  let numSources = CONFIG.sourceCount;

  // Generate seeded source positions
  let sources = [];
  let margin = 150;
  for (let i = 0; i < numSources; i++) {
    sources.push({
      x: seededRandomRange(margin, width - margin),
      y: seededRandomRange(margin, height - margin),
      phase: seededRandomRange(0, TWO_PI),
    });
  }

  // Parse colors for interpolation
  let colNeg = hexToRGB(CONFIG.colors[0]);
  let colZero = hexToRGB(CONFIG.colors[1]);
  let colPos = hexToRGB(CONFIG.colors[2]);

  // ── Layer 1: Interference pattern across entire canvas ──
  loadPixels();
  let resolution = 2;
  for (let py = 0; py < height; py += resolution) {
    for (let px = 0; px < width; px += resolution) {
      let totalAmp = 0;
      for (let s = 0; s < sources.length; s++) {
        let dx = px - sources[s].x;
        let dy = py - sources[s].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        totalAmp += Math.sin(dist * freq + sources[s].phase);
      }

      let normalized = totalAmp / numSources;

      let col;
      if (normalized < 0) {
        col = lerpRGB(colNeg, colZero, normalized + 1);
      } else {
        col = lerpRGB(colZero, colPos, normalized);
      }

      let intensity = map(Math.abs(normalized), 0, 1, 0.6, 1.0);
      col.r *= intensity;
      col.g *= intensity;
      col.b *= intensity;

      for (let dy = 0; dy < resolution && py + dy < height; dy++) {
        for (let dx = 0; dx < resolution && px + dx < width; dx++) {
          let idx = ((py + dy) * width + (px + dx)) * 4;
          pixels[idx] = col.r;
          pixels[idx + 1] = col.g;
          pixels[idx + 2] = col.b;
          pixels[idx + 3] = 255;
        }
      }
    }
  }
  updatePixels();

  // ── Layer 2: Bright dots at wave source positions ──
  for (let s = 0; s < sources.length; s++) {
    noStroke();
    for (let r = 30; r > 0; r -= 2) {
      let alpha = map(r, 30, 0, 5, 60);
      let glowCol = color(CONFIG.colors[2]);
      glowCol.setAlpha(alpha);
      fill(glowCol);
      ellipse(sources[s].x, sources[s].y, r * 2, r * 2);
    }

    fill(255, 255, 255, 230);
    noStroke();
    ellipse(sources[s].x, sources[s].y, 8, 8);

    noFill();
    stroke(255, 255, 255, 80);
    strokeWeight(1);
    ellipse(sources[s].x, sources[s].y, 20, 20);
  }
}
```

## Algorithm

This artwork simulates the wave superposition principle from physics. Multiple point sources are placed at seeded random positions, each emitting circular sine waves. At every pixel, the algorithm computes the sum of all wave contributions based on distance from each source. Constructive interference (where waves align) produces bright peaks, while destructive interference (where waves cancel) creates dark troughs.
