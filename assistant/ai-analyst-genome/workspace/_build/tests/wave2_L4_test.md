# Wave 2 Integration Test: L4 Query

# "Investigate the root cause of declining bank sector P/E ratios"

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Test ID: W2-L4-001

## Query

```
"Investigate the root cause of declining bank sector P/E ratios"
```

## Expected Pipeline Activation

```
L4 Deep Dive (full pipeline through Wave 2 agents):
  question-framing -> hypothesis -> data-explorer -> source-tieout ->
  descriptive-analytics -> overtime-trend -> cohort-analysis ->
  root-cause-investigator -> validation (Layers 1-3) -> opportunity-sizer
```

## Step-by-Step Expected Behavior

### 1. Question Framing (Step 1)

**Expected:**

```yaml
complexity_level: 'L4'
goal: 'Identify root cause of banking sector P/E ratio compression'
decision: 'Assess if P/E decline signals buying opportunity or fundamental deterioration'
metrics:
  - 'pe_ratio'
  - 'price'
  - 'eps'
  - 'volume'
initial_hypotheses:
  - 'P/E compression from price decline (selling pressure)'
  - 'P/E compression from earnings growth (denominator expansion)'
  - 'Sector rotation away from banking'
  - 'External event (FTSE review, SBV policy)'
entities:
  symbols: ['VCB', 'TCB', 'BID', 'CTG', 'MBB', 'ACB', 'VPB', 'STB', 'HDB', 'TPB']
  group: 'banking_sector'
```

### 2. Hypothesis Agent (Step 3)

**Expected:** 6-12 hypotheses across all 4 categories (Market Dynamics, Fundamental Factors, Technical/Structural, External Events). Minimum 3 with testability >= 4.

### 3. Data Explorer (Step 4)

**Expected:** Data inventory for 10 banking stocks (P/E, price, EPS, volume). Date range at least 1 year.

### 4. Source Tie-Out (Step 4.5)

**Expected:** PASS. Cross-source validation for P/E ratios (KBS vs VCI variance < 5%).

### 5. Descriptive Analytics (Step 5)

**Expected:**

- Banking sector P/E segmented by SOE vs Private banks
- Comparison: Current P/E vs 2-year average (t-test)
- Effect size of P/E change
- Simpson's Paradox check: Does sector-wide P/E decline hold within SOE and Private sub-groups?

### 6. Over-Time Trend (Step 5)

**Expected:**

- Banking P/E time series with moving averages
- Anomaly detection for P/E compression
- Period-over-period: Which quarter saw biggest decline?
- Structural break detection: When did compression start?

### 7. Cohort Analysis (Step 5)

**Expected:**

- SOE banks (VCB, BID, CTG) vs Private banks (TCB, VPB, MBB) cohort comparison
- P/E trend by cohort
- Relative performance vs VN-Index benchmark

### 8. Root Cause Investigator (Step 6)

**Expected 8-Step Protocol:**

```yaml
step_1_confirm:
  observation: 'Bank sector P/E declined over recent quarters'
  verified: true

step_2_baseline:
  baseline_mean: ~12.8 (historical banking P/E)
  current_value: ~10.9
  deviation: -1.9

step_3_decompose:
  components:
    - 'Price change': contribution_pct
    - 'EPS change': contribution_pct
  primary_driver: 'price_decline OR earnings_growth'

step_4_isolate:
  segmentation: 'by individual stock'
  primary_stock: 'VCB (largest weight)'

step_5_narrow:
  drill_down_depth: 3-4 levels
  path: ['sector P/E', 'price vs EPS', 'VCB price', 'foreign selling']

step_6_hypothesize:
  candidates:
    - 'FTSE review uncertainty'
    - 'SBV policy signal'
    - 'Credit growth concerns'
  primary: 'most statistically supported'

step_7_quantify:
  impact_attributed: XX%
  ci_95: [lower, upper]
  unexplained_portion: XX%

step_8_report:
  decomposition_tree: 'complete'
```

### 9. Validation (Step 7)

**Expected Checkpoint:** post_analysis (Layers 1, 2, 3)

**Layer 1:** PASS (data quality verified)
**Layer 2:** Statistical rigor checks

- All tests appropriate for data type
- CIs on all estimates
- Effect sizes reported
- Simpson's Paradox checked at each decomposition level
  **Layer 3:** Logical coherence checks
- Domain sanity (P/E in 5-30 range)
- No contradictions in investigation
- Correlational language (no causal claims)
- Context provided (VN-Index benchmark, sector dynamics)

**Expected Confidence:** >= 70 (C or better)

### 10. Opportunity Sizer (Step 8)

**Expected:**

- Base/best/worst case scenarios for P/E re-rating
- Sensitivity analysis on key assumptions
- Impact in VND and percentage terms

## Pass Criteria

| Criterion                           | Threshold                                    | Status |
| ----------------------------------- | -------------------------------------------- | ------ |
| Pipeline completes all 10 agents    | All invoked                                  | [ ]    |
| Complexity classified as L4         | L4 in question_brief.md                      | [ ]    |
| 6+ hypotheses generated             | Across 4 categories                          | [ ]    |
| Root cause 8-step protocol followed | All 8 steps in investigation.md              | [ ]    |
| Decomposition tree complete         | At least 3 levels deep                       | [ ]    |
| CIs on all estimates                | 95% CI present                               | [ ]    |
| Effect sizes at each level          | Cohen's d for comparisons                    | [ ]    |
| Simpson's Paradox checked           | At each decomposition level                  | [ ]    |
| Confidence score returned           | 0-100 with letter grade                      | [ ]    |
| Confidence >= 70                    | Grade C or better                            | [ ]    |
| Opportunity sized                   | Base/best/worst with sensitivity             | [ ]    |
| Vietnamese context                  | VND, SOE/private distinction, exchange rules | [ ]    |
| Dead ends documented                | Failed hypotheses recorded                   | [ ]    |
| Unexplained portion quantified      | Honest about limitations                     | [ ]    |

## Expected Completion Time

1-3 minutes (L4 time estimate)

---

**Powered by AI Analyst Lab | aianalystlab.ai**
