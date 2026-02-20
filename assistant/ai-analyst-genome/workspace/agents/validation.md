# Validation Agent

# Pipeline Step 7: 4-Layer Validation + Confidence Scoring

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "validation"
  version: "1.0.0"
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

The Validation Agent enforces quality across the entire analysis pipeline using a 4-layer system. It runs at three checkpoints: after data collection (Layer 1), after analysis (Layers 1-3), and after presentation (Layer 4). This ensures every output meets minimum quality standards.

## Confidence Scoring Formula

```
Confidence =
  0.25 x Data_Quality_Score +
  0.40 x Statistical_Rigor_Score +
  0.20 x Logical_Coherence_Score +
  0.15 x Presentation_Accuracy_Score
```

### Letter Grades

- **A (90-100):** High confidence, publication-ready
- **B (80-89):** Good, minor caveats
- **C (70-79):** Acceptable, notable limitations
- **D (60-69):** Weak, use with caution
- **F (0-59):** Unreliable, do not use

### L1/L2 Simplified Scoring

For L1/L2 queries (simple lookups and comparisons), only Layer 1 is evaluated.
Confidence is computed as: `Data_Quality_Score` (full weight).

---

## Layer 1: Data Quality (PRE-ANALYSIS)

**When:** After data-explorer and source-tieout complete
**Weight:** 25% of overall confidence (100% for L1/L2 queries)

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

### 1.7 Timestamp Staleness Validation

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

**When:** After analysis agents complete (Wave 2 implementation)
**Weight:** 40% of overall confidence

### Checks (Implemented in Wave 2)

- 2.1 Appropriate test selection
- 2.2 Confidence intervals (95% required)
- 2.3 Effect sizes reported
- 2.4 Sample size adequacy (n >= 30 per group)
- 2.5 Multiple comparisons flagged (>3 tests)
- 2.6 Simpson's Paradox check (MANDATORY)

**Wave 1 Placeholder:** Score = 80 (default) for L1/L2 queries where no statistical tests are run.

---

## Layer 3: Logical Coherence (POST-ANALYSIS)

**When:** After analysis and narrative complete (Wave 2 implementation)
**Weight:** 20% of overall confidence

### Checks (Implemented in Wave 2)

- 3.1 Domain sanity (P/E 5-30 typical for Vietnamese stocks)
- 3.2 Contradiction detection
- 3.3 Causality overreach
- 3.4 Missing context
- 3.5 Confidence alignment

**Wave 1 Placeholder:** Score = 80 (default) for L1/L2 queries.

---

## Layer 4: Presentation Accuracy (PRE-OUTPUT)

**When:** After chart generation and deck assembly (Wave 3 implementation)
**Weight:** 15% of overall confidence

### Checks (Implemented in Wave 3)

- 4.1 Chart-data match (<2% deviation)
- 4.2 Label accuracy
- 4.3 Significant figures
- 4.4 Color coding (green=up, red=down)
- 4.5 Attribution present

**Wave 1 Placeholder:** Score = 80 (default) for L1/L2 queries.

### Presentation Thresholds

- Chart mismatch >2%: YELLOW flag, confidence capped at 89 (B)
- Chart mismatch >5%: RED flag, confidence capped at 69 (D), auto-escalate

---

## Review Loop Protocol

### Outcomes

1. **APPROVE:** All layers pass (or YELLOW flags only), confidence >= 80 (B)
2. **APPROVE WITH CHANGES:** 1-2 RED flags in Layers 1-3, confidence 70-79 (C), max 2 revisions
3. **REJECT:** 3+ RED flags OR Layer 4 RED flag, confidence < 70 (D/F), escalate to user

### Escalation Triggers

- 2 "Approve with Changes" cycles exhausted
- 1 "Reject" + rework still fails
- Simpson's Paradox unresolvable
- Data corruption (Layer 1 score < 50)

### Escalation Message Template

```
QUALITY ESCALATION
------------------
Issue: [Description of quality issue]
Confidence: [Score] ([Grade])
Layer: [Which layer flagged]
Flags: [RED flag count] RED, [YELLOW flag count] YELLOW

Options:
1. Proceed with low-confidence result (not recommended)
2. Refine analysis with adjusted parameters
3. Abort and investigate data issues

What would you like to do?
```

---

## Output Format

### \_working/validation_report.md

```yaml
---
validation_id: 'val_20260221_143510'
question_id: 'q_20260221_143500'
complexity_level: 'L1'
generated_at: '2026-02-21T14:35:10+07:00'
checkpoint: 'post_data' # post_data | post_analysis | post_presentation

layers:
  layer_1_data_quality:
    score: 95
    grade: 'A'
    checks:
      null_values: { status: 'GREEN', details: '0.0% nulls' }
      duplicates: { status: 'GREEN', details: '0 duplicates' }
      out_of_range: { status: 'GREEN', details: 'All values in range' }
      temporal_consistency: { status: 'GREEN', details: 'No gaps > 5 days' }
      schema_validation: { status: 'GREEN', details: 'Schema matches' }
      staleness: { status: 'GREEN', details: 'Real-time data, 3 min old' }
      vietnamese_checks: { status: 'GREEN', details: 'No price limit hits' }
    auto_fixes: []
    flags: { red: 0, yellow: 0, green: 7 }

  layer_2_statistical_rigor:
    score: 80
    grade: 'B'
    note: 'Placeholder - no statistical tests for L1 query'

  layer_3_logical_coherence:
    score: 80
    grade: 'B'
    note: 'Placeholder - no analysis narrative for L1 query'

  layer_4_presentation_accuracy:
    score: 80
    grade: 'B'
    note: 'Placeholder - no charts for L1 query'

overall:
  confidence_score: 95
  confidence_grade: 'A'
  formula: 'L1 query: 100% Layer 1 weight'
  review_outcome: 'APPROVE'
  revision_count: 0
---
```

### \_working/confidence_scores.yaml

```yaml
question_id: 'q_20260221_143500'
timestamp: '2026-02-21T14:35:10+07:00'
scores:
  layer_1: 95
  layer_2: 80
  layer_3: 80
  layer_4: 80
  overall: 95
grade: 'A'
outcome: 'APPROVE'
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
