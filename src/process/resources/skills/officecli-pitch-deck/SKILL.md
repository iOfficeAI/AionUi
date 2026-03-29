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

| User Request                                        | Correct Skill               |
| --------------------------------------------------- | --------------------------- |
| Morph-animated or cinematic presentations           | morph-ppt                   |
| Edit/modify an existing .pptx                       | officecli-pptx (editing.md) |
| Excel dashboard or data report                      | officecli-data-dashboard    |
| Word document                                       | officecli-docx              |
| Request is primarily about animation/motion effects | morph-ppt                   |

### pitch-deck vs morph-ppt

| Aspect             | pitch-deck (this skill)             | morph-ppt                            |
| ------------------ | ----------------------------------- | ------------------------------------ |
| Core mechanic      | Layout diversity + content density  | Morph transition + scene actors      |
| Slide construction | Build each slide fresh from scratch | Clone + ghost + modify actors        |
| Animation          | Standard transitions (fade, push)   | Morph (shape-matching across slides) |
| Naming convention  | No special naming                   | `!!actor` + `#sN-content`            |
| Data visualization | Charts, tables, stat callouts       | None (text + shapes only)            |
| Helper scripts     | None needed                         | morph-helpers.sh required            |

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

**Phase 3: Build** -- Create file, set metadata. Build slide by slide using batch mode (heredoc syntax for 4+ elements). Apply chart/table recipes from Sections D/E. Add speaker notes after each slide.

**Phase 4: QA & Deliver** -- Run `officecli validate`. Check the QA checklist below. Deliver with note about validation exceptions if cell merge was used.

---

## Quick Start -- 6-Slide Seed Pitch

```bash
# Setup
officecli create pitch.pptx
officecli set pitch.pptx / --prop title="FitPulse" --prop author="Alex Kim"
PRIMARY="FF6B35"; SECONDARY="1A1A2E"; ACCENT1="00C9A7"; DARK="16213E"

# Slide 1: Title (gradient background, pattern C.1)
cat <<'EOF' | officecli batch pitch.pptx
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"1A1A2E-16213E-180"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"FitPulse","x":"2cm","y":"5cm","width":"29.87cm","height":"4cm","font":"Georgia","size":"48","bold":"true","color":"FF6B35","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"AI That Trains With You","x":"2cm","y":"10cm","width":"29.87cm","height":"2cm","font":"Calibri","size":"22","color":"FFFFFF","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Seed Round | $500K","x":"2cm","y":"13cm","width":"29.87cm","height":"1.5cm","font":"Calibri","size":"14","color":"00C9A7","align":"center","fill":"none"}}
]
EOF
officecli set pitch.pptx "/slide[1]" --prop transition=fade

# Slide 2: Market (3-stat callout, pattern C.2)
cat <<'EOF' | officecli batch pitch.pptx
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"FFFFFF"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"A $96B Market","x":"2cm","y":"1cm","width":"29.87cm","height":"3cm","font":"Georgia","size":"36","bold":"true","color":"1A1A2E","align":"left","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"$96B","x":"2cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"Total Addressable Market","x":"2cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"14","color":"888888","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"$14.7B","x":"12.5cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"Fitness App Market","x":"12.5cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"14","color":"888888","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"$320M","x":"23cm","y":"5cm","width":"9cm","height":"4cm","font":"Georgia","size":"64","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"AI Fitness (beachhead)","x":"23cm","y":"9.5cm","width":"9cm","height":"2cm","font":"Calibri","size":"14","color":"888888","align":"center","fill":"none"}}
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
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"50K","x":"21cm","y":"4cm","width":"11cm","height":"2.5cm","font":"Georgia","size":"44","bold":"true","color":"FF6B35","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"Downloads","x":"21cm","y":"6.8cm","width":"11cm","height":"1.2cm","font":"Calibri","size":"12","color":"888888","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"40%","x":"21cm","y":"8.5cm","width":"11cm","height":"2.5cm","font":"Georgia","size":"44","bold":"true","color":"00C9A7","align":"center","valign":"bottom","fill":"none"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"MoM Growth","x":"21cm","y":"11.3cm","width":"11cm","height":"1.2cm","font":"Calibri","size":"12","color":"888888","align":"center","fill":"none"}}
]
EOF
officecli set pitch.pptx "/slide[3]" --prop transition=push-left
officecli add pitch.pptx "/slide[3]" --type notes \
  --prop text="50K downloads in 3 months with 40% MoM growth. Premium tier growing fastest."

# Slides 4-5: Team (C.11) + Problem/Solution (C.7) -- use patterns from creating.md
# Slide 6: Closing (C.12) -- gradient matching slide 1, fade transition

# QA
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

| Issue                                                      | Impact                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gap` ignored during chart `add`                           | Must apply via separate `set` command                                                                                                            |
| Cell merge produces validation errors                      | PowerPoint renders correctly; note in delivery                                                                                                   |
| Cell-level `color` on table cells causes validation errors | Use row-level `color` instead                                                                                                                    |
| Custom gradient stops (`@`) fail on slide backgrounds      | Use 2-color or 3-color gradients only                                                                                                            |
| Combo chart requires both `comboSplit=1` and `secondary=2` | Missing either renders incorrectly                                                                                                               |
| Dual-axis scale mismatch makes smaller series invisible    | **HARD RULE:** If ranges differ >10x, MUST split into two separate charts. See creating.md D.4                                                   |
| Stat values wrap at 60pt in 7cm width                      | **HARD RULE:** Max 4 chars for `$X.YM` patterns (wide `$`+`.` glyphs); max 5 chars for other values. Use 44-48pt or C.2 (3-stat, 9cm) for longer |
| Doughnut chart `colors` parameter may not apply            | CLI accepts without error but PowerPoint renders default colors. No workaround. Verify via screenshot                                            |
| Empty table cell `c1=""` causes validation error           | Use `c1=" "` (space character) instead of empty string                                                                                           |
| Connector arrows may not all render in batch               | Add connectors in separate batch after shapes; if still missing, add one at a time                                                               |
| Empty series values (gaps) not supported                   | Use `0` for missing data points; produces zero-height bars                                                                                       |

---

## Help System

```bash
officecli pptx set              # All settable elements and properties
officecli pptx set shape        # Shape properties in detail
officecli pptx add              # All addable element types
officecli pptx view             # All view modes
```
