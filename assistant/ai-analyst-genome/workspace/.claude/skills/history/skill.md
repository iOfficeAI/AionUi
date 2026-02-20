# History Skill

# View Past Analyses and Quality Trends

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/history` command
- When user wants to review previous analyses

## Command

`/history` - List recent analyses (last 10)
`/history [analysis_id]` - View details of a specific analysis
`/history search [keyword]` - Search past analyses
`/history quality` - Show quality trend over time
`/history stats` - Summary statistics of all analyses

## Purpose

Provide access to the analysis audit trail stored in `.knowledge/analyses/` and `.knowledge/validation/confidence_history.yaml`. This allows users to review past work, track quality trends, and reference previous findings.

## Commands

### Recent Analyses

`/history`

```
Recent Analyses
===============

 # | Date       | Question                           | Level | Confidence | Outcome
---|------------|---------------------------------------|-------|-----------|--------
 1 | 2026-02-21 | Compare VCB and TCB P/E ratios       | L2    | 92 (A)    | APPROVE
 2 | 2026-02-20 | Which stocks have P/E<15 and ROE>20% | L3    | 84 (B)    | APPROVE
 3 | 2026-02-19 | Why did banking P/E decline in Q4?   | L4    | 72 (C)    | APPROVE*
 4 | 2026-02-18 | Analyze VN30 sector allocation       | L3    | 88 (B)    | APPROVE
 5 | 2026-02-17 | VNM price lookup                     | L1    | 95 (A)    | APPROVE

* = Approved after 1 revision cycle

Showing 5 of 23 total analyses. Use /history stats for summary.
```

### Quality Trend

`/history quality`

```
Quality Trend (Last 30 Days)
============================

Average confidence: 85.2 (B)
Trend: Stable (no significant change)

Grade distribution:
  A (90-100): 8 analyses (35%)
  B (80-89):  10 analyses (43%)
  C (70-79):  4 analyses (17%)
  D (60-69):  1 analysis (4%)
  F (0-59):   0 analyses (0%)

Review outcomes:
  APPROVE: 18 (78%)
  APPROVE_WITH_CHANGES: 4 (17%)
  REJECT: 1 (4%)

Common issues:
  1. Small sample sizes (n<30) - 6 occurrences
  2. Missing macro context - 4 occurrences
  3. Financial data lag - 3 occurrences
```

### Analysis Details

`/history [analysis_id]`

Shows the full analysis summary including question, findings, confidence breakdown, and any revision history.

## Data Sources

- `.knowledge/analyses/*.yaml` - Archived analysis results
- `.knowledge/validation/confidence_history.yaml` - Score history
- `.knowledge/validation/review_loops.yaml` - Revision history
- `.knowledge/user/query_log.yaml` - Query log

## Storage

Each analysis entry:

```yaml
- analysis_id: 'q_20260221_143500'
  timestamp: '2026-02-21T14:35:00+07:00'
  question: 'Compare VCB and TCB P/E ratios'
  complexity: 'L2'
  confidence: 92
  grade: 'A'
  outcome: 'APPROVE'
  revisions: 0
  key_finding: 'VCB trades at 85% P/E premium over TCB'
  symbols: ['VCB', 'TCB']
  metrics: ['pe_ratio']
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
