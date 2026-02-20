# Question Router Skill

## PURPOSE

Classify user questions into complexity levels (L0-L5) and route them to the appropriate agent pipeline. This skill is invoked automatically on every user query before any analysis begins.

## TRIGGER

- Auto-applied on **every user query**
- First skill to run in the pipeline

## INSTRUCTIONS

### Classification Heuristics

Analyze the user's question and assign a complexity level:

**L0 — Meta (No Data Needed)**

- Questions about the system: "What can you do?", "How does this work?"
- Commands: /help, /health, /glossary
- Route: Respond directly

**L1 — Simple Lookup**

- Single symbol + single metric
- Keywords: "what's", "show me", "price of", "current"
- Heuristics: `num_tickers == 1`, `num_criteria <= 1`, no comparison words
- Route: question-framing -> data-explorer (real-time)
- Time: <10s

**L2 — Comparison**

- 2+ symbols OR 2+ metrics on same symbol
- Keywords: "compare", "vs", "versus", "which is better", "difference between"
- Heuristics: `num_tickers >= 2` OR comparison keywords present
- Route: question-framing -> data-explorer -> source-tieout -> descriptive-analytics -> validation
- Time: 10-30s

**L3 — Investigation**

- Multi-criteria filter + analysis
- Keywords: "which stocks", "find stocks where", "filter", "screen"
- Heuristics: `num_criteria >= 2`, filter expressions present
- Route: Full analysis pipeline (Steps 1-7)
- Time: 30-90s

**L4 — Deep Dive**

- Strategic analysis requiring multiple dimensions
- Keywords: "why", "investigate", "deep dive", "analyze trends"
- Heuristics: requires time-series OR root-cause analysis
- Route: Full pipeline (all 17 agents)
- Time: 1-3 min

**L5 — Strategic / Optimization**

- Portfolio construction, backtesting, optimization
- Keywords: "build portfolio", "optimize", "backtest", "strategy"
- Heuristics: `has_optimization == true`
- Route: Full pipeline + experiment-designer
- Time: 3-10 min

### Complexity Score Calculation

```
complexity_score =
  (num_tickers > 1 ? 1 : 0) +
  (num_criteria) +
  (has_comparison ? 1 : 0) +
  (has_time_series ? 2 : 0) +
  (has_optimization ? 3 : 0) +
  (has_root_cause ? 2 : 0)

L1: score 0-1
L2: score 2
L3: score 3-4
L4: score 5-7
L5: score 8+
```

### Output

After classification, write the routing decision to `_working/question_brief.md` (via question-framing agent).

### User Notification

Display estimated time to user:

- L1: "Looking up... (<10s)"
- L2: "Comparing... (10-30s)"
- L3: "Investigating... (30-90s)"
- L4: "Deep analysis... (1-3 min)"
- L5: "Strategic analysis... (3-10 min)"

---

**Powered by AI Analyst Lab | aianalystlab.ai**
