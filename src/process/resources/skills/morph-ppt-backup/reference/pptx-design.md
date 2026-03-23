---
name: pptx-design
description: Design principles and aesthetics for Morph PPTs
---

# Design Essentials

**Philosophy**: Create dynamic, beautiful presentations by designing layout and motion together from the start.

---

## 0) How to Learn from Style Examples

The `styles/` directory contains 55+ visual style examples. Here's how to use them effectively:

### Read `style.md` for Design Thinking (✅ Learn This)

Focus on:
- **Color palette and relationships** — How do bg/accent/text colors work together?
- **Scene actor strategy** — Which elements are persistent (morph across slides)?
- **Visual hierarchy** — How does spacing/opacity/size create depth?
- **Animation strategy** — How do shapes morph to create motion?

### Ignore `build.sh/build.py` Implementation (⚠️ Don't Copy Code)

The build scripts show ONE way to generate the design, but:
- May use various generation methods (batch JSON, different workflows)
- May not follow clone + ghost + add pattern (some use direct generation)
- Code structure ≠ Design thinking

### Extract Design Intent, Implement Your Way

Ask yourself:
1. What elements are persistent (scene actors with `!!` prefix)?
2. What elements change per slide (content with `#sN-` prefix)?
3. How do colors create hierarchy and mood?
4. What makes the morph animation effective?

Then implement using the workflow in `SKILL.md` Phase 3 (clone + ghost + add pattern).

**Think**: "What makes this design effective?" not "How is this code written?"

---

## 1) Canvas & Coordinates

- **Canvas**: 16:9 (33.87cm × 19.05cm)
- **Safe Margins**: left/right 1.2cm, top/bottom 0.8cm
- **Spacing Tokens**: 0.2, 0.4, 0.6, 0.8, 1.2, 1.6 cm (use these for consistency)
- **Ghost Position**: `x=36cm` (off the right edge)

---

## 2) Fonts & Typography

### Recommended Combinations

| Content Type | Primary Font | Fallback |
|-------------|-------------|----------|
| English | Montserrat (title) + Inter (body) | Segoe UI / Helvetica Neue |
| Chinese | Source Han Sans (思源黑体) | PingFang SC / Microsoft YaHei |
| Mixed | Montserrat + Source Han Sans | Segoe UI + System Font |

### Size Scale

- Title: 54-72pt, bold/black
- Heading: 28-40pt
- Body: 18-24pt
- Caption: 13-16pt (minimum 13pt)

### Text Width Guidelines

- **Centered titles (64-72pt)**: 28cm width (safe for 10-12 characters)
- **Left-aligned titles**: 20cm width
- **Body text / cards**: Single-column 8cm, double-column 16cm

**Rule of thumb**: When in doubt, make text boxes wider. Wrapping causes more problems than extra whitespace.

---

## 3) Color Principles

### Contrast is King

Text must be readable:
- **Dark background** (brightness < 128) → white or light text (#FFFFFF, #EEEEEE)
- **Light background** (brightness ≥ 128) → dark text (#000000, #333333)

**Brightness formula**:
```
Brightness = (R × 299 + G × 587 + B × 114) / 1000
```

**Examples**:
- `#000000` (black) = 0 → dark → use white text
- `#2C3E50` (dark blue) = 62 → dark → use white text
- `#E74C3C` (red) = 115 → dark → use white text
- `#F39C12` (orange) = 160 → light → use dark text
- `#FFFFFF` (white) = 255 → light → use dark text

**Safe combinations**:
- White text (#FFFFFF) on dark backgrounds (#000000–#555555)
- Black/dark gray text (#000000–#333333) on light backgrounds (#EEEEEE–#FFFFFF)
- For mixed backgrounds: add a semi-transparent backing block behind the text

**Tip**: When in doubt, choose high contrast — it's always more readable.

### Color Hierarchy

Maintain three-layer visual hierarchy:

```
Background → Decorative Shapes → Content (text/data)
(weakest)         (medium)           (strongest)
```

**Decorative shape opacity**:
- ≤ 0.12 for background decoration (let content shine)
- 0.3-0.6 for content backgrounds (evidence slides, data cards)

### Palette Selection

**Create unique palettes based on topic mood** — there are no universal formulas.

**Study examples** → `reference/styles/` has 55+ diverse styles across categories:
- `dark--*` (16 styles): Professional, tech, luxury, cosmic themes
- `light--*` (10 styles): Corporate, product, training, clean themes
- `warm--*` (11 styles): Organic, creative, editorial, playful themes
- `bw--*` (5 styles): Minimal, brutalist, swiss, geometric themes
- `vivid--*` (6 styles): Bold, energetic, candy, electric themes
- `mixed--*` (7 styles): Duotone, spectral, chromatic, bauhaus themes

**Selection principles**:
1. **Match topic mood** → Let content dictate colors, not AI habits
2. **Vary by project** → Avoid reusing recent styles
3. **Mix categories** → Combine dark/light/warm elements freely
4. **Prefer unexpected fits** → Organic style for tech topic? Why not, if it works

**Examples by mood** (adapt freely, don't copy verbatim):
- Bold/High-contrast → bw--brutalist-raw, vivid--energy-neon, dark--diagonal-cut
- Calm/Muted → warm--earth-organic, dark--sage-grain, light--watercolor-wash
- Premium/Luxury → dark--luxury-minimal, dark--obsidian-amber, bw--swiss-system
- Playful/Creative → vivid--candy-stripe, warm--playful-organic, mixed--bauhaus-blocks
- Tech/Modern → dark--cyber-future, light--glassmorphism-vc, mixed--spectral-grid

---

## 4) Scene Actors (Animation Engine)

**Purpose**: Create smooth Morph animations through persistent shapes that change properties.

### Setup

Define 6-8 actors on Slide 1:
- **Large** (5-8cm): Main visual anchors
- **Medium** (2-4cm): Supporting elements
- **Small** (1-2cm): Accents and details

**Shape types**: ellipse, rect, roundRect, triangle, diamond, star5, hexagon

**Naming conventions**:

1. **Scene actors** (persistent shapes):
   ```bash
   --prop 'name=!!dot-main'    # Quotes prevent shell ! escaping
   --prop 'name=!!line-top'
   --prop 'name=!!slash-accent'
   ```

2. **Content shapes** (unique per slide):
   ```bash
   --prop 'name=#s1-title'      # #sN- prefix (N = slide number)
   --prop 'name=#s2-card1'
   --prop 'name=#s3-stats'
   ```

This naming makes it easy to identify which shapes need ghosting when cloning slides.

### How Morph Pairing Works

- PowerPoint matches shapes by **name** across adjacent slides
- Same name + different properties = smooth animated transition
- To hide a scene actor on a slide, move it off-screen: `x=36cm` (ghost position, right of canvas)
- To bring it back, move it to a visible position on the next slide

**Example** — 3 scene actors across 3 slides:

```
Slide 1: dot-main (x=2cm, y=3cm), line-top (x=5cm, y=1cm), slash-accent (x=10cm, rotation=30)
Slide 2: dot-main (x=8cm, y=10cm), line-top (x=15cm, y=5cm), slash-accent (x=20cm, rotation=60)
Slide 3: dot-main (x=36cm) [hidden], line-top (x=10cm, y=2cm), slash-accent (x=25cm, rotation=0)
```

### Evolution

On subsequent slides:
- **Position**: Move actors to different locations (create motion)
- **Size**: Grow or shrink (create emphasis)
- **Rotation**: Rotate for dynamic feel
- **Color/Opacity**: Subtle shifts (mood changes)
- **Hide when not needed**: Move to `x=36cm` (ghost position)

**Key**: Adjacent slides should have **noticeably different** spatial compositions.

### Content (added fresh per slide)

Content (titles, body text, numbers, cards) is added fresh on each slide with `officecli add`. Since text changes every slide, Morph just cross-fades it — no benefit from same-name pairing.

**Critical workflow**:
1. Clone previous slide → inherited content has old slide's prefix (e.g., `#s1-title`)
2. Ghost inherited content → move all `#s(N-1)-*` shapes to `x=36cm`
3. Add new content → with current slide's prefix (e.g., `#s2-title`)

**Why ghosting matters**: Without ghosting old content, slides accumulate shapes, causing visual overlap and confusion.

### Coordinate Notes

- Ghost position: `x=36cm` (off the right edge of the 33.87cm canvas)
- Spread y-coordinates for ghosted shapes: `y=0cm`, `y=5cm`, `y=10cm`, `y=15cm`
- Coordinates start at `x=0cm` — negative values are not supported

---

## 5) Page Types

Mix these to create rhythm. Each serves a different narrative purpose:

| Type | When to Use | Visual Structure |
|------|-------------|------------------|
| **hero** | Opening, closing | Large centered title + scattered scene actors |
| **statement** | Key message, transition | One impactful sentence + dramatic actor shifts (8cm+ moves) |
| **pillars** | Multi-point structure | 2-4 equal columns, actors become card backgrounds (opacity 0.12) |
| **evidence** | Data, statistics | 1-2 large asymmetric blocks + supporting details (opacity 0.3-0.6) |
| **timeline** | Process, sequence | Horizontal or vertical flow with step backgrounds |
| **comparison** | A vs B | Left-right split (50/50 or 60/40) with contrasting colors |
| **grid** | Multiple items | Scattered or grid layout, lighter feel |
| **quote** | Breathing moment | Centered text, minimal decoration |
| **cta** | Call to action | Return to bold, centered design |
| **showcase** | Featured display | Large central area for product/screenshot |

**Variety matters**: Avoid repeating the same type consecutively.

**Design notes**:
- **pillars**: Multi-column layout with even distribution, scene actors morph into card backgrounds (roundRect, opacity=0.12)
- **evidence**: Asymmetric data layout, 1 large actor (30-40% canvas) + 1 medium (20-30%), opacity 0.3-0.6 allowed for data backgrounds
- **grid**: Must differ from pillars and evidence — light, scattered vs. structured

---

## 6) Style References

Explore `reference/styles/` for inspiration. Each folder contains design philosophy and implementation.

### Quick Reference by Use Case

| Use Case | Recommended Styles | Visual Features |
| --- | --- | --- |
| **Tech / AI / SaaS** | `dark--tech-cosmos` | Deep blue/purple bg + neon blue dots + grid lines |
| | `dark--cyber-future` | Black bg + cyan/magenta gradients + sharp geometric lines |
| | `light--isometric-clean` | White bg + isometric 3D shapes + soft shadows |
| | `light--firmwise-saas` | Light blue-grey + electric purple + clean minimal |
| | `light--fluid-gradient` | Smooth gradients + ray fans + halftone dots |
| | `mixed--chromatic-aberration` | CRT RGB split effect + cyan/pink offset layers |
| **Investment / Pitch** | `dark--investor-pitch` | Dark blue + gold accents + data charts |
| | `dark--premium-navy` | Navy blue + white/gold + minimal design |
| | `light--project-proposal` | White bg + blue/orange accents + professional |
| | `light--glassmorphism-vc` | Sky blue + 3D spheres + frosted glass cards |
| | `dark--obsidian-amber` | Near-black + amber glows + ghost percentages |
| **Corporate / Reports** | `light--minimal-corporate` | White bg + blue/gray tones + clean grid layout |
| | `light--minimal-product` | Off-white bg + single brand color + generous whitespace |
| | `vivid--pink-editorial` | Pink-purple gradient + massive bold numbers (200pt) |
| | `warm--sunset-mosaic` | Rect grid + sunset gradient circle + corporate palette |
| | `warm--coral-culture` | Blue-to-coral gradient + vertical bar clusters |
| **Brand / Marketing** | `warm--brand-refresh` | Warm orange/coral + rounded shapes + energetic |
| | `warm--creative-marketing` | Warm tones + organic shapes + playful |
| | `vivid--playful-marketing` | Multi-color bright palette + fun geometry |
| | `vivid--bauhaus-electric` | Electric blue + acid lime + bold geometric rects |
| **Design / Architecture** | `bw--swiss-bauhaus` | Black/white + bold sans-serif + geometric grid |
| | `dark--architectural-plan` | Dark bg + white lines + blueprint aesthetic |
| | `dark--midnight-blueprint` | Navy gradient + ghost numbers + textFill fade |
| | `mixed--bauhaus-blocks` | Bauhaus color blocks + stacked circles + flat colors |
| | `dark--aurora-softedge` | Aurora colors + layered soft-edge ellipses |
| | `warm--monument-editorial` | Warm paper + terracotta + pure typography |
| **Education / Training** | `light--training-interactive` | White/light blue + icons + friendly rounded shapes |
| | `warm--playful-organic` | Warm pastels + organic curves + soft |
| | `warm--bloom-academy` | Organic blob ellipses + layered soft-edge |
| **Keynotes / Events** | `dark--spotlight-stage` | Black bg + single spotlight circle + dramatic |
| | `dark--liquid-flow` | Dark bg + flowing gradient shapes + smooth |
| | `vivid--energy-neon` | Light grey + neon green blocks + editorial |
| **Developer / Technical** | `dark--cyber-future` | Black + cyan/magenta + code/terminal aesthetic |
| | `dark--blueprint-grid` | Dark navy + white grid lines + technical drawings |
| **Eco / Nature** | `warm--earth-organic` | Earth tones (brown/green) + organic textures |
| | `light--spring-launch` | Pastel greens/yellows + fresh and bright |
| | `warm--vital-bloom` | Starburst rays + organic blob ellipses |
| **Sci-Fi / Space** | `dark--space-odyssey` | Deep space black + galaxy gradients + stars |
| | `dark--cosmic-neon` | Black + neon purple/pink + cosmic particles |
| **Luxury / Premium** | `dark--luxury-minimal` | Black + gold lines + ultra-minimal + premium |
| | `dark--premium-navy` | Navy + white/gold + sophisticated |
| | `dark--velvet-rose` | Deep plum + ghost letterforms + gold textFill fade |
| **Productivity / Motivation** | `dark--neon-productivity` | Black + bright neon accents + bold energy |
| **Creative Agency** | `dark--sage-grain` | Dark sage-grey + grain texture + white cards |
| | `mixed--spectral-grid` | Indigo + amber/lime/coral + gradient ray-fan |
| **Finance** | `dark--obsidian-amber` | Near-black + amber glows + ghost numbers |
| | `bw--swiss-system` | Pure white + ink black + fire red + Swiss design |

**Remember**: These are inspiration, not templates. Create freely based on your topic's unique character.

---

## 7) Shape Index Mechanics

Shapes are numbered sequentially on each slide: `shape[1]`, `shape[2]`, `shape[3]`...

### Index Behavior

**On Slide 1**: Shapes added in order
```bash
# Scene actors: shape[1-6]
# Content: shape[7+]
```

**After cloning**: New slide inherits all shapes with identical indices
```bash
officecli add deck.pptx '/' --from '/slide[1]'  # S2 now has shape[1-N]
```

**After adding**: New shapes get the next available index
```bash
# If slide has 9 shapes, next add becomes shape[10]
```

**After modifying**: Index stays the same
```bash
officecli set deck.pptx '/slide[2]/shape[3]' --prop x=20cm  # Still shape[3]
```

### Pattern for Build Scripts

```bash
# Slide 1: 6 actors + 2 content = 8 shapes total
# Slide 2: Clone (8) → Ghost content (shape[7-8]) → Add new (shape[9+])
# Slide 3: Clone (10 shapes) → Ghost content (shape[9-10]) → Add new (shape[11+])
```

**Formula**: Next slide's first new shape index = Previous slide's total shape count + 1

**Debugging**: Use `officecli get <file> '/slide[N]' --depth 1` to inspect actual indices.

---

## 8) Morph Animation Essentials

### Minimum Requirements

1. **Slides 2+ must have `transition=morph`**
2. **Scene actors must have identical names across slides** (`!!` prefix)
3. **Previous content must be ghosted** (`x=36cm`) before adding new content
4. **Adjacent slides should have different spatial layouts**

### Creating Motion

Change at least 3 scene actors between adjacent slides:
- Move positions (x, y)
- Resize (width, height)
- Rotate (rotation)
- Shift colors (fill, opacity)

**Goal**: Create a sense of movement and transformation, not just fade in/out.

### Entrance Effects

- Morph handles shape transitions automatically — entrance animations are usually unnecessary
- If an entrance is needed, use the `with` trigger so it plays simultaneously with morph: `animation=fade-entrance-300-with`

### Animation Format (if needed)

```
Format: EFFECT[-DIRECTION][-DURATION][-TRIGGER][-delay=N][-easein=N][-easeout=N]

---

## Design Freedom

**This document provides principles, not prescriptions.**

- Trust your design judgment
- Learn from style references
- Experiment with color and layout
- Iterate based on visual results
- Let the content guide the design

**The best presentations come from understanding principles, then applying them creatively to your specific topic.**

---

Good design! 🎨
