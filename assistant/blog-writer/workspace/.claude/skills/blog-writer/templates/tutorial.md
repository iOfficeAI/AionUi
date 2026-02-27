# Template: Tutorial (Code/Tool Walkthrough)

**Template ID:** tutorial
**Target Length:** 2,000-3,000 words
**Content Type:** Technical walkthrough with step-by-step instructions
**Primary Search Intent:** Informational / Transactional ("how to," "tutorial," "guide," "setup")

## When to Use This Template

Use this template when:
- Teaching readers how to build, configure, or implement something specific
- The outcome is a working piece of code, a configured tool, or a completed setup
- The audience needs to follow along step by step
- Search queries include "how to," "tutorial," "step by step," "setup," "install," "configure"
- You have hands-on experience with the tool/technology and can share optimization tips

Do NOT use this template for:
- High-level strategy or opinion pieces (use news-analysis or data-research)
- Reference/FAQ content (use faq-knowledge)
- Content without concrete, reproducible steps

---

## Title Format

```
[Tool/Technology] Tutorial: [Specific Outcome] in [Year]
```

**Examples:**
- "Claude Code Tutorial: Building a Blog Automation Pipeline in 2026"
- "Next.js 15 Tutorial: Server Components API Route in 2026"
- "Docker Compose Tutorial: Multi-Container Dev Environment in 2026"

**Title Rules:**
- Include the primary tool/technology name
- State the specific outcome the reader will achieve
- Include the current year for freshness signals
- Keep under 60 characters for full SERP display when possible

---

## Section-by-Section Structure

---

### TL;DR Box (40-60 words)

[ANSWER-FIRST] Summarize what the reader will build or achieve in 2-3 sentences. State the end result, the primary tool, and the approximate time to complete. This box should be extractable as a standalone snippet.

```markdown
> **TL;DR:** [What you'll build/achieve in one sentence]. Using [primary tool/technology],
> you'll [specific outcome] in approximately [time estimate]. By the end, you'll have
> [concrete deliverable]. No prior experience with [tool] is required beyond [minimum prerequisite].
```

[INFO-GAIN: state what makes this tutorial different from existing ones — unique approach, updated method, or real-world context]

---

### Prerequisites (100-150 words)

[ANSWER-FIRST] State exactly what the reader needs before starting. Be specific about versions.

**Include:**
- Required tools with exact version numbers
- Operating system compatibility notes
- Prior knowledge level (beginner/intermediate/advanced)
- Accounts or API keys needed
- Estimated completion time

```markdown
**You'll need:**
- [Tool 1] v[X.X] or later ([install link])
- [Tool 2] v[X.X] or later ([install link])
- [Account/API key] ([signup link])
- Basic familiarity with [concept]
- ~[N] minutes to complete

**Tested on:** [OS/environment details]
```

[STAT: adoption rate or popularity metric for the primary tool to validate the tutorial's relevance]

---

### What We're Building (100-150 words)

[ANSWER-FIRST] Describe the end result in concrete terms. What does the finished product do? What does it look like?

```markdown
Here's what the finished [project] looks like:

[IMAGE: screenshot or demo of the completed project]

**What it does:**
- [Capability 1]
- [Capability 2]
- [Capability 3]

**Architecture overview:**
[VISUAL: simple-diagram showing components/data flow]
```

[INTERNAL-LINK: link to any prerequisite tutorials or foundational concepts]

---

### Setup (200-300 words)

[ANSWER-FIRST] State what the setup accomplishes and how long it takes.

**Structure:**
1. Environment setup (directory structure, project initialization)
2. Installation of dependencies
3. Configuration files
4. Verification that setup is correct

```markdown
## Setting Up Your Environment

[ANSWER-FIRST] The setup takes approximately [N] minutes and gets your [tool/environment] ready for [the tutorial steps].

### Step 1: [Initialize/Create/Clone]

[Brief explanation of what this does and why]

\`\`\`bash
# [Descriptive comment]
[command 1]
[command 2]
\`\`\`

### Step 2: [Install Dependencies]

\`\`\`bash
# [Descriptive comment]
[command]
\`\`\`

### Step 3: [Configure]

\`\`\`[language]
// [config filename]
{
  [configuration with inline comments]
}
\`\`\`

[IMAGE: screenshot of setup completion / expected terminal output]

**Verify your setup:**

\`\`\`bash
[verification command]
\`\`\`

Expected output:
\`\`\`
[expected output]
\`\`\`
```

**Common setup errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| [Error message] | [Why it happens] | [How to fix] |
| [Error message] | [Why it happens] | [How to fix] |

---

### Step-by-Step Sections (300-400 words each, 4-6 steps)

Each step is an H2 heading. Follow this structure for every step:

```markdown
## Step [N]: [Action Verb] + [What You're Doing]

[ANSWER-FIRST] In this step, you'll [what this step accomplishes] so that [why it matters for the final outcome].

[Brief explanation of the concept behind this step — 2-3 sentences max]

\`\`\`[language]
// [filename where this code goes]

[code block with detailed inline comments]

// [Explain non-obvious lines]
\`\`\`

[IMAGE: screenshot showing the result of this step]

**What just happened:** [1-2 sentence explanation of what the code does]

**Expected output:**

\`\`\`
[terminal output or browser result]
\`\`\`

[INFO-GAIN: optimization tips from experience — what to tweak, performance considerations, or real-world adjustments you've discovered]

> **Watch out:** [Common mistake at this step and how to avoid it]

[INTERNAL-LINK: link to deeper explanation of key concepts used in this step]
```

**Rules for step sections:**
- Each step should produce a visible, testable result
- Code blocks must be complete and copy-pasteable (no ellipsis or "..." shortcuts)
- Include the filename where code should be placed
- Show expected output so readers can verify they're on track
- Address the most common error for each step inline
- Each step builds on the previous one — never skip dependencies

---

### Testing/Verification (200-300 words)

[ANSWER-FIRST] Describe how to verify the complete project works as expected.

```markdown
## Testing Your [Project]

[ANSWER-FIRST] Run these [N] tests to verify everything works correctly.

### Quick Smoke Test

\`\`\`bash
[single command that verifies basic functionality]
\`\`\`

Expected result:
\`\`\`
[expected output]
\`\`\`

### Full Test Suite

\`\`\`bash
[command to run all tests]
\`\`\`

[IMAGE: screenshot of passing tests]

### Manual Verification Checklist

- [ ] [Check 1]: [How to verify]
- [ ] [Check 2]: [How to verify]
- [ ] [Check 3]: [How to verify]

[VISUAL: flowchart of the verification process if complex]
```

---

### Troubleshooting (200-300 words)

[ANSWER-FIRST] List the most common issues readers encounter and their solutions.

```markdown
## Troubleshooting

[ANSWER-FIRST] Here are the [N] most common issues and how to fix them.

| Problem | Symptom | Solution |
|---------|---------|----------|
| [Issue 1] | [What you see] | [Exact fix with command] |
| [Issue 2] | [What you see] | [Exact fix with command] |
| [Issue 3] | [What you see] | [Exact fix with command] |
| [Issue 4] | [What you see] | [Exact fix with command] |
| [Issue 5] | [What you see] | [Exact fix with command] |

[INFO-GAIN: edge cases or environment-specific issues discovered through real-world testing]

**Still stuck?** [Link to community, issue tracker, or support channel]
```

[STAT: percentage of users who encounter each issue, if available from documentation or forums]

---

### Next Steps (100-150 words)

[ANSWER-FIRST] Tell the reader what to do next to extend or build on what they've learned.

```markdown
## Next Steps

[ANSWER-FIRST] Now that you have a working [project], here's how to take it further.

**Extend this project:**
- [Enhancement 1]: [Brief description] — [INTERNAL-LINK to related tutorial]
- [Enhancement 2]: [Brief description] — [INTERNAL-LINK to related tutorial]
- [Enhancement 3]: [Brief description]

**Related tutorials:**
- [INTERNAL-LINK: prerequisite or foundational tutorial]
- [INTERNAL-LINK: advanced tutorial building on this one]
- [INTERNAL-LINK: alternative approach or complementary tool]

**Official resources:**
- [Link to official documentation]
- [Link to GitHub repo or examples]
```

---

### FAQ (3-5 Technical Questions)

[ANSWER-FIRST] for each question. Each answer should be self-contained and extractable.

```markdown
## Frequently Asked Questions

### [Question 1 — phrased as users would search it]?

[ANSWER-FIRST] [Direct answer in 1-2 sentences]. [Supporting detail or example].

[STAT: relevant data point if applicable]

### [Question 2]?

[ANSWER-FIRST] [Direct answer in 1-2 sentences]. [Supporting detail or code snippet].

### [Question 3]?

[ANSWER-FIRST] [Direct answer in 1-2 sentences]. [Comparison or recommendation].

[INTERNAL-LINK: link to content that covers this question in depth]
```

**FAQ Rules:**
- Phrase questions exactly as users would type them into a search engine
- Answer in the first sentence — no throat-clearing
- Include code snippets in answers when relevant
- Target Google Featured Snippet extraction (40-60 word answers)

---

### Full Source Code Reference

```markdown
## Complete Source Code

[Expandable block or link to full source]

<details>
<summary>Click to expand full source code</summary>

\`\`\`[language]
[Complete, runnable source code with comments]
\`\`\`

</details>

**GitHub repository:** [link if applicable]
```

---

## Content Checklist

Before publishing, verify:

- [ ] Title includes tool name, specific outcome, and year
- [ ] TL;DR is 40-60 words and extractable as a snippet
- [ ] All prerequisites are listed with exact versions
- [ ] Every code block is complete and copy-pasteable
- [ ] Every step produces a visible, testable result
- [ ] Expected output is shown after each code block
- [ ] At least 4 [IMAGE] markers placed at key visual moments
- [ ] At least 2 [INFO-GAIN] sections with original tips/experience
- [ ] At least 2 [STAT] markers with relevant data points
- [ ] At least 1 [VISUAL] marker for architecture or flow diagrams
- [ ] Troubleshooting table has 5+ common errors
- [ ] FAQ has 3-5 questions phrased as search queries
- [ ] [INTERNAL-LINK] zones placed in Prerequisites, Steps, Next Steps, and FAQ
- [ ] Full source code is included at the end
- [ ] All code tested and verified before publishing
