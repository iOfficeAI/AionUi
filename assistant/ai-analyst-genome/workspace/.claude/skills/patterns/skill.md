# Patterns Skill

# Cross-Analysis Pattern Detection

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/patterns` command
- Auto-suggested after 5+ analyses archived
- Useful for identifying recurring themes

## Command

`/patterns` - Detect patterns across all archived analyses
`/patterns [tag]` - Patterns within a specific tag (e.g., "banking")
`/patterns symbols` - Most analyzed symbols
`/patterns quality` - Quality patterns (common flag types)

## Purpose

Scan archived analyses in `.knowledge/analyses/` to detect recurring themes, frequently analyzed symbols, common findings, and quality patterns. This provides meta-level insights about the user's analytical focus.

## Pattern Detection

### 1. Symbol Frequency

```
Most Analyzed Symbols (Last 30 Days)
=====================================
 1. VCB  - 8 analyses (34%)
 2. TCB  - 6 analyses (26%)
 3. FPT  - 5 analyses (22%)
 4. HPG  - 4 analyses (17%)
 5. MBB  - 4 analyses (17%)

Insight: Banking sector dominates your analysis focus (60% of queries).
Consider diversifying into under-analyzed sectors.
```

### 2. Finding Recurrence

Detect if the same finding keeps appearing:

```
Recurring Findings
==================
 1. "VCB trades at P/E premium over peers" - Found in 5 analyses
 2. "Banking ROE exceeds market average" - Found in 4 analyses
 3. "Foreign selling pressure on large caps" - Found in 3 analyses

Insight: These findings are well-established. Consider testing
counter-hypotheses or investigating changes to these patterns.
```

### 3. Metric Trends

Track how key metrics change across analyses:

```
VCB P/E Trend Across Your Analyses
===================================
 Feb 18: 15.8x
 Feb 19: 15.5x
 Feb 20: 15.2x
 Feb 21: 15.2x

Trend: Gradual compression (-0.6x over 4 days)
Significance: Not yet statistically significant (only 4 data points)
```

### 4. Quality Patterns

Common validation issues across analyses:

```
Common Quality Flags (Last 20 Analyses)
========================================
 1. Small sample sizes (n<30)    - 8 occurrences (40%)
 2. Missing macro context        - 5 occurrences (25%)
 3. Financial data lag           - 4 occurrences (20%)
 4. Multiple comparisons warning - 3 occurrences (15%)

Recommendation:
  - Consider using broader date ranges to increase sample sizes
  - Always include macro context (VN-Index level, SBV rate) in analyses
```

## Output

Patterns are presented as observations, not predictions. No statistical claims are made about patterns (that would require the full analysis pipeline).

---

**Powered by AI Analyst Lab | aianalystlab.ai**
