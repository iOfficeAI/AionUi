# Wave 2 Integration Test: L3 Query

# "Why did VCB's price drop 5% last week?"

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Test ID: W2-L3-001

## Query

```
"Why did VCB's price drop 5% last week?"
```

## Expected Pipeline Activation

```
L3 Investigation:
  question-framing -> hypothesis -> data-explorer -> source-tieout ->
  descriptive-analytics -> overtime-trend -> validation (Layers 1-3)
```

## Step-by-Step Expected Behavior

### 1. Question Framing (Step 1)

**Input:** "Why did VCB's price drop 5% last week?"

**Expected Output (\_working/question_brief.md):**

```yaml
complexity_level: 'L3'
goal: 'Understand why VCB price declined 5% in the past week'
decision: 'Assess if decline is temporary (buying opportunity) or fundamental'
metrics:
  - name: 'daily_return'
    symbols: ['VCB']
  - name: 'volume'
    symbols: ['VCB']
  - name: 'pe_ratio'
    symbols: ['VCB']
initial_hypotheses:
  - 'Foreign selling pressure drove the decline'
  - 'Broader banking sector weakness'
  - 'Company-specific news or earnings concern'
entities:
  symbols: ['VCB']
  timeframe: 'last_7_trading_days'
  comparison: false
routing:
  agents: ['question-framing', 'hypothesis', 'data-explorer', 'source-tieout', 'descriptive-analytics', 'overtime-trend', 'validation']
```

**Acceptance:** complexity_level = L3, VCB extracted, routing includes hypothesis + overtime-trend

### 2. Hypothesis Agent (Step 3)

**Expected Output (\_working/hypothesis_doc.md):**

```yaml
hypotheses:
  - id: 'H1'
    category: 'market_dynamics'
    statement: 'Foreign net selling pressure on VCB drove price decline'
    testability: 4
  - id: 'H2'
    category: 'fundamental_factors'
    statement: 'VCB earnings concern (Q4 2025 reporting lag)'
    testability: 3
  - id: 'H3'
    category: 'technical_structural'
    statement: 'Margin call cascade triggered by VCB breaking support level'
    testability: 3
  - id: 'H4'
    category: 'external_events'
    statement: 'Broader banking sector rotation or macro concern (SBV policy)'
    testability: 4
```

**Acceptance:** 4 categories covered, testability >= 3 for at least 2 hypotheses

### 3. Data Explorer (Step 4)

**Expected Output:** Data inventory with VCB OHLCV + volume for last 7 days, plus banking peer data for sector comparison.

**Acceptance:** VCB data available, staleness < 1 hour for prices

### 4. Source Tie-Out (Step 4.5)

**Expected Output:** PASS or PASS_WITH_WARNINGS.

**Acceptance:** Price integrity check PASS, schema validation PASS

### 5. Descriptive Analytics (Step 5)

**Expected Analyses:**

- VCB daily returns for the week (with 95% CI)
- VCB vs banking sector comparison (t-test)
- Volume analysis (compare to 20-day average)
- Simpson's Paradox check (by sub-sector or time)

**Expected Output (\_working/analysis_report.md):**

```yaml
comparisons:
  - test: 't_test'
    groups: ['VCB_last_week', 'VCB_prior_4_weeks']
    metric: 'daily_return'
    result:
      significant: true_or_false
      effect_size: { d: X.XX, label: 'small/medium/large' }
      ci_95_diff: [lower, upper]
simpsons_paradox_check:
  checked: true
  paradox_detected: false
```

**Acceptance:** CIs on all estimates, effect sizes reported, Simpson's Paradox checked

### 6. Over-Time Trend (Step 5)

**Expected Analyses:**

- Moving averages (20/50/200 day)
- Anomaly detection for the drop
- Period-over-period comparison (last week vs prior weeks)

**Expected Output (\_working/trend_report.md):**

```yaml
anomalies:
  - date: 'YYYY-MM-DD'
    metric: 'close'
    z_score: -X.X
    classification: 'anomaly'
    context: '[Explanation]'
```

**Acceptance:** Anomaly flagged for the 5% drop, moving averages computed

### 7. Validation (Step 7)

**Expected Checkpoint:** post_analysis (Layers 1, 2, 3)

**Layer 1:** Data Quality PASS (fresh data, no gaps)
**Layer 2:** Statistical Rigor check

- CIs present: GREEN
- Effect sizes reported: GREEN
- Sample size adequate: GREEN or YELLOW (depends on n)
- Simpson's Paradox: GREEN (no paradox expected)
  **Layer 3:** Logical Coherence check
- Domain sanity: GREEN (VCB price drop within normal range)
- No contradictions: GREEN
- Causality check: GREEN (if correlational language used)

**Expected Confidence:** >= 70 (C or better)

**Acceptance:** Confidence score 70-100, grade C/B/A, outcome APPROVE or APPROVE_WITH_CHANGES

## Pass Criteria

| Criterion                        | Threshold                             | Status |
| -------------------------------- | ------------------------------------- | ------ |
| Pipeline completes without error | All 7 agents run                      | [ ]    |
| Complexity classified as L3      | L3 in question_brief.md               | [ ]    |
| 4 hypothesis categories covered  | H1-H4 across all 4                    | [ ]    |
| CIs on all statistical estimates | 95% CI present                        | [ ]    |
| Effect sizes reported            | Cohen's d for t-tests                 | [ ]    |
| Simpson's Paradox checked        | simpsons_paradox_check.checked = true | [ ]    |
| Confidence score returned        | 0-100 with letter grade               | [ ]    |
| Confidence >= 70                 | Grade C or better                     | [ ]    |
| Review outcome returned          | APPROVE/APPROVE_WITH_CHANGES/REJECT   | [ ]    |
| Vietnamese context               | VND formatting, ICT timezone          | [ ]    |

## Expected Completion Time

30-90 seconds (L3 time estimate)

---

**Powered by AI Analyst Lab | aianalystlab.ai**
