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

---

### Phase 3: Design and Generate

**Before generation starts, always remind the user:**

- The PPT file may be rewritten multiple times during build.
- Please do **not** open the target PPT while generation is running, to avoid file lock / write conflicts.
- Use clear, direct language and make this a concrete warning, not an optional suggestion.

**FIRST: Ensure latest officecli version**

Follow the installation check in `reference/officecli-pptx-min.md` section 0 (checks version and upgrades only if needed).

**SECOND: Define topic-driven custom style first (primary path)**

Before selecting any remote style template, define a custom style from the topic itself:

- Palette (primary/accent/background + contrast strategy)
- Typography (title/body scale and hierarchy)
- Mood/tone (e.g. analytical, futuristic, warm, editorial)

This custom style is the primary design source.

**THEN (optional): Resolve style template references from OfficeCli remote repository (on demand)**

Follow `reference/remote-style-source.md` to:

- Discover style template candidates from OfficeCli `Styles/`
- Download only the selected template's `style.md` (and `build.sh` only if needed)
- Store files in a temporary session directory and delete it after generation

Do not pre-download all styles and do not keep persistent local style caches.

Default behavior: skip template fetch and proceed with topic-driven custom style + component composition.

Only fetch template references when:

- User explicitly asks for a specific template/style, or
- Topic keywords strongly match a known template and you need inspiration.

If remote templates are unavailable, continue immediately with topic-driven custom style. Keep all Morph and quality requirements in this skill strictly enforced (`!!`/`#sN-` naming, ghosting, `transition=morph`, per-slide checks, final validation).

**THIRD: Compose pages with component layering workflow**

Use OfficeCli remote component library (on demand), defined in `reference/remote-style-source.md`.
Fetch only needed component docs for the current task (default: `Styles/component/COMPONENT_LIBRARY.md`).
If remote component fetch fails, continue with the rules below.

Execution model:

- `style.md` (from remote OfficeCli) defines palette, tone, and mood
- Component composition defines structure and visual assembly
- Do not treat `style.md` as a fixed layout template
- Default generation should not depend on template lookup.

Per-slide selection order (mandatory):

1. Select exactly 1 `L1` main structure
2. Add 1-2 `L0` background textures
3. Add 0-2 `L2` decorations
4. For data-heavy slides, add `L3` content components
5. Add at most 1 `L4` typography effect
6. Use at most 1 Morph primary technique

Hard limits (mandatory):

- Max 1 `L4` per slide
- Max 1 Morph primary technique per slide
- `L0` in text areas should stay subtle (`opacity <= 0.15`)
- `L2` should not dominate text (`opacity <= 0.35` unless tiny and outside text zones)
- If readability is weak: disable `L4` first, then reduce `L2`
- If 2 consecutive slides fail readability/layout checks: downgrade to `L1 + L3 + max 1 L2`
- Use actor naming format: `!!<layer>-<role>-<slot>` for persistent scene actors

Failed-slide definition (for consecutive-failure counting):

- Mark a slide as failed if any of these remains unresolved after one quick adjustment pass:
  - Body text is covered or interfered with by `L2`/`L4`
  - Contrast is insufficient for normal reading
  - Critical overlap/crowding breaks readability
- Consecutive rule:
  - Pass => reset failed counter to 0
  - Failed => increment by 1
  - Counter reaches 2 => switch next slide(s) to downgrade mode (`L1 + L3 + max 1 L2`, no `L4`)

**Rule priority (mandatory):**

1. Hard constraints
2. Readability checks
3. Component/template examples

If examples conflict with rules, rules always win.

**IMPORTANT: Use morph-helpers for reliable workflow**

Generate a bash script that uses `reference/morph-helpers.sh` — this provides helper functions with built-in verification.

**Shape naming rules (for best results)**:

Use these naming patterns for clear code and reliable verification:

1. **Scene actors** (persistent across slides):
   - Format: `'!!actor-name'` (double `!!` prefix, single quotes required)
   - Examples: `'!!ring-1'`, `'!!dot-accent'`, `'!!line-top'`
   - Behavior: Modify position/size/color, NEVER ghost

2. **Content shapes** (unique per slide):
   - Format: `'#sN-description'` (single quotes required)
   - Pattern: `#` + `s` + slide_number + `-` + description
   - Examples: `'#s1-title'`, `'#s2-card1'`, `'#s3-stats'`
   - Behavior: Ghost (x=36cm) when moving to next slide

**Why single quotes?** Shell treats `!` and `#` as special characters. Single quotes prevent this: `'#s1-title'`

**Why this naming matters:**

- ✅ **Better detection**: Primary method (`#sN-` pattern matching) is fastest and most accurate
- ✅ **Readable code**: Anyone can tell `#s1-title` is slide 1's title
- ✅ **Easy debugging**: `grep "#s1-"` finds all slide 1 content quickly
- ⚠️ **Backup detection exists**: Even without `#` prefix, duplicate text detection will catch most issues (but has edge cases)

**Bottom line**: Follow these patterns in your code examples, and verification will work smoothly.

**Then proceed with pattern**:

```bash
#!/bin/bash
set -e

# Load helper functions (provides morph_clone_slide, morph_ghost_content, morph_verify_slide)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/morph-helpers.sh"

OUTPUT="deck.pptx"
officecli create "$OUTPUT"

# ============ SLIDE 1 ============
echo "Building Slide 1..."
officecli add "$OUTPUT" '/' --type slide
officecli set "$OUTPUT" '/slide[1]' --prop background=1A1A2E

# Scene actors (!!-prefixed, will persist and morph across slides)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop 'name=!!ring-1' --prop preset=ellipse --prop fill=E94560 --prop opacity=0.3 --prop x=5cm --prop y=3cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop 'name=!!dot-accent' --prop preset=ellipse --prop fill=0F3460 --prop x=28cm --prop y=15cm --prop width=1cm --prop height=1cm

# Content shapes (#s1- prefix, will be ghosted on next slide)
# ⚠️ Use generous width (25-30cm for titles) to avoid text wrapping!
officecli add "$OUTPUT" '/slide[1]' --type shape --prop 'name=#s1-title' --prop text="Main Title" --prop font="Arial Black" --prop size=64 --prop bold=true --prop color=FFFFFF --prop x=10cm --prop y=8cm --prop width=28cm --prop height=3cm --prop fill=none

# ============ SLIDE 2 ============
echo "Building Slide 2..."

# Use helper: automatically clone + set transition + list shapes + verify
morph_clone_slide "$OUTPUT" 1 2

# Use helper: ghost all content from slide 1 (shape indices 3 = #s1-title)
morph_ghost_content "$OUTPUT" 2 3

# Add new content for slide 2
officecli add "$OUTPUT" '/slide[2]' --type shape --prop 'name=#s2-title' --prop text="Second Slide" --prop font="Arial Black" --prop size=64 --prop bold=true --prop color=FFFFFF --prop x=10cm --prop y=8cm --prop width=28cm --prop height=3cm --prop fill=none

# Adjust scene actors to create motion
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=15cm --prop y=5cm  # !!ring-1 moves
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=5cm --prop y=10cm  # !!dot-accent moves

# Use helper: verify slide is correct (transition + ghosting)
morph_verify_slide "$OUTPUT" 2

# ============ SLIDE 3 ============
echo "Building Slide 3..."

morph_clone_slide "$OUTPUT" 2 3
morph_ghost_content "$OUTPUT" 3 4  # Ghost #s2-title (now at index 4)

officecli add "$OUTPUT" '/slide[3]' --type shape --prop 'name=#s3-title' --prop text="Third Slide" --prop font="Arial Black" --prop size=64 --prop bold=true --prop color=FFFFFF --prop x=10cm --prop y=8cm --prop width=28cm --prop height=3cm --prop fill=none

officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=25cm --prop y=8cm
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=10cm --prop y=5cm

morph_verify_slide "$OUTPUT" 3

# ============ FINAL VERIFICATION ============
echo ""
echo "========================================="
morph_final_check "$OUTPUT"

echo ""
echo "✅ Build complete! Open $OUTPUT in PowerPoint to see morph animations."
```

**Key advantages of using helpers:**

- ✅ **Fewer steps**: `morph_clone_slide` = clone + transition + list + verify (4 steps → 1 function)
- ✅ **Instant feedback**: Each helper shows ✅ or ❌ immediately
- ✅ **Can't forget**: Transition and verification are automatic
- ✅ **Clear errors**: If something is wrong, you'll know exactly what and where
- ✅ **Dual detection**: Catches unghosted content by both naming pattern AND duplicate text detection
  - Even if you forget `#` prefix, duplicate detection will still catch the problem!

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

**Design resources:**

- `reference/pptx-design.md` — Design principles (Canvas, Fonts, Colors, Scene Actors, Page Types, Style References)
- `reference/officecli-pptx-min.md` — Command syntax
- `reference/remote-style-source.md` — OfficeCli remote style + component source (discover + on-demand fetch)

---

### Phase 4: Deliver

**Outputs** (3 files):

1. `<topic>.pptx`
2. Build script (complete, re-runnable — bash/python/powershell/etc.)
3. `brief.md`

**Verification** (your build script already includes this):

If you used `morph-helpers.sh`, verification is already done! The build script calls `morph_verify_slide` and `morph_final_check` automatically.

Just validate the final structure:

```bash
officecli validate <file>.pptx
officecli view <file>.pptx outline
```

**If verification fails**, see Troubleshooting section below.

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

   ```bash
   # Find unghosted shapes manually
   for slide in 2 3 4 5 6; do
       echo "Slide $slide:"
       officecli get <file>.pptx "/slide[$slide]" --depth 1 | grep -E "#s[0-9]"
   done
   # If you see shapes like "#s1-title" on slide 2 (not at x=36cm), they should be ghosted

   # Fix:
   officecli set <file>.pptx '/slide[N]/shape[X]' --prop x=36cm
   ```

3. **Visual issues**:
   ```bash
   # Open HTML preview to debug layout
   officecli view <file>.pptx html
   ```

**Note**: Scene actors (`!!`-prefixed) should appear on all slides — that's normal. Only content shapes (`#sN-` prefix) need ghosting.

---

### Phase 5: Iterate

Ask user for feedback, support quick adjustments.

---

## References

- `reference/decision-rules.md` — Planning logic, Pyramid Principle
- `reference/pptx-design.md` — Design principles (Canvas, Fonts, Colors, Scene Actors, Page Types)
- `reference/officecli-pptx-min.md` — Tool syntax
- `reference/remote-style-source.md` — Remote style discovery and one-shot fetch workflow

---

**First time?** Read "Understanding Morph" above, skim one style reference for inspiration, then generate. Always use `morph-helpers.sh` workflow. You'll learn by doing.

**Trust yourself.** You have vision, design sense, and the ability to iterate. These tools enable you — your creativity makes it excellent.
