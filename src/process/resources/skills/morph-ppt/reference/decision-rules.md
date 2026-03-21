---
name: decision-rules
description: PPT Planner — Infer Audience/Purpose/Narrative, Build Outline and Page Briefs
---

# PPT Planner

Role: Think deeply about the user's topic and produce a high-quality PPT plan.

Responsibilities:
- Infer Audience, Purpose, and Narrative Structure
- Build an Outline using the Pyramid Principle
- Generate a Page Brief for each slide (objective, information, page type)

---

## Infer Audience

**Thinking Method**: Based on topic keywords and usage context, ask "Who will view this PPT? What do they care about most?"

**Common Patterns (examples, not exhaustive)**:
- Fundraising / Roadshow → Investors
- Teaching / Training → Students
- Product Introduction → Clients
- Analysis / Report → Executives
- Internal Sharing → Colleagues
- Campus Recruitment → Fresh Graduates
- Supplier Evaluation → Procurement Team
- Cannot determine → General Business

---

## Infer Purpose

**Thinking Method**: Based on topic keywords, ask "What outcome does the user want to achieve with this PPT?"

**Common Patterns (examples, not exhaustive)**:
- Fundraising / Roadshow → Persuade Investment
- Product Introduction → Demonstrate Value
- Analysis / Report → Deliver Insights
- Training / Teaching → Impart Knowledge
- Launch Event / Promotion → Build Awareness
- Bidding / Proposal → Win the Deal
- Cannot determine → Present Information

---

## Infer Narrative Structure

**Thinking Method**: Choose an appropriate narrative thread based on the purpose.

**Common Structures (examples, not exhaustive)**:

| Applicable Scenario | Narrative Structure | Page Sequence Example |
|---------|---------|------------|
| Fundraising / Sales / Bidding | problem_solution | hero → statement → pillars → evidence → cta |
| Reporting / Analysis | insight_driven | hero → statement → evidence → pillars → cta |
| Promotion / Speech | vision_driven | hero → quote → pillars → evidence → cta |
| Teaching / Training | educational | hero → statement → pillars → pillars → showcase → cta |
| History / Development | timeline | hero → timeline → timeline → evidence → cta |
| Product Comparison | comparison | hero → comparison → comparison → evidence → cta |

**Free Combination**: Feel free to adapt based on the specific content — there is no need to strictly follow the patterns above.

---

## Outline Construction Principles

### Thinking Method: Pyramid Principle

Use the Pyramid Principle to build the Outline, ensuring clear logic and leading with conclusions:

1. **Conclusion First**: Each slide starts with a core argument, not a list of information
   - ✅ "Product performance improved by 40%"
   - ❌ "Product Introduction"

2. **Top-Down Structure**: The deck's overall conclusion governs each slide, and each slide's conclusion governs its supporting points
   - Deck conclusion → Slide-level arguments → Supporting points per slide

3. **Group by Category**: Supporting points on the same slide belong to the same logical category
   - Content on one slide should answer the same question

4. **Logical Progression**: Organize slide order by time / importance / causality / parallelism
   - There should be a clear logical relationship between consecutive slides

### 6-Step Thinking Process

When building the Outline, think through the following steps in order:

1. **What is the one-sentence conclusion of this deck?**
   - If the audience remembers only one thing, what should it be?

2. **How many supporting arguments are needed for this conclusion?**
   - Each argument maps to one slide

3. **What is the core argument of each slide?**
   - One sentence — not a clickbait title

4. **What evidence / data / case studies support each slide?**
   - An argument without evidence is not credible

5. **Which slides are essential? Which are "nice to have but not necessary"?**
   - Keep the slide count focused on the core message

6. **Where is the audience most likely to raise questions or push back?**
   - That is where evidence needs to be strengthened

### Determining Page Count

**Core Principle**: Let the volume of content you need to convey dictate the count — do not apply a formula.

**Thinking Method**:
1. List all the points that need to be conveyed
2. Assess the importance and complexity of each point
3. Group related points into slide topics
4. Check: Does each slide have a clear core argument? Is any slide too crowded or too empty?

**Page Count Guidelines** (for reference only, not a hard limit):
- Quick intro / single topic: 3–5 slides
- Standard presentation / product intro: 5–8 slides
- Deep analysis / annual report: 10–15 slides
- Larger topics can have more, but every slide must deliver clear value

**Points per Slide**: Depends on the content
- Simple concept: 1–2 points are enough
- Standard parallel items: 3–5 points
- Detailed comparison: can be more

### Output Format

```
总结论：AI 智能体平台让每个企业都能拥有自己的 AI 员工
---
S1: [hero] "AI Agent Platform — 让智能体为你工作"
S2: [statement] "从自动化到自主化：为什么现在需要智能体"
S3: [pillars] "三大核心能力：感知 / 推理 / 执行" ★重点页
S4: [evidence] "10M+ API Calls / 99.95% Uptime / 50ms P95"
S5: [cta] "开始构建你的智能体"
```

---

## Page Brief Construction

Once the Outline is confirmed, supplement each slide with a Page Brief. This is the **critical intermediate layer** between the outline and the actual generation.

### Why Page Briefs Are Needed

- **Avoid information dumping**: Without a Page Brief, it is tempting to jump straight from outline to writing
- **Clarify information hierarchy**: Think through what is most important and what is supplementary
- **Determine page type**: Decide which page type this slide should use
- **Ensure logical coherence**: Define the transition relationship with preceding and following slides

### 6 Questions to Answer for Each Slide

For each slide, answer the following in order:

1. **Slide Objective**: What should the audience remember after viewing this slide?
2. **Core Information**: Ranked by importance (quantity depends on the content)
   - ⚠️ **Write detailed, complete content** — not just bullet-point titles
   - Include: titles, descriptions, data, case studies, comparisons, and other complete information
   - The design expert will use this content directly to generate the PPT and will not add anything
3. **Supporting Evidence**: What data / case studies / comparisons make the argument convincing?
4. **Page Type**: Which page type should this slide use?
   - hero / statement / pillars / evidence / timeline / comparison / grid / quote / cta / showcase
5. **Information Hierarchy**: What should be largest and most prominent? What is supplementary? What can be de-emphasized?
6. **Relationship with Adjacent Slides**: How does this slide transition from the previous one? How does it lead into the next?

### Output Format (internal use)

**❌ Wrong Example (information too brief)**:
```
核心信息：
① 感知：多模态理解
② 推理：链式思考
③ 执行：自动执行
```

**✅ Correct Example (detailed and complete information)**:
```
S3 [pillars] ★重点页
├── 目标：让观众理解平台的三大能力差异化
├── 核心信息：
│   ① 感知能力：支持文字、图片、语音、视频等多模态输入，能理解复杂的业务文档和用户意图，识别准确率达 95%+
│   ② 推理能力：采用链式思考（Chain-of-Thought）技术，能分解复杂任务为多个步骤，自动调用 20+ 工具完成任务
│   ③ 执行能力：可自主执行任务并验证结果，支持闭环反馈，任务成功率 90%+，失败时自动重试和人工介入
├── 证据：各能力的具体指标（识别准确率 95%+，工具调用 20+，成功率 90%+）
├── 页面类型：pillars（多列并排）
├── 信息层级：编号①②③最大 → 能力名称次之 → 详细描述最小 → 指标数据突出显示
├── 过渡：S2 提出"为什么需要智能体" → S3 回答"智能体怎么做到"
```

**Important**:
- The Page Brief is a working document the planner hands off to the design expert
- **Core information must be written in detail**, including titles, descriptions, data, case studies, etc. — the design expert will use it directly
- Do not write abbreviated points like "multi-modal understanding"; instead write complete descriptions like "Supports multi-modal input including text, images, audio, and video, with recognition accuracy of 95%+"

---

## Fallback Strategy

Default handling when inference is difficult:

| Failure Scenario | Fallback Strategy |
|---------|---------|
| Cannot infer audience | General Business |
| Cannot infer purpose | Present Information |
| Cannot determine page count | Decide reasonably based on content volume; avoid too few (<3) or too many (>20) |

---
