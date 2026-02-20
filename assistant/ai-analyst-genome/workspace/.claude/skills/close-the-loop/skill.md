# Close the Loop Skill

# Ensure Follow-Up Tracking for Analysis Recommendations

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Ensure every analysis recommendation has a concrete follow-up plan with owners, tracking metrics, target dates, and success/failure criteria. This skill triggers at the end of any analysis that produces recommendations, complementing the close-the-loop agent.

## When to Use

- **Trigger:** Auto-applied at the end of any analysis with recommendations (L3+ queries)
- **Also invoked by:** close-the-loop agent for structured follow-up generation
- **Context:** After storytelling agent has produced recommendations

## Instructions

### Step 1: Extract Recommendations

Scan these artifacts for recommendations:

- `_working/narrative.md` (Recommendations section)
- `_working/storyboard.md` (Resolution phase slides)
- `_working/sizing_report.md` (Opportunity scenarios)

### Step 2: For Each Recommendation, Ensure:

| Field                  | Required | How to Determine                                      |
| ---------------------- | -------- | ----------------------------------------------------- |
| **Owner**              | Yes      | From user profile role. Default: "Analysis requester" |
| **Metric**             | Yes      | Measurable outcome tied to the recommendation         |
| **Target value**       | Yes      | Success threshold for the metric                      |
| **Deadline**           | Yes      | Based on analysis time horizon                        |
| **Check-in cadence**   | Yes      | Weekly for short-term, monthly for long-term          |
| **Escalation trigger** | Yes      | When to raise concern (e.g., loss > 8%)               |

### Step 3: Generate Monitoring Plan

```yaml
monitoring:
  first_review: '[1 week from analysis date]'
  cadence: 'weekly|monthly'
  final_review: '[end of time horizon]'
  confidence_calibration: true # Track if prediction was accurate
```

### Step 4: Write to Artifacts

- Primary: `_working/close_the_loop.md` (via close-the-loop agent)
- Log: `.knowledge/user/query_log.yaml` (append entry)
- Archive: `.knowledge/analyses/` (at final review)

## Follow-Up Templates

### For Buy/Accumulate Recommendations

```yaml
action: 'Consider accumulating [SYMBOL]'
owner: '[role from profile]'
metric: 'Position P&L'
target_value: '+[expected_return]%'
deadline: '[time_horizon end]'
check_in: 'weekly'
escalation: 'Loss exceeds [stop_loss]% OR fundamental thesis breaks'
```

### For Monitor/Watch Recommendations

```yaml
action: 'Monitor [METRIC] for [SYMBOL/SECTOR]'
owner: '[role from profile]'
metric: '[specific metric to watch]'
target_value: '[threshold that triggers action]'
deadline: '[review date]'
check_in: 'daily|weekly'
escalation: 'Metric breaches [threshold]'
```

### For Research Further Recommendations

```yaml
action: 'Conduct follow-up analysis on [TOPIC]'
owner: 'Analysis requester'
metric: 'Analysis completed'
target_value: 'New analysis with confidence >= C'
deadline: '[next data refresh date]'
check_in: 'monthly'
escalation: 'Data not available by deadline'
```

## Quality Checks

Before finalizing the follow-up plan:

- [ ] Every recommendation has all required fields
- [ ] Deadlines account for Vietnamese market calendar (Tet, holidays)
- [ ] Escalation triggers are specific and measurable
- [ ] Monitoring cadence matches the time horizon
- [ ] Owner assignment matches user's role
- [ ] Confidence grade included as context

## Error Handling

| Scenario                 | Action                                                      |
| ------------------------ | ----------------------------------------------------------- |
| No recommendations found | SKIP - no follow-up needed                                  |
| User profile missing     | Use generic owners, suggest setting up profile with `/role` |
| No measurable metric     | Flag and suggest possible metrics                           |
| Unclear time horizon     | Default to 3-month review cycle                             |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
