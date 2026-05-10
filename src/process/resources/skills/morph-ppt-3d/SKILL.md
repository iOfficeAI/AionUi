---
name: morph-ppt-3d
description: 3D Morph PPT — extends morph-ppt with GLB model insertion, cinematographic camera, model-content layout, and enriched visual design system.
---

# Morph PPT — 3D Extension

This skill **extends** `morph-ppt`. All morph-ppt rules (naming, ghosting, design, verification) apply in full.
This file covers **3D-specific additions** and an **enriched design system** combining morph-ppt aesthetics with concrete color palettes, font pairings, and layout quality guardrails.

---

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash`
- **Windows (PowerShell)**: `irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## Use when

- User wants a `.pptx` with a `.glb` 3D model and Morph transitions.

---

## 3D Model Compatibility Gate (before generation)

1. Only `.glb` is supported. If user provides `.fbx` / `.obj` / `.blend` / `.usdz` / `.gltf`, ask them to convert to `.glb` first (e.g. via Blender export).
2. If user has no model, follow the **Model Discovery Flow** below.
3. All files (`.glb`, `.pptx`, build script) must be in the same working directory.

---

## Model Discovery Flow (when user has no model)

When the user gives a topic but no `.glb` file, **proactively help them find a matching model** instead of just listing websites.

### Step 1: Understand the topic and suggest model direction

Based on the user's topic, suggest what kind of 3D model would work:

| Topic type         | Model suggestion                    | Example                                           |
| ------------------ | ----------------------------------- | ------------------------------------------------- |
| Product/brand      | The actual product or a similar one | "coffee brand" → coffee cup, coffee machine, bean |
| Animal/character   | The animal or mascot                | "fox mascot" → fox 3D model                       |
| Architecture/space | Building, room, or structure        | "new office" → office building, interior          |
| Vehicle/transport  | The vehicle itself                  | "EV launch" → car, motorcycle, bicycle            |
| Food/cooking       | The dish or ingredient              | "Japanese food" → sushi platter, ramen bowl       |
| Tech/gadget        | The device                          | "phone launch" → phone, tablet, laptop            |
| Nature/science     | The subject                         | "solar system" → planet, sun, earth               |
| Abstract concept   | A symbolic object                   | "teamwork" → puzzle pieces, gears, bridge         |

Tell the user: "Your topic is [X]. I suggest using a 3D model of [description]. Here are some free sources to find one:"

### Step 2: Search for models (agent-driven)

**Proactively search for models on behalf of the user.** Don't just list websites — actually find candidates.

**Search strategy (try in order):**

1. **Web search** for free GLB models matching the topic:

   ```
   Search: "[topic keyword] 3d model glb free download"
   Example: "fox 3d model glb free download"
   ```

2. **Sketchfab API** (no auth needed for search):

   ```bash
   curl -s "https://api.sketchfab.com/v3/search?type=models&q=[keyword]&downloadable=true&archives_flavours=glb" \
     | python3 -c "
   import json, sys
   data = json.load(sys.stdin)
   for m in data.get('results', [])[:5]:
       print(f\"Name: {m['name']}\")
       print(f\"URL: https://sketchfab.com/3d-models/{m['slug']}-{m['uid']}\")
       print(f\"Likes: {m.get('likeCount', 0)}, License: {m.get('license', {}).get('label', 'unknown')}\")
       print()
   "
   ```

3. **Poly Pizza** (direct GLB download, all free):

   ```bash
   # Search results page — parse for download links
   curl -s "https://poly.pizza/api/search/[keyword]" 2>/dev/null
   ```

4. **Khronos glTF-Sample-Assets** (guaranteed to work, always available):
   ```bash
   # Direct download — no auth, no API, always works
   curl -L -o model.glb "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/[ModelName]/glTF-Binary/[ModelName].glb"
   ```
   Available models: Duck, Fox, Avocado, BrainStem, CesiumMan, DamagedHelmet, FlightHelmet, Lantern, Suzanne, WaterBottle, etc.

### Step 3: Present candidates to user for confirmation

Show the user 2-3 model options with:

- Model name and source
- Preview link (Sketchfab URL or description)
- License info
- Why this model fits their topic

Example response:

```
Based on your topic "fox mascot", here are some models I found:

1. Fox (Khronos sample)
   Direct download, guaranteed compatible
   Why: clean fox model, good for mascot/character decks

2. Low Poly Fox (Poly Pizza)
   URL: https://poly.pizza/m/xxx
   License: CC0 (completely free)
   Why: low-poly style, good fit for clean minimal design

3. Cartoon Fox (Sketchfab)
   URL: https://sketchfab.com/3d-models/fox-xxx
   License: CC BY 4.0 (free, commercial use ok)
   Why: expressive face, high detail

Which one do you want? I'll download it and start building.
```

**Wait for user confirmation before downloading.** Do not download without asking.

### Step 4: Download the confirmed model

After user confirms, download directly:

```bash
# For Sketchfab (if user has the download URL)
curl -L -o model.glb "[download_url]"

# For Khronos samples (always works)
curl -L -o model.glb "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb"
```

After download, verify:

- File exists and is not empty
- File extension is `.glb`
- File size is under 50MB

If Sketchfab requires login to download, tell the user:

> "This model requires a Sketchfab login to download. You can grab the .glb file from the page and share it with me. Or I can use a Khronos sample model for a demo version first?"

### Step 5: When user says "anything" / "you decide" / "just make a demo"

**Don't just grab a random model.** First guide the user to clarify their PPT topic:

> Sure! I'll handle the model — but let me confirm the topic direction first so the model matches the content:
>
> 1. Tech/Product — headphones, phone, robot...
> 2. Animal/Character — cute pet, cartoon character...
> 3. Architecture/Space — building, interior, city...
> 4. Food/Lifestyle — dishes, everyday objects...
> 5. Other — just tell me your idea
>
> Pick a direction, or just give me a topic keyword.

After user confirms a direction, THEN search and recommend models.

### Step 6: When user wants to find models themselves

Give specific website links with step-by-step guidance:

> **Recommended 3D model websites:**
>
> 1. **Sketchfab** (largest 3D model platform)
>    - Link: https://sketchfab.com/search?q=[keyword]&type=models&downloadable=true
>    - Filter steps: search keyword → check "Downloadable" → format "glTF" → sort by "Likes"
>    - When downloading, select **glTF (.glb)** format
>    - Note: some models require free registration to download
> 2. **Poly Pizza** (all free low-poly)
>    - Link: https://poly.pizza/
>    - All CC0 licensed — click Download to get .glb directly
>    - Best for: minimalist or cartoon-style presentations
> 3. **Sketchfab popular categories**
>    - Animals: https://sketchfab.com/search?q=animal&type=models&downloadable=true
>    - Food: https://sketchfab.com/search?q=food&type=models&downloadable=true
>    - Tech: https://sketchfab.com/search?q=gadget&type=models&downloadable=true
>    - Architecture: https://sketchfab.com/search?q=architecture&type=models&downloadable=true
> 4. **Free3D** (general free model site)
>    - Link: https://free3d.com/3d-models/glb
>    - Note: check the license type before use
> 5. **TurboSquid Free** (pro model site free section)
>    - Link: https://www.turbosquid.com/Search/3D-Models/free/glb
>
> After downloading, share the .glb file with me. If the download is a .gltf folder, use Blender to convert it to .glb.

### Step 7: When user gives keywords and asks agent to search

**Remind about token cost before searching:**

> I can search for you, but web searches use extra tokens. Would you prefer:
>
> A. I search — I use the Sketchfab API and recommend 2-3 options (uses a few tokens)
> B. Self-service — I give you search links and filter steps, you pick and share with me (no extra tokens)
>
> A or B?

If user chooses A, proceed with Step 2 (agent-driven search).
If user chooses B, proceed with Step 6 (self-service guidance).

### License reminder

Always remind before confirming download: "Please check the model license before downloading. CC0 / CC BY = free to use; CC BY-NC = non-commercial only."

---

## Visual Design System (4.0 enrichment)

morph-ppt provides the base design rules. This section adds **concrete palettes, font pairings, and layout quality rules** from PPT Creator to give the AI more variety and stronger guardrails.

### Color Palettes (pick one per deck, or blend)

Choose a palette that matches the **topic mood** — don't default to generic blue.

| Palette                | Primary               | Secondary             | Accent           | Body Text | Muted/Caption |
| ---------------------- | --------------------- | --------------------- | ---------------- | --------- | ------------- |
| **Coral Energy**       | `F96167` (coral)      | `F9E795` (gold)       | `2F3C7E` (navy)  | `333333`  | `8B7E6A`      |
| **Midnight Executive** | `1E2761` (navy)       | `CADCFC` (ice blue)   | `FFFFFF`         | `333333`  | `8899BB`      |
| **Forest & Moss**      | `2C5F2D` (forest)     | `97BC62` (moss)       | `F5F5F5` (cream) | `2D2D2D`  | `6B8E6B`      |
| **Charcoal Minimal**   | `36454F` (charcoal)   | `F2F2F2` (off-white)  | `212121`         | `333333`  | `7A8A94`      |
| **Warm Terracotta**    | `B85042` (terracotta) | `E7E8D1` (sand)       | `A7BEAE` (sage)  | `3D2B2B`  | `8C7B75`      |
| **Berry & Cream**      | `6D2E46` (berry)      | `A26769` (dusty rose) | `ECE2D0` (cream) | `3D2233`  | `8C6B7A`      |
| **Ocean Gradient**     | `065A82` (deep blue)  | `1C7293` (teal)       | `21295C`         | `2B3A4E`  | `6B8FAA`      |
| **Teal Trust**         | `028090` (teal)       | `00A896` (seafoam)    | `02C39A` (mint)  | `2D3B3B`  | `5E8C8C`      |
| **Sage Calm**          | `84B59F` (sage)       | `69A297` (eucalyptus) | `50808E`         | `2D3D35`  | `7A9488`      |
| **Cherry Bold**        | `990011` (cherry)     | `FCF6F5` (off-white)  | `2F3C7E` (navy)  | `333333`  | `8B6B6B`      |

**Rules:**

- One color dominates (60-70% visual weight), 1-2 supporting tones, one accent
- On light backgrounds: use Body Text color for copy, Muted for captions
- On dark backgrounds: use Secondary or `FFFFFF` for copy, Muted for captions
- For additional inspiration, browse `../../styles/INDEX.md` — 50+ visual styles organized by mood (dark, light, warm, vivid, bw). Read `style.md` for design philosophy, `build.sh` for implementation reference. **Learn the approach, do not copy coordinates verbatim**

### Font Pairings (pick one per deck)

| Header Font  | Body Font     | Best For                         |
| ------------ | ------------- | -------------------------------- |
| Georgia      | Calibri       | Formal business, finance         |
| Arial Black  | Arial         | Bold marketing, product launches |
| Calibri      | Calibri Light | Clean corporate, minimal         |
| Cambria      | Calibri       | Traditional professional         |
| Trebuchet MS | Calibri       | Friendly tech, startups          |
| Impact       | Arial         | Bold headlines, keynotes         |
| Palatino     | Garamond      | Elegant editorial, luxury        |
| Consolas     | Calibri       | Developer tools, technical       |

### Hard Rules (mandatory, no exceptions)

**H4 — Body text minimum 16pt:**
All body text, card content, and bullet points must be >= 16pt. "Content doesn't fit" is not an excuse — reduce text, split slides, or reduce card count instead. Exceptions: chart axis labels (<=12pt), short sublabels (<=14pt, max 5 words), footnotes.

**H6 — Dark background contrast:**
When slide background brightness < 30% (e.g. `1E2761`, `36454F`, `000000`), ALL body text, card content, chart labels, and icon fills MUST use white (`FFFFFF`) or near-white (brightness > 80%). Never use mid-gray or muted colors as body text on dark backgrounds.

**H7 — Speaker notes required:**
Every content slide (not title/closing) MUST have speaker notes. Use:

```bash
officecli add deck.pptx '/slide[N]' --type notes --prop text="..."
```

### Visual Element Checkpoint

**Every 3 content slides, at least 1 must contain a non-text visual element:**

| Visual type            | Implementation                               |
| ---------------------- | -------------------------------------------- |
| Icon in colored circle | ellipse shape + centered text/number overlay |
| Colored block          | `preset=roundRect` with fill                 |
| Large stat number      | `size=64, bold=true` with small label below  |
| Chart                  | `--type chart` (column/pie/line)             |
| Gradient background    | `background=COLOR1-COLOR2-180`               |
| Shape composition      | circles + connectors for diagrams            |

Text-only slides are only allowed for: quotes, code examples, pure tables.

---

## 3D Model Insertion Rules

### Add model fresh on every slide — NEVER clone

`morph_clone_slide` copies the model as frozen XML. The cloned model cannot Morph.
Each slide must call `add --type 3dmodel` independently with the **same `name`** prop.

**⚠️ CRITICAL: If you clone a slide that already has a 3D model, the old model XML is copied too. This creates TWO model3d elements with the same name on the new slide. PowerPoint cannot handle this conflict and will delete the model content during repair.**

If you must clone a slide for scene actors, **immediately remove the cloned model before adding a new one:**

```bash
# After cloning slide 1 to slide 2:
officecli remove deck.pptx '/slide[2]/model3d[1]'  # remove the frozen clone
officecli add deck.pptx '/slide[2]' --type 3dmodel ...  # add fresh model
```

**Recommended approach: Do NOT clone slides with 3D models at all.** Create all slides empty first, then add models fresh on each.

```bash
# Slide 1
officecli add deck.pptx '/slide[1]' --type 3dmodel \
  --prop path=model.glb --prop 'name=!!model-hero' \
  --prop x=16cm --prop y=1cm --prop width=16cm --prop height=16cm \
  --prop roty=0

# Slide 2
officecli add deck.pptx '/slide[2]' --type 3dmodel \
  --prop path=model.glb --prop 'name=!!model-hero' \
  --prop x=0.5cm --prop y=1cm --prop width=18cm --prop height=17cm \
  --prop roty=50
```

### Controllable properties

| Property          | What it does              | Notes                                         |
| ----------------- | ------------------------- | --------------------------------------------- |
| `x`, `y`          | Position on slide         | Standard slide coordinates                    |
| `width`, `height` | Frame size                | Model renders inside this frame               |
| `name`            | Shape name                | Must be identical across slides for Morph     |
| `roty`            | Y-axis rotation (degrees) | Primary storytelling axis                     |
| `rotx`            | X-axis tilt (degrees)     | Range -25 to +40. See Camera Language section |
| `rotz`            | Z-axis roll (degrees)     | Rarely needed                                 |

### Do NOT manually set

- `meterPerModelUnit` — auto-computed from GLB bounding box
- `preTrans` — auto-computed for model centering
- `camera` depth/position — auto-computed to fit the model
- Never use `raw-set` on any 3D transform parameter

---

## Model-Content Layout

### Core Principle: Model IS the Subject

The model must feel like the **protagonist** of the presentation, not a sidebar decoration.
Text supports the model; the model does not decorate the text.

### Size Contrast Rule (MANDATORY)

Adjacent slides must have a model area ratio >= 1.5x or <= 0.67x.
Compute area as `width × height`. If slide N model is 16×15=240 cm², slide N+1 must be >= 360 or <= 160.

**Never use similar sizes on consecutive slides.** This is the single most important rule for visual energy.

| Size tier      | Width   | Height  | Area (approx) | When to use                                |
| -------------- | ------- | ------- | ------------- | ------------------------------------------ |
| **XL (bleed)** | 28-36cm | 22-28cm | 600-1000      | Close-up, model extends beyond slide edges |
| **L (hero)**   | 18-24cm | 15-19cm | 270-456       | Title, closing, dramatic moments           |
| **M (split)**  | 13-17cm | 12-16cm | 156-272       | Standard content pages with text           |
| **S (accent)** | 5-10cm  | 5-10cm  | 25-100        | Data-heavy pages, model as icon            |

### Layout Patterns (6 types)

**A — Model right, content left** (content pages)
Content at x=1-14cm. Model at x=15-20cm, width 14-18cm.

**B — Model left, content right** (alternate with A)
Model at x=0-2cm, width 14-18cm. Content at x=18-32cm.

**C — Model centered, text overlay** (title/closing)
Model centered large (18-24cm). Text at slide top or bottom.

**D — Model small corner, content dominant** (data pages)
Model 5-10cm in any corner. Content fills the rest.

**E — Model as backdrop** (impact/quote pages)
Model XL (28-36cm), centered, partially cropped by slide edges.
Text overlaid directly on top of model area with high-contrast color.
The model becomes the "canvas" — text lives inside the model's space.

```bash
# Pattern E: model fills slide as backdrop
officecli add deck.pptx '/slide[N]' --type 3dmodel \
  --prop path=model.glb --prop 'name=!!model-hero' \
  --prop x=-2cm --prop y=-2cm --prop width=38cm --prop height=24cm \
  --prop roty=45 --prop rotx=10

# Text overlaid on model
officecli add deck.pptx '/slide[N]' --type shape \
  --prop 'name=#sN-quote' --prop text="Key insight here" \
  --prop x=3cm --prop y=7cm --prop width=28cm --prop height=5cm \
  --prop size=44 --prop bold=true --prop color=FFFFFF --prop fill=none
```

**F — Model bleed edge** (transition/teaser pages)
Model partially off-screen (negative x or y, or x+width > 33.87cm).
Only part of the model visible — implies more beyond the frame.

```bash
# Pattern F: model bleeds off right edge
officecli add deck.pptx '/slide[N]' --type 3dmodel \
  --prop path=model.glb --prop 'name=!!model-hero' \
  --prop x=20cm --prop y=-1cm --prop width=24cm --prop height=22cm \
  --prop roty=70
```

### Layout Progression

Never repeat the same pattern on consecutive slides. Example:

```
Slide 1: C (centered hero, L)
Slide 2: E (backdrop close-up, XL)   ← 1.5x+ area jump
Slide 3: A (model right, M)          ← pull back
Slide 4: F (bleed edge, L)           ← push in
Slide 5: D (small corner, S)         ← dramatic pull back
Slide 6: B (model left, M)           ← grow
Slide 7: C (centered closing, L)     ← push in
```

### Text Layout Safety (MANDATORY)

**Text boxes must never overlap each other or the model frame.**

Rules:

1. **Title and body must not collide.** If a title wraps to 2 lines, the body `y` must account for the title's actual height, not the planned height. Safe formula: `body_y = title_y + title_height + 0.5cm`
2. **Fixed-height text boxes are dangerous.** If text content is longer than expected, it will overflow invisibly. Use generous heights: title `3-4cm`, body `6-8cm`, bullets `8-10cm`.
3. **Model frame and text boxes: gap >= 1cm.** Calculate: if model is at `x=15cm`, text `x + width` must be <= `14cm`.
4. **On Pattern C (centered model + text overlay):** text goes at slide top (`y=0.5-2cm`) or bottom (`y=14-17cm`), NOT in the vertical middle where the model lives (`y=3-13cm`).
5. **After building each slide, verify coordinates:**
   ```bash
   officecli get deck.pptx '/slide[N]' --depth 1
   # Check: no two shapes share overlapping x/y/width/height ranges
   ```

### Model Bleed Guidelines

**Not every model looks good when cropped.** Bleed (Pattern E/F) works best for:

- ✅ Symmetric objects (spheres, helmets, bottles) — any crop looks intentional
- ✅ Large flat surfaces (cars, buildings) — partial view implies scale
- ✅ When cropping non-critical parts (background, base, stand)

Bleed does NOT work for:

- ❌ Character/animal models — cropping ears, tails, or limbs looks broken
- ❌ Small detailed models — cropping loses the detail you want to show
- ❌ When the cropped part is the most recognizable feature

**For character/animal models (like fox, duck, avocado):** keep the full model visible on all slides. Use size changes (L→M→S) for rhythm instead of bleed cropping. Use `rotx` for angle variety instead.

---

## Camera Language

Three tools work together: **roty** (orbit), **rotx** (tilt), **width/height** (zoom).

### Shot Types (use >= 3 different per deck)

| Shot                     | Size                  | rotx       | When                        |
| ------------------------ | --------------------- | ---------- | --------------------------- |
| **Establishing**         | L (18-24cm)           | 0-5        | Title, intro, closing       |
| **Three-quarter beauty** | L (16-20cm)           | 5-10       | Hero, first impression      |
| **Close-up**             | XL (28-36cm), cropped | 0-10       | Feature highlight, detail   |
| **Bird's eye**           | M (13-17cm)           | 25-40      | Structure, overview         |
| **Low angle**            | L (16-20cm)           | -15 to -25 | Power, drama                |
| **Side profile**         | M (13-16cm)           | 0          | Form factor, silhouette     |
| **Over-the-shoulder**    | S (5-10cm)            | 10-15      | Data-heavy, model as accent |

### Content-Driven Camera

Match the shot to what the slide talks about:

- "Front design" → Close-up, `roty=0`, XL cropped
- "Side profile" → Side, `roty=90`, M
- "Internal structure" → Bird's eye, `roty=30, rotx=35`, M
- "Power/authority" → Low angle, `roty=20, rotx=-20`, L
- "Data & specs" → Over-the-shoulder, `roty=60`, S in corner

### Rotation Rules

1. Adjacent roty delta: 30-90° (< 30 = jitter, > 90 = disorienting)
2. Overall roty direction must be consistent (no back-and-forth)
3. rotx range: -25 to +40. Adjacent rotx delta <= 20
4. Total arc across deck: 180-360° (show the model from all sides)

### Example Shot Plan

| Slide | Shot                 | roty | rotx | Size     | Pattern |
| ----- | -------------------- | ---- | ---- | -------- | ------- |
| 1     | Three-quarter beauty | 30   | 8    | L 20×17  | C       |
| 2     | Close-up             | 0    | 5    | XL 30×24 | E       |
| 3     | Side profile         | 80   | 0    | M 15×14  | A       |
| 4     | Bird's eye           | 120  | 35   | M 14×13  | B       |
| 5     | Low angle            | 170  | -20  | L 20×18  | F       |
| 6     | Over-the-shoulder    | 220  | 10   | S 8×7    | D       |
| 7     | Establishing         | 320  | 5    | L 20×17  | C       |

---

## Workflow Integration with morph-ppt

### Phase 2 additions (Planning)

In `brief.md`, add a **Model Choreography Table**:

| Slide | Pattern | Size Tier | Model x,y,w,h | roty | rotx |
| ----- | ------- | --------- | ------------- | ---- | ---- |
| 1     | C       | L         | 7,0.5,20,17   | 30   | 8    |
| 2     | E       | XL        | -2,-2,38,24   | 0    | 5    |
| ...   | ...     | ...       | ...           | ...  | ...  |

Verify the area ratio rule (>= 1.5x between adjacent rows) before proceeding to build.

### Phase 3 additions (Build)

Since models cannot be cloned, the build script differs from standard morph-ppt:

1. Create all slides first (with background + morph transition)
2. Add scene actors (`!!scene-*`) on slide 1, then clone slides for morph continuity
3. Add 3D model fresh on EACH slide (same name, different roty/position)
4. Add content shapes per slide, ghost previous content

```python
model_positions = [
    {"slide": 1, "x": "7cm",  "y": "0.5cm", "w": "20cm", "h": "17cm", "roty": 30},
    {"slide": 2, "x": "-2cm", "y": "-2cm",  "w": "38cm", "h": "24cm", "roty": 0},
    {"slide": 3, "x": "16cm", "y": "1cm",   "w": "15cm", "h": "14cm", "roty": 80},
    # ...
]
for pos in model_positions:
    run("officecli", "add", OUTPUT, f"/slide[{pos['slide']}]", "--type", "3dmodel",
        "--prop", f"path={MODEL}", "--prop", "name=!!model-hero",
        "--prop", f"x={pos['x']}", "--prop", f"y={pos['y']}",
        "--prop", f"width={pos['w']}", "--prop", f"height={pos['h']}",
        "--prop", f"roty={pos['roty']}")
```

### Phase 4 additions (Verification)

After standard morph verification, additionally check:

- Each slide has exactly one `model3d` element
- All models share the same `name` prop
- Adjacent slides have model area ratio >= 1.5x or <= 0.67x
- No two consecutive slides use the same layout pattern

---

## File Placement Rule

All files must be in the same working directory.

**Deliverables (exactly 4 files, no more):**

- `.glb` model file (the 3D model used in the deck)
- Output `.pptx`
- Build script (re-runnable)
- `brief.md`

**Do NOT create additional files** such as outline.md, quality-report.md, test-report.md, etc. All planning goes in `brief.md`, all verification output goes to stdout. Extra files confuse users.

Do not scatter model files across unrelated paths.
