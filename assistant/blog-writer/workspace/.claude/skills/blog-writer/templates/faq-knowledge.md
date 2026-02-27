# Template: FAQ / Knowledge Base

**Template ID:** faq-knowledge
**Target Length:** 1,500-2,000 words
**Content Type:** Comprehensive FAQ organized by category with extractable answers
**Primary Search Intent:** Informational ("what is," "how does," "why does," "can I," "should I")

## When to Use This Template

Use this template when:
- A topic generates many recurring questions across forums, support channels, or search
- Each question can be answered in 80-120 words with a clear, direct response
- The content needs to be optimized for Google Featured Snippets and AI citations
- Search queries are phrased as questions ("how do I," "what is the difference between," "why does")
- You want to create a linkable reference page that other content can point to

Do NOT use this template for:
- Step-by-step instructions (use tutorial)
- Timely event analysis (use news-analysis)
- Original data studies (use data-research)
- Topics with fewer than 10 meaningful questions (too thin for this format)

**SEO Note:** This template is specifically optimized for FAQPage structured data (schema.org). Every Q&A pair should be a self-contained, extractable passage that can appear as a Featured Snippet or AI citation without any surrounding context.

---

## Title Format

```
[Topic]: Frequently Asked Questions ([Year])
```

**Examples:**
- "Claude Code: Frequently Asked Questions (2026)"
- "AI-Assisted Code Review: Frequently Asked Questions (2026)"
- "Technical Blog SEO: Frequently Asked Questions (2026)"

**Title Rules:**
- Name the topic explicitly
- Include "Frequently Asked Questions" (exact phrase for search matching)
- Include the year (signals freshness; update annually)
- Keep under 60 characters for full SERP display when possible

**Alternative Title Formats:**
- "[Topic] FAQ: [N] Questions Answered ([Year])"
- "Everything You Need to Know About [Topic] ([Year])"
- "[Topic] Explained: [N] Common Questions Answered"

---

## Section-by-Section Structure

---

### Introduction (100-150 words)

[ANSWER-FIRST] Introduce the topic and establish why these questions matter. Include a stat about the topic's relevance or how common these questions are.

```markdown
# [Topic]: Frequently Asked Questions ([Year])

[ANSWER-FIRST] [Topic] is [one-sentence definition or description]. [Why it matters in 1 sentence].

[STAT: data point about the topic's relevance — adoption rate, search volume, market size, or frequency of these questions]

This FAQ covers the [N] most common questions about [topic], organized into [N] categories:

1. **[Category 1 Name]** — [What these questions cover]
2. **[Category 2 Name]** — [What these questions cover]
3. **[Category 3 Name]** — [What these questions cover]
4. **[Category 4 Name]** — [What these questions cover]

[INFO-GAIN: why this FAQ exists — what gap it fills vs. existing resources, or what unique perspective it brings]

> **Last updated:** [Date]. [How often this page is updated].
```

**Rules:**
- The introduction should be skimmable — readers will jump to their question
- Include a table of contents via the category list
- State when the page was last updated (trust signal)
- Include a stat to establish the topic's relevance

---

### FAQ Category 1: "Getting Started" Questions (3-4 Questions)

Foundational questions for newcomers. Each question is an H2.

```markdown
## Getting Started with [Topic]

### What is [topic/tool/concept]?

[ANSWER-FIRST] [Topic] is [clear, jargon-free definition in 40-60 words]. [One sentence of additional context about its purpose or primary use case].

[STAT: adoption or usage data point that validates relevance]

[INTERNAL-LINK: link to introductory guide or overview content for readers who need more depth]

---

### Who should use [topic/tool]?

[ANSWER-FIRST] [Topic] is best suited for [specific audience] who need to [specific outcome]. [One sentence about who it's NOT for, to help readers self-select].

**Ideal for:**
- [Audience segment 1]: [Why]
- [Audience segment 2]: [Why]

**Not ideal for:**
- [Audience segment]: [Why not]

---

### How do I get started with [topic]?

[ANSWER-FIRST] To get started with [topic], [first step in one sentence]. [Second step]. The entire setup takes approximately [time].

[INTERNAL-LINK: link to detailed setup tutorial]

---

### How much does [topic/tool] cost?

[ANSWER-FIRST] [Topic/tool] [pricing summary — free, freemium, paid tiers in one sentence]. [One sentence about what the free tier includes or what the pricing is based on].

[STAT: pricing comparison or value benchmark if relevant]

[INTERNAL-LINK: link to detailed pricing comparison or guide if available]
```

---

### FAQ Category 2: "How It Works" Questions (3-4 Questions)

Functional questions about mechanics and capabilities.

```markdown
## How [Topic] Works

### How does [topic/feature] work?

[ANSWER-FIRST] [Topic/feature] works by [mechanism explained in 40-60 words without jargon]. [One sentence of technical detail for readers who want depth].

[VISUAL: simple-diagram showing how it works, if applicable]

[INTERNAL-LINK: link to technical deep-dive content]

---

### What is the difference between [A] and [B]?

[ANSWER-FIRST] The main difference is [key distinction in one sentence]. [A] is [characteristic], while [B] is [characteristic].

| Feature | [A] | [B] |
|---------|-----|-----|
| [Comparison point 1] | [A's value] | [B's value] |
| [Comparison point 2] | [A's value] | [B's value] |
| [Comparison point 3] | [A's value] | [B's value] |
| **Best for** | [Use case] | [Use case] |

[STAT: usage or performance data comparing A and B if available]

---

### Can [topic/tool] do [specific capability]?

[ANSWER-FIRST] [Yes/No], [topic/tool] [can/cannot] [capability] [because reason in one sentence]. [One sentence about workarounds or alternatives if "no," or limitations if "yes"].

---

### What are the limitations of [topic/tool]?

[ANSWER-FIRST] The main limitations of [topic/tool] are [top 2-3 limitations in one sentence]. [One sentence about whether these limitations are being addressed].

**Current limitations:**
1. **[Limitation 1]:** [Brief explanation]
2. **[Limitation 2]:** [Brief explanation]
3. **[Limitation 3]:** [Brief explanation]

[INFO-GAIN: honest assessment based on hands-on experience — what the marketing doesn't tell you]
```

---

### FAQ Category 3: "Common Problems" Questions (3-4 Questions)

Troubleshooting questions for users who are stuck.

```markdown
## Common Problems & Solutions

### Why is [topic/tool] [not working / slow / showing error]?

[ANSWER-FIRST] The most common cause of [problem] is [root cause in one sentence]. [One-sentence fix].

**Common causes and fixes:**

| Cause | Fix |
|-------|-----|
| [Cause 1] | [Fix 1] |
| [Cause 2] | [Fix 2] |
| [Cause 3] | [Fix 3] |

[INTERNAL-LINK: link to detailed troubleshooting guide]

---

### How do I fix [specific error message]?

[ANSWER-FIRST] [Error message] typically means [what it means]. Fix it by [specific action in one sentence].

```[language]
# [Fix command or code]
[specific fix]
```

[STAT: how common this error is, if data is available]

---

### How do I migrate from [old tool/version] to [new tool/version]?

[ANSWER-FIRST] To migrate from [old] to [new], [high-level steps in one sentence]. The migration takes approximately [time] for a typical [project/setup].

**Migration steps:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

[INTERNAL-LINK: link to detailed migration tutorial]

---

### Where can I get help with [topic/tool]?

[ANSWER-FIRST] The best places to get help with [topic/tool] are [top 2-3 resources]. [One sentence about response times or community quality].

**Help resources:**
- **[Resource 1]:** [Description and link]
- **[Resource 2]:** [Description and link]
- **[Resource 3]:** [Description and link]
```

---

### FAQ Category 4: "Advanced" Questions (2-3 Questions)

Questions from experienced users looking for deeper understanding.

```markdown
## Advanced Topics

### How do I [advanced use case]?

[ANSWER-FIRST] To [advanced use case], [approach in one sentence]. This requires [prerequisite knowledge/setup].

[Brief technical explanation — 2-3 sentences]

```[language]
# Example implementation
[code snippet showing the approach]
```

[INTERNAL-LINK: link to advanced tutorial covering this in detail]

[INFO-GAIN: expert tip or non-obvious approach based on real-world experience]

---

### What are the best practices for [topic] in production?

[ANSWER-FIRST] The top [N] best practices for [topic] in production are [brief list in one sentence]. [One sentence about why these matter].

1. **[Practice 1]:** [Brief explanation with rationale]
2. **[Practice 2]:** [Brief explanation with rationale]
3. **[Practice 3]:** [Brief explanation with rationale]

[STAT: data point about the impact of following these practices — error reduction, performance improvement, etc.]

---

### How does [topic] compare to [alternative] for [specific use case]?

[ANSWER-FIRST] For [specific use case], [topic] is [better/worse/comparable] to [alternative] because [key reason]. [One sentence nuance].

| Criterion | [Topic] | [Alternative] |
|-----------|---------|---------------|
| [Criterion 1] | [Rating/value] | [Rating/value] |
| [Criterion 2] | [Rating/value] | [Rating/value] |
| [Criterion 3] | [Rating/value] | [Rating/value] |
| **Verdict** | [Summary] | [Summary] |

[INTERNAL-LINK: link to detailed comparison content]
```

---

### Related Resources (100 words)

```markdown
## Related Resources

Explore these resources for deeper coverage of [topic]:

- **[Detailed guide title]** — [One-sentence description] [INTERNAL-LINK]
- **[Tutorial title]** — [One-sentence description] [INTERNAL-LINK]
- **[Comparison/review title]** — [One-sentence description] [INTERNAL-LINK]
- **[Official documentation]** — [One-sentence description with external link]
- **[Community/forum]** — [One-sentence description with external link]
```

**Rules:**
- Mix internal links (your content) with external links (official docs, communities)
- Prioritize internal links — this is a hub page
- Keep descriptions to one sentence each

---

### Still Have Questions? (50 words)

```markdown
## Still Have Questions?

Didn't find what you're looking for? [Contact method — e.g., "Leave a comment below," "Join our community at [link]," "Reach out on [platform]"]. We update this FAQ [frequency — monthly/quarterly] based on reader questions.

[IMAGE: optional call-to-action graphic or community badge]
```

---

## Structured Data Notes

This template requires FAQPage schema markup. When generating the final HTML:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[Question text]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Answer text — use the ANSWER-FIRST sentence + supporting detail]"
      }
    }
  ]
}
```

**Rules:**
- Every H2 question must be included in the schema
- Use the [ANSWER-FIRST] text as the answer in the schema
- Limit schema to 10 questions maximum (Google's practical limit for display)
- Test with Google's Rich Results Test before publishing

---

## Content Checklist

Before publishing, verify:

- [ ] Title includes topic name, "Frequently Asked Questions," and year
- [ ] Introduction includes a stat about the topic's relevance
- [ ] Questions are organized into 3-4 logical categories
- [ ] Every question is phrased exactly as users would search it
- [ ] Every answer opens with [ANSWER-FIRST] (direct answer in first sentence)
- [ ] Each answer is 80-120 words and self-contained
- [ ] Each answer is extractable as a standalone snippet (no "as mentioned above" references)
- [ ] At least 12 total questions across all categories
- [ ] At least 3 [STAT] markers with relevant data points
- [ ] At least 2 [INFO-GAIN] markers with original experience or insight
- [ ] At least 6 [INTERNAL-LINK] zones connecting to detailed content
- [ ] At least 1 [VISUAL] marker (comparison table or diagram)
- [ ] Related Resources section has 3-5 links
- [ ] "Still Have Questions?" section with clear contact/community path
- [ ] FAQPage structured data schema prepared for all questions
- [ ] No answer references another answer (each must stand alone)
- [ ] All answers pass the "would this make sense as a Google Featured Snippet?" test
