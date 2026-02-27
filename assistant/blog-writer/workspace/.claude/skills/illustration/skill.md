# Illustration Skill

## What This Skill Does

Enhances a written article with visual assets — Mermaid diagrams, ASCII art, SVG illustrations, inline SVG charts, and image generation prompts — replacing placeholder markers with actual visuals.

## Where to Save

Follow the workspace structure in `CLAUDE.md`. Save artifacts to the post directory:

- `blog/[post-slug]/post.md` — Final illustrated article
- `blog/[post-slug]/meta.json` — SEO + illustration metadata
- `blog/[post-slug]/assets/diagrams/` — Mermaid (.mmd), SVG (.svg), ASCII (.txt) files
- `blog/[post-slug]/assets/images/` — Image generation prompts (.prompt.md)

The post-slug will be provided by the orchestrator. Read `draft.md` from the same post directory.

## Output Artifacts

### 1. Final Article (`post.md`)

The complete article with all `<!-- ILLUSTRATION: ... -->`, `[IMAGE: ...]`, and `[CHART: ...]` markers replaced by actual visual content embedded inline. Mermaid diagrams in fenced code blocks, SVG inline, image prompts as comments.

### 2. Metadata (`meta.json`)

```json
{
  "title": "...",
  "slug": "...",
  "excerpt": "...",
  "keywords": ["..."],
  "wordCount": 0,
  "readTime": "X min",
  "category": "pillar | edge | deep-dive | tutorial",
  "template": "how-to-guide | listicle | case-study | comparison | pillar-page | product-review | thought-leadership | roundup | tutorial | news-analysis | data-research | faq-knowledge",
  "illustrations": [
    { "type": "mermaid", "file": "assets/diagrams/pipeline.mmd", "description": "..." },
    { "type": "svg-chart", "file": "assets/diagrams/chart.svg", "description": "..." },
    { "type": "image-prompt", "file": "assets/images/hero.prompt.md", "description": "..." }
  ],
  "createdAt": "ISO date"
}
```

### 3. Asset Files (`assets/`)

Save each visual as a standalone file alongside embedding it in `post.md`:
- Mermaid diagrams: `assets/diagrams/[name].mmd`
- SVG charts/illustrations: `assets/diagrams/[name].svg`
- ASCII art: `assets/diagrams/[name].txt`
- Image prompts: `assets/images/[name].prompt.md`

## Visual Types

### Mermaid Diagrams
**Best for:** processes, workflows, architectures, sequences, comparisons
**When:** article describes a process, system architecture, decision tree, or timeline

### SVG Data Charts
**Best for:** bar charts, grouped bar, lollipop, donut, line, area, radar
**When:** article contains data that benefits from visualization
**Rules:**
- Each chart in an article must be a different type (no duplicates)
- Dark-mode friendly styling (use CSS custom properties)
- Include source attribution below chart
- Responsive viewBox, no fixed dimensions

### ASCII Art
**Best for:** developer audiences, terminal-themed content, lightweight diagrams
**When:** targeting developers and the visual is simple enough for ASCII

### SVG Illustrations
**Best for:** inline graphics, icons, visual metaphors
**When:** lightweight, scalable visual needed without external dependencies

### Image Generation Prompts
**Best for:** hero images, concept art, editorial photography, social cards
**Format:**
```
<!-- IMAGE: A flat illustration of [detailed description].
Style: [art style, colors]. Dimensions: 1200x630 -->
```

## Principles

- **Visuals communicate, not decorate.** Every illustration must convey information that text handles poorly. If text already explains it clearly, a visual is redundant.
- **Match the article's tone.** Technical deep-dive gets clean diagrams. Thought leadership gets conceptual illustrations. Tutorial gets step-by-step flows.
- **Mermaid is the primary tool.** Renders natively in most Markdown environments.
- **Chart diversity required.** Never use the same chart type twice in one article.
- **Less is more.** 3-5 well-placed visuals > 10 scattered ones.

## Anti-Patterns

- **Diagram for everything** — not every section needs a visual
- **Overly complex Mermaid** — 20+ nodes is unreadable; simplify or split
- **Decorative illustrations** — stock-photo-feeling visuals with zero information
- **Inconsistent style** — mixing playful ASCII with formal SVG in the same article
- **Breaking the reading flow** — visuals at natural pause points, not mid-argument
- **Duplicate chart types** — each chart must use a different visualization type
