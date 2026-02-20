# Wave 3 Integration Test: End-to-End Pipeline

# Question to Deck (Full Pipeline Walkthrough)

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Test Query

> "Compare VCB and TCB - which offers better value for a 12-month hold?"

## Complexity Classification

- **Expected Level:** L4 (Deep Dive)
- **Expected Agents:** Full 17-agent pipeline
- **Expected Time:** 1-3 minutes

## Pipeline Walkthrough

### Stage 1: Question Framing (Step 1)

| Check              | Expected                     |
| ------------------ | ---------------------------- |
| Complexity         | L4                           |
| Question type      | Comparison + valuation       |
| Symbols identified | VCB, TCB                     |
| Time horizon       | 12 months                    |
| Output             | `_working/question_brief.md` |

### Stage 2: Hypothesis (Step 3)

| Check               | Expected                                      |
| ------------------- | --------------------------------------------- |
| Categories covered  | At least Market Dynamics, Fundamental Factors |
| Testable hypotheses | >= 4                                          |
| Priority ranking    | Present                                       |
| Output              | `_working/hypothesis_doc.md`                  |

### Stage 3: Data Collection (Steps 4-4.5)

| Check           | Expected                                                  |
| --------------- | --------------------------------------------------------- |
| Symbols fetched | VCB, TCB                                                  |
| Data types      | OHLCV, financials, ratios                                 |
| Source verified | Tieout Layer 1 score >= 70                                |
| Outputs         | `_working/data_inventory.md`, `_working/tieout_report.md` |

### Stage 4: Analysis (Steps 5-6)

| Check                 | Expected                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| Descriptive analytics | P/E, P/B, ROE, ROA comparison                                                          |
| Trend analysis        | 12-month price trend for both stocks                                                   |
| Root cause            | Key drivers of valuation difference                                                    |
| Outputs               | `_working/analysis_report.md`, `_working/trend_report.md`, `_working/investigation.md` |

### Stage 5: Validation (Step 7)

| Check      | Expected                                                           |
| ---------- | ------------------------------------------------------------------ |
| Layer 1    | Data quality >= 80                                                 |
| Layer 2    | Statistical tests appropriate, CIs present                         |
| Layer 3    | No contradictions, correlational language                          |
| Confidence | >= 70 (C or better)                                                |
| Outcome    | APPROVE or APPROVE_WITH_CHANGES                                    |
| Outputs    | `_working/validation_report.md`, `_working/confidence_scores.yaml` |

### Stage 6: Opportunity Sizing (Step 8)

| Check          | Expected                         |
| -------------- | -------------------------------- |
| Scenarios      | Base, best, worst for each stock |
| Sensitivity    | Top 3 assumptions identified     |
| VND formatting | All amounts in VND               |
| Output         | `_working/sizing_report.md`      |

### Stage 7: Narrative Design (Step 9-10)

| Check             | Expected                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| CTR structure     | Context (market), Tension (valuation gap), Resolution (recommendation) |
| Chart specs       | At least 2 charts specified                                            |
| So-what per slide | Every content slide has so_what                                        |
| Coherence review  | APPROVE outcome                                                        |
| Outputs           | `_working/storyboard.md`, `_working/coherence_review.md`               |

### Stage 8: Chart Generation (Steps 12-13)

| Check            | Expected                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| Charts generated | >= 2 PNG files                                                                        |
| Brand colors     | Match genome_config.yaml                                                              |
| SWD patterns     | Declutter, focus, annotate applied                                                    |
| Attribution      | "Powered by AI Analyst Lab" watermark                                                 |
| VND formatting   | Prices as whole numbers with commas                                                   |
| Design review    | APPROVE outcome                                                                       |
| Outputs          | `_working/charts/*.png`, `_working/charts/manifest.yaml`, `_working/design_review.md` |

### Stage 9: Storytelling (Step 15)

| Check               | Expected                                               |
| ------------------- | ------------------------------------------------------ |
| Executive summary   | 3-5 sentences                                          |
| Slide body text     | Max 50 words per slide                                 |
| Speaker notes       | 30-60 words per slide                                  |
| Audience adaptation | Matches user profile role                              |
| No causal language  | "associated with" not "caused"                         |
| Outputs             | `_working/narrative.md`, `outputs/analysis_summary.md` |

### Stage 10: Deck Assembly (Step 16)

| Check            | Expected                                       |
| ---------------- | ---------------------------------------------- |
| Marp frontmatter | `marp: true`, theme: analytics                 |
| Footer           | "Powered by AI Analyst Lab \| aianalystlab.ai" |
| Slides           | 8-12 (appropriate for L4)                      |
| Charts embedded  | All chart PNGs referenced                      |
| Title slide      | Confidence badge present                       |
| Closing slide    | Attribution present                            |
| Output           | `outputs/deck.marp.md`                         |

### Stage 11: Close the Loop (Step 18)

| Check           | Expected                     |
| --------------- | ---------------------------- |
| Action items    | >= 2                         |
| Owners assigned | Based on user role           |
| Metrics defined | Measurable outcomes          |
| Deadlines set   | Within time horizon          |
| Output          | `_working/close_the_loop.md` |

## Pass Criteria Summary

| #   | Stage            | Critical? | Pass Condition                            |
| --- | ---------------- | --------- | ----------------------------------------- |
| 1   | Question framing | Yes       | L4 classification, symbols identified     |
| 2   | Data collection  | Yes       | Both VCB and TCB data loaded              |
| 3   | Analysis         | Yes       | Comparison metrics computed               |
| 4   | Validation       | Yes       | Confidence >= 70                          |
| 5   | Storyboard       | Yes       | CTR structure with chart specs            |
| 6   | Charts           | Yes       | >= 2 charts with brand tokens + watermark |
| 7   | Design review    | No        | APPROVE outcome (CHANGES acceptable)      |
| 8   | Narrative        | No        | Executive summary present                 |
| 9   | Deck             | Yes       | Valid Marp with correct footer            |
| 10  | Follow-up        | No        | Action items with owners                  |

**PASS:** 8 of 10 checks pass (all 7 critical checks must pass)
**FAIL:** Any critical check fails

---

**Powered by AI Analyst Lab | aianalystlab.ai**
