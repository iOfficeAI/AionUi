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

**Pattern**:
1. Create deck, add Slide 1 with background
2. Define 6-8 scene actors with `!!` prefix names
3. Add Slide 1 content
4. For each subsequent slide:
   - Clone previous slide
   - Set `transition=morph`
   - Ghost previous content (`x=36cm`)
   - Add new content
   - Adjust scene actor positions

**Essential rules:**
- Scene actors must have identical `!!` names across all slides
- Slides 2+ must have `transition=morph`
- Ghost before adding new content
- Create spatial variety between adjacent slides

**Design resources:**
- `reference/pptx-design.md` — Aesthetics, typography, color, page types
- `reference/officecli-pptx-min.md` — Command syntax
- `reference/styles/<name>/` — 30+ style examples

---

### Phase 4: Deliver

**Outputs** (3 files):
1. `<topic>.pptx`
2. `build.sh` (complete, re-runnable)
3. `brief.md`

**Quick check**:
```bash
officecli validate <file>.pptx
officecli view outline <file>.pptx
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
