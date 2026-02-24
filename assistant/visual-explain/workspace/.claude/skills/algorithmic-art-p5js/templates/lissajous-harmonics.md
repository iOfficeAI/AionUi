# Lissajous Harmonics

Parametric curves from harmonic oscillation. Multiple Lissajous figures are layered with varying frequency ratios and phase offsets to create intricate interference patterns.

## Category

mathematics

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  freqRatio: 3,
  phaseSlider: 157,
  lineCount: 10,
  colors: ['#d97757', '#6a9bcc', '#88d4ab'],
  background: '#0a0a14',
};
```

## Parameters

| Name            | ID          | Min | Max | Default |
| --------------- | ----------- | --- | --- | ------- |
| Frequency Ratio | freqRatio   | 1   | 7   | 3       |
| Phase           | phaseSlider | 0   | 628 | 157     |
| Line Count      | lineCount   | 3   | 20  | 10      |

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
  let amplitude = CANVAS_SIZE * 0.38;

  let basePhase = (CONFIG.phaseSlider / 628) * Math.PI * 2;
  let baseFreqA = CONFIG.freqRatio;
  let baseFreqB = 1;
  let numCurves = CONFIG.lineCount;

  let freqOffsetA = seededRandomRange(-0.5, 0.5);
  let freqOffsetB = seededRandomRange(-0.3, 0.3);
  let phaseJitter = seededRandomRange(-0.5, 0.5);
  let colorOffset = seededRandomRange(0, 1);
  let amplitudeModulation = seededRandomRange(0.85, 1.0);

  let rgbColors = CONFIG.colors.map(hexToRgb);
  let bgRgb = hexToRgb(CONFIG.background);

  // ── Layer 1: Faint background dot grid ──
  let gridSpacing = 40;
  let dotSize = 1.5;
  noStroke();
  for (let gx = gridSpacing; gx < CANVAS_SIZE; gx += gridSpacing) {
    for (let gy = gridSpacing; gy < CANVAS_SIZE; gy += gridSpacing) {
      let dx = gx - cx;
      let dy = gy - cy;
      let dist = Math.sqrt(dx * dx + dy * dy);
      let maxDist = CANVAS_SIZE * 0.7;
      let brightness = Math.max(0, 1 - dist / maxDist);
      let alpha = brightness * 30 + 5;
      let tint = paletteColor((gx + gy) / (CANVAS_SIZE * 2) + colorOffset, rgbColors);
      fill(tint[0], tint[1], tint[2], alpha);
      ellipse(gx, gy, dotSize, dotSize);
    }
  }

  stroke(rgbColors[0][0], rgbColors[0][1], rgbColors[0][2], 12);
  strokeWeight(0.5);
  line(cx, 0, cx, CANVAS_SIZE);
  line(0, cy, CANVAS_SIZE, cy);

  // ── Layer 2: Multiple overlapping Lissajous curves ──
  let resolution = 4000;

  for (let curveIdx = 0; curveIdx < numCurves; curveIdx++) {
    let curveT = curveIdx / numCurves;

    let freqA = baseFreqA + freqOffsetA + (seededRandomRange(-0.15, 0.15) * curveIdx) / numCurves;
    let freqB = baseFreqB + freqOffsetB + (seededRandomRange(-0.1, 0.1) * curveIdx) / numCurves;
    let curvePhase = basePhase + phaseJitter + curveT * Math.PI * 0.3 + seededRandomRange(-0.2, 0.2);

    let ampX = amplitude * (0.7 + curveT * 0.3) * amplitudeModulation;
    let ampY = amplitude * (0.7 + curveT * 0.3) * amplitudeModulation;

    let col = paletteColor(curveT + colorOffset, rgbColors);

    let baseFade = 1 - Math.abs(curveT - 0.5) * 1.2;
    baseFade = Math.max(0.2, Math.min(1, baseFade));
    let alpha = baseFade * 120 + 20;
    let weight = 0.5 + baseFade * 1.8;

    stroke(col[0], col[1], col[2], alpha);
    strokeWeight(weight);
    noFill();

    beginShape();
    for (let i = 0; i <= resolution; i++) {
      let t = (i / resolution) * Math.PI * 2;
      let x = cx + ampX * Math.sin(freqA * t + curvePhase);
      let y = cy + ampY * Math.sin(freqB * t);

      let modX = 1 + 0.03 * Math.sin(t * 3.7 + curveIdx);
      let modY = 1 + 0.03 * Math.cos(t * 2.3 + curveIdx * 0.5);
      x = cx + (x - cx) * modX;
      y = cy + (y - cy) * modY;

      curveVertex(x, y);
    }
    endShape();

    if (curveIdx % 3 === 0) {
      noStroke();
      let dotAlpha = alpha * 0.6;
      fill(col[0], col[1], col[2], dotAlpha);
      let dotCount = 12 + seededRandomInt(0, 8);
      for (let d = 0; d < dotCount; d++) {
        let t = (d / dotCount) * Math.PI * 2;
        let x = cx + ampX * Math.sin(freqA * t + curvePhase);
        let y = cy + ampY * Math.sin(freqB * t);
        let dotR = 2 + baseFade * 3;
        ellipse(x, y, dotR, dotR);
      }
    }
  }

  // ── Layer 2b: Central glow ──
  noStroke();
  let glowColor = hexToRgb(CONFIG.colors[2]);
  for (let i = 30; i >= 0; i--) {
    let t = i / 30;
    let r = 100 * t;
    let a = (1 - t) * 10;
    fill(glowColor[0], glowColor[1], glowColor[2], a);
    ellipse(cx, cy, r * 2, r * 2);
  }

  // ── Layer 2c: Subtle outer vignette ──
  let vignetteSteps = 50;
  for (let i = 0; i < vignetteSteps; i++) {
    let t = i / vignetteSteps;
    let inset = t * CANVAS_SIZE * 0.15;
    let a = (1 - t) * 60;
    noFill();
    stroke(0, 0, 0, a);
    strokeWeight((CANVAS_SIZE * 0.15) / vignetteSteps + 1);
    rectMode(CORNER);
    rect(inset, inset, CANVAS_SIZE - 2 * inset, CANVAS_SIZE - 2 * inset);
  }
}
```

## Algorithm

Lissajous curves are the family of parametric curves defined by x = A sin(at + d) and y = B sin(bt), where a and b are frequencies and d is the phase difference. When a/b is rational, the curve closes; when irrational, it fills a region densely. This artwork layers multiple curves with seed-varied frequency combinations, phase relationships, and amplitude modulations.
