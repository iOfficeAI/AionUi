# Content Type Template Reference

Index and guide to the 12 content templates in `blog/templates/`. These
templates are structural blueprints that `/blog write` uses to generate
consistently optimized content. This reference explains when to use each
template, how the template system works, and how to customize it.

---

## Why Templates Matter

Templates enforce the structural patterns that drive both Google rankings
and AI citations. Without templates, content quality varies post to post,
optimization elements get forgotten, and writing takes longer.

| Benefit | Impact | How |
|---------|--------|-----|
| Consistent structure | 15-20% higher quality scores | Every post follows a proven section pattern |
| Faster writing | 40% reduction in drafting time | Writer focuses on content, not structure |
| Complete optimization | All scoring elements included | Answer-first, FAQ, visuals, citations built into skeleton |
| Predictable output | Scoring 75+ without additional passes | Template alignment maps directly to scoring categories |
| Reduced revision cycles | Fewer review rounds needed | Structure issues caught at outline stage, not in review |

A well-followed template naturally produces content that scores 75+ on the
quality scoring checklist (see `references/quality-scoring.md`). Templates
do not constrain creativity -- they ensure the structural foundations are
in place so the writer can focus on delivering unique value.

---

## Template Selection Guide

Use this table to select the right template based on content goals.

| Goal | Template | Best For | Word Count |
|------|----------|----------|------------|
| Teach a process | `how-to-guide` | Step-by-step tutorials, "How to X" queries | 2,000-2,500 |
| Rank for "best X" | `listicle` | Curated lists, "Best X for Y" queries | 1,500-2,000 |
| Build authority | `case-study` | Proving results with real metrics | 2,000-3,000 |
| Capture comparison traffic | `comparison` | "X vs Y" queries, tool evaluations | 1,500-2,000 |
| Dominate a topic | `pillar-page` | Comprehensive coverage, hub pages | 3,000-4,000 |
| Convert buyers | `product-review` | Bottom-of-funnel "is X worth it" queries | 1,500-2,500 |
| Thought leadership | `thought-leadership` | Industry opinion, predictions, analysis | 2,000-3,000 |
| Curate expertise | `roundup` | Expert quotes, multi-source collections | 2,000-2,500 |
| Technical audience | `tutorial` | Code walkthroughs, tool demos | 2,500-3,500 |
| Timely content | `news-analysis` | Event reactions, algorithm update coverage | 800-1,500 |
| Original research | `data-research` | Proprietary data, survey results, experiments | 2,500-3,500 |
| Answer questions | `faq-knowledge` | Knowledge base pages, Q&A reference content | 1,500-2,000 |

### Search Intent Mapping

| Search Intent | Recommended Templates |
|--------------|----------------------|
| Informational ("how to", "what is") | how-to-guide, tutorial, pillar-page |
| Commercial investigation ("best", "top", "vs") | listicle, comparison, product-review |
| Navigational (brand-specific) | product-review, case-study |
| Transactional ("buy", "pricing", "sign up") | product-review, comparison |

---

## Template Structure Anatomy

Every template follows a consistent internal structure using markers that
guide the writer (and `/blog write`) on what content each section needs.

### Section Markers

| Marker | Purpose | Example |
|--------|---------|---------|
| `[ANSWER-FIRST]` | Opening paragraph must be 40-60 words with a stat + source | "According to [Source], [stat]. This means [direct answer to heading question]." |
| `[VISUAL: chart-type]` | Place a chart of the specified type here | `[VISUAL: grouped-bar]` for before/after data |
| `[IMAGE]` | Place a relevant image with descriptive alt text here | After H2 heading, before body text |
| `[INFO-GAIN: type]` | Section requires original data or unique perspective | `[INFO-GAIN: case-study]`, `[INFO-GAIN: personal-experience]` |
| `[STAT: description]` | A specific statistic is needed in this location | `[STAT: market size or growth rate]` |
| `[FAQ]` | Place the FAQ section (3-5 questions, 40-60 word answers) | Always before the conclusion |
| `[INTERNAL-LINK]` | Natural place for an internal link to related content | `[INTERNAL-LINK: related pillar page or supporting post]` |

### Universal Template Skeleton

Every template, regardless of content type, follows this outer structure:

```
# [Title -- Question Format with Primary Keyword]

## Introduction (100-150 words)
- Hook: [Surprising stat or counterintuitive finding]
- Problem/opportunity: [Why the reader should care]
- Promise: [What they'll learn by reading]

## H2: [Section -- usually Question Format] (word count)
[ANSWER-FIRST]: 40-60 words, stat + source, direct answer
[CONTENT]: Topic coverage guidance
[INFO-GAIN]: Where unique perspective is needed
[VISUAL]: Chart type or [IMAGE] placement
[INTERNAL-LINK]: Where to link related content

[... 4-8 H2 sections depending on template ...]

## Frequently Asked Questions
[FAQ]: 3-5 questions with 40-60 word stat-rich answers

## Conclusion (100-150 words)
- Key takeaways (bulleted, 3-5 items)
- Call to action
```

### Section Word Count Targets

Word count targets ensure proper pacing. Readers disengage when sections
are too long, and AI systems prefer well-chunked content.

| Section Type | Target Word Count | Hard Limit |
|-------------|-------------------|------------|
| Introduction | 100-150 words | 200 words |
| Standard H2 section | 300-400 words | 500 words |
| Lightweight H2 section | 200-300 words | 400 words |
| Heavy H2 section (pillar) | 400-600 words | 700 words |
| FAQ answer (each) | 40-60 words | 80 words |
| Conclusion | 100-150 words | 200 words |

---

## Template Details

### how-to-guide

**When to use**: The reader wants to accomplish a specific task. The content
walks them through a process with defined steps.

**Structure**:
```
Introduction (hook with difficulty/time stat)
H2: Why This Matters [ANSWER-FIRST] [STAT]
H2: Prerequisites / What You Need
H2: Step 1 - [Action] [ANSWER-FIRST] [IMAGE]
H2: Step 2 - [Action] [ANSWER-FIRST] [VISUAL: process-flow]
H2: Step 3 - [Action] [ANSWER-FIRST] [IMAGE]
H2: Common Mistakes to Avoid [INFO-GAIN: personal-experience]
H2: FAQ [FAQ]
Conclusion (key takeaways + next step)
```

**Visual plan**: Process flow chart + before/after comparison chart.
3-5 screenshots or relevant images, one per major step.

**AI citation strength**: High for "how to" queries. AI systems frequently
extract step-by-step instructions from well-structured how-to content.

---

### listicle

**When to use**: The reader is comparing options or looking for curated
recommendations. Ranks well for "best X", "top X", "X tools for Y" queries.

**Structure**:
```
Introduction (hook with total count stat)
H2: [Item 1] - [Key Differentiator] [ANSWER-FIRST] [IMAGE]
H2: [Item 2] - [Key Differentiator] [ANSWER-FIRST]
... (5-15 items depending on depth)
H2: How We Evaluated [Category] [INFO-GAIN: methodology]
H2: FAQ [FAQ]
Conclusion (top pick + comparison table)
```

**Visual plan**: Comparison bar chart + market share donut chart.
Logo/screenshot per item, or grouped comparison image.

**AI citation strength**: Very high. 50% of top AI citations are listicles
(Onely). AI systems extract individual list items and recommendations.

---

### case-study

**When to use**: Showcasing real results with specific metrics. Critical for
E-E-A-T (demonstrates Experience) and thought leadership.

**Structure**:
```
Introduction (headline result stat)
H2: The Challenge [ANSWER-FIRST] [STAT]
H2: The Approach / Solution [ANSWER-FIRST] [VISUAL: timeline]
H2: Implementation Details [INFO-GAIN: process-documentation] [IMAGE]
H2: Results [ANSWER-FIRST] [VISUAL: before-after-bar] [STAT]
H2: Key Takeaways [INTERNAL-LINK]
H2: FAQ [FAQ]
Conclusion (CTA to learn more)
```

**Visual plan**: Before/after bar chart + results timeline or line chart.
Screenshots, dashboards, team/process photos.

**AI citation strength**: High for specific queries about outcomes and metrics.
Case studies provide the exact type of original data AI cannot fabricate.

**Critical requirement**: Real metrics from the actual project. Without genuine
data, this template produces content that fails E-E-A-T evaluation.

---

### comparison

**When to use**: "X vs Y" evaluations, tool comparisons, and "alternative to X"
queries. These capture high-intent commercial traffic.

**Structure**:
```
Introduction (market context stat)
H2: Quick Comparison Table [STAT]
H2: [Product A] Overview [ANSWER-FIRST] [IMAGE]
H2: [Product B] Overview [ANSWER-FIRST] [IMAGE]
H2: Feature-by-Feature Comparison [VISUAL: radar-chart]
H2: Pricing Comparison [VISUAL: bar-chart] [STAT]
H2: Which Should You Choose? [INFO-GAIN: personal-experience]
H2: FAQ [FAQ]
Conclusion (recommendation matrix)
```

**Visual plan**: Feature comparison radar chart + pricing bar chart.
Product screenshots and UI comparisons.

**AI citation strength**: Very high for commercial queries. AI systems
frequently cite comparison content when users ask "which is better."

---

### pillar-page

**When to use**: Comprehensive guides that serve as hub pages for topic
clusters. The anchor content that supporting posts link back to.

**Structure**:
```
Introduction (scope + authority stat)
H2: What Is [Topic]? [ANSWER-FIRST] [STAT]
H2: Why [Topic] Matters in 2026 [ANSWER-FIRST] [VISUAL: trend-line]
H2: [Core Subtopic 1] [ANSWER-FIRST] [IMAGE] [INTERNAL-LINK]
H2: [Core Subtopic 2] [ANSWER-FIRST] [VISUAL: bar-chart] [INTERNAL-LINK]
H2: [Core Subtopic 3] [ANSWER-FIRST] [IMAGE] [INTERNAL-LINK]
H2: [Core Subtopic 4] [ANSWER-FIRST] [VISUAL: donut-chart]
H2: [Advanced Topic] [INFO-GAIN: expert-insight] [INTERNAL-LINK]
H2: Tools and Resources [STAT]
H2: FAQ [FAQ] (5-8 items -- more than standard)
Conclusion (learning path + next steps)
```

**Visual plan**: 3-4 charts (diverse types) + topic overview diagram.
5+ images distributed throughout.

**Internal linking**: Heavy. Every subtopic H2 should link to a supporting
blog post. This is the hub of a topic cluster.

**AI citation strength**: Highest. Long-form content (2,000+ words) gets
3x more AI citations (Onely). Pillar pages with 3,000-4,000 words are the
most-cited content type.

---

### product-review

**When to use**: Hands-on tool reviews with real testing results. Bottom-of-
funnel content for users deciding whether to buy/use a product.

**Structure**:
```
Introduction (verdict stat, e.g., performance score)
H2: Quick Verdict [ANSWER-FIRST]
H2: What Is [Product]? [STAT]
H2: Setup and First Impressions [INFO-GAIN: personal-experience] [IMAGE]
H2: Key Features Tested [ANSWER-FIRST] [IMAGE]
H2: Performance Results [VISUAL: benchmark-bar] [STAT]
H2: Pricing and Value [VISUAL: pricing-comparison] [STAT]
H2: Pros and Cons
H2: Who Is This For?
H2: FAQ [FAQ]
Conclusion (final rating + recommendation)
```

**Visual plan**: Performance benchmark chart + pricing comparison.
Screenshots from actual testing (critical for E-E-A-T).

**Critical requirement**: First-hand testing data. Product reviews without
genuine hands-on experience are penalized by the December 2025 Core Update.
71% of affiliate sites without original testing were negatively impacted.

---

### thought-leadership

**When to use**: Industry analysis, forward-looking opinion pieces, and
contrarian takes backed by data. Builds authority and attracts backlinks.

**Structure**:
```
Introduction (trend stat that sets the stage)
H2: The Current Landscape [ANSWER-FIRST] [VISUAL: trend-line] [STAT]
H2: What's Changing [ANSWER-FIRST] [STAT]
H2: Why This Matters [ANSWER-FIRST] [IMAGE]
H2: What I've Seen [INFO-GAIN: personal-experience]
H2: What to Do About It [ANSWER-FIRST] [INTERNAL-LINK]
H2: Looking Ahead [INFO-GAIN: predictions]
H2: FAQ [FAQ]
Conclusion (key thesis + call to action)
```

**Visual plan**: Trend line chart + market shift chart.

**Differentiator**: Personal perspective and predictions are the entire value
proposition. AI cannot replicate genuine opinions from experienced practitioners.

---

### roundup

**When to use**: Collecting insights from multiple sources or experts. Curated
content that synthesizes perspectives across the industry.

**Structure**:
```
Introduction (theme + number of sources stat)
H2: Key Finding 1 [ANSWER-FIRST] [STAT]
H2: Key Finding 2 [ANSWER-FIRST] [VISUAL: multi-source-comparison]
H2: Key Finding 3 [ANSWER-FIRST] [IMAGE]
H2: Expert Perspectives [INFO-GAIN: expert-interviews]
H2: What This Means for [Audience] [INTERNAL-LINK]
H2: FAQ [FAQ]
Conclusion (synthesis + action items)
```

**Visual plan**: Multi-source comparison chart + trend aggregation.

---

### tutorial

**When to use**: Technical walkthroughs with code examples. The reader wants
to build something specific using specific tools.

**Structure**:
```
Introduction (what you'll build + tech stack)
H2: Prerequisites and Setup [STAT]
H2: Step 1 - [Foundation] [ANSWER-FIRST] [code-blocks]
H2: Step 2 - [Core Feature] [ANSWER-FIRST] [IMAGE] [code-blocks]
H2: Step 3 - [Integration] [ANSWER-FIRST] [VISUAL: architecture-diagram]
H2: Step 4 - [Testing/Deployment] [ANSWER-FIRST] [code-blocks]
H2: Troubleshooting Common Issues [INFO-GAIN: personal-experience]
H2: FAQ [FAQ]
Conclusion (complete code repo link + extensions)
```

**Visual plan**: Architecture diagram (SVG) + performance chart.
Terminal screenshots and UI results.

**Special considerations**: Code blocks with syntax highlighting throughout.
Every code example must be tested and runnable. Outdated code destroys
credibility and E-E-A-T trust.

---

### news-analysis

**When to use**: Timely commentary on industry events, algorithm updates,
and announcements. Speed matters -- publish within 24-48 hours.

**Structure**:
```
Introduction (the news + impact stat)
H2: What Happened [ANSWER-FIRST] [STAT]
H2: Why It Matters [ANSWER-FIRST] [VISUAL: impact-chart]
H2: Who's Affected [ANSWER-FIRST] [IMAGE]
H2: What to Do Now [ANSWER-FIRST] [INTERNAL-LINK]
H2: FAQ [FAQ] (2-3 items)
Conclusion (outlook)
```

**Visual plan**: 1-2 charts (impact visualization). Lighter on visuals
because speed of publication is the priority.

**Word count**: 800-1,500 words. Shorter format because timeliness is the
primary value. Update with additional data as it becomes available.

---

### data-research

**When to use**: Original research, surveys, proprietary data analysis.
The highest-value content type for building authority and earning citations.

**Structure**:
```
Introduction (headline finding)
H2: Methodology [ANSWER-FIRST] [STAT: sample-size]
H2: Key Finding 1 [ANSWER-FIRST] [VISUAL: primary-data-chart] [STAT]
H2: Key Finding 2 [ANSWER-FIRST] [VISUAL: secondary-data-chart] [STAT]
H2: Key Finding 3 [ANSWER-FIRST] [VISUAL: comparison-chart] [STAT]
H2: Implications [ANSWER-FIRST] [INTERNAL-LINK]
H2: Limitations [INFO-GAIN: methodology-transparency]
H2: FAQ [FAQ]
Conclusion (summary of findings + data access)
```

**Visual plan**: 3-4 charts (data visualizations are central to this type).
Charts ARE the content -- they should be the primary focus of each finding section.

**Differentiator**: Original data is the entire value proposition. B2B SaaS
websites conducting original research saw 25.1% average increase in top-10
rankings (Stratabeat study). AI cannot create proprietary data.

---

### faq-knowledge

**When to use**: Comprehensive Q&A reference content. Knowledge base pages
that answer many related questions about a topic.

**Structure**:
```
Introduction (topic scope + common questions stat)
H2: [Category 1] Questions
  H3: Question 1? [ANSWER-FIRST] [STAT]
  H3: Question 2? [ANSWER-FIRST] [STAT]
H2: [Category 2] Questions
  H3: Question 3? [ANSWER-FIRST] [STAT]
  H3: Question 4? [ANSWER-FIRST] [STAT]
H2: [Category 3] Questions [VISUAL: summary-chart]
  H3: Question 5? [ANSWER-FIRST] [STAT]
  H3: Question 6? [ANSWER-FIRST] [STAT]
Conclusion (additional resources + [INTERNAL-LINK])
```

**Visual plan**: 1-2 summary charts. Lighter on visuals because the Q&A
structure itself provides the value.

**Special requirements**: Every answer must contain a specific statistic.
FAQPage schema is critical for this type -- it directly impacts SERP features
and AI citation rates (+28%).

---

## How `/blog write` Uses Templates

### Auto-Detection Logic

When the user invokes `/blog write [topic]` without specifying a content type,
the system analyzes the topic to select the best template:

| Topic Signal | Template Selected |
|-------------|-------------------|
| "How to...", "Guide to...", "Steps to..." | how-to-guide |
| Numbers in title ("10 Best...", "7 Ways...", "Top 5...") | listicle |
| "X vs Y", "compared", "alternative to" | comparison |
| "Review", "tested", "hands-on", "our experience with" | product-review |
| Company/project name + "results", "case study" | case-study |
| Broad topic, "complete guide", "everything about", "ultimate" | pillar-page |
| "Tutorial", "walkthrough", "build", "implement" | tutorial |
| News event, "update", "announcement", "just released" | news-analysis |
| "Survey", "study", "data", "research", "we analyzed" | data-research |
| "FAQ", "questions about", "answers to" | faq-knowledge |
| Industry trend, "prediction", "future of", "why I think" | thought-leadership |
| "Experts say", "roundup", "collection", "what X think" | roundup |

### Explicit User Selection

Users can specify the template directly:
```
/blog write case study: Acme Corp migration results
/blog write listicle: "10 Best CI/CD Tools for 2026"
/blog write tutorial: "Building a RAG Pipeline with LangChain"
```

### Default Behavior

If the topic is ambiguous and auto-detection is uncertain:
- **Informational intent**: Defaults to `how-to-guide` (most versatile)
- **Commercial intent**: Defaults to `comparison`
- The system confirms the template selection with the user before proceeding

---

## Template and Scoring Integration

Templates guide content creation; the scoring system validates the result.
Here is how template features map to scoring categories:

| Template Feature | Scoring Category | Points at Stake |
|-----------------|------------------|-----------------|
| Section structure & heading hierarchy | Schema & Structure | 10 pts |
| `[ANSWER-FIRST]` markers | Answer-First Formatting | 20 pts |
| `[VISUAL]` and `[IMAGE]` markers | Visual Elements | 15 pts |
| `[FAQ]` zone | Schema & Structure | 4 pts |
| `[INFO-GAIN]` markers | Content Quality | 25 pts |
| `[STAT]` markers and citation guidance | Statistics & Citations | 20 pts |
| Freshness fields in frontmatter | Freshness & Trust | 10 pts |

A content piece that follows its template structure will cover all 100 points
of the scoring rubric. The template ensures nothing is forgotten.

---

## Customization

### Modifying an Existing Template

Templates are editable markdown files in `~/.claude/skills/blog/templates/`.
Changes take effect immediately -- no restart needed.

1. Open the template file you want to modify
2. Adjust section structure, word count targets, or marker placement
3. Test by running `/blog write` with a topic that matches the template

### Creating a New Template

1. Copy an existing template as a starting point:
   ```bash
   cp ~/.claude/skills/blog/templates/how-to-guide.md \
      ~/.claude/skills/blog/templates/my-custom-type.md
   ```

2. Define the section structure for your content type:
   - How many H2 sections does this type naturally have?
   - What is the logical flow from introduction to conclusion?
   - Where do visuals add the most value?

3. Add markers to every section:
   - `[ANSWER-FIRST]` on every H2 (non-negotiable)
   - `[VISUAL]` or `[IMAGE]` on 60-70% of H2 sections
   - `[INFO-GAIN]` on sections that need original perspective
   - `[STAT]` where specific data points are essential
   - `[INTERNAL-LINK]` where related content connections are natural

4. Set word count targets that match the content type's natural depth

5. Add a topic signal entry to the auto-detection table (update the
   blog-write SKILL.md or document the detection keywords)

### Template Best Practices

| Practice | Why |
|----------|-----|
| Keep sections focused on one topic each | AI systems extract by section |
| Place `[VISUAL]` where data naturally supports a chart | Forced visuals feel awkward |
| Use `[INFO-GAIN]` liberally | These sections differentiate from AI consensus |
| Set realistic word counts | Over-padding dilutes quality scores |
| Always include `[FAQ]` zone and conclusion | Both are scoring elements |
| Test with `/blog analyze` after writing | Validates template effectiveness |

---

## FAQ Section Guidelines (All Templates)

Every template includes an FAQ section. The FAQ is a scoring element (4 points)
and directly impacts AI citation rates (+28%).

### FAQ Requirements

| Requirement | Specification |
|-------------|--------------|
| Minimum questions | 3 (standard templates), 5-8 (pillar-page, faq-knowledge) |
| Maximum questions | 8 (diminishing returns beyond this) |
| Answer length | 40-60 words each |
| Statistics | Every answer must contain at least one specific statistic |
| Source attribution | Every statistic must cite a named source |
| Schema | FAQPage schema must be generated (see `references/content-rules.md`) |

### FAQ Question Sources
- People Also Ask results for the target keyword
- Reddit threads asking about the topic
- Common objections or misconceptions
- "How much", "how long", "is it worth" questions
- Questions that the main article sections do not fully address
