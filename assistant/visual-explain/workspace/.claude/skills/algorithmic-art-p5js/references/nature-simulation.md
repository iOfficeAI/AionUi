# Nature Simulation — Emergence, Growth & Biological Patterns

Expertise in nature-inspired algorithms that produce organic, emergent visual patterns.

## Reaction-Diffusion (Gray-Scott Model)

Two chemicals A and B react and diffuse across a 2D grid:

```
A' = A + (dA · ∇²A) - (A·B²) + (f · (1-A))
B' = B + (dB · ∇²B) + (A·B²) - ((k+f) · B)
```

### Laplacian Kernel (3×3)

```
[ 0.05  0.2  0.05 ]
[ 0.2   -1   0.2  ]
[ 0.05  0.2  0.05 ]
```

### Pattern Presets

| Pattern       | Feed (f) | Kill (k) |
| ------------- | -------- | -------- |
| Mitosis       | 0.0367   | 0.0649   |
| Coral         | 0.0545   | 0.062    |
| Fingerprint   | 0.055    | 0.062    |
| Spots         | 0.035    | 0.065    |
| Worms/Stripes | 0.06     | 0.062    |

### Tips

- Use double-buffering (grid + next) and swap
- Render `(A - B)` mapped to color
- Seed chemical B in a small region or random spots
- More simulation steps = more developed pattern
- Canvas size affects speed — keep ≤400×400 for real-time, pre-compute for larger

## Cellular Automata

### 1D Elementary (Wolfram Rules)

- 256 possible rules (0–255), each a lookup table for 3-bit neighborhoods
- Rule 30: chaos from order. Rule 110: Turing-complete. Rule 90: Sierpinski triangle
- Single center cell or random initialization
- Each generation = one row of pixels

### 2D Game of Life (Conway)

- Birth on exactly 3 neighbors, survive on 2–3, die otherwise
- Initialize randomly (density 0.1–0.5) or with known patterns (gliders, guns)
- Map cell age to color gradient for richer output
- Wrap edges (toroidal) for seamless evolution

### Custom Rule Sets

- Change birth/survival numbers for different behaviors
- Multi-state automata (more than alive/dead) for richer patterns
- Color by cell age, neighbor count, or rule application

## Diffusion-Limited Aggregation (DLA)

1. Seed particle at center
2. Release random walker from edge
3. Random walk until touching aggregate → stick
4. Repeat for N walkers

Produces dendritic, crystal-like growth. Color by arrival order for time visualization.

## Wave Interference

Superpose multiple circular waves:

```
amplitude = Σ sin(freq × dist_to_source - phase)
```

- Constructive interference = bright, destructive = dark
- Place 2–8 sources for complexity
- Animate phase offset for ripple effect
- Add decay factor for realistic falloff

## Phyllotaxis

Golden angle (137.5°) spiral:

```
angle = i × 137.5°
radius = c × √i
```

- Expose angle as slider: ±0.1° creates dramatic pattern shifts
- Size decreasing with index creates perspective depth

## Tips

- Reaction-diffusion: pre-compute N steps then render (avoids animation lag)
- Cellular automata: map states to palette colors, not just black/white
- DLA: use spatial grid for fast neighbor lookup
- Wave interference: Moiré patterns from overlapping grids at slight angle offsets
