# Blog Writer — Content Engine

## Content Type

Full-lifecycle blog content optimized for both Google rankings (December 2025 Core Update, E-E-A-T) and AI citation platforms (ChatGPT, Perplexity, Google AI Overviews, Gemini).

Supports 12 content types via templates: how-to guide, listicle, case study, comparison, pillar page, product review, thought leadership, roundup, tutorial, news analysis, data research, FAQ knowledge base.

## Target Audiences

- Software engineers and technical leaders
- Product managers and startup founders
- Technology enthusiasts following industry trends
- Content marketers and SEO practitioners

Adjust tone and depth based on the specific topic. Technical deep-dives assume practitioner knowledge. Thought leadership pieces are accessible to broader audiences.

## Workspace Structure

```
blog/
  [post-slug]/
    idea.md         Raw ideas, references, inspiration, user notes
    brief.md        Strategy brief (audience, angle, goals, template)
    outline.md      Structured outline with research directive
    research.md     Sourced facts, quotes, case studies, images
    draft.md        Current working draft
    post.md         Final published article
    meta.json       SEO metadata (title, slug, excerpt, keywords, category, template)
    assets/         Images, diagrams, visual assets
      diagrams/     Mermaid (.mmd), SVG (.svg), ASCII (.txt) files
      images/       Image generation prompts (.prompt.md)
```

For a series, use numbered posts in the same directory: `post-1.md`, `post-2.md`, etc.

### Content Categories

Category is stored in `meta.json`, not in the directory path.

- **pillar** — Comprehensive, evergreen guides (3,000-5,000 words)
- **edge** — Timely, opinionated takes on emerging trends (1,500-3,000 words)
- **deep-dive** — Technical explorations of specific tools or patterns (2,000-4,000 words)
- **tutorial** — Step-by-step how-to articles with code examples (2,000-3,500 words)

## Content Standards

### The 6 Pillars of Dual Optimization

| Pillar | Implementation |
|--------|---------------|
| Answer-First Formatting | Every H2 opens with 40-60 word stat-rich paragraph |
| Real Sourced Data | Tier 1-3 sources only, inline attribution |
| Visual Media | Pixabay/Unsplash images + SVG chart generation |
| FAQ Schema | Structured FAQ with 40-60 word answers |
| Content Structure | 50-150 word chunks, question headings, proper H hierarchy |
| Freshness Signals | Updated within 30 days, dateModified schema |

### Hard Rules

- Every factual claim must be backed by a sourced statistic from tier 1-3 sources
- No generic openings ("In today's rapidly evolving..."), no filler transitions, no summary conclusions
- Visuals communicate information — never decorative
- Primary keyword appears in title, first paragraph, one H2, and meta description
- Bold key terms on first mention, blockquotes for expert quotes with attribution
- No paragraph exceeds 150 words
- Heading hierarchy never skips levels (H1 → H2 → H3)
- Maximum 1 brand mention per article

## Agents

| Agent | Role | When Used |
|-------|------|-----------|
| `blog-researcher` | Finds statistics, sources, images, competitive data | Research phase |
| `blog-writer` | Writes optimized blog content | Writing phase |
| `blog-seo` | Validates on-page SEO post-writing | Optimization phase |
| `blog-reviewer` | Runs 100-point quality scoring | Review phase |

## Quality Scoring (100 Points)

| Category | Points |
|----------|--------|
| Content Quality | 30 |
| SEO Optimization | 25 |
| E-E-A-T Signals | 15 |
| Technical Elements | 15 |
| AI Citation Readiness | 15 |

Scoring bands: Exceptional (90-100), Strong (80-89), Acceptable (70-79), Below Standard (60-69), Rewrite (<60).

## Scripts

- `scripts/analyze_blog.py` — Python quality analyzer implementing the 5-category, 100-point scoring system. Run with: `python3 scripts/analyze_blog.py <file> [--format markdown|json|table]`
