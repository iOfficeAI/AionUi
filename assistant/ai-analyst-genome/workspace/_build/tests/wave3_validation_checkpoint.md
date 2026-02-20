# Wave 3 Validation Checkpoint

# All Layers Operational with Presentation Accuracy

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Verify that all 4 validation layers work end-to-end, with special focus on Layer 4 (Presentation Accuracy) which is new in Wave 3.

## Validation Layer Status

### Layer 1: Data Quality (Wave 1)

| Check                | Status                | Implementation          |
| -------------------- | --------------------- | ----------------------- |
| Null/missing check   | Operational           | validation.md check 1.1 |
| Duplicate check      | Operational           | validation.md check 1.2 |
| Out-of-range check   | Operational           | validation.md check 1.3 |
| Temporal consistency | Operational           | validation.md check 1.4 |
| Schema validation    | Operational           | validation.md check 1.5 |
| Vietnamese checks    | Operational           | validation.md check 1.6 |
| Staleness check      | Operational           | validation.md check 1.7 |
| **Layer Status**     | **Fully Operational** | **Since Wave 1**        |

### Layer 2: Statistical Rigor (Wave 2)

| Check                | Status                | Implementation                                   |
| -------------------- | --------------------- | ------------------------------------------------ |
| Test selection       | Operational           | validation.md check 2.1                          |
| Confidence intervals | Operational           | validation.md check 2.2                          |
| Effect sizes         | Operational           | validation.md check 2.3                          |
| Sample size adequacy | Operational           | validation.md check 2.4                          |
| Multiple comparisons | Operational           | validation.md check 2.5                          |
| Simpson's Paradox    | Operational           | validation.md check 2.6 + simpsons-paradox skill |
| **Layer Status**     | **Fully Operational** | **Since Wave 2**                                 |

### Layer 3: Logical Coherence (Wave 2)

| Check                   | Status                | Implementation          |
| ----------------------- | --------------------- | ----------------------- |
| Domain sanity           | Operational           | validation.md check 3.1 |
| Contradiction detection | Operational           | validation.md check 3.2 |
| Causality overreach     | Operational           | validation.md check 3.3 |
| Missing context         | Operational           | validation.md check 3.4 |
| Confidence alignment    | Operational           | validation.md check 3.5 |
| **Layer Status**        | **Fully Operational** | **Since Wave 2**        |

### Layer 4: Presentation Accuracy (Wave 3 - NEW)

| Check                  | Status                | Implementation                                    |
| ---------------------- | --------------------- | ------------------------------------------------- |
| Chart-data match (<2%) | Operational           | visual-design-critic.md + validation.md check 4.1 |
| Label accuracy         | Operational           | visual-design-critic.md + validation.md check 4.2 |
| Significant figures    | Operational           | visual-design-critic.md + validation.md check 4.3 |
| Color coding           | Operational           | visual-design-critic.md + validation.md check 4.4 |
| Attribution present    | Operational           | visual-design-critic.md + validation.md check 4.5 |
| **Layer Status**       | **Fully Operational** | **Since Wave 3**                                  |

## End-to-End Validation Tests

### Test 1: Layer 4 Chart-Data Match (>2% Deviation)

**Scenario:** Chart shows P/E as 15.5 but raw data says 15.2 (deviation: 1.97%)

**Expected:**

- Status: GREEN (within 2% tolerance)
- No cap applied
- Layer 4 score: not reduced

### Test 2: Layer 4 Chart-Data Match (>5% Deviation)

**Scenario:** Chart shows P/E as 16.0 but raw data says 15.2 (deviation: 5.26%)

**Expected:**

- Status: RED
- Cap applied: confidence capped at 69 (grade D)
- Validation outcome: REJECT
- Auto-escalation to user

### Test 3: Layer 4 Missing Attribution

**Scenario:** Chart generated without AI Analyst Lab watermark

**Expected:**

- Status: RED (attribution check)
- Layer 4 score capped at 70
- Fix instruction: "Add AI Analyst Lab watermark to chart"
- Design review outcome: CHANGES

### Test 4: Layer 4 Inverted Colors

**Scenario:** Chart shows positive values in red, negative in green

**Expected:**

- Status: RED (color coding check)
- Layer 4 score reduced by 20 points
- Fix instruction: "Swap color coding to match Vietnamese conventions"

### Test 5: Full 4-Layer Confidence Calculation (L4 Query)

**Scenario:** L4 deep dive query with all layers evaluated

**Expected:**

```
Confidence = 0.25 * L1 + 0.40 * L2 + 0.20 * L3 + 0.15 * L4

Example:
L1 = 90, L2 = 85, L3 = 80, L4 = 90
Confidence = 0.25*90 + 0.40*85 + 0.20*80 + 0.15*90
           = 22.5 + 34.0 + 16.0 + 13.5
           = 86.0
Grade = B
```

### Test 6: Cap Rule Interaction

**Scenario:** L1=90, L2=85, L3=80, L4=50 (chart mismatch >5%)

**Expected:**

```
Uncapped: 0.25*90 + 0.40*85 + 0.20*80 + 0.15*50 = 79.5
Cap rule: Chart mismatch >5% -> confidence capped at 69
Final confidence: 69
Grade: D
Outcome: REJECT
```

## Acceptance Criteria

**PASS if:**

1. All 4 layers have all checks implemented in agent definitions
2. Layer 4 cap rules are correctly specified (>2% = 89, >5% = 69)
3. Confidence formula uses correct weights for each complexity level
4. Visual-design-critic applies SWD checklist with scoring
5. Chart-data match verification process is defined
6. Attribution check is included in Layer 4

**FAIL if:**

- Any layer has missing checks
- Cap rules not implemented
- Layer 4 cannot detect chart-data mismatches >2%

## Current Assessment

All 4 validation layers are now fully defined and operational:

- **Layers 1-3:** Implemented in Wave 1-2, tested in wave2_validation_test.md
- **Layer 4:** Implemented in Wave 3 via visual-design-critic.md + validation.md check 4.x
- **Cross-layer integration:** Confidence scoring formula handles all 4 layers with complexity-specific weights

---

**Powered by AI Analyst Lab | aianalystlab.ai**
