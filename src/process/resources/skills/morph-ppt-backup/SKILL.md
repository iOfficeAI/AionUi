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

**Output**: `brief.md` with:

- Context (topic, audience, purpose, narrative)
- Outline (conclusion + slide-by-slide summary)
- Page briefs (objective, content, page type, transitions)

**Thinking framework**: `reference/decision-rules.md`

---

### Phase 3: Design and Generate

**FIRST: Ensure latest officecli version**

Follow the installation check in `reference/officecli-pptx-min.md` section 0 (checks version and upgrades only if needed).

**IMPORTANT: Use explicit commands, NOT batch JSON mode**

Write explicit `officecli` commands in a re-runnable script (bash/python/powershell/etc.) — do NOT use `officecli batch --input commands.json`.

Reason: Morph workflow requires careful step-by-step control (clone → set transition → ghost → add).

**Shape naming rules (CRITICAL for ghosting)**:

1. **Scene actors** (persistent across slides):
   - Name: `'!!actor-name'` (double `!!` prefix)
   - Examples: `'!!ring-1'`, `'!!dot-accent'`, `'!!line-top'`
   - Behavior: Modify position/size/color, NEVER ghost

2. **Content shapes** (unique per slide):
   - Name: `'#sN-description'` (# prefix + slide number)
   - Examples: `'#s1-title'`, `'#s2-card1'`, `'#s3-stats'`
   - Behavior: Ghost (x=36cm) when moving to next slide

**Then proceed with pattern**:

1. Create deck, add Slide 1 with background
2. Define 6-8 scene actors with `'!!name'` prefix
3. Add Slide 1 content with `'#s1-...'` prefix
4. For each subsequent slide (example for Slide 2):

   ```bash
   # Clone previous slide
   officecli add deck.pptx '/' --from '/slide[1]'

   # ⚠️ CRITICAL: Set morph transition (without this, no animation!)
   officecli set deck.pptx '/slide[2]' --prop transition=morph

   # List shapes to identify what needs ghosting
   officecli get deck.pptx '/slide[2]' --depth 1

   # Ghost ALL content from previous slide (shapes with #s1- prefix)
   officecli set deck.pptx '/slide[2]/shape[7]' --prop x=36cm  # #s1-title
   officecli set deck.pptx '/slide[2]/shape[8]' --prop x=36cm  # #s1-subtitle
   # ... ghost all #s1-* shapes

   # Add new content for this slide (with #s2- prefix)
   officecli add deck.pptx '/slide[2]' --type shape --prop 'name=#s2-title' --prop text="New Title" ...

   # Adjust scene actor positions (!!-prefixed shapes remain, just move)
   officecli set deck.pptx '/slide[2]/shape[1]' --prop x=10cm --prop y=5cm  # !!ring-1
   officecli set deck.pptx '/slide[2]/shape[2]' --prop x=20cm  # !!dot-accent
   ```

   Repeat for slides 3, 4, 5...

**Essential rules:**

- **Naming**: Scene actors use `!!` prefix, content uses `#sN-` prefix (enables easy ghosting)
- **Transition**: Every slide after the first MUST have `transition=morph` (without this, no animation!)
- **Ghosting**: Before adding new slide content, ghost ALL `#s(N-1)-*` shapes to `x=36cm` (don't delete)
- **Motion**: Adjust scene actor (`!!-*`) positions between slides for animation
- **Variety**: Create spatial variety between adjacent slides

**Design resources:**

- `reference/pptx-design.md` — Aesthetics, typography, color, page types, how to learn from styles
- `reference/officecli-pptx-min.md` — Command syntax
- `reference/styles/<name>/` — 55+ visual style examples

---

### Phase 4: Deliver

**Outputs** (3 files):

1. `<topic>.pptx`
2. Build script (complete, re-runnable — bash/python/powershell/etc.)
3. `brief.md`

**Quick check**:

```bash
# Validate structure
officecli validate <file>.pptx
officecli view outline <file>.pptx

# ⚠️ Verify morph transitions are set (CRITICAL)
officecli get <file>.pptx '/slide[2]' --json | grep transition
officecli get <file>.pptx '/slide[3]' --json | grep transition
# Expected output: "transition": "morph"
# If missing, animations won't work!

# ⚠️ Check for unghosted content (shapes with # prefix not at x=36cm)
echo "Checking for unghosted content..."
for slide in 2 3 4 5 6; do
    echo "Slide $slide:"
    officecli get <file>.pptx "/slide[$slide]" --depth 1 | grep -E "shape\[.*\].*#s[0-9]" || echo "  OK"
done
# If you see shapes like "#s1-title" on slide 2 (but not at x=36cm), they should be ghosted
# Scene actors (!!-prefixed) should appear on all slides, that's normal
```

---

### Phase 5: Iterate

Ask user for feedback, support quick adjustments.

---

## References

- `reference/decision-rules.md` — Planning logic, Pyramid Principle
- `reference/pptx-design.md` — Design principles, page types, style guide
- `reference/officecli-pptx-min.md` — Tool syntax
- `reference/styles/` — 30+ visual style examples

---

**First time?** Read "Understanding Morph" above, skim one style reference, then generate. You'll learn by doing.

**Trust yourself.** You have vision, design sense, and the ability to iterate. These tools enable you — your creativity makes it excellent.
