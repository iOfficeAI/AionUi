# Simpson's Paradox Skill

# Segment-First Aggregation Paradox Check

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- MANDATORY before any aggregate conclusion in L2+ analyses
- Auto-invoked by descriptive-analytics, overtime-trend, cohort-analysis agents
- Validated by Layer 2 of the validation agent

## Command

`/simpsons-check` (manual) or auto-invoked

## Purpose

Detect Simpson's Paradox: where an aggregate trend reverses when data is segmented by a confounding variable. This is one of the most dangerous statistical traps in financial analysis.

## What is Simpson's Paradox?

**Example in Vietnamese Market:**

```
Aggregate: VN-Index rose 12% in 2025
Reality by sector:
  Banking: +25% (weight: 40% of index)
  Real Estate: -15%
  Technology: -8%
  Materials: -12%
  Consumer: -5%
  Others: -3%

Paradox: "The market rose 12%" is misleading because 8/10 sectors DECLINED.
The aggregate was driven entirely by banking's heavy weight.
```

## Protocol

### Step 1: Identify Aggregate Claims

Scan for claims about groups, averages, or trends:

- "Market returned X%"
- "Sector average P/E is Y"
- "Banking stocks outperformed"
- "Volume increased overall"

### Step 2: Choose Segmentation Dimensions

For each aggregate claim, segment by these dimensions (in priority order):

1. **Sector** - Most common confounding variable
2. **Market Cap** - Size effects distort averages
3. **Exchange** - HOSE vs HNX vs UPCOM have different characteristics
4. **Time Period** - Quarterly can reveal reversals not visible annually
5. **Ownership** - SOE vs Private have different dynamics

### Step 3: Run the Check

```python
from helpers.stats_helpers import check_simpson_paradox

result = check_simpson_paradox(
    data=analysis_data,
    value_col='return_12m',      # The metric being analyzed
    group_col='outperformed',    # Binary: Yes/No or group comparison
    subgroup_col='sector',       # Segmentation dimension
)
```

### Step 4: Interpret Results

| Reversal Rate | Classification    | Action                                              |
| ------------- | ----------------- | --------------------------------------------------- |
| 0-20%         | No paradox        | Proceed with aggregate conclusion                   |
| 21-50%        | Partial reversal  | Add caveat: "Note: X/Y sectors show opposite trend" |
| >50%          | SIMPSON'S PARADOX | REJECT aggregate conclusion, report by segment      |

### Step 5: Report

```yaml
simpsons_paradox_check:
  claim: 'Vietnamese market returned 12% in 2025'
  segmentation: 'sector'
  aggregate_direction: 'positive'
  subgroups:
    - { name: 'Banking', direction: 'positive', value: +25%, weight: 40% }
    - { name: 'Real Estate', direction: 'negative', value: -15%, weight: 15% }
    - { name: 'Technology', direction: 'negative', value: -8%, weight: 10% }
    - { name: 'Materials', direction: 'negative', value: -12%, weight: 8% }
    - { name: 'Consumer', direction: 'negative', value: -5%, weight: 12% }
    - { name: 'Others', direction: 'negative', value: -3%, weight: 15% }
  reversal_count: 5
  total_subgroups: 6
  reversal_rate: 83.3%
  paradox_detected: true
  severity: 'RED'
  corrected_conclusion: 'Market return driven entirely by banking sector weight. 5/6 sectors declined. Aggregate trend is misleading.'
```

## Vietnamese Market Hotspots

These scenarios are especially prone to Simpson's Paradox in Vietnam:

1. **VN-Index performance** - Banking stocks (40% weight) can dominate index returns
2. **Sector P/E comparisons** - VCB alone can skew "banking sector P/E"
3. **Volume trends** - A few high-cap stocks can show "market volume increase" while majority declines
4. **Foreign investment flows** - Heavy FOL utilization in a few names masks the overall flow
5. **IPO performance** - One mega-IPO can make "average IPO return" misleading

## Integration with Validation

When Simpson's Paradox is detected:

- Validation Layer 2 automatically flags RED
- Confidence score capped at F (0-59)
- Review outcome: REJECT (mandatory)
- Escalation to user with corrected segment-level analysis
- Original aggregate conclusion must be replaced with segment analysis

---

**Powered by AI Analyst Lab | aianalystlab.ai**
