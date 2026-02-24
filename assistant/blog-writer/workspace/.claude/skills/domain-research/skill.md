# Domain Research Skill

## What This Skill Does

Investigates a topic to produce sourced facts, expert quotes, case studies, counter-arguments, and competitive analysis — organized by the article outline's sections.

## Where to Save

Follow the workspace structure in `CLAUDE.md`. Save artifacts to the post directory:

- `blog/[post-slug]/research.md` — Research brief with source references, organized by outline section

The post-slug will be provided by the orchestrator.

## Output Artifacts

### 1. Research Brief (`research.md`)

```markdown
## Research Brief for: [Article Title]

### Key Facts & Statistics
- [Fact 1 — source, year, sample size if available]
- [Fact 2 — source, year]
- [...]

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

### Competitive Landscape
- [What other articles on this topic say]
- [Common arguments made]
- [Gaps our article can fill]

### Counter-Arguments & Nuances
- [Potential objections a reader might raise]
- [Balanced perspectives to address]

### Section-Specific Research

#### For Section: [Section Title from Outline]
- [Relevant data points]
- [Examples to use]
- [Recommended framing]

[Repeat for each section]
```

Include a `## Sources` section at the end of `research.md` with all references.

## Methodology

- **Specificity wins.** "Studies show" is worthless. "A 2025 McKinsey survey of 1,200 CTOs found that 67% plan to..." is evidence. Always include source, date, and sample size.
- **Recency matters.** Data from 2019 is ancient in fast-moving fields. Prioritize last 2 years. Flag older data explicitly.
- **Counter-arguments are assets.** Find the strongest objection to the article's thesis. The writer can then address it, making the argument stronger.
- **Original examples over cliches.** If every article uses Netflix/Uber/Airbnb, find different ones. Lesser-known case studies are more credible and interesting.
- **Research serves the outline.** Organize findings by the sections from the outline. Don't dump facts — map them to where they'll be used.

## Research Process

1. **Parse the directive** — understand what each section needs
2. **Search for data** — statistics, surveys, research papers, industry reports
3. **Find voices** — expert quotes, thought leader opinions, practitioner insights
4. **Gather examples** — case studies, real implementations, success/failure stories
5. **Check the other side** — counter-arguments, limitations, risks
6. **Organize by section** — map every finding to the outline structure
7. **Assess confidence** — flag where data is strong vs. thin

## Anti-Patterns

- **Confirmation bias** — only finding data that supports the predetermined angle
- **Outdated sources** — citing research from 5+ years ago in a fast-moving field
- **Unsourced claims** — "experts say" without naming who
- **Example fatigue** — using the same overused case studies everyone else uses
- **Data dumps** — providing raw information without organizing it for the writer's needs
