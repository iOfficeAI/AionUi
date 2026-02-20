# Run Pipeline Skill

# End-to-End Analysis Pipeline Execution (DAG-Based)

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Execute the full analysis pipeline from question to deliverables, following the DAG-defined agent sequence. Manages pipeline state, displays progress, and handles failures gracefully.

## When to Use

- **Trigger:** `/run-pipeline` command or auto-invoked for L4-L5 queries
- **Syntax:** `/run-pipeline [question]` or `/run-pipeline` (uses last question)
- **Aliases:** `/run`, `/analyze`

## Pipeline DAG

```
Step 1:  question-framing
            |
Step 3:  hypothesis
            |
Step 4:  data-explorer -----> source-tieout (Step 4.5)
                                   |
                     +-------------+-------------+
                     |             |             |
Step 5:  descriptive-analytics  overtime-trend  cohort-analysis
                     |
Step 6:  root-cause-investigator
                     |
Step 7:  validation (Layers 1-3)
                     |
Step 8:  opportunity-sizer
                     |
Step 9:  story-architect
                     |
Step 10: narrative-coherence-reviewer
                     |
Step 12: chart-maker
                     |
Step 13: visual-design-critic
                     |
Step 7b: validation (Layer 4)
                     |
Step 15: storytelling
                     |
Step 16: deck-creator
                     |
Step 18: close-the-loop
```

## Execution Protocol

### 1. Pre-Flight

```
a. Read .knowledge/active.yaml (verify active dataset)
b. Read .knowledge/datasets/{active}/manifest.yaml (verify connection)
c. Check _working/ for stale artifacts (warn if found)
d. Classify question complexity (L1-L5) via question-router skill
```

### 2. Route by Complexity

| Level            | Pipeline Path   | Agents Used                                        | Estimated Time |
| ---------------- | --------------- | -------------------------------------------------- | -------------- |
| L0 (Meta)        | Direct response | question-framing only                              | <5s            |
| L1 (Lookup)      | Quick path      | question-framing, data-explorer                    | <10s           |
| L2 (Compare)     | Short path      | + source-tieout, descriptive-analytics, validation | 10-30s         |
| L3 (Investigate) | Medium path     | + hypothesis, overtime-trend, validation           | 30-90s         |
| L4 (Deep dive)   | Full path       | All 17 pipeline agents                             | 1-3 min        |
| L5 (Strategic)   | Full + extras   | All pipeline + experiment-designer                 | 3-10 min       |

### 3. Execute Agents

For each agent in DAG order:

```
a. Display progress: "Step N/Total: [User-visible name]..."
b. Check dependencies: all upstream agents completed successfully
c. Execute agent
d. Verify output artifact exists
e. If failure: log error, check if pipeline can continue
f. Update progress display
```

### 4. Progress Display

```
[1/17] Understanding your question...          DONE (2s)
[2/17] Generating hypotheses...                DONE (5s)
[3/17] Finding relevant data...                DONE (8s)
[4/17] Verifying data integrity...             DONE (5s)
[5/17] Analyzing patterns...                   DONE (20s)
[6/17] Analyzing trends...                     DONE (18s)
[7/17] Analyzing cohorts...                    DONE (22s)
[8/17] Investigating root causes...            IN PROGRESS...
```

### 5. Post-Pipeline

```
a. Verify all expected artifacts exist in _working/
b. Display quality summary (confidence score and grade)
c. List generated outputs (deck, charts, summary)
d. Suggest export options
```

## Pipeline State Management

### State File: `_working/pipeline_state.yaml`

```yaml
pipeline_id: 'pipe_20260221_143500'
question: 'Are banking stocks undervalued?'
complexity: 'L4'
started_at: '2026-02-21T14:35:00+07:00'
status: 'running|completed|failed|paused'

agents:
  - id: 'question-framing'
    step: 1
    status: 'completed'
    started_at: '2026-02-21T14:35:00+07:00'
    completed_at: '2026-02-21T14:35:02+07:00'
    output: '_working/question_brief.md'

  - id: 'hypothesis'
    step: 3
    status: 'completed'
    started_at: '2026-02-21T14:35:02+07:00'
    completed_at: '2026-02-21T14:35:07+07:00'
    output: '_working/hypothesis_doc.md'

  # ... etc

last_completed_step: 8
next_step: 9
total_steps: 17
elapsed_time: '1m 45s'
```

## Failure Handling

| Failure Type               | Action                                            |
| -------------------------- | ------------------------------------------------- |
| Agent timeout (>60s)       | Log timeout, attempt retry once                   |
| Agent error                | Log error, skip if non-critical, halt if critical |
| Data not available         | Use cache fallback, warn user                     |
| Validation REJECT          | Report to user, offer options                     |
| Critical dependency failed | Halt pipeline, report which step failed           |

### Critical vs Non-Critical Agents

| Critical (halt on failure) | Non-Critical (skip and continue) |
| -------------------------- | -------------------------------- |
| question-framing           | cohort-analysis                  |
| data-explorer              | overtime-trend                   |
| source-tieout              | opportunity-sizer                |
| descriptive-analytics      | close-the-loop                   |
| validation                 |                                  |

## Instructions

1. **Always classify first:** Use question-router to determine complexity level
2. **Skip unnecessary agents:** L1 queries do not need the full pipeline
3. **Show progress:** Update user on each step completion
4. **Handle failures gracefully:** Continue where possible, report clearly
5. **Save state:** Write pipeline_state.yaml for resume-pipeline support
6. **Quality gate:** Do not present results if validation confidence < 70 (D/F)

## Example Usage

```
User: /run-pipeline Are banking stocks undervalued after the recent selloff?
```
