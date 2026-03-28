---
name: officecli-pptx
description: "Use this skill any time a .pptx file is involved -- as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file; editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions 'deck,' 'slides,' 'presentation,' or references a .pptx filename."
---

# OfficeCLI PPTX Skill

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
        echo "Upgrading officecli $CURRENT → $LATEST..."
        curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash
    else
        echo "officecli $CURRENT is up to date"
    fi
fi
officecli --version
```

---

## Quick Reference

| Task                       | Action                              |
| -------------------------- | ----------------------------------- |
| Read / analyze content     | Use `view` and `get` commands below |
| Edit existing presentation | Read [editing.md](editing.md)       |
| Create from scratch        | Read [creating.md](creating.md)     |

---

## Reading & Analyzing

### Text Extraction

```bash
officecli view slides.pptx text
officecli view slides.pptx text --start 1 --end 5
```

### Structure Overview

```bash
officecli view slides.pptx outline
```

Output shows slide titles, shape counts, and picture counts per slide.

### Detailed Inspection

```bash
officecli view slides.pptx annotated
```

Shows shape types, fonts, sizes, pictures with alt text status, tables with dimensions.

### Statistics

```bash
officecli view slides.pptx stats
```

Slide count, shape count, font usage, missing titles, missing alt text.

### Element Inspection

```bash
# List all shapes on a slide
officecli get slides.pptx /slide[1] --depth 1

# Get shape details (position, fill, font, animation, etc.)
officecli get slides.pptx /slide[1]/shape[1]

# Get chart data and config
officecli get slides.pptx /slide[1]/chart[1]

# Get table structure
officecli get slides.pptx /slide[1]/table[1] --depth 3

# Get placeholder by type
officecli get slides.pptx "/slide[1]/placeholder[title]"
```

### CSS-like Queries

```bash
# Find shapes containing specific text
officecli query slides.pptx 'shape:contains("Revenue")'

# Find pictures without alt text
officecli query slides.pptx "picture:no-alt"

# Find shapes with specific fill color
officecli query slides.pptx 'shape[fill=#4472C4]'

# Find shapes wider than 10cm
officecli query slides.pptx "shape[width>=10cm]"

# Find shapes on a specific slide
officecli query slides.pptx 'slide[2] > shape[font="Arial"]'
```

### Visual Inspection

```bash
# SVG rendering (single slide, self-contained, no dependencies)
officecli view slides.pptx svg --start 1 --end 1 --browser

# HTML rendering (all slides, interactive, with charts and 3D -- recommended)
officecli view slides.pptx html --browser
```

**Note:** SVG renders only one slide per invocation (the first in the range). Use `html --browser` for multi-slide preview with full chart/gradient/table rendering.

---

## Design Principles

**Don't create boring slides.** Plain bullets on a white background won't impress anyone.

### Before Starting

- **Pick a bold, content-informed color palette**: The palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices.
- **Dominance over equality**: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
- **Dark/light contrast**: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: Pick ONE distinctive element and repeat it -- rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

### Color Palettes

Choose colors that match your topic -- don't default to generic blue:

| Theme                  | Primary               | Secondary             | Accent              | Text                   | Muted/Caption          |
| ---------------------- | --------------------- | --------------------- | ------------------- | ---------------------- | ---------------------- |
| **Coral Energy**       | `F96167` (coral)      | `F9E795` (gold)       | `2F3C7E` (navy)     | `333333` (charcoal)    | `8B7E6A` (warm gray)   |
| **Midnight Executive** | `1E2761` (navy)       | `CADCFC` (ice blue)   | `FFFFFF` (white)    | `333333` (charcoal)    | `8899BB` (slate)       |
| **Forest & Moss**      | `2C5F2D` (forest)     | `97BC62` (moss)       | `F5F5F5` (cream)    | `2D2D2D` (near-black)  | `6B8E6B` (faded green) |
| **Charcoal Minimal**   | `36454F` (charcoal)   | `F2F2F2` (off-white)  | `212121` (black)    | `333333` (dark gray)   | `7A8A94` (cool gray)   |
| **Warm Terracotta**    | `B85042` (terracotta) | `E7E8D1` (sand)       | `A7BEAE` (sage)     | `3D2B2B` (brown-black) | `8C7B75` (dusty brown) |
| **Berry & Cream**      | `6D2E46` (berry)      | `A26769` (dusty rose) | `ECE2D0` (cream)    | `3D2233` (dark berry)  | `8C6B7A` (mauve gray)  |
| **Ocean Gradient**     | `065A82` (deep blue)  | `1C7293` (teal)       | `21295C` (midnight) | `2B3A4E` (dark slate)  | `6B8FAA` (steel blue)  |
| **Teal Trust**         | `028090` (teal)       | `00A896` (seafoam)    | `02C39A` (mint)     | `2D3B3B` (dark teal)   | `5E8C8C` (muted teal)  |
| **Sage Calm**          | `84B59F` (sage)       | `69A297` (eucalyptus) | `50808E` (slate)    | `2D3D35` (dark green)  | `7A9488` (faded sage)  |
| **Cherry Bold**        | `990011` (cherry)     | `FCF6F5` (off-white)  | `2F3C7E` (navy)     | `333333` (charcoal)    | `8B6B6B` (dusty red)   |

Use **Text** for body copy on light backgrounds, **Muted** for captions, labels, and axis text. On dark backgrounds, use the Secondary or `FFFFFF` for body text and Muted for captions.

**Need a color not in the table?** These palettes are starting points. You can add accent colors (e.g., gold `D4A843` with Forest & Moss) or blend palettes to match the topic. If a user requests a palette that doesn't exist by name (e.g., "Forest & Gold"), use the closest match and supplement with appropriate accent tones.

### Typography

**Choose an interesting font pairing** -- don't default to Arial.

| Header Font  | Body Font     | Best For                                    |
| ------------ | ------------- | ------------------------------------------- |
| Georgia      | Calibri       | Formal business, finance, executive reports |
| Arial Black  | Arial         | Bold marketing, product launches            |
| Calibri      | Calibri Light | Clean corporate, minimal design             |
| Cambria      | Calibri       | Traditional professional, legal, academic   |
| Trebuchet MS | Calibri       | Friendly tech, startups, SaaS               |
| Impact       | Arial         | Bold headlines, event decks, keynotes       |
| Palatino     | Garamond      | Elegant editorial, luxury, nonprofit        |
| Consolas     | Calibri       | Developer tools, technical/engineering      |

| Element        | Size          |
| -------------- | ------------- |
| Slide title    | 36-44pt bold  |
| Section header | 20-24pt bold  |
| Body text      | 14-16pt       |
| Captions       | 10-12pt muted |

### Layout Variety

**Every slide needs a visual element** -- image, chart, icon, or shape. Text-only slides are forgettable.

Vary across these layout types:

- Two-column (text left, visual right)
- Icon + text rows (icon in colored circle, bold header, description)
- 2x2 or 2x3 grid (content blocks)
- Half-bleed image (full left/right side) with content overlay
- Large stat callouts (big numbers 60-72pt with small labels below)
- Comparison columns (before/after, pros/cons)
- Timeline or process flow (numbered steps, arrows)

### Content-to-Layout Quick Guide

These are starting points. Adapt based on content density and narrative flow.

| Content Type          | Recommended Layout                         | Why                                          |
| --------------------- | ------------------------------------------ | -------------------------------------------- |
| Pricing / plan tiers  | 2-3 column cards (comparison)              | Side-by-side enables instant comparison      |
| Team / people         | Icon grid or 2x3 cards                     | Faces/avatars need equal visual weight       |
| Timeline / roadmap    | Process flow with arrows or numbered steps | Left-to-right communicates sequence          |
| Key metrics / KPIs    | Large stat callouts (3-4 big numbers)      | Big numbers grab attention; labels below     |
| Testimonials / quotes | Full-width quote with attribution          | Generous whitespace signals credibility      |
| Feature comparison    | Two-column before/after or table           | Parallel structure aids scanning             |
| Architecture / system | Shapes + connectors diagram                | Spatial relationships need visual expression |
| Financial data        | Chart + summary table side-by-side         | Chart shows trend; table provides precision  |

### Spacing

- 0.5" (1.27cm) minimum margins from slide edges
- 0.3-0.5" (0.76-1.27cm) between content blocks
- Leave breathing room -- don't fill every inch

### Avoid (Common Mistakes)

- **Don't repeat the same layout** -- vary columns, cards, and callouts across slides
- **Don't center body text** -- left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** -- titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** -- pick colors that reflect the specific topic
- **Don't mix spacing randomly** -- choose 0.3" or 0.5" gaps and use consistently
- **Don't style one slide and leave the rest plain** -- commit fully or keep it simple throughout
- **Don't create text-only slides** -- add images, icons, charts, or visual elements
- **Don't forget text box padding** -- when aligning shapes with text edges, set `margin=0` on the text box or offset to account for default padding
- **Don't use low-contrast elements** -- icons AND text need strong contrast against the background
- **NEVER use accent lines under titles** -- these are a hallmark of AI-generated slides; use whitespace or background color instead

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

### Content QA

```bash
# Extract all text, check for missing content, typos, wrong order
officecli view slides.pptx text

# Check for structural and formatting issues automatically
officecli view slides.pptx issues
```

**Note:** `view issues` reports "Slide has no title" for all blank-layout slides. This is expected when using `layout=blank` (the recommended approach for custom designs). These warnings can be safely ignored.

When editing templates, check for leftover placeholder text:

```bash
officecli query slides.pptx 'shape:contains("lorem")'
officecli query slides.pptx 'shape:contains("xxxx")'
officecli query slides.pptx 'shape:contains("placeholder")'
```

### Visual QA

**Use subagents** -- even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes.

```bash
# Render a single slide as SVG for visual inspection
officecli view slides.pptx svg --start 3 --end 3 --browser

# Loop through slides for multi-slide QA
for i in 1 2 3 4 5; do officecli view slides.pptx svg --start $i --end $i > /tmp/slide-$i.svg; done
```

**SVG limitations:** SVG renders only one slide (the first in the `--start`/`--end` range). Gradient backgrounds, charts, and tables are not visible in SVG output. For full-fidelity multi-slide preview including charts and gradients, use HTML mode:

```bash
officecli view slides.pptx html --browser
```

Prompt for visual QA subagent:

```
Visually inspect these slides. Assume there are issues -- find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray on cream background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.
Report ALL issues found.
```

**Editing-specific QA checklist (in addition to the above):**

- [ ] On every template slide (not new blank slides), verify that NO decorative element (`!!`-prefixed shape) overlaps or obscures content text
- [ ] Verify all hero numbers / key metrics are visible (not hidden by card fills or same-color-as-background)
- [ ] On dark background slides, verify chart bars/lines, axis labels, and gridlines are visible

### Validation

```bash
# Schema validation -- must pass before delivery
officecli validate slides.pptx
```

### Pre-Delivery Checklist

Before declaring a presentation complete, verify:

- [ ] Speaker notes on all content slides (not just title/closing)
- [ ] At least one transition style applied (fade for title, push or wipe for content)
- [ ] Alt text on all pictures
- [ ] At least 3 different layout types used across slides
- [ ] No two consecutive slides share the same layout pattern

### Verification Loop

1. Generate slides
2. Run `view issues` + `validate` + visual inspection
3. **List issues found** (if none found, look again more critically)
4. Fix issues
5. **Re-verify affected slides** -- one fix often creates another problem
6. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

---

## Common Pitfalls

| Pitfall                        | Correct Approach                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--name "foo"`                 | Use `--prop name="foo"` -- all attributes go through `--prop`                                                                                                                                                                                                                                                       |
| `x=-3cm`                       | Negative coordinates not supported. Use `x=0cm` instead                                                                                                                                                                                                                                                             |
| `/shape[myname]`               | Name indexing not supported. Use numeric index: `/shape[3]`                                                                                                                                                                                                                                                         |
| Guessing property names        | Run `officecli pptx set shape` to see exact names                                                                                                                                                                                                                                                                   |
| `\n` in shell strings          | Use `\\n` for newlines in `--prop text="line1\\nline2"`                                                                                                                                                                                                                                                             |
| Modifying an open file         | Close the file in PowerPoint/WPS first                                                                                                                                                                                                                                                                              |
| Hex colors with `#`            | Use `FF0000` not `#FF0000` -- no hash prefix                                                                                                                                                                                                                                                                        |
| Theme colors                   | Use `accent1`..`accent6`, `dk1`, `dk2`, `lt1`, `lt2` -- not hex                                                                                                                                                                                                                                                     |
| Forgetting alt text            | Always set `--prop alt="description"` on pictures for accessibility                                                                                                                                                                                                                                                 |
| Paths are 1-based              | `/slide[1]`, `/shape[1]` -- XPath convention                                                                                                                                                                                                                                                                        |
| `--index` is 0-based           | `--index 0` = first position -- array convention                                                                                                                                                                                                                                                                    |
| Unquoted `[N]` in zsh/bash     | Shell glob-expands `/slide[1]` -- always quote paths: `"/slide[1]"`                                                                                                                                                                                                                                                 |
| Z-order (shapes overlapping)   | Use `--prop zorder=back` or `zorder=front` / `forward` / `backward` / absolute position number. **WARNING:** Z-order changes cause shape index renumbering -- re-query with `get --depth 1` after any z-order change before referencing shapes by index. Process highest index first when changing multiple shapes. |
| `gap`/`gapwidth` on chart add  | Ignored during `add` -- set it after creation: `officecli set ... /slide[N]/chart[M] --prop gap=80`                                                                                                                                                                                                                 |
| `$` and `'` in batch JSON text | Use heredoc: `cat <<'EOF' \| officecli batch` -- single-quoted delimiter prevents shell expansion of `$`, apostrophes, and backticks                                                                                                                                                                                |
| Template text at wrong size    | Template shapes have baked-in font sizes. Always include `size`, `font`, and `color` in every `set` on template shapes. See editing.md "Font Cascade from Template Shapes" section.                                                                                                                                 |

---

## Performance: Resident Mode

For multi-step workflows (3+ commands on the same file), use `open`/`close`:

```bash
officecli open slides.pptx        # Keep in memory -- fast subsequent commands
officecli add slides.pptx ...     # No file I/O overhead per command
officecli set slides.pptx ...
officecli close slides.pptx       # Save and release
```

## Performance: Batch Mode

Execute multiple operations in a single open/save cycle:

```bash
echo '[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Title","x":"2cm","y":"2cm","width":"20cm","height":"3cm","size":"36","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Body text","x":"2cm","y":"6cm","width":"20cm","height":"10cm","size":"16"}}
]' | officecli batch slides.pptx
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `view`, `raw`, `raw-set`, `validate`.

Batch mode works with resident mode. Run `officecli open file.pptx` first, then pipe batch commands, then `officecli close file.pptx`. This combines batch efficiency with resident mode's persistent file handle.

Batch fields: `command`, `path`, `parent`, `type`, `from`, `to`, `index`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

`parent` = container to add into (for `add`, including clone via `from` field). `path` = element to modify (for `set`, `get`, `remove`, `move`).

---

## Known Issues

| Issue                                                                                                                                                                                                                                       | Workaround                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chart series cannot be added after creation**: `set --prop data=` and `set --prop seriesN=` on an existing chart can only update existing series -- they cannot add new series. The series count is fixed at creation time.               | Include all series in the `add` command (using `series1`+`series2` props or the `data` prop). Both forms work reliably in single commands and in batch mode. If you need to add series to an existing chart, delete it and recreate: `officecli remove file.pptx "/slide[N]/chart[M]"` then `officecli add` with all series. See creating.md "Multi-Series Column Chart" and editing.md "Update Charts". |
| **Chart schema validation warning**: Some modern chart styling combinations produce a `ChartShapeProperties` schema warning from `officecli validate`. This does not affect PowerPoint rendering.                                           | Ignore the warning if the chart opens correctly in PowerPoint.                                                                                                                                                                                                                                                                                                                                           |
| **Table font cascade overwritten by row set**: Setting `size`/`font` on the table path and then setting row content with `set tr[N]` resets font properties on that row to defaults.                                                        | Set table-level `size`/`font` **after** all row content is populated, or include `size`/`font` in each row-level `set` command.                                                                                                                                                                                                                                                                          |
| **Shell quoting in batch with `echo`**: `echo '...' \| officecli batch` fails when JSON values contain apostrophes or `$` characters (common in English text and currency).                                                                 | Use a heredoc instead: `cat <<'EOF' \| officecli batch file.pptx` ... `EOF`. The single-quoted heredoc delimiter prevents all shell interpolation.                                                                                                                                                                                                                                                       |
| **Batch intermittent failure**: Approximately 1-in-15 batch operations may fail with "Failed to send to resident" when using batch mode with resident mode (`open`/`close`).                                                                | Retry the failed batch command. If the error persists, close and re-open the file: `officecli close file.pptx && officecli open file.pptx`, then retry. For critical workflows, consider splitting large batch arrays into smaller chunks (10-15 operations each).                                                                                                                                       |
| **Table cell solidFill schema warning**: Setting `color` on table cell run properties may produce `solidFill` schema validation errors. The table renders correctly in PowerPoint.                                                          | Ignore if the table opens correctly. Alternatively, set text color at the row level (`set tr[N] --prop color=HEX`) instead of the cell level.                                                                                                                                                                                                                                                            |
| **Multi-series chart rendering in SVG/screenshot**: SVG and screenshot renders may show fewer series than actually exist in the chart data. The chart data is correct but the rendering engine does not always display all series visually. | Verify multi-series charts by opening the .pptx in PowerPoint or by using `get /slide[N]/chart[M]` to confirm all series are present in the data. Do not rely solely on SVG/screenshot visual QA for multi-series verification.                                                                                                                                                                          |

---

## Help System

**When unsure about property names, value formats, or command syntax, run help instead of guessing.** One help query is faster than guess-fail-retry loops.

```bash
officecli pptx set              # All settable elements and their properties
officecli pptx set shape        # Shape properties in detail
officecli pptx set shape.fill   # Specific property format and examples
officecli pptx add              # All addable element types
officecli pptx view             # All view modes
officecli pptx get              # All navigable paths
officecli pptx query            # Query selector syntax
```
