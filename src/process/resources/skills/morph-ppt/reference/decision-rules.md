---
name: decision-rules
description: PPT Planner — Infer Audience/Purpose/Narrative, Build brief.md (outline + page briefs)
---

# PPT Planner

Role: Think deeply about the user's topic and produce a high-quality PPT plan.

Output: A single `brief.md` containing extraction summary, outline, and detailed page briefs.

---

## Infer Audience

**Thinking Method**: Based on topic keywords and usage context, ask "Who will view this PPT? What do they care about most?"

**Common Patterns (examples, not exhaustive)**:

- Fundraising / Roadshow → Investors
- Teaching / Training → Students
- Product Introduction → Clients
- Analysis / Report → Executives
- Internal Sharing → Colleagues
- Cannot determine → General Business

---

## Infer Purpose

**Thinking Method**: Based on topic keywords, ask "What outcome does the user want to achieve with this PPT?"

**Common Patterns (examples, not exhaustive)**:

- Fundraising / Roadshow → Persuade Investment
- Product Introduction → Demonstrate Value
- Analysis / Report → Deliver Insights
- Training / Teaching → Impart Knowledge
- Cannot determine → Present Information

---

## Infer Narrative Structure

**Thinking Method**: Choose an appropriate narrative thread based on the purpose.

**Common Structures (examples, not exhaustive)**:

| Applicable Scenario           | Narrative Structure | Page Sequence Example                                 |
| ----------------------------- | ------------------- | ----------------------------------------------------- |
| Fundraising / Sales / Bidding | problem_solution    | hero → statement → pillars → evidence → cta           |
| Reporting / Analysis          | insight_driven      | hero → statement → evidence → pillars → cta           |
| Promotion / Speech            | vision_driven       | hero → quote → pillars → evidence → cta               |
| Teaching / Training           | educational         | hero → statement → pillars → pillars → showcase → cta |

**Free Combination**: Feel free to adapt based on the specific content.

---

## Outline Construction

### Thinking Method: Pyramid Principle

1. **Conclusion First**: Each slide starts with a core argument, not a list of information
2. **Top-Down Structure**: Deck conclusion → Slide-level arguments → Supporting points
3. **Group by Category**: Points on the same slide belong to the same logical category
4. **Logical Progression**: Organize by time / importance / causality / parallelism

### 6-Step Thinking Process

1. What is the one-sentence conclusion of this deck?
2. How many supporting arguments are needed?
3. What is the core argument of each slide?
4. What evidence / data / case studies support each slide?
5. Which slides are essential? Which are "nice to have"?
6. Where is the audience most likely to push back?

### Page Count Guidelines (reference only)

- Quick intro / single topic: 3–5 slides
- Standard presentation: 5–8 slides
- Deep analysis / annual report: 10–15 slides

---

## brief.md Output Format

Write everything into a single `brief.md` with three sections:

### Section 1: Summary

```
Topic: ...
Audience: ... [provided / inferred]
Purpose: ... [provided / inferred]
Narrative: ...
Style direction: ... [provided / inferred based on topic + mood, not habit]
```

**Style selection principles**:

1. **Match topic mood** → Corporate ≠ playful, tech ≠ organic (unless intentionally contrasting)
2. **Vary by project** → Discover styles from OfficeCli remote `Styles/` (via `reference/remote-style-source.md`), avoid repeating recent styles
3. **Consider 6 categories** → dark (16), light (10), warm (11), bw (5), vivid (6), mixed (7)
4. **Prefer unexpected but fitting** → Don't default to "dark + neon" for all tech topics
5. **Name specific style** → "warm--earth-organic palette" not "warm tones"

### Section 2: Outline

```
Overall conclusion: AI Agent Platform lets every enterprise have its own AI workforce
---
S1: [hero] "AI Agent Platform — Let agents work for you"
S2: [statement] "From automation to autonomy: why agents are needed now"
S3: [pillars] "Three core capabilities: Perceive / Reason / Execute" ★key slide
S4: [evidence] "10M+ API Calls / 99.95% Uptime / 50ms P95"
S5: [cta] "Start building your agent"
```

### Section 3: Page Briefs

For each slide, answer 6 questions:

```
S3 [pillars] ★key slide
├── Objective: Help the audience understand the three differentiated capabilities
├── Core information (detailed):
│   ① Perception: Supports text, image, voice, video multimodal input, 95%+ accuracy
│   ② Reasoning: Chain-of-Thought technology, 40% improvement on complex tasks
│   ③ Execution: Auto-calls 20+ tools and APIs, end-to-end task completion
├── Evidence: Specific metrics for each capability
├── Page type: pillars (multi-column)
├── Hierarchy: Number ① largest → capability name next → description smallest
└── Transition: S2 asks "why needed" → S3 answers "how it works"
```

**Critical**: Core information must be detailed and complete (titles, descriptions, data, cases). Do NOT write abbreviated bullet points like "multimodal understanding". The Design Expert will use this content directly.

---

## Fallback Strategy

| Failure Scenario            | Fallback Strategy                               |
| --------------------------- | ----------------------------------------------- |
| Cannot infer audience       | General Business                                |
| Cannot infer purpose        | Present Information                             |
| Cannot determine page count | Decide based on content volume; avoid <3 or >20 |

---
