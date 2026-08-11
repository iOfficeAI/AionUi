---
name: pptx-design
description: Design principles and aesthetics for Morph PPTs
---

# Design Essentials

**Philosophy**: Create dynamic, beautiful presentations by designing layout and motion together from the start.

---

## 1) Canvas & Coordinates

- **Canvas**: 16:9 (33.87cm × 19.05cm)
- **Safe Margins**: left/right 1.2cm, top/bottom 0.8cm
- **Spacing Tokens**: 0.2, 0.4, 0.6, 0.8, 1.2, 1.6 cm (use these for consistency)
- **Ghost Position**: `x=36cm` (off the right edge)

---

## 2) Fonts & Typography

### Recommended Combinations

| Content Type | Primary Font                      | Fallback                      |
| ------------ | --------------------------------- | ----------------------------- |
| English      | Montserrat (title) + Inter (body) | Segoe UI / Helvetica Neue     |
| Chinese      | Source Han Sans (思源黑体)        | PingFang SC / Microsoft YaHei |
| Mixed        | Montserrat + Source Han Sans      | Segoe UI + System Font        |

### Size Scale

- Title: 54-72pt, bold/black
- Heading: 28-40pt
- Body: 18-24pt
- Caption: 13-16pt (minimum 13pt)

### Text Width Guidelines

**CRITICAL: Always make text boxes wider than you think necessary. Wrapping breaks visual hierarchy.**

| Content Type                     | Minimum Width | Best Practice                                               |
| -------------------------------- | ------------- | ----------------------------------------------------------- |
| **Centered titles (64-72pt)**    | 28cm          | Use 28-30cm for 10-15 char titles, 25cm for hero statements |
| **Centered subtitles (28-40pt)** | 25cm          | Always use 25-28cm to avoid mid-word breaks                 |
| **Left-aligned titles**          | 20cm          | Use 20-25cm depending on content length                     |
| **Body text / cards**            | 8cm (single)  | Single-column 8-12cm, double-column 16-18cm                 |

**Common mistakes to avoid**:

- ❌ Using 10-15cm for long centered subtitles → causes awkward line breaks
- ❌ Tight text boxes that "just fit" the text → one extra character breaks layout
- ✅ Always add 3-5cm extra width for centered text
- ✅ Test with slightly longer text in your mind

**Rule of thumb**: When in doubt, make text boxes wider. Extra whitespace is better than wrapped text overlapping other elements.

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

**Need inspiration?** Browse `reference/styles/` for color combinations across different moods (dark, light, warm, vivid, bw, mixed).

---

## 4) Scene Actors (Animation Engine)

**Purpose**: Create smooth Morph animations through persistent shapes that change properties.

### Setup

Define 6-8 actors on Slide 1:

- **Large** (5-8cm): Main visual anchors
- **Medium** (2-4cm): Supporting elements
- **Small** (1-2cm): Accents and details

**Shape types**: ellipse, rect, roundRect, triangle, diamond, star5, hexagon

**Naming conventions (recommended for best results)**:

1. **Scene actors** (persistent shapes):

   ```bash
   --prop 'name=!!dot-main'    # Single quotes prevent shell ! escaping
   --prop 'name=!!line-top'
   --prop 'name=!!slash-accent'
   ```

   - Pattern: `!!` prefix (double exclamation)
   - These shapes persist and morph across all slides

2. **Content shapes** (unique per slide):

   ```bash
   --prop 'name=#s1-title'      # Format: # + s + slide_number + - + description
   --prop 'name=#s2-card1'
   --prop 'name=#s3-stats'
   ```

   - Pattern: `#sN-` prefix (where N = slide number)
   - These shapes are ghosted when moving to next slide

**Benefits of following these patterns:**

- Primary verification (pattern matching) is fastest and catches all cases
- Code is self-documenting: `#s2-card1` clearly means slide 2's first card
- Easy to debug: search for `#s1-` to find all slide 1 content
- Backup verification (duplicate detection) exists but has edge cases

**Note**: In Python build scripts, `#` and `!!` require no special quoting — pass them as plain strings (e.g. `"--prop", "name=#s1-title"`).

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

| Type           | When to Use             | Visual Structure                                                   |
| -------------- | ----------------------- | ------------------------------------------------------------------ |
| **hero**       | Opening, closing        | Large centered title + scattered scene actors                      |
| **statement**  | Key message, transition | One impactful sentence + dramatic actor shifts (8cm+ moves)        |
| **pillars**    | Multi-point structure   | 2-4 equal columns, actors become card backgrounds (opacity 0.12)   |
| **evidence**   | Data, statistics        | 1-2 large asymmetric blocks + supporting details (opacity 0.3-0.6) |
| **timeline**   | Process, sequence       | Horizontal or vertical flow with step backgrounds                  |
| **comparison** | A vs B                  | Left-right split (50/50 or 60/40) with contrasting colors          |
| **grid**       | Multiple items          | Scattered or grid layout, lighter feel                             |
| **quote**      | Breathing moment        | Centered text, minimal decoration                                  |
| **cta**        | Call to action          | Return to bold, centered design                                    |
| **showcase**   | Featured display        | Large central area for product/screenshot                          |

**Variety matters**: Avoid repeating the same type consecutively.

**Design notes**:

- **pillars**: Multi-column layout with even distribution, scene actors morph into card backgrounds (roundRect, opacity=0.12)
- **evidence**: Asymmetric data layout, 1 large actor (30-40% canvas) + 1 medium (20-30%), opacity 0.3-0.6 allowed for data backgrounds
- **grid**: Must differ from pillars and evidence — light, scattered vs. structured

---

## 6) Style References

Browse `reference/styles/` for design inspiration. See `reference/styles/INDEX.md` for a complete catalog organized by use case.

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
```
