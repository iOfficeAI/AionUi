# Fractals & Mathematical Visualization — Infinite Detail and Parametric Curves

Expertise in fractal geometry, parametric curves, and mathematical visualization.

## Mandelbrot & Julia Sets

### Mandelbrot

For each pixel, iterate `z = z² + c` where c = pixel coordinate:

- Color by escape iteration count
- Smooth coloring: `iter + 1 - log(log(|z|)) / log(2)`
- Map smooth iteration to palette with configurable color cycles

### Julia Set

Same iteration but c is a fixed constant, z starts at pixel coordinate:

- Different c values produce dramatically different fractals
- c inside Mandelbrot set → connected Julia set

### Parameters

| Parameter     | Range     | Effect                                      |
| ------------- | --------- | ------------------------------------------- |
| maxIterations | 50–1000   | Detail level (higher = more detail at zoom) |
| zoom          | 0.5–10000 | Magnification level                         |
| colorCycles   | 1–10      | How many times palette repeats              |

## L-System Fractal Trees

Lindenmayer grammar system:

1. Define axiom (`"F"`) and rules (`F → FF+[+F-F-F]-[-F+F+F]`)
2. Apply rules N iterations to build string
3. Interpret: `F` = forward, `+/-` = rotate, `[/]` = push/pop state

### Natural Variation

- Randomize angle ±15% per branch
- Randomize length ±10% per segment
- Variable branch count (2–4 children)
- Decreasing width with depth
- Color gradient from trunk (brown) to tips (green)

## Parametric Curves

### Rose Curve

`r = cos(k * θ)` — k petals (or 2k if k is even). Non-integer k = complex overlap patterns.

### Lissajous

`x = A·sin(a·t + δ)`, `y = B·sin(b·t)` — integer ratio a:b = closed curve. Phase δ rotates the figure.

### Spirograph (Hypotrochoid)

```
x = (R-r)·cos(t) + d·cos((R-r)/r · t)
y = (R-r)·sin(t) - d·sin((R-r)/r · t)
```

## Phyllotaxis (Golden Angle)

Sunflower pattern: each element at `angle = i × 137.5°`, `radius = c × √i`

- 137.5° = `360 / φ²` where `φ = (1+√5)/2`
- Varying angle slightly from 137.5° produces dramatically different patterns
- Size can decrease with index for depth perspective

## Strange Attractors

### Clifford Attractor

```
x' = sin(a·y) + c·cos(a·x)
y' = sin(b·x) + d·cos(b·y)
```

Iterate millions of times, plot each point with very low opacity. Structure emerges from density.

## Tips

- For fractals: smooth coloring is essential for professional look
- For parametric curves: layer multiple with offset parameters
- For phyllotaxis: expose the angle as a slider (tiny changes = huge visual change)
- For attractors: use histogram coloring (count visits per pixel) for best detail
