# Analysis Design Spec Skill

# Confirm Question / Decision / Data / Dimensions Before Running

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Auto-invoked for L4-L5 queries (before full pipeline runs)
- Manual via `/analysis-design` command
- Recommended for L3 queries with ambiguous scope

## Command

`/analysis-design` or `/design-spec`

## Purpose

Before committing to a complex analysis (L4-L5), confirm the scope with the user. This prevents wasted effort on misunderstood questions and ensures the analysis addresses the actual decision the user faces.

## The Four Confirmations

### 1. Question Confirmation

```
I understand your question as:
"[Restated question in analytical terms]"

Is this correct, or would you like to adjust?
```

### 2. Decision Confirmation

```
The decision this analysis will inform:
"[Decision statement]"

Example outcomes:
- If positive: [likely action]
- If negative: [likely action]
- If inconclusive: [likely action]

Does this match your intended use?
```

### 3. Data Confirmation

```
Data I'll analyze:
- Symbols: [list]
- Metrics: [list]
- Time range: [start] to [end]
- Sources: [KBS/VCI] (primary/secondary)

Data limitations:
- [Any known gaps or staleness]

Is this the right scope?
```

### 4. Dimensions Confirmation

```
Analysis dimensions:
- Segmentation by: [sector, market cap, etc.]
- Comparison groups: [group A vs group B]
- Time granularity: [daily/weekly/monthly/quarterly]
- Statistical tests planned: [t-test, chi-square, etc.]

Estimated completion time: [X minutes]
Estimated complexity: [L4/L5]

Shall I proceed?
```

## Design Spec Output

```yaml
---
design_spec_id: 'ds_20260221_143500'
question_id: 'q_20260221_143500'
confirmed_by_user: true

question: 'Find undervalued banking stocks with strong fundamentals and momentum'
decision: 'Identify 3-5 banking stocks for potential investment'

data_scope:
  symbols: ['VCB', 'TCB', 'BID', 'CTG', 'MBB', 'ACB', 'VPB', 'STB', 'HDB', 'TPB']
  metrics: ['pe_ratio', 'pb_ratio', 'roe', 'npl_ratio', 'price_return_6m', 'volume_20d_avg']
  time_range: { start: '2025-01-01', end: '2026-02-21' }
  sources: { primary: 'KBS', secondary: 'VCI' }

analysis_plan:
  segmentation: ['valuation_bucket', 'ownership_type']
  comparisons: ['SOE_banks vs private_banks', 'high_roe vs low_roe']
  time_granularity: 'monthly'
  statistical_tests: ['t_test', 'confidence_interval', 'cohens_d']
  simpsons_check: true

estimated_time: '2-3 minutes'
estimated_agents: 12
---
```

## User Interaction

For L4-L5 queries, present the design spec and wait for confirmation:

```
Analysis Design Spec
====================

Question: Find undervalued banking stocks with strong fundamentals and momentum

Decision this informs: Identify 3-5 banking stocks for potential investment

Data scope:
  - 10 banking stocks (VCB, TCB, BID, CTG, MBB, ACB, VPB, STB, HDB, TPB)
  - 6 metrics (P/E, P/B, ROE, NPL ratio, 6M return, volume)
  - Period: Jan 2025 to Feb 2026

Analysis plan:
  - Segment by valuation and ownership type
  - Compare SOE vs private banks
  - Statistical tests: t-test, CIs, effect sizes
  - Simpson's Paradox check included

Estimated time: 2-3 minutes

Proceed with this analysis? (yes / adjust / abort)
```

## Adjustment Handling

If user says "adjust":

- Ask which section to modify
- Update the design spec
- Re-confirm

If user says "abort":

- Log the abort
- Return to question-framing for reformulation

---

**Powered by AI Analyst Lab | aianalystlab.ai**
