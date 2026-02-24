# N-Body Gravity

Gravitational orbital trails from N-body simulation. Bodies interact through Newtonian gravity, tracing elegant curves as they orbit, scatter, and spiral around each other.

## Category

physics

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  bodyCount: 8,
  trailLength: 800,
  gravitationalConstant: 30,
  colors: ['#d97757', '#6a9bcc', '#88d4ab', '#e8c547', '#cc6a9b'],
  background: '#0a0a14',
};
```

## Parameters

| Name         | ID                    | Min | Max  | Default |
| ------------ | --------------------- | --- | ---- | ------- |
| Body Count   | bodyCount             | 3   | 20   | 8       |
| Trail Length | trailLength           | 100 | 2000 | 800     |
| Gravity      | gravitationalConstant | 1   | 100  | 30      |

## Colors

| Label   | Default |
| ------- | ------- |
| Trail 1 | #d97757 |
| Trail 2 | #6a9bcc |
| Trail 3 | #88d4ab |
| Trail 4 | #e8c547 |
| Trail 5 | #cc6a9b |

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  let numBodies = CONFIG.bodyCount;
  let steps = CONFIG.trailLength;
  let G = map(CONFIG.gravitationalConstant, 1, 100, 0.1, 10.0);
  let dt = 0.4;
  let softening = 20;
  let centerX = width / 2;
  let centerY = height / 2;

  // ── Layer 1: Starfield background ──
  noStroke();
  for (let i = 0; i < 600; i++) {
    let sx = seededRandom() * width;
    let sy = seededRandom() * height;
    let brightness = seededRandomRange(80, 255);
    let starSize = seededRandomRange(0.5, 2.5);
    fill(brightness, brightness, brightness + 20, seededRandomRange(60, 200));
    ellipse(sx, sy, starSize, starSize);
  }

  for (let i = 0; i < 15; i++) {
    let sx = seededRandom() * width;
    let sy = seededRandom() * height;
    for (let r = 8; r > 0; r -= 2) {
      fill(255, 255, 240, map(r, 8, 0, 3, 15));
      ellipse(sx, sy, r * 2, r * 2);
    }
    fill(255, 255, 250, 200);
    ellipse(sx, sy, 2, 2);
  }

  // ── Initialize bodies ──
  let bodies = [];
  for (let i = 0; i < numBodies; i++) {
    let angle = seededRandomRange(0, TWO_PI);
    let radius = seededRandomRange(100, 400);
    let px = centerX + Math.cos(angle) * radius;
    let py = centerY + Math.sin(angle) * radius;

    let speed = seededRandomRange(0.5, 3.0);
    let velAngle = angle + HALF_PI + seededRandomRange(-0.5, 0.5);
    let vx = Math.cos(velAngle) * speed;
    let vy = Math.sin(velAngle) * speed;

    let mass = seededRandomRange(5, 40);

    bodies.push({
      x: px,
      y: py,
      vx: vx,
      vy: vy,
      mass: mass,
      trail: [{ x: px, y: py }],
      colorIdx: i % CONFIG.colors.length,
    });
  }

  // ── Simulate N-body gravity ──
  for (let step = 0; step < steps; step++) {
    let ax = new Array(numBodies).fill(0);
    let ay = new Array(numBodies).fill(0);

    for (let i = 0; i < numBodies; i++) {
      for (let j = i + 1; j < numBodies; j++) {
        let dx = bodies[j].x - bodies[i].x;
        let dy = bodies[j].y - bodies[i].y;
        let distSq = dx * dx + dy * dy + softening * softening;
        let dist = Math.sqrt(distSq);
        let force = (G * bodies[i].mass * bodies[j].mass) / distSq;

        let fx = (force * dx) / dist;
        let fy = (force * dy) / dist;

        ax[i] += fx / bodies[i].mass;
        ay[i] += fy / bodies[i].mass;
        ax[j] -= fx / bodies[j].mass;
        ay[j] -= fy / bodies[j].mass;
      }
    }

    for (let i = 0; i < numBodies; i++) {
      bodies[i].vx += ax[i] * dt;
      bodies[i].vy += ay[i] * dt;
      bodies[i].x += bodies[i].vx * dt;
      bodies[i].y += bodies[i].vy * dt;
      bodies[i].trail.push({ x: bodies[i].x, y: bodies[i].y });
    }
  }

  // ── Layer 2: Draw orbital trails ──
  noFill();
  for (let i = 0; i < numBodies; i++) {
    let trail = bodies[i].trail;
    let col = color(CONFIG.colors[bodies[i].colorIdx]);
    let totalPoints = trail.length;

    let segmentSize = 20;
    for (let s = 0; s < totalPoints - 1; s += segmentSize) {
      let endIdx = Math.min(s + segmentSize + 3, totalPoints);
      let progress = s / totalPoints;
      let alpha = map(progress, 0, 1, 8, 180);
      let sw = map(progress, 0, 1, 0.4, 2.2);

      col.setAlpha(alpha);
      stroke(col);
      strokeWeight(sw);

      beginShape();
      for (let p = s; p < endIdx; p++) {
        curveVertex(trail[p].x, trail[p].y);
      }
      endShape();
    }

    let lastPos = trail[trail.length - 1];
    noStroke();

    for (let r = 15; r > 0; r -= 2) {
      let glowCol = color(CONFIG.colors[bodies[i].colorIdx]);
      glowCol.setAlpha(map(r, 15, 0, 5, 50));
      fill(glowCol);
      ellipse(lastPos.x, lastPos.y, r * 2, r * 2);
    }

    let dotSize = map(bodies[i].mass, 5, 40, 3, 8);
    fill(255, 255, 255, 220);
    ellipse(lastPos.x, lastPos.y, dotSize, dotSize);
  }
}
```

## Algorithm

This artwork simulates Newtonian gravitational interaction among multiple bodies. Each body is initialized with seeded random position, velocity, and mass. The simulation runs for thousands of timesteps, computing pairwise gravitational forces with a softening parameter to prevent singularities. Each body's trajectory is recorded and drawn as a smooth, color-coded curve with opacity that fades over time.
