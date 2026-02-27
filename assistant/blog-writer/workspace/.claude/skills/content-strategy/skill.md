# Content Strategy Skill

## What This Skill Does

Transforms a vague blog idea into a sharp, differentiated content strategy with audience definition, SEO blueprint, tone guidelines, template selection, and a structured outline optimized for both Google rankings and AI citation platforms.

## Where to Save

Follow the workspace structure in `CLAUDE.md`. Save artifacts to the post directory:

- `blog/[post-slug]/brief.md` — Strategy brief
- `blog/[post-slug]/outline.md` — Structured outline with research directive

The post-slug will be provided by the orchestrator.

## Output Artifacts

### 1. Strategy Brief (`brief.md`)

```markdown
## Target Audience
Who this article is for — demographics, role, pain points, reading context.

## Content Angle
The unique perspective that differentiates this article from the dozens already written on this topic.

## Template
Selected template (how-to-guide, listicle, case-study, comparison, pillar-page, product-review, thought-leadership, roundup, tutorial, news-analysis, data-research, faq-knowledge) and why.

## SEO Blueprint
- Primary keyword: [exact phrase]
- Secondary keywords: [3-5 phrases]
- Search intent: [informational / commercial / navigational]
- Target word count: [range based on template]
- Target Flesch score: 60-70

## Tone & Voice
Writing style directive — one of: technical-authority, conversational-expert, narrative-storyteller, practical-guide, analytical-observer. Specific voice characteristics.

## Title Options
1. [Option A — SEO-optimized, 40-60 chars, front-loaded keyword, power word]
2. [Option B — curiosity-driven]
3. [Option C — direct value proposition]
Recommended: [which and why]

## Distribution Plan
Primary channels and repurposing opportunities for this content.
```

### 2. Structured Outline with Research Directive (`outline.md`)

```markdown
# [Working Title]

## Introduction
- Hook: [specific opening approach — statistic or provocative claim]
- Problem/context: [what the reader is dealing with]
- Promise: [what they'll gain by reading]
- TL;DR placement

## Section 1: [Title — phrased as question where appropriate]
- Key point: [...]
- Answer-first paragraph direction: [stat + direct answer needed]
- Supporting evidence needed: [what the researcher should find]
- Visual opportunity: [chart/diagram/image suggestion]
- Subsections: [...]

## Section N: [Title]
[same structure]

## FAQ Section
- Q1: [anticipated question]
- Q2: [anticipated question]
- Q3: [anticipated question]

## Conclusion
- Key takeaway: [...]
- Call to action: [...]
- Loop back to opening

## Visual Opportunities
- [Where diagrams, charts, or illustrations would strengthen the article]

---

## Research Directive
Specific instructions for what the research phase needs to find: facts, statistics, case studies, expert opinions, competitive examples, and images — organized by outline section. Include image density target based on template type.
```

## Methodology

- **Angle over topic.** "AI in healthcare" is a topic. "Why radiologists should stop fearing AI and start fearing their EMR vendor" is an angle. Always find the angle.
- **Audience precision.** "Developers" is not an audience. "Senior backend engineers evaluating event-driven architecture" is an audience. The more specific, the sharper the writing.
- **Structure is persuasion.** The outline is the argument's architecture. Each section should create a question that the next section answers.
- **SEO is a constraint, not the goal.** Optimize for search without writing for robots. Primary keyword appears naturally, not stuffed.
- **Visual thinking.** Identify where a diagram, chart, or illustration communicates faster than prose.
- **Template selection.** Match the content type to the right template. A comparison piece uses a different structure than a tutorial.
- **Dual optimization.** Every section must work for both human readers (engaging, well-structured) and AI extraction (answer-first, self-contained passages, FAQ schema).

## Anti-Patterns

- Generic outlines: "Introduction > What is X > Benefits of X > How to use X > Conclusion" — template, not strategy
- Keyword-first thinking: building the article around a keyword instead of an insight
- Audience-of-everyone: if the article is for everyone, it's for no one
- Title bait: clickbait titles that the content can't deliver on
- Section bloat: more than 6-8 main sections means the article is unfocused
- Missing FAQ: every article needs a FAQ section for AI citation readiness
