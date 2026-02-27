# Domain Research Skill

## What This Skill Does

Investigates a topic to produce sourced facts, expert quotes, case studies, counter-arguments, competitive analysis, and image assets — organized by the article outline's sections. Applies source tier verification and image URL validation.

## Where to Save

Follow the workspace structure in `CLAUDE.md`. Save artifacts to the post directory:

- `blog/[post-slug]/research.md` — Research brief with source references, organized by outline section

The post-slug will be provided by the orchestrator.

## Output Artifacts

### 1. Research Brief (`research.md`)

```markdown
## Research Brief for: [Article Title]

### Statistics Found ([N] total)

| # | Statistic | Source | URL | Date | Tier | Verified |
|---|-----------|--------|-----|------|------|----------|
| 1 | [value] | [source] | [url] | [date] | [1-3] | Yes/No |

### Images Found ([N] total)

| # | Platform | URL | Alt Text | Topic Relevance | Verified |
|---|----------|-----|----------|----------------|----------|
| 1 | Pixabay | [cdn-url] | [descriptive sentence] | [relevance] | Yes/No |

### Expert Insights & Quotes
- "[Quote]" — [Person, Title, Context]
- [...]

### Case Studies & Examples

#### [Case Study 1 Title]
- Company/Project: [...]
- Context: [...]
- Key outcome: [...]
- Relevance to article: [...]

#### [Case Study 2 Title]
[same structure]

### Competitive Analysis

| Competitor | Word Count | Images | Charts | Freshness | Gap |
|-----------|-----------|--------|--------|-----------|-----|
| [url] | ~[N] | [N] | [N] | [date] | [gap] |

### Counter-Arguments & Nuances
- [Potential objections a reader might raise]
- [Balanced perspectives to address]

### Section-Specific Research

#### For Section: [Section Title from Outline]
- [Relevant data points]
- [Examples to use]
- [Recommended framing]
- [Image/chart suggestions]

[Repeat for each section]

### Recommended Chart Data
[2-4 data sets suitable for visualization with chart type suggestions]
```

Include a `## Sources` section at the end of `research.md` with all references.

## Source Tier System

- **Tier 1**: Google Search Central, .gov, .edu, W3C, international organizations
- **Tier 2**: Ahrefs, SparkToro, Seer Interactive, BrightEdge, Semrush, academic papers
- **Tier 3**: Search Engine Land, SEJ, The Verge, Wired, TechCrunch
- **Tier 4-5 (REJECT)**: Generic SEO blogs, affiliate sites, content mills, unsourced roundups

## Image Sourcing

1. Search Pixabay first: `site:pixabay.com [topic keywords]`
2. Fallback to Unsplash: `site:unsplash.com [topic keywords]`
3. Fallback to Pexels: `site:pexels.com [topic keywords]`
4. Extract direct CDN URLs (not page URLs)
5. Verify each URL resolves (HTTP 200)
6. Write descriptive alt text sentences

### Image Density Targets

| Content Type | Image per N Words |
|-------------|-------------------|
| Listicle | 1 per 133 words |
| How-to guide | 1 per 179 words |
| Long-form/pillar | 1 per 200-250 words |
| Case study | 1 per 307 words |

## Methodology

- **Specificity wins.** "Studies show" is worthless. "A 2025 McKinsey survey of 1,200 CTOs found that 67% plan to..." is evidence. Always include source, date, and sample size.
- **Recency matters.** Data from 2019 is ancient in fast-moving fields. Prioritize last 2 years. Flag older data explicitly.
- **Counter-arguments are assets.** Find the strongest objection to the article's thesis. The writer can then address it, making the argument stronger.
- **Original examples over cliches.** If every article uses Netflix/Uber/Airbnb, find different ones. Lesser-known case studies are more credible and interesting.
- **Research serves the outline.** Organize findings by the sections from the outline. Don't dump facts — map them to where they'll be used.

## Research Process

1. **Parse the directive** — understand what each section needs
2. **Search for data** — statistics, surveys, research papers, industry reports (2025-2026 priority)
3. **Verify sources** — check tier, check methodology, check original source
4. **Find voices** — expert quotes, thought leader opinions, practitioner insights
5. **Gather examples** — case studies, real implementations, success/failure stories
6. **Find images** — Pixabay/Unsplash/Pexels with CDN URL verification
7. **Check the other side** — counter-arguments, limitations, risks
8. **Organize by section** — map every finding to the outline structure
9. **Assess confidence** — flag where data is strong vs. thin

## Red Flags (Reject These Sources)

- Round numbers without methodology
- No named source or link
- Source is a content mill or SEO blog (non-research)
- Statistic only appears on one low-authority site
- Number feels suspiciously precise for a broad claim

## Anti-Patterns

- **Confirmation bias** — only finding data that supports the predetermined angle
- **Outdated sources** — citing research from 5+ years ago in a fast-moving field
- **Unsourced claims** — "experts say" without naming who
- **Example fatigue** — using the same overused case studies everyone else uses
- **Data dumps** — providing raw information without organizing it for the writer's needs
- **Unverified images** — using page URLs instead of direct CDN image URLs
