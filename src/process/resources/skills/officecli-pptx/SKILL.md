---
# officecli: v1.0.63
name: officecli-pptx
description: "Use this skill any time a .pptx file is involved -- as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file; editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions 'deck', 'slides', 'presentation', 'pitch', or references a .pptx filename."
---

# OfficeCLI PPTX Skill

## BEFORE YOU START

**Mental model.** A `.pptx` is a ZIP of XML parts (`ppt/slides/*.xml`, `slideLayouts/`, `slideMasters/`, `theme*.xml`, `charts/`, `media/`, `notesSlides/`). `officecli` gives you a semantic-path API (`/slide[N]/shape[M]`, `/slide[N]/shape[@name=X]`) over it. Raw XML only via `raw-set`.

**Slides are consumed at ~3 seconds per slide in a live room.** Scanned, not read. Every design decision below serves that constraint.

**Install check.** If `officecli --version` fails, install then open a new terminal (should report `1.0.63` or newer):

- macOS / Linux: `curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash`
- Windows (PowerShell): `irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex`

**Shell quoting (zsh / bash).** ALWAYS quote element paths (`"/slide[1]/..."`). Single-quote values containing `$`. Never hand-write `\$` / `\t` / `\n` — CLI does not interpret them. Full rules in "Shell escape — three layers" below.

**Incremental execution.** One command → check exit code → continue. A 50-command script that fails at command 3 cascades silently. After any structural op (new slide, chart, animation, connector) run `get` before stacking more.

## ⚠️ Help-First Rule

**This skill teaches what good slides look like, not every command flag. When a property name, enum value, or alias is uncertain, consult help BEFORE guessing.**

```bash
officecli help pptx                         # List all pptx elements
officecli help pptx <element>               # Full element schema (e.g. shape, chart, animation, connector, zoom, group, background)
officecli help pptx <verb> <element>        # Verb-scoped (e.g. add shape, set slide)
officecli help pptx <element> --json        # Machine-readable schema
```

Help is pinned to the installed CLI version (v1.0.63). When skill and help disagree, **help is authoritative**. Triggers to run help immediately: `UNSUPPORTED props:` warning, unknown animation preset, `connector.shape=` enum (drifts — C-P-5), prop-vs-alias (`lineWidth` vs `line.width`, `color` vs `font.color`).

## Requirements for Outputs

These are the deliverable standards every deck MUST meet. Violating any one = not done, regardless of content quality.

### All decks

**One idea per slide.** If a slide needs a second title to explain what it covers, split it. Dense "everything about X" slides lose the audience inside 3 seconds. Use a section divider to group related one-idea slides, not a mega-slide.

**Explicit type hierarchy — do NOT rely on theme defaults.** Theme defaults drift between masters. Set sizes explicitly on every text shape. **This is the single source of truth — Visual Floor, Design Principles, and Pitfalls all cross-link back here.**

| Element              | Minimum         | Typical |
| -------------------- | --------------- | ------- |
| Slide title          | **≥ 36pt** bold | 36–44pt |
| Section / subtitle   | ≥ 20pt          | 20–24pt |
| Body text            | **≥ 18pt**      | 18–22pt |
| Caption / axis label | ≥ 10pt muted    | 10–12pt |

Title must be **≥ 2× body size** (36pt over 20pt works; 28pt over 20pt looks timid). Four legit exceptions to body ≥ 18pt: chart axis labels, legends, footer / page number, and ≤ 5-word KPI sublabels (e.g. "Active users"). Descriptive sentences must be ≥ 18pt. Left-align body; center only titles and hero numbers.

**Two fonts max, one palette.** One heading font + one body font (e.g. Georgia + Calibri). One dominant brand color (60–70% weight) + one supporting + one accent. Never mix 4+ colors in body content.

**Every slide carries a non-text visual.** Shape, chart, icon, gradient band. A bullet-only deck is interchangeable with a Word doc. Exceptions: literal quote slides, code blocks, a single summary-table slide.

**Speaker notes on every content slide.** `--type notes --prop text="..."`. The speaker needs a script; the audience shouldn't read the slide verbatim.

**Preserve existing templates.** When a file already has a theme and masters, match them. Existing conventions override these guidelines.

### Visual delivery floor (applies to EVERY deck)

Before declaring done, the per-slide render (see QA) MUST satisfy:

- **Type hierarchy met** — see Requirements table above (title ≥ 36pt, body ≥ 18pt, title ≥ 2× body). Verify via `view annotated`.
- **No placeholder tokens rendered as content.** `{{name}}`, `$fy$24`, `<TODO>`, `lorem`, `xxxx`, empty `()`/`[]` in chart titles never appear.
- **No overflow past slide edges.** For 16:9 (33.87 × 19.05cm), every shape satisfies `x + width ≤ 33.87cm` AND `y + height ≤ 19.05cm`. `get` and check — don't eyeball.
- **No text overflow inside shapes.** A 72pt KPI in a 4cm-tall box clips. Shrink the number, enlarge the box, or shorten the text — never trim content to fit.
- **Cover slide is content-rich.** Title + subtitle + presenter/client block + date + a brand band or key-takeaway strap. A cover with 80% whitespace reads as a stub.
- **Contrast floor.** On dark backgrounds (brightness < 30%), body text MUST be `FFFFFF` or > 80%-bright. Mid-gray on dark navy is invisible on projection.
- **Animation restraint.** ≤ 1 animation per slide, ≤ 600ms, entrance/emphasis only (never `bounce`, `swivel`, `fly-from-edge`). Animation is a runtime feature — `view html --browser` shows static geometry; the animation itself runs only when the `.pptx` is opened in a live presentation viewer.
- **No `\$`, `\t`, `\n` literals in slide text.** If `view text` shows these, a shell-escape leaked — delete and re-enter via heredoc batch.

If any fails, STOP and fix before declaring done.

### Hard rules worth repeating

- **`layout=blank` is the default for custom designs.** Titles become plain `shape` elements, not placeholders. `view outline` / `view issues` reporting `(untitled)` / `Slide has no title` is **expected**, not a defect. Use `layout=title` + `placeholder[title]` only when screen-reader outline compatibility matters.
- **Alt text on pictures is two-step.** `add --prop alt=` is rejected (C-P-7 bug, still open on 1.0.63). `set /slide[N]/picture[M] --prop alt="..."` afterwards. `view stats "Pictures without alt text: 0"` is a false-positive zero — verify via `view annotated`.
- **Hyperlink + tooltip needs ordering.** Set `link=` + `tooltip=` BEFORE any run-level styling on the same shape, or clean up with raw-set afterwards (Known Issues C-P-1).

## Design Principles

A deck is not a document. The audience has 3 seconds to get each slide before attention drifts.

### The 3-second test

Before adding anything, ask: "If the audience only reads the biggest element and glances once, do they get the point?" If they need to read the bullets, the biggest element is wrong. Promote the answer to the title, demote evidence to smaller supporting text.

### Grid, margins, negative space

Standard widescreen is **33.87 × 19.05cm**. Treat it as a 12-column grid internally:

- **Edge margin ≥ 1.27cm** (0.5") on all sides.
- **Inter-block gap ≥ 0.76cm** (0.3") between cards / columns / rows.
- **≥ 20% negative space per slide.** Filling every pixel reads as amateur.
- For card grids: `usable = 33.87 − 2·margin − (N−1)·gap`, then `col_width = usable / N`. Don't hand-pick x coordinates.

### Type hierarchy — numbers, not vibes

→ See Requirements table above. Non-negotiable floors.

### Color and contrast

One dominant color does 60–70% of visual weight, two supporting tones, one accent used sparingly. Never use 4+ colors in body content.

| Theme            | Dominant | Supporting | Accent   | Dark body |
| ---------------- | -------- | ---------- | -------- | --------- |
| Executive navy   | `1E2761` | `CADCFC`   | `FFFFFF` | `333333`  |
| Forest & moss    | `2C5F2D` | `97BC62`   | `F5F5F5` | `2D2D2D`  |
| Warm terracotta  | `B85042` | `E7E8D1`   | `A7BEAE` | `3D2B2B`  |
| Charcoal minimal | `36454F` | `F2F2F2`   | `212121` | `333333`  |

On dark backgrounds (fill brightness < 30%), text and chart series MUST be white or > 80%-bright. Mid-gray is invisible on projection.

### Chart-choice decision table

Wrong chart type kills the 3-second test:

| Data shape                           | Use                                                             | Avoid                                    |
| ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------- |
| Category comparison (A vs B vs C)    | `column` (vertical) / `bar` (≥ 6 categories, horizontal)        | pie (slices merge), line (no time axis)  |
| Time series, 1–3 series              | `line`                                                          | area (occlusion), bar (implies discrete) |
| Part-of-whole, 2–5 slices            | `pie` / `doughnut`                                              | pie with 8+ slices (unreadable)          |
| Correlation / distribution           | `scatter`                                                       | line (implies ordering)                  |
| Multiple categories × metrics, dense | stacked `column` or heatmap                                     | one chart per metric — consolidate       |
| KPI snapshot (single big number)     | **Large-text shape** (60–72pt + ≤ 5-word sublabel), NOT a chart | gauge chart, tiny bar                    |

Rule of thumb: if > 3 series and > 8 categories, split into two charts or switch to a table.

### Animation restraint

Each animation is a cognitive interrupt. Limits:

- **≤ 1 animation per slide**, duration **≤ 600ms**.
- Use only `fade`, `appear`, or a single `zoom-entrance` on a hero slide.
- Never: `bounce`, `swivel`, `fly-from-edge`, `spin`, multi-object choreography.
- Animation is runtime-only — verify in a live presentation viewer.

→ Presets: `officecli help pptx animation`.

## Common Workflow

1. **Open/close mode.** Always `officecli open <file>` at start + `officecli close <file>` at end. Resident is the default, not an optimization. Use `batch` in ≤ 12-op chunks for repetitive shape grids.
2. **Orient.** New deck: `officecli create deck.pptx`. Existing: `officecli view deck.pptx outline` first. Never edit blind.
3. **Build in display order — HARD RULE.** `--index` on slide add is frequently ignored. Add slides in audience-view order: cover → agenda → section-1 divider → section-1 content → section-2 divider → … → closing. Out-of-order insertion requires `officecli move deck.pptx /slide[N] --index M` + re-verify with `get --depth 0`. **Before final delivery, confirm slide count + narrative arc match your build plan** — Evaluators REJECTed R1 decks where the cover rendered as slide 11 of 14. Gate 4 catches this.
4. **Incremental per slide.** Create slide + background, then title, then supporting shapes / charts / connectors. Always `layout=blank` for custom designs. After each structural op, `get /slide[N] --depth 1` to confirm shape IDs.
5. **Format to spec.** Explicit title ≥ 36pt, body ≥ 18pt, colors from one palette, connectors via `@id=`. Formatting is deliverable, not polish.
6. **Close + verify in target viewer.** `officecli close` writes the ZIP. `view html --browser` is OK for structural QA; **always open in the target presentation viewer before shipping** — chart colors, animations, font substitution, zoom are runtime features that only the live viewer renders faithfully.
7. **QA — assume there are problems.** Fix-and-verify until a cycle finds zero new issues.

## Quick Start

Minimal viable deck: cover slide + one content slide + notes. `$FILE` stands in for your filename — adapt, don't copy-paste.

```bash
FILE="deck.pptx"
officecli create "$FILE"
officecli open "$FILE"

# Cover — dark fill, centered title
officecli add "$FILE" / --type slide --prop layout=blank --prop background=1E2761
officecli add "$FILE" /slide[1] --type shape --prop text="FY26 Strategic Review" \
  --prop x=2cm --prop y=7cm --prop width=29.87cm --prop height=3cm \
  --prop font=Georgia --prop size=44 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none
officecli add "$FILE" /slide[1] --type shape --prop text="Prepared for the Board — April 2026" \
  --prop x=2cm --prop y=10.5cm --prop width=29.87cm --prop height=1.5cm \
  --prop font=Calibri --prop size=18 --prop color=CADCFC --prop align=center --prop fill=none

# Content — white fill, title + body + notes
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" /slide[2] --type shape --prop text="Revenue grew 18% YoY" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30cm --prop height=2cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
officecli add "$FILE" /slide[2] --type shape --prop text="Enterprise renewals and the new EMEA region drove the beat; NRR held at 118%." \
  --prop x=1.5cm --prop y=4cm --prop width=30cm --prop height=3cm \
  --prop font=Calibri --prop size=20 --prop color=333333 --prop fill=none
officecli add "$FILE" /slide[2] --type notes --prop text="Lead with the 18% beat, walk renewals, preview EMEA section."

officecli close "$FILE"
officecli validate "$FILE"
```

Verified: `validate` clean; titles ≥ 36pt, body 20pt, slide 2 has notes. Shape of every build: open → slide+background → title → body → notes → close → validate.

## Reading & Analysis

Start wide, then narrow. `outline` first, `view text` / `get` / `query` once you know where to look.

```bash
officecli view deck.pptx outline          # slide count, titles, shape counts (undercounts tables/charts)
officecli view deck.pptx annotated        # complete per-slide breakdown with fonts, sizes, tables, charts
officecli view deck.pptx text --start 1 --end 5   # text dump (does NOT extract table cells — use get)
officecli view deck.pptx issues           # empty slides, overflow hints
officecli view deck.pptx stats            # counts + missing alt (remember false-positive zero — C-P picture alt note)
```

**Inspect one element.** XPath-style paths, 1-based. ALWAYS quote.

```bash
officecli get deck.pptx "/slide[1]" --depth 1              # shape list with IDs and names
officecli get deck.pptx "/slide[1]/shape[@name=Title]"     # @name selector (LEAD — stable across reorderings)
officecli get deck.pptx "/slide[1]/shape[@id=10007]"       # @id selector (also stable)
officecli get deck.pptx "/slide[1]/chart[1]"               # chart data + config
officecli get deck.pptx "/slide[1]/table[1]" --depth 3     # table rows / cells
```

Add `--json` for machine output. Use `[last()]` for "the last": `/slide[last()]/shape[1]`.

**Query across the deck.** CSS-like selectors; operators `=`, `!=`, `~=`, `>=`, `<=`, `[attr]`:

```bash
officecli query deck.pptx 'shape:contains("Revenue")'
officecli query deck.pptx 'picture:no-alt'                 # accessibility gap
officecli query deck.pptx 'shape[fill=1E2761]'             # color match
officecli query deck.pptx 'shape[width>=10cm]'             # numeric
officecli query deck.pptx 'animation'                      # every animation in the deck
```

**`query --json` output schema.** Results wrap in `.data.results[]`. To extract the first result's ID: `jq -r '.data.results[0].format.id'` — NOT `.[0].id`. Shape name is `.name`; fill is `.format.fill`; textColor is `.format.textColor`. Verify with `query ... --json | jq .data.results[0]` on an unknown shape.

**Visual preview (LEAD).**

```bash
officecli view deck.pptx html --browser       # per-slide PNG in one browser tab — best structural ground truth
officecli view deck.pptx svg --start 3 --end 3   # single slide SVG (charts + gradients do NOT render in SVG)
officecli watch deck.pptx                     # keeps the preview live as you iterate (optional)
```

`view html --browser` is the best structural check. Not final ground truth for runtime-only features (animations, zoom) — see Renderer Honesty.

## Creating & Editing

Verbs: `add` / `set` / `remove` / `move` / `swap` / `batch` / `raw-set`. Ninety percent of a deck is slides, shapes, text, a few charts, pictures, connectors.

### Slides and backgrounds

A slide is `/slide[N]`. Always pass `layout=blank` for custom designs. Background: solid, gradient, or image.

```bash
officecli add deck.pptx / --type slide --prop layout=blank --prop background=1E2761                 # solid
officecli add deck.pptx / --type slide --prop layout=blank --prop "background=1E2761-CADCFC-180"   # gradient (start-end-angle)
officecli add deck.pptx / --type slide --prop layout=blank --prop "background.image=hero.jpg"      # image background (LEAD)
```

→ Full background prop list (image, tiling, alpha, scale): `officecli help pptx background`.

### Shapes

A `shape` holds text, fill, border, position, and optional animation / link.

```bash
officecli add deck.pptx /slide[2] --type shape --prop name=Title --prop text="Key Insight" \
  --prop x=2cm --prop y=2cm --prop width=20cm --prop height=3cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
```

Positioning is explicit — no layout engine, you own the grid math. `--prop preset=` picks geometry (`rect`, `roundRect`, `ellipse`, `triangle`, `arrow`, `star5`, ...); custom `M...Z` paths are NOT supported at the high-level prop layer (use preset or raw-set `a:custGeom`). **Name shapes at creation** (`--prop name=HeroTitle`) and address later with `"/slide[N]/shape[@name=HeroTitle]"` — positional `/shape[3]` breaks after any z-order / remove.

> **ID semantics.** IDs are assigned per-XML-element, not per-`add`-command. Paragraphs and runs consume IDs too — so the 4 IDs returned by 4 `add shape` calls are NOT guaranteed to be sequential (child paragraphs ate some). After a rebuild or remove-then-add, re-`get --depth 1` before referencing IDs. **Prefer `@name=` over `@id=`** — names are stable across all structural ops.

→ `officecli help pptx shape` for the full prop list.

### Text inside shapes (paragraphs, runs, styling)

A shape has paragraphs (`paragraph[K]`) and runs. For one-line text, `--prop text=` on the shape is enough. Multi-line or mixed styling:

```bash
# add --type paragraph accepts only text + align; styling goes through a follow-up set or an add --type run:
officecli add deck.pptx "/slide[2]/shape[@name=Card1]" --type paragraph --prop text="First bullet"
officecli set deck.pptx "/slide[2]/shape[@name=Card1]/paragraph[1]" --prop bold=true --prop size=20 --prop color=FFFFFF

# Styled run in one step:
officecli add deck.pptx "/slide[2]/shape[@name=Card1]/paragraph[1]" --type run \
  --prop text=" (inline detail)" --prop size=14 --prop italic=true --prop color=8899BB
```

For real newlines inside one run, use a batch heredoc with JSON `"\n"`. Shell-quoted `\n` in `--prop text=` is NOT interpreted.

### Charts

Chart types via `officecli help pptx chart` — column, bar, line, pie, doughnut, scatter, area, waterfall, funnel, boxWhisker. Pick per the Design Principles chart-choice table. Two data forms:

```bash
# (a) compact inline — quick demo charts
officecli add deck.pptx /slide[3] --type chart --prop chartType=column \
  --prop "data=Revenue:42,45,48;Growth:2,7,7" --prop "categories=Q1,Q2,Q3" \
  --prop x=2cm --prop y=4cm --prop width=20cm --prop height=10cm --prop title="FY26"

# (b) dotted per-series — multi-series with explicit brand colors (typical case)
officecli add deck.pptx /slide[3] --type chart --prop chartType=column \
  --prop series1.name=Revenue --prop series1.values="42,45,48" --prop series1.color=1E2761 \
  --prop series2.name=Growth  --prop series2.values="2,7,7"    --prop series2.color=CADCFC \
  --prop categories="Q1,Q2,Q3" \
  --prop x=2cm --prop y=4cm --prop width=20cm --prop height=10cm
```

Gotchas: (1) series cannot be added after creation — include all series at `add` time or `remove` + re-add. (2) `gap` / `gapwidth` are ignored at `add` — `set` after creation. (3) chart titles with `()`, `[]`, `TBD` ship as literal text — replace before delivery. (4) some viewers normalize chart colors to theme defaults — verify in the target presentation viewer (C-P-7).

### Pictures

```bash
# add --prop alt= is rejected (UNSUPPORTED, C-P-7). Two-step workflow:
officecli add deck.pptx /slide[4] --type picture --prop src=hero.jpg \
  --prop x=1cm --prop y=1cm --prop width=32cm --prop height=18cm
officecli set deck.pptx "/slide[4]/picture[1]" --prop alt="Product hero, gradient lit from right"
```

Confirm with `officecli query deck.pptx 'picture:no-alt'` — must be empty before delivery (but remember `view stats` is a false-positive zero because alt auto-fills to filename).

### Connectors (LEAD — flowcharts / decision trees first-class)

Draws a line between two shapes or free coordinates. CLI-native props: `shape`, `from`, `to`, `x`, `y`, `width`, `height`, `color`, `headEnd`, `tailEnd` (values: `triangle|arrow|stealth|diamond|oval|none`). `line=`, `lineWidth=`, `lineDash=` are UNSUPPORTED — use raw-set `a:ln` for custom line styling.

- `shape` enum: short form `straight | elbow | curve`, or storage form `straightConnector1 | bentConnector3 | curvedConnector3 | line`. `bentConnector2` / `curvedConnector2` are REJECTED (C-P-5).
- `from=`/`to=` **do NOT accept `@name=`** (C-P-6). Resolve `@id=` first via `query`.
- Arrowheads via `--prop tailEnd=triangle` (or `headEnd=` for reverse direction) — **requires CLI 1.0.63+**. On older 1.0.60–1.0.62 the `tailEnd=` / `headEnd=` props were UNSUPPORTED on connector; fall back to raw-set `<a:tailEnd type="triangle" w="med" len="med"/>` on `/connector[@id=ID]/spPr/ln`. Accepted values: `triangle | arrow | stealth | diamond | oval | none` (plus `closed`/`open`/`circle`, parsed by `ParseLineEndType`). For custom arrow size `w`/`len` on any version, use raw-set.

```bash
# query --json schema: results are wrapped in .data.results[] — NOT bare `.[0]`.
FROM_ID=$(officecli query "$FILE" 'shape[name=BoxA]' --json | jq -r '.data.results[0].format.id')
TO_ID=$(officecli query "$FILE" 'shape[name=BoxB]' --json | jq -r '.data.results[0].format.id')
officecli add "$FILE" /slide[5] --type connector \
  --prop "from=/slide[5]/shape[@id=$FROM_ID]" --prop "to=/slide[5]/shape[@id=$TO_ID]" \
  --prop shape=elbow --prop color=333333 --prop tailEnd=triangle

# Optional — raw-set for custom arrow size (w=med, len=med):
# CONN_ID=$(officecli query "$FILE" 'connector' --json | jq -r '.data.results[-1].format.id')
# officecli raw-set "$FILE" "/slide[5]/connector[@id=$CONN_ID]/spPr/ln" \
#   --action append --xml '<a:tailEnd type="triangle" w="med" len="med"/>'
```

**Every flow connector needs an arrowhead.** Without one, `bentConnector3` renders as a directionless line. Use `--prop tailEnd=triangle` on the connector add or set. `preset=rightArrow` overlay only works for horizontal flows; diamonds / decision trees with diverging edges need `tailEnd=`.

→ `officecli help pptx connector`.

### Animations (LEAD)

One preset per slide, ≤ 600ms. Set via shape-level prop (authoritative; deep-path readback is stale — C-P-3):

```bash
officecli set deck.pptx "/slide[2]/shape[@name=HeroCard]" --prop animation=fade-entrance-400
officecli get deck.pptx "/slide[2]/shape[@name=HeroCard]" --json | jq .animation
officecli set deck.pptx "/slide[2]/shape[@name=HeroCard]" --prop animation=none    # remove (C-P-4)
```

**Get round-trip (1.0.58+).** `get animation[N]` now returns the `trigger` field as well — `onClick | afterPrevious | withPrevious` — so Add/Set and Get round-trip. Verify with `officecli get "$FILE" "/slide[N]/shape[@name=X]/animation[1]" --json | jq '.trigger,.duration'` if you need to confirm the read-back matches what you set.

→ `officecli help pptx animation`.

### Hyperlinks, tooltips, slide-jump

```bash
officecli set deck.pptx "/slide[7]/shape[@name=NavBtn]" --prop link=slide:2 --prop tooltip="Back to Agenda"
officecli set deck.pptx "/slide[7]/shape[@name=DocsBtn]" --prop link=https://example.com
```

**CRITICAL ordering** (C-P-1): on a shape that already has run-level styling (`bold`/`color`/`font`/`size`), setting `link=` + `tooltip=` emits schema-invalid XML. Fix:

1. Set `link=` + `tooltip=` BEFORE any run-level styling. OR
2. Post-hoc cleanup: `officecli raw-set deck.pptx /slide[N] --xpath //a:rPr/a:hlinkClick --action remove`.

### Tables, placeholders, groups, zoom — one-liners

- **Tables** — `--type table --prop rows=N --prop cols=M`. Row-level `set` supports `height`, `header`, `c1/c2/c3`. Cell formatting lives on the cell paragraph / run. Populate rows BEFORE setting table-level font (font cascade gets reset by row ops).
- **Placeholders** — `"/slide[N]/placeholder[title]"` / `placeholder[body]`. Available only when the slide uses a layout with placeholders (not `layout=blank`).
- **Groups** (LEAD) — address children via `"/slide[N]/group[@name=G]/shape[1]"`. Survives reordering better than positional indexes. `officecli help pptx group`.
- **Zoom slide** (LEAD) — `--type zoom --prop targets="3,7,15"`. Section-navigation hub. Zoom is a runtime feature — `view html --browser` shows the static geometry; the zoom interaction runs only in a live presentation viewer. `officecli help pptx zoom`.

### Raw-set escape hatch (L1 / L2 / L3)

- **L1** — high-level props (`--prop fill=`, `--prop size=`): your default.
- **L2** — dotted-attr fallback (`line.width`, `text.padding`, `fill.alpha`): when L1 lacks the knob.
- **L3** — `raw-set` with XML: last resort. Required for `a:ln` line styling, `a:custGeom` custom paths, `a:hlinkClick` cleanup.

Hex colors never start with `#`: `FF0000`, not `#FF0000`.

### Deck-level recipes

Six patterns that aren't obvious from the primitives: (a) cover + section divider, (b) chart + commentary, (c) 4-step flowchart, (d) 10-slide board-review skeleton, (d′) 20-slide Series B / pitch-deck skeleton, (e) KPI callouts, (f) YES/NO decision tree. Each describes the **visual outcome** first, then a runnable block. `$FILE` stands in for your filename.

#### (a) Executive cover + section divider

**Visual outcome.** Cover: dark navy fill, centered 44pt title, 18pt ice-blue meta line, thin brand band at the bottom. Section divider: same dark fill, large translucent "02" (120pt, 15% opacity) behind a 40pt title — the number becomes a background graphic, the title carries the message.

```bash
# Cover
officecli add "$FILE" / --type slide --prop layout=blank --prop background=1E2761
officecli add "$FILE" "/slide[last()]" --type shape --prop name=CoverBand \
  --prop preset=rect --prop fill=CADCFC --prop line=none \
  --prop x=0cm --prop y=18.4cm --prop width=33.87cm --prop height=0.65cm
officecli add "$FILE" "/slide[last()]" --type shape --prop text="Strategic Growth Review" \
  --prop x=2cm --prop y=7cm --prop width=29.87cm --prop height=3cm \
  --prop font=Georgia --prop size=44 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none
officecli add "$FILE" "/slide[last()]" --type shape --prop text="Prepared for Acme Leadership — FY26 Outlook" \
  --prop x=2cm --prop y=11cm --prop width=29.87cm --prop height=1.2cm \
  --prop font=Calibri --prop size=18 --prop color=CADCFC --prop align=center --prop fill=none

# Section divider — translucent number added FIRST (stays behind), title last (stays on top)
officecli add "$FILE" / --type slide --prop layout=blank --prop background=1E2761
officecli add "$FILE" "/slide[last()]" --type shape --prop text="02" \
  --prop x=2cm --prop y=3cm --prop width=29.87cm --prop height=10cm \
  --prop font=Georgia --prop size=120 --prop bold=true \
  --prop color=FFFFFF --prop opacity=0.15 --prop align=center --prop fill=none
officecli add "$FILE" "/slide[last()]" --type shape --prop text="Financial Performance" \
  --prop x=2cm --prop y=7.5cm --prop width=29.87cm --prop height=2.5cm \
  --prop font=Georgia --prop size=40 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none
```

**Z-order.** Later-added shapes are on top. Add background decoration FIRST, titles LAST. If the order got flipped, fix with `--prop zorder=back/front` — but that renumbers siblings, so re-`get --depth 1` before stacking more.

#### (b) Data slide (chart + commentary block)

**Visual outcome.** Left two-thirds: column chart with brand series colors. Right one-third: a "Key Insight" card with 20pt heading and 18pt body — the audience reads the takeaway before parsing the bars.

```bash
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[last()]" --type shape --prop text="FY26 Revenue Beat Plan by 18%" \
  --prop x=1.5cm --prop y=1cm --prop width=30cm --prop height=1.8cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none

# Chart — left 2/3
officecli add "$FILE" "/slide[last()]" --type chart --prop chartType=column \
  --prop series1.name=Actual --prop series1.values="42,45,48,55" --prop series1.color=1E2761 \
  --prop series2.name=Plan   --prop series2.values="40,42,45,48" --prop series2.color=CADCFC \
  --prop categories="Q1,Q2,Q3,Q4" \
  --prop x=1.5cm --prop y=3.5cm --prop width=20cm --prop height=14cm \
  --prop title='FY26 Revenue ($M)'

# Commentary card — right 1/3 (background card + heading + body)
officecli add "$FILE" "/slide[last()]" --type shape --prop preset=roundRect --prop fill=F5F7FA --prop line=none \
  --prop x=22.5cm --prop y=3.5cm --prop width=9.8cm --prop height=14cm
officecli add "$FILE" "/slide[last()]" --type shape --prop text="Key Insight" \
  --prop x=23cm --prop y=4cm --prop width=9cm --prop height=1.2cm \
  --prop font=Georgia --prop size=20 --prop bold=true --prop color=1E2761 --prop fill=none
officecli add "$FILE" "/slide[last()]" --type shape --prop text="EMEA launch + NRR at 118% drove 12pp of the 18pp beat." \
  --prop x=23cm --prop y=5.5cm --prop width=9cm --prop height=11cm \
  --prop font=Calibri --prop size=18 --prop color=333333 --prop fill=none

officecli add "$FILE" "/slide[last()]" --type notes --prop text="Lead with the 18% beat, then the EMEA + NRR story."
```

`$` in chart title: wrap the whole prop in single quotes (`--prop title='FY26 Revenue ($M)'`) to prevent shell expansion.

#### (c) Flowchart / process diagram (connectors + shapes) — batch-heredoc

**Visual outcome.** Four rounded boxes across the slide at y=8cm, each 6cm × 3cm, connected left-to-right with elbow connectors + triangle arrowheads. Boxes alternate dominant / supporting fill. 32pt title above.

Grid math for 4 boxes across a 33.87cm slide with 1.5cm margins: `gap = (33.87 − 2·1.5 − 4·6) / 3 = 2.29cm`. Box x-positions: `1.5, 9.79, 18.08, 26.37`. **Batch heredoc is portable** (no `bc`, no bash arrays); pre-compute coordinates in the JSON.

```bash
# Use explicit slide index — [last()] is rejected in some resident versions (see Pitfalls).
N_SLIDE=$(officecli get "$FILE" --depth 0 | grep -c '"path": "/slide\[')
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
SLIDE=$((N_SLIDE + 1))

officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop name=FlowTitle \
  --prop text="Onboarding in 4 Steps" \
  --prop x=1.5cm --prop y=1cm --prop width=30cm --prop height=1.8cm \
  --prop font=Georgia --prop size=32 --prop bold=true --prop color=1E2761 --prop fill=none

# 4 boxes + overlaid labels in one batch (alternating navy/iceblue fills).
cat <<EOF | officecli batch "$FILE"
[
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"Step1","preset":"roundRect","fill":"1E2761","line":"none","x":"1.5cm","y":"8cm","width":"6cm","height":"3cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"Step2","preset":"roundRect","fill":"CADCFC","line":"none","x":"9.79cm","y":"8cm","width":"6cm","height":"3cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"Step3","preset":"roundRect","fill":"1E2761","line":"none","x":"18.08cm","y":"8cm","width":"6cm","height":"3cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"Step4","preset":"roundRect","fill":"CADCFC","line":"none","x":"26.37cm","y":"8cm","width":"6cm","height":"3cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Step 1","x":"1.5cm","y":"8.5cm","width":"6cm","height":"1cm","font":"Georgia","size":"20","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Step 2","x":"9.79cm","y":"8.5cm","width":"6cm","height":"1cm","font":"Georgia","size":"20","bold":"true","color":"1E2761","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Step 3","x":"18.08cm","y":"8.5cm","width":"6cm","height":"1cm","font":"Georgia","size":"20","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Step 4","x":"26.37cm","y":"8.5cm","width":"6cm","height":"1cm","font":"Georgia","size":"20","bold":"true","color":"1E2761","align":"center","fill":"none"}}
]
EOF

# Connectors. @name= is rejected on from/to (C-P-6); resolve @id= via query (correct jq path below).
# Arrowhead via --prop tailEnd=triangle on add (CLI-native).
for pair in "Step1 Step2" "Step2 Step3" "Step3 Step4"; do
  A=$(echo $pair | cut -d' ' -f1); B=$(echo $pair | cut -d' ' -f2)
  FROM_ID=$(officecli query "$FILE" "shape[name=$A]" --json | jq -r '.data.results[0].format.id')
  TO_ID=$(officecli query "$FILE"   "shape[name=$B]" --json | jq -r '.data.results[0].format.id')
  officecli add "$FILE" "/slide[$SLIDE]" --type connector \
    --prop "from=/slide[$SLIDE]/shape[@id=$FROM_ID]" \
    --prop "to=/slide[$SLIDE]/shape[@id=$TO_ID]" \
    --prop shape=elbow --prop color=333333 --prop tailEnd=triangle
done
```

`shape=elbow` is the canonical short form. `bentConnector3` also works as storage name; `bentConnector2` is **rejected** (C-P-5). `query --json` wraps results in `.data.results[]` — `.[0].id` is WRONG, use `.data.results[0].format.id`.

#### (d) Quarterly review deck skeleton (10-slide blueprint)

**Visual outcome.** A board-ready narrative arc in ten slides. No copy-paste block — the structure below is the decision tree; fill each slide using recipes (a)–(c) and the Design Principles.

| #   | Slide                       | Layout         | Recipe                       | Notes                                                                                                  |
| --- | --------------------------- | -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Cover                       | full dark fill | (a) cover                    | Title + meta line + brand band                                                                         |
| 2   | Agenda                      | white fill     | numbered list                | 5 section titles, 24pt, left-aligned; match exactly what follows                                       |
| 3   | Executive summary           | white fill     | 3 KPI callouts               | Three big numbers (60pt) across the top, one-line qualifier under each, 2-line narrative at the bottom |
| 4   | Section divider: Financials | dark           | (a) divider                  | Big "01" + "Financial Performance"                                                                     |
| 5   | Revenue vs plan             | white          | (b) chart + commentary       | Column chart, insight card                                                                             |
| 6   | Margin walk                 | white          | (b) chart + commentary       | Waterfall chart, key drivers list                                                                      |
| 7   | Section divider: Growth     | dark           | (a) divider                  | Big "02" + "Growth Initiatives"                                                                        |
| 8   | GTM motion                  | white          | (c) flowchart                | 4-step process, connectors                                                                             |
| 9   | Roadmap timeline            | white          | timeline shapes + connectors | 4 quarters as circles on a line, one deliverable under each                                            |
| 10  | Thank you / next steps      | dark           | (a) cover variant            | One bullet per next step, max 3 bullets                                                                |

**Build it.** `officecli open "$FILE"` → loop the slides with the appropriate recipe → `officecli close "$FILE"` → run the Delivery Gate → spot-check in PowerPoint. A 10-slide deck assembled this way takes ~30–50 commands; use `batch` heredocs in ≤ 12-op chunks for the repetitive shapes.

#### (d′) Series B / pitch deck skeleton (20-slide blueprint)

**Visual outcome.** A VC-ready narrative in twenty slides. Same structure as (d) but calibrated for fundraising rhythm: problem → solution → market → product → model → traction → team → financials → ask → close.

| #   | Slide                       | Layout    | Recipe                     | Notes                                                                 |
| --- | --------------------------- | --------- | -------------------------- | --------------------------------------------------------------------- |
| 1   | Cover                       | dark fill | (a) cover                  | Company name + one-line tagline + round/amount + date                 |
| 2   | TL;DR / The Ask             | dark      | 3 KPI callouts             | "$35M Series B · 72% GM · 4.2x LTV:CAC" style                         |
| 3   | Section 01 — Problem        | dark      | (a) divider                | Big "01" + one-line problem statement                                 |
| 4   | Problem data                | white     | (b) chart + commentary     | 3 data cards + sourced footnote, "industry sells X, customers want Y" |
| 5   | Section 02 — Solution       | dark      | (a) divider                | Big "02" + product tagline                                            |
| 6   | How it works                | white     | (c) flowchart              | 4-step product loop, connectors with arrowheads                       |
| 7   | Section 03 — Market         | dark      | (a) divider                | Big "03" + market size one-liner                                      |
| 8   | TAM / SAM / SOM             | white     | (b) chart + commentary     | Column chart + "Why now" list (macro drivers)                         |
| 9   | Section 04 — Product        | dark      | (a) divider                | Big "04" + product positioning                                        |
| 10  | Product in three pieces     | white     | 3-card row                 | Hardware / software / marketplace, with prices                        |
| 11  | Section 05 — Traction       | dark      | (a) divider                | Big "05" + "We shipped. People stayed."                               |
| 12  | ARR trajectory              | white     | (b) chart + commentary     | Line chart + callout number                                           |
| 13  | Retention cohort            | white     | (b) chart + commentary     | Cohort chart + NPS / App Store / referral stats                       |
| 14  | Section 06 — Business model | dark      | (a) divider                | Big "06" + unit-econ summary                                          |
| 15  | Unit economics              | white     | 4 KPI callouts             | CAC / LTV / GM / payback — the VC napkin slide                        |
| 16  | Section 07 — Team           | dark      | (a) divider                | Big "07" + team one-liner                                             |
| 17  | Founders + advisors         | white     | 4-card grid + advisory row | Real prior companies, real names                                      |
| 18  | Section 08 — Financials     | dark      | (a) divider                | Big "08" + trajectory tagline                                         |
| 19  | 4-year plan                 | white     | (b) chart + commentary     | Hockey stick + honest assumptions panel                               |
| 20  | The Ask / Thank you         | dark      | (a) cover variant          | `$XX M` hero number + 3 bullet use-of-funds + contact                 |

Parallel to (d) — swap recipes per row; each divider must appear BEFORE its section content (see Gate 4).

#### (e) KPI callouts — giant-number card grid

**Visual outcome.** Three (or four) giant numbers across a row, each with a one-line unit sublabel + small percent-change chip + one-line takeaway underneath. This is the single most common exec-deck element.

**Text-fit cheatsheet** (pre-compute to avoid wrap). Georgia ≈ `0.9 × size_pt × (char_count / 28)` cm; Calibri ≈ `0.65 ×`. Corollaries for a **7.19cm** card (4 across) vs a **9.76cm** card (3 across):

| Card width | Font    | Max size | Max chars of KPI value      |
| ---------- | ------- | -------- | --------------------------- |
| 7.19cm     | Georgia | 48pt     | 5 (`$84.2`, `118%`, `24.5`) |
| 7.19cm     | Calibri | 48pt     | 6 (`$84.2M`)                |
| 9.76cm     | Georgia | 60pt     | 5–6                         |
| 9.76cm     | Calibri | 60pt     | 7                           |

**Rule.** If the KPI is `$84.2M`, put `$84.2` as the big number and `USD millions` as the sublabel. Do not chase a bigger font into the unit suffix — it will wrap.

Grid math for 3 cards across, 1.5cm margins, 0.76cm gap: `usable = 33.87 − 3 − 2·0.76 = 29.35`, `col_width = 29.35 / 3 = 9.78cm`. x-positions: `1.5, 12.04, 22.58`.

```bash
# 3 KPI cards (navy fill, white number, ice-blue sublabel, terracotta pct chip for the watch-card).
# All 12 adds in one batch. Replace $SLIDE with your target slide index.
cat <<EOF | officecli batch "$FILE"
[
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"K1Card","preset":"roundRect","fill":"1E2761","line":"none","x":"1.5cm","y":"4cm","width":"9.78cm","height":"7cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"84.2","x":"1.5cm","y":"4.8cm","width":"9.78cm","height":"2.8cm","font":"Georgia","size":"60","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"USD millions · ARR","x":"1.5cm","y":"8cm","width":"9.78cm","height":"0.8cm","font":"Calibri","size":"14","color":"CADCFC","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"+24% YoY","x":"1.5cm","y":"9cm","width":"9.78cm","height":"0.8cm","font":"Calibri","size":"14","bold":"true","color":"CADCFC","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"K2Card","preset":"roundRect","fill":"1E2761","line":"none","x":"12.04cm","y":"4cm","width":"9.78cm","height":"7cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"118%","x":"12.04cm","y":"4.8cm","width":"9.78cm","height":"2.8cm","font":"Georgia","size":"60","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Net revenue retention","x":"12.04cm","y":"8cm","width":"9.78cm","height":"0.8cm","font":"Calibri","size":"14","color":"CADCFC","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"best-in-class floor 115%","x":"12.04cm","y":"9cm","width":"9.78cm","height":"0.8cm","font":"Calibri","size":"14","italic":"true","color":"CADCFC","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"K3Card","preset":"roundRect","fill":"B85042","line":"none","x":"22.58cm","y":"4cm","width":"9.78cm","height":"7cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"$1.42","x":"22.58cm","y":"4.8cm","width":"9.78cm","height":"2.8cm","font":"Georgia","size":"60","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"CAC payback (yrs)","x":"22.58cm","y":"8cm","width":"9.78cm","height":"0.8cm","font":"Calibri","size":"14","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"+8% — watch","x":"22.58cm","y":"9cm","width":"9.78cm","height":"0.8cm","font":"Calibri","size":"14","bold":"true","color":"FFFFFF","align":"center","fill":"none"}}
]
EOF
```

Use the accent color (terracotta here) on the single "watch" card so the audience reads risk in one second. Narrative headline above: "Beat plan on 2 of 3 metrics — CAC is the watch-item" beats "FY26 Q1 KPIs" every time.

#### (f) Decision tree — YES/NO branching with diverging-then-converging edges

**Visual outcome.** A decision diamond at the top; two child boxes (YES / NO path) diverging left-right; each path converges to a shared terminal box. Used for LOTO / chemical / fire safety training, compliance triage, escalation rules.

Layout: diamond at top-center (x=13.94, y=2cm, 6×3cm). YES branch at x=3cm y=7.5cm; NO branch at x=24.87cm y=7.5cm; terminal at x=13.94cm y=13cm.

```bash
# One batch: diamond + YES box + NO box + terminal box + YES/NO labels.
cat <<EOF | officecli batch "$FILE"
[
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"Decide","preset":"diamond","fill":"1E2761","line":"none","x":"13.94cm","y":"2cm","width":"6cm","height":"3cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Hazardous energy present?","x":"13.94cm","y":"2.8cm","width":"6cm","height":"1.4cm","font":"Calibri","size":"14","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"YesBox","preset":"roundRect","fill":"B85042","line":"none","x":"3cm","y":"7.5cm","width":"8cm","height":"3cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Lockout + Tagout + Verify","x":"3cm","y":"8.3cm","width":"8cm","height":"1.4cm","font":"Calibri","size":"16","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"NoBox","preset":"roundRect","fill":"CADCFC","line":"none","x":"22.87cm","y":"7.5cm","width":"8cm","height":"3cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Proceed with standard PPE","x":"22.87cm","y":"8.3cm","width":"8cm","height":"1.4cm","font":"Calibri","size":"16","bold":"true","color":"1E2761","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"Done","preset":"roundRect","fill":"2C5F2D","line":"none","x":"13.94cm","y":"13cm","width":"6cm","height":"2.5cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Begin service","x":"13.94cm","y":"13.6cm","width":"6cm","height":"1.2cm","font":"Calibri","size":"16","bold":"true","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"YES","x":"6.5cm","y":"5.8cm","width":"2cm","height":"1cm","font":"Calibri","size":"14","bold":"true","color":"B85042","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"NO","x":"25.5cm","y":"5.8cm","width":"2cm","height":"1cm","font":"Calibri","size":"14","bold":"true","color":"1E2761","align":"center","fill":"none"}}
]
EOF

# 4 connectors: Decide→YesBox, Decide→NoBox, YesBox→Done, NoBox→Done.
# Arrowhead via --prop tailEnd=triangle on add (diamonds diverge — preset=rightArrow fallback does NOT work here).
for pair in "Decide YesBox" "Decide NoBox" "YesBox Done" "NoBox Done"; do
  A=$(echo $pair | cut -d' ' -f1); B=$(echo $pair | cut -d' ' -f2)
  FROM_ID=$(officecli query "$FILE" "shape[name=$A]" --json | jq -r '.data.results[0].format.id')
  TO_ID=$(officecli query "$FILE"   "shape[name=$B]" --json | jq -r '.data.results[0].format.id')
  officecli add "$FILE" "/slide[$SLIDE]" --type connector \
    --prop "from=/slide[$SLIDE]/shape[@id=$FROM_ID]" \
    --prop "to=/slide[$SLIDE]/shape[@id=$TO_ID]" \
    --prop shape=elbow --prop color=333333 --prop tailEnd=triangle
done
```

Color convention: red path = stop/escalate, blue path = standard-action, green terminal = safe end-state. **Every connector carries `--prop tailEnd=triangle`** — without arrowheads, trainees can read a decision tree backwards (Evaluator-flagged life-safety defect in R1). For diamonds, the `preset=rightArrow` overlay does NOT substitute — edges diverge left and right, not horizontally.

## QA (Required)

**Assume there are problems.** First render is almost never correct. If you found zero issues, you were not looking hard enough. The Delivery Gate below is the real work; treat the minimum cycle as warmup.

### Minimum cycle before "done"

1. `officecli view deck.pptx issues` + `view annotated` — empty slides, overflow hints, size violations (< 36pt title, < 18pt body). `"Slide has no title"` on `layout=blank` is expected, not a defect.
2. `officecli view deck.pptx html --browser` — per-slide PNG preview. Walk every slide for alignment, overflow, placeholder leaks, one clear focal point.
3. Query for known defect classes:
   ```bash
   officecli query deck.pptx 'shape:contains("lorem")'
   officecli query deck.pptx 'shape:contains("{{")'
   officecli query deck.pptx 'shape:contains("TODO")'
   officecli query deck.pptx 'picture:no-alt'
   ```
4. `officecli close deck.pptx && officecli validate deck.pptx` — schema check. NEVER run validate against a resident-open file (spurious errors).
5. **Open the deck in the target presentation viewer before shipping.** `view html --browser` catches overflow and placeholders; the target viewer is ground truth for chart colors, fonts, zoom, and animations (these are runtime features).
6. If anything failed, fix, then **rerun the full cycle**. One fix commonly creates another problem.

### Delivery Gate (any failure = REJECT, do NOT deliver)

Five checks. Gates 1–3 are token-grep defenses; Gate 4 catches build-order bugs; Gate 5 is the only visual-assembly check. **None of Gates 1–3 can see a rendered slide** — that is what R1 Evaluators unanimously REJECTed on. Refuse to declare done until every gate prints its OK message.

```bash
FILE="deck.pptx"

# Gate 1 — schema. Whitelist only the benign ChartShapeProperties warnings (C-P-2).
officecli close "$FILE" 2>/dev/null
VALIDATE_OUT=$(officecli validate "$FILE" 2>&1)
echo "$VALIDATE_OUT" | grep -q "no errors found" && echo "Gate 1 OK" || {
  OTHER=$(echo "$VALIDATE_OUT" | grep -v -i "ChartShapeProperties" | grep -i error)
  [ -z "$OTHER" ] && echo "Gate 1 OK (chart spPr whitelist)" || { echo "REJECT Gate 1:"; echo "$OTHER"; exit 1; }
}

# Gate 2 — token leak via CLI text-layer view. Tokens that must NEVER appear in a delivered deck.
# NOTE: `[ ]` empty-bracket branch false-positives on legitimate checkbox UI — prefer `☐` (U+2610) in checklists.
officecli view "$FILE" text | \
  grep -nE '(\$[A-Za-z_]+\$|\{\{[^}]+\}\}|<TODO>|xxxx|lorem|\\[\$tn]|\([[:space:]]*\)|\[[[:space:]]*\])' && \
  { echo "REJECT Gate 2: token leak above"; exit 1; } || echo "Gate 2 OK"

# Gate 3 — raw-XML hyperlink rPr schema trap (C-P-1). Any a:rPr containing a:hlinkClick = REJECT.
officecli raw "$FILE" slide 2>/dev/null | grep -E '<a:rPr[^>]*>.*<a:hlinkClick' && \
  { echo "REJECT Gate 3: hyperlink rPr (C-P-1) — clean with raw-set remove //a:rPr/a:hlinkClick"; exit 1; } || echo "Gate 3 OK"

# Gate 4 — slide-order sanity. Must match your build plan.
SLIDE_COUNT=$(officecli get "$FILE" --depth 0 | grep -c '"path": "/slide\[')
echo "Gate 4: total slides = $SLIDE_COUNT"
# Dump titles in order to compare to your narrative outline:
officecli query "$FILE" 'shape[@name=Title]' --format 'path: %p text: %t' 2>/dev/null || \
  officecli query "$FILE" 'shape' --format 'path: %p name: %n text: %t' | head -40
# REJECT if sequence (cover first, dividers before their sections, closing last) doesn't match your plan.
echo "Gate 4: review above — REJECT if order wrong, else OK"

# Gate 5a — static contrast pre-check. Dark-fill shapes must declare near-white text.
DARK_HIT=$(officecli query "$FILE" 'shape[fill=1E2761],shape[fill=0A1628],shape[fill=8B1A1A],shape[fill=2C5F2D],shape[fill=36454F]' --json 2>/dev/null | \
  jq -r '.data.results[]? | select((.format.textColor // "") | tostring | test("^#?(F[0-9A-F]{5}|FFFFFF)$") | not) | .path' 2>/dev/null)
[ -z "$DARK_HIT" ] && echo "Gate 5a OK" || { echo "REJECT Gate 5a: dark-on-dark candidates below"; echo "$DARK_HIT"; exit 1; }

echo "Delivery Gate 1–5a PASS — proceed to Gate 5b (fresh-eyes visual audit)"
```

Each grep corresponds to an R1 failure: `$...$` = shell-escape leaks, `{{...}}` = unmigrated tokens, `()` / `[]` = chart-title unit placeholders, `\$`/`\t`/`\n` = shell-escape literals, Gate 3 = hyperlink rPr on styled buttons, Gate 4 = scrambled slide order, Gate 5a = dark-on-dark contrast.

### Gate 5b — Fresh-eyes visual audit (MANDATORY, not optional)

You are reading the same deck you wrote. R1 showed that all 3 Testers passed Gates 1–3 AND YET all 3 decks were REJECTed by Evaluators for slide-order + title overlap + dark-on-dark. **Gates 1–4 cannot see rendered slides.** This step is the only visual-assembly check. Do not skip.

Open the per-slide preview:

```bash
officecli view "$FILE" html --browser
```

Walk every slide and answer, for EACH:

- **overlap**: do any text shapes overlap each other or a chart? (flag e.g. a title wrapping to 2 lines with its subtitle underneath the wrap)
- **dark-on-dark**: is any text on a fill where fill brightness < 30% AND text brightness < 80%? (quiz options, phone numbers, labels on navy/red/green cards)
- **divider overlap**: any giant decorative number (01/02/03 at 100pt+) colliding with the divider title text?
- **order sanity**: does the slide sequence match the narrative outline (cover → agenda → dividers-before-their-sections → closing)?
- **missing arrowheads**: do flowchart/decision-tree connectors show direction, or plain lines? (R1 Evaluator flagged 42+ connectors as plain lines.)

REJECT the delivery if ANY of the above is present; list every instance with its slide number. If none, report "Gate 5b PASS".

For scripted/subagent audits, point the subagent at the browser preview URL or hand off the `.pptx` path and the checklist above — the same questions apply.

### Honest limit

`validate` catches schema errors, not design errors. A deck can pass `validate` with 14pt body on every slide, five fonts, placeholder tokens in chart titles, animation on every slide, or gray text on navy. The QA cycle above — especially `view annotated`, `view html --browser`, and opening in the target presentation viewer — is how you catch what validation can't.

## Known Issues & Pitfalls

When something looks broken, attribute it first: **[AGENT-ERROR]** (deck itself is wrong — fix the deck), **[RENDERER-BUG]** (deck is correct; a specific viewer renders it differently — don't chase), or **[SKILL gap]** (rule missing — open an issue).

### CLI bug backlog (C-P-1 through C-P-7)

| #         | Symptom                                                                                                                                            | Workaround                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-P-1** | Hyperlink `link=`+`tooltip=` on a shape with pre-existing run-level styling (`bold/color/font/size`) emits schema-invalid `<a:rPr><a:hlinkClick>`. | Set `link=`+`tooltip=` **BEFORE** any run-level styling. Post-hoc cleanup: `officecli raw-set deck.pptx /slide[N] --xpath //a:rPr/a:hlinkClick --action remove`. Gate 3 in the Delivery Gate catches it. |
| **C-P-2** | `validate` reports `ChartShapeProperties` schema warnings (1 per chart). Renders correctly everywhere.                                             | Whitelist in Gate 1. Do not chase.                                                                                                                                                                       |
| **C-P-3** | `get /slide[N]/shape[@name=X]/animation[1]` returns stale `duration` after `set animation=...`.                                                    | Trust shape-level readback: `get "/slide[N]/shape[@name=X]" --json \| jq .animation`.                                                                                                                    |
| **C-P-4** | `remove /slide[N]/shape[@id=X]/animation[1]` rejected (deep-path accepted by `add` but not `remove`).                                              | Use `set --prop animation=none`, or overwrite with a new preset.                                                                                                                                         |
| **C-P-5** | `shape=bentConnector2` / `curvedConnector2` rejected. Only 3 short + 3 specific storage names accepted.                                            | Use short form `straight \| elbow \| curve`, or storage `straightConnector1 \| bentConnector3 \| curvedConnector3 \| line`.                                                                              |
| **C-P-6** | Connector `from=/to=` rejects `@name=` selectors (works everywhere else).                                                                          | Resolve `@id=` first via `query`. See Recipe (c).                                                                                                                                                        |
| **C-P-7** | [RENDERER-BUG] Some viewers normalize chart series colors to theme defaults, ignoring `seriesN.color=`.                                            | Verify chart colors in the user's target presentation viewer. `view html --browser` respects colors as the officecli-layer ground truth.                                                                 |

### Renderer honesty

`officecli view html --browser` = structural QA (overflow, placeholders, hierarchy). Some features are runtime-only or viewer-specific and only render faithfully in a live presentation viewer: chart series colors (C-P-7), font substitution, animation, zoom, shadow / glow / soft fill, slide-number fields. **Ground-truth layering:** `view html --browser` for officecli-layer structure, then open in the user's target presentation viewer for runtime / color fidelity.

### Schema-invalid on current CLI — disabled APIs + working forms

Props that exit 0 at write time but produce bad XML on close.

| Disabled                                              | Working form                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `add picture --prop alt=`                             | Two-step: `add picture` then `set /slide[N]/picture[M] --prop alt=`                                                                                                |
| `add paragraph --prop bold=/size=/color=/font=`       | `add paragraph --prop text=` then `set paragraph[K] --prop ...` — or `add run`                                                                                     |
| `set slide --prop showHeader=true`                    | Use `showFooter/showSlideNumber/showDate`; or a shape at `y=0.3cm`                                                                                                 |
| `--prop geometry="M 0,0 L 50,50 Z"`                   | Named preset (`rect`, `roundRect`, `ellipse`, ...); or raw-set `a:custGeom`                                                                                        |
| Connector `--prop line=/lineWidth=/lineDash=`         | `--prop color=` + `shape=elbow\|straight\|curve` + `tailEnd=triangle` (CLI-native); raw-set `a:ln` only for custom stroke — see connector section + Recipe (c)/(f) |
| Picture `--prop geometry=ellipse` / `shape=roundRect` | Overlay a `preset=ellipse` shape `fill=none`; or raw-set `p:pic`                                                                                                   |
| Chart `--prop gap=/gapwidth=` on `add`                | `set /slide[N]/chart[M] --prop gap=80` after creation                                                                                                              |

Grep disabled forms in your command log: `grep -nE '(add.*picture.*alt=|add.*paragraph.*--prop (bold|size|color|font)=|showHeader=true|geometry="M|connector.*(line|lineWidth|lineDash)=)' commands.log`.

### Shell escape — three layers

CLI does NOT interpret `\$`, `\t`, `\n`.

1. **Shell.** `$` in a value → single-quote the whole value: `--prop text='$15M'`. Unescaped `$15M` is stripped to `M`.
2. **JSON (batch).** Real newline in shape text goes via `"\n"` inside a `<<'EOF'` heredoc. Writing `\n` in shell-quoted `--prop text=` is a bug.
3. **pptx.** A line break is `<a:br/>`, not `\n`. Prefer multiple `--type paragraph` adds over fighting escapes.

If in doubt, `view text` after writing and compare character-for-character.

## Performance: Resident Mode + Batch

`open`/`close` is the default (see Common Workflow step 1). For grids / timelines / skeletons, **batch** collapses many ops into one API call:

```bash
cat <<'EOF' | officecli batch deck.pptx
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"Title","text":"FY26 Review","x":"2cm","y":"2cm","width":"30cm","height":"2cm","size":"36","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"name":"Body","text":"Revenue grew 18%","x":"2cm","y":"5cm","width":"30cm","height":"10cm","size":"20"}}
]
EOF
```

`<<'EOF'` (single-quoted delimiter) disables all shell expansion — safe for `$`, `'`, `!`.

Quirks: keep arrays **≤ 12 ops** (larger = ~1-in-15 "Failed to send to resident"); never `validate` while resident is open (spurious `drawing` errors — `close` first); `--index` on slide add is unreliable — see Common Workflow step 3. Batch supports: `add / set / get / query / remove / move / swap / view / raw / raw-set / validate`.

## Advanced capability index

Single-verb where pptxgenjs / raw-XML would need hand-work: `help <element> --json`, CSS queries (`shape:contains / picture:no-alt / shape[fill=]`), `@name=` / `@id=` selectors, `view html --browser`, gradient + image backgrounds, zoom slides, animation CRUD, `@id=` connectors, hyperlink + tooltip, groups, resident + batch heredoc, `raw-set` L3, master/layout background override. When in doubt: `officecli help pptx <element> --json`.

## Common Pitfalls

Sanity-check cheatsheet — what breaks on the first try. CLI-bug pitfalls (hyperlink rPr, connector enum / @name, picture alt, animation remove) are covered in Known Issues C-P-1..7; this table is the design + shell traps.

| Pitfall                                              | Correct approach                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unquoted `[N]` in zsh/bash                           | Always quote paths: `"/slide[1]"`. zsh globs unquoted `[1]` → `no matches found` — #1 first-use stumble                                                                                                                                                                                                                                    |
| `--name "foo"`                                       | All attributes go through `--prop`: `--prop name="foo"`                                                                                                                                                                                                                                                                                    |
| Guessing a prop name                                 | `officecli help pptx <element>` — don't improvise                                                                                                                                                                                                                                                                                          |
| Hex colors with `#`                                  | Drop the `#`: `FF0000`, not `#FF0000`                                                                                                                                                                                                                                                                                                      |
| Theme colors                                         | Use `accent1..accent6`, `dk1`, `dk2`, `lt1`, `lt2` — not hex                                                                                                                                                                                                                                                                               |
| `/shape[myname]` (bare name in brackets)             | Use `@name=` selector: `/shape[@name=myname]` or `/shape[@id=10007]`                                                                                                                                                                                                                                                                       |
| Positional `/shape[3]` after z-order / remove        | Positions drift. Use `@name=` / `@id=` for any repeated reference                                                                                                                                                                                                                                                                          |
| `[last]` without parens                              | Must be `[last()]`: `/slide[last()]/shape[1]`                                                                                                                                                                                                                                                                                              |
| `/slide[last()]` in resident mode                    | Some resident versions reject it with "Shapes must be added to a slide: /slide[N]". Use explicit `/slide[N]` from `get --depth 0` for production builds — R1 Tester #2 blocker                                                                                                                                                             |
| `[ ]` empty-bracket checkboxes                       | False-positives Gate 2's empty-bracket token check. Use `☐` (U+2610) / `☑` (U+2611) in checklist UI — R1 Tester #3 blocker                                                                                                                                                                                                                 |
| Connector with no arrowhead                          | Plain `bentConnector3` renders without direction. Use `--prop tailEnd=triangle` on add or set (CLI-native; values: `triangle/arrow/stealth/diamond/oval/none`). For custom size, raw-set `<a:tailEnd w="med" len="med"/>` on `/connector[@id=ID]/spPr/ln`. `preset=rightArrow` overlay works for horizontal flows only. See Recipe (c)/(f) |
| Paths 1-based vs `--index` 0-based                   | `/slide[1]` = first slide; `--index 0` = first position                                                                                                                                                                                                                                                                                    |
| `$` in `--prop text=`                                | Single-quote: `--prop text='$15M'`. Double-quoted `"$15M"` gets shell-expanded to `M`                                                                                                                                                                                                                                                      |
| `\n` / `\t` in `--prop text=`                        | CLI does NOT interpret. Use multiple `--type paragraph`, or batch heredoc with JSON `"\n"`                                                                                                                                                                                                                                                 |
| Dark text on dark background                         | On `fill brightness < 30%`, body text MUST be `FFFFFF` or > 80% bright                                                                                                                                                                                                                                                                     |
| Font size / hierarchy violations                     | See Requirements table — title ≥ 36pt, body ≥ 18pt, title ≥ 2× body. Shrink content, not font                                                                                                                                                                                                                                              |
| Centered body paragraphs                             | Center only titles / hero numbers. Left-align body                                                                                                                                                                                                                                                                                         |
| Accent line under every title                        | Hallmark of AI-generated slides. Use whitespace or a brand band                                                                                                                                                                                                                                                                            |
| Animation on every slide                             | Max 1 per slide, ≤ 600ms, `fade` / `appear` / `zoom-entrance` only                                                                                                                                                                                                                                                                         |
| Modifying a file open in PowerPoint                  | Close it in PowerPoint first                                                                                                                                                                                                                                                                                                               |
| Running `validate` while resident is open            | Spurious errors. `officecli close` first                                                                                                                                                                                                                                                                                                   |
| `view issues "Slide has no title"` on `layout=blank` | Expected on blank layouts (titles are shapes, not placeholders). Not a defect                                                                                                                                                                                                                                                              |

→ When in doubt: `officecli help pptx <element>`, `--json` for agents. Help is authoritative.
