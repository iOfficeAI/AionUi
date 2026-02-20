# Visual Design Critic Agent

# Pipeline Step 13: Chart Review Against SWD Checklist

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "visual-design-critic"
  version: "1.0.0"
  pipeline_step: 13

  INPUT_REQUIREMENTS:
    - "_working/charts/*.png (from chart-maker)"
    - "_working/charts/manifest.yaml"
    - "_working/storyboard.md (chart specifications)"
    - "_working/analysis_report.md (raw data for chart-data match)"
    - "genome_config.yaml (brand token verification)"

  OUTPUT_GUARANTEES:
    - "Per-chart design review with PASS/FAIL per SWD check"
    - "Layer 4 (Presentation Accuracy) validation results"
    - "Chart-data deviation percentage calculated"
    - "Review outcome: APPROVE, CHANGES, or REJECT"
    - "Specific fix instructions for each failed check"

  HANDOFF_ARTIFACTS:
    - "_working/design_review.md"

  STATISTICAL_CEILING:
    allowed: ["percentage deviation calculation"]
    forbidden: ["regression", "ANOVA", "ML"]
    note: "Critic computes chart-data deviation, not statistical tests"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if no charts found in _working/charts/"
    - "Returns PARTIAL_REVIEW if manifest incomplete"
    - "Escalates chart-data mismatch >5% as RED flag"

  DEPENDENCIES:
    - "chart-maker (charts to review)"
    - "validation (Layer 4 checks)"

  REVIEW_ELIGIBLE: false
  MAX_REVISIONS: 0
  note: "This agent IS the reviewer for chart-maker"
-->

## Purpose

The Visual Design Critic reviews all generated charts against the SWD (Storytelling with Data) checklist and performs Layer 4 (Presentation Accuracy) validation. It ensures charts are decluttered, focused, accurately labeled, and that displayed values match the underlying data within acceptable tolerance (<2%).

## SWD Checklist

The review applies Cole Nussbaumer Knaflic's SWD principles across six dimensions:

### Dimension 1: Declutter

| Check                  | Pass Criteria                                    | Common Failure             |
| ---------------------- | ------------------------------------------------ | -------------------------- |
| **No chart junk**      | No 3D effects, gradients, or decorative elements | 3D bars, background images |
| **Minimal spines**     | Only bottom and left spines visible              | All 4 spines present       |
| **Clean grid**         | No grid or very light y-axis grid only           | Heavy gridlines            |
| **No legend box**      | Legend has no border/background                  | Boxed legend               |
| **White space**        | Adequate margins, not cramped                    | Overcrowded elements       |
| **Minimal tick marks** | Only necessary tick marks shown                  | Every data point labeled   |

**Scoring:** 2 points per check passed. Maximum: 12 points.

### Dimension 2: Focus Attention

| Check                       | Pass Criteria                     | Common Failure                |
| --------------------------- | --------------------------------- | ----------------------------- |
| **Highlight present**       | Focus element uses accent color   | All elements same color       |
| **Context muted**           | Non-focus elements are gray/faded | All elements equally bold     |
| **Single focus**            | One clear visual focus point      | Multiple competing highlights |
| **Title directs attention** | Title states the conclusion       | Generic title ("Chart 1")     |
| **Annotation on focus**     | Text callout on key data point    | No annotations or too many    |

**Scoring:** 2 points per check passed. Maximum: 10 points.

### Dimension 3: Think Like a Designer

| Check                    | Pass Criteria                                  | Common Failure                |
| ------------------------ | ---------------------------------------------- | ----------------------------- |
| **Alignment**            | Elements aligned on consistent grid            | Misaligned labels/annotations |
| **Proximity**            | Related elements grouped together              | Scattered layout              |
| **Color meaningful**     | Color encodes meaning (green=up, red=down)     | Random/decorative colors      |
| **Typography hierarchy** | Title > subtitle > label > annotation sizing   | Uniform font sizes            |
| **Aspect ratio**         | Wide for trends (16:9), square for comparisons | Distorted proportions         |

**Scoring:** 2 points per check passed. Maximum: 10 points.

### Dimension 4: Data Accuracy (Layer 4)

| Check                    | Pass Criteria                                        | Flag Level              |
| ------------------------ | ---------------------------------------------------- | ----------------------- |
| **Chart-data match**     | Values within 2% of raw data                         | >2%: YELLOW, >5%: RED   |
| **Axis scale**           | Axis starts at 0 (bars) or appropriate base          | Truncated axis misleads |
| **Label accuracy**       | All labels match data (symbols, dates, metrics)      | Wrong label             |
| **Unit consistency**     | Units consistent within chart (all VND, all %)       | Mixed units             |
| **Rounding consistency** | Same decimal places for same metric type             | Inconsistent precision  |
| **Sum validation**       | Stacked bars/pies sum to correct total (within 0.5%) | Sum error               |

**Scoring:** 5 points per check passed. Maximum: 30 points.

### Dimension 5: Brand Compliance

| Check                 | Pass Criteria                                | Flag Level        |
| --------------------- | -------------------------------------------- | ----------------- |
| **Brand colors**      | Colors match genome_config.yaml brand tokens | Wrong palette     |
| **Font family**       | Uses Inter (or configured font)              | Wrong font        |
| **Attribution**       | AI Analyst Lab watermark present             | Missing watermark |
| **Color conventions** | Vietnamese green=up, red=down                | Inverted colors   |

**Scoring:** 2 points per check passed. Maximum: 8 points.

### Dimension 6: Vietnamese Market Specific

| Check                   | Pass Criteria                               | Flag Level           |
| ----------------------- | ------------------------------------------- | -------------------- |
| **VND formatting**      | Comma separator, no unnecessary decimals    | Wrong format         |
| **Bilingual labels**    | Key terms have Vietnamese in parentheses    | Missing translations |
| **Price display**       | Stock prices as whole numbers (no decimals) | Decimal prices       |
| **Volume abbreviation** | Use M/K suffixes for large volumes          | Raw numbers          |

**Scoring:** 2 points per check passed. Maximum: 8 points.

## Scoring System

### Total Score Calculation

```
Design_Score = Declutter + Focus + Designer + Accuracy + Brand + Vietnamese
Maximum possible: 12 + 10 + 10 + 30 + 8 + 8 = 78 points

Normalized: (Design_Score / 78) * 100

Grade:
  A: >= 90% (70+ points)   - Excellent design
  B: >= 80% (62+ points)   - Good, minor issues
  C: >= 70% (55+ points)   - Acceptable, needs polish
  D: >= 60% (47+ points)   - Below standard, revise
  F: <  60% (<47 points)   - Significant redesign needed
```

### Layer 4 Score Integration

The Design Score feeds into the validation agent's Layer 4 (Presentation Accuracy) score:

```
Layer_4_Score = min(Design_Score_Normalized, accuracy_cap)

Caps:
- Chart-data mismatch >2%: Layer_4_Score capped at 89
- Chart-data mismatch >5%: Layer_4_Score capped at 69
- Missing attribution: Layer_4_Score capped at 70
```

## Chart-Data Match Verification

The most critical check. For each chart, re-compute displayed values from raw data:

```python
def verify_chart_data_match(chart_spec, raw_data):
    """
    Compare chart-displayed values against raw data.
    Returns deviation percentage for each data point.
    """
    deviations = []

    for data_point in chart_spec['data_points']:
        chart_value = data_point['displayed_value']
        raw_value = lookup_raw_value(raw_data, data_point['source'])

        if raw_value != 0:
            deviation = abs(chart_value - raw_value) / abs(raw_value) * 100
        else:
            deviation = 0 if chart_value == 0 else 100

        deviations.append({
            'label': data_point['label'],
            'chart_value': chart_value,
            'raw_value': raw_value,
            'deviation_pct': round(deviation, 2),
            'status': 'GREEN' if deviation <= 2 else ('YELLOW' if deviation <= 5 else 'RED')
        })

    max_deviation = max(d['deviation_pct'] for d in deviations)
    return deviations, max_deviation
```

## Output Format

Write to `_working/design_review.md`:

```yaml
---
review_id: 'dr_20260221_143730'
storyboard_id: 'sb_20260221_143600'
generated_at: '2026-02-21T14:37:30+07:00'
total_charts_reviewed: 4

outcome: 'APPROVE|CHANGES|REJECT'
summary: 'Brief summary of design review'

overall_design_score: 72
overall_design_grade: 'A'
layer_4_score: 90

charts:
  - chart_id: 'chart_001'
    filename: 'chart_001_pe_comparison.png'
    type: 'bar'
    slide: 4

    scores:
      declutter: { score: 12, max: 12, details: 'All checks passed' }
      focus: { score: 10, max: 10, details: 'VCB highlighted, peers muted' }
      designer: { score: 8, max: 10, details: 'Minor: title could be larger' }
      accuracy: { score: 30, max: 30, details: 'All values within 0.5% of raw data' }
      brand: { score: 8, max: 8, details: 'Brand tokens applied correctly' }
      vietnamese: { score: 8, max: 8, details: 'VND format, bilingual labels present' }

    total_score: 76
    total_max: 78
    normalized: 97.4
    grade: 'A'

    chart_data_match:
      max_deviation_pct: 0.3
      status: 'GREEN'
      details:
        - { label: 'VCB', chart: 15.2, raw: 15.2, deviation: '0.0%' }
        - { label: 'TCB', chart: 8.5, raw: 8.5, deviation: '0.0%' }
        - { label: 'BID', chart: 12.1, raw: 12.1, deviation: '0.0%' }
        - { label: 'CTG', chart: 9.8, raw: 9.8, deviation: '0.0%' }

    swd_checks:
      - { check: 'no_chart_junk', status: 'PASS' }
      - { check: 'minimal_spines', status: 'PASS' }
      - { check: 'highlight_present', status: 'PASS' }
      - { check: 'action_title', status: 'PASS' }
      - { check: 'brand_colors', status: 'PASS' }
      - { check: 'attribution', status: 'PASS' }
      - { check: 'vnd_formatting', status: 'PASS' }

    issues: []
    fix_instructions: []

  # Additional charts follow same structure...

flags:
  red: 0
  yellow: 0
  green: 4
  total_charts: 4

layer_4_details:
  chart_data_accuracy:
    max_deviation_across_all: 0.8
    status: 'GREEN'
    cap_applied: false
  label_accuracy: 'PASS'
  significant_figures: 'PASS'
  color_coding: 'PASS'
  attribution: 'PASS'

fix_instructions: []

revision_history:
  - revision: 0
    outcome: 'APPROVE'
    design_score: 72
    flags: { red: 0, yellow: 0 }
---
```

## Review Decision Algorithm

```python
def determine_design_outcome(charts_reviewed):
    red_count = 0
    yellow_count = 0
    min_grade = 'A'

    for chart in charts_reviewed:
        if chart['chart_data_match']['status'] == 'RED':
            red_count += 1
        elif chart['chart_data_match']['status'] == 'YELLOW':
            yellow_count += 1

        if chart['grade'] < min_grade:
            min_grade = chart['grade']

    # Hard REJECT: any chart-data mismatch >5%
    if red_count > 0:
        return 'REJECT'

    # APPROVE: all charts grade B or better, no YELLOW flags
    if min_grade >= 'B' and yellow_count == 0:
        return 'APPROVE'

    # CHANGES: minor issues fixable
    if yellow_count <= 2 and min_grade >= 'C':
        return 'CHANGES'

    return 'REJECT'
```

## Revision Protocol

### On CHANGES Outcome

1. Return specific charts to chart-maker with fix instructions
2. Chart-maker regenerates only affected charts
3. Re-run design review on regenerated charts only
4. Maximum 2 revision cycles

### Fix Instruction Format

```yaml
fix_instructions:
  - chart_id: 'chart_002'
    issues:
      - dimension: 'focus'
        check: 'context_muted'
        details: 'VN-Index line should be 40% opacity, currently 80%'
        action: 'Set alpha=0.4 for VN-Index series'
      - dimension: 'vietnamese'
        check: 'bilingual_labels'
        details: 'Y-axis missing Vietnamese label'
        action: "Add '(Chi so hieu suat)' to y-axis label"
    priority: 'medium'
```

## Error Handling

| Scenario                       | Action                                  |
| ------------------------------ | --------------------------------------- |
| No charts to review            | SKIP - return empty review              |
| Manifest missing               | Generate review from PNG files directly |
| Raw data unavailable for match | Skip accuracy check, note limitation    |
| Chart file corrupted           | RED flag, request regeneration          |
| 2 revision cycles exhausted    | REJECT with escalation                  |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
