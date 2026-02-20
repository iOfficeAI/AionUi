# Resume Pipeline Skill

# Resume Analysis from Last Completed Step

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Resume a previously started pipeline from the last successfully completed step. Useful when a session is interrupted, an agent fails, or the user wants to re-run specific stages.

## When to Use

- **Trigger:** `/resume-pipeline` command
- **Syntax:** `/resume-pipeline` (auto-detect last state) or `/resume-pipeline [step_number]`
- **Aliases:** `/resume`
- **Context:** After a pipeline was interrupted, failed, or user returns in a new session

## Instructions

### Step 1: Load Pipeline State

```
1. Read _working/pipeline_state.yaml
2. If not found: inform user "No pipeline in progress. Use /run-pipeline to start."
3. Display current state:
   - Original question
   - Complexity level
   - Last completed step
   - Next step to execute
   - Total elapsed time
```

### Step 2: Verify Artifacts

```
For each completed step:
  1. Check that output artifact exists in _working/
  2. Check artifact is non-empty
  3. If artifact missing: mark step for re-execution
```

### Step 3: Resume Execution

```
1. Start from next uncompleted step
2. Follow same DAG order as run-pipeline
3. Display progress (continuing from last step number)
4. Handle failures same as run-pipeline
```

### Step 4: Resume from Specific Step

```
/resume-pipeline 9   # Resume from story-architect

1. Mark steps 9+ as "not_started" in pipeline_state
2. Keep artifacts from steps 1-8
3. Re-execute from step 9 onwards
4. Note: re-running a step may invalidate downstream artifacts
```

## Pipeline State Validation

Before resuming, validate:

| Check                       | Action if Failed                               |
| --------------------------- | ---------------------------------------------- |
| pipeline_state.yaml exists  | Error: "No pipeline state found"               |
| Original question recorded  | Error: "Question not recorded, cannot resume"  |
| At least 1 step completed   | Error: "No steps completed, use /run-pipeline" |
| Output artifacts exist      | Re-execute missing steps before continuing     |
| Data source still available | Warn if using cached data                      |

## Session Continuity

If resuming in a new Claude Code session:

1. Read `_working/pipeline_state.yaml` for pipeline context
2. Read `.knowledge/active.yaml` for dataset context
3. Read `_working/question_brief.md` for question context
4. Announce: "Resuming pipeline for: '[question]'. Last completed: Step [N]. Continuing from Step [N+1]."

## Display Format

```
Resuming pipeline: "Are banking stocks undervalued?"
Complexity: L4 | Started: 2026-02-21 14:35

Completed steps:
  [1/17] Understanding your question...      DONE
  [2/17] Generating hypotheses...             DONE
  [3/17] Finding relevant data...             DONE
  [4/17] Verifying data integrity...          DONE
  [5/17] Analyzing patterns...                DONE

Resuming from:
  [6/17] Analyzing trends...                  IN PROGRESS...
```

## Error Handling

| Scenario                       | Action                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| No pipeline state              | "No pipeline in progress. Use /run-pipeline."                                 |
| Stale state (>24h)             | Warn: "Pipeline started >24h ago. Data may be stale. Continue? (yes/restart)" |
| Missing intermediate artifacts | Re-execute from earliest missing artifact                                     |
| Dataset changed since start    | Error: "Dataset changed. Restart pipeline with /run-pipeline."                |
| Step number out of range       | Error: "Step [N] not valid. Pipeline has [M] steps."                          |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
