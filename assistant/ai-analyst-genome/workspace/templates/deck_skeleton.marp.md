---
marp: true
theme: analytics
paginate: true
header: 'Vietnamese Stock Market Analyst'
footer: 'Powered by AI Analyst Lab | aianalystlab.ai'
style: |
  :root {
    --color-primary: #1a1a2e;
    --color-secondary: #D97706;
    --color-accent: #D97706;
    --color-bg: #F7F6F2;
    --color-positive: #059669;
    --color-negative: #DC2626;
  }
---

<!-- _class: lead -->

# {{TITLE}}

**{{SUBTITLE}}**

{{DATE}} | Confidence: {{CONFIDENCE_SCORE}} ({{CONFIDENCE_GRADE}})

---

## Executive Summary

{{EXECUTIVE_SUMMARY}}

**Key Finding:** {{KEY_FINDING}}

---

## Question

> {{ORIGINAL_QUESTION}}

**Complexity:** {{COMPLEXITY_LEVEL}} | **Estimated Time:** {{ESTIMATED_TIME}}

### Goal

{{GOAL}}

### Decision

{{DECISION}}

---

## Data Overview

| Metric           | Value                   |
| ---------------- | ----------------------- |
| Symbols Analyzed | {{SYMBOL_COUNT}}        |
| Date Range       | {{DATE_RANGE}}          |
| Data Source      | {{DATA_SOURCE}}         |
| Data Quality     | {{DATA_QUALITY_STATUS}} |

---

## Key Metrics

<!-- Two-column layout -->
<div class="columns">
<div>

### {{SYMBOL_1}}

- Price: {{PRICE_1}} VND
- P/E: {{PE_1}}x
- ROE: {{ROE_1}}%

</div>
<div>

### {{SYMBOL_2}}

- Price: {{PRICE_2}} VND
- P/E: {{PE_2}}x
- ROE: {{ROE_2}}%

</div>
</div>

---

## Analysis

{{ANALYSIS_CONTENT}}

---

## Visualization

![{{CHART_TITLE}}]({{CHART_PATH}})

_{{CHART_CAPTION}}_

---

## Quality Assurance

| Layer                 | Score                 | Grade                 |
| --------------------- | --------------------- | --------------------- |
| Data Quality          | {{L1_SCORE}}          | {{L1_GRADE}}          |
| Statistical Rigor     | {{L2_SCORE}}          | {{L2_GRADE}}          |
| Logical Coherence     | {{L3_SCORE}}          | {{L3_GRADE}}          |
| Presentation Accuracy | {{L4_SCORE}}          | {{L4_GRADE}}          |
| **Overall**           | **{{OVERALL_SCORE}}** | **{{OVERALL_GRADE}}** |

---

## Recommendations

1. {{RECOMMENDATION_1}}
2. {{RECOMMENDATION_2}}
3. {{RECOMMENDATION_3}}

---

## Next Steps

- [ ] {{NEXT_STEP_1}}
- [ ] {{NEXT_STEP_2}}
- [ ] {{NEXT_STEP_3}}

---

<!-- _class: lead -->

# Thank You

**{{TITLE}}**

{{DATE}}

Powered by AI Analyst Lab | aianalystlab.ai
Data provided by vnstock (KBS/VCI/TCBS)
