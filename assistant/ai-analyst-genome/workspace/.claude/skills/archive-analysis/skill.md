# Archive Analysis Skill

# Archive Results to .knowledge/analyses/

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/archive` command
- Auto-suggested after successful analysis completion (APPROVE outcome)
- Recommended for L3+ analyses worth preserving

## Command

`/archive` - Archive the current analysis
`/archive [analysis_id]` - Archive a specific past analysis
`/archive list` - List all archived analyses

## Purpose

Persist analysis results to `.knowledge/analyses/` for future reference, pattern detection, and historical comparison. Archived analyses are used by the `/patterns` and `/history` skills.

## Archive Process

### Step 1: Collect Artifacts

Gather all `_working/` artifacts from the current analysis:

- `question_brief.md`
- `hypothesis_doc.md`
- `data_inventory.md`
- `analysis_report.md`
- `trend_report.md`
- `cohort_report.md`
- `investigation.md`
- `validation_report.md`
- `confidence_scores.yaml`

### Step 2: Generate Summary

Create a compact summary YAML:

```yaml
---
archive_id: 'arch_20260221_143500'
analysis_id: 'q_20260221_143500'
archived_at: '2026-02-21T15:00:00+07:00'
archived_by: 'user'

question: 'Which stocks have P/E<15 and ROE>20%?'
complexity: 'L3'
confidence: 84
grade: 'B'
outcome: 'APPROVE'

key_findings:
  - 'TCB, MBB, ACB meet both criteria'
  - 'Banking sector dominates the intersection'
  - 'Effect size: medium (d=0.62) for ROE difference'

symbols_analyzed: ['TCB', 'MBB', 'ACB', 'VPB', 'STB']
metrics_used: ['pe_ratio', 'roe']
statistical_tests: ['t_test', 'confidence_interval']
simpsons_paradox: false

artifacts:
  - path: '.knowledge/analyses/20260221_143500/summary.yaml'
  - path: '.knowledge/analyses/20260221_143500/analysis_report.md'
  - path: '.knowledge/analyses/20260221_143500/validation_report.md'

tags: ['banking', 'value_screening', 'pe_ratio', 'roe']
---
```

### Step 3: Store

Save to `.knowledge/analyses/[date]_[time]/`:

- `summary.yaml` - The compact summary
- `analysis_report.md` - Copy of main analysis
- `validation_report.md` - Copy of validation results

### Step 4: Index

Append entry to `.knowledge/analyses/index.yaml` for fast lookups.

## User Interaction

After a successful analysis:

```
Analysis complete (Confidence: 84, Grade B)

Archive this analysis for future reference? (yes/no)
```

If `/archive`:

```
Analysis archived successfully.
ID: arch_20260221_143500
Location: .knowledge/analyses/20260221_143500/
Tags: banking, value_screening, pe_ratio, roe

Use /history to view past analyses.
Use /patterns to detect cross-analysis patterns.
```

## Archive Listing

`/archive list`:

```
Archived Analyses
=================

 # | Date       | Question                              | Grade | Tags
---|------------|---------------------------------------|-------|-----
 1 | 2026-02-21 | Stocks with P/E<15 and ROE>20%        | B     | banking, value
 2 | 2026-02-20 | Banking sector Q4 performance          | A     | banking, trend
 3 | 2026-02-18 | VN30 sector allocation analysis        | B     | vn30, sector

3 analyses archived. Total storage: 245 KB
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
