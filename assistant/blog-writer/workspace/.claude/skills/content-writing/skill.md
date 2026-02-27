# Content Writing Skill

## What This Skill Does

Synthesizes a content strategy and research brief into a complete, publication-ready
article with answer-first formatting, proper heading hierarchy, sourced statistics,
and natural readability. Follows the 6 pillars of dual optimization.

## Where to Save

Follow the workspace structure in `CLAUDE.md`. Save artifacts to the post directory:

- `blog/[post-slug]/draft.md` — Complete article draft

The post-slug will be provided by the orchestrator. Read `brief.md`, `outline.md`, and `research.md` from the same post directory.

## Writing Rules (Non-Negotiable)

### Answer-First Formatting
Every H2 section opens with a 40-60 word paragraph containing:
- At least one specific statistic with source attribution
- A direct answer to the heading's implied question

### Paragraph Discipline
- Target: 40-80 words per paragraph
- Hard limit: Never exceed 150 words
- Start each paragraph with the most important sentence
- One idea per paragraph

### Sentence Discipline
- Target: 15-20 words per sentence
- Vary sentence length for rhythm
- Active voice preferred
- Natural, conversational tone

### Heading Rules
- One H1 (title only)
- H2s for main sections (60-70% as questions)
- H3s for subsections — never skip levels
- Include primary keyword naturally in 2-3 headings

### Citation Rules
- Every statistic must have a named source
- Inline format: `([Source Name](url), year)`
- Tier 1-3 sources only
- Minimum 8 unique statistics per 2,000-word post

### Self-Promotion
- Maximum 1 brand mention (author bio context only)
- No promotional language
- Educational tone throughout

## Output Artifacts

### 1. Article Draft (`draft.md`)

A fully written article following the outline structure, with:
- Hook in the first paragraph (statistic-backed)
- Answer-first paragraph at each H2
- `<!-- ILLUSTRATION: description -->` markers at natural visual pause points
- `[IMAGE: Description — search terms]` markers for images
- `[CHART: Chart type — data description — source]` markers for charts
- Conclusion that references the opening

### 2. SEO Metadata (included at the top of the draft as frontmatter)

```yaml
---
title: [Final title — 40-60 chars, front-loaded keyword, power word]
slug: [url-friendly-slug]
excerpt: [150-160 char meta description with 1 stat]
keywords: [comma-separated list]
word_count: [approximate]
read_time: [X min]
---
```

### 3. Illustration Brief (included at the end of the draft)

```markdown
---

## Illustration Brief

### 1. [Location in article]
- Suggested type: [diagram / chart / infographic / image-prompt]
- Data to visualize: [...]
- Tone/style: [...]

### 2. [Location in article]
[same structure]
```

## TL;DR Box Generation

After the introduction, generate a TL;DR box:
- 40-60 words, standalone summary
- Contains the post's key finding or recommendation
- Includes 1 statistic with source
- Self-contained: makes sense without reading the full post
- Format: `> **TL;DR:** [summary]`

## Information Gain Markers

When writing, embed original value using these markers:
- `[ORIGINAL DATA]`: Proprietary surveys, experiments, case study metrics
- `[PERSONAL EXPERIENCE]`: First-hand observations, lessons learned, process documentation
- `[UNIQUE INSIGHT]`: Analysis others haven't made, contrarian perspectives backed by data

At least 2-3 information gain markers should appear per post.

## Citation Capsule Generation

For each H2 section, generate a "citation capsule":
- 40-60 word self-contained passage
- Contains: specific claim + data point + source attribution
- Written so an AI system could quote it directly

## Internal Linking Zones

Mark zones where internal links should be placed:
- Introduction: link to related pillar content
- Each H2: link to supporting articles on subtopics
- FAQ: link to detailed content for deeper answers
- Conclusion: link to next logical content
- Format: `[INTERNAL-LINK: anchor text → target description]`

## FAQ Section

Write 3-5 FAQ items at the end:
- Question format headings (H3)
- 40-60 word answers with at least 1 statistic
- Self-contained answers that can be quoted by AI systems

## Writing Principles

- **Hook hard.** First paragraph determines if anyone reads the second. Open with a specific scenario, surprising fact, provocative question, or bold claim. Never open with a definition or platitude.
- **One idea per paragraph.** Readers scan. Each paragraph makes one point, supports it, moves on.
- **Show, then tell.** Lead with the example, story, or data — then explain what it means.
- **Earn every section.** If a section doesn't add new information, a new perspective, or new evidence, cut it.
- **Write for scanning.** Subheadings, bold key phrases, bullet lists, short paragraphs.
- **Close the loop.** Conclusion references the opening — question answered, scenario returned to.

## Anti-AI-Detection Patterns

- Vary sentence length deliberately (mix 8-word and 25-word sentences)
- Inject rhetorical questions every 200-300 words
- Use contractions naturally ("it's", "we've", "don't")
- Include hedging language: "in our experience", "we've found that"
- NEVER use: "in today's digital landscape", "it's important to note",
  "dive into", "game-changer", "navigate the landscape", "revolutionize",
  "seamlessly", "cutting-edge", "harness the power of", "leverage" (as verb)

## Quality Self-Check

Before returning content, verify:
- [ ] Every H2 opens with stat + source (40-60 words)
- [ ] No paragraph exceeds 150 words
- [ ] All statistics have named sources
- [ ] Heading hierarchy is clean (H1 → H2 → H3)
- [ ] 60-70% of H2s are questions
- [ ] Meta description is 150-160 chars with a stat
- [ ] Max 1 brand mention
- [ ] FAQ section with 3-5 items
- [ ] Natural, conversational tone throughout
- [ ] TL;DR box present after introduction
- [ ] 2-3 information gain markers used
- [ ] No known AI-detectable phrases
- [ ] Citation capsules in major sections
- [ ] Internal linking zones marked
- [ ] Every embedded image URL was verified by the researcher
- [ ] Image alt text is a full descriptive sentence

## Anti-Patterns

- **The Wikipedia opening** — "X is a technology/methodology/framework that..."
- **The everything article** — trying to cover every aspect instead of one sharp angle
- **Transition-less sections** — sections that feel like separate articles bolted together
- **Hedging language** — "It could be argued that perhaps..." — take a position
- **The summary conclusion** — "In this article, we covered..." — reward the reader with insight
- **Filler phrases** — "It's worth noting that", "At the end of the day" — cut them all
- **Passive voice overuse** — "The code was deployed" vs. "The team deployed the code"
