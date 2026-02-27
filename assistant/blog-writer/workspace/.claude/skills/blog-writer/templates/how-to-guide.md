# Template: How-To Guide

**Template Name:** How-To Guide (Step-by-Step Tutorial)
**Target Word Count:** 2,000-2,500 words
**Description:** A structured, actionable tutorial that walks readers through a specific process from start to finish. Each step is concrete, visual, and builds on the previous one. Designed to rank for "how to" queries and earn featured snippets.

## When to Use This Template

- **Content Goals:** Drive organic traffic from instructional queries, establish topical authority, earn featured snippets for step-based queries
- **Search Intent:** Informational / Transactional hybrid -- the reader has a specific problem and wants a clear solution *right now*
- **Best For:** Process explanations, software tutorials, setup guides, configuration walkthroughs, skill-building content
- **Avoid When:** The topic lacks a clear sequential process or has fewer than 3 meaningful steps

---

## Section-by-Section Structure

---

### Title (H1)

**Format:** "How to [Achieve X]: A [Year] Step-by-Step Guide"

**Examples:**
- "How to Set Up a CI/CD Pipeline: A 2026 Step-by-Step Guide"
- "How to Migrate from WordPress to Next.js: A 2026 Step-by-Step Guide"

**Rules:**
- Include the primary keyword naturally
- Include the year for freshness signals
- Keep under 60 characters if possible

---

### Introduction (150-200 words)

[ANSWER-FIRST] Open with the single most compelling statistic or fact that validates *why* this process matters. Not a vague claim -- a specific number.

**Structure:**
1. **Problem statement** (1-2 sentences): What pain point does the reader have?
2. **Agitation** (1-2 sentences): What happens if they don't solve it? What's the cost of inaction?
3. **Promise** (1 sentence): What will they be able to do after following this guide?
4. **Credibility anchor** (1 sentence): Why should they trust this guide specifically?

[STAT: Industry statistic that quantifies the problem this guide solves]

[INFO-GAIN: personal experience] Share a specific, brief anecdote about encountering this problem yourself -- when, what happened, what the stakes were.

**Example opening:**
> "[STAT: 73% of deployments fail due to misconfigured pipelines (Source, Year).] If you've ever pushed code on a Friday and spent the weekend firefighting, you already know the pain. This guide walks you through setting up a bulletproof CI/CD pipeline in under an hour -- the same process we used to reduce deployment failures by 90% across 12 projects."

[INTERNAL-LINK] Link to a related foundational concept post (e.g., "If you're new to [topic], start with our [Beginner's Guide to X]").

---

### Prerequisites / Before You Begin (100-150 words)

**Format:** Bulleted checklist under an H2 heading.

**Include:**
- Required tools/software (with versions)
- Required accounts or access
- Assumed knowledge level (be specific: "You should be comfortable with [X]")
- Estimated time to complete
- Difficulty level (Beginner / Intermediate / Advanced)

[IMAGE] Screenshot or diagram showing the tools/environment the reader should have ready before starting.

**Example:**
> **What you'll need:**
> - Node.js v20+ installed ([how to install](/link))
> - A GitHub account with repo access
> - Basic familiarity with the terminal
> - **Time:** ~45 minutes
> - **Difficulty:** Intermediate

---

### Step 1: [Action Verb] + [Specific Object] (200-300 words)

[ANSWER-FIRST] Open with what the reader will have accomplished by the end of this step -- the micro-outcome.

**Structure for EVERY step section:**
1. **Micro-outcome statement** (1 sentence): "By the end of this step, you'll have [specific result]."
2. **Context** (1-2 sentences): Why this step matters in the overall process.
3. **Instructions** (numbered sub-steps): Concrete actions. Use code blocks, exact UI paths, or specific settings.
4. **Verification** (1-2 sentences): How the reader confirms this step worked.

[IMAGE] Screenshot showing the expected state after completing this step.

[INFO-GAIN: specific configuration or setting] Share a non-obvious detail -- a specific config value, flag, or option that makes a difference and isn't in the official docs.

**Formatting rules:**
- Use H2 for the step heading: `## Step 1: Install and Configure the CLI`
- Use numbered sub-lists for individual actions within the step
- Use code blocks for any commands, file contents, or configuration
- Bold the single most important instruction in each step

---

### Step 2: [Action Verb] + [Specific Object] (200-300 words)

[Follow the same structure as Step 1]

[IMAGE] Screenshot of expected state after this step.

[STAT: Performance or efficiency metric related to this step, if applicable]

---

### Step 3: [Action Verb] + [Specific Object] (200-300 words)

[Follow the same structure as Step 1]

[IMAGE] Screenshot of expected state after this step.

[VISUAL: flowchart] If the process branches or has decision points at this stage, include a flowchart showing the paths.

---

### Step 4: [Action Verb] + [Specific Object] (200-300 words)

[Follow the same structure as Step 1]

[IMAGE] Screenshot of expected state after this step.

[INFO-GAIN: troubleshooting tip] Share a problem you personally encountered at this stage and how you solved it.

---

### Step 5: [Action Verb] + [Specific Object] (200-300 words)

[Follow the same structure as Step 1]

[IMAGE] Screenshot of expected state after this step.

---

### Step 6: [Action Verb] + [Specific Object] (200-300 words)

[Follow the same structure as Step 1]

[IMAGE] Screenshot showing the final completed state.

[VISUAL: before-after] Side-by-side comparison showing before (Step 1) and after (Step 6) state.

**Note:** Not every guide needs exactly 6 steps. Use 4-8 steps depending on the complexity of the process. Each step should represent a meaningful, testable milestone -- not a trivial action.

---

### Common Mistakes to Avoid (150-200 words)

[ANSWER-FIRST] Open with the single most frequent mistake and its consequence: "[X]% of people get stuck on [Y] because they [Z]."

**Format:** 3-5 mistakes, each as a bolded sub-heading with 2-3 sentences of explanation.

**Structure for each mistake:**
1. **The mistake** (bold): What people do wrong
2. **Why it happens** (1 sentence): The underlying cause or misconception
3. **The fix** (1 sentence): What to do instead

[INFO-GAIN: original observation] Include at least one mistake that comes from your direct experience -- something not commonly listed in other guides.

[STAT: Failure rate or error frequency for the most common mistake]

**Example:**
> **1. Skipping environment variable validation**
> Most tutorials assume your `.env` file is correctly formatted, but in our experience, 40% of "it works on my machine" bugs trace back to missing or malformed env vars. Always run `printenv | grep APP_` before deploying.

---

### Results / What Success Looks Like (100-150 words)

[ANSWER-FIRST] Open with the specific, measurable outcome: "If everything went correctly, you should now see [X]."

**Include:**
- What the reader should see/have now (concrete, verifiable)
- Key metrics that indicate success (load time, response code, test pass rate, etc.)
- One "stretch goal" or next-level enhancement they can pursue

[IMAGE] Screenshot of the final successful result.

[VISUAL: metrics-dashboard] If applicable, show a performance or status dashboard screenshot.

[INTERNAL-LINK] Link to an advanced guide or next-step post: "Now that you've set up [X], learn how to [optimize/scale/extend it]."

---

### Frequently Asked Questions (5 questions)

[FAQ]

**Format:** Each question as an H3, answer in 2-4 sentences. Structure answers for featured snippet eligibility.

**Question selection criteria:**
1. The most common "People Also Ask" question for this topic
2. A question about an alternative approach ("Can I do this with [Y] instead?")
3. A question about troubleshooting ("What if [X] doesn't work?")
4. A question about scaling or advanced use ("How do I [extend this]?")
5. A question about cost, time, or prerequisites ("How long does this take?" / "Is [X] free?")

[STAT: Include at least one statistic in your FAQ answers]

**Example:**

#### How long does it take to set up a CI/CD pipeline?

[2-4 sentence answer with a specific time range and what variables affect it.]

#### Can I use [Alternative Tool] instead?

[2-4 sentence answer comparing the alternative, with a clear recommendation.]

#### What should I do if Step [N] fails?

[2-4 sentence answer with specific troubleshooting steps.]

#### How do I scale this for a larger team?

[2-4 sentence answer with concrete next steps.]

#### Is [Tool/Service] free?

[2-4 sentence answer with pricing details and free tier limitations.]

---

### Conclusion with CTA (50-100 words)

**Structure:**
1. **Recap** (1 sentence): Summarize what they accomplished.
2. **Reinforce value** (1 sentence): Restate the benefit with the key metric.
3. **CTA** (1-2 sentences): Clear next action -- share the post, subscribe, try a related guide, leave a comment with their results.

[INTERNAL-LINK] Link to 2-3 related posts for continued reading.

---

## Template Checklist

Before publishing, verify:

- [ ] Title includes primary keyword and current year
- [ ] Introduction opens with a specific statistic, not a generic claim
- [ ] Every step has a clear micro-outcome, numbered sub-steps, and verification
- [ ] Every step has a supporting screenshot or visual
- [ ] At least 2 [INFO-GAIN] elements with original experience or data
- [ ] At least 3 [STAT] markers filled with sourced statistics
- [ ] Common mistakes section includes at least one original observation
- [ ] FAQ answers are structured for featured snippet eligibility
- [ ] All [INTERNAL-LINK] zones have contextual links to related content
- [ ] Word count falls within 2,000-2,500 range
- [ ] All code blocks are syntax-highlighted and tested
- [ ] Meta description written (under 160 characters, includes primary keyword)
