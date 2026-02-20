# Wave 3 Integration Test: L5 Strategic Query

# Full Pipeline + Optimization

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Test Query

> "Design an investment strategy for the banking sector with risk analysis"

## Complexity Classification

- **Expected Level:** L5 (Strategic)
- **Expected Agents:** Full 17-agent pipeline
- **Expected Time:** 3-10 minutes

## Pre-Conditions

1. vnstock connection active (or cached data available)
2. `.knowledge/active.yaml` points to vnstock_default dataset
3. All 19 agents created (17 pipeline + 2 standalone)
4. All Wave 1-3 skills deployed

## Pass Criteria (15 checks)

### Pipeline Execution (6 checks)

| #   | Check                     | Expected Artifact              | Pass Condition                             |
| --- | ------------------------- | ------------------------------ | ------------------------------------------ |
| 1   | Question classified as L5 | `_working/question_brief.md`   | `complexity_level: L5`                     |
| 2   | Full pipeline runs        | `_working/pipeline_state.yaml` | All 17 steps have `status: completed`      |
| 3   | Hypotheses generated      | `_working/hypothesis_doc.md`   | At least 4 hypotheses across 2+ categories |
| 4   | Data collected            | `_working/data_inventory.md`   | Banking sector data loaded                 |
| 5   | Source verified           | `_working/tieout_report.md`    | Layer 1 score >= 70                        |
| 6   | Analysis completed        | `_working/analysis_report.md`  | Segmentation + comparison results present  |

### Validation & Quality (3 checks)

| #   | Check                        | Expected Artifact                 | Pass Condition                                              |
| --- | ---------------------------- | --------------------------------- | ----------------------------------------------------------- |
| 7   | Validation runs all 4 layers | `_working/validation_report.md`   | All 4 layers scored, overall confidence >= 70 (C or better) |
| 8   | Simpson's Paradox checked    | `_working/validation_report.md`   | `simpsons_paradox.checked: true`                            |
| 9   | Confidence score computed    | `_working/confidence_scores.yaml` | Score 0-100 with letter grade                               |

### Narrative & Presentation (4 checks)

| #   | Check                        | Expected Artifact              | Pass Condition                                                  |
| --- | ---------------------------- | ------------------------------ | --------------------------------------------------------------- |
| 10  | Storyboard follows CTR       | `_working/storyboard.md`       | `narrative_arc: CTR`, context/tension/resolution phases present |
| 11  | Narrative coherence approved | `_working/coherence_review.md` | `outcome: APPROVE` or `outcome: CHANGES` (max 2 revisions)      |
| 12  | Charts generated             | `_working/charts/*.png`        | At least 2 charts with AI Analyst Lab watermark                 |
| 13  | Marp deck assembled          | `outputs/deck.marp.md`         | Valid Marp frontmatter, footer: "Powered by AI Analyst Lab"     |

### Follow-Up & Close (2 checks)

| #   | Check             | Expected Artifact            | Pass Condition                                          |
| --- | ----------------- | ---------------------------- | ------------------------------------------------------- |
| 14  | Opportunity sized | `_working/sizing_report.md`  | 3 scenarios (base/best/worst), sensitivity analysis     |
| 15  | Follow-up tracked | `_working/close_the_loop.md` | At least 2 action items with owners, metrics, deadlines |

## Expected Deliverables

1. `outputs/deck.marp.md` - Full slide deck (10-15 slides)
2. `outputs/analysis_summary.md` - Executive summary
3. `_working/charts/` - 2-5 brand-compliant charts
4. `_working/close_the_loop.md` - Follow-up plan
5. `_working/pipeline_state.yaml` - Pipeline execution log

## Validation Scoring Expectation

```
Layer 1 (Data Quality):     >= 80 (B)
Layer 2 (Statistical Rigor): >= 70 (C)
Layer 3 (Logical Coherence): >= 70 (C)
Layer 4 (Presentation):      >= 80 (B)
Overall:                      >= 70 (C or better)
```

## Failure Modes to Test

| Scenario                            | Expected Behavior                                             |
| ----------------------------------- | ------------------------------------------------------------- |
| Data source temporarily unavailable | Falls back to cache, continues pipeline                       |
| Validation REJECT at step 7         | Revises analysis, retries (max 2), escalates if still failing |
| Chart generation fails              | PARTIAL_DECK, logs warning, continues                         |
| Confidence < 70 after revision      | Escalates to user with options                                |

## Success Criteria

**PASS** if:

- 13 of 15 checks pass (allowing 2 non-critical failures)
- Overall confidence >= 70 (grade C or better)
- Marp deck renders valid markdown with correct footer
- At least 1 chart includes AI Analyst Lab watermark

**FAIL** if:

- Any critical check fails (1, 2, 7, 10, 13)
- Overall confidence < 60 (grade D or F)
- Pipeline hangs or crashes without error handling

---

**Powered by AI Analyst Lab | aianalystlab.ai**
