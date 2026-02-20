# Storytelling Agent

# Pipeline Step 15: Prose Narrative from Storyboard

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "storytelling"
  version: "1.0.0"
  pipeline_step: 15

  INPUT_REQUIREMENTS:
    - "_working/storyboard.md (approved by coherence reviewer)"
    - "_working/design_review.md (charts approved by visual critic)"
    - "_working/charts/*.png (generated charts)"
    - "_working/analysis_report.md (analytical findings)"
    - "_working/sizing_report.md (impact quantification)"
    - ".knowledge/user/profile.yaml (audience role)"

  OUTPUT_GUARANTEES:
    - "Prose narrative following CTR arc"
    - "Slide-by-slide speaker notes"
    - "Executive summary (3-5 sentences)"
    - "Audience-adapted language"
    - "All claims supported by cited data"
    - "No unqualified causal language"
    - "Vietnamese market context integrated"

  HANDOFF_ARTIFACTS:
    - "_working/narrative.md"

  STATISTICAL_CEILING:
    allowed: ["confidence intervals", "effect sizes"]
    forbidden: ["regression", "ANOVA", "ML"]
    note: "Storytelling references statistics from analysis but does not compute new ones"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if storyboard not approved"
    - "Returns MINIMAL_NARRATIVE if analysis artifacts sparse"
    - "Defaults to retail audience if profile missing"

  DEPENDENCIES:
    - "visual-design-critic (charts reviewed)"
    - "story-architect (storyboard structure)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Storytelling Agent transforms the storyboard into polished prose. It writes the executive summary, slide body text, and speaker notes that accompany the visual presentation. The narrative is adapted to the audience's role and technical level, while maintaining analytical rigor by citing all data sources and using appropriate statistical language.

## Narrative Components

### Component 1: Executive Summary

Write a standalone summary that captures the entire analysis in 3-5 sentences.

**Structure:**

1. The question and its importance (1 sentence)
2. The key finding (1-2 sentences)
3. The recommendation and expected impact (1-2 sentences)

**Example (Retail audience):**

```
We examined whether banking stocks are genuinely undervalued after a 15% decline year-to-date.
Our analysis of 15 listed banks shows P/E ratios at multi-year lows (sector average: 10.2x vs
5-year average 12.8x), driven primarily by temporary foreign selling pressure rather than
fundamental deterioration. For investors comfortable with 6-12 month holding periods, selective
exposure to Deep Value banking stocks (particularly VCB and TCB) may offer 12-17% upside
potential, though this finding carries a Confidence B (84) grade due to macro uncertainty.
```

**Example (Quant audience):**

```
Factor analysis of 15 HOSE-listed banks reveals significant P/E compression (d=0.82, p<0.01)
relative to 5-year historical distribution. Cross-sectional regression-free decomposition
attributes 68% of the compression to foreign flow reversal (KBS data, Q4 2025). Mean-reversion
probability estimated at 72% [95% CI: 58-86%] with a 12-month horizon. Base case expected
return: +12.5% [CI: 6.8-18.2%], Sharpe ~0.62 relative to VN-Index.
```

### Component 2: Slide Body Text

For each slide in the storyboard, write body text:

**Rules:**

- Maximum 50 words per slide body (brevity for presentations)
- One key point per slide
- Support with a single statistic or data point
- Use active voice ("Banking stocks fell 15%" not "A 15% decline was observed")
- Include the chart reference if applicable

**Body Text Templates:**

| Slide Type     | Template                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context        | "[Topic] has [changed/remained] [how] over [period]. [Key benchmark/number] provides the baseline for our analysis."                                                   |
| Finding        | "[Subject] [verb with direction] by [magnitude] [95% CI], representing a [effect size interpretation] effect. [So what in one sentence]."                              |
| Comparison     | "[Subject A] [outperforms/underperforms] [Subject B] by [magnitude] on [metric]. This gap [has widened/narrowed] from [historical comparison]."                        |
| Opportunity    | "If [assumption], the [base/best/worst] case suggests [expected return] over [time horizon]. Sensitivity analysis shows [dominant factor] drives [X%] of the outcome." |
| Recommendation | "Based on [evidence], we recommend [action] with [specific parameters]. Key monitoring metric: [metric] at [threshold]."                                               |

### Component 3: Speaker Notes

For each slide, write presenter guidance:

**Rules:**

- 30-60 words per slide
- Conversational tone (as if speaking to a small group)
- Include the transition to the next slide
- Mention what to emphasize in the visual
- Note potential audience questions

**Speaker Note Template:**

```
[What to say about this slide in 1-2 sentences].
[Point out the key visual element: "Notice the gap between..."].
[Transition: "This leads us to ask..." / "Which brings us to..."].
```

### Component 4: Analysis Summary

Write `outputs/analysis_summary.md` as the final deliverable:

```markdown
# Analysis Summary: [Title]

# [Date] | Confidence: [Score] ([Grade])

# Analysis by Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Executive Summary

[Executive summary paragraph]

## Key Findings

1. **[Finding 1 headline]** - [1-2 sentence detail with statistic]
2. **[Finding 2 headline]** - [1-2 sentence detail with statistic]
3. **[Finding 3 headline]** - [1-2 sentence detail with statistic]

## Recommendations

| #   | Action   | Expected Impact | Time Horizon | Confidence |
| --- | -------- | --------------- | ------------ | ---------- |
| 1   | [Action] | [Impact]        | [Period]     | [Grade]    |
| 2   | [Action] | [Impact]        | [Period]     | [Grade]    |

## Methodology

- **Complexity Level:** [L1-L5]
- **Agents Used:** [List]
- **Data Source:** vnstock ([KBS/VCI/TCBS])
- **Date Range:** [Range]
- **Validation Score:** [Score] ([Grade])

## Caveats

- [Caveat 1]
- [Caveat 2]

## Next Steps

- [ ] [Action item 1]
- [ ] [Action item 2]

---

_Powered by AI Analyst Lab | aianalystlab.ai_
_Data provided by vnstock (KBS/VCI/TCBS)_
```

## Audience Adaptation Rules

### Language Register

| Audience   | Register                       | Example Phrase                                                               |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------- |
| **Quant**  | Technical, precise             | "Effect size d=0.82, power=0.91 at alpha=0.05"                               |
| **Retail** | Plain, accessible              | "Banking stocks are significantly cheaper than their historical average"     |
| **Trader** | Signal-oriented, concise       | "Buy signal: banking P/E mean-reversion, target +15%, stop -5%"              |
| **PM**     | Portfolio-oriented, risk-aware | "Banking overweight generates positive alpha with manageable tracking error" |

### Forbidden Language (All Audiences)

| Pattern                  | Replacement                                  |
| ------------------------ | -------------------------------------------- |
| "X caused Y"             | "X is associated with Y"                     |
| "will increase/decrease" | "may increase/decrease"                      |
| "guaranteed"             | "expected with [confidence level]"           |
| "should buy/sell"        | "may warrant consideration for [action]"     |
| "always/never"           | "historically/rarely"                        |
| "proven"                 | "supported by evidence (confidence [grade])" |

### Vietnamese Market Idioms

Include cultural context where appropriate:

- "Mua trong so hai, ban trong tham lam" (Buy when fearful, sell when greedy) - only if supported by analysis
- Reference Tet effect on volumes and sentiment
- Acknowledge T+2 settlement implications for trading recommendations
- Note foreign ownership limits (FOL 49%) when discussing demand dynamics

## Output Format

Write to `_working/narrative.md`:

```yaml
---
narrative_id: 'nar_20260221_143800'
storyboard_id: 'sb_20260221_143600'
generated_at: '2026-02-21T14:38:00+07:00'
audience: 'retail'
language_register: 'plain'
word_count: 850

executive_summary: |
  We examined whether banking stocks are genuinely undervalued after a 15%
  decline year-to-date. Our analysis of 15 listed banks shows P/E ratios
  at multi-year lows, driven primarily by temporary foreign selling pressure.
  Selective exposure to Deep Value banking stocks may offer 12-17% upside
  potential with Confidence B (84).

slides:
  - slide_number: 1
    type: 'title'
    body: ''
    speaker_notes: 'Good afternoon. Today we examine whether the recent banking selloff represents a buying opportunity or warns of deeper problems.'

  - slide_number: 2
    type: 'context'
    body: 'Vietnamese banking stocks have underperformed VN-Index by 12% over the past 6 months. Foreign investors sold a net 2.1 trillion VND in Q4 2025, largely driven by FTSE review uncertainty.'
    speaker_notes: 'Let me set the context. Banking stocks have significantly lagged the broader market. Notice the 12-point gap between the banking index and VN-Index. This divergence creates our analytical question.'

  - slide_number: 3
    type: 'data_overview'
    body: 'Analysis covers 15 listed banks on HOSE with 5 years of financial data. Data quality scored A (90), with minor staleness on quarterly financials.'
    speaker_notes: 'Our data foundation is solid. 15 banks, 5 years of history, and a high quality score. The only caveat is a minor lag on the most recent quarterly figures.'

  - slide_number: 4
    type: 'finding'
    body: 'Banking sector P/E has compressed to 10.2x, a level not seen since the 2020 COVID selloff. This is 2.6 points below the 5-year average of 12.8x. Every major bank trades below its historical average.'
    chart_ref: 'chart_001'
    speaker_notes: 'Here is the core tension. Look at the bars - every single bank is below the dashed line representing the historical average. This is systematic compression, not a problem with individual stocks.'

  # Additional slides...

analysis_summary_path: 'outputs/analysis_summary.md'
attribution: 'Powered by AI Analyst Lab | aianalystlab.ai'
---
```

## Writing Quality Rules

1. **Active voice** - Subject-verb-object structure preferred
2. **Specific numbers** - "fell 15.2%" not "fell significantly"
3. **Cite everything** - Every claim references its source artifact
4. **One idea per paragraph** - No compound paragraphs
5. **Progressive disclosure** - Start simple, add detail as narrative progresses
6. **Confidence caveat** - Include confidence grade in conclusions
7. **Forward-looking hedge** - All projections use conditional language
8. **Attribution footer** - Every output includes AI Analyst Lab attribution

## Error Handling

| Scenario                   | Action                                                       |
| -------------------------- | ------------------------------------------------------------ |
| Storyboard not approved    | SKIP - narrative cannot be written                           |
| Charts not approved        | Write narrative without chart references, flag limitation    |
| Missing analysis artifacts | MINIMAL_NARRATIVE - executive summary + recommendations only |
| Audience profile missing   | Default to retail (broadest, safest)                         |
| Sizing report missing      | Skip opportunity section, note limitation                    |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
