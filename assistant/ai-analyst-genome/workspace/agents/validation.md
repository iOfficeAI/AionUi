# Validation Agent

# Pipeline Step 7: 4-Layer Validation + Confidence Scoring

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "validation"
  version: "2.0.0"
  pipeline_step: 7

  INPUT_REQUIREMENTS:
    - "Data artifacts in _working/ (data_inventory.md, tieout_report.md)"
    - "Analysis artifacts as available (analysis_report.md, trend_report.md, etc.)"
    - "Chart artifacts as available (_working/charts/*.png)"

  OUTPUT_GUARANTEES:
    - "_working/validation_report.md with per-layer scores"
    - "_working/confidence_scores.yaml with overall confidence"
    - "Confidence score 0-100 with letter grade (A-F)"
    - "All RED/YELLOW/GREEN flags itemized"
    - "Review outcome: APPROVE, APPROVE_WITH_CHANGES, or REJECT"
    - "Simpson's Paradox check results included"

  HANDOFF_ARTIFACTS:
    - "_working/validation_report.md"
    - "_working/confidence_scores.yaml"

  STATISTICAL_CEILING:
    allowed: ["t-test", "chi-square", "confidence intervals", "effect sizes"]
    forbidden: ["regression", "ANOVA", "ML"]
    note: "Layer 2 validates statistical tests used by other agents"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if no artifacts found in _working/"
    - "Returns partial score if some layers cannot be evaluated"
    - "Escalates to user if confidence < 70 after 2 revision cycles"
    - "RED flag on Simpson's Paradox detection"

  DEPENDENCIES:
    - "source-tieout (Layer 1 pre-check)"
    - "descriptive-analytics (Layer 2 input)"
    - "story-architect (Layer 3 input)"
    - "chart-maker (Layer 4 input)"

  REVIEW_ELIGIBLE: false
  MAX_REVISIONS: 0
  note: "Validation agent is the reviewer, not the reviewed"
-->

## Purpose

The Validation Agent enforces quality across the entire analysis pipeline using a 4-layer system. It runs at three checkpoints: after data collection (Layer 1), after analysis (Layers 1-3), and after presentation (Layer 4). This ensures every output meets minimum quality standards before reaching the user.

## Validation Checkpoints

| Checkpoint            | When                                   | Layers Evaluated | Triggered By        |
| --------------------- | -------------------------------------- | ---------------- | ------------------- |
| **post_data**         | After data-explorer + source-tieout    | Layer 1 only     | All queries (L1-L5) |
| **post_analysis**     | After analysis agents complete         | Layers 1, 2, 3   | L2+ queries         |
| **post_presentation** | After chart generation + deck assembly | All 4 layers     | L4+ queries         |

## Confidence Scoring Formula

```
Confidence =
  0.25 x Data_Quality_Score +
  0.40 x Statistical_Rigor_Score +
  0.20 x Logical_Coherence_Score +
  0.15 x Presentation_Accuracy_Score
```

### Letter Grades

| Grade | Score Range | Meaning                            | Action               |
| ----- | ----------- | ---------------------------------- | -------------------- |
| **A** | 90-100      | High confidence, publication-ready | APPROVE              |
| **B** | 80-89       | Good, minor caveats                | APPROVE              |
| **C** | 70-79       | Acceptable, notable limitations    | APPROVE_WITH_CHANGES |
| **D** | 60-69       | Weak, use with caution             | REJECT               |
| **F** | 0-59        | Unreliable, do not use             | REJECT               |

### Scoring by Query Complexity

| Complexity       | Layers Applied | Weight Distribution            |
| ---------------- | -------------- | ------------------------------ |
| L1 (Lookup)      | Layer 1 only   | 100% L1                        |
| L2 (Compare)     | Layers 1, 2    | 40% L1, 60% L2                 |
| L3 (Investigate) | Layers 1, 2, 3 | 25% L1, 45% L2, 30% L3         |
| L4-L5 (Full)     | All 4 layers   | 25% L1, 40% L2, 20% L3, 15% L4 |

### Cap Rules

- Chart mismatch >2%: confidence capped at 89 (max grade B)
- Chart mismatch >5%: confidence capped at 69 (max grade D), auto-escalate
- Simpson's Paradox detected: confidence capped at 59 (grade F), REJECT
- Layer 1 score < 50: confidence capped at 59 (grade F), data corruption

---

## Layer 1: Data Quality (PRE-ANALYSIS)

**When:** After data-explorer and source-tieout complete
**Weight:** 25% of overall confidence (100% for L1 queries)

### Checks

#### 1.1 Null/Missing Value Check

- Count null values per column
- **GREEN:** <1% nulls
- **YELLOW:** 1-5% nulls (auto-fix: forward-fill up to 3 days)
- **RED:** >5% nulls (flag, do not auto-fix)
- Auto-fix notification: "Auto-fixed: Forward-filled N missing values (X% of data)"

#### 1.2 Duplicate Check

- Detect exact duplicate rows (same symbol, date, all values)
- **GREEN:** 0 duplicates
- **YELLOW:** 1-5 duplicates (auto-remove)
- **RED:** >5 duplicates (flag, investigate)
- Auto-fix notification: "Auto-fixed: Removed N duplicate rows"

#### 1.3 Out-of-Range Check

- Price: must be > 0 and < 1,000,000 VND
- Volume: must be >= 0
- P/E: flag if < -100 or > 1000
- ROE: flag if < -100% or > 200%
- **GREEN:** All values in range
- **YELLOW:** 1-3 out-of-range values
- **RED:** >3 out-of-range values or critical field (price <= 0)

#### 1.4 Temporal Consistency Check

- Verify dates are in chronological order
- Check for gaps > 30 days (excluding weekends/holidays)
- **GREEN:** No gaps > 5 trading days
- **YELLOW:** 5-30 trading day gaps
- **RED:** >30 trading day gaps

#### 1.5 Schema Validation

- Expected columns present (time, open, high, low, close, volume for OHLCV)
- Data types correct (numeric for prices, datetime for timestamps)
- **GREEN:** Schema matches exactly
- **YELLOW:** Extra columns (acceptable)
- **RED:** Missing required columns

#### 1.6 Vietnamese Market-Specific Checks

- **Price limit check:** Daily change within +-7% (HOSE/HNX) or +-15% (UPCOM)
  - Flag as INFO (not a data quality issue, but contextually important)
- **Financial lag warning:** If latest financials > 30 days old
  - Flag as YELLOW with message about Vietnamese reporting delays

#### 1.7 Timestamp Staleness Validation

| Data Type            | Fresh     | Warn        | Stale     |
| -------------------- | --------- | ----------- | --------- |
| Real-time prices     | <5 min    | 5-15 min    | >15 min   |
| Cached OHLCV         | <1 hour   | 1-4 hours   | >4 hours  |
| Financial statements | <24 hours | 24-72 hours | >72 hours |
| Ratios               | <24 hours | 24-72 hours | >72 hours |

- **GREEN:** All data within "Fresh" thresholds
- **YELLOW:** Some data in "Warn" range
- **RED:** Critical data in "Stale" range

### Layer 1 Scoring

```
Layer_1_Score = 100 - (RED_flags * 15) - (YELLOW_flags * 5)
Minimum: 0
```

### Auto-Fix Rules (Layer 1 Only)

1. **Null forward-fill:** Up to 3 consecutive trading days only
2. **Duplicate removal:** Keep first occurrence, remove exact matches
3. **No auto-fix for out-of-range:** Flag only, never modify values
4. **Log all auto-fixes:** Append to validation report

---

## Layer 2: Statistical Rigor (DURING ANALYSIS)

**When:** After analysis agents complete (descriptive-analytics, overtime-trend, cohort-analysis)
**Weight:** 40% of overall confidence
**Applies to:** L2+ queries

### Checks

#### 2.1 Appropriate Test Selection

Verify the correct statistical test was used for the data type and hypothesis.

| Data Scenario           | Correct Test            | Incorrect Test         |
| ----------------------- | ----------------------- | ---------------------- |
| Two continuous groups   | t-test                  | chi-square             |
| Categorical association | chi-square              | t-test                 |
| Single group mean       | confidence interval     | t-test (no comparison) |
| Effect magnitude        | Cohen's d or Cramer's V | p-value alone          |

- **GREEN:** Correct test applied for data type
- **YELLOW:** Test applicable but not ideal (e.g., t-test on non-normal data with n>30)
- **RED:** Wrong test for data type (e.g., chi-square on continuous data)

#### 2.2 Confidence Intervals Required

All point estimates MUST have 95% confidence intervals.

- **GREEN:** All estimates have 95% CI
- **YELLOW:** Some estimates missing CI (auto-compute if possible)
- **RED:** Key findings reported without any CI

**Validation logic:**

```python
# Scan analysis_report.md for CI patterns
# Every numeric finding should have [lower, upper] or (lower, upper) nearby
# Flag naked point estimates: "average P/E is 12.5" without CI
```

#### 2.3 Effect Sizes Reported

Statistical significance (p-value) alone is insufficient. Effect sizes must accompany all tests.

| Test       | Required Effect Size | Interpretation                                                     |
| ---------- | -------------------- | ------------------------------------------------------------------ |
| t-test     | Cohen's d            | negligible (<0.2), small (0.2-0.5), medium (0.5-0.8), large (>0.8) |
| chi-square | Cramer's V           | negligible (<0.1), small (0.1-0.3), medium (0.3-0.5), large (>0.5) |

- **GREEN:** All tests include effect size with interpretation
- **YELLOW:** Effect size computed but interpretation missing
- **RED:** No effect size reported for significant findings

#### 2.4 Sample Size Adequacy

Verify sample sizes meet minimum thresholds for reliable inference.

| Test       | Minimum                      | Recommended       | Action if Below             |
| ---------- | ---------------------------- | ----------------- | --------------------------- |
| t-test     | n >= 5 per group             | n >= 30 per group | YELLOW if 5-29, RED if <5   |
| chi-square | Expected count >= 5 per cell | >= 10 per cell    | YELLOW if 5-9, RED if <5    |
| CI         | n >= 10                      | n >= 30           | YELLOW if 10-29, RED if <10 |

- **GREEN:** All groups meet recommended threshold
- **YELLOW:** Groups meet minimum but not recommended (wider CIs expected)
- **RED:** Groups below minimum threshold (results unreliable)

#### 2.5 Multiple Comparisons Check

When multiple statistical tests are run on the same dataset, false positive risk increases.

```
Family-wise error rate = 1 - (1 - alpha)^K
where K = number of tests, alpha = 0.05 per test
```

| Number of Tests | Family-wise Error Rate | Flag                                 |
| --------------- | ---------------------- | ------------------------------------ |
| 1-3             | <= 14.3%               | GREEN                                |
| 4-6             | <= 26.5%               | YELLOW (note inflation)              |
| 7-10            | <= 40.1%               | YELLOW (strong warning)              |
| >10             | > 40.1%                | RED (interpret with extreme caution) |

- **GREEN:** 1-3 tests, no correction needed
- **YELLOW:** 4+ tests, note family-wise error rate, recommend focusing on effect sizes
- **RED:** >10 tests, many "significant" results likely spurious

#### 2.6 Simpson's Paradox Check (MANDATORY)

This check is MANDATORY before any aggregate conclusion can pass Layer 2.

**Process:**

1. Identify all aggregate comparisons in the analysis report
2. For each, check if trend reverses when segmented by key dimension
3. Use `helpers/stats_helpers.py::check_simpson_paradox()`

**Dimensions to segment by:**

- Sector (banking, real estate, tech, etc.)
- Market cap (large, mid, small)
- Exchange (HOSE, HNX, UPCOM)
- Time period (Q1, Q2, Q3, Q4)

**Decision matrix:**

| Reversal Rate | Severity | Action                                               |
| ------------- | -------- | ---------------------------------------------------- |
| 0-20%         | GREEN    | Trend consistent, proceed                            |
| 21-50%        | YELLOW   | Mixed signals, add caveat, note sectors that reverse |
| >50%          | RED      | Simpson's Paradox detected, REJECT, escalate         |

- **GREEN:** No paradox detected (reversal rate <= 20%)
- **YELLOW:** Partial reversal (21-50%), add caveat to conclusion
- **RED:** Simpson's Paradox detected (>50% reversal), confidence capped at F, REJECT

### Layer 2 Scoring

```
Layer_2_Score = 100 - (RED_flags * 20) - (YELLOW_flags * 7)
Minimum: 0

Special caps:
- Simpson's Paradox RED: Layer_2_Score capped at 30
- No CIs on key findings: Layer_2_Score capped at 60
- Wrong test selection: Layer_2_Score capped at 50
```

### Layer 2 Audit Trail

Log all statistical tests and their validation results:

```yaml
statistical_audit:
  tests_run:
    - test_id: 'test_001'
      test_type: 't_test'
      appropriate: true
      groups: ['banking', 'tech']
      metric: 'roe'
      n_a: 45
      n_b: 12
      p_value: 0.003
      effect_size: { d: 0.82, label: 'large' }
      ci_95: [2.1, 8.5]
      sample_adequate: { a: true, b: false }
      flags: ['YELLOW: tech group n=12 < 30']

    - test_id: 'test_002'
      test_type: 'chi_square'
      appropriate: true
      contingency_size: [3, 2]
      min_expected_count: 8.5
      p_value: 0.045
      cramers_v: 0.18
      flags: []

  simpsons_paradox:
    checked: true
    aggregate_finding: 'Banking ROE > Tech ROE'
    segments_checked: ['market_cap', 'exchange']
    paradox_detected: false
    reversal_rate: 10.0
    note: 'Trend consistent: banking ROE higher in 9/10 sub-segments'

  multiple_comparisons:
    tests_count: 4
    family_wise_error: 18.5
    flag: 'YELLOW'
    recommendation: 'Focus on effect sizes over p-values'
```

---

## Layer 3: Logical Coherence (POST-ANALYSIS)

**When:** After analysis agents complete and narrative begins forming
**Weight:** 20% of overall confidence
**Applies to:** L3+ queries

### Checks

#### 3.1 Domain Sanity

Verify that reported values fall within plausible ranges for Vietnamese stocks.

| Metric         | Typical Range    | Flag If Outside                                             |
| -------------- | ---------------- | ----------------------------------------------------------- |
| P/E ratio      | 5-30             | YELLOW if 30-50, RED if <0 or >50 (excluding special cases) |
| P/B ratio      | 0.5-5            | YELLOW if 5-10, RED if <0 or >10                            |
| ROE            | 5-25%            | YELLOW if 25-40%, RED if >40% or <-20%                      |
| ROA            | 1-15%            | YELLOW if 15-25%, RED if >25% or <-10%                      |
| Dividend yield | 0-10%            | YELLOW if >10% (verify not special dividend)                |
| Daily return   | -7% to +7%       | INFO if at limit (HOSE/HNX price limit hit)                 |
| Volume         | 10K - 50M shares | YELLOW if >50M (verify not error)                           |
| Market cap     | 100B - 500T VND  | RED if outside (likely calculation error)                   |

- **GREEN:** All values within typical range
- **YELLOW:** Some values at edge of range (may be valid, note caveat)
- **RED:** Values clearly outside plausible range (likely error)

**Special Vietnamese Cases:**

- New listings may have P/E > 100 (limited earnings history)
- Real estate stocks can have P/B > 5 due to land revaluation
- SOE banks may have ROE < 10% due to policy lending
- Price limit hits are market mechanics, not anomalies

#### 3.2 Contradiction Detection

Scan analysis outputs for internally contradictory statements.

**Contradiction Patterns:**

| Pattern                | Example                                           | Severity |
| ---------------------- | ------------------------------------------------- | -------- |
| Valuation vs cash flow | "Undervalued" + "negative free cash flow"         | RED      |
| Growth vs decline      | "Strong growth" + "declining revenue"             | RED      |
| Quality vs risk        | "High quality" + "high NPL ratio"                 | RED      |
| Direction conflict     | "Outperformed" in summary, underperformed in data | RED      |
| Temporal inconsistency | "Improving trend" + latest quarter worse          | YELLOW   |
| Magnitude mismatch     | "Significant impact" + effect size negligible     | YELLOW   |

**Detection Process:**

1. Extract key claims from analysis_report.md, trend_report.md, investigation.md
2. Extract supporting data points
3. Cross-reference claims against data
4. Flag any claim not supported by (or contradicted by) the data

- **GREEN:** No contradictions found
- **YELLOW:** Minor inconsistency (can be resolved with clarification)
- **RED:** Direct contradiction between claim and data

#### 3.3 Causality Overreach

Detect causal language that goes beyond what the statistical evidence supports.

**Forbidden Patterns (RED flag):**

- "X caused Y" (without controlled experiment)
- "X led to Y" (implies causal direction)
- "Due to X, Y happened" (causal attribution)
- "X is responsible for Y" (causal claim)

**Allowed Patterns:**

- "X is associated with Y"
- "X correlates with Y"
- "Stocks with X tend to show Y"
- "X coincided with Y"
- "X may contribute to Y" (hedged language with qualifier)

- **GREEN:** No causal language, or properly hedged correlational language
- **YELLOW:** Hedged causal language ("may have caused", "likely contributed to")
- **RED:** Unqualified causal claims ("X caused Y")

#### 3.4 Missing Context

Check if important contextual factors are acknowledged.

**Required Context for Vietnamese Market:**

| Scenario                  | Required Context                                                   |
| ------------------------- | ------------------------------------------------------------------ |
| P/E comparison            | Market-wide P/E level, sector average, historical range            |
| Volume analysis           | Market trading hours, Tet holiday effects, index rebalancing dates |
| Return comparison         | VN-Index benchmark, risk-free rate (SBV rate)                      |
| Financial analysis        | Reporting lag (30-45 days), audit status, accounting standards     |
| Foreign investor activity | FOL limits (49%), current foreign ownership level                  |
| Sector analysis           | Government policy context (credit growth limits, SOE reform)       |

- **GREEN:** All relevant context acknowledged
- **YELLOW:** Some context missing but not critical
- **RED:** Critical context missing that could change the conclusion

#### 3.5 Confidence Alignment

Verify that the stated confidence level aligns with the evidence strength.

| Evidence Strength          | Max Confidence | Alignment Check             |
| -------------------------- | -------------- | --------------------------- |
| p < 0.01 AND large effect  | A (90-100)     | Aligned if confidence >= 90 |
| p < 0.05 AND medium effect | B (80-89)      | RED if confidence > 89      |
| p < 0.05 AND small effect  | C (70-79)      | RED if confidence > 79      |
| p > 0.05 (not significant) | D (60-69)      | RED if confidence > 69      |
| Small sample (n < 30)      | Cap at B       | RED if confidence > 89      |
| Single data source         | Cap at B       | RED if confidence > 89      |

- **GREEN:** Confidence grade matches evidence strength
- **YELLOW:** Confidence 1 grade too high (e.g., A when evidence warrants B)
- **RED:** Confidence 2+ grades too high (overstating certainty)

### Layer 3 Scoring

```
Layer_3_Score = 100 - (RED_flags * 20) - (YELLOW_flags * 7)
Minimum: 0

Special caps:
- Contradiction detected (RED): Layer_3_Score capped at 40
- Causality overreach (RED): Layer_3_Score capped at 50
- Missing critical context: Layer_3_Score capped at 60
```

---

## Layer 4: Presentation Accuracy (PRE-OUTPUT)

**When:** After chart generation and deck assembly
**Weight:** 15% of overall confidence
**Applies to:** L4+ queries (with charts/presentations)

### Checks

#### 4.1 Chart-Data Match

Re-compute displayed values from raw data and compare to chart labels/positions.

```
Deviation = |chart_value - raw_data_value| / raw_data_value * 100
```

| Deviation | Status | Action                                           |
| --------- | ------ | ------------------------------------------------ |
| < 1%      | GREEN  | Accurate                                         |
| 1-2%      | GREEN  | Acceptable (rounding)                            |
| 2-5%      | YELLOW | Flag, confidence capped at B (89)                |
| > 5%      | RED    | Flag, confidence capped at D (69), auto-escalate |

**What to check:**

- Bar heights match reported values
- Line endpoints match data points
- Pie chart segments sum to 100% (within 0.5%)
- Axis ranges include all data points
- Annotations match underlying data

#### 4.2 Label Accuracy

Verify all chart labels are correct.

- **Ticker symbols:** Match the symbols in the analysis
- **Date ranges:** Match the analysis period
- **Metric names:** Correct Vietnamese/English bilingual labels
- **Units:** VND, %, shares, etc. correctly shown
- **Legend entries:** Match data series (no orphan labels)

- **GREEN:** All labels correct
- **YELLOW:** Minor label issue (typo, missing unit)
- **RED:** Misleading label (wrong ticker, wrong metric name)

#### 4.3 Significant Figures

Verify numbers are displayed with appropriate precision.

| Data Type         | Significant Figures     | Example                    |
| ----------------- | ----------------------- | -------------------------- |
| Stock price       | 0 decimal places        | 82,500 VND (not 82,500.00) |
| Volume            | 0 decimal places        | 3,245,600 shares           |
| P/E ratio         | 1 decimal place         | 12.8x                      |
| ROE               | 1 decimal place         | 15.2%                      |
| Percentage change | 1 decimal place         | +3.5%                      |
| Market cap        | 1 decimal (T VND)       | 245.3T VND                 |
| p-value           | 3-4 significant figures | 0.0034                     |
| Effect size       | 2 decimal places        | d=0.62                     |

- **GREEN:** All numbers at correct precision
- **YELLOW:** Minor precision issue (extra/fewer decimals)
- **RED:** Misleading precision (e.g., reporting P/E as 12.8347)

#### 4.4 Color Coding

Verify Vietnamese market color conventions.

| Meaning               | Color       | Usage                           |
| --------------------- | ----------- | ------------------------------- |
| Positive / Up / Good  | Green       | Price increase, positive return |
| Negative / Down / Bad | Red         | Price decrease, negative return |
| Neutral / Unchanged   | Yellow/Gray | No change, baseline             |
| Highlight / Emphasis  | Blue        | Key data points, focus area     |
| Warning               | Orange      | Caution indicators              |

- **GREEN:** Color coding follows Vietnamese conventions
- **YELLOW:** Minor color issue (e.g., generic palette, not red/green specific)
- **RED:** Inverted colors (red for positive, green for negative)

#### 4.5 Attribution Present

All outputs must include AI Analyst Lab attribution.

**Required:**

- Charts: "Powered by AI Analyst Lab | aianalystlab.ai" in footer
- Reports: Attribution at bottom
- Slides: Footer on each slide
- Data tables: Source attribution row

- **GREEN:** Attribution present on all outputs
- **YELLOW:** Attribution on most but not all outputs
- **RED:** No attribution found

### Layer 4 Scoring

```
Layer_4_Score = 100 - (RED_flags * 20) - (YELLOW_flags * 5)
Minimum: 0

Special caps:
- Chart mismatch > 2%: Layer_4_Score capped at 80
- Chart mismatch > 5%: Layer_4_Score capped at 50, auto-escalate
- Missing attribution: Layer_4_Score capped at 70
```

### Layer 4 Stub (L1-L3 Queries)

For queries that do not produce charts/presentations:

- Score defaults to 80 (no charts to validate)
- This prevents penalizing simple queries

---

## Review Loop Protocol

### Decision Algorithm

```python
def determine_review_outcome(confidence, red_flags, yellow_flags, revision_count):
    # Hard REJECT conditions
    if simpsons_paradox_detected:
        return 'REJECT'
    if layer_1_score < 50:  # Data corruption
        return 'REJECT'
    if layer_4_has_red_flag:  # Presentation error
        return 'REJECT'
    if red_flags >= 3:
        return 'REJECT'

    # APPROVE
    if confidence >= 80 and red_flags == 0:
        return 'APPROVE'

    # APPROVE_WITH_CHANGES
    if confidence >= 70 and red_flags <= 2 and revision_count < 2:
        return 'APPROVE_WITH_CHANGES'

    # If 2 revision cycles exhausted, escalate
    if revision_count >= 2:
        return 'REJECT'

    # Default: REJECT for safety
    return 'REJECT'
```

### Outcomes

#### APPROVE (Confidence >= 80, Grade A or B)

All layers pass with at most YELLOW flags.

**User Notification:**

```
Quality check passed (Confidence: [Score] [Grade])
[Optional: "Note: [YELLOW flag description]"]
```

#### APPROVE_WITH_CHANGES (Confidence 70-79, Grade C)

1-2 RED flags in Layers 1-3. Maximum 2 revision cycles allowed.

**Process:**

1. Identify specific issues to fix
2. Return to offending agent with fix instructions
3. Agent produces revised output
4. Re-validate (increment revision_count)
5. If passes: APPROVE. If fails again: one more attempt (max 2 total)

**User Notification:**

```
Refining analysis (attempt [N]/2)...
Issue: [description of RED flag]
Action: [what's being fixed]
```

**After resolution:**

```
Approved after [N] revision(s) (confidence improved from [old] to [new])
```

#### REJECT (Confidence < 70, Grade D or F)

3+ RED flags OR Layer 4 RED flag OR Simpson's Paradox.

**Escalation to user is MANDATORY.**

**User Notification:**

```
QUALITY ESCALATION
------------------
Issue: [Description of quality issue]
Confidence: [Score] ([Grade])
Layer: [Which layer(s) flagged]
Flags: [RED count] RED, [YELLOW count] YELLOW

Root Causes:
1. [First issue with details]
2. [Second issue with details]

Options:
1. Proceed with low-confidence result (not recommended)
2. Refine analysis with adjusted parameters
3. Abort and investigate data issues

What would you like to do?
```

### Escalation Triggers (Automatic REJECT + User Prompt)

| Trigger             | Condition                             | User Message                                                                |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Revision exhaustion | 2 APPROVE_WITH_CHANGES cycles failed  | "Analysis could not meet quality threshold after 2 attempts"                |
| Rework failure      | 1 REJECT + rework still fails         | "Quality issues persist after rework"                                       |
| Simpson's Paradox   | Unresolvable reversal in subgroups    | "Aggregate trend reverses in majority of subgroups - conclusion unreliable" |
| Data corruption     | Layer 1 score < 50                    | "Data quality too low for reliable analysis"                                |
| Presentation error  | Layer 4 RED flag (chart mismatch >5%) | "Chart values don't match underlying data"                                  |

### Revision Tracking

Each validation run logs:

```yaml
revision_history:
  - revision: 0
    confidence: 68
    grade: 'D'
    outcome: 'APPROVE_WITH_CHANGES'
    red_flags: 2
    issues:
      - 'Layer 2: Missing CIs on 3 key findings'
      - 'Layer 3: Causal language detected'
    fix_instructions:
      - 'Add 95% CIs to ROE comparison, sector P/E comparison, volume analysis'
      - 'Replace "caused" with "associated with" in 2 locations'

  - revision: 1
    confidence: 82
    grade: 'B'
    outcome: 'APPROVE'
    red_flags: 0
    issues_resolved:
      - 'CIs added to all findings'
      - 'Causal language replaced'
    improvement: '+14 points (D -> B)'
```

---

## Output Format

### \_working/validation_report.md

```yaml
---
validation_id: 'val_20260221_143510'
question_id: 'q_20260221_143500'
complexity_level: 'L3'
generated_at: '2026-02-21T14:35:10+07:00'
checkpoint: 'post_analysis'
revision: 0

layers:
  layer_1_data_quality:
    score: 90
    grade: 'A'
    checks:
      null_values: { status: 'GREEN', details: '0.2% nulls (within threshold)' }
      duplicates: { status: 'GREEN', details: '0 duplicates' }
      out_of_range: { status: 'GREEN', details: 'All values in range' }
      temporal_consistency: { status: 'GREEN', details: 'No gaps > 5 days' }
      schema_validation: { status: 'GREEN', details: 'Schema matches' }
      staleness: { status: 'YELLOW', details: 'Financials 48h old (Warn threshold)' }
      vietnamese_checks: { status: 'GREEN', details: 'No price limit hits' }
    auto_fixes: []
    flags: { red: 0, yellow: 1, green: 6 }

  layer_2_statistical_rigor:
    score: 85
    grade: 'B'
    checks:
      test_selection: { status: 'GREEN', details: 't-test for continuous comparison, appropriate' }
      confidence_intervals: { status: 'GREEN', details: '95% CIs on all 4 estimates' }
      effect_sizes: { status: 'GREEN', details: "Cohen's d reported for all tests" }
      sample_size: { status: 'YELLOW', details: 'Tech sector n=12, below 30 threshold' }
      multiple_comparisons: { status: 'YELLOW', details: '5 tests run, family-wise error 22.6%' }
      simpsons_paradox: { status: 'GREEN', details: 'No paradox detected (reversal rate 10%)' }
    flags: { red: 0, yellow: 2, green: 4 }

  layer_3_logical_coherence:
    score: 80
    grade: 'B'
    checks:
      domain_sanity: { status: 'GREEN', details: 'All metrics within typical ranges' }
      contradiction_detection: { status: 'GREEN', details: 'No contradictions found' }
      causality_overreach: { status: 'GREEN', details: 'Correlational language used throughout' }
      missing_context: { status: 'YELLOW', details: 'VN-Index benchmark comparison mentioned but macro context light' }
      confidence_alignment: { status: 'GREEN', details: 'Confidence grade matches evidence strength' }
    flags: { red: 0, yellow: 1, green: 4 }

  layer_4_presentation_accuracy:
    score: 80
    grade: 'B'
    note: 'Stub score - no charts generated for L3 query'

overall:
  confidence_score: 84
  confidence_grade: 'B'
  formula: 'L3 query: 25% L1 + 45% L2 + 30% L3'
  formula_computed: '0.25*90 + 0.45*85 + 0.30*80 = 84.75 -> 84'
  review_outcome: 'APPROVE'
  revision_count: 0
  flags_total: { red: 0, yellow: 4, green: 14 }

persistence:
  logged_to: '.knowledge/validation/confidence_history.yaml'
  quality_flags_logged: '.knowledge/validation/quality_flags.yaml'
---
```

### \_working/confidence_scores.yaml

```yaml
question_id: 'q_20260221_143500'
timestamp: '2026-02-21T14:35:10+07:00'
complexity_level: 'L3'
checkpoint: 'post_analysis'
scores:
  layer_1: 90
  layer_2: 85
  layer_3: 80
  layer_4: 80
  overall: 84
grade: 'B'
outcome: 'APPROVE'
revision: 0
simpsons_paradox: false
caps_applied: []
```

---

## Logging and Persistence

### Confidence History

After each validation, append to `.knowledge/validation/confidence_history.yaml`:

```yaml
- analysis_id: 'q_20260221_143500'
  timestamp: '2026-02-21T14:35:10+07:00'
  complexity: 'L3'
  score: 84
  grade: 'B'
  outcome: 'APPROVE'
  layers: { l1: 90, l2: 85, l3: 80, l4: 80 }
```

### Quality Flags

Log any RED/YELLOW flags to `.knowledge/validation/quality_flags.yaml` for trend analysis.

### Review Loops

Log all review loop outcomes to `.knowledge/validation/review_loops.yaml`.

---

**Powered by AI Analyst Lab | aianalystlab.ai**
