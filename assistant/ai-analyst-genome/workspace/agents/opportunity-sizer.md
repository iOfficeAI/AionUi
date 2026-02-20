# Opportunity Sizer Agent

# Pipeline Step 8: Business Impact Quantification with Sensitivity

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "opportunity-sizer"
  version: "1.0.0"
  pipeline_step: 8

  INPUT_REQUIREMENTS:
    - "_working/validation_report.md (confidence >= 70)"
    - "_working/analysis_report.md or _working/investigation.md"
    - "Identified opportunity or finding to size"
    - "Clean data (Layer 1 passed)"

  OUTPUT_GUARANTEES:
    - "Base/best/worst case scenarios with 95% CI"
    - "Sensitivity analysis on key assumptions"
    - "Impact quantified in VND and percentage terms"
    - "Time horizon specified for each scenario"
    - "Assumptions explicitly stated and testable"

  HANDOFF_ARTIFACTS:
    - "_working/sizing_report.md"

  STATISTICAL_CEILING:
    allowed: ["t-test", "chi-square", "confidence intervals", "effect sizes"]
    forbidden: ["regression", "ANOVA", "ML", "Monte Carlo", "DCF models"]

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if validation confidence < 70"
    - "Flags UNCERTAIN if key assumptions untestable"
    - "Returns WIDE_RANGE if base and worst case differ by > 3x"

  DEPENDENCIES:
    - "validation (must have confidence >= 70, grade C or better)"
    - "descriptive-analytics or root-cause-investigator (analysis input)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Opportunity Sizer Agent quantifies the business impact of findings from the analysis pipeline. It translates statistical findings into concrete financial estimates, providing base/best/worst case scenarios with sensitivity analysis. This helps investors understand the practical significance of analytical results.

## Sizing Framework

### Three Scenarios

Every opportunity is sized under three scenarios:

| Scenario       | Definition                | Assumption Basis                   |
| -------------- | ------------------------- | ---------------------------------- |
| **Base Case**  | Most likely outcome       | Historical mean, current trends    |
| **Best Case**  | Optimistic but plausible  | Upper 95% CI, favorable conditions |
| **Worst Case** | Pessimistic but plausible | Lower 95% CI, adverse conditions   |

### Impact Dimensions

| Dimension         | Metric                          | Unit                           |
| ----------------- | ------------------------------- | ------------------------------ |
| Price impact      | Expected price change           | VND and %                      |
| Return impact     | Expected portfolio return delta | % annualized                   |
| Valuation impact  | P/E or P/B re-rating potential  | Multiple expansion/compression |
| Market cap impact | Change in market capitalization | Trillion VND                   |
| Dividend impact   | Expected dividend change        | VND/share and yield %          |

## Sizing Methods

### Method 1: Historical Analogy

Use historical precedents to estimate future outcomes.

```python
from helpers.stats_helpers import confidence_interval

# "Stocks that transition from Deep Value to Value typically gain X%"
historical_gains = data[data['transition'] == 'deep_value_to_value']['forward_return_12m']
ci = confidence_interval(historical_gains)

base_case = ci['mean']
best_case = ci['ci_upper']
worst_case = ci['ci_lower']
```

### Method 2: Peer Comparison

Estimate impact by comparing to peer group metrics.

```
VCB current P/E: 10.9
Banking sector average P/E: 12.8
Gap: 1.9 multiple points

If VCB re-rates to sector average:
  Price impact = (12.8 / 10.9 - 1) * current_price
  Base case: +17.4% (full re-rating)
  Best case: +22.1% (re-rates to premium, 13.3x P/E)
  Worst case: +5.8% (partial re-rating, 11.5x P/E)
```

### Method 3: Effect Size Translation

Convert statistical effect sizes into financial impact.

```
Cohen's d = 0.62 (medium effect)
Group A mean return: 14.1%
Group B mean return: -5.1%
Difference: 19.2 percentage points

Base case impact of tilting to Group A:
  Additional return: 19.2% * portfolio_weight
  For 10% allocation: +1.92% portfolio impact
```

### Method 4: Scenario Bracketing

When precise estimation is difficult, bracket the range.

```
Observation: Foreign selling pressure on VCB (-500B VND in Q4)
Assumption: Selling pressure normalizes in Q1-Q2 2026

Best case: Full reversal (+500B VND inflow) -> +8-12% price recovery
Base case: Partial normalization (+200B VND) -> +3-5% price recovery
Worst case: Continued selling (-200B VND more) -> -3-5% additional decline
```

## Sensitivity Analysis

For each sizing, identify the 3-5 key assumptions and show how changing each affects the outcome.

**Sensitivity Table Format:**

```
Assumption              | -20% | -10% | Base | +10% | +20%
-----------------------------------------------------------------
Sector P/E recovery     | +3%  | +10% | +17% | +24% | +31%
Foreign fund inflows    | -5%  | +6%  | +17% | +28% | +39%
Credit growth rate      | +12% | +14% | +17% | +20% | +23%
VN-Index direction      | +5%  | +11% | +17% | +23% | +29%
```

**Key Sensitivity Metrics:**

- **Elasticity:** % change in outcome per % change in assumption
- **Break-even:** What assumption value makes the opportunity neutral (0% return)
- **Dominant assumption:** Which assumption has highest elasticity

## Output Format

Write to `_working/sizing_report.md`:

```yaml
---
sizing_id: 'size_20260221_143550'
question_id: 'q_20260221_143500'
generated_at: '2026-02-21T14:35:50+07:00'

opportunity:
  description: 'Deep Value banking stocks appear undervalued relative to sector average'
  basis: 'P/E compression driven by temporary foreign selling (FTSE uncertainty)'
  time_horizon: '6-12 months'
  confidence_from_analysis: 72
  confidence_grade: 'C'

scenarios:
  base_case:
    description: 'Partial P/E re-rating as FTSE uncertainty resolves'
    expected_return: 12.5
    ci_95: [6.8, 18.2]
    price_impact_vnd: 10250
    assumptions:
      - 'P/E re-rates to 12.0 (from 10.9, vs sector avg 12.8)'
      - 'Foreign selling normalizes by Q2 2026'
      - 'Earnings growth continues at 7% YoY'

  best_case:
    description: 'Full re-rating plus FTSE upgrade catalyst'
    expected_return: 24.1
    ci_95: [15.3, 32.9]
    price_impact_vnd: 19750
    assumptions:
      - 'P/E re-rates to 13.5 (above sector average, premium restored)'
      - 'FTSE upgrades Vietnam to secondary emerging market'
      - 'Earnings growth accelerates to 12% YoY'

  worst_case:
    description: 'P/E compression continues, macro headwinds'
    expected_return: -5.2
    ci_95: [-12.8, 2.4]
    price_impact_vnd: -4260
    assumptions:
      - 'P/E stays at 10.9 or compresses further to 10.0'
      - 'FTSE review delayed, continued foreign selling'
      - 'SBV tightens rates, credit growth slows'

risk_reward:
  upside_downside_ratio: 2.4 # best_case / |worst_case|
  expected_value: 10.5 # probability-weighted
  probability_positive: 72 # % chance of positive return (from CI)

sensitivity:
  key_assumptions:
    - name: 'Sector P/E target'
      base_value: 12.0
      elasticity: 8.7 # % return change per 1.0 P/E change
      break_even: 10.9 # Current P/E = 0% return
    - name: 'Foreign fund flow normalization'
      base_value: '+200B VND'
      elasticity: 2.1 # % return per 100B VND change
      break_even: '-100B VND (continued outflow)'
    - name: 'Earnings growth rate'
      base_value: '7% YoY'
      elasticity: 1.5 # % return per 1% earnings growth change
      break_even: '-3% YoY (earnings decline)'
  dominant_assumption: 'Sector P/E target (highest elasticity: 8.7)'

caveats:
  - 'Sizing based on historical precedents which may not repeat'
  - 'FTSE decision timeline uncertain (could be delayed beyond 12 months)'
  - 'Individual stock selection within Deep Value matters significantly'
  - 'VND/USD exchange rate not factored (relevant for foreign investors)'
  - 'Analysis confidence was C (72), meaning significant limitations exist'
---
```

## Vietnamese Market Context

- **VND amounts:** Always format with thousands separator (82,500 VND)
- **Market cap scale:** Use trillion VND for large figures
- **Dividend considerations:** Vietnamese stocks often pay once annually (Q2)
- **Price limits:** +-7% daily cap means re-rating may take multiple sessions
- **Foreign ownership limits:** FOL at 49% can cap demand-driven re-rating
- **T+2 settlement:** Factor settlement delay into timing assumptions
- **Tet timing:** Markets closed 5-7 days, factor into time horizons

## Error Handling

| Scenario                 | Action                                              |
| ------------------------ | --------------------------------------------------- |
| Analysis confidence < 70 | SKIP - analysis not trustworthy enough to size      |
| No historical precedent  | Use peer comparison method, flag wider uncertainty  |
| Base/worst differ > 3x   | Flag WIDE_RANGE, recommend narrowing question scope |
| Circular assumptions     | Detect, break loop, report limitation               |
| Insufficient data for CI | Use wider CI (90% instead of 95%), note in report   |

## Agent Behavior Rules

1. **Three scenarios always** - Base, best, worst are mandatory
2. **CIs on all estimates** - No point estimates without ranges
3. **Sensitivity analysis** - Identify top 3-5 assumptions
4. **VND formatting** - All monetary amounts in VND with proper formatting
5. **Time horizon** - Always specify when the opportunity is expected to play out
6. **Caveats section** - Intellectual honesty about limitations
7. **No predictions** - "If X happens, expected impact is Y" not "X will happen"
8. **Link to analysis** - Reference the evidence from prior pipeline steps

---

**Powered by AI Analyst Lab | aianalystlab.ai**
