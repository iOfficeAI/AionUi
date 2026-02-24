# Flocking Boids

Reynolds flocking simulation with trail visualization. Autonomous agents follow three simple rules — separation, alignment, and cohesion — producing emergent collective behavior.

## Category

biology

## DEFAULT_CONFIG

```javascript
const DEFAULT_CONFIG = {
  boidCount: 150,
  separation: 25,
  alignment: 25,
  cohesion: 25,
  colors: ['#d97757', '#6a9bcc', '#88d4ab'],
  background: '#0a0a14',
};
```

## Parameters

| Name       | ID         | Min | Max | Default |
| ---------- | ---------- | --- | --- | ------- |
| Boid Count | boidCount  | 50  | 300 | 150     |
| Separation | separation | 1   | 50  | 25      |
| Alignment  | alignment  | 1   | 50  | 25      |
| Cohesion   | cohesion   | 1   | 50  | 25      |

## Colors

| Label   | Default |
| ------- | ------- |
| Trail 1 | #d97757 |
| Trail 2 | #6a9bcc |
| Trail 3 | #88d4ab |

## generateArt

```javascript
function generateArt() {
  background(CONFIG.background);

  let sepForce = (CONFIG.separation / 50) * 2.5 + 0.5;
  let aliForce = (CONFIG.alignment / 50) * 1.8 + 0.2;
  let cohForce = (CONFIG.cohesion / 50) * 1.8 + 0.2;

  let numBoids = CONFIG.boidCount;
  let simSteps = 500;
  let maxSpeed = 4.0;
  let maxForce = 0.15;
  let perceptionRadius = 60;

  function hexToRGB(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  let palette = CONFIG.colors.map(hexToRGB);

  // Initialize boids
  let boids = [];
  for (let i = 0; i < numBoids; i++) {
    let x = seededRandomRange(100, CANVAS_SIZE - 100);
    let y = seededRandomRange(100, CANVAS_SIZE - 100);
    let angle = seededRandomRange(0, 2 * Math.PI);
    let speed = seededRandomRange(1.5, 3.5);
    boids.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      colorIdx: i % palette.length,
      trail: [{ x: x, y: y }],
    });
  }

  // Run simulation
  for (let step = 0; step < simSteps; step++) {
    for (let i = 0; i < numBoids; i++) {
      let boid = boids[i];

      let sepX = 0,
        sepY = 0,
        sepCount = 0;
      let aliX = 0,
        aliY = 0,
        aliCount = 0;
      let cohX = 0,
        cohY = 0,
        cohCount = 0;

      for (let j = 0; j < numBoids; j++) {
        if (i === j) continue;
        let other = boids[j];
        let dx = other.x - boid.x;
        let dy = other.y - boid.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < perceptionRadius && dist > 0) {
          if (dist < perceptionRadius * 0.5) {
            sepX -= dx / dist;
            sepY -= dy / dist;
            sepCount++;
          }
          aliX += other.vx;
          aliY += other.vy;
          aliCount++;
          cohX += other.x;
          cohY += other.y;
          cohCount++;
        }
      }

      let ax = 0,
        ay = 0;

      if (sepCount > 0) {
        sepX /= sepCount;
        sepY /= sepCount;
        let sepMag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (sepMag > 0) {
          sepX = (sepX / sepMag) * maxSpeed - boid.vx;
          sepY = (sepY / sepMag) * maxSpeed - boid.vy;
          let fm = Math.sqrt(sepX * sepX + sepY * sepY);
          if (fm > maxForce) {
            sepX = (sepX / fm) * maxForce;
            sepY = (sepY / fm) * maxForce;
          }
        }
        ax += sepX * sepForce;
        ay += sepY * sepForce;
      }

      if (aliCount > 0) {
        aliX /= aliCount;
        aliY /= aliCount;
        let aliMag = Math.sqrt(aliX * aliX + aliY * aliY);
        if (aliMag > 0) {
          aliX = (aliX / aliMag) * maxSpeed - boid.vx;
          aliY = (aliY / aliMag) * maxSpeed - boid.vy;
          let fm = Math.sqrt(aliX * aliX + aliY * aliY);
          if (fm > maxForce) {
            aliX = (aliX / fm) * maxForce;
            aliY = (aliY / fm) * maxForce;
          }
        }
        ax += aliX * aliForce;
        ay += aliY * aliForce;
      }

      if (cohCount > 0) {
        cohX = cohX / cohCount - boid.x;
        cohY = cohY / cohCount - boid.y;
        let cohMag = Math.sqrt(cohX * cohX + cohY * cohY);
        if (cohMag > 0) {
          cohX = (cohX / cohMag) * maxSpeed - boid.vx;
          cohY = (cohY / cohMag) * maxSpeed - boid.vy;
          let fm = Math.sqrt(cohX * cohX + cohY * cohY);
          if (fm > maxForce) {
            cohX = (cohX / fm) * maxForce;
            cohY = (cohY / fm) * maxForce;
          }
        }
        ax += cohX * cohForce;
        ay += cohY * cohForce;
      }

      let margin = 80;
      let turnForce = 0.3;
      if (boid.x < margin) ax += turnForce;
      if (boid.x > CANVAS_SIZE - margin) ax -= turnForce;
      if (boid.y < margin) ay += turnForce;
      if (boid.y > CANVAS_SIZE - margin) ay -= turnForce;

      boid.vx += ax;
      boid.vy += ay;

      let speed = Math.sqrt(boid.vx * boid.vx + boid.vy * boid.vy);
      if (speed > maxSpeed) {
        boid.vx = (boid.vx / speed) * maxSpeed;
        boid.vy = (boid.vy / speed) * maxSpeed;
      }

      boid.x += boid.vx;
      boid.y += boid.vy;

      if (boid.x < 0) boid.x += CANVAS_SIZE;
      if (boid.x >= CANVAS_SIZE) boid.x -= CANVAS_SIZE;
      if (boid.y < 0) boid.y += CANVAS_SIZE;
      if (boid.y >= CANVAS_SIZE) boid.y -= CANVAS_SIZE;

      boid.trail.push({ x: boid.x, y: boid.y });
    }
  }

  // Layer 1: Subtle radial gradient background
  let bgGfx = createGraphics(CANVAS_SIZE, CANVAS_SIZE);
  let bgCol = hexToRGB(CONFIG.background);
  bgGfx.noStroke();
  let gradSteps = 60;
  for (let i = gradSteps; i >= 0; i--) {
    let t = i / gradSteps;
    let radius = CANVAS_SIZE * 0.85 * (1 - t) + 100;
    let r = Math.min(255, bgCol[0] + (1 - t) * 25);
    let g = Math.min(255, bgCol[1] + (1 - t) * 15);
    let b = Math.min(255, bgCol[2] + (1 - t) * 35);
    bgGfx.fill(r, g, b);
    bgGfx.ellipse(CANVAS_SIZE / 2, CANVAS_SIZE / 2, radius * 2, radius * 2);
  }
  image(bgGfx, 0, 0);
  bgGfx.remove();

  // Layer 2: Draw boid trails
  noFill();
  for (let i = 0; i < numBoids; i++) {
    let boid = boids[i];
    let trail = boid.trail;
    let col = palette[boid.colorIdx];
    if (trail.length < 2) continue;
    let totalPts = trail.length;

    for (let s = 0; s < totalPts - 1; s += 1) {
      let t = s / totalPts;
      let alpha = t * t * 120 + 5;
      let weight = 0.5 + t * 2.0;

      stroke(col[0], col[1], col[2], alpha);
      strokeWeight(weight);

      let nextIdx = Math.min(s + 1, totalPts - 1);
      line(trail[s].x, trail[s].y, trail[nextIdx].x, trail[nextIdx].y);
    }

    let lastPt = trail[trail.length - 1];
    noStroke();
    fill(col[0], col[1], col[2], 200);
    ellipse(lastPt.x, lastPt.y, 4, 4);
  }
}
```

## Algorithm

This artwork simulates Craig Reynolds' boids flocking algorithm, where each autonomous agent follows three simple rules: separation (avoid crowding neighbors), alignment (steer toward average heading of neighbors), and cohesion (steer toward average position of neighbors). The simulation runs for many timesteps, recording each boid's trajectory. The final image renders these trajectories as smooth, colored curves with opacity increasing toward the trail's end.
