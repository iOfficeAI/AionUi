---
name: pptx-design
description: officecli Design Expert — Coordinate system, layouts, animations, shape design, implemented with officecli
---

# officecli Design Expert

Role: Master all officecli capabilities to deliver excellent design, positioning, animation, and shapes while ensuring a visually comfortable layout.

Goal: **Dynamic and beautiful** — not "static layout first, animation later," but designing layout and motion together from the start.

**Core Feature: Morph Animation**

- **All slides 2+ MUST have `transition=morph`**
- Morph enables shapes to smoothly transition, transform, and move between slides, creating fluid motion
- Layout design must account for morph effects (adjacent slides should have noticeably different spatial structures)

---

## 1) Coordinate System (Mandatory)

- Canvas: 16:9 (33.87cm x 19.05cm)
- Safe Margins: left/right 1.2cm, top/bottom 0.8cm
- Spacing Tokens (use only these values): 0.2 / 0.4 / 0.6 / 0.8 / 1.2 / 1.6 cm
- Text box x-coordinates must align to grid or template column lines

## 2) Design References

### Style Quick Reference (choose by use case, no need to read files)

| Use Case                    | Recommended Styles (directory names)                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| **Tech / AI / SaaS**        | `dark--tech-cosmos`, `dark--cyber-future`, `light--isometric-clean`                             |
| **Investment / Pitch**      | `dark--investor-pitch`, `dark--premium-navy`, `light--project-proposal`                         |
| **Corporate / Reports**     | `light--minimal-corporate`, `light--minimal-product`, `dark--premium-navy`                      |
| **Brand / Marketing**       | `warm--brand-refresh`, `warm--creative-marketing`, `vivid--playful-marketing`, `warm--minimal-brand` |
| **Design / Architecture**   | `bw--swiss-bauhaus`, `dark--architectural-plan`, `mixed--duotone-split`                         |
| **Education / Training**    | `light--training-interactive`, `warm--playful-organic`, `vivid--candy-stripe`                   |
| **Keynotes / Events**       | `dark--spotlight-stage`, `dark--liquid-flow`                                                    |
| **Developer / Technical**   | `dark--cyber-future`, `dark--blueprint-grid`, `dark--tech-cosmos`                               |
| **Eco / Nature**            | `warm--earth-organic`, `warm--minimal-brand`, `light--spring-launch`                            |
| **Sci-Fi / Space**          | `dark--space-odyssey`, `dark--cosmic-neon`, `dark--cyber-future`                                |
| **Luxury / Premium**        | `dark--luxury-minimal`, `dark--premium-navy`, `warm--minimal-brand`                             |
| **Productivity / Motivation** | `dark--neon-productivity`, `dark--cyber-future`                                               |

**When to read full style files**: Only when the user requests a specific style, or you need deep design inspiration. Read `reference/styles/<dir>/style.md` for philosophy; skim `build.sh` for technique reference (2-3 pages enough).

**Key philosophy**:

- Create freely based on the topic — draw inspiration from styles, don't copy them
- You may combine techniques from multiple styles or create something entirely original

**Design Principles**:

1. **Color Decision Flow** (simplified 2-step process)

   **Step 1: Check if user specified a palette or style**
   - **User specified** → follow their instructions exactly
   - **User did NOT specify** → proceed to Step 2

   **Step 2: Select and study a reference style (mandatory)**
   - Go to `reference/styles/INDEX.md` → find the "Quick Lookup by Use Case" table
   - Select 1-2 matching styles based on topic and use case
   - Read `reference/styles/<selected-style>/style.md` for color palette and design philosophy
   - **You may adapt the palette** (adjust saturation, swap colors) but **MUST NOT use generic AIGC palettes**:
     - ❌ Dark blue background + cyan + purple + gradient circles (cookie-cutter)
     - ❌ Dark purple background + pink + blue gradient (typical AI-generated style)
   - **Create freely ONLY if you draw clear inspiration from the reference** (not guessing randomly)

2. **Layout Serves Content**
   - Data-heavy: consider clear grouping, grid alignment, visual noise reduction
   - Concept presentation: consider bold layouts, visual impact, whitespace contrast
   - Brand showcase: consider minimalist aesthetics, brand color usage, detail quality
   - Process explanation: consider timelines, step markers, logical flow
   - **These are just starting points, not rigid formulas**

3. **Creative Combinations**
   - Do not feel bound by any template or reference
   - Create a unique visual language based on the topic's distinctiveness
   - `reference/styles/` provides inspiration, not constraints

## 3) Fonts

### Font Combinations (use these by default)

| Content Type              | Recommended Fonts                 | Fallback (if unsure about install)          |
| ------------------------- | --------------------------------- | ------------------------------------------- |
| **English-only PPT**      | Montserrat (title) + Inter (body) | Segoe UI (Windows) / Helvetica Neue (macOS) |
| **Chinese-only PPT**      | 思源黑体 (all text)               | 苹方 (macOS) / 微软雅黑 (Windows)           |
| **Mixed Chinese/English** | Montserrat + 思源黑体             | Segoe UI + 苹方 / 微软雅黑                  |

**Rules**:

1. **Default to recommended fonts** — use fallback only if unsure about the user's system
2. **Same font family for titles and body** — differentiate by weight (bold vs regular) and size
3. **Never use**: SimSun/宋体, SimHei/黑体, KaiTi/楷体, Times New Roman (dated/serif fonts)

### Font Size Standards

- Title: 54-72pt, bold/black
- Heading: 28-40pt
- Body: 18-24pt
- Caption/Desc: 13-16pt (MUST >= 13pt)

### Text Box Width Constraints (prevent line-wrap overflow)

**Core principle: make widths generously large to avoid unexpected line wrapping that causes overlap with content below**

| Text Type                 | Font Size | Recommended Min Width                    | Notes                                      |
| ------------------------- | --------- | ---------------------------------------- | ------------------------------------------ |
| Main title (centered)     | 64-72pt   | 24-28cm                                  | ~10-12 Chinese characters, with 20% margin |
| Main title (left-aligned) | 64-72pt   | 18-20cm                                  | ~8-10 Chinese characters                   |
| Subtitle                  | 36-48pt   | 20-24cm                                  | ~12-15 Chinese characters                  |
| Body / card title         | 24-32pt   | Single-col 7-8cm, double-col 15-16cm     | ~8-10 chars per column                     |
| Description text          | 16-20pt   | 6-8cm (single-col), 12-15cm (double-col) | Allow 2-3 lines                            |

**Rules**:

1. **Title text (>=48pt) MUST be single-line**: set width to 25cm+ when in doubt
2. **Long titles**: over 12 chars → reduce to 56-60pt; over 15 chars → reduce to 48-52pt
3. **Multi-line text**: leave >= 1cm vertical gap between adjacent text boxes
4. **Card descriptions**: card width ~7-9cm fits only ~14 Chinese chars/line at 14pt — keep text short or widen the card
5. **When in doubt, make widths generous** — overflow from wrapping is worse than extra whitespace

### Text Readability (Mandatory)

**Core principle**: Text color MUST have sufficient contrast with the background to remain legible.

**Color Contrast Rules** (must follow):

| Background Type                     | Text Color Requirement        | Example                                       |
| ----------------------------------- | ----------------------------- | --------------------------------------------- |
| Dark background (brightness <128)   | Must use light text           | Dark blue background -> white/light gray text |
| Light background (brightness >=128) | Must use dark text            | White background -> black/dark gray text      |
| Colored background                  | Decide based on brightness    | Bright red background -> white text           |
| Semi-transparent background         | Consider the underlying color | Semi-transparent blue on white -> dark text   |

**Brightness Formula** (for any color):

```
Convert hex color to RGB:
#2C3E50 -> R=44, G=62, B=80

Calculate brightness:
Brightness = (R x 299 + G x 587 + B x 114) / 1000
           = (44x299 + 62x587 + 80x114) / 1000
           = 62

Decision:
- Brightness < 128 -> dark, use white text (#FFFFFF)
- Brightness >= 128 -> light, use black text (#000000 or #333333)
```

**Common color reference**:

- `#000000` (black) = 0 -> dark -> use white text
- `#2C3E50` (dark blue) = 62 -> dark -> use white text
- `#E74C3C` (red) = 115 -> dark -> use white text
- `#F39C12` (orange) = 160 -> light -> use black text
- `#FFFFFF` (white) = 255 -> light -> use black text

**Prohibited combinations**:

- Dark blue text on dark blue background (completely invisible)
- White text on light gray background (insufficient contrast)
- Black text on dark red background (poor readability)
- Gray text on gray background (indistinguishable)

**Recommended safe combinations**:

- White text on dark background (#FFFFFF on #000000-#555555)
- Black/dark gray text on light background (#000000-#333333 on #EEEEEE-#FFFFFF)
- Dark text + light background block (add semi-transparent white backing behind text)
- Light text + dark background block (add semi-transparent black backing behind text)

**Verification method**:

- After generating each text box, check the `color` property against the background color at that position
- If the background is a scene actor, check that actor's `fill` and `opacity`
- If the background is the slide background, check the `background` property
- **Ensure sufficient contrast — better to have too much contrast than too little**

## 4) Actor System

### Three-Layer Actors (mandatory)

| Layer           | Purpose                                                                 | Suggested Count |
| --------------- | ----------------------------------------------------------------------- | --------------- |
| Scene actors    | Geometric decoration; participate in morph transitions to create motion |
| Headline actors | Titles / subtitles / lead-in text                                       | 2-4             |
| Content actors  | Cards, numbers, descriptions, labels, etc.                              |

### Scene Actor Design Rules

**Best Practices (based on official templates)**:

1. **Define a fixed set of scene actors** (6-8)
   - Each actor has a fixed name (e.g., `!!line-top`, `!!dot-accent`, `!!slash-main`)
   - Create all actors on slide 1 (including those used only on later slides)
   - Shape types: ellipse, rect, roundRect, triangle, diamond, etc. (or custom SVG path)
   - Mix sizes: large (5-8cm) + medium (2-4cm) + small accents (1-2cm)
   - Choose colors from the theme palette to match the overall style
   - Transparency: decorative backgrounds should have opacity <= 0.12 to avoid obscuring content

2. **Use the same actors on every slide, changing only their properties**
   - Change position (x, y)
   - Change size (width, height)
   - Change rotation (rotation)
   - Change color (fill)
   - Change opacity (opacity)

3. **Actors not needed on a slide -> move off-screen (ghost)**
   - Ghost position: `x=36cm` (off the right edge of the canvas)
   - **Do NOT use negative coordinates** (`x=-3cm` will error; officecli does not support this)
   - Spread y-coordinates to avoid overlap: `y=0cm`, `y=5cm`, `y=10cm`, `y=15cm`

4. **Shape selection**
   - **Basic geometry**: ellipse, rect, roundRect, triangle, diamond, star5, hexagon
   - **Complex presets**: arrow, chevron, cloud, heart, moon, sun, wave, etc.
   - **Custom shapes**: use the `geometry` property with an SVG path

**Example**:

```
Slide 1: !!dot-main (x=2cm, y=3cm), !!line-top (x=5cm, y=1cm), !!slash-accent (x=10cm, rotation=30)
Slide 2: !!dot-main (x=8cm, y=10cm), !!line-top (x=15cm, y=5cm), !!slash-accent (x=20cm, rotation=60)
Slide 3: !!dot-main (x=36cm, y=0cm) [ghost], !!line-top (x=10cm, y=2cm), !!slash-accent (x=25cm, rotation=0)
```

### Headline & Content Actor Rules

- **Content actors are added fresh on each slide** — do NOT pre-define all slide types' content on slide 1
- Only scene actors need to persist across slides (for Morph). Content text changes every slide, so Morph just cross-fades it — no benefit from same-name pairing
- When cloning from the previous slide, **ghost the previous slide's content** (`x=36cm`), then `add` new content for the current slide

### Morph Auto-Pairing (Important!)

**How it works**:

- When officecli sets `transition=morph`, it automatically adds a `!!` prefix to shape names
- PowerPoint morph pairs shapes across adjacent slides by **name** (same name = forced pairing)
- Successful pairing -> smooth morph animation (position, size, rotation, color transition)
- Failed pairing -> simple fade in/out (no morphing)

**Best Practices (strongly recommended)**:

1. **All scene actors should use fixed names**
   - Slide 1: `!!dot-main`, `!!line-top`, `!!slash-accent`
   - Slide 2: `!!dot-main`, `!!line-top`, `!!slash-accent` (same names, different positions)
   - Slide 3: `!!dot-main`, `!!line-top`, `!!slash-accent` (same names, different positions)
   - **Every slide has these actors; only their position/size/rotation/color changes**

2. **Actors not needed on a slide -> ghost position (`x=36cm`)**
   - Slide 1 needs `!!dot-main` -> `x=2cm, y=3cm`
   - Slide 2 doesn't need `!!dot-main` -> `x=36cm, y=0cm` (off-screen)
   - Slide 3 needs `!!dot-main` again -> `x=8cm, y=10cm`
   - **Do not delete; just move off-screen**

   **⚠️ #1 DEFECT: TEXT OVERLAP FROM UN-GHOSTED CONTENT**

   When cloning from the previous slide, the previous slide's content actors come along. If you don't ghost them (`x=36cm`) before adding new content, old text overlaps with new text.

   **Fix**: Always ghost ALL of the previous slide's content actors before adding new ones.

3. **Automatic `!!` prefix**
   - officecli handles this automatically; no need to manually name shapes `!!xxx`
   - Just give the shape a name (e.g., `name="dot-main"`), and officecli will process it to `!!dot-main`

**Technically possible but not recommended**:

- PowerPoint Morph can heuristically match shapes by type/position/size (different names but similar shapes)
- But the results are unreliable — pairing errors or plain fades are common
- **All official templates use the fixed-name approach**

### Coordinate Notes

- **officecli does not support negative coordinates** (`x=-3cm` will error)
- Use `x=36cm` (off the right edge) uniformly for ghosting; do not use negative coordinates
- If you need a shape to extend beyond the left canvas edge: use `x=0cm` flush to the edge + a large size so the shape naturally overflows

## 5) Page Type Menu (combine as needed; not a fixed order)

Below are the available page types. **Choose one type per slide based on the slide brief**; adjacent slides MUST use different types.

### hero — Cover

- Large centered title + subtitle + tagline
- Scene actors scattered across corners/edges, retaining their original geometric forms
- All content actors ghosted

### statement — Key Point / Transition

- One impactful short sentence, large and centered
- Scene actors shift positions dramatically (each moves 8cm+)
- Optional: subtitle for supporting context

### pillars — Multi-Column Layout (2-4 columns)

- Title in the upper-left
- N scene actors morph into card backgrounds (roundRect, opacity=0.12)
- Content actors expand from ghost; **MUST add fade-entrance-300/500**

### evidence — Data / Statistics (asymmetric)

- 1 large scene actor covers 30-40% of the canvas (opacity 0.3-0.6), with numbers overlaid
- 1 medium scene actor covers 20-30%, for secondary data
- Remaining scene actors shrink to small geometric shapes along the edges
- **MUST differ from pillars layout**: asymmetric vs. evenly divided
- **Opacity exemption**: On evidence slides, background blocks are part of the content, not decoration. These scene actors serving as data backgrounds are **exempt** from the 0.12 content-zone rule (opacity 0.3-0.6 is allowed). However, text MUST have sufficient contrast — white/light text on dark blocks, or dark text on light blocks

### timeline — Timeline / Process

- Horizontal or vertical process flow
- Step-number actors participate in morph (persist across slides)
- Scene actors serve as step background blocks, with progressive color or position changes

### comparison — Comparison

- Left-right split (50/50 or 60/40)
- 2 large scene actors serve as left and right backgrounds
- Colors must contrast sharply (e.g., Primary vs. Accent)

### grid — Scatter / Grid

- Scene actors return to scattered small geometry (2-4cm, opacity 0.1-0.3)
- Content uses a 2xN or staggered layout
- **MUST differ from both pillars and evidence**: light and scattered vs. structured

### quote — Quotation / Story

- A large quotation centered on the slide
- Minimal scene actor interference (shrunk, highly transparent)
- Suitable as a "breathing moment" in the narrative rhythm

### cta — Call to Action / Closing

- Title returns to large and centered
- Scene actors revert to geometric forms scattered along edges, echoing the hero but not identical
- Content actors return to ghost (spread across different positions)

### showcase — Featured Display (product / screenshot)

- Leave a large central area for the primary content
- Scene actors serve as frame-like decorations around the edges
- Suitable for slides that need a strong visual focal point

## 6) Morph Quality Constraints

### Animation Budget (Core Gate)

Every pair of adjacent slides MUST satisfy:

1. **N >= 6** actors have perceptible changes (position / size / rotation / color / opacity / preset / text)
2. At least **2 are headline/content actors**
3. At least **1 has a significant change** (displacement >= 2.7cm / size >= 20% / rotation >= 15 deg / preset morph)

### Spatial Structure Differentiation Rules

- **Adjacent slides MUST have noticeably different scene actor spatial structures**
- Consecutive slides with "N-column even split" or "full-width bar + columns" are prohibited
- Good rhythm example: scattered -> structured -> asymmetric -> scattered -> converging
- Bad rhythm example: three-column -> three-column -> three-column

### Pairing Strategy (critical! directly affects animation quality)

- Morph achieves morph animation through **shape name matching**
- **Adjacent slides must have shapes with the same names** for morph to produce smooth transitions
- If adjacent slides have completely different shape names -> morph only does fade in/out -> **appears as if there is no animation**
- Therefore **scene actors must use fixed names** (e.g., `!!dot-main`); every slide has these actors, only their properties change
- To make a shape "appear from nowhere" -> place it off-screen (ghost) on the previous slide, move it onto the canvas on the current slide
- To make a shape "disappear" -> move it off-screen (ghost) on the current slide; do not delete it

### Entrance Effects

- **Do not add entrance animations by default** — morph automatically handles shape appearance/disappearance/transformation; no additional animations are needed
- Each entrance animation adds one extra click before advancing; multiple animations cause "many clicks before anything moves"
- If an entrance is truly needed, MUST use the `with` trigger so it plays simultaneously with morph, adding no extra clicks

### Animation Format (if needed)

```
Format: EFFECT[-DIRECTION][-DURATION][-TRIGGER][-delay=N][-easein=N][-easeout=N]

Examples:
animation=flyIn-left-300-with-delay=200-easein=50
animation=fade-entrance-400-with
animation=bounce-exit-500-after
animation=none  # remove
```

**Direction**: left, right, up, down
**Trigger**: with (simultaneous with morph), after (after), click (on click)

---

## 7) Advanced Capabilities (optional)

The following capabilities can be used as needed. For detailed syntax, see `reference/officecli-pptx-min.md`:

### Layout Helpers

- **Align shapes**: `slide --prop align=slide-center` or `align=slide-left/right/top/bottom`
- **Distribute shapes**: `slide --prop distribute=horizontal/vertical`
- Use `targets=shape[1],shape[2]` to specify targets

### Motion Path Animation

- **motionPath**: custom movement trajectories (normalized coordinates 0.0-1.0)
- Example: `motionPath=M 0.0 0.0 L 1.0 1.0 E-500-with`
- Suitable for complex path animation scenarios

### Multimedia Elements

- **video/audio**: embed video and audio (supports autoplay, volume, trimStart, trimEnd)
- **equation**: math formulas (OMML format)
- **zoom**: slide zoom (for navigation)

### Advanced Chart Properties

- **Labels and gridlines**: labelPos, labelFont, gridlines, minorGridlines
- **Fill and style**: plotFill, chartFill, style (1-48)
- **Markers**: marker/markers (style:size:color)
- **3D view**: view3d/camera/perspective
- **Secondary axis**: secondaryAxis
- **Series effects**: series.shadow, series.outline

### Image Enhancements

- **Crop**: crop, cropLeft, cropTop, cropRight, cropBottom

### Advanced Text Typesetting

- **Paragraph control**: paragraph (independent paragraphs; supports align, indent, marginLeft, marginRight)
- **Text runs**: run (fine-grained text styling; supports baseline, superscript, subscript)
- **Text gradient**: textGradient (gradient-colored text)

### Shape Grouping

- **group**: combine multiple shapes (`shapes=1,2,3`)

### Transition (Slide Transitions)

- **Default is morph**: the core feature of this skill; all slides 2+ must use it
- Other transitions should only replace morph for special needs (e.g., fade, wipe, push, etc.)

**Usage principles**:

- Do not use advanced features just for the sake of it; prioritize simplicity
- Consider advanced capabilities only for complex scenarios (e.g., data visualization, multimedia presentations)
- For detailed syntax, consult `reference/officecli-pptx-min.md`

---

## 8) Generation Strategy

### Recommended Approach: Scene actors persist, content added fresh per slide

**Steps**:

1. **Create the PPT and slide 1**

   ```bash
   officecli create <topic-name>.pptx
   officecli add <topic-name>.pptx '/' --type slide --prop layout=blank --prop background=XXXXXX
   ```

2. **Add scene actors + slide 1's content to slide 1**
   - 6-8 scene actors (these persist across all slides for Morph)
   - Slide 1's own content only (hero title, subtitle, etc.)
   - Do NOT pre-define content for other slide types

3. **For each subsequent slide: clone previous → ghost old content → add new content → adjust scene**

   ```bash
   # Clone previous slide (scene actors + their positions inherited)
   officecli add <topic-name>.pptx '/' --from '/slide[N-1]'
   # Step A: Set transition
   officecli set <topic-name>.pptx '/slide[N]' --prop transition=morph
   # Step B: Ghost previous slide's content actors → x=36cm
   officecli set <topic-name>.pptx '/slide[N]/shape[...]' --prop x=36cm
   # Step C: Add this slide's new content
   officecli add <topic-name>.pptx '/slide[N]' --type shape --prop text="..." --prop x=4cm --prop y=7cm ...
   # Step D: Adjust scene actors for spatial differentiation
   officecli set <topic-name>.pptx '/slide[N]/shape[...]' --prop x=20cm --prop width=12cm
   ```

   **→ Run Per-Slide Checklist → fix if needed → next slide**

4. **Validate**

   ```bash
   officecli validate <topic-name>.pptx
   officecli view outline <topic-name>.pptx
   ```

### Per-Slide Morph Checklist (run after EVERY slide)

After creating/adjusting each slide, verify ALL of the following:

- [ ] `transition=morph` is set (slides 2+)
- [ ] All scene actors exist with same names as slide 1
- [ ] **Previous slide's content actors are ghosted** (`x=36cm`) — if any remain visible, old text overlaps new content
- [ ] This slide's new content is added and positioned correctly
- [ ] At least 6 actors have visible changes vs. the previous slide (scene actors moved/resized)
- [ ] Text color contrasts with background

**If any item fails → fix immediately before moving to the next slide.**

---

**Why this approach?**

- **Scene actors morph beautifully** — same names across slides create smooth position/size/rotation transitions
- **Content doesn't need Morph** — text changes every slide, so Morph just cross-fades it anyway
- **Clone from previous** carries scene actor positions forward; only ghost the previous slide's content
- **Slide 1 stays simple** — ~10 shapes instead of 30+, easy to manage

**Not recommended**:

- ❌ Pre-defining all content actors for all slide types on slide 1 (bloated, complex index management)
- ❌ Cloning from slide 1 for every slide (resets ghost states → text overlap)
- ❌ Using batch JSON instead of individual `set` commands (causes boolean/escaping errors)
- ❌ Deleting scene actors (breaks Morph pairing — ghost them instead)
