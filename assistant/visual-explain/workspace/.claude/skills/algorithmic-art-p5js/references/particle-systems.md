# Particle Systems — Flow Fields, Flocking & Agent-Based Simulation

Expertise in particle-based visualization techniques.

## Flow Fields (Perlin Noise)

The most versatile visualization technique. Particles trace paths through a noise-based vector field.

### Algorithm

1. Create grid of angles: `angle[x][y] = noise(x * scale, y * scale) * TWO_PI`
2. Extend grid beyond canvas edges (×1.5) so curves can re-enter
3. Spawn particles at random or grid positions
4. Each frame: lookup angle at particle position, move in that direction
5. Draw line from previous to current position with low opacity
6. Fade background slightly for trail effect

### Key Parameters

| Parameter     | Range      | Effect                                   |
| ------------- | ---------- | ---------------------------------------- |
| noiseScale    | 0.001–0.02 | Low = gentle rivers, High = tight swirls |
| particleCount | 100–5000   | Density of field coverage                |
| flowSpeed     | 0.5–4.0    | Movement speed per step                  |
| trailOpacity  | 0.01–0.15  | Fade rate of trails                      |

### Curl Noise Variant

Produces divergence-free flow (no convergence points):

```
curl_x = dn/dy
curl_y = -dn/dx
```

Use finite differences to compute noise gradient, rotate 90°.

### Shaped Curve Variants

Instead of thin lines, draw thick curved rectangles to show data magnitude:

- Use collision detection to prevent overlap
- Variable turbulence modes (none, low, medium, high)
- Step length: 0.1%–0.5% of image width

## Boids Flocking

Reynolds three rules create emergent flocking:

1. **Separation** — steer away from too-close neighbors
2. **Alignment** — match average heading of neighbors
3. **Cohesion** — steer toward center of neighbors

Combine forces with adjustable weights. Limit velocity.

## Attraction/Repulsion (N-Body)

Particles interact via gravitational force: `F = G * m1 * m2 / dist²`

- Cap force at minimum distance to avoid singularity
- Use damping (0.95–0.999) to control energy
- Trail drawing reveals orbital patterns

## Tips

- Start positions: grid = stiff, random = uneven, circle packing = best balance
- Short curves = fur texture; long curves = fluid
- Gradually distort flow grid between passes for variety
- Use semi-transparent background for trail accumulation
