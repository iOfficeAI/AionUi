---
# officecli: v1.0.23
name: officecli-pptx
description: "Use this skill any time a .pptx file is involved -- as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file; editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions 'deck,' 'slides,' 'presentation,' or references a .pptx filename."
---

# OfficeCLI PPTX Skill

## BEFORE YOU START (CRITICAL)

> [!CAUTION]
> **zsh 用户（macOS 默认 shell）**：所有含方括号的路径参数**必须加引号**，否则 zsh 会 glob 展开并报错 `zsh: no matches found`。
> - 正确：`officecli set deck.pptx '/slide[1]'` 或 `"/slide[1]"`
> - 错误：`officecli set deck.pptx /slide[1]`（zsh 会展开 `[1]`）
>
> **这是首次使用时几乎必然触发的错误。** 验证引号是否生效：
> ```bash
> officecli get deck.pptx '/slide[1]' --depth 1   # 正确（有引号）
> ```
> 如果看到 `no matches found`，说明引号缺失。

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

| Task | Action |
|------|--------|
| Read / analyze content | Use `view` and `get` commands below |
| Edit existing presentation | Read [editing.md](editing.md) |
| Create from scratch | Read [creating.md](creating.md) |

---

## Execution Model

**Run commands one at a time. Do not write all commands into a shell script and execute it as a single block.**

OfficeCLI is incremental: every `add`, `set`, and `remove` immediately modifies the file and returns output. Use this to catch errors early:

1. **One command at a time, then read the output.** Check the exit code before proceeding.
2. **Non-zero exit = stop and fix immediately.** Do not continue building on a broken state.
3. **Verify after structural operations.** After adding a slide, chart, table, or animation, run `get` or `validate` before building on top of it.

Running a 50-command script all at once means the first error cascades silently through every subsequent command. Running incrementally means the failure context is immediate and local — fix it and move on.

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

**注意：`view outline` 不计入表格和图表**——含表格/图表的 slide 显示为 "1 text box(es)"，shape count 偏低。如需完整结构清单（含表格行列数和图表类型），请使用：
```bash
officecli view slides.pptx annotated
```

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

| Theme | Primary | Secondary | Accent | Text | Muted/Caption |
|-------|---------|-----------|--------|------|---------------|
| **Coral Energy** | `F96167` (coral) | `F9E795` (gold) | `2F3C7E` (navy) | `333333` (charcoal) | `8B7E6A` (warm gray) |
| **Midnight Executive** | `1E2761` (navy) | `CADCFC` (ice blue) | `FFFFFF` (white) | `333333` (charcoal) | `8899BB` (slate) |
| **Forest & Moss** | `2C5F2D` (forest) | `97BC62` (moss) | `F5F5F5` (cream) | `2D2D2D` (near-black) | `6B8E6B` (faded green) |
| **Charcoal Minimal** | `36454F` (charcoal) | `F2F2F2` (off-white) | `212121` (black) | `333333` (dark gray) | `7A8A94` (cool gray) |
| **Warm Terracotta** | `B85042` (terracotta) | `E7E8D1` (sand) | `A7BEAE` (sage) | `3D2B2B` (brown-black) | `8C7B75` (dusty brown) |
| **Berry & Cream** | `6D2E46` (berry) | `A26769` (dusty rose) | `ECE2D0` (cream) | `3D2233` (dark berry) | `8C6B7A` (mauve gray) |
| **Ocean Gradient** | `065A82` (deep blue) | `1C7293` (teal) | `21295C` (midnight) | `2B3A4E` (dark slate) | `6B8FAA` (steel blue) |
| **Teal Trust** | `028090` (teal) | `00A896` (seafoam) | `02C39A` (mint) | `2D3B3B` (dark teal) | `5E8C8C` (muted teal) |
| **Sage Calm** | `84B59F` (sage) | `69A297` (eucalyptus) | `50808E` (slate) | `2D3D35` (dark green) | `7A9488` (faded sage) |
| **Cherry Bold** | `990011` (cherry) | `FCF6F5` (off-white) | `2F3C7E` (navy) | `333333` (charcoal) | `8B6B6B` (dusty red) |

Use **Text** for body copy on light backgrounds, **Muted** for captions, labels, and axis text. On dark backgrounds, use the Secondary or `FFFFFF` for body text and Muted for captions.

> **深色背景对比度规则（Hard Rule H6 补充）**：当 slide 背景为深色（填充亮度 < 30%，如 `1E2761`、`36454F`、`000000` 等）时，所有正文文字、卡片 body text、图表系列颜色和图标填充**必须**使用白色（`FFFFFF`）或近白色（亮度 > 80%）。
> **严禁**在深色背景上使用中性灰或低饱和色调（如 `6B7B8D`，亮度约 44%）作为 body text 颜色——这类颜色在深色背景上对比度不足，在演示现场尤为明显。
> 验证方法：在完成深色背景 slide 后，用 `view html --browser` 或视觉 QA 子代理确认所有文字和元素清晰可辨。

**Need a color not in the table?** These palettes are starting points. You can add accent colors (e.g., gold `D4A843` with Forest & Moss) or blend palettes to match the topic. If a user requests a palette that doesn't exist by name (e.g., "Forest & Gold"), use the closest match and supplement with appropriate accent tones.

### Typography

**Choose an interesting font pairing** -- don't default to Arial.

| Header Font | Body Font | Best For |
|-------------|-----------|----------|
| Georgia | Calibri | Formal business, finance, executive reports |
| Arial Black | Arial | Bold marketing, product launches |
| Calibri | Calibri Light | Clean corporate, minimal design |
| Cambria | Calibri | Traditional professional, legal, academic |
| Trebuchet MS | Calibri | Friendly tech, startups, SaaS |
| Impact | Arial | Bold headlines, event decks, keynotes |
| Palatino | Garamond | Elegant editorial, luxury, nonprofit |
| Consolas | Calibri | Developer tools, technical/engineering |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | **16-20pt**（最小 16pt；绝不低于 16pt） |
| Captions | 10-12pt muted |

> **Hard Rule H4**：body text 最低 **16pt**，无任何例外。
> 卡片内正文、多列内容、bullet points 一律不低于 16pt。
> 「内容放不下」不是低于 16pt 的理由——应减少文字、拆分 slide，或减少卡片数量。
> 仅以下非主读元素允许 < 16pt：图表轴标签、图例、脚注、KPI 数字下方的说明标注（sublabel）。
>
> **KPI sublabel 例外的适用范围**：仅限 ≤5 个词的短标注（如 "Active users"、"MoM growth"、"Q3 2025"）。
> 若 sublabel 是完整的描述性句子（如 "Compared to last quarter's baseline figure"），则不适用此例外，必须使用 ≥16pt 正文或删除该文字。

> **Hard Rule H7**：所有内容 slide（非封面、非结尾 slide）**必须**包含演讲者备注（speaker notes）。
> 使用 `officecli add deck.pptx /slide[N] --type notes --prop text="..."` 为每张内容 slide 添加备注。
> 缺少 speaker notes 的内容 slide 是交付硬性失败项。

### Layout Variety

**Every slide needs a non-text visual element** — shape, color block, chart, icon, or graphic. Text-only slides are forgettable and violate delivery standards.

#### 无图片场景的视觉设计清单（CLI 限制下的替代方案）

officecli 不依赖外部图片文件即可实现丰富视觉效果。当无可用图片文件时，必须从以下至少一种方式中选取视觉元素：

| 方式 | 实现方法 | 适用场景 |
|------|---------|---------|
| **色块背景** | `--type shape --prop fill=COLOR --prop preset=roundRect` | 卡片、强调区块 |
| **渐变 slide 背景** | `--prop "background=COLOR1-COLOR2-180"` | Section dividers、title slides |
| **Icon in circle** | 彩色 ellipse + 文字/数字居中叠加（见 creating.md）| 功能列表、流程步骤 |
| **大字号统计数字** | `--prop size=64 --prop bold=true`（60-72pt 数字）+ 小标签 | KPI、stats slides |
| **图表** | `--type chart`（column/pie/line 等） | 数据展示 slides |
| **形状组合** | circles + connectors + arrows 构建图表/流程 | 架构图、时间线 |

**强制 checkpoint**：每 3 张 content slide 中，至少 1 张必须包含上述非文字视觉元素（色块/图形/图表）。纯文字 slide 仅允许在以下情况使用：引用（quote）、代码示例（code）、纯表格 slide。

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

| Content Type | Recommended Layout | Why |
|---|---|---|
| Pricing / plan tiers | 2-3 column cards (comparison) | Side-by-side enables instant comparison |
| Team / people | Icon grid or 2x3 cards | Faces/avatars need equal visual weight |
| Timeline / roadmap | Process flow with arrows or numbered steps | Left-to-right communicates sequence |
| Key metrics / KPIs | Large stat callouts (3-4 big numbers) | Big numbers grab attention; labels below |
| Testimonials / quotes | Full-width quote with attribution | Generous whitespace signals credibility |
| Feature comparison | Two-column before/after or table | Parallel structure aids scanning |
| Architecture / system | Shapes + connectors diagram | Spatial relationships need visual expression |
| Financial data | Chart + summary table side-by-side | Chart shows trend; table provides precision |

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
```

> **注意：`view text` 不提取表格 (table) 内的文本。** 如需验证表格内容，请使用
> `officecli get deck.pptx '/slide[N]/table[M]' --json` 检查各单元格内容。
> 对于 QBR、技术规范等大量使用表格的幻灯片，仅靠 `view text` 会产生 QA 盲区。

```bash

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

- [ ] **（Hard Rule H7）Speaker notes 验证**：使用 `officecli view deck.pptx annotated` 确认每张内容 slide（非封面、非结尾）均有 speaker notes 条目。缺少 notes 的内容 slide 是交付硬性失败项。
- [ ] At least one transition style applied (fade for title, push or wipe for content)
- [ ] Alt text on all pictures
- [ ] At least 3 different layout types used across slides
- [ ] No two consecutive slides share the same layout pattern
- [ ] `view issues` "Slide has no title" warnings — **expected and safe to ignore** when using `layout=blank`. All custom designs use blank layout; these warnings are not real issues.
- [ ] **溢出检查（每张 slide 必做）**：对每张 slide 上的所有文字框和形状，确认 `y + height ≤ 19.05cm`（标准 widescreen 高度）且 `x + width ≤ 33.87cm`（标准宽度）。如有溢出，调小字号或缩短文本，**不得依赖截断**。
- [ ] **卡片布局逐格溢出检查**：对多卡片布局（step cards、feature grids、timeline flows），逐张卡片验证 `y + height ≤ 19.05cm`。使用 `officecli get deck.pptx '/slide[N]/shape[M]'` 逐一检查每张卡片——不得基于卡片数量估算，必须逐格测量。
- [ ] **Agenda 一致性**：如有 Agenda/TOC slide，确认其列出的所有 section 与实际 slide 标题和顺序完全一致，不得遗漏任何 section。
- [ ] **字号合规（Hard Rule H4）**：所有 body text、卡片正文、bullet points、多列内容的字号 ≥ 16pt。允许 < 16pt 的例外仅限：图表轴标签、图例、KPI sublabel（≤5 词的短标注）、脚注。

> **Hard Rule H4 澄清**：body text ≥ 16pt 无例外。若内容放不下，
> 解决方案是减少文字或拆分 slide，而非缩小字号。
> 允许 < 16pt 的例外：图表轴标签、图例、KPI sublabel（**仅限 ≤5 词的短标注**，如 "Active users"、"MoM growth"；完整描述性句子不适用此例外）、脚注。

- [ ] **图表标题无空占位符**：所有图表标题不得含有 `()`、`[]`、`TBD`、`XXX` 等空占位符。
      若标题包含动态内容（如单位 `$M`），必须在 QA 阶段替换为实际值。
      检查命令：`officecli view slides.pptx text` 然后搜索 `"()"`。

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

| Pitfall | Correct Approach |
|---------|-----------------|
| ⚠️ Unquoted `[N]` in zsh/bash | Shell glob-expands `/slide[1]` and throws `no matches found`. **Always quote paths**: `"/slide[1]"` or `'/slide[1]'`. This is the #1 first-use stumbling block on zsh. |
| `--name "foo"` | Use `--prop name="foo"` -- all attributes go through `--prop` |
| `x=-3cm` | Negative coordinates **are supported** and can be used for bleed effects (e.g., `x=-2cm` lets a decorative element overflow the left edge). |
| `/shape[myname]` | Name indexing not supported. Use numeric index: `/shape[3]` |
| Guessing property names | Run `officecli pptx set shape` to see exact names |
| `\n`/`\\` in shell strings & code slides | 普通文本 shape：使用 `\\n` 表示换行，如 `--prop text="line1\\nline2"`。<br>**代码 slide 特别注意**：`--prop text="kubectl apply \\n  -f pod.yaml"` 会在 slide 上显示字面量 `\\n`（而非换行）。对于演示用代码内容，使用单个 `\n` 实现真实换行：`--prop text="line1\nline2"`。但在 shell 单引号字符串中 `\n` 是字面量；建议使用 heredoc 或 JSON batch 传递带换行的代码文本，以避免 shell 转义问题。 |
| Modifying an open file | Close the file in PowerPoint/WPS first |
| Hex colors with `#` | Use `FF0000` not `#FF0000` -- no hash prefix |
| Theme colors | Use `accent1`..`accent6`, `dk1`, `dk2`, `lt1`, `lt2` -- not hex |
| Forgetting alt text | Always set `--prop alt="description"` on pictures for accessibility |
| Paths are 1-based | `/slide[1]`, `/shape[1]` -- XPath convention |
| `--index` is 0-based | `--index 0` = first position -- array convention |
| Z-order (shapes overlapping) | Use `--prop zorder=back` or `zorder=front` / `forward` / `backward` / absolute position number. **WARNING:** Z-order changes cause shape index renumbering -- re-query with `get --depth 1` after any z-order change before referencing shapes by index. Process highest index first when changing multiple shapes. |
| `gap`/`gapwidth` on chart add | Ignored during `add` -- set it after creation: `officecli set ... /slide[N]/chart[M] --prop gap=80` |
| `$` in `--prop text=` (shell) | `--prop text="$15M"` strips the value — shell expands `$15` as a variable. Use single quotes: `--prop text='$15M'`. For multiline or mixed quotes, use heredoc batch. |
| `$` and `'` in batch JSON text | Use heredoc: `cat <<'EOF' \| officecli batch` -- single-quoted delimiter prevents shell expansion of `$`, apostrophes, and backticks |
| Template text at wrong size | Template shapes have baked-in font sizes. Always include `size`, `font`, and `color` in every `set` on template shapes. See editing.md "Font Cascade from Template Shapes" section. |

---

## Recipes（常见场景修复指南）

以下配方针对实际制作中高频出现的视觉问题，每条均为可直接执行的修复方案。

### Recipe 1：Section Divider — 标签文字与装饰元素重叠

**问题根因：** 后添加的 shape 在 z-order 上层；若装饰 shape（圆、矩形）在文字 shape 之后添加，会覆盖文字，导致标题不可读。

**修复规则：**
1. **添加顺序即 z-order**：装饰元素（圆、色块）必须先添加，文字 shape 后添加——后添加的自动在最上层。
2. **标题文字 y 位置建议 7–10cm**（slide 高 19.05cm），避免与顶部或底部装饰元素重叠。
3. 若需调整已有 shape 的层级，使用 `--prop zorder=back`（装饰元素）或 `--prop zorder=front`（文字）。

```bash
# 正确顺序示例（装饰先，文字后）
officecli add slides.pptx / --type slide --prop layout=blank --prop "background=1E2761-CADCFC-180"

# 第1步：装饰元素（大半透明数字作为背景图形）— 先添加，在底层
officecli add slides.pptx /slide[N] --type shape --prop text="02" \
  --prop x=2cm --prop y=4cm --prop width=29.87cm --prop height=8cm \
  --prop font=Georgia --prop size=120 --prop bold=true \
  --prop color=FFFFFF --prop align=center --prop fill=none --prop opacity=0.15

# 第2步：左侧装饰色条（可选）— 装饰元素，在底层
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=rect --prop fill=FFFFFF --prop opacity=0.2 \
  --prop x=0cm --prop y=7cm --prop width=6cm --prop height=0.4cm --prop line=none

# 第3步：标题文字 — 最后添加，自动在最上层，y 建议 7–10cm
officecli add slides.pptx /slide[N] --type shape --prop text="Financial Performance" \
  --prop x=2cm --prop y=7.5cm --prop width=29.87cm --prop height=3cm \
  --prop font=Georgia --prop size=40 --prop bold=true \
  --prop color=FFFFFF --prop align=center --prop fill=none

# 第4步：副标题（可选）
officecli add slides.pptx /slide[N] --type shape --prop text="Section 2 of 4" \
  --prop x=2cm --prop y=11cm --prop width=29.87cm --prop height=1.5cm \
  --prop font=Calibri --prop size=16 --prop color=CADCFC --prop align=center --prop fill=none
```

**事后检查（如遇覆盖问题）：**
```bash
# 将装饰元素压到最底层
officecli set slides.pptx "/slide[N]/shape[1]" --prop zorder=back
# 将文字拉到最顶层
officecli set slides.pptx "/slide[N]/shape[3]" --prop zorder=front
# 注意：zorder 操作后 shape index 会重新编号，须重新 get --depth 1 再操作
officecli get slides.pptx '/slide[N]' --depth 1
```

---

### Recipe 2：KPI Box — 数字/文字溢出 box 边界

**问题根因：** KPI 数字字号过大，超出 box 的 height 或 width 范围；或 box 尺寸未为数字字号留足空间。

**字号安全公式：**
- `推荐最大字号(pt) ≤ box_width_cm × 字符数分母`
  - 1–2 个字符（如 "94%"）：`box_width_cm × 10` pt 为上限，建议用 60–72pt
  - 3–4 个字符（如 "1.2M"）：`box_width_cm × 7` pt 为上限，建议用 48–56pt
  - 5+ 个字符：`box_width_cm × 5` pt 为上限，建议用 36–44pt
- `box height ≥ 字号(cm) × 1.5`（字号 1pt ≈ 0.0353cm；64pt ≈ 2.26cm，则 height ≥ 3.4cm）

**验证规则（必做）：** 每个 KPI box 创建后，用 `officecli view annotated` 确认无溢出。

```bash
# KPI box 安全模板（以 9cm 宽 box、3字符数字为例）
# 9cm 宽 × 3 字符 → 最大字号约 9×7=63pt → 使用 60pt
# box height ≥ 60pt × 0.0353cm × 1.5 ≈ 3.2cm → 设为 4cm（留余量）

officecli add slides.pptx /slide[N] --type shape \
  --prop text="94%" \
  --prop x=2cm --prop y=5cm \
  --prop width=9cm --prop height=4cm \
  --prop font=Georgia --prop size=60 --prop bold=true \
  --prop color=CADCFC --prop align=center --prop valign=center --prop fill=none

# sublabel（KPI 说明标注，≤5 词，允许 < 16pt）
officecli add slides.pptx /slide[N] --type shape \
  --prop text="Customer Retention" \
  --prop x=2cm --prop y=9.2cm \
  --prop width=9cm --prop height=1.5cm \
  --prop font=Calibri --prop size=13 --prop color=8899BB --prop align=center --prop fill=none
```

**溢出修复流程：**
1. 发现溢出 → 先缩小字号（每次减 4pt，重新检查）
2. 字号已足够小但仍溢出 → 扩大 box `height`（y 值相应上移）
3. 不得缩短数字本身（"$1.2M" 不能改成 "$1M" 只为字号合规）

```bash
# 验证命令
officecli view slides.pptx annotated
# 检查每个 KPI shape 的 y+height 是否 ≤ 19.05cm
officecli get slides.pptx '/slide[N]/shape[M]'
```

---

### Recipe 3：Timeline — 最后节点孤立（间距不均匀）

**问题根因：** 直接将最后节点 x 设为 `slide_width - right_margin` 时，浮点精度差异导致其与相邻节点间距偏大，视觉上"孤立"。

**均匀间距公式：**
```
left_margin   = 2cm（或按设计）
right_margin  = 2cm（或按设计）
circle_width  = 节点圆的宽度（例如 3cm）

# CRITICAL: usable_width 必须减去 circle_width，否则最后节点右边界会溢出幻灯片
usable_width = slide_width - left_margin - right_margin - circle_width
             = 33.87 - 2 - 2 - 3 = 26.87cm（标准 16:9，circle_width=3cm）

node_spacing = usable_width / (N - 1)   # N = 节点总数

node_x[i]   = left_margin + node_spacing × i   # i = 0, 1, ..., N-1
```

> **为什么减 circle_width？** `node_x[i]` 是圆的**左边 x**，最后节点右边界 = `node_x[N-1] + circle_width`。不减的话右边界会超出幻灯片边缘（33.87cm），导致 P1 截断错误。

**示例（4 节点，节圆宽 3cm）：**
```
usable_width = 33.87 - 2 - 2 - 3 = 26.87cm
node_spacing = 26.87 / 3 ≈ 8.957cm

node_x[0] = 2cm              → circle x=2cm,     右边 5cm    ✓
node_x[1] = 2 + 8.957      = 10.957cm → circle x=10.96cm,   右边 13.96cm  ✓
node_x[2] = 2 + 8.957×2    = 19.914cm → circle x=19.91cm,   右边 22.91cm  ✓
node_x[3] = 2 + 8.957×3    = 28.87cm  → circle x=28.87cm,   右边 31.87cm  ✓ (< 33.87)
```

```bash
# 4 节点均匀时间轴示例（node_spacing ≈ 8.957cm，圆宽 3cm，usable_width=26.87cm）
# 水平基准线（从第一节点圆心到最后节点圆心）
officecli add slides.pptx /slide[N] --type connector \
  --prop x=3.5cm --prop y=10cm --prop width=27.87cm --prop height=0 \
  --prop line=CADCFC --prop lineWidth=2pt

# 节点 1（i=0）  x = 2cm，右边 5cm ✓
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=1E2761 \
  --prop x=2cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q1" \
  --prop x=2cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=FFFFFF --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center

# 节点 2（i=1）  x = 2 + 8.957 = 10.957cm → 取 10.96cm，右边 13.96cm ✓
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=CADCFC \
  --prop x=10.96cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q2" \
  --prop x=10.96cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=1E2761 --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center

# 节点 3（i=2）  x = 2 + 8.957×2 = 19.914cm → 取 19.91cm，右边 22.91cm ✓
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=1E2761 \
  --prop x=19.91cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q3" \
  --prop x=19.91cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=FFFFFF --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center

# 节点 4（i=3）  x = 2 + 8.957×3 = 28.871cm → 取 28.87cm，右边 31.87cm ✓ (< 33.87)
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=CADCFC \
  --prop x=28.87cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q4" \
  --prop x=28.87cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=1E2761 --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center
```

**验证命令：** 创建时间轴后，检查各节点 x 坐标是否均匀分布：
```bash
officecli view slides.pptx annotated
# 或逐节点检查
officecli get slides.pptx '/slide[N]' --depth 1
# 手动验证相邻节点的 x 差值是否一致（允许 ±0.05cm 误差）
```

如发现最后节点孤立：计算实际间距（`x[N-1] - x[N-2]` vs `x[1] - x[0]`），用均匀间距公式重新设置最后节点的 x 坐标：
```bash
officecli set slides.pptx "/slide[N]/shape[M]" --prop x=31.87cm
```

---

## Performance: Resident Mode

**Always use `open`/`close` — it is the smart default, not a special-case optimization.** Every command benefits: no repeated file I/O, no repeated parse/serialize cycles.

```bash
officecli open slides.pptx        # Load once into memory
officecli add slides.pptx ...     # All commands run in memory — fast
officecli set slides.pptx ...
officecli close slides.pptx       # Write once to disk
```

Use this pattern for every presentation build, regardless of command count.

## Performance: Batch Mode

Batch is a separate, independent mechanism — use it to collapse many operations into one API call:

```bash
# ⚠️ zsh 注意：batch 模式中 JSON path 字段（如 "/slide[1]"）已包含引号，无需额外处理。
# 但在非 batch 的直接命令中，路径参数 /slide[1] 必须加引号，否则 zsh 报错。
cat <<'EOF' | officecli batch slides.pptx
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Title","x":"2cm","y":"2cm","width":"20cm","height":"3cm","size":"36","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Body text","x":"2cm","y":"6cm","width":"20cm","height":"10cm","size":"16"}}
]
EOF
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `view`, `raw`, `raw-set`, `validate`.

**Batch and resident mode are independent.** Each improves performance on its own. They can be combined, but batch alone (without `open`) already handles the file I/O in one cycle per batch call.

Batch fields: `command`, `path`, `parent`, `type`, `from`, `to`, `index`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

`parent` = container to add into (for `add`, including clone via `from` field). `path` = element to modify (for `set`, `get`, `remove`, `move`).

---

## Known Issues

| Issue | Workaround |
|---|---|
| **Chart series cannot be added after creation**: `set --prop data=` and `set --prop seriesN=` on an existing chart can only update existing series -- they cannot add new series. The series count is fixed at creation time. | Include all series in the `add` command (using `series1`+`series2` props or the `data` prop). Both forms work reliably in single commands and in batch mode. If you need to add series to an existing chart, delete it and recreate: `officecli remove file.pptx "/slide[N]/chart[M]"` then `officecli add` with all series. See creating.md "Multi-Series Column Chart" and editing.md "Update Charts". |
| **Chart schema validation warning**: Some modern chart styling combinations produce a `ChartShapeProperties` schema warning from `officecli validate`. This does not affect PowerPoint rendering. | Ignore the warning if the chart opens correctly in PowerPoint. |
| **Table font cascade overwritten by row set**: Setting `size`/`font` on the table path and then setting row content with `set tr[N]` resets font properties on that row to defaults. | Set table-level `size`/`font` **after** all row content is populated, or include `size`/`font` in each row-level `set` command. |
| **Shell quoting in batch with `echo`**: `echo '...' \| officecli batch` fails when JSON values contain apostrophes or `$` characters (common in English text and currency). | Use a heredoc instead: `cat <<'EOF' \| officecli batch file.pptx` ... `EOF`. The single-quoted heredoc delimiter prevents all shell interpolation. |
| **Batch intermittent failure**: Approximately 1-in-15 batch operations may fail with "Failed to send to resident" when using batch mode with resident mode (`open`/`close`). | Retry the failed batch command. If the error persists, close and re-open the file: `officecli close file.pptx && officecli open file.pptx`, then retry. For critical workflows, consider splitting large batch arrays into smaller chunks (10-15 operations each). |
| **Table cell solidFill schema warning**: Setting `color` on table cell run properties may produce `solidFill` schema validation errors. The table renders correctly in PowerPoint. | Ignore if the table opens correctly. Alternatively, set text color at the row level (`set tr[N] --prop color=HEX`) instead of the cell level. |
| **Multi-series chart rendering in SVG/screenshot**: SVG and screenshot renders may show fewer series than actually exist in the chart data. The chart data is correct but the rendering engine does not always display all series visually. | Verify multi-series charts by opening the .pptx in PowerPoint or by using `get /slide[N]/chart[M]` to confirm all series are present in the data. Do not rely solely on SVG/screenshot visual QA for multi-series verification. |
| **Slide titles show as "(untitled)" in `view outline` / `view issues`**: When using `layout=blank` (the recommended approach for custom designs), all titles are added as plain text boxes — not as PPTX title placeholder elements. As a result, `view outline` and `view issues` report "(untitled)" for every slide, and screen reader outline navigation will not find slide titles. This is **expected behavior** for blank-layout decks. Evaluators and testers should not flag this as a defect when the deck uses `layout=blank`. If outline-compatible titles are required, use `officecli set deck.pptx "/slide[N]/placeholder[title]" --prop text="Title"` to set the PPTX title placeholder — but note this requires a layout that includes a title placeholder (i.e., not `layout=blank`). |

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
