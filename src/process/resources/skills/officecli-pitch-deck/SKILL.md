---
# officecli: v1.0.24
name: officecli-pitch-deck
description: "Use this skill when the user wants to create a pitch deck, investor presentation, product launch deck, sales presentation, or business proposal in PowerPoint format. Trigger on: 'pitch deck', 'investor deck', 'Series A deck', 'product launch presentation', 'sales deck', 'fundraising deck', 'startup pitch', 'business proposal slides', 'seed pitch', 'enterprise sales deck'. Output is always a single .pptx file. This skill does NOT use morph transitions -- for morph-animated presentations, use the morph-ppt skill instead."
---

# Pitch Deck Skill

Create professional pitch presentations from scratch -- investor decks, product launches, enterprise sales decks, and business proposals. Output is a single `.pptx` file with gradient backgrounds, modern charts, styled tables, stat callouts, and speaker notes on every content slide.

---

## BEFORE YOU START (CRITICAL)

**Every time before using officecli, run this check:**

```bash
if ! command -v officecli &> /dev/null; then
    echo "Installing officecli..."
    curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
    # Windows: irm https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.ps1 | iex
else
    CURRENT=$(officecli --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    LATEST=$(curl -fsSL https://api.github.com/repos/iOfficeAI/OfficeCLI/releases/latest | grep '"tag_name"' | sed -E 's/.*"v?([0-9.]+)".*/\1/')
    if [ "$CURRENT" != "$LATEST" ]; then
        echo "Upgrading officecli $CURRENT -> $LATEST..."
        curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
    else
        echo "officecli $CURRENT is up to date"
    fi
fi
officecli --version
```

---

## Use When

- User wants to create an investor pitch deck (seed, Series A/B/C)
- User wants a product launch or feature announcement presentation
- User wants an enterprise sales deck or client-facing pitch
- User wants a business proposal or strategy presentation in slides
- User mentions "pitch deck", "investor deck", "sales deck", "fundraising presentation"

## Don't Use When

| User Request | Correct Skill |
|-------------|--------------|
| Morph-animated or cinematic presentations | morph-ppt |
| Edit/modify an existing .pptx | officecli-pptx (editing.md) |
| Excel dashboard or data report | officecli-data-dashboard |
| Word document | officecli-docx |
| Request is primarily about animation/motion effects | morph-ppt |

### pitch-deck vs morph-ppt

| Aspect | pitch-deck (this skill) | morph-ppt |
|--------|------------------------|-----------|
| Core mechanic | Layout diversity + content density | Morph transition + scene actors |
| Slide construction | Build each slide fresh from scratch | Clone + ghost + modify actors |
| Animation | Standard transitions (fade, push) | Morph (shape-matching across slides) |
| Naming convention | No special naming | `!!actor` + `#sN-content` |
| Data visualization | Charts, tables, stat callouts | None (text + shapes only) |
| Helper scripts | None needed | morph-helpers.sh required |

---

## Hard Rules (Non-Negotiable)

These rules are checked by evaluators and will **FAIL** the deck if violated. No exceptions beyond the explicit list below.

### H-FONT: Body Text Minimum Size + Font Consistency

**ALL body text must be ≥ 16pt.** This applies to EVERY visible text element unless it falls into the explicit exceptions below.

**Elements that MUST be ≥ 16pt (no exceptions):**
- Card body copy / card descriptions
- Flow diagram node description text
- Team bio text
- Timeline step labels
- Business model card copy
- Sub-labels under stat callout numbers (e.g., "Total Addressable Market")
- Any paragraph or supporting text block

**Permitted exceptions (only these — nothing else):**
- Chart axis labels / tick labels: 10pt minimum (e.g., `axisFont="10:64748B:Calibri"`)
- Chart legend text: 10pt minimum (e.g., `legendFont="10:64748B:Calibri"`)
- Table header/body rows: 11-12pt minimum (table cells have constrained space)
- Icon badge initials (letters inside avatar ellipses): any size acceptable

**If you are unsure whether something is an exception: it is NOT. Set it to 16pt.**

**Font consistency (enforced across every shape):**

The font pairing declared in creating.md Section A.3 (e.g., Georgia for titles, Calibri for body) applies to EVERY text shape in the entire deck without exception. This includes:
- Connector labels (if any)
- Footer shapes
- Page number shapes
- Small caption or source-credit shapes
- Notes callout shapes

❌ BANNED: Using any font not declared in your A.3 pairing (e.g., adding Arial, Helvetica, Times New Roman, or any other font mid-deck)
❌ BANNED: Omitting the `font` property on any shape and relying on PowerPoint defaults

Before delivery, scan every `add` command in your script and confirm every shape has an explicit `"font"` value matching your declared pairing.

### H-OVERLAP: No Shape May Overlap Another Shape's Text

After adding connectors and arrows, **immediately take a PNG screenshot** and verify:
1. Every connector is visible (not missing)
2. No connector or arrow overlaps any text box content

If a connector overlaps text, reposition the connector OR send it behind the text box using `--prop zorder=back`. See creating.md C.9 for the full connector verification protocol.

### H-PALETTE: Color Palette Discipline

Use ONLY colors from your pre-defined palette (`$PRIMARY`, `$SECONDARY`, `$ACCENT1`, `$ACCENT2`, etc.). Do NOT introduce additional accent colors not defined at the start of the script. If you used purple on Slide 3 but it was not in your initial palette definition, remove it. Every color in the deck must trace back to a named palette variable.

**Common traps — these WILL cause a FAIL:**

- ❌ BANNED: Red (`FF0000`, `CC0000`, `E53935`, etc.) to indicate "bad/wrong/competitor weakness" — use your palette's darkest color instead
- ❌ BANNED: Green (`00FF00`, `4CAF50`, `34A853`, etc.) to indicate "good/correct/your advantage" — UNLESS green is explicitly declared as a palette variable (e.g., `ACCENT1="34A853"`)
- ❌ BANNED: Gray (`888888`, `999999`, `AAAAAA`, `CCCCCC`, etc.) as a neutral/background color — use a palette light color (e.g., `$LIGHT`) instead
- ❌ BANNED: Any bare hex color value that does NOT appear in your palette variable block

**How to express contrast and status without new colors:**
- "Bad/competitor" column or row → use your palette's darkest or most muted shade (e.g., `$DARK`, `$DARK2`)
- "Good/your product" column or row → use your palette's primary or accent color (e.g., `$PRIMARY`, `$ACCENT1`)
- Neutral/disabled state → use a light-opacity version of an existing palette color, not gray
- Tick mark vs cross mark in comparison tables → use the same text color as the column; do NOT switch to red/green

---

## Core Concepts

1. **Layout-First Construction** -- Select a slide pattern from creating.md Section C, then fill with content. Never manually calculate x/y from scratch.
2. **Color Palette Upfront** -- Define 5-6 hex colors as shell variables before building. All commands reference `$PRIMARY`, `$SECONDARY`, etc.
3. **Slide Pattern Library** -- 11 pre-tested spatial blueprints with positioning tables. See [creating.md](creating.md) Section C.
4. **Chart Styling is Non-Negotiable** -- Every chart uses the modern recipe: `plotFill=none`, `chartFill=none`, subtle gridlines, `series.outline`.
5. **Speaker Notes as Checklist Item** -- Add 2+ sentence notes after each content slide is complete.

---

## Workflow Overview

**Phase 1: Understand** -- Identify deck type (seed/launch/investor/sales), slide count, data provided, color preference.

**Phase 2: Plan** -- Select deck structure from creating.md Section A. Define palette as shell variables. Map each slide to a pattern from Section C. Verify no two consecutive slides share the same layout.

**Phase 3: Build** -- Create file, set metadata, then `officecli open` for resident mode. Build slide by slide using batch mode (heredoc syntax for 4+ elements). Apply chart/table recipes from Sections D/E. Add speaker notes after each slide. `officecli close` before QA.

**Phase 4: QA & Deliver** -- Run `officecli validate`. Check the QA checklist below. Deliver with note about validation exceptions if cell merge was used.

---

## Quick Start -- 6-Slide Seed Pitch

```bash
# Setup
officecli create pitch.pptx
officecli set pitch.pptx / --prop title="FitPulse" --prop author="Alex Kim"
officecli open pitch.pptx        # Resident mode — all batch operations run in memory
PRIMARY="FF6B35"; SECONDARY="1A1A2E"; ACCENT1="00C9A7"; DARK="16213E"; MUTED="64748B"
# MUTED is declared here so stat sub-label colors use a palette variable, not a bare hex gray

# Slide 1: Title (gradient background, pattern C.1)
cat <<'EOF' | officecli batch pitch.pptx
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"1A1A2E-16213E-180"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"FitPulse","x":"2cm","y":"5cm","width":"29.87cm","height":"4cm","font":"Georgia","size":"48","bold":"true","color":"FF6B35","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"AI That Trains With You","x":"2cm","y":"10cm","width":"29.87cm","height":"2cm","font":"Calibri","size":"22","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Seed Round | $500K","x":"2cm","y":"13cm","width":"29.87cm","height":"1.5cm","font":"Calibri","size":"16","color":"00C9A7","align":"center","fill":"none"}}
]
EOF
officecli set pitch.pptx "/slide[1]" --prop transition=fade

# Slide 2: Market (3-stat callout, pattern C.2)
cat <<'EOF' | officecli batch pitch.pptx
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"FFFFFF"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"A $96B Market","x":"2cm","y":"1cm","width":"29.87cm","height":"3cm","font":"Georgia","size":"36","bold":"true","color":"1A1A2E","align":"left","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"$96B","x":"2cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"Total Addressable Market","x":"2cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"16","color":"64748B","align":"center","fill":"none"}},
  // ^^^ "64748B" = $MUTED declared above. Use $MUTED in your palette; in heredoc use its literal hex value.
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"$14.7B","x":"12.5cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"Fitness App Market","x":"12.5cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"16","color":"64748B","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"$320M","x":"23cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"AI Fitness (beachhead)","x":"23cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"16","color":"64748B","align":"center","fill":"none"}}
]
EOF
officecli set pitch.pptx "/slide[2]" --prop transition=push-left
officecli add pitch.pptx "/slide[2]" --type notes \
  --prop text="The global fitness market is 96 billion. Our beachhead is the 320M AI fitness niche."

# Slide 3: Traction (chart + stats, pattern C.4)
cat <<'EOF' | officecli batch pitch.pptx
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"FFFFFF"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"Explosive Early Traction","x":"2cm","y":"1cm","width":"29.87cm","height":"3cm","font":"Georgia","size":"36","bold":"true","color":"1A1A2E","align":"left","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"chart","props":{"chartType":"areaStacked","categories":"Month 1,Month 2,Month 3","series1":"Casual:8000,14000,19200","series2":"Enthusiast:2500,5200,9600","series3":"Pro:500,1200,3200","x":"2cm","y":"4cm","width":"17cm","height":"13cm","colors":"FF6B35,00C9A7,845EC2","plotFill":"none","chartFill":"none","gridlines":"E2E8F0:0.5","legendFont":"10:64748B:Calibri","legend":"bottom","series.outline":"FFFFFF-0.5"}},
  // NOTE: legendFont=10 above is a CHART INTERNAL exception (axis/legend) — allowed.
  // All standalone stat sub-labels and body text outside the chart MUST be >= 16pt (Hard Rule H-FONT).
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"50K","x":"21cm","y":"4cm","width":"11cm","height":"2.5cm","font":"Georgia","size":"44","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"Downloads","x":"21cm","y":"6.8cm","width":"11cm","height":"1.2cm","font":"Calibri","size":"16","color":"64748B","align":"center","fill":"none"}},
  // ^^^ "64748B" = $MUTED. Stat sub-label: must be >= 16pt (Hard Rule H-FONT). Do NOT copy 12pt from old examples.
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"40%","x":"21cm","y":"8.5cm","width":"11cm","height":"2.5cm","font":"Georgia","size":"44","bold":"true","color":"00C9A7","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"MoM Growth","x":"21cm","y":"11.3cm","width":"11cm","height":"1.2cm","font":"Calibri","size":"16","color":"64748B","align":"center","fill":"none"}}
  // ^^^ "64748B" = $MUTED. Stat sub-label: must be >= 16pt (Hard Rule H-FONT). Do NOT copy 12pt from old examples.
]
EOF
officecli set pitch.pptx "/slide[3]" --prop transition=push-left
officecli add pitch.pptx "/slide[3]" --type notes \
  --prop text="50K downloads in 3 months with 40% MoM growth. Premium tier growing fastest."

# Slides 4-5: Team (C.11) + Problem/Solution (C.7) -- use patterns from creating.md
# Slide 6: Closing (C.12) -- gradient matching slide 1, fade transition

# Close and QA
officecli close pitch.pptx
officecli validate pitch.pptx
```

---

## QA Checklist

Run before every delivery. See [creating.md](creating.md) Section G for the full checklist.

1. `officecli validate` = 0 errors. **Exception:** slides with cell merge may report schema warnings that are cosmetic (PowerPoint renders correctly).
2. Every chart is editable (click -> Edit Data appears in PowerPoint)
3. Every table is a native table object (click -> table editing mode)
4. Speaker notes on all content slides (exclude title and closing), >= 2 sentences each
5. No two consecutive slides share the same layout structure
6. **Font consistency:** every shape in the deck uses only the declared font pairing (Georgia + Calibri). No shape may use an undeclared font (Hard Rule H-FONT).
7. **Palette-only colors:** scan all `fill` and `color` values — no bare hex outside the declared palette block. No red/green/gray introduced for status indicators (Hard Rule H-PALETTE).

---

## What This Skill Does NOT Do

- No morph transitions, clone-slide, or `!!` naming
- No 3D effects, motion paths, or video embedding
- No template merge (`{{key}}` patterns)
- No custom SVG geometry or WordArt
- No reading/editing existing .pptx (use officecli-pptx)

---

## Known Issues

See [creating.md](creating.md) Section H for the full list with workarounds. Key issues:

| Issue | Impact |
|-------|--------|
| `view issues` reports "Slide has no title" for every slide | **Expected behavior — safe to ignore.** pitch-deck uses `layout=blank` which has no built-in PowerPoint title placeholder. This is not a bug. |
| `gap` ignored during chart `add` | Must apply via separate `set` command |
| Cell merge produces validation errors | PowerPoint renders correctly; note in delivery |
| Cell-level `color` on table cells causes validation errors | Use row-level `color` instead |
| Custom gradient stops (`@`) fail on slide backgrounds | Use 2-color or 3-color gradients only |
| Combo chart requires both `comboSplit=1` and `secondary=2` | Missing either renders incorrectly |
| Dual-axis scale mismatch makes smaller series invisible | **HARD RULE:** If ranges differ >10x, MUST split into two separate charts. See creating.md D.4 |
| Stat values wrap at 60pt in 7cm width | **HARD RULE:** Max 4 chars for `$X.YM` patterns (wide `$`+`.` glyphs); max 5 chars for other values. Use 44-48pt or C.2 (3-stat, 9cm) for longer |
| Doughnut chart `colors` parameter may not apply | CLI accepts without error but PowerPoint renders default colors. No workaround. Verify via screenshot |
| Empty table cell `c1=""` causes validation error | Use `c1=" "` (space character) instead of empty string |
| Connector arrows may not all render in batch | Add connectors in separate batch after shapes; **immediately screenshot to verify each connector is visible** (CLI reports success even when rendering fails); if still missing, add one at a time or use `--type shape --prop preset=rightArrow` as a reliable fallback |
| Empty series values (gaps) not supported | Use `0` for missing data points; produces zero-height bars |
| Background covers text | In batch, background shapes are added before text shapes. Adding bg shapes AFTER text results in bg covering text completely (higher z-order). Always: bg → text, never text → bg |

---

## Help System

```bash
officecli pptx set              # All settable elements and properties
officecli pptx set shape        # Shape properties in detail
officecli pptx add              # All addable element types
officecli pptx view             # All view modes
```
