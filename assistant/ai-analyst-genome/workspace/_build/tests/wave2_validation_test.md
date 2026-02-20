# Wave 2 Integration Test: 4-Layer Validation System

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Test ID: W2-VAL-001

## Purpose

Verify that all 4 validation layers are operational and produce correct confidence scores and review outcomes.

---

## Test Case 1: Clean Analysis (Expected: APPROVE, Grade A-B)

**Scenario:** Well-formed analysis with no issues.

**Input Artifacts:**

- analysis_report.md: All CIs present, effect sizes reported, appropriate tests
- No Simpson's Paradox
- Correlational language throughout
- Full Vietnamese market context

**Expected Layer Scores:**
| Layer | Score | Grade |
|-------|-------|-------|
| L1 Data Quality | 95 | A |
| L2 Statistical Rigor | 90 | A |
| L3 Logical Coherence | 85 | B |
| L4 Presentation | 80 | B (stub) |

**Expected Overall:** 0.25*95 + 0.40*90 + 0.20*85 + 0.15*80 = 88.75 -> 88 (B)
**Expected Outcome:** APPROVE

---

## Test Case 2: Missing CIs (Expected: APPROVE_WITH_CHANGES, Grade C)

**Scenario:** Analysis report has 3 key findings without confidence intervals.

**Expected Layer 2 Impact:**

- Check 2.2 (CIs required): RED flag
- Layer 2 score capped at 60

**Expected Fix Instructions:**

- "Add 95% CIs to 3 key findings: ROE comparison, sector P/E comparison, volume analysis"

**Expected After Fix:** Layer 2 score recovers to 85+, overall APPROVE

---

## Test Case 3: Simpson's Paradox Detected (Expected: REJECT, Grade F)

**Scenario:** Aggregate finding "Banking sector outperformed" but 7/10 sub-segments show underperformance.

**Setup Data:**

```python
import pandas as pd
data = pd.DataFrame({
    'return_6m': [25, 22, -5, -8, -3, -12, -4, -7, 18, -2],
    'outperformed': ['Yes', 'Yes', 'No', 'No', 'No', 'No', 'No', 'No', 'Yes', 'No'],
    'sub_segment': ['Large SOE', 'Large SOE', 'Mid Private', 'Mid Private', 'Small', 'Small', 'HNX', 'HNX', 'Large SOE', 'UPCOM'],
})
```

**Expected:**

- check_simpson_paradox() returns paradox_detected: true
- Layer 2 Simpson's Paradox: RED flag
- Layer 2 score capped at 30
- Overall confidence capped at F (0-59)
- Review outcome: REJECT
- Escalation message to user

---

## Test Case 4: Causal Language (Expected: APPROVE_WITH_CHANGES, Grade C-D)

**Scenario:** Analysis contains "Foreign selling caused VCB price decline."

**Expected Layer 3 Impact:**

- Check 3.3 (Causality overreach): RED flag
- Layer 3 score capped at 50

**Expected Fix Instructions:**

- "Replace 'caused' with 'is associated with' or 'coincided with'"

**Expected After Fix:** Layer 3 recovers, overall APPROVE

---

## Test Case 5: Data Corruption (Expected: REJECT, Grade F)

**Scenario:** Layer 1 score < 50 due to multiple RED flags (>5% nulls, missing columns, stale data).

**Expected:**

- Layer 1 score: 40
- Overall confidence capped at F (0-59)
- Review outcome: REJECT
- Escalation: "Data quality too low for reliable analysis"

---

## Test Case 6: Chart Mismatch >5% (Expected: REJECT, Grade D)

**Scenario:** Chart shows ROE 18.5% but raw data shows 17.1% (deviation 8.2%).

**Expected Layer 4 Impact:**

- Check 4.1 (Chart-data match): RED flag (>5% deviation)
- Layer 4 score capped at 50
- Overall confidence capped at D (69)
- Auto-escalation

---

## Test Case 7: Multiple Comparisons Warning (Expected: APPROVE, Grade B)

**Scenario:** 8 statistical tests run on same dataset.

**Expected:**

- Check 2.5: YELLOW flag
- Family-wise error rate: 33.7%
- Note in report: "Focus on effect sizes rather than p-values"
- Layer 2 score: 85 (YELLOW penalty of -7)
- Overall: B grade, APPROVE with note

---

## Test Case 8: Review Loop Exhaustion (Expected: REJECT after 2 cycles)

**Scenario:** Analysis fails APPROVE_WITH_CHANGES twice.

**Expected:**

- Revision 0: APPROVE_WITH_CHANGES (confidence 72)
- Revision 1: Still fails (confidence 74, still has issues)
- Revision count = 2: REJECT
- Escalation: "Analysis could not meet quality threshold after 2 attempts"

---

## Confidence Scoring Formula Verification

| Test     | L1  | L2   | L3   | L4   | Expected | Formula                           |
| -------- | --- | ---- | ---- | ---- | -------- | --------------------------------- |
| L1 query | 95  | 80\* | 80\* | 80\* | 95       | 100% L1                           |
| L2 query | 90  | 85   | 80\* | 80\* | 87       | 40% L1 + 60% L2                   |
| L3 query | 90  | 85   | 80   | 80\* | 84       | 25% L1 + 45% L2 + 30% L3          |
| L4 query | 90  | 85   | 80   | 90   | 86       | 25% L1 + 40% L2 + 20% L3 + 15% L4 |

\*Stub scores for layers not evaluated

---

## Grade Boundary Verification

| Score | Expected Grade | Expected Min Outcome |
| ----- | -------------- | -------------------- |
| 95    | A              | APPROVE              |
| 90    | A              | APPROVE              |
| 89    | B              | APPROVE              |
| 80    | B              | APPROVE              |
| 79    | C              | APPROVE_WITH_CHANGES |
| 70    | C              | APPROVE_WITH_CHANGES |
| 69    | D              | REJECT               |
| 60    | D              | REJECT               |
| 59    | F              | REJECT               |
| 0     | F              | REJECT               |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
