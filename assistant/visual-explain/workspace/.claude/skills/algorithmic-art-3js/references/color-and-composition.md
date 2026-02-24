# Color & Composition — Palette Theory and Visual Balance

Expertise in color selection, palette harmony, and compositional principles for visualizations.

## Palette Selection

### Mood-to-Palette Quick Map

| Mood                      | Palette Direction                           |
| ------------------------- | ------------------------------------------- |
| Warm, earthy, organic     | Terra cotta, amber, sienna, gold            |
| Cool, calm, deep          | Steel blue, navy, teal, sea green           |
| Nature, forest, growth    | Sage, emerald, lime, dark green             |
| Cosmic, mysterious, night | Indigo, violet, hot pink, deep purple       |
| Energetic, vibrant, fire  | Orange, crimson, yellow, tangerine          |
| Minimal, elegant, neutral | Silver, gray, charcoal, white               |
| Tech, digital, cyberpunk  | Neon green, cyan, hot pink, yellow on black |
| Soft, delicate, spring    | Pink, rose, blush, lavender                 |

### Color Harmony Rules

1. **Limit palette to 3–5 colors** — more causes visual noise
2. **One dominant, one accent** — 60% dominant, 30% secondary, 10% accent
3. **Test on dark background** — all palettes must work on `#0a0a14`
4. **Vary opacity** — same color at different opacities creates depth without adding hues
5. **HSL manipulation** — shift hue ±15° from base for natural variation

### Applying Colors in Code

```javascript
// Pick from palette with seeded random
let c = color(CONFIG.colors[seededRandomInt(0, CONFIG.colors.length - 1)]);

// Vary opacity per element
c.setAlpha(seededRandomRange(30, 180));

// HSL shift for natural variation
colorMode(HSL, 360, 100, 100, 100);
let h = hue(c) + seededRandomRange(-15, 15);
```

## Composition Principles

### Layered Depth (Mandatory)

Every visualization must have at minimum:

1. **Background** — base color or subtle texture/gradient
2. **Mid-ground** — primary algorithmic content
3. **Foreground** — accents, highlights, small details

### Density Distribution

- **Uniform**: elements evenly spread — feels structured, pattern-like
- **Centered**: density peaks at center — focal point, radial compositions
- **Clustered**: groups with gaps — organic, cloud-like
- **Edge-weighted**: more activity at edges — frame-like, immersive

### Scale Variation

Mix element sizes for visual interest:

- Large elements: anchor the composition
- Medium elements: fill and connect
- Small elements: add texture and detail

### Negative Space

Don't fill every pixel. Strategic emptiness:

- Guides the eye to dense areas
- Creates breathing room
- Elevates the importance of what IS drawn

## Dark Background Standard

All visualizations use dark background by default:

- Base: `#0a0a14` (near-black with subtle blue)
- Sidebar: `#16213e` → `#1a1a2e` gradient
- Accent: `#d97757` (terra cotta)

Light elements on dark ground:

- Produces dramatic, gallery-quality presentation
- Bright colors pop more on dark backgrounds
- Lower brightness overall is easier on eyes

## Typography in Visualization Descriptions

For the sidebar description text:

- Explain the underlying concept in accessible language
- Name the algorithm and its origin/inventor if applicable
- Describe what visual patterns emerge and why they matter
- Keep to 3–5 sentences
