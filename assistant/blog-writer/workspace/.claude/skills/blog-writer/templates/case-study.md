# Template: Case Study

**Template Name:** Case Study (Results-Focused Narrative)
**Target Word Count:** 1,500-2,000 words
**Description:** A narrative-driven analysis of a specific project, campaign, or initiative that documents the challenge, strategy, execution, and measurable results. Designed to build credibility, demonstrate expertise through real outcomes, and rank for "[topic] case study," "how [company] achieved [result]," and long-tail problem-solution queries.

## When to Use This Template

- **Content Goals:** Build trust and authority through documented results, generate leads by demonstrating competence, create reference material for sales conversations, attract backlinks from industry publications
- **Search Intent:** Informational / Commercial investigation -- the reader wants proof that a strategy works before committing to it themselves
- **Best For:** Client success stories, internal project retrospectives, before/after transformations, strategy validation, process documentation
- **Avoid When:** You lack specific metrics or measurable outcomes (vague "it went well" stories don't qualify), or when the subject hasn't given permission to be referenced

---

## Section-by-Section Structure

---

### Title (H1)

**Format:** "How [Company/Team] [Achieved Specific Result] in [Timeframe]"

**Examples:**
- "How Acme Corp Reduced API Latency by 73% in 6 Weeks"
- "How a 3-Person Team Scaled to 1M Monthly Users in 90 Days"
- "How We Cut Build Times from 12 Minutes to 45 Seconds"

**Rules:**
- Include the specific result metric in the title -- this is the hook
- Include the timeframe to create urgency and credibility
- Use the company/team name if known; use "We" for internal case studies
- Keep under 70 characters if possible

---

### TL;DR Box (40-60 words)

[ANSWER-FIRST] This is the entire case study compressed into a single box. Lead with the headline result number.

**Format:** A visually distinct callout box (blockquote, colored background, or bordered section) placed immediately after the title.

**Structure:**
1. **Headline metric** (1 sentence): The single most impressive result.
2. **How** (1 sentence): The core strategy in plain language.
3. **Timeframe** (phrase): How long it took.

**Example:**
> **TL;DR:** Acme Corp reduced API response times from 1,200ms to 320ms (73% improvement) by migrating from a monolithic REST API to an edge-cached GraphQL gateway. The migration was completed in 6 weeks with zero downtime and a 2-person engineering team.

[STAT: The headline metric that anchors the entire case study]

---

### Introduction (100-150 words)

[ANSWER-FIRST] Open with the key result metric in the very first sentence. Don't build up to it -- lead with it.

**Structure:**
1. **Result lead** (1 sentence): State the primary outcome with specific numbers.
2. **Context** (2-3 sentences): Who is the subject? What's their scale? Why does this matter to the reader?
3. **Stakes framing** (1 sentence): What was at risk if the problem wasn't solved?
4. **Promise** (1 sentence): What the reader will learn from this case study.

[STAT: Secondary metric that adds dimension to the headline result (e.g., cost savings, time saved, user satisfaction improvement)]

[INFO-GAIN: context detail] Share a specific detail about the company or project that makes this relatable to the reader -- team size, budget constraints, tech stack, industry, etc.

[INTERNAL-LINK] Link to a related foundational post: "For background on [strategy/technology], see our [Guide to X]."

---

### The Challenge (200-250 words)

[ANSWER-FIRST] Open with the single most painful symptom of the problem -- the thing that made someone say "we have to fix this."

**Structure:**
1. **Pain point** (1-2 sentences): The specific, felt problem. Use concrete details -- error rates, customer complaints, revenue impact.
2. **Root cause** (2-3 sentences): What was actually causing the problem at a technical or strategic level?
3. **Scale of impact** (1-2 sentences): Quantify the damage -- how many users affected, how much revenue at risk, how many engineering hours wasted.
4. **Failed attempts** (2-3 sentences): What had already been tried and why it didn't work. This builds narrative tension and demonstrates that the eventual solution wasn't the obvious first choice.
5. **Decision point** (1 sentence): What triggered the decision to try a different approach?

[STAT: Metric quantifying the severity of the problem before the solution]

[INFO-GAIN: failed approach detail] Document a specific failed attempt with enough detail that the reader can learn from it. What was tried, what happened, why it failed.

[IMAGE] Diagram or screenshot showing the "before" state -- the broken architecture, the poor metrics dashboard, the error logs.

**Example opening:**
> "At peak traffic, Acme's API was returning 500 errors on 12% of requests -- and their largest enterprise client had set a 30-day deadline to fix it or cancel their $2M annual contract."

---

### The Strategy (300-400 words)

[ANSWER-FIRST] Open with the core strategic decision in one sentence -- what approach was chosen and the single most important reason why.

**Structure:**
1. **Strategic choice** (1-2 sentences): What approach was selected? Name the methodology, technology, or framework.
2. **Why this approach** (3-4 sentences): What made this the right choice over alternatives? Reference the failed attempts from the Challenge section. Include specific criteria used in the decision.
3. **Key decisions** (3-5 bullets or sub-sections): Break down the 3-5 most important decisions made during strategy formulation. Each should include the decision, the alternatives considered, and the reasoning.
4. **Risk assessment** (1-2 sentences): What were the known risks and how were they mitigated?

[INFO-GAIN: process documentation] This is the highest-value section. Document the decision-making process with enough specificity that another team could replicate the thinking. Include:
- Selection criteria used to evaluate options
- Trade-offs explicitly discussed and weighed
- Any frameworks, scorecards, or evaluation tools used
- Who was involved in the decision and what perspectives they brought

[VISUAL: decision-matrix] If applicable, include a table showing the options evaluated, the criteria, and the scores that led to the final choice.

[STAT: Supporting data point that justified the strategic choice (e.g., benchmark, industry data, competitor analysis)]

[INTERNAL-LINK] Link to a detailed guide on the strategy or technology chosen: "We wrote a comprehensive guide on [strategy/technology] -- read it here."

**Example:**
> "The team chose to migrate from REST to GraphQL -- not because of hype, but because their analysis showed that 78% of API calls were over-fetching data by 3-10x, and the client-specific BFF (Backend for Frontend) pattern they'd tried first added latency instead of reducing it."

---

### The Implementation (200-300 words)

[ANSWER-FIRST] Open with the total timeline and team size -- "A [N]-person team completed the implementation in [timeframe]."

**Structure:**
1. **Team and timeline** (1-2 sentences): Who did the work, how long it took, and any phasing.
2. **Step-by-step execution** (numbered list): 4-6 key implementation steps in chronological order. Each step should include what was done, any tools used, and any unexpected challenges.
3. **Tools and technology** (bulleted list): Specific tools, services, and technologies used.
4. **Critical moment** (1-2 sentences): One specific moment where things almost went wrong or an unexpected insight changed the plan.

[IMAGE] Architecture diagram, timeline visualization, or screenshot of the implementation in progress.

[INFO-GAIN: implementation detail] Share a specific technical or operational detail that made a material difference -- a configuration setting, a migration trick, a coordination process. The kind of detail that saves someone else hours.

[STAT: Implementation efficiency metric -- time spent, cost, iterations required]

**Example step:**
> 3. **Deployed edge caching layer** (Week 3-4): Set up Cloudflare Workers as a caching layer between the GraphQL gateway and origin servers. Used stale-while-revalidate with a 60s TTL -- this single change accounted for 40% of the total latency reduction.

---

### The Results (200-300 words)

[ANSWER-FIRST] Open by restating the headline metric, then immediately expand with 2-3 supporting metrics. Use before/after format.

**Structure:**
1. **Headline result** (1 sentence): The primary metric, stated as before -> after with percentage change.
2. **Supporting metrics** (bulleted list): 3-5 additional measurable outcomes, each with before/after values.
3. **Business impact** (1-2 sentences): Translate technical metrics into business outcomes (revenue retained, customers saved, team hours freed, etc.).
4. **Timeline** (1 sentence): When results were measured relative to implementation completion.
5. **Unexpected benefits** (1-2 sentences): Any positive outcomes that weren't part of the original goals.

[VISUAL: grouped-bar chart] Before/after comparison of 3-5 key metrics. Use a grouped bar chart with clear labels showing the "before" and "after" values side by side.

[STAT: All results metrics with specific before/after numbers]

[IMAGE] Screenshot of the "after" state -- the improved dashboard, the clean error logs, the performance graph.

**Example:**
> | Metric | Before | After | Change |
> |--------|--------|-------|--------|
> | API response time (p95) | 1,200ms | 320ms | -73% |
> | Error rate (5xx) | 12% | 0.3% | -97.5% |
> | Infrastructure cost | $8,400/mo | $3,200/mo | -62% |
> | Client satisfaction (NPS) | 24 | 67 | +179% |

---

### Key Takeaways (150-200 words)

[ANSWER-FIRST] Open with the single most transferable lesson: "The biggest lesson from this project is [X]."

**Format:** 3-5 numbered takeaways, each as a bolded insight followed by 1-2 sentences of explanation.

**Criteria for each takeaway:**
- It must be **transferable** -- applicable to the reader's own situation, not just this specific case
- It must be **specific** -- actionable advice, not a platitude
- It must be **earned** -- grounded in what actually happened in this case study

[INFO-GAIN: contrarian or surprising lesson] Include at least one takeaway that challenges conventional wisdom or contradicts common advice in the space.

**Example:**
> **1. Measure the problem before designing the solution.**
> The team spent the first week purely on instrumentation -- adding detailed logging and tracing before writing a single line of migration code. This investment paid for itself by revealing that the real bottleneck wasn't where they assumed (database queries) but in serialization overhead.

[INTERNAL-LINK] Link each takeaway to a related deep-dive post where the reader can learn more about that specific principle.

---

### Frequently Asked Questions (3 questions)

[FAQ]

**Format:** Each question as an H3, answer in 2-4 sentences.

**Question selection criteria:**
1. **Applicability question:** "Would this approach work for [different context]?" (Address transferability)
2. **Resource question:** "What was the budget/team size for this project?" (Address feasibility)
3. **Alternative question:** "What would you do differently if you started over?" (Demonstrate honest reflection)

[STAT: Include at least one statistic in your FAQ answers]

**Example:**

#### Would this approach work for a smaller team?

[2-4 sentence answer addressing how the strategy scales down, with specific modifications for smaller teams.]

#### What was the total cost of this project?

[2-4 sentence answer with transparent cost breakdown -- team time, tools, infrastructure, opportunity cost.]

#### What would you do differently?

[2-4 sentence answer with honest reflection -- this builds trust and demonstrates real expertise.]

---

## Template Checklist

Before publishing, verify:

- [ ] Title includes a specific metric, timeframe, and subject
- [ ] TL;DR box is present and contains the headline result in under 60 words
- [ ] Introduction opens with the result metric, not background context
- [ ] The Challenge section quantifies the problem with specific numbers
- [ ] The Challenge section documents at least one failed prior attempt
- [ ] The Strategy section explains *why* this approach was chosen over alternatives
- [ ] The Strategy section includes enough process detail for replication [INFO-GAIN: process documentation]
- [ ] The Implementation section includes specific tools, timeline, and team size
- [ ] The Results section has before/after metrics for at least 3 KPIs
- [ ] Results include a [VISUAL: grouped-bar chart] for before/after comparison
- [ ] Key Takeaways are transferable, specific, and grounded in the case
- [ ] At least 3 [INFO-GAIN] elements with original process or observational data
- [ ] At least 5 [STAT] markers filled with sourced or first-party statistics
- [ ] FAQ addresses applicability, feasibility, and honest reflection
- [ ] All [INTERNAL-LINK] zones have contextual links to related content
- [ ] Word count falls within 1,500-2,000 range
- [ ] Subject has given permission to be referenced (or case is anonymized)
- [ ] Meta description written (under 160 characters, includes primary keyword and key metric)
