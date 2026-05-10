---
name: morph-ppt
description: "Use this skill when the user wants a .pptx with smooth cross-slide animation — PowerPoint Morph transitions, Keynote-style continuous motion, shapes that grow / move / rotate as the slide advances. Trigger on: 'morph', 'morph transition', 'smooth transition', 'continuous animation across slides', 'Keynote-style transition', 'animated slide sequence', 'shape continuity across slides'. Output is a single .pptx. This skill is a scene layer on top of officecli-pptx — inherits every pptx v2 rule (visual floor, grid, palettes, connector canon, Delivery Gate 1–5a). DO NOT invoke for a generic deck, pitch deck, or board review without cross-slide motion — route those to officecli-pptx base or officecli-pitch-deck."
---

# OfficeCLI Morph-PPT Skill

**This skill is a scene layer on top of `officecli-pptx`.** Every pptx hard rule — visual delivery floor (title ≥ 36pt / body ≥ 18pt / title ≥ 2× body), 12-column grid on 33.87×19.05cm, canonical palettes, chart-choice decision table, connector canon, shell escape, resident + batch, Delivery Gate 1–5a — is inherited, not re-taught. This file adds only what **Morph** needs on top: cross-slide shape-name binding, Scene Actors vs content prefixing, ghost discipline, `transition=morph` CLI quirks, 52-style visual library lookup, and a morph-specific fresh-eyes Gate 5b extension.

When the pptx base rules cover it, the text here says `→ see pptx v2 §X`. Read `skills/officecli-pptx/SKILL.md` first if you have not.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash`
- **Windows (PowerShell)**: `irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**This skill teaches the Morph workflow — when shape names must match, when to ghost, when the CLI auto-prefixes — not every command flag.** When a prop name, enum, or preset is uncertain, consult help BEFORE guessing.

```bash
officecli help pptx slide           # authoritative for: transition, advanceTime, advanceClick, background
officecli help pptx shape           # name, preset, x/y/width/height, fill, rotation, opacity, animation
officecli help pptx animation       # preset + trigger + duration values
officecli help pptx <element> --json  # machine-readable schema
```

Help reflects the installed CLI version. When skill and help disagree, **help wins.** Every `--prop X=` in this file is grep-verified against `officecli help pptx <element>`. Specific confirmations: `transition=morph` is a listed value on `slide`; `advanceTime` / `advanceClick` are valid. **There is NO standalone `transition` element** — `officecli help pptx transition` returns error. Sub-props such as `duration` / `delay` / `easing` for the transition itself are **not exposed on `slide`** — see §Known Issues for the raw-set path if you need them.

## Mental Model & Inheritance

**Inherits pptx v2.** You should have read `skills/officecli-pptx/SKILL.md` first. This skill assumes you know how to: add slides + shapes + charts + connectors; address by `@name=` / `@id=`; quote paths; use `batch` heredocs; use `tailEnd=triangle` on flow connectors; run the Delivery Gate 1–5a; attribute `[AGENT-ERROR]` vs `[RENDERER-BUG]` vs `[SKILL gap]`. If any of those are unfamiliar, read pptx v2 first.

**Inherited from pptx v2 (do NOT re-teach):**

- Visual delivery floor — title ≥ 36pt / body ≥ 18pt / title ≥ 2× body, cover-richness, contrast floor, no `\$\t\n` literals, ≤ 1 animation per slide / ≤ 600ms.
- Grid math — 33.87 × 19.05cm, edge margin ≥ 1.27cm, inter-block gap ≥ 0.76cm, ≥ 20% negative space. For N-card grids: `col = (33.87 − 2·margin − (N−1)·gap) / N`.
- Four canonical palettes (Executive navy / Forest & moss / Warm terracotta / Charcoal minimal) — morph decks may pick a different mood from `reference/styles/`, but contrast rules still apply.
- Chart-choice table — column vs bar vs line vs pie vs scatter vs large-text KPI; `> 3 series + > 8 categories` = split.
- Connector canon — `shape=straight|elbow|curve`, `@id=` for from/to (C-P-6), `tailEnd=triangle` on every flow.
- Shell escape 3-layer — `$` single-quoted, heredocs for batch, `<a:br/>` for real newlines.
- Resident mode + batch ≤ 12 ops, `<<'EOF'` single-quoted delimiter.
- Delivery Gate 1-5a (schema, token grep, hyperlink rPr, slide-order, dark-on-dark) — every gate prints OK before declaring done.
- Known Issues C-P-1..7 (hyperlink rPr, chart spPr warning, animation duration readback, animation remove, connector enum, connector `@name=`, chart color renderer normalization).
- Attribution triage — `[AGENT-ERROR]` vs `[RENDERER-BUG]` vs `[SKILL gap]`.

**Morph identity — what this skill owns (delta on top of pptx v2):**

- **Cross-slide shape-name binding.** PowerPoint's Morph engine pairs shapes by **identical `name=`** across adjacent slides and interpolates their position / size / rotation / fill / opacity. No matching name ⇒ no animation, silent fade. This is a workflow discipline, not a CLI feature.
- **Namespace prefixes:** `!!scene-*` (persistent decoration, never ghosted) / `!!actor-*` (content that evolves then exits) / `#sN-*` (per-slide content, ghosted on slide N+1). Plan the names BEFORE you `add`.
- **Ghost position `x=36cm`** (off the right edge of the 33.87cm canvas). Never delete a `!!`-prefixed shape — move it off-canvas so the morph exit animation still plays.
- **`transition=morph` auto-prefix quirk.** The CLI auto-prepends `!!` to every shape on a morph slide, which silently breaks `@name=` path selectors. Use `/slide[N]/shape[K]` index paths after morph is set. See §Known Issues.
- **Adjacent-slide spatial variety.** Displacement ≥ 5cm or rotation ≥ 15° between pairs — otherwise morph interpolates nothing visible.
- **Renderer reality.** Morph renders in PowerPoint 365 / Keynote / WPS. LibreOffice and many web viewers render as plain fade (runtime feature). Not a skill defect — `[RENDERER-BUG]`.

### Reverse handoff — when to go BACK to pptx base (or sibling skills)

Stay in **pptx v2 base** for any deck without cross-slide motion (board reviews, sales decks, all-hands, training). Stay in **officecli-pitch-deck** for fundraising narrative arcs without morph. Use this skill only when the user explicitly asks for "morph" / "smooth transitions" / "continuous animation" AND ≥ 2 consecutive slides share a visual element that transforms. "Animated deck" meaning one-off entrance animations → pptx v2 §Animations, not morph.

## Shell & Execution Discipline

**Shell quoting, incremental execution, `$FILE` convention** → see pptx v2 §Shell & Execution Discipline. Same rules verbatim.

**Morph-specific additions:**

- **`!!` in shell values — single-quote.** Bash / zsh history expansion eats unquoted `!!foo`. Always use `--prop 'name=!!scene-ring'` (single quotes). In Python `subprocess.run([...])` lists, no quoting needed — pass `"name=!!scene-ring"` as a plain string.
- **`$` in prop text — single-quote (price tokens).** `--prop text='$9/mo'` and `--prop text='$199/yr'` — NEVER `--prop text="$9/mo"` (zsh/bash eat `$9` as empty var → text rendered as `.` / stray period). Same for `${VAR}`, `$USER`, `\n`, `\r`, `\t` inside a double-quoted prop. Gate 2 morph addendum below greps for the leak signature.
- **`#` in shell values — safe, but quote anyway.** `#` is a comment leader only at the start of a shell word. `--prop name=#s1-title` works, but `--prop 'name=#s1-title'` is the habit that stops you guessing.
- **Batch heredoc is the cleanest path for multi-shape slides.** `<<'EOF' | officecli batch $FILE` disables all shell expansion — safe for `$`, `!!`, `#`, `'` inside the JSON body.
- **`--json` responses wrap the payload in `.data.*`.** `query` returns `.data.results[]` (array of matches); `get` returns `.data.children[]` (direct content); `format` always sits at `.data.results[].format.X` / `.data.children[].format.X`. Always prefix jq paths with `.data.` — bare `.children[]` or `.results[]` returns null silently.
- **Variable:** `FILE="deck.pptx"` at the top of every build script; every example below uses `$FILE`.
- **Gate shell pattern — COUNT, then if/else.** Never write `grep … && echo LEAK || echo OK` — when grep exits 1 (0 matches), the `||` branch fires with empty stdout and prints "OK" confusingly (or prints "LEAK" from prior pipes). Canonical form: `COUNT=$(cmd | wc -l); if [ "$COUNT" -gt 0 ]; then echo "LEAK: …"; else echo "OK"; fi`.

## Two primitives this skill owns

- **Scene Actors** = persistent `!!`-named shapes (decoration or content) **paired by identical name** across adjacent slides so Morph can interpolate them. Every `!!scene-*` / `!!actor-*` shape is a scene actor.
- **Choreography** = the plan for how actors evolve — who moves where, who enters, who exits, on which slide pair. Written BEFORE code in the §Morph Pair Planning table.

Use this skill when the user asks for morph motion AND ≥ 2 consecutive slides share a visual element that transforms. Target-viewer caveat: morph needs PowerPoint 365 / Keynote / WPS — if the user is LibreOffice-only, warn first (see §Renderer honesty).

**Speaker notes rule.** Every content slide (non-cover, non-closing) MUST carry speaker notes via `officecli add "$FILE" /slide[N] --type notes --prop text='…'`. Missing notes = not shippable — inherits pptx v2 §Hard rules (H7). Morph decks tend to be visually minimal, so notes carry the narration.

## What is Morph? (core mechanics)

PowerPoint's Morph transition creates smooth motion by interpolating shape properties between adjacent slides, matched by **identical shape names**.

```
Slide 1: shape name="!!scene-ring" x=5cm  width=8cm   fill=E94560 opacity=0.3
Slide 2: shape name="!!scene-ring" x=20cm width=12cm fill=E94560 opacity=0.6
         ↓  transition=morph on slide 2
Result:  Ring smoothly moves, grows, and fades darker over ~1 second
```

Morph only runs if slide N+1 carries `transition=morph`. Apply it via `officecli add / --type slide --prop transition=morph` on creation, or `officecli set "/slide[N]" --prop transition=morph` after the fact. Slides 2+ that omit this prop fall back to whatever the master defines (usually no transition) — motion dies silently.

**Three-prefix naming system (non-negotiable):**

| Prefix      | Role                                                      | Lifecycle                                                                                     | Example                                                     |
| ----------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `!!scene-*` | Background / decoration — persists across the entire deck | Set once, adjust position/size to create motion; **rarely ghosted**                           | `!!scene-ring`, `!!scene-bg-band`, `!!scene-grid`           |
| `!!actor-*` | Content / foreground — evolves across a section           | Introduced on slide N, modified on slide N+1, N+2…, **ghosted to `x=36cm`** on its exit slide | `!!actor-feature-box`, `!!actor-metric`, `!!actor-headline` |
| `#sN-*`     | Per-slide content (titles, bullets, captions)             | Added fresh on slide N, **ghosted to `x=36cm`** on slide N+1                                  | `#s1-title`, `#s2-kpi`, `#s3-caption`                       |

**Hard rule:** `!!scene-*` and `!!actor-*` names must NEVER collide (e.g., `!!scene-card` + `!!actor-card` in the same deck — morph engine confuses them). Disambiguate: `!!scene-card-bg` vs `!!actor-card-content`.

**Charts are opaque to morph.** `officecli add … --type chart` does NOT accept `--prop name=!!…` (returns `UNSUPPORTED props: name`), so a chart cannot participate in shape-name morph pairing. For bar-grow / line-grow narratives: (a) accept plain fade-in of the chart as-is, OR (b) build N `!!actor-bar-K` rectangles manually sized to the values and morph those — each rect carries the same `!!actor-bar-K` name across adjacent slides while width / height / fill evolves.

**Ghost accumulation is silent.** Once a `!!`-prefixed shape appears on any slide, it stays visible on every subsequent morph slide unless explicitly moved to `x=36cm`. `final-check` helper does NOT detect `!!` shapes lingering in the visible area — **only Gate 5b screenshot audit does.** Plan every actor's exit slide in the pair table BEFORE coding.

**Spatial variety rule.** Adjacent slides must have **noticeably different** compositions — displacement ≥ 5cm OR rotation ≥ 15° OR size delta ≥ 30% on at least 3 morph-paired shapes. Without this, morph interpolates nothing visible and the transition collapses to a fade (silent-fail).

**Simultaneous-timing constraint.** All `!!` shapes in one morph pair animate simultaneously. To stagger shape A before shape B, insert an intermediate keyframe slide — there is no per-shape delay knob.

**Paired vs enter vs exit — three behaviors, one rule.** Same mechanism (shape-name match) produces three outcomes:

| Behavior                       | Source slide A             | Target slide B          | Who carries `!!`?                 |
| ------------------------------ | -------------------------- | ----------------------- | --------------------------------- |
| **Paired morph** (interpolate) | has `!!foo`                | has `!!foo`             | both slides, identical name       |
| **Enter** (fade / morph-in)    | — (no counterpart)         | has `!!foo`             | target only — new shape           |
| **Exit via ghost** (slide off) | has `!!foo` at visible `x` | has `!!foo` at `x=36cm` | both — same name, B is off-canvas |

**Outgoing content (not incoming) is what gets `!!`-prefixed + ghosted.** `!!actor-*` shapes silently "disappear" when you forget them — their name going missing on slide B reads as an unpaired exit (plain fade). Always explicit-ghost to `x=36cm` so the exit animation slides off the right edge visibly. One runnable example:

```bash
# Slide 2: actor is visible at x=5cm — Slide 3: same name, ghosted off-canvas → visible slide-off motion
officecli add "$FILE" "/slide[3]" --type shape --prop 'name=!!actor-metric' \
  --prop text="42%" --prop x=36cm --prop y=8cm --prop width=6cm --prop height=3cm
```

**Content (`#sN-*`) is added fresh per slide.** Because text changes every slide, Morph has no meaningful pairing to do on titles / body — it cross-fades them. This is why `#sN-*` get different names per slide (they are intentionally unpaired) and must be ghosted on slide N+1. Scene actors (`!!`) carry the continuity; content (`#`) carries the message.

## Morph Pair Planning (pre-code, REQUIRED)

Before planning morph pairs, if the deck's audience / purpose / narrative is underspecified, run the planning prompt in `reference/decision-rules.md` to emit a `brief.md` first — a morph arc without a narrative spine collapses into "slide with motion", not "story with motion".

Plan every transition in a table inside `brief.md` **before** writing any `officecli add`. Renaming shapes mid-build is the #1 cause of ghost accumulation bugs.

| Pair | Slide A (start)                                  | Slide B (end)                                                | Actors in play                                          | Ghost on Slide B                                                                   |
| ---- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1→2  | `!!scene-ring` centered 5cm, `#s1-title` visible | Ring shifts to x=20cm, grows 8→12cm; `#s2-subtitle` revealed | `!!scene-ring` evolves                                  | `#s1-title` → x=36cm                                                               |
| 2→3  | `!!actor-feature-box` large (14cm wide)          | Feature box small (6cm), `!!actor-metric` enters             | `!!scene-ring`, `!!actor-feature-box`, `!!actor-metric` | `#s2-subtitle` → x=36cm                                                            |
| 3→4  | Content section A                                | Section B divider                                            | —                                                       | `!!actor-feature-box` + `!!actor-metric` → x=36cm (section-exit); `#s3-*` → x=36cm |

**Planning rules:**

1. Decide ALL `!!` names up front — each morph-paired shape must use the **exact same name** on both slides.
2. Classify every `!!` shape as `!!scene-*` or `!!actor-*`. Scene shapes persist; actors must have a planned exit slide.
3. **Section-transition boundary:** when moving into a new topic section, ghost ALL previous-section `!!actor-*` on the first slide of the new section. Only `!!scene-*` (whole-deck decoration) remains.
4. Do NOT start building until the table is complete. If the plan changes mid-build, redraw the table and re-verify affected slides.

## Morph Recipes (4 patterns)

Four patterns cover ~95% of morph decks. `$FILE="deck.pptx"` throughout. Each block is self-contained and ≤ 20 lines.

### (a) Single-element morph — size / position

**Visual outcome.** A hero title centered on slide 1 (size 48pt at y=8cm), then slide 2 shrinks it to 32pt and shifts it to the top-left corner (x=1.5cm, y=1cm) — letting fresh slide-2 content take center stage. One shape, clean motion, no actors.

```bash
FILE="deck.pptx"
officecli create "$FILE"; officecli open "$FILE"

# Slide 1 — hero
officecli add "$FILE" / --type slide --prop layout=blank --prop background=1E2761
officecli add "$FILE" /slide[1] --type shape --prop 'name=!!actor-headline' \
  --prop text="The one idea" --prop x=4cm --prop y=8cm --prop width=26cm --prop height=3cm \
  --prop font=Georgia --prop size=48 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none

# Slide 2 — headline shrinks + moves; new body takes stage
officecli add "$FILE" / --type slide --prop layout=blank --prop background=1E2761 --prop transition=morph
officecli add "$FILE" /slide[2] --type shape --prop 'name=!!actor-headline' \
  --prop text="The one idea" --prop x=1.5cm --prop y=1cm --prop width=12cm --prop height=1.5cm \
  --prop font=Georgia --prop size=24 --prop bold=true --prop color=FFFFFF --prop align=left --prop fill=none
officecli add "$FILE" /slide[2] --type shape --prop 'name=#s2-body' \
  --prop text="Here is the supporting evidence." --prop x=1.5cm --prop y=5cm --prop width=30cm --prop height=2cm \
  --prop font=Calibri --prop size=20 --prop color=CADCFC --prop fill=none

officecli close "$FILE"; officecli validate "$FILE"
```

### (b) Multi-element coordinated morph — Actors / Choreography

**Visual outcome.** Three scene actors (`!!scene-ring`, `!!scene-dot`, `!!scene-band`) repositioned across 3 slides to feel like a camera pan. Fresh per-slide titles fade in / out via the `#sN-*` ghost pattern. Use this when the narrative has a continuous visual backdrop.

```bash
# Slide 1 — anchor composition (already built via recipe a; here we add actors)
officecli add "$FILE" /slide[1] --type shape --prop 'name=!!scene-ring' --prop preset=ellipse \
  --prop fill=E94560 --prop opacity=0.3 --prop x=5cm --prop y=3cm --prop width=8cm --prop height=8cm
officecli add "$FILE" /slide[1] --type shape --prop 'name=!!scene-dot' --prop preset=ellipse \
  --prop fill=0F3460 --prop x=28cm --prop y=15cm --prop width=1cm --prop height=1cm

# Slide 2 — morph: ring moves + grows, dot slides left (spatial variety ≥ 5cm on both)
officecli set "$FILE" "/slide[2]" --prop transition=morph
officecli add "$FILE" /slide[2] --type shape --prop 'name=!!scene-ring' --prop preset=ellipse \
  --prop fill=E94560 --prop opacity=0.6 --prop x=20cm --prop y=2cm --prop width=12cm --prop height=12cm
officecli add "$FILE" /slide[2] --type shape --prop 'name=!!scene-dot' --prop preset=ellipse \
  --prop fill=0F3460 --prop x=3cm --prop y=16cm --prop width=1.5cm --prop height=1.5cm
# Ghost slide-1 content
officecli set "$FILE" "/slide[2]/shape[@name=#s1-title]" --prop x=36cm 2>/dev/null || true  # name path may fail after morph — see Known Issues

# Verify morph pair: identical names on slides 1 & 2
officecli get "$FILE" /slide[1] --depth 1 --json | jq -r '.data.children[]?.format.name // empty'
officecli get "$FILE" /slide[2] --depth 1 --json | jq -r '.data.children[]?.format.name // empty'
# Compare — `!!scene-ring` and `!!scene-dot` MUST appear on both, byte-identical.
```

### (c) Continuous multi-slide morph (story arc) — use helpers

**Visual outcome.** A 5-slide arc telling one continuous story: same 2 scene actors drift across the canvas as the narrative progresses; content (`#sN-*`) refreshes per slide and is ghosted on the next. Building this by hand is ~60 commands — use `reference/morph-helpers.py` to keep the build script short and auto-verified.

```python
#!/usr/bin/env python3
# Invoke the provided helper library for clone + ghost + verify
import subprocess, sys, os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HELPERS = os.path.join(SCRIPT_DIR, "reference", "morph-helpers.py")
FILE = "deck.pptx"

def helper(*args):
    subprocess.run([sys.executable, HELPERS, *[str(a) for a in args]], check=True)

# ... assume slide 1 is built with 2 scene actors (!!scene-ring, !!scene-dot) + #s1-title
# Helper builds slide 2–5 with: clone from previous + apply transition=morph + ghost previous #sN- content
for n in range(2, 6):
    helper("clone", FILE, n - 1, n)          # clone + set transition=morph + list shapes
    helper("ghost", FILE, n, "all-content")  # ghost all #s(n-1)-* via duplicate-text detection
    # …then add THIS slide's #sN- content via officecli add as normal…
helper("final-check", FILE)                   # structural pass; DOES NOT catch !! lingering in visible area
```

Helper signatures and source: `reference/morph-helpers.py` (`clone`, `ghost`, `verify`, `final-check`). The shell equivalent is `reference/morph-helpers.sh` — pick one per platform; do not mix.

**When to use helpers vs raw `officecli`.** For 2-3 slide decks, raw commands (recipes a, b) are clearer. For 5+ slides with repeating clone/ghost/verify cadence, helpers save ~40% of commands and provide built-in verification. Every slide is still closed by `officecli validate` before delivery.

### (d) Morph + fade hybrid — entrance on morph slide

**Visual outcome.** A morph pair where `!!scene-ring` moves continuously while a NEW per-slide card fades in simultaneously. Used when a morph-paired backdrop carries the eye and fresh foreground content needs a softer entrance than a raw appearance.

```bash
# Slide 2 already has transition=morph and !!scene-ring. Add a new card with fade-entrance.
officecli add "$FILE" /slide[2] --type shape --prop 'name=#s2-card' --prop preset=roundRect \
  --prop fill=F5F7FA --prop line=none --prop x=2cm --prop y=12cm --prop width=10cm --prop height=5cm

# Apply simultaneous-with-morph fade entrance to the new card.
# 'fade-entrance-300-with' = fade in, 300ms, trigger=withPrevious (plays with the morph transition).
officecli set "$FILE" "/slide[2]/shape[@name=#s2-card]" --prop animation=fade-entrance-300-with
officecli get "$FILE" "/slide[2]/shape[@name=#s2-card]" --json | jq '.data.format.animation'  # readback sanity
```

**Why this works.** Morph animates the `!!scene-*` shapes only (they have a pair on slide 1); the new `#s2-card` has no slide-1 counterpart, so morph would default-fade it — `fade-entrance-300-with` makes that fade explicit and timed. Keep the animation per pptx v2 floor: ≤ 600ms, no bounce / swivel / fly-from-edge (`officecli help pptx animation` for the canonical preset list).

## Choreography — animation types + staggered timing

How morph animates multiple shapes determines what the audience sees. Pick the right mechanism for each pair:

| Animation type        | How to achieve it (between Slide A and Slide B)                                                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple move           | Same `!!` name on both slides, same size, different `x`/`y` — morph interpolates position                                                                                                                                                                                                                                                       |
| Scale transform       | Same name, different `width`/`height` — morph interpolates size (and re-positions the center)                                                                                                                                                                                                                                                   |
| Move + scale          | Different `x`, `y`, `width`, `height` simultaneously — morph handles all dimensions at once                                                                                                                                                                                                                                                     |
| Color / opacity shift | Same name, different `fill` or `opacity` — morph cross-fades the fill                                                                                                                                                                                                                                                                           |
| Rotation              | Same name, different `rotation` (degrees) — morph rotates along the shortest arc                                                                                                                                                                                                                                                                |
| Font size change      | Same name, different `size` (pt) on text shape — interpolates in PowerPoint 365; less reliable on Keynote / WPS / LibreOffice (may degrade to crossfade). For portable motion, pair `size` change with a matching `width`/`height` delta or an `x`/`y` displacement — the spatial change keeps motion visible when size interpolation drops out |
| Enter (fade in)       | Shape exists only on Slide B (no counterpart on A) — morph fades it in                                                                                                                                                                                                                                                                          |
| Exit (fade out)       | Shape exists only on Slide A (no counterpart on B) — morph fades it out                                                                                                                                                                                                                                                                         |

**Multi-shape timing constraint.** All `!!` shapes in one morph pair animate **simultaneously** — there is no per-shape delay / duration knob in the CLI (help confirms: no `morph.duration` / `morph.delay` on slide). To stagger shape A before shape B, **split the transition into two pairs** with an intermediate slide:

```
Slide 2 → Slide 3:  !!actor-A moves (!!actor-B stays put)
Slide 3 → Slide 4:  !!actor-B moves (!!actor-A stays put or ghosts)
```

Slide 3 is an explicit intermediate keyframe. Do NOT attempt to fake staggering via timing props on the shape's `animation=` prop — Morph runs before per-shape animations.

**Good-enough variety heuristic (Best Practice — creative flexibility).** For a morph to read as "motion", change at least 3 of {x, y, width, height, rotation, fill, opacity} on the dominant paired shape, with displacement ≥ 5cm OR rotation ≥ 15° OR size delta ≥ 30%. One shape × 3 props is a valid creative pattern (focus on one hero element).

**Delivery Gate 5b-morph-2 is stricter.** The gate hard-asserts ≥ 3 DIFFERENT `!!`-prefixed shapes each vary by ≥ 1 of {x, y, width, height, rotation, font-size} across the pair — integrity check for "is this really a morph or a pretend-morph". Heuristic informs creative intent; Gate decides delivery. **Brand-constant scenery (pinned header strip, footer bar, logo badge) does NOT count toward the 3-shape quota** — these are supposed to stay put; motion must come from 3 other named shapes. When in doubt, satisfy the stricter Gate.

**Deck-length rhythm.** Filling every transition with morph reads as anxious, not cinematic. Pace morph moments to deck length:

- **8-10 slides (dense):** 3-5 morph moments; motion can cluster.
- **12-18 slides (ceremonial):** 3-5 TOTAL morphs, spaced every 4-6 slides; use `transition=morph` at section dividers so the animation reads as chapter punctuation, not continuous agitation.
- **18+ slides (Act-based):** structure into 3 acts with 1 long section-divider morph between acts (5-10s of deliberate motion with a brief hold), plus 2-3 quieter morphs inside each act. Lean heavier on `!!scene-*` continuity than per-slide `!!actor-*` churn.

## Scene-actor spatial rule

Scene actors and actors moving across the canvas MUST stay in predictable zones during morph — otherwise they cross over content and read as clutter.

**Safe zones (prefer for scene actor rest positions and morph paths):**

```
Top-right corner:   x ≥ 24cm, y ≤ 6cm
Bottom-right:       x ≥ 24cm, y ≥ 12cm
Bottom-left:        x ≤ 2cm,  y ≥ 12cm
Off-canvas (ghost): x ≥ 33.87cm  (canvas right edge; use x=36cm for explicit ghost)
```

**Avoid resting actors in the content core:** `x = 2~28cm, y = 3~16cm`. Actors may **pass through** the core during morph (that's the motion), but they should not end a slide parked there with high opacity unless they are content themselves (`!!actor-*` carrying the slide's message).

**Before placing any scene actor, inspect existing shape bounds:**

```bash
officecli get "$FILE" "/slide[$N]" --depth 1 --json | \
  jq -r '.data.children[]? | "\(.format.name // .path)  x=\(.format.x) y=\(.format.y) w=\(.format.width) h=\(.format.height)"'
```

Confirm the actor's target position does not overlap any `#sN-*` content shape's bounding box (`x` to `x + width`, `y` to `y + height`). If it would overlap, lower actor `opacity` ≤ 0.15 OR move it to a safe zone.

## Style library lookup workflow

`reference/styles/` holds 52 visual style directories (dark / light / warm / vivid / bw / mixed moods) — design inspiration, not templates. Use the library as **on-demand reference**, not as a content dump.

**Why lookup, not copy.** Each of the 52 `build.sh` files is a complete style demo — but the coordinates were hand-tuned for that specific demo's content length. Copying them verbatim into a deck with different content produces overlaps and misalignment (flagged in `INDEX.md` L5-11). The library's value is the **design logic**: palette choice for a mood, signature shape, choreography pattern. Apply that logic to your own grid math.

**Four-step lookup:**

1. **Browse INDEX.** `reference/styles/INDEX.md` groups all 52 styles by palette category and mood (e.g. `dark--premium-navy` = authoritative / refined; `warm--earth-organic` = organic / grounded). The Quick Lookup table also shows each style's **primary hex trio** (bg / fg / accent) — if the user specified a brand color, scan the hex column to find the nearest match without opening every `style.md`. Pick 1 style that matches the topic mood OR aligns with the user-specified hex.
2. **Read philosophy.** Open `reference/styles/<style-id>/style.md` for design intent — type pairing, color logic, signature elements.
3. **Glance technique.** Open `reference/styles/<style-id>/build.sh` ONLY for technique reference (signature shapes, palette hex codes, choreography ideas) — **coordinates are known-buggy per `INDEX.md` L5-11**; do not copy them.
4. **Apply on your own canvas.** Build your deck using pptx v2 grid math + visual floor; borrow only the palette and the signature gesture.

**Pointer:** `→ see reference/styles/<style-id>/` — never inline-copy coordinates from a style build.sh.

## Delivery Gate (inherits pptx v2 + morph additions)

**Gate 1–5a: full port from pptx v2.** → see pptx v2 §Delivery Gate. Schema (whitelisting C-P-2 chart spPr), token grep (`$…$` / `{{…}}` / `\$\t\n` / `()` / `[]`), hyperlink rPr (C-P-1), slide-order sanity, dark-on-dark contrast (Gate 5a). **Refuse to declare done until every pptx Gate 1–5a prints its OK message.** Morph decks have the same token / schema / order risks as any pptx.

### Gate 2 morph addendum — price / metric tokens eaten by zsh

Pptx v2 Gate 2 covers `$…$`, `{{…}}`, `\$\t\n` literals, empty `()` / `[]`. Morph decks add a class of leaks: price / metric tokens (`$9/mo`, `$29/month`, `$199/yr`) written in double-quoted `--prop text="…"` — the shell eats `$9` as an empty variable and the CLI stores `/mo` or a stray period. Run this in addition to pptx Gate 2:

```bash
# Gate 2 morph — price / metric token leaks + stray-period placeholders
# Pattern hits: bare prices ($9, $29, $9.99), /unit suffix ($9/mo, $199/yr), ${VAR}, \n/\r/\t, lone period
LEAKS=$(officecli view "$FILE" text | grep -nE '\$[0-9]+(\.[0-9]+)?(/(mo|month|yr|year|day|wk|week|hr|hour))?|\$\{[A-Z_]+\}|\\[nrt]|^\.$' || true)
if [ -z "$LEAKS" ]; then echo "Gate 2 morph OK"; else echo "LEAK: $LEAKS"; fi
```

Covers: `$9` `$9.99` `$29/month` `$199/yr` `$1/day` `${VAR}` `\n`/`\r`/`\t` literals + stray `.` placeholders. Fix: single-quote the prop (`--prop text='$9/mo'`).

### Gate 5b — Visual audit via HTML preview (MANDATORY) — extended for morph

Run `officecli view "$FILE" html` and Read the returned HTML path. For every slide, answer the pptx v2 Gate 5b questions (overlap / dark-on-dark / divider overlap / order sanity / missing arrowheads) PLUS these four morph-specific checks:

**Important: selectors with prefix match.** `officecli query` only supports operators `=`, `!=`, `~=`, `>=`, `<=`, `>`, `<` — there is NO `^=` prefix operator. A selector like `shape[name^=!!actor-]` returns an `invalid_selector` error. For "starts-with" filtering, use a `get --depth 1` loop + `jq startswith()` as shown below.

- **5b-morph-1 — `!!actor-*` leak into visible area after its section ends.** For every `!!actor-*` that should have exited, confirm `x ≥ 33.87cm` (canvas right edge). Loop + filter (selector-safe):

  ```bash
  NSLIDES=$(officecli query "$FILE" slide --json | jq '.data.results | length')
  for N in $(seq 1 $NSLIDES); do
    officecli get "$FILE" "/slide[$N]" --depth 1 --json | \
      jq -r --arg n "$N" '.data.children[]? |
        select(.format.name? // "" | startswith("!!actor-")) |
        select((.format.x // "0cm" | rtrimstr("cm") | tonumber) < 33.87) |
        "slide \($n) leak: \(.format.name) stuck at x=\(.format.x)"'
  done
  ```

  Any line printed = actor stuck visible. `final-check` misses this — only the loop + Read HTML do.

- **5b-morph-2 — Adjacent slides have identical spatial composition (no motion).** Hard rule: between every morph pair, ≥ 3 DIFFERENT `!!`-prefixed shapes must each differ by ≥ 1 of {x, y, width, height, rotation, font-size}. Proof loop (dump both slides, diff same-name shapes, count differing shapes):

  ```bash
  for K in 1 2 3 4; do
    A=$(officecli get "$FILE" "/slide[$K]" --depth 1 --json | \
      jq -r '.data.children[]? | select(.format.name? // "" | startswith("!!")) |
        "\(.format.name)|\(.format.x)|\(.format.y)|\(.format.width)|\(.format.height)|\(.format.rotation // 0)"')
    B=$(officecli get "$FILE" "/slide[$((K+1))]" --depth 1 --json | \
      jq -r '.data.children[]? | select(.format.name? // "" | startswith("!!")) |
        "\(.format.name)|\(.format.x)|\(.format.y)|\(.format.width)|\(.format.height)|\(.format.rotation // 0)"')
    VARIES=$(diff <(echo "$A") <(echo "$B") | grep -c '^[<>]')
    if [ "$VARIES" -lt 6 ]; then echo "pair $K→$((K+1)) FLAT: only $VARIES diff-lines (need ≥ 6 = 3 shapes × 2 sides)"; fi
  done
  ```

- **5b-morph-3 — Morph-pair name mismatches.** Adjacent slides must share at least 2 `!!`-prefixed names exactly. Proof (note: `.data.children[]` — bare `.children[]` returns null):

  ```bash
  for N in 1 2 3 4 5; do
    echo "--- slide $N ---"
    officecli get "$FILE" "/slide[$N]" --depth 1 --json | \
      jq -r '.data.children[]? | select(.format.name? // "" | startswith("!!")) | .format.name'
  done
  ```

  Visually compare sequential blocks — shared `!!` names between N and N+1 are the morph pairs. Zero overlap = the pair is a plain fade.

- **5b-morph-4 — `#sN-*` lingering on slide N+1 (ghost leak).** Per-slide content MUST be ghosted (`x=36cm`) on the NEXT slide. Loop + filter per N≥2:
  ```bash
  NSLIDES=$(officecli query "$FILE" slide --json | jq '.data.results | length')
  for N in $(seq 2 $NSLIDES); do
    PREV=$((N-1))
    officecli get "$FILE" "/slide[$N]" --depth 1 --json | \
      jq -r --arg n "$N" --arg p "$PREV" '.data.children[]? |
        select(.format.name? // "" | startswith("#s\($p)-")) |
        select((.format.x // "0cm" | rtrimstr("cm") | tonumber) < 33.87) |
        "slide \($n) leak: \(.format.name) stuck at x=\(.format.x)"'
  done
  ```
  Any line printed = a `#s(N-1)-*` shape stayed visible on slide N. Ghost it.

**REJECT the delivery** if any 5b-morph-1..4 loop prints a line. Collect stdout from all four loops into one stream and enforce with the COUNT pattern: `LEAK_COUNT=$(...all four loops... | wc -l); if [ "$LEAK_COUNT" -gt 0 ]; then echo "REJECT: $LEAK_COUNT morph leaks"; else echo "Gate 5b-morph OK"; fi`.

## Renderer honesty

**Morph renders in:** PowerPoint 365 (Windows/Mac), Keynote, WPS, PowerPoint Online.

**Morph does NOT render in:** LibreOffice Impress (renders static, sometimes as fade), Google Slides web viewer (loses interpolation), most HTML / SVG viewers, `officecli view html` (structural only — morph is runtime). This is `[RENDERER-BUG]`, not a skill defect. Tell the user explicitly: "Open in PowerPoint 365 / Keynote / WPS to see the morph motion; other viewers will show static or plain fade."

Static screenshots from any renderer **cannot verify morph motion** (the motion only exists at runtime). Use Gate 5b queries above to prove pair correctness; use a live viewer to prove motion quality.

## Ghost Discipline & Actor Lifecycle

**Every `!!actor-*` and `#sN-*` shape must be managed across EVERY slide, not just its "exit" slide.**

### The Per-Slide Ghosting Rule

When building a multi-slide morph deck:

1. **Slide N: Introduce `!!actor-ring` (visible at x=0cm)**
2. **Slide N+1: Add new content. Before finishing, ghost `!!actor-ring` to `x=36cm`.**
3. **Slide N+2: Add more content. Re-ghost `!!actor-ring` to `x=36cm` again.** (Not optional — even though it was already off-screen, each slide is a fresh canvas.)
4. **Slide N+3: If `!!actor-ring` should be visible again, move it back to x=0cm or its new position.**

**Why:** Each slide's shape list is independent. Moving a shape off-canvas on slide N does NOT carry over to slide N+1 — if you forget to re-ghost it, it will re-appear at its original position on N+1.

### Workflow Pattern (Bash)

```bash
# After adding new content shapes to slide $SLIDE:
for ACTOR in "!!actor-ring" "!!actor-dot" "!!actor-accent-bar"; do
  officecli set "$FILE" "/slide[$SLIDE]/shape[@name=$ACTOR]" --prop x=36cm || true
done
```

Or in a build loop:

```bash
for SLIDE_NUM in 3 4 5 6 7 8 9 10 11; do
  # Add content specific to this slide
  officecli add "$FILE" "/slide[$SLIDE_NUM]" --type shape ...

  # IMMEDIATELY ghost all old actors (M-2 prevention)
  officecli set "$FILE" "/slide[$SLIDE_NUM]/shape[@name=!!actor-ring]" --prop x=36cm || true
  officecli set "$FILE" "/slide[$SLIDE_NUM]/shape[@name=!!actor-dot]" --prop x=36cm || true
done
```

### Detection: Ghost Count Gate

`morph-helpers.py final-check` counts all shapes at `x ≥ 34cm`. If count > 50, it prints:

```
REJECT: Found 135 accumulated ghosts — likely M-2 ghost accumulation.
Run: officecli query deck.pptx 'shape[x>=34cm]' --json | jq '.data.results | length'
Expected ≤ 50 (roughly 4–5 active actors × 10–12 slides).
```

**Fix:** Review the build log, ensure every slide re-ghosts all actors that should not appear in it. Re-run final-check. If still > 50, use `morph-helpers.py clean-accumulation deck.pptx` (see reference section).

## Common Morph Pitfalls (design + workflow traps)

Base pptx pitfalls (shell quoting, zsh `[N]` globbing, hex `#` prefix, `\n` in prop text) → see pptx v2 §Common Pitfalls. These are the morph-specific traps:

| Pitfall                                                                          | Correct approach                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `!!scene-card` and `!!actor-card` in the same deck                               | Names must be unique across prefixes. Rename: `!!scene-card-bg` vs `!!actor-card-content`                                                                                                                                                                                                                                                                                                                  |
| Renaming shapes mid-build after some slides are already done                     | Ghost accumulation bug waiting to happen. Stop, redraw the §Morph Pair Planning table, rerun affected slides                                                                                                                                                                                                                                                                                               |
| Placing `!!actor-*` into the content core without planning an exit               | Every `!!actor-*` needs a ghost slide. Plan it in the pair table BEFORE coding                                                                                                                                                                                                                                                                                                                             |
| **Ghost accumulation (M-2): forgetting to re-ghost `!!actor-*` on later slides** | **CRITICAL:** When you add new content to slide N+1, ALL `!!actor-*` from slide N that should not be visible must be moved to `x=36cm` again. Do NOT assume they stay off-screen once ghosted — each slide is independent. Build pattern: `for each new slide: add content shapes → then loop: set each active !!actor-* to x=36cm`. `morph-helpers.py final-check` will REJECT if ghost count exceeds 50. |
| Forgetting `transition=morph` on a slide                                         | Silent fade. Gate 5b-morph-2 (no motion) catches it; fix via `set /slide[N] --prop transition=morph`                                                                                                                                                                                                                                                                                                       |
| Using `@name=` path on a morph slide after `transition=morph` was set            | Selector breaks (M-1). Switch to index paths `/slide[N]/shape[K]`                                                                                                                                                                                                                                                                                                                                          |
| Adjacent slides visually identical                                               | Morph has nothing to interpolate — collapses to plain fade. Apply §Scene-actor spatial rule and move ≥ 3 shapes by ≥ 5cm / ≥ 15°                                                                                                                                                                                                                                                                           |
| Trying to stagger 2 shapes via per-shape timing                                  | Not supported — split the pair into two transitions with an intermediate keyframe slide                                                                                                                                                                                                                                                                                                                    |
| Testing morph motion in LibreOffice or a browser                                 | `[RENDERER-BUG]`, not skill defect. Test in PowerPoint 365 / Keynote / WPS                                                                                                                                                                                                                                                                                                                                 |
| Deleting a `!!` shape on exit instead of ghosting it                             | Deletion breaks morph pairing — the shape vanishes without animation. Always ghost to `x=36cm`                                                                                                                                                                                                                                                                                                             |
| Writing `--prop text="$9/mo"` with double quotes                                 | Shell eats `$9` as empty variable → text stored as `/mo` or stray `.`. Use single quotes: `--prop text='$9/mo'`. Gate 2 morph addendum greps this leak.                                                                                                                                                                                                                                                    |
| Using `<a:br/>` literal inside `--prop text='line1<a:br/>line2'`                 | Stored as 7 literal characters, not a line break. Use `officecli add "/slide[N]/shape[@id=K]" --type paragraph` once per line (M-6).                                                                                                                                                                                                                                                                       |
| Using `shape[name^=!!actor-]` selector                                           | `officecli query` has no `^=` operator — returns `invalid_selector`. Use `get /slide[N] --depth 1 --json \| jq '.data.children[]? \| select(.format.name \| startswith("!!actor-"))'`.                                                                                                                                                                                                                     |
| Running `validate` while resident mode is open                                   | Pptx v2 inherits this trap — `officecli close "$FILE"` BEFORE `validate`                                                                                                                                                                                                                                                                                                                                   |

## Known Issues & Pitfalls

Base pptx bugs C-P-1..7 (hyperlink rPr, chart ChartShapeProperties warning, animation duration readback, animation remove, connector enum, connector `@name=`, chart-color renderer normalization) all apply. **→ see pptx v2 §Known Issues C-P-1..7 for workarounds.**

**Morph-specific (M-1..5):**

| #          | Symptom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Workaround                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M-1**    | After `officecli set '/slide[N]' --prop transition=morph`, every shape on that slide has `!!` auto-prepended to its name (`#s1-title` → `!!#s1-title`). Name-path selectors like `/slide[N]/shape[@name=#s1-title]` stop matching silently. **Selector filter caveat:** after auto-prefix, `!!#sN-caption` coexists alongside `!!actor-*` — filtering "scene actors" with `startswith("!!")` produces false matches on auto-prefixed content. Always filter with `startswith("!!actor-")` or `startswith("!!scene-")`, never bare `startswith("!!")`. | Use **index paths** after morph is set: `get /slide[N] --depth 1` to list shapes, then address via `/slide[N]/shape[K]`. Keep a shape-index comment at the top of the build script.                                                                                                                                                                                                                      |
| **M-2 🚨** | **Ghost accumulation — `!!actor-*` introduced on slide 3 stays visible on slides 4, 5, 6 unless EXPLICITLY ghosted every page.** `final-check` helper detects this and rejects if ghost count > 50.                                                                                                                                                                                                                                                                                                                                                   | **MANDATORY per-slide rule:** After you add new content to a slide, immediately set ALL active `!!actor-*` from previous slides to `x=36cm` (or explicitly position them visible if they belong in the current context). Example: `officecli set /slide[4]/shape[@name=!!actor-ring] --prop x=36cm`. Run after EVERY slide addition, not just at the end. See §Ghost Discipline & Actor Lifecycle below. |
| **M-3**    | Section-transition boundary — on the first slide of a new topic section, previous-section `!!actor-*` shapes visibly linger. No command errors; only visual clutter.                                                                                                                                                                                                                                                                                                                                                                                  | On every section-start slide, explicitly ghost ALL `!!actor-*` from the previous section to `x=36cm`. Scene shapes (`!!scene-*`) stay.                                                                                                                                                                                                                                                                   |
| **M-4**    | `officecli help pptx slide` lists `transition=` but NO sub-props for duration / delay / easing of the transition itself. Agents sometimes invent `morph.duration=` / `transition.delay=` — they are rejected as UNSUPPORTED.                                                                                                                                                                                                                                                                                                                          | Accept defaults (morph ~1s, linear ease). For custom speed, use `raw-set` to add the `spd` attribute on `<p:transition>` — see M-4 example block below. Help does not list sub-props; `raw-set` is the only path.                                                                                                                                                                                        |
| **M-5**    | `[RENDERER-BUG]` LibreOffice / Google Slides web viewer render morph slides as plain fade (no interpolation).                                                                                                                                                                                                                                                                                                                                                                                                                                         | Test in PowerPoint 365 / Keynote / WPS. Not a skill defect — do not chase.                                                                                                                                                                                                                                                                                                                               |
| **M-6**    | `<a:br/>` written inside `--prop text='line1<a:br/>line2'` is stored as the literal 7-character string, NOT interpreted as a line break. Audience sees `line1<a:br/>line2` rendered verbatim.                                                                                                                                                                                                                                                                                                                                                         | For multi-line bullets / captions, add one paragraph per line: `officecli add "/slide[N]/shape[@id=K]" --type paragraph --prop text='line1'` then repeat with `text='line2'`. See pptx v2 §Shell escape for the real-newline workflow.                                                                                                                                                                   |

**M-4 example — slow down all morph transitions** (`raw-set` requires a `<part>` positional arg; `//p:transition` matches both `mc:Choice` and `mc:Fallback` on a morph slide, yielding `2 element(s) affected`):

```bash
# Per-slide: add spd="slow" to every transition element on slide N (2 XML hits per morph slide)
for N in 2 3 4; do
  officecli raw-set "$FILE" "/slide[$N]" --xpath "//p:transition" --action setattr --xml 'spd=slow'
done
officecli validate "$FILE"
```

Readback: `officecli query "$FILE" slide --json | jq '.data.results[].format | select(.transition=="morph") | .transitionSpeed'` prints `"slow"` for each affected slide.

## Outputs & delivery

Every morph deck ships with three artifacts, each as a standalone file:

1. `<topic>.pptx` — the deck, closed + `officecli validate` clean (Delivery Gate 1 OK).
2. `build.sh` or `build.py` — the re-runnable script (bash for shell-native builds; Python for multi-slide arcs using `morph-helpers.py`). Must recreate the deck from a fresh `officecli create` call.
3. `brief.md` — **standalone file, NOT embedded in anything else.** Contains:
   - Section 1: topic / audience / purpose / narrative / style direction (1 named style from `reference/styles/INDEX.md`)
   - Section 2: slide-by-slide outline (page type + one-sentence argument per slide)
   - Section 3: §Morph Pair Planning table (Pair / Slide A / Slide B / Actors / Ghosts) — the design record the reviewer needs to audit choreography

**Pre-deliver reminder to the user (verbatim-safe wording):**

- "The deck is ready with morph transitions. Open it in PowerPoint 365 / Keynote / WPS to see the motion — LibreOffice and web viewers render static."
- "While the build script is running, the `.pptx` may be rewritten several times. If you want to preview progress, use `officecli watch "$FILE"` and open the live preview in AionUi — do NOT click 'Open with system app' during the build, or you'll hit a file lock."

## Adjustments after creation

Standard adjustments table → see pptx v2 §Common Pitfalls / `swap` / `move` / `remove` / `set`. Morph caveat: **after any `swap` or `move` that reorders morph-paired slides, re-verify the adjacency of shared `!!` names.** Run Gate 5b-morph-3 query above on the affected pairs — if the swap broke a pair, either rename shapes or re-choreograph the transition.

**Final sanity check before delivery.** Run the full Delivery Gate (1 through 5b-morph-1..4), open the `.pptx` in PowerPoint 365 / Keynote / WPS, watch one full slide-to-slide morph to confirm motion is visible. If any Gate prints REJECT, fix and re-run — never deliver with a known-open gate.

## References

- `reference/decision-rules.md` — Pyramid Principle, SCQA, page-type menu, `brief.md` schema. Read during §Morph Pair Planning to decide narrative arc before writing commands.
- `reference/pptx-design.md` — residual design notes (Scene Actors mechanics, page-type table, choreography patterns). Canvas / fonts / colors live in pptx v2 — this file covers only the morph-unique material.
- `reference/morph-helpers.py` — Cross-platform (Mac / Windows / Linux) Python helpers for clone + ghost + verify + final-check. Import as a library or call via CLI args. Preferred for 5+ slide arcs.
- `reference/morph-helpers.sh` — Bash equivalent. Pick one per project; do not mix.
- `reference/styles/INDEX.md` — 52-style visual library, grouped by palette (dark / light / warm / vivid / bw / mixed) and mood. Lookup workflow in §Style library lookup workflow above.
- `skills/officecli-pptx/SKILL.md` — base pptx v2 rules (visual floor, grid, canonical palettes, chart-choice, connector canon, Delivery Gate 1–5a, Known Issues C-P-1..7, Shell escape 3-layer).
