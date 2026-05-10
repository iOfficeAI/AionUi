---
name: officecli-pitch-deck
description: "Use this skill when the user is building a fundraising / investor pitch deck — seed, Series A / B / C, convertible note, SAFE round, strategic raise. Trigger on: 'pitch deck', 'investor deck', 'Series A deck', 'Series B deck', 'Series C deck', 'fundraising deck', 'seed pitch', 'VC deck', 'raising capital', 'term sheet presentation'. Output is a single .pptx. This skill is a scene layer on top of officecli-pptx — inherits every pptx v2 rule (visual floor, grid, palettes, connector canon, Delivery Gate). DO NOT invoke for a generic board review, sales deck, all-hands, or product launch — route those to officecli-pptx base."
---

# OfficeCLI Pitch Deck Skill

**This skill is a scene layer on top of `officecli-pptx`.** Every pptx hard rule — visual delivery floor (title ≥ 36pt / body ≥ 18pt / title ≥ 2× body), 12-column grid on 33.87×19.05cm, 4 canonical palettes, chart-choice decision table, connector canon (`shape` / `from` / `to` / `tailEnd=triangle`), shell escape, resident + batch, Delivery Gate 1–5a — is inherited, not re-taught. This file adds only what **fundraising** needs on top: stage diagnosis (A / B / C), 5 赛道 arc templates, 10 key-slide recipes (cover / problem / solution / market / product / model / traction / team / financials / ask), pitch-specific numbers convention, a VC ship-check, and a pitch-specific fresh-eyes Gate 6.

When the pptx base rules cover it, the text here says `→ see pptx v2 §X`. Read `skills/officecli-pptx/SKILL.md` first if you have not.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash`
- **Windows (PowerShell)**: `irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**This skill teaches what a fundraising deck requires, not every command flag.** When a prop name, enum value, or preset is uncertain, consult help BEFORE guessing.

```bash
officecli help pptx                          # All pptx elements
officecli help pptx <element>                # Full schema (e.g. chart, shape, connector, picture)
officecli help pptx <element> --json         # Machine-readable
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins.** Every `--prop X=` in this file has been grep-verified against `officecli help pptx <element>` — if help adds / renames a prop in a later version, trust help.

## Mental Model & Inheritance

**Inherits pptx v2.** You should have read `skills/officecli-pptx/SKILL.md` first. This skill assumes you know how to: add slides + shapes + charts + connectors; address by `@name=` / `@id=`; quote paths; use `batch` heredocs; write `--prop tailEnd=triangle` on every flow connector; and run the 5-gate Delivery Gate. If any of those are unfamiliar, open a pptx v2 session before continuing.

## Shell & Execution Discipline

**Shell quoting, incremental execution, `$FILE` convention** → see pptx v2 §Shell & Execution Discipline. Same rules verbatim — quote `[N]` paths, single-quote values containing `$` (including `$35M`, `$1.2B TAM` in a cover or ask slide), never hand-write `\$ \t \n` in executable examples, one command at a time. Examples below use `$FILE` (`FILE="deck.pptx"`).

**Single-quote every shape text containing `$`.** `--prop text="Series B · $35M"` (double quotes) is WRONG — zsh expands `$35M` → empty, deck renders `Series B · M` silently. `--prop text='Series B · $35M'` (single quotes) is right. This is the #1 pitch-deck shell-escape failure mode (`$35M`, `$18M ARR`, `$1.2B TAM` appear on cover/ask/financials/milestones). Gate 2 cannot detect a stripped `$35M` — no residue. Gate 2b catches common strip patterns; single-quoting PREVENTS them.

## What "pitch deck" means here (identity)

A pitch deck is a pptx with a **fundraising layer** on top: VC-oriented narrative arc, verifiable metrics, stage-appropriate data density, founder-credibility surface. Slides are consumed at ~3 seconds per slide in a live room — the pptx v2 rule. Pitch decks add a second constraint on top: **every slide carries one investable proposition**. If a slide is "interesting background" that doesn't move the ask forward, cut it. VCs will not. The base pptx rules still apply; pitch decks add six deltas:

1. **Stage determines everything.** Series A / B / C each dictates slide count, narrative weight, which metrics are must-haves, and tolerance for unit-econ sophistication. A Series A deck with 6 pages of CAC/LTV math reads as over-packaged; a Series B deck missing unit econ reads as incomplete. Pick the stage first — everything downstream follows.
2. **Narrative arc beats feature dump.** 10 essential slides in a fixed order: cover → problem → solution → market → product → model → traction → team → financials → ask. Out of order = VCs disengage.
3. **Numbers are a contract.** TAM/SAM/SOM must be clean three-layer; CAC/LTV must have a payback line; ARR ≠ revenue; Use-of-Funds must be a four-bucket pie. Sloppy numbers = round dies.
4. **Team slide carries prior companies.** Avatar grid alone reads as a student project. Add prior-company logos / names + one-line role. Without this, first-time founders look exactly like first-time founders.
5. **Traction chart y-axis starts at 0.** A "hockey stick" starting at `y_min = 80% of current` is a visual lie — VCs who have seen 10,000 decks spot it in < 2 seconds.
6. **The ask is a slide, not a footnote.** `$XX M` hero + four-bucket Use-of-Funds + runway length. "We're raising some money" is not an ask.

### Reverse handoff — when to go BACK to pptx base

Stay in **pptx v2 base** for board reviews, all-hands, sales decks, product launches, training decks — anything not tied to raising capital. Use **this skill** only when: (a) the user mentions a specific round (seed / Series A / B / C) or a VC meeting, AND (b) the deck needs at least 4 of {problem, traction, team with credentials, Use-of-Funds, stage-appropriate unit econ, financial projections}.

If the user says "fundraising deck" but the context is a corporate BU quarterly ask, that is a board review. Route to pptx v2 Recipe (d) 10-slide blueprint. If the user says "board review" but the context is a small company raising a bridge round, route here.

## Series A / B / C stage diagnosis (decision tool)

**Read this before writing a single command.** Pick the row that matches the user's description — everything downstream (slide count, which metrics, which recipes, what the team slide must show) derives from this one call.

| Stage             | Revenue band                 | Team         | Slide count | Dominant narrative (weight)                                                                               | Must-have data                                                                               | Common red flag                                                                       |
| ----------------- | ---------------------------- | ------------ | ----------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Seed**          | $0 – $1M ARR (often pre-rev) | 2 – 8 FTE    | 10 – 12     | Problem (30%) + Solution (25%) + Team (15%) + Market (15%) + Traction (15%)                               | Founder-market fit story; 1 – 2 design-partner / pilot logos; top-down TAM ok                | Over-claiming traction (10 customers = "market proven")                               |
| **Series A**      | $1 – $5M ARR                 | 10 – 25 FTE  | 12 – 16     | Problem (20%) + Solution (20%) + **Market "why now"** (15%) + Product (15%) + Traction (20%) + Team (10%) | PMF proof (NRR > 110%, low churn), bottom-up TAM/SAM, pipeline / pilots converted            | Bottom-up TAM feels fabricated; CAC not yet meaningful but shown anyway               |
| **Series B**      | $5 – $30M ARR                | 30 – 100 FTE | 18 – 22     | **Traction + Unit econ (30%)** + Market + Product + Team + Financials (ask)                               | ARR curve starting at 0; NRR, CAC, LTV, payback (< 18 mo ideal); cohort retention; logo wall | No unit-econ slide; CAC payback > 24mo without explanation; Use-of-Funds missing %    |
| **Series C**      | $30M+ ARR                    | 100+ FTE     | 20 – 24     | **Financials + Scale + Moat (40%)** + Market expansion + Team depth                                       | Multi-year GAAP, rule-of-40, GM trajectory, international expansion plan, defensibility      | No moat slide; revenue growth without margin story; team slide has no prior CEO / CFO |
| **Bridge / SAFE** | any                          | any          | 8 – 10      | **Specific bridge reason** + runway math + commitments                                                    | Prior round context; specific milestone the bridge funds; committed investor amount          | Treating a bridge like a Series A — too many slides dilutes the ask                   |

**Decision procedure.** From one or two user sentences ("Series B, $18M ARR, 120 customers, $35M raise"), pick exactly one stage row. All later choices in this skill reference your stage: which 赛道 template to pull, which recipes are mandatory vs optional, and which Delivery Gate 6 checks fire.

**Corner cases.** Bridge rounds & convertibles between A → B are closer to A or B depending on whether the bridge milestone is "finish PMF" (A shape) or "hit unit-econ target" (B shape). "Extension" rounds at the same stage reuse the earlier stage's skeleton and add a one-slide "progress since last round" update.

**Non-SaaS stage overrides.** The ARR / unit-econ shape of Series B fits SaaS. For other verticals, substitute revenue band + unit-econ equivalent + Gate 6.3 grep:

| Vertical                  | Revenue "band" at Series B     | "Unit econ" equivalent                                         | Gate 6.3 substitute                                                                                |
| ------------------------- | ------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Bio / Clinical-stage**  | pre-rev, 20–60 FTE             | burn rate + runway to next milestone (IND / Ph1 readout / BLA) | `shape:contains("ORR")` OR `contains("Pipeline")` OR `contains("BLA")` OR `contains("runway")` ≥ 1 |
| **Deep Tech / Frontier**  | pre-rev or early pilot rev     | technical milestones + TRL level + benchmark vs SoTA           | `shape:contains("TRL")` OR `contains("benchmark")` ≥ 1                                             |
| **Marketplace / Network** | GMV $10–100M                   | take rate + cohort retention + liquidity                       | `shape:contains("GMV")` + `contains("take rate")` ≥ 1                                              |
| **Consumer hardware**     | $2–15M revenue (shipped units) | contribution margin + repeat rate + blended CAC                | `shape:contains("repeat")` OR `contains("contribution")` ≥ 1                                       |

Substitute the analogue grep when running Gate 6.3 on these verticals. False WARN on SaaS CAC/LTV = expected; real concern = vertical-specific analogue present. Bio Series B decks especially: burn + runway-to-milestone IS the "unit econ" story.

## 赛道 arc templates (5 families)

5 mainstream verticals. Each one has different slide weights because what VCs require as proof-of-concept differs. Pick the vertical row; the slide skeleton is a copy-able starting point. Slide counts assume the matching stage row above.

### (1) B2B SaaS / Enterprise software

Canonical arc — the template most of VC muscle memory is built on. Series B example (20 slides): cover · TL;DR · problem · problem evidence · solution · product loop · market TAM/SAM/SOM · **unit economics (CAC / LTV / payback / GM)** · ARR trajectory · retention cohort · logo wall · team · competitors · financials 4-year · ask. Must-have: unit-econ slide from Series A onward; logo wall from Series B onward.

### (2) Consumer (B2C app / consumer hardware / D2C)

Narrative-driven. Early-stage decks lean on **product-experience screenshots + founding story + "why now"** market timing; lighter on unit econ (which are usually weaker than SaaS). Series A example (14 slides): cover · hook (30-second product demo or 1-line vision) · problem (lived experience) · solution (product shots) · product-experience flow · "why now" market window · pre-order / crowdfunding / early-sales evidence · retention / engagement (DAU, D30) · market (top-down ok if bottom-up unreliable) · competitive positioning · founder story + team · press / endorsements · financials · ask. Must-have: product visuals on ≥ 3 slides; "why now" slide (window justification); engagement metric not just revenue.

### (3) Deep Tech / Frontier tech (AI foundation models, quantum, climate hardware, robotics)

Technology credibility is the sell. Pre-revenue deep tech replaces "traction" with **technical milestones + defensibility**. Series B example (22 slides): cover · thesis (one-line "what changes if this works") · problem (current state of art) · solution (technical approach) · **technology architecture** · benchmarks vs SoTA · pipeline / TRL levels · market (long-tail) · business model · early commercial traction (pilots, LOIs) · IP / patents · team (usually PhD / ex-FAANG-research) · partners · financials · ask. Must-have: benchmark slide; IP slide; team slide dense with PhDs / prior-lab names.

### (4) Marketplace / Network business (two-sided platform, social, commerce)

Liquidity is the metric. Replace "unit econ" with **GMV + take rate + cohort retention + supply / demand balance**. Series A example (15 slides): cover · problem (friction in current supply-demand) · solution · product demo (both sides) · network effects diagram · early liquidity (first-week GMV, time-to-match) · cohort retention · geographic / category expansion plan · competitive positioning vs incumbents · take-rate model · team · financials · ask. Must-have: liquidity metric slide; cohort retention chart; network-effect diagram.

### (5) Bio / Life sciences / Healthtech

Regulatory pipeline IS the business. Replace "product roadmap" with **clinical pipeline + regulatory path + scientific evidence**. Series B example (22 slides): cover · unmet medical need · scientific rationale (mechanism of action) · preclinical / clinical data (ORR, safety, endpoints) · **pipeline chart** (candidates × stages × dates) · differentiation vs standard of care · IP / exclusivity · regulatory strategy (IND, BTD, fast-track) · market (prevalence × pricing) · commercial strategy (orphan / specialty / biosimilar) · partnerships / collaborations · team (CSO / CMO with prior FDA wins) · financials (burn to next milestone) · ask. Must-have: pipeline chart; clinical data slide; team slide with prior regulatory wins.

**Cross-vertical rule.** You can mix elements across templates, but never drop a must-have from your primary vertical. A SaaS deck missing unit econ, a bio deck missing a pipeline chart, a marketplace deck missing a liquidity metric — each is an instant VC disqualification.

## Slide Patterns (layout canon)

Patterns are **layout geometry**; recipes below are **narrative intent**. A slide picks one pattern for its visual shape (6 canonical ones below) and one recipe for what it argues (cover / problem / traction / ...). Multiple recipes can share one pattern — Problem / Why-Now / Traction-callout all lean on the 3-stat row (C.2). Pick the pattern first, then fill it with recipe content.

**Speaker notes rule.** Every content slide (non-cover, non-closing) MUST carry speaker notes via `officecli add "$FILE" /slide[N] --type notes --prop text='…'`. Missing notes = not shippable — inherits pptx v2 §Hard rules (H7). Run `officecli help pptx notes` to confirm prop names before building.

**Pattern reuse discipline.** Never run the same pattern on two consecutive slides — even with different data, two identical geometries in a row read as a template loop. Alternate C.2 with C.4 or C.5b to break rhythm.

**Vertical centering.** When a slide carries fewer elements than the pattern's maximum, nudge y-positions down 2–3cm to center the visual weight. Tables below assume full content.

### C.1 Title / Cover (dark gradient)

3–4 text shapes on a gradient fill. Slide 1 in every deck.

```
+----------------------------------+
|                                  |
|          TITLE (centered)        |
|          tagline                 |
|                                  |
|   round · amount · date          |
|  ________________________        |  <- thin brand band
+----------------------------------+
```

| Element                 | X   | Y    | Width   | Height | Font / size                     |
| ----------------------- | --- | ---- | ------- | ------ | ------------------------------- |
| Title                   | 2cm | 5cm  | 29.87cm | 4cm    | serif bold, ≥ 36pt (44 typical) |
| Tagline                 | 2cm | 10cm | 29.87cm | 2cm    | sans 18–22pt                    |
| Meta (round · $ · date) | 2cm | 13cm | 29.87cm | 1.5cm  | sans 12–16pt                    |

**Use this when** the slide is the first one (Cover recipe 1) — 3-second identity grab. Background is a 180° linear gradient between two dark palette shades (e.g. Professional Navy `1E2761 → 0D1F35`). If the title wraps to 2 lines, **add height (4cm → 5cm), never drop font below 36pt** — sub-36pt on a pitch cover reads as timid regardless of content. Transition: fade.

### C.2 3-Stat callout row

Title + 3 big-number / label pairs across. The default for Problem / Why-Now / Traction-callout slides.

```
+----------------------------------+
|  Title                           |
|                                  |
|   73%      12hr      $4.2B       |
|   label    label     label       |
|   source   source    source      |
+----------------------------------+
```

| Element               | X      | Y      | Width   | Height | Font / size            |
| --------------------- | ------ | ------ | ------- | ------ | ---------------------- |
| Title                 | 1.5cm  | 1cm    | 30.87cm | 3cm    | serif bold ≥ 36pt      |
| Stat 1 number         | 2cm    | 5cm    | 9cm     | 4cm    | serif bold 60–64pt     |
| Stat 1 label          | 2cm    | 9.5cm  | 9cm     | 2cm    | sans ≥ 16pt (H4 floor) |
| Stat 2 number / label | 12.5cm | (same) | 9cm     | (same) | (same)                 |
| Stat 3 number / label | 23cm   | (same) | 9cm     | (same) | (same)                 |

**Use this when** you have 2–3 anchoring numbers and the story is "three facts argue the point" — Problem, Why-Now, Market-callout, single-row Traction. Labels ≥ 16pt is the H4 floor (sub-label exception); a number without a label reads as bravado, so never drop labels to 12–14pt to fit more text.

### C.3 4-Stat callout row

Same geometry as C.2 but 4 columns. Numbers 60pt, width 7cm each.

```
+-------------------------------------+
|  Title                              |
|                                     |
|  73%   12hr   $9M   4.2x            |
|  lbl   lbl    lbl   lbl             |
+-------------------------------------+
```

| Element      | X positions               | Y     | Width   | Height | Font / size     |
| ------------ | ------------------------- | ----- | ------- | ------ | --------------- |
| Title        | 1.5cm                     | 1cm   | 30.87cm | 3cm    | serif bold 36pt |
| Stat numbers | 1.5 / 9.5 / 17.5 / 25.5cm | 5cm   | 7cm     | 4cm    | serif bold 60pt |
| Stat labels  | (same X)                  | 9.5cm | 7cm     | 2cm    | sans ≥ 16pt     |

**Use this when** exactly 4 parallel metrics tell the story and 3 feels under-counted. Prefer C.2 if in doubt — 4 always feels tighter than 3, and wrap risk is real.

> **Wrap warning.** At 60pt in 7cm width, dollar patterns with both `$` and `.` fail: `$9.4M` is 5 glyphs but the wide `$` and `.` in a serif bold make it wrap to 2 lines and destroy the callout. Safe dollar shapes at 60pt/7cm: `$9M`, `$96B`, `$4K` (3–4 chars). Non-dollar shapes: `340%`, `4.2x`, `12.3` safe up to 5 chars. Values ≥ 6 chars (`197min`, `3 Days`) will wrap — either (a) drop font to 44–48pt, (b) abbreviate (`197m`, `$9M`), or (c) shift to C.2 (9cm per stat). Single tokens only, no internal spaces.

### C.4 Chart + Context (chart left, stats right)

Chart takes left 55%, 2–3 stacked callouts on the right. The default for Traction / Financials / Market-sizing-with-context.

```
+-------------------------------------+
|  Title                              |
|                                     |
|  +---------------+   +--------+     |
|  |               |   | Stat 1 |     |
|  |    chart      |   +--------+     |
|  |               |   | Stat 2 |     |
|  +---------------+   +--------+     |
+-------------------------------------+
```

| Element      | X    | Y    | Width   | Height                                       |
| ------------ | ---- | ---- | ------- | -------------------------------------------- |
| Title        | 2cm  | 1cm  | 29.87cm | 3cm                                          |
| Chart        | 2cm  | 4cm  | 17cm    | 13cm                                         |
| Stats column | 21cm | 4cm+ | 11cm    | 2.5cm number + 1.5cm label (~3.7cm per pair) |

Sub-labels ≥ 16pt (H4 floor). For 5 stats stacked, drop number size to 44pt; 6+ stats means pick a different pattern. Post-batch for column/bar charts: `officecli set "$FILE" "/slide[N]/chart[1]" --prop gap=80` to tighten bar spacing.

**Use this when** one primary chart drives the story and 2–3 numeric anchors reinforce it — Traction (ARR curve + current ARR + YoY + NRR), Financials (4-year column chart + assumption callouts), Market (bar chart + SOM / CAGR / methodology).

### C.5 Icon-in-circle grid (3-row vertical)

3 vertical rows, each = circle icon on the left + title + 1-line description.

```
+---------------------------------------+
|  Title                                |
|                                       |
|  (o)  Label one                       |
|       description one                 |
|                                       |
|  (o)  Label two                       |
|       description two                 |
|                                       |
|  (o)  Label three                     |
|       description three               |
+---------------------------------------+
```

| Element     | X     | Y positions        | Width | Height | Font / size                   |
| ----------- | ----- | ------------------ | ----- | ------ | ----------------------------- |
| Icon circle | 2cm   | 4.5 / 8.5 / 12.5cm | 2.5cm | 2.5cm  | ellipse, accent fill          |
| Label       | 5.5cm | (icon Y + 0)       | 25cm  | 1.2cm  | sans bold 18pt                |
| Description | 5.5cm | (icon Y + 1.3cm)   | 25cm  | 1.8cm  | sans ≥ 16pt (H4 floor), muted |

**Use this when** you have 3 short vertical points that benefit from a visual anchor per row — Solution mechanism, Value pillars, Product loop. Choose C.5b (2×2 grid) when items are parallel and you have exactly 4; choose a horizontal 5-across variant when icons should read side-by-side (e.g. 5-step process).

### C.5b 2×2 Feature grid (4 parallel items)

4 rounded cards, 2 columns × 2 rows. Use when you have exactly 4 parallel items (product pillars, service types, feature quadrants).

```
+-----------------------------+
|  Title                      |
|                             |
|  +---------+  +---------+   |
|  | (o) T1  |  | (o) T2  |   |
|  | body    |  | body    |   |
|  +---------+  +---------+   |
|  +---------+  +---------+   |
|  | (o) T3  |  | (o) T4  |   |
|  | body    |  | body    |   |
|  +---------+  +---------+   |
+-----------------------------+
```

| Element                  | X              | Y              | Width   | Height | Font / size            |
| ------------------------ | -------------- | -------------- | ------- | ------ | ---------------------- |
| Slide title              | 2cm            | 1cm            | 29.87cm | 2.5cm  | serif bold 32pt        |
| Card 1 bg (top-left)     | 1.5cm          | 4cm            | 14.5cm  | 7cm    | roundRect              |
| Card 2 bg (top-right)    | 17.5cm         | 4cm            | 14.5cm  | 7cm    | roundRect              |
| Card 3 bg (bottom-left)  | 1.5cm          | 12cm           | 14.5cm  | 7cm    | roundRect              |
| Card 4 bg (bottom-right) | 17.5cm         | 12cm           | 14.5cm  | 7cm    | roundRect              |
| Icon ellipse (each card) | card_x + 0.5cm | card_y + 0.5cm | 2cm     | 2cm    | —                      |
| Card title (each)        | card_x + 3.2cm | card_y + 0.6cm | 10.5cm  | 1.8cm  | sans bold 16pt         |
| Card body (each)         | card_x + 0.5cm | card_y + 3cm   | 13cm    | 3.5cm  | sans ≥ 16pt (H4 floor) |

**Use this when** you have exactly 4 parallel items and the eye should land on each equally — 4 product pillars, 4 service tiers, 4 stakeholder types. 3 items feel lonely in a 2×2; 5+ items break the grid — go to a 3×2 (see pptx v2 §(d) grid math) or C.5 row pattern.

> **Z-order canon (critical).** Each card's `roundRect` background must be added immediately before that card's icon / title / body shapes in the batch JSON — pptx paints in insertion order, so a background added after its text paints over and hides the text. When building with `officecli batch`, follow the per-card sequence `bg → ellipse → title → body` strictly. Pattern and z-order details → see pptx v2 §Recipe (c) z-order canon; reuse grid math from pptx v2 §(d) for non-2×2 counts.

**Dark-background variant.** Change card fill from `F0F4F8` (light) to a lighter-dark shade like `1A2540` and bump body text to `FFFFFF` / `E8E8E8`. Palette variables (e.g. `$MUTED`) do NOT expand inside single-quoted heredocs — write the literal hex (`64748B`) in the JSON.

---

## Key-slide recipes (10 essentials)

The 10 slides every pitch deck carries. Each recipe below gives: **visual outcome** (what the slide looks like from 3m away) + **runnable block** (≤ 18 lines) + **QA one-liner**. All recipes inherit pptx v2 palettes, grid math, type hierarchy, and `--prop tailEnd=triangle` on every connector. Recipes reference the Slide Patterns above: Cover reuses C.1; Problem / Why-Now reuse C.2; Traction / Financials reuse C.4; Feature / pillar slides reuse C.5b. `$FILE` is your deck file.

**Long-title wrap rule.** A 36pt+ title that wraps to 2 lines: add `height` (e.g. 2cm → 3.5cm) — never drop the font below 36pt. Titles < 36pt on a pitch deck read as timid regardless of content.

### (1) Cover slide — company · tagline · round · date

**Visual outcome.** Dark navy fill, centered 44pt company name, 20pt one-line tagline underneath, small 16pt meta line at the bottom with round + amount + date. Thin brand band at the very bottom (0.5cm high) in the accent color.

```bash
officecli add "$FILE" / --type slide --prop layout=blank --prop background=1E2761
officecli add "$FILE" "/slide[1]" --type shape --prop name=BrandBand \
  --prop geometry=rect --prop fill=CADCFC \
  --prop x=0cm --prop y=18.5cm --prop width=33.87cm --prop height=0.55cm
officecli add "$FILE" "/slide[1]" --type shape --prop name=CoverTitle --prop text="Acme DevOps" \
  --prop x=2cm --prop y=7cm --prop width=29.87cm --prop height=3cm \
  --prop font=Georgia --prop size=44 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none
officecli add "$FILE" "/slide[1]" --type shape --prop name=Tagline --prop text="Kubernetes observability, built for production at scale" \
  --prop x=2cm --prop y=10.5cm --prop width=29.87cm --prop height=1.5cm \
  --prop font=Calibri --prop size=20 --prop color=CADCFC --prop align=center --prop fill=none
officecli add "$FILE" "/slide[1]" --type shape --prop name=CoverMeta --prop text='Series B · $35M · April 2026' \
  --prop x=2cm --prop y=15cm --prop width=29.87cm --prop height=1.2cm \
  --prop font=Calibri --prop size=16 --prop color=FFFFFF --prop align=center --prop fill=none
```

**QA.** Cover has 4 discrete elements (brand band + title + tagline + meta). 80%-whitespace covers fail the pptx "cover ≥ 60% filled" floor.

**Consumer variant (3-second grab).** Consumer decks (B2C app / hardware / D2C) should add a single dominant motif — hero product shot, oversized company name (60–96pt), or symbolic mark (crescent moon / abstract geometric). Replace the 44pt title with an 80–96pt name + one motif shape (`--type shape --prop geometry=ellipse --prop fill=<accent>` for an abstract mark, or `picture` at ~40% of slide for a product hero). Keep tagline + round + date identical. SaaS / B2B may skip — the typographic-only cover is sufficient.

### (2) Problem slide — industry pain in 1 sentence + 3 data cards

**Visual outcome.** 36pt title stating the pain (not "The Problem"). Below, three equal-width data cards across the slide: each a giant number (40pt) + one-line qualifier (16pt) + source footnote (12pt gray).

Grid math for 3 cards, 1.5cm margins, 0.76cm gap: `usable = 33.87 − 3 − 2·0.76 = 29.35`, `col_width = 29.35 / 3 = 9.78cm`. x-positions: `1.5 / 12.04 / 22.58`.

```bash
SLIDE=2  # second slide, after cover. Adjust from your build order.
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Kubernetes debugging burns 12 engineering hours / incident" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2.5cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
cat <<EOF | officecli batch "$FILE"
[
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"name":"PC1","geometry":"roundRect","fill":"F5F7FA","x":"1.5cm","y":"5cm","width":"9.78cm","height":"10cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"73%","x":"1.5cm","y":"6cm","width":"9.78cm","height":"3cm","font":"Georgia","size":"60","bold":"true","color":"1E2761","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"of incidents take > 1 hour to diagnose","x":"1.5cm","y":"9.5cm","width":"9.78cm","height":"3cm","font":"Calibri","size":"18","color":"333333","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Source: 2025 DORA Report","x":"1.5cm","y":"13cm","width":"9.78cm","height":"1cm","font":"Calibri","size":"12","italic":"true","color":"666666","align":"center","fill":"none"}}
]
EOF
# Repeat the 4-block pattern at x=12.04cm and x=22.58cm for cards 2 and 3.
```

**QA.** `officecli query "$FILE" 'shape:contains("Source")'` returns ≥ 3 (every claim carries a source). If zero sources, VCs will not trust a single number.

### (2b) Why Now slide — Consumer / Seed / early A must-have

**Visual outcome.** 3 cards across: each = **trigger headline** (24pt bold) + **data point** (60pt number or date) + **one-line implication** (16pt) + **source footnote** (12pt gray). Reuse Problem grid math (`col=9.78cm`, x = `1.5 / 12.04 / 22.58`). §赛道 Consumer row 2 must-have; Seed / early A in any vertical benefits when "market window" IS the thesis.

```bash
SLIDE=3
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Why now: three converging triggers" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2.5cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
# Card 1 (x=1.5cm) — trigger / data / implication / source. Repeat at x=12.04cm and x=22.58cm.
cat <<EOF | officecli batch "$FILE"
[
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"geometry":"roundRect","fill":"F5F7FA","x":"1.5cm","y":"5cm","width":"9.78cm","height":"10cm"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"BOM cost","x":"1.5cm","y":"5.5cm","width":"9.78cm","height":"1.2cm","font":"Calibri","size":"24","bold":"true","color":"1E2761","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"−90%","x":"1.5cm","y":"7cm","width":"9.78cm","height":"3cm","font":"Georgia","size":"60","bold":"true","color":"B85042","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Wearable BOM fell 90% since 2021; sub-$40 retail now viable","x":"1.5cm","y":"11cm","width":"9.78cm","height":"2cm","font":"Calibri","size":"16","color":"333333","align":"center","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Source: IDC Wearables Teardown 2025","x":"1.5cm","y":"13.5cm","width":"9.78cm","height":"1cm","font":"Calibri","size":"12","italic":"true","color":"666666","align":"center","fill":"none"}}
]
EOF
# Card 2 pattern: Oura IPO 2024 / +$2.4B valuation / category proven. Card 3: On-device LLM (Llama 3.2) / Q4-24 / privacy moat viable.
```

**QA.** 3 cards, each with a date/year citation in the source footnote, each card ≤ 30 words. `officecli query "$FILE" 'shape:contains("2024")'` + `'shape:contains("2025")'` ≥ 2 combined (timing anchors visible).

### (3) Solution slide — product in one sentence + 3-step "how it works"

**Visual outcome.** 36pt title naming the product pattern (not "Our Solution"). Below: 3 or 4 rounded boxes horizontally at y=7cm with elbow connectors + triangle arrowheads. Each box = one verb (observe / correlate / resolve). Reuse pptx Recipe (c) flowchart — orchestration, not a new primitive.

```bash
# Title — "a product pattern, not a brand slogan".
# Good: "Auto-correlate K8s events across 3 data planes in 90 seconds"
# Bad:  "The future of observability"
SLIDE=4
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop name=SolTitle \
  --prop text="Correlate K8s events across 3 data planes in 90 seconds" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2.2cm \
  --prop font=Georgia --prop size=32 --prop bold=true --prop color=1E2761 --prop fill=none
# 3 boxes across: gap = (33.87 − 3 − 3·7) / 2 = 4.93cm; x = 1.5, 13.43, 25.36
# Connectors + arrowheads: --prop tailEnd=triangle ALWAYS (pptx Known Issues C-P-5..6).
# Full batch block → see pptx v2 §Creating and Editing (c) 4-step flowchart; swap N from 4 boxes to 3.
```

**Product-pattern title rule.** The solution title is a verb + differentiated mechanism + metric. "Observe / Correlate / Resolve" is generic; VCs read it as any APM vendor. "Correlate K8s events across 3 data planes in 90 seconds" is specific; VCs read it as an insight.

**QA.** Count connectors: `officecli query "$FILE" 'connector' --json | jq '.data.results | length'` ≥ (step_count − 1). Every connector must have `tailEnd=triangle` — `view annotated` confirms arrowhead direction. Title must be ≤ 12 words (one breath).

### (4) Market slide — TAM / SAM / SOM nested columns

**Visual outcome.** 36pt title "Market: $X.YB growing Z% CAGR". Below: three horizontal bars (or three stacked nested rectangles), labeled TAM / SAM / SOM with dollar values + growth rate. Bottom footnote cites **top-down vs bottom-up source** — pick one methodology per deck, don't mix.

```bash
# Use a pptx column chart with 3 values. Categories = TAM,SAM,SOM. Source annotation is a separate shape.
SLIDE=5
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="$42B observability market, 18% CAGR" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
officecli add "$FILE" "/slide[$SLIDE]" --type chart --prop chartType=bar \
  --prop series1.name="USD (billions)" --prop series1.values="42,8.4,0.62" --prop series1.color=1E2761 \
  --prop categories="TAM,SAM,SOM (5-yr)" \
  --prop x=2cm --prop y=4cm --prop width=22cm --prop height=12cm \
  --prop title='Market sizing — bottom-up by enterprise count × ACV'
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text='Source: Gartner 2025 APM Magic Quadrant; SAM = 20% of TAM (K8s-first shops); SOM = 7.4% of SAM over 5 years at 18-24% share.' \
  --prop x=2cm --prop y=16.5cm --prop width=29.87cm --prop height=2cm \
  --prop font=Calibri --prop size=12 --prop italic=true --prop color=666666 --prop fill=none
```

**QA.** Top-down vs bottom-up MUST be declared in the source footnote. A TAM without methodology reads as fabricated.

### (5) Product slide — screenshot + 3 bullets OR 3-card feature grid

**Visual outcome.** Two layout options: (a) hero product screenshot on the left (60% of slide), 3 one-line feature bullets on the right (each ≥ 18pt body, no bullets under bullets). (b) 3 feature cards with one icon / screenshot thumbnail each. Pick (a) for consumer / app products, (b) for B2B / infrastructure.

```bash
# (a) screenshot + bullets — consumer pattern
officecli add "$FILE" "/slide[$SLIDE]" --type picture --prop src=product_hero.png \
  --prop x=1cm --prop y=4cm --prop width=18cm --prop height=13cm
officecli set "$FILE" "/slide[$SLIDE]/picture[1]" --prop alt="Product UI: dashboard with 12 K8s clusters, live correlation graph"
# Right column bullets (each as a separate shape so sizes stay explicit)
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Auto-correlate across 3 data planes" \
  --prop x=20cm --prop y=5cm --prop width=12cm --prop height=1.5cm \
  --prop font=Calibri --prop size=20 --prop bold=true --prop color=1E2761 --prop fill=none
# Repeat for bullets 2 and 3 at y=7.5cm / y=10cm.
```

**QA.** Picture alt text present (`query 'picture:no-alt'` = empty). Bullets each ≥ 18pt. No "Lorem"/"product name here"/`{{...}}` tokens.

### (6) Business model slide — unit econ or revenue model

**Visual outcome.** Decision tree by vertical:

- **SaaS / Enterprise (Series A+)** — 4 KPI callouts: CAC / LTV / Payback / GM (reuse pptx Recipe (e)).
- **Consumer / D2C** — AOV · repeat-purchase rate · contribution margin · blended CAC.
- **Marketplace** — GMV / take-rate / liquidity metric / cohort retention.
- **Bio / Deep tech** — revenue model (license / milestone / royalty split) with assumed ranges.

Title names the dominant metric (e.g. "LTV:CAC 4.7x · 14-month payback · 78% gross margin"), not "Business Model". Full 4-card batch block → see pptx v2 §(e) KPI callouts.

```bash
# SaaS pattern: KPI card values + sub-label + gray VC-floor context under each.
# Card 1 (LTV): big number "$420K", sub "Lifetime value", context "floor: ARPU × GM / churn"
# Card 2 (CAC): big number "$90K",  sub "Acquisition cost", context "fully-loaded S&M spend"
# Card 3 (Payback): big number "14 mo", sub "CAC payback", context "VC floor: < 18 mo"
# Card 4 (GM): big number "78%", sub "Gross margin", context "SaaS floor: 70%+"
# Grid math for 4 cards across: usable = 33.87 − 3 − 3·0.76 = 28.59, col = 7.15cm
# → Full batch template → pptx v2 §(e). Adapt card count 3→4 and card width 9.78cm→7.15cm.
```

**QA.** For Series B+, all four of {CAC, LTV, payback, GM} present: `officecli query "$FILE" 'shape:contains("CAC")'` ≥ 1 AND `shape:contains("LTV")'` ≥ 1 AND `shape:contains("payback")'` ≥ 1 AND `shape:contains("gross margin")'` ≥ 1.

### (7) Traction slide — ARR curve that starts at 0

**Visual outcome.** Line chart taking 60% of slide width; ARR on y-axis **starting at 0** (not at 80% of current value — the VC hockey-stick lie). Right-side commentary card: single giant number (current ARR) + growth rate + 2-3 milestones. If Series B+, second row: cohort retention snippet or logo wall.

```bash
SLIDE=7
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text='ARR: $0 → $18M in 24 months' \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
officecli add "$FILE" "/slide[$SLIDE]" --type chart --prop chartType=line \
  --prop series1.name=ARR --prop series1.values="0.2,0.6,1.4,3.2,6.1,11.3,15.8,18.0" --prop series1.color=1E2761 \
  --prop categories="Q1-24,Q2-24,Q3-24,Q4-24,Q1-25,Q2-25,Q3-25,Q4-25" \
  --prop x=1.5cm --prop y=4cm --prop width=21cm --prop height=13cm \
  --prop title='Quarterly ARR ($M) — y-axis anchored at 0' \
  --prop axismin=0
# Right callout
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop geometry=roundRect --prop fill=1E2761 --prop line=none \
  --prop x=23.5cm --prop y=4cm --prop width=8.8cm --prop height=13cm
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text='$18M' \
  --prop x=23.5cm --prop y=5cm --prop width=8.8cm --prop height=3cm \
  --prop font=Georgia --prop size=64 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="ARR · +312% YoY · NRR 128%" \
  --prop x=23.5cm --prop y=9cm --prop width=8.8cm --prop height=3cm \
  --prop font=Calibri --prop size=18 --prop color=CADCFC --prop align=center --prop fill=none
```

**`--prop axismin=0` is load-bearing** — without it, pptx auto-scales the y-axis to start near the lowest value. That is the hockey-stick lie. Gate 6 greps this below.

**QA.** ARR curve chart must carry `axismin=0`. `officecli get "$FILE" "/slide[$SLIDE]/chart[1]" --json | jq .format.axisMin` returns `0` (CLI emits camelCase `axisMin` in readback even though input prop is lowercase `axismin`).

### (8) Team slide — avatars + names + prior companies (not just a wall)

**Visual outcome.** 3- or 4-card row across the middle of the slide. Each card: picture (6×6cm) on top; name (20pt bold); role (16pt); **prior company + title** (16pt italic, 1 key line); optional LinkedIn URL footer (12pt). Team slide with just headshots and names reads as amateur.

```bash
SLIDE=11
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Team: 3 prior exits, 42 years combined K8s" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
# Card 1 — CEO
officecli add "$FILE" "/slide[$SLIDE]" --type picture --prop src=alice.jpg \
  --prop x=2cm --prop y=5cm --prop width=6cm --prop height=6cm
officecli set "$FILE" "/slide[$SLIDE]/picture[1]" --prop alt="Alice Chen, CEO — portrait"
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Alice Chen" \
  --prop x=2cm --prop y=11.5cm --prop width=6cm --prop height=1cm \
  --prop font=Georgia --prop size=20 --prop bold=true --prop color=1E2761 --prop align=center --prop fill=none
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="CEO" \
  --prop x=2cm --prop y=12.8cm --prop width=6cm --prop height=0.8cm \
  --prop font=Calibri --prop size=16 --prop color=333333 --prop align=center --prop fill=none
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="ex-Datadog Director (Series C → IPO); led K8s observability GTM $40M → $200M ARR" \
  --prop x=2cm --prop y=13.8cm --prop width=6cm --prop height=2.5cm \
  --prop font=Calibri --prop size=14 --prop italic=true --prop color=333333 --prop align=center --prop fill=none
# Repeat for Card 2 (CTO, x=10cm) and Card 3 (VP Eng, x=18cm) — 3 cards × 5-6 shapes each.
```

Prior companies carry **credibility density**. VCs read "ex-Datadog Director + led $40M → $200M" in 2 seconds; they read "co-founder, passionate" in 0 seconds (because they skip it). Advisors, if shown, go in a smaller row below with a single logo each.

**Arrangement helper.** 3 cards: `col=9.78cm, x=1.5/12.04/22.58`. 4 cards: `col=7.15cm, x=1.5/9.41/17.32/25.23`. 5 cards: `col=5.85cm, x=1.5/7.75/14.0/20.25/26.5` (0.4cm gap, tighter). 6+ or asymmetric → 2-row grid (3×2 / 3×3); see pptx v2 §(d) grid math.

**QA.** `officecli query "$FILE" 'shape:contains("ex-")'` + `'shape:contains("prior")'` + `'shape:contains("former")'` ≥ 1 per team member. If zero, you have a portfolio, not a team.

### (9) Financials slide — 4-year plan + honest assumptions

**Visual outcome.** Column chart: 4 years × (revenue, gross margin $, EBITDA). Right-side card: 3-bullet assumption panel (ARPU assumption, win-rate assumption, churn assumption). Title names the trajectory ("$18M → $85M by FY29"), not "Financial Projections".

Reuse pptx Recipe (b) chart + commentary. Pitch-specific: ASSUMPTIONS column on the right is **load-bearing** — a 4-year plan without visible assumptions reads as aspirational. VCs will ask what's behind every number anyway; surface it.

Left 2/3 — slide + title + 3-series column chart:

```bash
SLIDE=17
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text='$18M → $85M ARR by FY29' \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
officecli add "$FILE" "/slide[$SLIDE]" --type chart --prop chartType=column \
  --prop series1.name="Revenue ($M)"  --prop series1.values="18,34,58,85" --prop series1.color=1E2761 \
  --prop series2.name="Gross Margin ($M)" --prop series2.values="14,26,45,68" --prop series2.color=CADCFC \
  --prop series3.name="EBITDA ($M)"   --prop series3.values="-6,-2,8,22" --prop series3.color=B85042 \
  --prop categories="FY26,FY27,FY28,FY29" \
  --prop x=1.5cm --prop y=4cm --prop width=20cm --prop height=13cm \
  --prop title='4-year plan — revenue, GM, EBITDA ($M)'
```

Right 1/3 — assumptions commentary card:

```bash
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop geometry=roundRect --prop fill=F5F7FA --prop line=none \
  --prop x=22.5cm --prop y=4cm --prop width=9.8cm --prop height=13cm
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Key Assumptions" \
  --prop x=23cm --prop y=4.5cm --prop width=8.8cm --prop height=1.2cm \
  --prop font=Georgia --prop size=20 --prop bold=true --prop color=1E2761 --prop fill=none
# 5 assumption bullets as 5 separate paragraph shapes at y=6, 7.5, 9, 10.5, 12cm — size=14, italic=true.
# Keep each bullet ≤ 14 words so 8.8cm width fits without wrap.
```

**Assumptions panel is load-bearing.** A 4-year plan without visible assumptions reads as aspirational. VCs ask what's behind every number anyway — surface the three or four assumptions that drive the curve.

**QA.** `officecli query "$FILE" 'shape:contains("assumption")'` OR `'shape:contains("Assumes")'` ≥ 1. If zero, add the panel.

### (10) The Ask — hero number + 4-bucket Use-of-Funds + runway

**Visual outcome.** Dark fill (match cover). Hero number in the center top: `$35M` at 96pt white. Below, a 4-bucket pie OR a 4-card row listing **Engineering 40% / GTM 35% / G&A 15% / Reserve 10%**. Bottom line: "18-month runway to $40M ARR" (next milestone, not "until next round").

```bash
SLIDE=20
officecli add "$FILE" / --type slide --prop layout=blank --prop background=1E2761
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text='$35M Series B' \
  --prop x=2cm --prop y=2cm --prop width=29.87cm --prop height=4cm \
  --prop font=Georgia --prop size=88 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none
officecli add "$FILE" "/slide[$SLIDE]" --type chart --prop chartType=pie \
  --prop series1.name="Use of Funds" --prop series1.values="40,35,15,10" \
  --prop categories="Engineering,Go-to-Market,G&A,Reserve" \
  --prop colors="CADCFC,B85042,97BC62,FFFFFF" \
  --prop x=6cm --prop y=7cm --prop width=12cm --prop height=10cm \
  --prop title="Use of Funds — 4 buckets"
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text='18 months runway to $40M ARR and Series C' \
  --prop x=2cm --prop y=17cm --prop width=29.87cm --prop height=1.5cm \
  --prop font=Calibri --prop size=22 --prop color=CADCFC --prop align=center --prop fill=none
```

**4-bucket convention.** Engineering / GTM / G&A / Reserve is the canonical breakdown. Typical Series A ranges: Eng 40-50%, GTM 30-40%, G&A 10-15%, Reserve 5-10%. Series B shifts 5-10 points from Eng to GTM.

**QA.** `officecli query "$FILE" 'shape:contains("Use of Funds")'` ≥ 1. Pie chart present on ask slide. Runway + milestone on ask slide.

### (11) Pipeline chart — Bio / Deep Tech must-have

**Visual outcome.** Horizontal swimlane. Left column = candidate name; 4 stage columns to the right (Preclinical / Ph1 / Ph2 / Ph3 for bio — or TRL1-3 / TRL4-6 / TRL7-8 / TRL9 for deep tech). Each row's bar extends to its current stage; darker fill for later stages. NCT / trial-ID footer below. §赛道 row 5 Bio must-have; SaaS / Consumer skip.

Grid math: usable `= 30.87cm`, candidate col `= 7cm`, stage cols `= (30.87 − 7) / 4 = 5.97cm` each, row height `= 2.3cm`. Stage col x: `8.5 / 14.47 / 20.44 / 26.41`.

```bash
SLIDE=6
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Pipeline: 3 candidates across Ph1–Ph3" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
# 4 stage headers + candidate row 1 (HLX-201 at Ph2, bar width = 3·5.97 = 17.91cm) in one batch.
cat <<EOF | officecli batch "$FILE"
[
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Preclinical","x":"8.5cm","y":"4cm","width":"5.97cm","height":"1cm","font":"Calibri","size":"16","bold":"true","color":"333333","align":"center","fill":"F5F7FA"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Phase 1","x":"14.47cm","y":"4cm","width":"5.97cm","height":"1cm","font":"Calibri","size":"16","bold":"true","color":"333333","align":"center","fill":"F5F7FA"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Phase 2","x":"20.44cm","y":"4cm","width":"5.97cm","height":"1cm","font":"Calibri","size":"16","bold":"true","color":"333333","align":"center","fill":"F5F7FA"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"Phase 3","x":"26.41cm","y":"4cm","width":"5.97cm","height":"1cm","font":"Calibri","size":"16","bold":"true","color":"333333","align":"center","fill":"F5F7FA"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"text":"HLX-201 (lead)","x":"1.5cm","y":"5.5cm","width":"7cm","height":"1.5cm","font":"Calibri","size":"18","bold":"true","color":"1E2761","align":"left","fill":"none"}},
  {"command":"add","parent":"/slide[$SLIDE]","type":"shape","props":{"geometry":"roundRect","fill":"1E2761","x":"8.5cm","y":"5.7cm","width":"17.91cm","height":"1.1cm","line":"none"}}
]
EOF
# Repeat rows 2 & 3 at y=7.8cm / y=10.1cm with bar widths per stage (Ph1=5.97cm, Ph1-Ph2=11.94cm, Ph1-Ph3=17.91cm).
# NCT footer full-width at y=16.8cm.
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text='NCT05021323 (HLX-201, Ph2, n=48) · NCT06142091 (HLX-304, Ph1, n=24) · IND-filed Q1-26 for HLX-412' \
  --prop x=1.5cm --prop y=16.8cm --prop width=30.87cm --prop height=1.2cm \
  --prop font=Calibri --prop size=12 --prop italic=true --prop color=666666 --prop fill=none
```

**QA.** `officecli query "$FILE" 'shape:contains("NCT")' --json | jq '.data.results | length'` ≥ 1. Bar colors darken across stages (`CADCFC` preclinical-only, `1E2761` Ph2-reached).

### (12) Competitive comparison table — Series B+ essential

**Visual outcome.** 5–7 rows × 4–6 cols. Column 1 = competitor name (optional logo shape beside); rest = differentiators (speed / price / integrations / margin / coverage). **Last row = your company, fill highlighted** in an accent color (CADCFC / 97BC62); competitor rows gray. Every Series B+ deck needs this (SaaS: Datadog / New Relic / Splunk; Bio: Kite / Novartis / BMS).

```bash
SLIDE=13
officecli add "$FILE" / --type slide --prop layout=blank --prop background=FFFFFF
officecli add "$FILE" "/slide[$SLIDE]" --type shape --prop text="Competitive landscape" \
  --prop x=1.5cm --prop y=1.2cm --prop width=30.87cm --prop height=2cm \
  --prop font=Georgia --prop size=36 --prop bold=true --prop color=1E2761 --prop fill=none
# Inline table via --prop data= (confirmed on v1.0.63; per-cell r#c# rejected). Single-quote the data value — '$15/host' would strip.
officecli add "$FILE" "/slide[$SLIDE]" --type table \
  --prop data='Competitor,Speed,Price,Integrations,Margin;Datadog,12 min,$15/host,680,75%;New Relic,18 min,$25/host,520,68%;Splunk,45 min,$45/GB,310,62%;You (Acme DevOps),90 sec,$8/host,1200,82%' \
  --prop style=medium1 --prop headerFill=1E2761 \
  --prop x=1.5cm --prop y=4cm --prop width=30.87cm --prop height=12cm
# Highlight your row: loop over /slide[$SLIDE]/table[1]/tr[5]/tc[1..5] and set cell fill to CADCFC.
```

**QA.** `officecli query "$FILE" 'table' --json | jq '.data.results | length'` ≥ 1. Row count ≥ 4 (you + ≥ 3 named competitors). Your row visually distinct via cell fill (Gate 5b visual check — table style alone does not highlight one row).

## Numbers convention (pitch-specific)

A terse convention table — **not a finance tutorial**. If you don't already know what these mean, pause the deck and ask the user for the values; don't guess.

| Metric                          | Shape                              | Floor / convention                                                                      |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| **TAM**                         | `$X.YB`, one methodology           | Either top-down (analyst report) or bottom-up (count × ACV). Never both; never neither. |
| **SAM**                         | `$X.YB`, fraction of TAM you serve | Typically 15 – 30% of TAM for verticalized SaaS; higher for horizontal                  |
| **SOM**                         | `$X.YB` at year N                  | Realistic 5-yr share: 5 – 15% of SAM for early stage                                    |
| **ARR**                         | MRR × 12. NOT revenue.             | SaaS only; contracts on books, net of churn                                             |
| **MRR**                         | Monthly recurring                  | ARR / 12; do not confuse with monthly revenue                                           |
| **NRR (Net Revenue Retention)** | %, trailing 12 mo                  | VC floor: > 100% acceptable, > 115% strong, > 130% exceptional                          |
| **CAC**                         | $ fully-loaded                     | Sales + marketing spend / new logos acquired                                            |
| **LTV**                         | $                                  | ARPU × gross margin × (1 / churn rate)                                                  |
| **LTV:CAC**                     | ratio                              | VC floor: 3x OK, > 4x strong, > 5x exceptional                                          |
| **CAC payback**                 | months                             | VC floor: < 18 mo OK, < 12 mo strong                                                    |
| **Gross margin**                | %                                  | SaaS floor 70%, strong 80%+; marketplace 15-40%; hardware 30-50%                        |
| **Burn / runway**               | $/month + months                   | Gross burn vs net burn — label which; runway to specific milestone                      |
| **Use of Funds**                | 4-bucket pie                       | Engineering / Go-to-Market / G&A / Reserve — see Ask slide recipe                       |

**Rule.** Every number on a deck carries a unit. `18%` or `18M` alone is ambiguous — write `$18M ARR` / `18% NRR growth`. `TBD`, `coming soon`, `(fill in)`, `lorem`, `xxxx` in numeric slots = immediate VC disqualification. Gate 6 greps these below.

## VC ship-check (6 red flags / positive signals)

What the VC reads in the first 30 seconds. Six one-line conditions — every "FAIL" below is an instant round-killer; fix before delivering.

| #   | Red flag (FAIL if present)                                   | Positive signal (shipwise)                                                      |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | Cover without round + amount + date                          | `Company · tagline · Series X · $YM · Date` in 4 lines                          |
| 2   | TAM > $100B without a cited source / methodology             | TAM clearly labeled bottom-up OR top-down with a visible 2024+ source           |
| 3   | Traction chart y-axis does not start at 0 (hockey-stick lie) | Line chart `axismin=0`; growth shape honest                                     |
| 4   | Team slide: headshots + names only, no prior companies       | Every member: prior company + role + 1 achievement metric                       |
| 5   | Ask slide missing Use-of-Funds breakdown                     | `$XM` hero + 4-bucket pie (Eng / GTM / G&A / Reserve) + runway + next milestone |
| 6   | `TBD` / `lorem` / `xxxx` / `{{...}}` / `(fill in)` anywhere  | `view text` clean — zero placeholder tokens                                     |

**Common Series-specific failures.**

- **Series A specific** — bottom-up TAM calculated from a fictional enterprise-count × ACV (no reference customers to anchor the count); `CAC / LTV` shown with < 12 months of data (statistically meaningless).
- **Series B specific** — no unit-econ slide at all; CAC payback > 24 months without a "we're pre-scale, here's the plan" narrative; logo wall < 8 customers.
- **Series C specific** — no moat / defensibility slide; revenue growth shown without margin trajectory; international expansion stated but no specific launch plan / hires.

The Delivery Gate 6 block below executes checks 1–6 above via grep + query. Gate 5b fresh-eyes covers the visual judgments (hockey stick, team credibility) that grep can't see.

## Traction triple-pattern (ARR + milestones + logos)

For Series B+, traction often spans 2 slides: one for the chart + callout (recipe 7 above), one for **milestone timeline + logo wall**. Timeline = 4-6 horizontal dates with one-line events. Logo wall = 12-20 customer logos in a 4×N or 5×N grid, muted monochrome so no single brand dominates.

```bash
# Milestone timeline: 5 dates as circles on a horizontal line at y=8cm.
# Use pptx shapes (ellipse preset) + connectors (shape=straight) between them.
# Each milestone = ellipse at y=8cm + date label above + event description below.
# → See pptx v2 Recipe (d) row 9 (Roadmap timeline) for the canonical pattern.

# Logo wall: pictures in a 5×N grid. Typical spacing: logo width = 5cm, height = 2cm, gap = 0.4cm.
# grid math for 5 logos across, 1.5cm edge margin: usable = 33.87 − 3 − 4·0.4 = 29.27, col = 5.85cm
# (use 5cm logo width centered in each 5.85cm column)
```

**QA.** Logo wall should have ≥ 8 logos for Series B+, ≥ 4 for Series A. Fewer = "lighter than it looks"; more than 20 = pixel noise.

## QA — Delivery Gate (executable)

**Assume there are problems.** First render is almost never correct. Pitch decks fail at two layers: **structural** (schema, token leaks — caught by pptx v2 Gates 1–3) and **narrative** (wrong stage, missing unit econ, TAM unsourced — the checks that make pptx v2 Gate 5b + Gate 6 indispensable). Every check must print its success message.

### Gates 1–5a — inherited from pptx v2 verbatim

→ see pptx v2 §Delivery Gate L637-679. Copy-paste the full block:

- **Gate 1** — `validate` schema check (whitelist `ChartShapeProperties` warnings per C-P-2).
- **Gate 2** — token leak via `view text` grep (`$xxx$`, `{{...}}`, `<TODO>`, `lorem`, `xxxx`, empty `()`/`[]`, `\$`/`\t`/`\n` literals).
- **Gate 3** — hyperlink `rPr` schema trap (C-P-1) — zero `<a:rPr><a:hlinkClick>`.
- **Gate 4** — slide-order sanity — cover first, dividers before sections, closing last.
- **Gate 5a** — dark-on-dark contrast — every fill in `{1E2761, 0A1628, 8B1A1A, 2C5F2D, 36454F}` must declare near-white textColor. **This includes charts rendered on that fill**: chart `title.textColor`, `legend.textColor`, axis text default to dark and read as invisible on dark backgrounds — set them explicitly, or place the chart on a light card inside the dark slide.

Do not skip or reorder these five. Every pptx-layer defect caught by Gates 1–5a also fires on pitch decks.

**Gate 2b — pitch-specific shell-strip signatures (MANDATORY).** Gate 2 misses `$35M` that zsh silently stripped to empty (no residue to grep). Run this after Gate 2:

```bash
# $XXM stripped by zsh leaves bare " M ARR" / " M raised" / "Series [A-C] · M" patterns.
STRIP=$(officecli view "$FILE" text | grep -niE '(^|[^A-Za-z0-9])M (ARR|raised|Series|runway|round|raise)|Series [A-C] · M( |$)|runway · M|raised · M|raising ·? M')
[ -z "$STRIP" ] && echo "Gate 2b OK (no \$-strip signatures)" || { echo "REJECT Gate 2b (likely zsh \$-strip — re-issue with single quotes):"; echo "$STRIP"; exit 1; }
```

Fix: re-issue the offending `add`/`set` with single quotes around the text value (`--prop text='Series B · $35M'`, not double quotes). The same strip hits **chart series names / axis titles** (`--prop name="营收 ($M)"` → legend shows `营收 ()`): single-quote every chart prop carrying `$`.

### Gate 5b — Visual audit via HTML preview (MANDATORY, NOT optional)

Gates 1–5a are token-grep defenses. **They cannot see a rendered slide.** This step is the only visual-assembly check. Do not skip.

Run `officecli view "$FILE" html` and Read the returned HTML. Walk every slide and answer, for EACH (inherits pptx v2 Gate 5b checklist; pitch-specific additions marked ⭐):

- **overlap**: do any text shapes overlap each other or a chart?
- **dark-on-dark**: is any text on a fill where fill brightness < 30% AND text brightness < 80%?
- **divider overlap**: any giant decorative number (01/02/03 at 100pt+) colliding with the divider title text?
- **order sanity**: does the slide sequence match your stage-appropriate narrative outline?
- **missing arrowheads**: do flowchart/decision-tree connectors show direction, or plain lines?
- ⭐ **traction y-axis**: does every ARR / revenue / growth line chart start at 0 on the y-axis? (Not 80% of current — that is the hockey-stick lie.)
- ⭐ **team credibility**: does every team-slide card show a prior company or prior title? (Cards with just headshot + name = reject.)
- ⭐ **TAM / market number credibility**: is the TAM under $100B for a niche market, or if ≥ $100B, is a methodology source cited? (A claimed `$500B TAM` with no source is an auto-reject red flag.)
- ⭐ **Use-of-Funds pie**: does the ask slide carry a 4-bucket pie (Engineering / GTM / G&A / Reserve) or a 4-card row with %s?
- ⭐ **narrative completeness**: is the order cover → problem → solution → market → product → model → traction → team → financials → ask, or your stage-appropriate permutation from §Stage diagnosis?

**Instruction.** Run `officecli view "$FILE" html` and Read the HTML. Walk every slide against the questions below. If rendering chart colors, animations, or zoom — those only show in the target viewer (PowerPoint / Keynote / WPS); ask the user to open `.pptx` directly for those runtime features.

> For every slide:
> (a) Are slides in VC narrative order (cover → problem → solution → market → product → model → traction → team → financials → ask, with your stage's adjustments)? Flag any out-of-sequence.
> (b) Is every ARR / revenue / growth line chart y-axis anchored at 0? Flag hockey-stick visual lies.
> (c) Does the team slide carry prior-company credentials for each person? (Not just headshot + name.)
> (d) Does every TAM / SAM / SOM claim have a visible source or methodology?
> (e) Does the ask slide have a 4-bucket Use of Funds (Engineering / GTM / G&A / Reserve) and a specific next milestone + runway length?
> (f) Any text overlap, dark-on-dark, off-slide geometry, missing arrowheads, placeholder tokens (`TBD` / `lorem` / `{{...}}` / `xxxx` / empty `()`)?

Report every instance with slide number. If ANY defect — REJECT; do not deliver until fixed.

**Human preview (optional).** If you want the user to visually preview the deck, run `officecli watch "$FILE"` for a live preview the user can open at their own discretion, or have them open the `.pptx` directly in PowerPoint / WPS / Keynote. For final visual verification, open the file in the target presentation viewer.

### Gate 6 — Pitch narrative sanity (executable)

Pitch-specific checks that grep the deck for VC red flags. Every one is a token check — combine with Gate 5b's human read for full coverage.

```bash
FILE="deck.pptx"

# 6.1 — no TBD / lorem / placeholder tokens (stronger than Gate 2 — pitch-specific scope)
LEAK=$(officecli view "$FILE" text | grep -niE 'TBD|lorem|\(fill in\)|xxxx|coming soon|placeholder')
[ -z "$LEAK" ] && echo "Gate 6.1 OK (no placeholder tokens)" || { echo "REJECT Gate 6.1:"; echo "$LEAK"; exit 1; }

# 6.2 — TAM / SAM / SOM presence (Series A+)
TAM_HIT=$(officecli query "$FILE" 'shape:contains("TAM")' --json | jq '.data.results | length')
[ "$TAM_HIT" -ge 1 ] && echo "Gate 6.2 OK (TAM slide present)" || echo "WARN Gate 6.2: no TAM mention — confirm stage is Seed / Bridge if intentional"

# 6.3 — Unit econ presence (Series B+): CAC OR LTV OR payback
CAC_HIT=$(officecli query "$FILE" 'shape:contains("CAC")' --json | jq '.data.results | length')
LTV_HIT=$(officecli query "$FILE" 'shape:contains("LTV")' --json | jq '.data.results | length')
if [ "$CAC_HIT" -ge 1 ] || [ "$LTV_HIT" -ge 1 ]; then
  echo "Gate 6.3 OK (unit econ surface)"
else
  echo "WARN Gate 6.3: no CAC / LTV — confirm stage Seed/A if intentional, REJECT if Series B+"
fi

# 6.4 — Use of Funds present on ask slide
UOF_HIT=$(officecli query "$FILE" 'shape:contains("Use of Funds")' --json | jq '.data.results | length')
[ "$UOF_HIT" -ge 1 ] && echo "Gate 6.4 OK (Use of Funds)" || { echo "REJECT Gate 6.4: ask slide missing Use of Funds"; exit 1; }

# 6.5 — Team prior-company signal (at least one of ex- / former / prior / previously)
PRIOR_HIT=$(officecli view "$FILE" text | grep -ciE '\b(ex-|former|prior|previously)\b')
[ "$PRIOR_HIT" -ge 1 ] && echo "Gate 6.5 OK (team prior-company)" || { echo "REJECT Gate 6.5: team slide has no prior-company credentials"; exit 1; }

# 6.6 — Traction chart y-axis anchored at 0 (at least one chart must set axismin=0, Series A+)
AXISMIN_HIT=$(officecli query "$FILE" 'chart' --json | jq '[.data.results[]? | select(.format.axisMin == "0" or .format.axisMin == 0 or .format.axismin == "0" or .format.axismin == 0)] | length')
[ "$AXISMIN_HIT" -ge 1 ] && echo "Gate 6.6 OK (traction chart axisMin=0)" || echo "WARN Gate 6.6: no chart sets axisMin=0 — confirm no ARR/revenue line chart, or add --prop axismin=0"

echo "Delivery Gate 6 PASS (token + narrative checks) — proceed to Gate 5b fresh-eyes (MANDATORY)"
```

**Readback key note.** CLI accepts lowercase `axismin` as input (on `--prop axismin=0`) but emits camelCase `axisMin` in `query --json` on v1.0.63. The jq above accepts both for forward-compat.

Gate 6 is a grep floor. Gate 5b is the visual ceiling. Ship only when both print PASS.

### Honest limit

`validate` catches schema errors, not fundraising errors. A deck passes `validate` with a `$500B TAM` on a $10M market, a team slide of four co-founders with no prior companies, a hockey stick y-axis at 80%, a pitch for a Series B round without unit econ, and an ask slide saying "we're raising some money". Gates 5b + 6 above exist because `validate` cannot catch any of this.

## Known Issues & Pitfalls

→ Base pitfalls (shell escape, `[last()]` in resident, connector `@name=` rejection C-P-6, picture alt two-step C-P-7, animation remove C-P-4, chart color normalization C-P-7): see pptx v2 §Known Issues & Pitfalls C-P-1..7.

Pitch-specific:

- **Stage misidentified.** Series A deck with 6 pages of CAC/LTV math = over-packaged. Series B deck missing unit econ = incomplete. If unsure, re-read §Stage diagnosis before building.
- **Hockey-stick y-axis.** If the line chart's y-axis doesn't start at 0, VCs read it as a visual lie within 2 seconds. Always `--prop axismin=0` on ARR / revenue / growth charts. Gate 6.6 checks this.
- **Team slide = portfolio.** Cards showing only {headshot + name + role} fail VC credibility. Every card needs a prior-company or prior-achievement line. Gate 6.5 checks this.
- **TAM without methodology.** A claimed number with no "top-down" or "bottom-up" source footnote = fabricated. Pick one methodology per deck; don't mix.
- **Use-of-Funds as 3-bucket or 5-bucket.** 4-bucket (Eng / GTM / G&A / Reserve) is convention; departing from it reads as sloppy. Gate 6.4 checks presence.
- **Pitch deck used for a board review / sales deck.** Narrative arc (problem → ask) makes board reviews awkward — route to pptx v2 Recipe (d) 10-slide instead. See §Reverse handoff above.
- **pptx v2 Recipe (d′) 20-slide is a starting point, not a formula.** It is stage-agnostic SaaS. Adjust for your stage + 赛道 via §Stage diagnosis and §赛道 arc templates — never ship (d′) unchanged for a non-SaaS Series A.

## Help pointer

When in doubt: `officecli help pptx`, `officecli help pptx <element>`, `officecli help pptx <element> --json`. Help is the authoritative schema; this skill is the decision guide for fundraising deltas on top of pptx v2.
