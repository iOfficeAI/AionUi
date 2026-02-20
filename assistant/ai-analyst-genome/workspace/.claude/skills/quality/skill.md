# Quality Skill

# Show Confidence Breakdown and Validation History

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/quality` command
- After any analysis to review validation details

## Command

`/quality` - Show current analysis confidence breakdown
`/quality breakdown` - Detailed per-layer scores with all checks
`/quality history` - Historical confidence scores
`/quality flags` - View active quality flags
`/quality trend` - Quality trend over recent analyses

## Purpose

Provide transparency into the validation system. Users can see exactly how confidence scores are calculated, what issues were flagged, and how quality has trended over time.

## Commands

### Quality Overview

`/quality`

```
Quality Report — Current Analysis
==================================

Overall Confidence: 84 (B)
Outcome: APPROVE

Layer Scores:
  L1 Data Quality:           90 (A) ||||||||||||||||||||  [25% weight]
  L2 Statistical Rigor:      85 (B) |||||||||||||||||     [40% weight]
  L3 Logical Coherence:      80 (B) ||||||||||||||||      [20% weight]
  L4 Presentation Accuracy:  80 (B) ||||||||||||||||      [15% weight]

Flags: 0 RED | 4 YELLOW | 14 GREEN
Simpson's Paradox: Not detected

Formula: 0.25*90 + 0.40*85 + 0.20*80 + 0.15*80 = 84.75 -> 84
```

### Detailed Breakdown

`/quality breakdown`

Shows each individual check within each layer with its status and details.

```
Layer 2: Statistical Rigor (Score: 85, Grade B)
================================================

 # | Check                | Status | Details
---|----------------------|--------|--------
 1 | Test selection       | GREEN  | t-test appropriate for continuous comparison
 2 | Confidence intervals | GREEN  | 95% CIs on all 4 estimates
 3 | Effect sizes         | GREEN  | Cohen's d reported for all tests
 4 | Sample size          | YELLOW | Tech sector n=12, below 30 threshold
 5 | Multiple comparisons | YELLOW | 5 tests run, family-wise error 22.6%
 6 | Simpson's Paradox    | GREEN  | No paradox (reversal rate 10%)

Score calculation: 100 - (0*20) - (2*7) = 86 -> 85 (rounded)
```

### Quality History

`/quality history`

```
Quality History (Last 10 Analyses)
===================================

 # | Date       | Score | Grade | Outcome
---|------------|-------|-------|--------
 1 | 2026-02-21 | 84    | B     | APPROVE
 2 | 2026-02-20 | 92    | A     | APPROVE
 3 | 2026-02-19 | 72    | C     | APPROVE*
 4 | 2026-02-18 | 88    | B     | APPROVE
 5 | 2026-02-17 | 95    | A     | APPROVE

Average: 86.2 (B)
Trend: Stable
* = Approved after revision
```

### Quality Flags

`/quality flags`

Shows active quality flags from `.knowledge/validation/quality_flags.yaml`.

```
Active Quality Flags
====================

Recent flags (last 7 days):
  YELLOW | 2026-02-21 | Small sample size (n=12) in tech sector comparison
  YELLOW | 2026-02-21 | Multiple comparisons (5 tests, 22.6% FWER)
  YELLOW | 2026-02-20 | Financial data 48h old (within warn threshold)
  YELLOW | 2026-02-19 | Macro context incomplete in banking analysis

No RED flags in last 7 days.
```

## Data Sources

- `.knowledge/validation/confidence_history.yaml` - Score history
- `.knowledge/validation/quality_flags.yaml` - Flag log
- `.knowledge/validation/review_loops.yaml` - Revision history
- `_working/validation_report.md` - Current validation details

---

**Powered by AI Analyst Lab | aianalystlab.ai**
