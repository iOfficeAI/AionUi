# Content Strategy Skill

## What This Skill Does

Transforms a vague blog idea into a sharp, differentiated content strategy with audience definition, SEO blueprint, tone guidelines, and a structured outline.

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

## SEO Blueprint
- Primary keyword: [exact phrase]
- Secondary keywords: [3-5 phrases]
- Search intent: [informational / commercial / navigational]
- Target word count: [range]

## Tone & Voice
Writing style directive — formal/conversational/technical/narrative. Specific voice characteristics.

## Title Options
1. [Option A — SEO-optimized]
2. [Option B — curiosity-driven]
3. [Option C — direct value proposition]
Recommended: [which and why]
```

### 2. Structured Outline with Research Directive (`outline.md`)

```markdown
# [Working Title]

## Introduction
- Hook: [specific opening approach]
- Problem/context: [what the reader is dealing with]
- Promise: [what they'll gain by reading]

## Section 1: [Title]
- Key point: [...]
- Supporting evidence needed: [what the researcher should find]
- Subsections: [...]

## Section N: [Title]
[same structure]

## Conclusion
- Key takeaway: [...]
- Call to action: [...]

## Visual Opportunities
- [Where diagrams, charts, or illustrations would strengthen the article]

---

## Research Directive
Specific instructions for what the research phase needs to find: facts, statistics, case studies, expert opinions, and competitive examples — organized by outline section.
```

## Methodology

- **Angle over topic.** "AI in healthcare" is a topic. "Why radiologists should stop fearing AI and start fearing their EMR vendor" is an angle. Always find the angle.
- **Audience precision.** "Developers" is not an audience. "Senior backend engineers evaluating event-driven architecture" is an audience. The more specific, the sharper the writing.
- **Structure is persuasion.** The outline is the argument's architecture. Each section should create a question that the next section answers.
- **SEO is a constraint, not the goal.** Optimize for search without writing for robots. Primary keyword appears naturally, not stuffed.
- **Visual thinking.** Identify where a diagram, chart, or illustration communicates faster than prose.

## Anti-Patterns

- Generic outlines: "Introduction > What is X > Benefits of X > How to use X > Conclusion" — template, not strategy
- Keyword-first thinking: building the article around a keyword instead of an insight
- Audience-of-everyone: if the article is for everyone, it's for no one
- Title bait: clickbait titles that the content can't deliver on
- Section bloat: more than 6-8 main sections means the article is unfocused
