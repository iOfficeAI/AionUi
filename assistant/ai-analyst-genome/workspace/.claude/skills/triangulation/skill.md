# Triangulation Skill

# Cross-Validate Findings from Multiple Angles

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Auto-applied during L3-L5 analysis pipeline
- After analysis agents produce findings
- When findings reference multiple data points

## Command

`/triangulate` (manual) or auto-invoked by analysis agents

## Purpose

Cross-validate analytical findings by checking consistency across:

1. Multiple data sources (KBS vs VCI vs TCBS)
2. Multiple time windows (1M vs 3M vs 12M)
3. Multiple metrics (P/E + P/B + ROE alignment)
4. Multiple segmentations (sector vs exchange vs market cap)

## Protocol

### Step 1: Source Triangulation

Compare the same metric from 2+ data sources.

```python
# Example: Compare VCB P/E from KBS and VCI
from helpers.vnstock_helpers import fetch_ratios

kbs_pe = fetch_ratios('VCB', source='KBS')['pe_ratio']
vci_pe = fetch_ratios('VCB', source='VCI')['pe_ratio']
variance = abs(kbs_pe - vci_pe) / kbs_pe * 100
```

| Variance | Status | Action                                           |
| -------- | ------ | ------------------------------------------------ |
| < 1%     | GREEN  | Sources agree, high confidence                   |
| 1-2%     | GREEN  | Minor variance, acceptable                       |
| 2-5%     | YELLOW | Flag variance, use primary (KBS), note in report |
| > 5%     | RED    | Investigate discrepancy, escalate                |

### Step 2: Temporal Triangulation

Check if finding is consistent across time windows.

- Short-term (1 month): Confirms current trend
- Medium-term (3 months): Confirms persistence
- Long-term (12 months): Confirms structural pattern

If finding reverses over different windows, flag as YELLOW.

### Step 3: Metric Triangulation

Check if related metrics tell a consistent story.

**Consistency Rules:**

- If "undervalued": P/E low AND P/B low (inconsistent if P/E low but P/B high)
- If "growth stock": Revenue growing AND earnings growing
- If "quality": High ROE AND low NPL AND positive cash flow
- If "momentum": Short-term return positive AND volume increasing

Flag inconsistencies as YELLOW (partial support) or RED (contradictory).

### Step 4: Segment Triangulation

Check if aggregate finding holds across subgroups.

This is the Simpson's Paradox check applied to analytical conclusions.

```python
from helpers.stats_helpers import check_simpson_paradox
```

If finding reverses in >50% of subgroups: RED flag.

## Output

Log to `_working/triangulation_log.yaml`:

```yaml
finding: 'Banking sector ROE exceeds market average'
triangulation:
  source:
    status: 'GREEN'
    kbs: 15.2
    vci: 15.5
    variance: 1.97%
  temporal:
    status: 'GREEN'
    1m: 15.3
    3m: 15.1
    12m: 14.8
    trend: 'consistent and improving'
  metric:
    status: 'GREEN'
    roe_high: true
    pe_reasonable: true
    npl_low: true
    consistent: true
  segment:
    status: 'GREEN'
    paradox_detected: false
    reversal_rate: 10%
overall: 'STRONG - finding validated across all 4 dimensions'
```

## Flagging

| Overall  | Condition              | Impact on Confidence        |
| -------- | ---------------------- | --------------------------- |
| STRONG   | All 4 dimensions GREEN | No impact (full confidence) |
| MODERATE | 1-2 YELLOW flags       | -5 from confidence score    |
| WEAK     | 3+ YELLOW or 1 RED     | -15 from confidence score   |
| FAILED   | 2+ RED flags           | REJECT analysis             |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
