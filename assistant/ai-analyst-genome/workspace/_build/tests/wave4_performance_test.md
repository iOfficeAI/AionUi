# Performance Test -- Wave 4

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

**Date:** 2026-02-21
**Purpose:** Verify L5 strategic query completes in <10 minutes

---

## Test Specification

### L5 Strategic Query: Portfolio Optimization

**Query:** "Build an optimal VN30 portfolio for 2026, backtest against buy-and-hold, and present findings in a deck"

**Expected Pipeline:**

| Phase            | Agents                                                 | Max Time           |
| ---------------- | ------------------------------------------------------ | ------------------ |
| 1. Framing       | question-framing                                       | 5s                 |
| 2. Hypothesis    | hypothesis                                             | 10s                |
| 3. Data          | data-explorer, source-tieout                           | 30s                |
| 4. Analysis      | descriptive-analytics, overtime-trend, cohort-analysis | 90s                |
| 5. Investigation | root-cause-investigator                                | 30s                |
| 6. Validation    | validation (4 layers)                                  | 20s                |
| 7. Sizing        | opportunity-sizer                                      | 20s                |
| 8. Narrative     | story-architect, narrative-coherence-reviewer          | 40s                |
| 9. Charts        | chart-maker, visual-design-critic                      | 30s                |
| 10. Output       | storytelling, deck-creator                             | 30s                |
| 11. Follow-up    | close-the-loop                                         | 10s                |
| 12. Backtest     | experiment-designer                                    | 60s                |
| **Total**        | **19 agents**                                          | **~365s (~6 min)** |

**Pass Criteria:**

- [ ] Total pipeline time < 10 minutes (600 seconds)
- [ ] All 19 agents complete without error
- [ ] Confidence score >= 70 (C grade)
- [ ] Experiment brief generated with power analysis
- [ ] Portfolio weights suggested with risk metrics
- [ ] Marp deck assembled with charts
- [ ] All outputs in VND format with ICT timestamps
- [ ] AI Analyst Lab attribution on all outputs

### Performance Budget

| Component        | Budget             | Notes                                      |
| ---------------- | ------------------ | ------------------------------------------ |
| Data fetching    | 60s                | VN30 = 30 symbols, cached after first call |
| Analysis         | 120s               | Parallel where possible (Step 5 agents)    |
| Validation       | 60s                | 3 checkpoint passes                        |
| Presentation     | 90s                | Charts + narrative + deck                  |
| Backtest design  | 60s                | experiment-designer (standalone)           |
| Overhead         | 60s                | Buffer for retries, review loops           |
| **Total budget** | **450s (7.5 min)** | **Within 10-min limit**                    |

### Failure Scenarios

| Scenario            | Expected Behavior                        | Max Recovery Time |
| ------------------- | ---------------------------------------- | ----------------- |
| API timeout (KBS)   | Fallback to cache with staleness warning | 15s               |
| Validation CHANGES  | Max 2 revision cycles                    | 60s additional    |
| Chart-data mismatch | Regenerate chart, cap confidence         | 30s additional    |
| Insufficient data   | Skip backtest, report limitation         | 0s (skip)         |

---

## Benchmark Queries (Additional)

| Query                                                       | Expected Time | Level |
| ----------------------------------------------------------- | ------------- | ----- |
| "What's VNM's price?"                                       | <10s          | L1    |
| "Compare top 5 banks by ROE"                                | 10-30s        | L2    |
| "Find value stocks in VN30"                                 | 30-90s        | L3    |
| "Sector rotation analysis: banking vs tech 2024-2025"       | 1-3 min       | L4    |
| "Design a momentum + value strategy for HOSE with backtest" | 3-10 min      | L5    |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
