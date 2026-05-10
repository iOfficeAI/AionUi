---
name: pptx-design
description: Morph-specific design notes — color + typography floor for deep-stage decks, plus Scene Actors / Page Types / Shape Index / Morph Animation Essentials
---

# Morph Design Essentials

`skills/officecli-pptx/SKILL.md` §Requirements / §Design Principles / §Visual delivery floor is the **source of truth for type hierarchy, contrast, and palette picking** in every pptx, morph or not. This file narrows that floor to the **stage-feel register** a morph deck typically shoots for: darker backgrounds, larger hero type, deeper opacity range for scene actors, and per-slide text-width generosity that survives `#sN-*` ghost churn. Where pptx SKILL.md already states a rule, the guidance here is an additive override **only if the slide is actively in a morph pair** — otherwise defer upward.

---

## 1) Color Principles (morph-stage register)

### Contrast is King — always compute, never eyeball

Morph decks lean dark; mid-gray body text (`#666666`) that reads fine in a pptx base render **disappears under projector glare** the moment the backdrop goes below brightness 30. Compute before you pick:

```
Brightness = (R × 299 + G × 587 + B × 114) / 1000
```

Deployment rule (morph-specific — stricter than pptx base):

- **Dark background** (brightness < 128) → body text brightness ≥ 80% (`#FFFFFF`, `#EEEEEE`, `#CADCFC`). Chart series fills + icon strokes must clear the same floor.
- **Light background** (brightness ≥ 128) → body text brightness ≤ 20% (`#000000`, `#333333`).
- **Mixed / gradient background** — add a semi-transparent backing block (`opacity=0.3-0.6`) behind the run of text; do not rely on the gradient to "average out".

Worked samples:

- `#000000` brightness 0 → dark → white text
- `#1E2761` brightness 35 → dark → white text
- `#2C3E50` brightness 62 → dark → white text
- `#E94560` brightness 88 → still dark → white text (common mistake: treating bright red as "mid")
- `#F39C12` brightness 160 → light → dark text
- `#FFFFFF` brightness 255 → light → dark text

**When in doubt, push contrast.** Stage-style decks are read under projector + mixed ambient light — reviewer's monitor comfort is not the right benchmark.

### Color Hierarchy — three depth layers

A morph deck has more visible elements per frame than a pptx base slide (scene actors + content + chart series + annotations). Hold the stack:

```
Background fill  →  Scene actors  →  Content (text / data / KPI)
(weakest)           (medium)          (strongest)
```

Opacity ranges for `!!scene-*` and `!!actor-*` shapes (morph-specific — tighter than pptx base):

- **≤ 0.12** — whole-deck decoration (`!!scene-grid`, `!!scene-band`, corner accents). Must not compete with content at the back of the room.
- **0.3 – 0.6** — evidence / data backing blocks (`!!actor-evidence-bg`, KPI card fills). Strong enough to frame, soft enough to let numbers shine.
- **0.8 – 1.0** — reserved for `!!actor-*` shapes that ARE the content (a hero ring behind a single stat, a brand color strip as the message). Use sparingly — more than 2 per slide reads as clutter.

A scene actor that lands on `opacity=0.7` in the content core is usually a mis-classified actor; either lower it (it's decoration) or rename it `!!actor-*` (it's content) and plan an exit slide.

### Palette Selection — pick for mood, not for habit

There are no universal palette formulas for morph decks. The four pptx canonical palettes (Executive navy / Forest & moss / Warm terracotta / Charcoal minimal) still apply, but morph decks pick more freely from the 52-style library because cross-slide motion amplifies color mood.

Decision path:

1. **Match topic mood** → tech / fintech lean `dark--*`; healthcare / education lean `light--*` or `warm--*`; design / brand lean `bw--*` or `mixed--*`.
2. **Respect user-specified hex** → if the brief names a brand color, scan `reference/styles/INDEX.md` Quick Lookup for the nearest hex trio; do not force-fit the mood label.
3. **Vary by project** — avoid repeating the last three decks' palette family. `dark--premium-navy` on every pitch deck reads as a template, not a design choice.
4. **Name the palette in `brief.md`** → "warm--earth-organic palette" is a commitment; "warm tones" is not.

Use `reference/styles/` for inspiration (palette + signature gesture), **not** for coordinates — per `reference/styles/INDEX.md` L5-11, the build.sh coordinates are hand-tuned for demo content.

---

## 2) Typography (morph-stage register)

### Recommended Combinations

Morph decks are often viewed on stage or in projector-heavy settings where font weight carries farther than font choice. Two fonts max — one for headings, one for body.

| Content Type | Primary Pair                            | Fallback                      |
| ------------ | --------------------------------------- | ----------------------------- |
| English      | Montserrat (title) + Inter (body)       | Segoe UI / Helvetica Neue     |
| Chinese      | Source Han Sans 思源黑体 (title + body) | PingFang SC / Microsoft YaHei |
| Mixed CN/EN  | Montserrat + Source Han Sans            | Segoe UI + System Font        |

Avoid Georgia / Times for body on morph slides — serif terminals disappear when the shape interpolates mid-motion. Reserve serif for pptx base decks with no transition movement.

### Size Scale — one notch larger than pptx base

A morph deck is read from farther back (stage setups, large screens) and each frame holds motion in addition to text. Size up:

| Role               | pptx base | morph-stage (use this)  |
| ------------------ | --------- | ----------------------- |
| Hero / cover title | 44-60pt   | **54-72pt**, bold/black |
| Section heading    | 24-32pt   | **28-40pt**, bold       |
| Body / supporting  | 16-22pt   | **18-24pt**             |
| Caption / footnote | 12-14pt   | **13-16pt** (floor 13)  |

Do not drop below 13pt on any slide — projector glare erodes the lowest two point sizes first.

### Text Width Guidelines — widen for centered, widen for ghost churn

Wrapping breaks visual hierarchy in a static deck; in a morph deck it **also breaks the motion** (the interpolation picks up the wrapped baseline and the text appears to tilt mid-transition). Make text boxes wider than you think.

| Content Type                   | Minimum Width  | Best Practice                                                                                         |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------- |
| Centered titles (64-72pt)      | 28cm           | 28-30cm for 10-15 char titles, 25cm for hero statements                                               |
| Centered subtitles (28-40pt)   | 25cm           | Always 25-28cm to avoid mid-word breaks                                                               |
| Left-aligned titles            | 20cm           | 20-25cm depending on content length                                                                   |
| Body text / cards              | 8cm (single)   | Single-column 8-12cm, double-column 16-18cm                                                           |
| Ghost-target content (`#sN-*`) | same as source | Width must match the on-slide version — a narrower ghost pulls the morph into a resize-plus-move tilt |

Common mistakes in morph decks:

- Using 10-15cm for long centered subtitles → awkward wrap + visible tilt during transition.
- Tight text boxes that "just fit" the text → one extra character on a cloned slide breaks layout.
- Ghost target (x=36cm) sized smaller than source → morph reads as a shrink-and-move instead of a slide-off.

**Rule of thumb:** when in doubt, widen. Extra whitespace is better than wrapped text during a morph interpolation.

---

## 3) Scene Actors (Animation Engine) — expanded

**Purpose.** Create smooth Morph animations through persistent shapes that change properties across adjacent slides.

### Setup

Define 6-8 actors on Slide 1 if the deck tells a continuous-visual story:

- **Large** (5-8cm): Main visual anchors (hero circle, band, hero card)
- **Medium** (2-4cm): Supporting elements (metric cards, accent rings)
- **Small** (1-2cm): Accents and details (dots, dashes, icons)

**Shape types** available via `--prop preset=`: `ellipse | rect | roundRect | triangle | diamond | star5 | hexagon`. Full list: `officecli help pptx shape`.

### Naming (SKILL.md is authoritative)

Three-prefix system — `!!scene-*` / `!!actor-*` / `#sN-*`. Source of truth: `SKILL.md` §What is Morph? — core mechanics. This file adds only the Python-vs-shell quoting note below.

**Python:** `#` and `!!` require no special quoting — pass as plain strings in `subprocess.run([..., "--prop", "name=#s1-title", ...])`.

**Shell (bash/zsh):** ALWAYS single-quote to avoid history expansion on `!!` and comment-leading on `#`: `--prop 'name=!!scene-ring'` / `--prop 'name=#s1-title'`.

### Pairing example — 3 actors × 3 slides

```
Slide 1: !!scene-ring (x=5cm, y=3cm, w=8cm, fill=E94560, opacity=0.3)
         !!scene-dot  (x=28cm, y=15cm, w=1cm)
         !!actor-headline (x=4cm, y=8cm, w=26cm, size=48)

Slide 2: !!scene-ring (x=20cm, y=2cm, w=12cm, opacity=0.6)   ← same name, new position+size
         !!scene-dot  (x=3cm, y=16cm, w=1.5cm)                ← moved to opposite corner
         !!actor-headline (x=1.5cm, y=1cm, w=12cm, size=24)  ← shrunk + moved to top-left

Slide 3: !!scene-ring (x=36cm)                                ← ghosted off-canvas
         !!scene-dot  (x=10cm, y=2cm, w=1cm)
         !!actor-headline (x=36cm)                            ← ghost: new headline takes over
         !!actor-subpoint (x=4cm, y=8cm, w=26cm, size=36)    ← new actor enters (no pair on S2 = fade in)
```

### Per-slide content (`#sN-*`) workflow

1. **Clone previous slide** → inherited `#s(N-1)-*` content carries the old slide's prefix.
2. **Ghost inherited content** → move all `#s(N-1)-*` shapes to `x=36cm`.
3. **Add new content** → with current slide's prefix `#sN-*`.

Without step 2, slides accumulate shapes → visual overlap compounds silently across the deck.

---

## 4) Page Types (mix for rhythm)

Vary page types to avoid monotony. Each serves a different narrative purpose:

| Type           | When to use             | Visual structure                                                   |
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

**Design notes:**

- **pillars**: Multi-column even distribution; scene actors morph into card backgrounds (roundRect, opacity=0.12).
- **evidence**: Asymmetric — 1 large actor (30-40% canvas) + 1 medium (20-30%), opacity 0.3-0.6 allowed for data backgrounds.
- **grid**: Must differ from pillars and evidence — light, scattered vs. structured.
- **Variety matters**: Avoid repeating the same page type consecutively.

---

## 5) Shape Index Mechanics

Shapes are numbered sequentially on each slide: `shape[1]`, `shape[2]`, `shape[3]`... When `transition=morph` is applied, CLI auto-prefixes `!!` to names — **use index paths after that** (see SKILL.md §Known Issues M-1).

### Index behavior

- **On creation:** Shapes added in order get increasing indices.
- **After cloning:** New slide inherits all shapes with identical indices.
- **After adding to a cloned slide:** New shapes get the next available index.
- **After modifying:** Index stays the same.

### Pattern for build scripts

```
Slide 1: 6 actors + 2 content = 8 shapes total
Slide 2: Clone (8) → Ghost content (shape[7-8]) → Add new (shape[9+])
Slide 3: Clone (10) → Ghost content (shape[9-10]) → Add new (shape[11+])
```

**Formula:** Next slide's first new shape index = Previous slide's total shape count + 1.

**Debugging:** `officecli get $FILE '/slide[N]' --depth 1` to inspect actual indices.

---

## 6) Morph Animation Essentials

### Minimum requirements

1. Slides 2+ must have `transition=morph` (`officecli set /slide[N] --prop transition=morph`).
2. Scene actors must have identical `name=` across slides.
3. Previous per-slide content must be ghosted (`x=36cm`) before adding new content.
4. Adjacent slides should have different spatial layouts (displacement ≥ 5cm OR rotation ≥ 15° OR size delta ≥ 30% on ≥ 3 shapes).

### Creating motion

Change ≥ 3 scene-actor properties between adjacent slides:

- Move positions (x, y)
- Resize (width, height)
- Rotate (rotation degrees)
- Shift colors (fill, opacity)

**Goal:** Sense of movement + transformation, not just fade.

### Entrance effects on morph slides

Morph handles shape transitions automatically — entrance animations are usually unnecessary. If one is needed (e.g., fade a new `#sN-*` card in), use the `with` trigger so it plays simultaneously with morph:

```
animation=fade-entrance-300-with
```

Format: `EFFECT[-DIRECTION][-DURATION][-TRIGGER]`. See `officecli help pptx animation` for preset list.

---

## 7) Style References

52 visual style directories in `reference/styles/` — see `reference/styles/INDEX.md` for the catalog. Lookup workflow is in SKILL.md §Style library lookup workflow. Key rule: **learn the approach, do not copy coordinates** (the style build.sh files have known typesetting bugs per `INDEX.md` L5-11).
