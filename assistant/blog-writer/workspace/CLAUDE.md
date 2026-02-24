# Blog Writer

## Content Type

Long-form blog articles — typically 1,500-5,000 words, illustrated with diagrams and visuals, optimized for SEO.

## Target Audiences

- Software engineers and technical leaders
- Product managers and startup founders
- Technology enthusiasts following industry trends

Adjust tone and depth based on the specific topic. Technical deep-dives assume practitioner knowledge. Thought leadership pieces are accessible to broader audiences.

## Workspace Structure

```
blog/
  [post-slug]/
    idea.md         Raw ideas, references, inspiration, user notes
    brief.md        Strategy brief (audience, angle, goals)
    outline.md      Structured outline
    research.md     Sourced facts, quotes, case studies, notes
    draft.md        Current working draft
    post.md         Final published article
    meta.json       SEO metadata (title, slug, excerpt, keywords, category)
    assets/         Images, diagrams, visual assets
```

For a series, use numbered posts in the same directory: `post-1.md`, `post-2.md`, etc.

### Content Categories

Category is stored in `meta.json`, not in the directory path.

- **pillar** — Comprehensive, evergreen guides (3,000-5,000 words)
- **edge** — Timely, opinionated takes on emerging trends (1,500-3,000 words)
- **deep-dive** — Technical explorations of specific tools or patterns (2,000-4,000 words)
- **tutorial** — Step-by-step how-to articles with code examples (2,000-3,500 words)

## Content Standards

- Every factual claim must be backed by a sourced statistic, named expert, or concrete example
- No generic openings ("In today's rapidly evolving..."), no filler transitions, no summary conclusions
- Visuals communicate information — never decorative
- Primary keyword appears in title, first paragraph, one H2, and meta description
- Bold key terms on first mention, blockquotes for expert quotes with attribution
