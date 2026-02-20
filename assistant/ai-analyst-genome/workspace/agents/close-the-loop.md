# Close the Loop Agent

# Pipeline Step 18: Follow-Up Tracking with Owners, Metrics, Dates

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "close-the-loop"
  version: "1.0.0"
  pipeline_step: 18

  INPUT_REQUIREMENTS:
    - "_working/narrative.md (recommendations from analysis)"
    - "_working/sizing_report.md (impact quantification)"
    - "_working/storyboard.md (action items from Resolution phase)"
    - "_working/validation_report.md (confidence context)"
    - ".knowledge/user/profile.yaml (user role for owner assignment)"

  OUTPUT_GUARANTEES:
    - "Every recommendation has an owner, metric, and target date"
    - "Monitoring plan with check-in cadence"
    - "Success/failure criteria defined for each action item"
    - "Escalation triggers specified"
    - "Feedback loop for confidence calibration"

  HANDOFF_ARTIFACTS:
    - "_working/close_the_loop.md"

  STATISTICAL_CEILING:
    allowed: ["confidence intervals"]
    forbidden: ["regression", "ANOVA", "ML"]

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if no recommendations found in pipeline artifacts"
    - "Returns MINIMAL_LOOP if user profile missing (generic owners)"
    - "Flags NO_METRIC if recommendation lacks measurable outcome"

  DEPENDENCIES:
    - "deck-creator (ensures full pipeline completed)"
    - "storytelling (recommendations source)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Close the Loop Agent ensures that every analysis recommendation has a concrete follow-up plan. It transforms vague recommendations into actionable items with assigned owners, tracking metrics, target dates, and success criteria. This prevents the common failure mode where excellent analysis produces no action.

## Follow-Up Framework

### Action Item Structure

Every recommendation becomes an action item with these fields:

| Field                  | Required | Description                                     |
| ---------------------- | -------- | ----------------------------------------------- |
| **action_id**          | Yes      | Unique identifier (act_YYYYMMDD_NNN)            |
| **recommendation**     | Yes      | The specific action from the analysis           |
| **owner**              | Yes      | Role or person responsible                      |
| **metric**             | Yes      | Measurable outcome to track                     |
| **target_value**       | Yes      | Success threshold for the metric                |
| **baseline_value**     | Yes      | Current value of the metric                     |
| **deadline**           | Yes      | Target completion date                          |
| **check_in_cadence**   | Yes      | How often to review (daily/weekly/monthly)      |
| **escalation_trigger** | Yes      | When to raise concern                           |
| **confidence**         | Yes      | Original analysis confidence grade              |
| **status**             | Yes      | not_started / in_progress / completed / blocked |

### Owner Assignment Rules

Based on user profile role:

| User Role             | Default Owner          | Escalation To       |
| --------------------- | ---------------------- | ------------------- |
| **Quant Researcher**  | "Quant desk"           | "Research head"     |
| **Retail Investor**   | "Self (portfolio)"     | "Financial advisor" |
| **Trader**            | "Trading desk"         | "Risk manager"      |
| **Portfolio Manager** | "Investment committee" | "CIO"               |
| **Unknown**           | "Analysis requester"   | "Team lead"         |

### Metric Selection Rules

For each recommendation type, suggest appropriate tracking metrics:

| Recommendation Type  | Suggested Metrics                                        |
| -------------------- | -------------------------------------------------------- |
| **Buy/Accumulate**   | Entry price, position size, unrealized P&L, days held    |
| **Sell/Reduce**      | Exit price, realized P&L, opportunity cost               |
| **Monitor**          | Target metric level, alert threshold, check frequency    |
| **Research further** | Follow-up analysis date, data availability, new findings |
| **Rebalance**        | Portfolio weight change, tracking error, Sharpe ratio    |
| **Hedge**            | Hedge cost, correlation to base position, net exposure   |

### Deadline Rules

| Time Horizon           | Default Deadline    | Check-In Cadence   |
| ---------------------- | ------------------- | ------------------ |
| Short-term (trading)   | 1-5 trading days    | Daily              |
| Medium-term (tactical) | 1-3 months          | Weekly             |
| Long-term (strategic)  | 6-12 months         | Monthly            |
| Event-driven           | Event date + 5 days | Daily around event |

### Vietnamese Market Calendar Awareness

- **Tet holiday:** No deadlines during Tet week, extend by 7 days
- **Quarterly reporting:** Check-ins aligned with earnings release dates
- **FTSE/MSCI reviews:** Event-driven check-ins around review dates
- **SBV meetings:** Monitor rate decisions quarterly
- **T+2 settlement:** Execution deadlines account for settlement

## Monitoring Plan

### Confidence Calibration

Track whether analysis recommendations play out as predicted. Over time, this calibrates confidence scoring:

```yaml
calibration:
  analysis_id: 'q_20260221_143500'
  confidence_at_publication: 84
  grade_at_publication: 'B'
  predicted_outcome: 'Banking P/E re-rates to 12.0 within 12 months'
  actual_outcome: null # Filled in at review date
  calibration_score: null # |predicted - actual| / predicted
  feedback_to_validation: null # Whether confidence was accurate
```

### Review Schedule

```yaml
review_schedule:
  - date: '2026-03-07'
    type: 'weekly_check'
    items: ['act_20260221_001', 'act_20260221_002']
    focus: 'Price action confirmation'

  - date: '2026-04-15'
    type: 'quarterly_review'
    items: 'all'
    focus: 'Q1 2026 earnings impact'

  - date: '2026-08-21'
    type: '6_month_review'
    items: 'all'
    focus: 'Full horizon assessment'

  - date: '2027-02-21'
    type: 'final_review'
    items: 'all'
    focus: 'Analysis calibration'
```

## Output Format

Write to `_working/close_the_loop.md`:

```yaml
---
loop_id: 'loop_20260221_143900'
analysis_id: 'q_20260221_143500'
generated_at: '2026-02-21T14:39:00+07:00'
total_action_items: 4
confidence: 84
grade: 'B'

action_items:
  - action_id: 'act_20260221_001'
    recommendation: 'Consider selective exposure to Deep Value banking stocks (VCB, TCB)'
    owner: 'Self (portfolio)'
    metric: 'Position unrealized P&L'
    target_value: '+12.5% return'
    baseline_value: 'No position'
    deadline: '2026-08-21'
    check_in_cadence: 'weekly'
    escalation_trigger: 'Unrealized loss > 8% OR banking index drops > 10% from entry'
    success_criteria: 'Position achieves +10% or more within 6 months'
    failure_criteria: 'Stop-loss triggered at -8% OR fundamental thesis invalidated'
    confidence: 'B (84)'
    status: 'not_started'
    notes: 'Wait for foreign selling to stabilize before entry. Monitor weekly KBS data.'

  - action_id: 'act_20260221_002'
    recommendation: 'Monitor foreign investor net flows in banking sector'
    owner: 'Self (portfolio)'
    metric: 'Weekly foreign net buy/sell (VND)'
    target_value: 'Net buying > 100B VND/week for 3 consecutive weeks'
    baseline_value: 'Net selling 200B VND/week (Q4 2025 average)'
    deadline: '2026-05-21'
    check_in_cadence: 'weekly'
    escalation_trigger: 'Net selling accelerates > 500B VND/week'
    success_criteria: 'Foreign flows turn positive for 3+ consecutive weeks'
    failure_criteria: 'Foreign selling continues past FTSE review date'
    confidence: 'B (84)'
    status: 'not_started'

  - action_id: 'act_20260221_003'
    recommendation: 'Re-run analysis after Q1 2026 earnings release'
    owner: 'Analysis requester'
    metric: 'Updated P/E ratios and ROE for 15 banks'
    target_value: 'Refresh analysis with Q1 2026 data'
    baseline_value: 'Current analysis uses Q3 2025 financials'
    deadline: '2026-05-15'
    check_in_cadence: 'monthly'
    escalation_trigger: 'Earnings miss expectations by >10%'
    success_criteria: 'Updated analysis maintains or improves confidence'
    failure_criteria: 'Fundamental deterioration detected'
    confidence: 'N/A (follow-up)'
    status: 'not_started'

  - action_id: 'act_20260221_004'
    recommendation: 'Set price alerts for VCB and TCB'
    owner: 'Self (portfolio)'
    metric: 'Daily closing price'
    target_value: 'VCB: 75,000 VND (entry), 95,000 VND (target); TCB: 40,000 VND (entry), 52,000 VND (target)'
    baseline_value: 'VCB: 82,500 VND; TCB: 45,200 VND'
    deadline: '2026-02-22'
    check_in_cadence: 'daily'
    escalation_trigger: 'Price drops below entry level'
    success_criteria: 'Alerts configured and active'
    failure_criteria: 'N/A (monitoring setup)'
    confidence: 'N/A (operational)'
    status: 'not_started'

monitoring_plan:
  review_cadence: 'weekly'
  first_review: '2026-03-07'
  final_review: '2027-02-21'
  confidence_calibration: true

  review_schedule:
    - { date: '2026-03-07', type: 'weekly', focus: 'Initial price action' }
    - { date: '2026-04-15', type: 'quarterly', focus: 'Q1 earnings impact' }
    - { date: '2026-08-21', type: '6_month', focus: 'Horizon assessment' }
    - { date: '2027-02-21', type: 'final', focus: 'Calibration review' }

  escalation_protocol:
    - trigger: 'Stop-loss hit on any position'
      action: 'Immediate review, consider closing all banking positions'
      notify: 'Self'
    - trigger: 'Confidence drops below C on re-analysis'
      action: 'Exit positions, reassess thesis'
      notify: 'Financial advisor'
    - trigger: 'Macro event (SBV rate hike, FTSE rejection)'
      action: 'Emergency re-analysis within 48 hours'
      notify: 'Self'

persistence:
  logged_to: '.knowledge/user/query_log.yaml'
  archived_to: '.knowledge/analyses/'

attribution: 'Powered by AI Analyst Lab | aianalystlab.ai'
---
```

## Integration with .knowledge/

### Query Log Update

Append to `.knowledge/user/query_log.yaml`:

```yaml
- query_id: 'q_20260221_143500'
  question: 'Are banking stocks undervalued?'
  complexity: 'L4'
  confidence: 84
  grade: 'B'
  action_items: 4
  status: 'monitoring'
  next_review: '2026-03-07'
```

### Analysis Archive

When the monitoring period ends, archive the complete analysis:

```yaml
# .knowledge/analyses/q_20260221_143500.yaml
analysis_id: 'q_20260221_143500'
completed_at: '2026-02-21'
confidence: 84
outcome: 'pending' # Updated at final review
action_items_completed: 0
action_items_total: 4
```

## Error Handling

| Scenario                                | Action                                                   |
| --------------------------------------- | -------------------------------------------------------- |
| No recommendations found                | SKIP - nothing to track                                  |
| User profile missing                    | MINIMAL_LOOP with generic owners                         |
| Recommendation lacks measurable outcome | Flag NO_METRIC, suggest possible metrics                 |
| Analysis confidence F                   | Add warning: "Low confidence analysis - monitor closely" |
| No deadline determinable                | Default to 3-month review cycle                          |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
