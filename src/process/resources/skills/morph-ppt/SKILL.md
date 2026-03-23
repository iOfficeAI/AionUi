---
name: morph-ppt
description: Generate Morph-animated PPTs with officecli
---

# Morph

Generate PPTs with officecli. Key features:

- **Morph Animation**: Smooth transitions between slides with automatic shape-matching animation
- **Flexible Design**: Freely design around the topic, with multiple style references available
- **Quick Generation**: User provides a topic, Agent infers audience/purpose/narrative and generates automatically

---

## Use when

- User wants to generate a `.pptx`

---

## Workflow

**Execution Rules**:

- Once Phase 2 (Planning) begins, proceed sequentially through Phase 2 → 3 → 4 until a complete PPT is delivered
- Do not pause midway to ask "should I continue?" or "should I move to the next step?"
- Unless the user actively interrupts or requests a stop, execute all the way through
- **Remind the user**: Do NOT open the .pptx file while generation is in progress — officecli cannot write to a file that is open in PowerPoint/WPS
- **Language**: Generate all PPT content (titles, text, descriptions) in the same language the user used in their request

### Phase 1: User Interaction

**Ask (only when the topic is unclear)**

**Decision Criteria**:

- No need to ask: "Make a PPT introducing the AionUi product" (topic is clear)
- No need to ask: "Company annual report" (topic is clear)
- Must ask: "Help me make a PPT" (no topic at all)
- Must ask: "Make a presentation" (topic is unclear)

**Ask the user**:

```
What is the topic of the PPT?

It would be even better if you could provide the following (optional):
- Target audience and purpose
- Preferred visual style or color scheme
- Key content or reference materials

If not provided, I will infer these automatically based on the topic.
```

---

### Phase 2: Planning (Planner)

**Role**: PPT Planner who thinks deeply and produces high-quality plans.

**Reference Docs**: `reference/decision-rules.md`

**2.1 Extract, Infer, and Plan — output to `brief.md` directly**

Do all of the following in a single pass, writing results into **one `brief.md` file**:

1. **Header section** — extraction & inference summary:
   - Topic, audience (provided / inferred), purpose (provided / inferred), narrative structure, style direction
   - If any item is uncertain, prefix with `[inferred]` so the user can correct later

2. **Outline** — one-line-per-slide summary:

   ```
   Overall conclusion: ...
   ---
   S1: [hero] "Title"
   S2: [statement] "Key point"
   S3: [pillars] "Three pillars" ★key slide
   ...
   ```

3. **Page Briefs** — detailed design guide for each slide (6 questions):
   - Slide objective, core information (detailed!), supporting evidence, page type, information hierarchy, transition relationship
   - See `reference/decision-rules.md` for format and examples
   - Core information must be detailed and complete — the Design Expert will use it directly

**Key points**:

- Do NOT pause to wait for user confirmation — proceed directly to Phase 3
- If the user corrects something midway, adjust accordingly

**2.2 Research (optional, if tools are available)**

- If the topic requires supplementary data/cases and web/search tools are available, search for additional material
- **If no search tools are available**, skip this step

---

### Phase 3: PPT Generation (Design Expert)

**Role**: officecli Design Expert who masters all capabilities — design, layout, animation, and shapes.

**Reference Docs**:

- `reference/pptx-design.md` — Coordinate system, fonts, spacing, Morph constraints, slide types, **style quick reference**
- `reference/officecli-pptx-min.md` — Command syntax + **Shell Script Rules** (MUST read before generating build.sh)
- `reference/styles/<style-name>/style.md` — Full design reference (only read when user requests a specific style or you need deep inspiration)

**Generation Requirements**:

- **Generate slide by slide**: Clone previous slide → adjust with `set` commands → run checklist → next slide
- Comply with the coordinate system, font, and Actor system specifications
- Use individual `officecli set` commands (NOT batch JSON — it causes boolean/escaping errors)
- **Before writing build.sh**: Read the "Shell Script Rules" section in `reference/officecli-pptx-min.md` to avoid parsing errors

**Morph Core Mechanism (signature feature of this skill)**:

1. **Slide 1 defines 6-8 scene actors** (fixed names, e.g., `!!dot-main`, `!!line-top`) + slide 1's content
2. **Scene actors persist across all slides** — clone from previous slide, adjust positions/size/rotation
3. **Content is added fresh per slide** — ghost previous slide's content, then `add` new content
4. **All slides 2+ must set `transition=morph`**
5. **Adjacent slides should have noticeably different spatial compositions**

See `reference/pptx-design.md`, section "Generation Strategy"

**Per-Slide Self-Check**: After EVERY slide, run the checklist in `reference/pptx-design.md` → "Per-Slide Morph Checklist". Fix any failures before moving on.

**Output Artifacts**:

- `<topic-name>.pptx` — The generated PPT file (named after the topic)
- `build.sh` — Re-runnable Bash build script (one file only, no other build scripts)

---

### Phase 4: Quick Validation

Since each slide was self-checked during generation, only run final validation:

1. `officecli validate <filename>.pptx` — must pass
2. `officecli view outline <filename>.pptx` — verify structure is reasonable

**If issues found**: fix and re-validate (max 2 rounds). If still failing, report to user.

**Final Deliverables (exactly 3 files, no more)**:

- `<topic-name>.pptx` — PPT file
- `build.sh` — Re-runnable Bash build script (one file only)
- `brief.md` — Plan (contains outline + page briefs)

---

### Phase 5: Iteration (Ongoing)

After delivering the PPT, **ask the user**:

- Is there anything you are not satisfied with?
- Would you like to adjust content, design, color scheme, or layout?

**Supports quick adjustments**:

- Change style/color scheme
- Edit a specific slide's content
- Adjust structure/order
- Add or remove slides

Wait for user feedback and respond promptly.

---

## Hard Constraints

1. The topic must be clear; if it cannot be extracted, ask the user to clarify (Phase 1)
2. The Planner uses `decision-rules.md` to infer missing information (Phase 2)
3. The Design Expert must comply with all specifications in `pptx-design.md` (Phase 3)
4. Each slide must pass the per-slide self-check before moving on (Phase 3)
5. Before delivery, `validate` + `view outline` must pass (Phase 4)

---

## Reference Docs

### Planner (Phase 2)

- `reference/decision-rules.md` — Inference, Pyramid Principle, Page Brief construction

### Design Expert (Phase 3)

- `reference/pptx-design.md` — Coordinate system, fonts, Actor system, Morph constraints, slide types, style quick reference
- `reference/officecli-pptx-min.md` — officecli command syntax
- `reference/styles/<style-name>/style.md` — Full design reference (read on demand)

---

Good luck!
