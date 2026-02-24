# Blog Format Templates

## Format Selection Guide

| Format | Best For | Typical Length | Structure |
|--------|----------|---------------|-----------|
| **Deep Dive** | Complex topics, technical analysis | 3,000-5,000 words | Thesis → Evidence → Implications |
| **How-To Guide** | Tutorials, implementations | 1,500-3,000 words | Problem → Steps → Verification |
| **Listicle** | Curated knowledge, tools, tips | 1,500-2,500 words | Intro → Items → Synthesis |
| **Opinion/Thought Leadership** | Industry commentary, predictions | 1,200-2,000 words | Position → Arguments → Call to action |
| **Case Study** | Success stories, lessons learned | 2,000-3,500 words | Context → Challenge → Solution → Results |
| **Comparison** | Tool/approach evaluation | 2,000-3,000 words | Criteria → Analysis → Recommendation |
| **Roundup** | News, trends, curated links | 800-1,500 words | Theme → Items → Takeaway |

---

## Deep Dive Format

```markdown
# [Definitive Title That Signals Depth]

[Hook: surprising fact, provocative claim, or vivid scenario — 2-3 sentences]

[Context: why this matters now — 2-3 sentences]

[Promise: what the reader will understand by the end — 1 sentence]

## [The Core Thesis / Background]
[Establish the foundation. Define terms if needed. Set the stage.]

## [Evidence Section 1: The Strongest Argument]
[Lead with your strongest point. Data + examples + analysis.]

## [Evidence Section 2: Supporting Argument]
[Build on the first section. New data, new angle.]

## [Evidence Section 3: The Counter-Argument]
[Address the strongest objection honestly. Then refute or qualify.]

## [Implications / What This Means]
[So what? Connect the evidence to the reader's world.]

## [Conclusion: What to Do Next]
[Actionable takeaway. Reference the opening. Close the loop.]
```

---

## How-To Guide Format

```markdown
# How to [Achieve Specific Outcome] [with/using Tool/Approach]

[Hook: the pain point this solves — 1-2 sentences]

[Promise: what they'll have built/achieved by the end]

## Prerequisites
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

## Step 1: [Action Verb + Specific Task]
[Explanation of what and why]

[Code block or screenshot]

[Expected outcome]

## Step 2: [Action Verb + Specific Task]
[Same structure]

## Step N: [Action Verb + Specific Task]
[Same structure]

## Verification
[How to confirm everything works. Test commands, expected output.]

## Troubleshooting
### [Common Issue 1]
[Symptom → Cause → Fix]

### [Common Issue 2]
[Same structure]

## Next Steps
[Where to go from here. Related guides, advanced topics.]
```

---

## Listicle Format

```markdown
# [Number] [Adjective] [Items] for/to [Benefit] [in Year/Context]

[Hook: why this list matters — not "here are N things"]

[Selection criteria: how these were chosen — establishes credibility]

## 1. [Item Name]
**Why it matters:** [One-sentence value proposition]

[2-3 paragraphs: what it is, how it works, when to use it]

[Data point or example that proves the claim]

> "[Expert quote about this item]" — [Name, Title]

## 2. [Item Name]
[Same structure — but vary the supporting evidence type]

## N. [Item Name]
[Same structure]

## The Pattern
[Synthesis: what do these items have in common? What trend do they reveal?]

## How to Choose
[Decision framework: which item for which situation]
```

---

## Opinion / Thought Leadership Format

```markdown
# [Bold Claim or Provocative Question]

[Hook: the observation that sparked this piece — be specific]

[The position: state your thesis clearly in 1-2 sentences]

## The Current State
[What most people believe or do. Set up the conventional wisdom.]

## Why That's Wrong / Incomplete
[Your counter-argument. Evidence-backed, not just assertion.]

## What I've Seen
[Personal experience, data from your work, specific examples]

## The Implications
[If your thesis is right, what should change? What should people do differently?]

## The Caveat
[Where your argument is weakest. Acknowledge it honestly.]

## What I'd Bet On
[Final position. Confident but earned. Reference the opening.]
```

---

## Case Study Format

```markdown
# How [Company/Team] [Achieved Specific Result] [with/by Action]

[Hook: the most impressive result, stated as a number]

## The Context
[Who is this company? What do they do? Why does this story matter?]
- Industry: [...]
- Size: [...]
- Challenge timeline: [...]

## The Challenge
[What problem were they facing? Be specific — revenue impact, engineer time wasted, user complaints.]

## What They Tried First
[Previous approaches that didn't work. This creates tension.]

## The Solution
[What they actually did. Technical detail where relevant.]

### [Implementation Detail 1]
[Specific change, with reasoning]

### [Implementation Detail 2]
[Specific change, with reasoning]

## The Results
[Hard numbers. Before/after comparisons. Timeline.]

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| [Metric 1] | [value] | [value] | [+/-X%] |
| [Metric 2] | [value] | [value] | [+/-X%] |

## Lessons Learned
1. [Lesson 1 — transferable to the reader's context]
2. [Lesson 2]
3. [Lesson 3]

## What They'd Do Differently
[Honest reflection. This is where credibility is earned.]
```

---

## Comparison Format

```markdown
# [Option A] vs [Option B]: [Which to Choose for Specific Use Case]

[Hook: the decision the reader is facing]

[Promise: by the end, you'll know which to pick for YOUR situation]

## Quick Answer
[For impatient readers: the 2-sentence recommendation with condition]

## Evaluation Criteria
[How we're comparing. Be explicit about the framework.]

## [Criterion 1]: [Option A] vs [Option B]
### [Option A]
[Analysis with evidence]

### [Option B]
[Analysis with evidence]

**Winner for [criterion]:** [Option A/B] — [one-sentence reason]

## [Criterion 2-N]: Same Structure

## Summary Comparison

| Criterion | [Option A] | [Option B] |
|-----------|-----------|-----------|
| [Criterion 1] | [rating/note] | [rating/note] |
| [Criterion 2] | [rating/note] | [rating/note] |

## Recommendation
### Choose [Option A] if:
- [Condition 1]
- [Condition 2]

### Choose [Option B] if:
- [Condition 1]
- [Condition 2]

## Final Thought
[The nuance: why this isn't a simple A vs B, and what really matters]
```

---

## Article Metadata Template

```json
{
  "title": "",
  "slug": "",
  "excerpt": "",
  "keywords": [],
  "wordCount": 0,
  "readTime": "X min",
  "format": "deep-dive | how-to | listicle | opinion | case-study | comparison",
  "tone": "technical-authority | conversational-expert | narrative-storyteller | practical-guide | analytical-observer",
  "audience": "",
  "primaryKeyword": "",
  "secondaryKeywords": [],
  "illustrations": [],
  "createdAt": ""
}
```
