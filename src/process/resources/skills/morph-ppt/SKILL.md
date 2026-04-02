---
name: morph-ppt
description: Generate Morph-animated PPTs with officecli
---

# Morph

Generate visually compelling PPTs with smooth Morph animations.

**Philosophy**: Trust yourself to learn through practice. This skill provides workflow and references — you bring creativity and judgment.

---

## Use when

- User wants to generate a `.pptx`

---

## What is Morph?

PowerPoint's Morph transition creates smooth animations by matching shapes with **identical names** across adjacent slides.

```
Slide 1: shape name="!!circle" x=5cm  width=8cm
Slide 2: shape name="!!circle" x=20cm width=12cm
         ↓
Result: Circle smoothly moves and grows
```

**Three core concepts:**

- **Scene Actors**: Persistent shapes with `!!` prefix that evolve across slides
- **Ghosting**: Move shapes to `x=36cm` (off-screen) instead of deleting
- **Content**: Text/data added fresh per slide, previous content ghosted first

For details: `reference/pptx-design.md`

---

## Workflow

### Phase 1: Understand the Topic

Ask only when topic is unclear, otherwise proceed directly.

---

> **⚠️ CRITICAL KNOWN ISSUE: Name-based path selectors break after `transition=morph` is set**
> After calling `officecli set '/slide[N]' --prop transition=morph`, paths like `/slide[N]/!!my-shape` return 'Element not found'. The CLI auto-prepends `!!` to shape names when morph is applied, which invalidates name-based lookups.
>
> **Workaround:** Always use shape INDEX paths instead of name paths when accessing shapes on morph slides:
> ```bash
> # WRONG (after transition=morph set):
> officecli get deck.pptx '/slide[3]/!!my-circle' --depth 1
>
> # CORRECT:
> officecli get deck.pptx '/slide[3]' --depth 1  # first list all shapes to find index
> officecli get deck.pptx '/slide[3]/shape[2]' --depth 1
> ```
> The build.py template should use `inspect()` + index-based access throughout.

---

### Phase 2: Plan the Story

**FIRST: Read the thinking framework**

→ Open and read `reference/decision-rules.md` — it provides the structured approach for planning compelling presentations (Pyramid Principle, SCQA, page types).

**Then create `brief.md`** with:

- **Context**: Topic, audience, purpose, narrative structure (SCQA or Problem-Solution)
- **Outline**: Conclusion first + slide-by-slide summary
- **Page briefs**: For each slide:
  - Objective (what should this slide achieve?)
  - Content (specific text/data to include)
  - Page type (title | evidence | transition | conclusion)
  - Design notes (visual emphasis, scene actor behavior)

**Morph Pair Scene Planning (REQUIRED before building)**

For every morph transition, plan the slide pair BEFORE writing any code. Use a table like this in `brief.md`:

| Pair | Slide A (start) | Slide B (end) | Visual narrative purpose |
|------|-----------------|---------------|--------------------------|
| 1→2  | Ring centered, title appears | Ring shifts right, subtitle revealed | Attention → context |
| 2→3  | Feature box large | Feature box small, metric card grows | Zoom out → detail |
| 3→4  | Metric card exits (ghost), new actor enters | Actor repositions | Section transition |

**Rules for the planning table:**
- Determine ALL `!!` shape names during planning — the same name must be used identically across the slide pair
- For each `!!` shape, decide its role: `!!scene-{desc}` (background/decoration) or `!!actor-{desc}` (content/foreground)
- Mark which shapes need to be ghosted at each section transition
- Do NOT start building until the naming table is complete — renaming shapes mid-build causes ghost accumulation bugs

---

### Phase 3: Design and Generate

**Before generation starts, always remind the user:**

- The PPT file may be rewritten multiple times during build.
- Once the PPT file appears in the workspace, the user can preview the live generation progress directly in AionUi.
- Do **not** click "Open with system app" during generation, to avoid file lock / write conflicts.
- Use clear, direct language and make this a concrete warning, not an optional suggestion.

**FIRST: Ensure latest officecli version**

Follow the installation check in `reference/officecli-pptx-min.md` section 0 (checks version and upgrades only if needed).

**IMPORTANT: Use morph-helpers for reliable workflow**

Generate a Python script that uses `reference/morph-helpers.py` — this provides helper functions with built-in verification. Python works cross-platform (Mac / Windows / Linux).

**Shape naming rules (for best results)**:

Use these naming patterns for clear code and reliable verification:

**Namespace prefixes for `!!` shapes — prevent scene collision:**

All persistent `!!` shapes MUST use one of these two prefixes to avoid morph engine confusion when multiple morph pairs share similar shape names:

- `!!scene-{desc}` — Background / decoration shapes (e.g., `!!scene-ring`, `!!scene-bg-gradient`, `!!scene-grid-line`)
  - These persist across the entire deck; move them for motion but rarely ghost them
- `!!actor-{desc}` — Content / foreground shapes (e.g., `!!actor-feature-box`, `!!actor-metric`, `!!actor-label`)
  - These carry slide-specific content; ghost them at section boundaries

**Rule: `!!scene-*` and `!!actor-*` names must NEVER be identical.**
Bad: `!!scene-card` and `!!actor-card` in the same deck — morph engine will confuse them.
Good: `!!scene-card-bg` and `!!actor-card-content` — unambiguous.

1. **Scene actors** (persistent across slides):
   - Format: `name=!!scene-{desc}` or `name=!!actor-{desc}`
   - Examples: `name=!!scene-ring`, `name=!!scene-dot`, `name=!!actor-feature-box`
   - Behavior: Modify position/size/color across slides — do NOT delete
   - **Exit strategy — two trigger scenarios**:
     1. **Permanent exit** (shape no longer needed): Move it off-screen to `x=36cm`.
        Morph will smoothly slide it out of view.
        Example: `officecli set deck.pptx '/slide[N]/!!FeatureBox' --prop x=36cm --prop y=14cm`
        To bring it back on a later slide, simply move it back to a visible position.
     2. **Scene transition exit** (entering a new topic section): When the presentation
        moves into a new thematic section, ALL `!!` content shapes from the previous
        section must also be ghosted to `x=36cm`. Only decoration actors that persist
        throughout the entire deck (e.g., a background ring) should remain visible.
        ```bash
        # Entering new section: ghost all previous section's !! content shapes
        # First, check what !! shapes are on the current slide
        officecli get deck.pptx '/slide[N]' --depth 1
        # Then ghost each one
        officecli set deck.pptx '/slide[N]/!!FeatureBox'    --prop x=36cm
        officecli set deck.pptx '/slide[N]/!!MetricCard'    --prop x=36cm
        officecli set deck.pptx '/slide[N]/!!ChannelLabel'  --prop x=36cm
        ```
        **Rule**: Each new section's first slide should be clean — only current-section
        actors visible; no leftover shapes from the previous section.

2. **Content shapes** (unique per slide):
   - Format: `name=#sN-description`
   - Pattern: `#` + `s` + slide_number + `-` + description
   - Examples: `name=#s1-title`, `name=#s2-card1`, `name=#s3-stats`
   - Behavior: Ghost (x=36cm) when moving to next slide

**Ghost accumulation — critical behavior to understand:**

> Once a `!!`-prefixed shape appears on any slide, it persists and remains visible on **every subsequent morph slide** unless explicitly moved off-screen.

This means:
- A `!!actor-feature-box` introduced on slide 3 will still be visible on slides 4, 5, 6, 7 ... unless you ghost it
- Ghost accumulation builds silently — visual clutter compounds across the deck
- The `morph_final_check` tool does NOT catch `!!` shapes that linger in the visible area; only screenshot verification can detect this

**Ghost cleanup pattern** — when a `!!actor-*` shape is no longer needed, exit it explicitly:

```bash
# Pattern: after the last slide where !!actor-feature-box is needed,
# on the NEXT slide's setup, move it off-screen BEFORE adding new content
officecli set deck.pptx '/slide[N]/shape[X]' --prop x=36cm --prop y=10cm

# If the shape served a 2-slide story arc (slides 3→4), ghost it on slide 5:
helper("ghost", OUTPUT, 5, <shape_index_of_actor_feature_box>)
```

**Rule**: For every `!!actor-*` shape, its "ghost slide" (where it exits) must be planned in the Phase 2 morph pair table. Do not leave any `!!actor-*` shape without a planned exit.

**Why this naming matters:**

- ✅ **Better detection**: Primary method (`#sN-` pattern matching) is fastest and most accurate
- ✅ **Readable code**: Anyone can tell `#s1-title` is slide 1's title
- ✅ **Easy debugging**: `grep "#s1-"` finds all slide 1 content quickly
- ⚠️ **Backup detection exists**: Even without `#` prefix, duplicate text detection will catch most issues (but has edge cases)

**Bottom line**: Follow these patterns in your code examples, and verification will work smoothly.

**Then proceed with pattern**:

```python
#!/usr/bin/env python3
import subprocess, sys, os

def run(*args):
    result = subprocess.run(list(args))
    if result.returncode != 0:
        sys.exit(result.returncode)

# Load helper functions (provides morph_clone_slide, morph_ghost_content, morph_verify_slide)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
def helper(*args):
    run(sys.executable, os.path.join(SCRIPT_DIR, "reference", "morph-helpers.py"), *[str(a) for a in args])

OUTPUT = "deck.pptx"
run("officecli", "create", OUTPUT)
run("officecli", "open", OUTPUT)   # Resident mode — all commands run in memory

# ============ SLIDE 1 ============
print("Building Slide 1...")
run("officecli", "add", OUTPUT, "/", "--type", "slide")
run("officecli", "set", OUTPUT, "/slide[1]", "--prop", "background=1A1A2E")

# Scene actors (!!scene-* prefix = decoration, persists entire deck)
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=!!scene-ring", "--prop", "preset=ellipse", "--prop", "fill=E94560",
    "--prop", "opacity=0.3", "--prop", "x=5cm", "--prop", "y=3cm", "--prop", "width=8cm", "--prop", "height=8cm")
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=!!scene-dot", "--prop", "preset=ellipse", "--prop", "fill=0F3460",
    "--prop", "x=28cm", "--prop", "y=15cm", "--prop", "width=1cm", "--prop", "height=1cm")

# Content shapes (#s1- prefix, will be ghosted on next slide)
# Use generous width (25-30cm for titles) to avoid text wrapping!
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=#s1-title", "--prop", "text=Main Title",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

# ============ SLIDE 2 ============
print("Building Slide 2...")

# Use helper: automatically clone + set transition + list shapes + verify
helper("clone", OUTPUT, 1, 2)

# Use helper: ghost all content from slide 1 (shape index 3 = #s1-title)
helper("ghost", OUTPUT, 2, 3)

# Add new content for slide 2
run("officecli", "add", OUTPUT, "/slide[2]", "--type", "shape",
    "--prop", "name=#s2-title", "--prop", "text=Second Slide",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

# Adjust scene actors to create motion
# SPATIAL RULE: scene actors must stay in safe zones (see Shape naming rules above)
run("officecli", "set", OUTPUT, "/slide[2]/shape[1]", "--prop", "x=15cm", "--prop", "y=5cm")  # !!scene-ring moves
run("officecli", "set", OUTPUT, "/slide[2]/shape[2]", "--prop", "x=5cm",  "--prop", "y=10cm") # !!scene-dot moves

# Use helper: verify slide is correct (transition + ghosting)
helper("verify", OUTPUT, 2)

# ============ SLIDE 3 ============
print("Building Slide 3...")

# ============ SECTION TRANSITION: Ghost ALL !! content shapes from previous section ============
# Before adding new section content, ghost every !! shape that belongs to the previous section.
# Run: officecli get deck.pptx '/slide[N]' --depth 1  to list all shapes and confirm indices.
# Then ghost each previous-section actor:
# helper("ghost", OUTPUT, N, shape_index_1)
# helper("ghost", OUTPUT, N, shape_index_2)
# ... repeat for ALL !! shapes that were part of the previous section
# VERIFY: After building, open screenshot of this slide and confirm zero overlap with previous section content.

helper("clone", OUTPUT, 2, 3)
helper("ghost", OUTPUT, 3, 4)  # Ghost #s2-title (now at index 4)

run("officecli", "add", OUTPUT, "/slide[3]", "--type", "shape",
    "--prop", "name=#s3-title", "--prop", "text=Third Slide",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

run("officecli", "set", OUTPUT, "/slide[3]/shape[1]", "--prop", "x=25cm", "--prop", "y=8cm")
run("officecli", "set", OUTPUT, "/slide[3]/shape[2]", "--prop", "x=10cm", "--prop", "y=5cm")

helper("verify", OUTPUT, 3)

# ============ FINAL VERIFICATION ============
run("officecli", "close", OUTPUT)  # Save from memory to disk
print()
print("=========================================")
helper("final-check", OUTPUT)

print()
print("Build complete! Open", OUTPUT, "in PowerPoint to see morph animations.")
```

**Key advantages of using helpers:**

- ✅ **Fewer steps**: `morph_clone_slide` = clone + transition + list + verify (4 steps → 1 function)
- ✅ **Instant feedback**: Each helper shows ✅ or ❌ immediately
- ✅ **Can't forget**: Transition and verification are automatic
- ✅ **Clear errors**: If something is wrong, you'll know exactly what and where
- ✅ **Dual detection**: Catches unghosted content by both naming pattern AND duplicate text detection
  - Even if you forget `#` prefix, duplicate detection will still catch the problem!

**Scene Actor Spatial Rule (CRITICAL):**

Scene actors must stay in **safe zones** at all times — corners and edges only.
**DO NOT** let scene actors pass through or rest in the content area (`x=2~28cm, y=3~16cm`).

```
Safe zones:
  Top-right corner:   x ≥ 24cm, y ≤ 6cm
  Bottom-right:       x ≥ 24cm, y ≥ 12cm
  Bottom-left:        x ≤ 2cm,  y ≥ 12cm
  Off-screen (right): x ≥ 32cm  (fully out of view — use for ghost position)
```

Before planning any scene actor path, inspect existing shape coordinates:

```bash
# List all shapes on a slide (check for coordinate conflicts before placing actors)
officecli get deck.pptx '/slide[N]' --depth 1 --json
```

Confirm the actor's target position does **not** overlap any content shape's bounding box
(`x` to `x+width`, `y` to `y+height`).

**Essential rules:**

- **Naming**: Scene actors use `!!` prefix, content uses `#sN-` prefix (best practice for verification and readability)
- **Transition**: Every slide after the first MUST have `transition=morph` (without this, no animation!)
- **Ghosting**: Before adding new slide content, ghost ALL previous content shapes to `x=36cm` (don't delete)
- **Motion**: Adjust scene actor (`!!-*`) positions between slides for animation
- **Variety**: Create spatial variety between adjacent slides
- **Text Width**: Use generous widths to prevent text wrapping:
  - Centered titles (64-72pt): **28-30cm width**
  - Centered subtitles (28-40pt): **25-28cm width**
  - Left-aligned titles: **20-25cm width**
  - Body text: 8-12cm (single-column), 16-18cm (double-column)
  - **When in doubt, make it wider!** See `reference/pptx-design.md` for details
- **Text size rule — 16pt minimum scope**:
  The 16pt minimum applies to ALL text that conveys primary content. Exceptions allowed for: chart axis labels (≤12pt OK), section eyebrow/kicker labels (≤14pt OK if ≤5 words), decoration shapes with no narrative content. Each exception must be intentional — descriptive body text at 13pt is NOT exempt.

**Choreography — timing and motion principles:**

Understanding how morph animates multiple shapes helps you plan intentional motion:

| Animation type | How to achieve it |
|----------------|-------------------|
| Simple move | Same shape on slide A and B, same size, different `x`/`y` — morph interpolates position |
| Scale transform | Same shape on slide A and B, different `width`/`height` — morph interpolates size and position |
| Move + scale | Different `x`, `y`, `width`, `height` simultaneously — morph handles all dimensions at once |
| Color shift | Same shape, different `fill` color — morph cross-fades the fill |
| Enter (fade in) | Shape exists only on slide B (no counterpart on slide A) — morph fades it in |
| Exit (fade out) | Shape only on slide A (no counterpart on slide B) — morph fades it out |

**Multi-shape timing rule:**
- All `!!` shapes in the same morph pair animate **simultaneously** — there is no way to stagger their start times within a single pair
- If you need shape A to move before shape B, you MUST split the transition into two morph pairs (i.e., add an intermediate slide between them)

**Staggered timing pattern** (two shapes, offset timing):

```
Slide 2 → Slide 3:  !!actor-A moves (!!actor-B stays put)
Slide 3 → Slide 4:  !!actor-B moves (!!actor-A stays put or has already exited)
```

This requires slide 3 as an explicit intermediate keyframe — never try to fake staggering within a single morph pair.

**Known CLI behaviors:**

- **`!!` prefix auto-added after `transition=morph`**: After running `set --prop transition=morph`
  on a slide, the CLI automatically prepends `!!` to all shape names on that slide
  (e.g., `#s1-title` → `!!#s1-title`). This is expected behavior.
  `morph-helpers.py` handles this correctly — its verification logic uses substring matching
  and is not affected.

  > **⚠️ CRITICAL: Name-based path selectors break after `transition=morph` is set**
  > After calling `officecli set '/slide[N]' --prop transition=morph`, paths like `/slide[N]/!!my-shape` return 'Element not found'. The CLI auto-prepends `!!` to shape names when morph is applied, which invalidates name-based lookups.
  >
  > **Workaround:** Always use shape INDEX paths instead of name paths when accessing shapes on morph slides:
  >
  > ```bash
  > # WRONG (after transition=morph set):
  > officecli get deck.pptx '/slide[3]/!!my-circle' --depth 1
  >
  > # CORRECT:
  > officecli get deck.pptx '/slide[3]' --depth 1  # first list all shapes to find index
  > officecli get deck.pptx '/slide[3]/shape[2]' --depth 1
  > ```
  >
  > The build.py template should use `inspect()` + index-based access throughout.
  >
  > **Pattern recommendation**: Pre-plan all shape indices in a comment block at the top of your build script before setting morph. This prevents index tracking errors as the slide's shape count grows.

- **Shape index tracking**: After each batch of shape additions, run
  `officecli get deck.pptx '/slide[N]' --depth 1` to confirm the current slide's
  shape list and indices. This prevents off-by-one errors when manually computing
  index values for subsequent ghost/set operations.

**Design resources:**

- `reference/pptx-design.md` — Design principles (Canvas, Fonts, Colors, Scene Actors, Page Types, Style References)
- `reference/officecli-pptx-min.md` — Command syntax
- `reference/styles/<name>/` — Visual style examples (optional inspiration, browse by use case in `styles/INDEX.md`)

---

### Phase 4: Visual Verification + Deliver

## Phase 4 视觉验证（REQUIRED — final-check 通过后不可跳过）

### 4A. morph_final_check.py（CLI 数量验证）

If you used `morph-helpers.py`, the build script calls `helper("verify", ...)` and `helper("final-check", ...)` automatically. Also validate the final structure:

```bash
officecli validate <file>.pptx
officecli view <file>.pptx outline
```

### 4B. 截图目视验证（必须执行）

**final-check 通过不等于视觉正确。** `morph_final_check` 只验证 `#sN-` 前缀 shapes 的 ghost 状态（x=36cm 检查），它**无法检测**：
- `!!` shapes 在场景切换后仍停留在可视区域（x < 33.87cm）——这类问题会通过 final-check 但产生视觉叠加
- 相邻幻灯片间 scene actor 位置/尺寸未发生变化（动画静止）

必须对每张 slide 截图验证：

```bash
# 方案1: officecli view（pptx 有 SVG 预览）
officecli view deck.pptx svg --output-dir screenshots/

# 方案2: LibreOffice PDF → Chrome PNG（更准确）
libreoffice --headless --convert-to pdf deck.pptx
# 然后用 Chrome DevTools MCP 截图每页
```

逐 slide 检查清单：
- [ ] 每张 slide 中，前一节的 `!!` content shapes 均不可见（x >= 33.87cm 已移出视野）
- [ ] 每个场景切换的第一张 slide（新章节起始）：前一节所有 `!!` shapes 已 ghost
- [ ] 最后一个场景的收尾 slide：整洁，无残留前场景内容
- [ ] 装饰性 `!!` shapes（背景圆、角标等）在正确位置

**If verification fails**, see Troubleshooting section below.

---

**Outputs** (3 files):

1. `<topic>.pptx`
2. Build script (complete, re-runnable — bash/python/powershell/etc.)
3. `brief.md` — **MUST be a standalone file** (not embedded inside test-report.md or any other file).
   Content: slide-by-slide plan, content per slide, morph design decisions, ghost strategy per transition.

**Final delivery message requirements:**

- Tell the user the deck with polished Morph animations is ready.
- Explicitly recommend opening the generated PPT now to preview the motion effects.
- Use affirmative wording (e.g., "ready now", "open it now to preview the animation quality").

---

### Troubleshooting

**If `morph_verify_slide` or `morph_final_check` reports issues:**

1. **Missing transition**:

   ```bash
   # Check which slides are missing transition
   officecli get <file>.pptx '/slide[2]' --json | grep transition
   officecli get <file>.pptx '/slide[3]' --json | grep transition
   # Expected: "transition": "morph"

   # Fix:
   officecli set <file>.pptx '/slide[2]' --prop transition=morph
   ```

2. **Unghosted content**:

   ```python
   # Find unghosted shapes manually
   import subprocess
   for slide in range(2, 7):
       print(f"Slide {slide}:")
       subprocess.run(["officecli", "get", "<file>.pptx", f"/slide[{slide}]", "--depth", "1"])
   # If you see shapes like "#s1-title" on slide 2 (not at x=36cm), they should be ghosted

   # Fix (run in terminal):
   # officecli set <file>.pptx /slide[N]/shape[X] --prop x=36cm
   ```

3. **Visual issues**:
   ```bash
   # Open HTML preview to debug layout
   officecli view <file>.pptx html
   ```

**Note**: `!!scene-*` shapes (decoration/background actors) should appear on all slides — that's normal and expected. However, `!!actor-*` shapes (content actors) MUST be ghosted at section boundaries to prevent ghost accumulation. Only `#sN-` prefix shapes are checked by `morph_final_check`; `!!actor-*` shapes require screenshot verification to confirm they are off-screen after their section ends.

---

### Phase 5: Iterate

Ask user for feedback, support quick adjustments.

---

## References

- `reference/decision-rules.md` — Planning logic, Pyramid Principle
- `reference/pptx-design.md` — Design principles (Canvas, Fonts, Colors, Scene Actors, Page Types)
- `reference/officecli-pptx-min.md` — Tool syntax
- `reference/styles/INDEX.md` — Visual style examples organized by use case

---

**First time?** Read "Understanding Morph" above, skim one style reference for inspiration, then generate. Always use `morph-helpers.py` workflow. You'll learn by doing.

**Trust yourself.** You have vision, design sense, and the ability to iterate. These tools enable you — your creativity makes it excellent.
