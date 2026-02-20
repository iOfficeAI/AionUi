# Analytical Frameworks Reference

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

---

## 1. Question Ladder Framework

The Question Ladder decomposes every user query into four components before analysis begins. This ensures analytical clarity and prevents scope creep.

### Components

| #   | Component              | Description                                   | Example                                      |
| --- | ---------------------- | --------------------------------------------- | -------------------------------------------- |
| 1   | **Goal**               | What the user ultimately wants to achieve     | "Identify undervalued banking stocks"        |
| 2   | **Decision**           | What action will this analysis inform         | "Decide whether to buy VCB or TCB"           |
| 3   | **Metrics**            | What specific numbers answer the question     | P/E ratio, ROE, price trend, dividend yield  |
| 4   | **Initial Hypotheses** | Testable predictions to guide data collection | "VCB trades at premium due to state backing" |

### Application Rules

- **Every L1+ query** must have at least Goal + Metrics
- **L2+ queries** must have all four components
- **L3+ queries** may generate multiple hypothesis branches
- If user provides only a vague question, infer the Decision from context
- Default assumption: user is evaluating an investment decision

### Example Decomposition

**User Query:** "Compare VCB and TCB"

| Component  | Value                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Goal       | Understand relative value of two banking stocks                          |
| Decision   | Which bank stock offers better risk-adjusted return                      |
| Metrics    | P/E, P/B, ROE, ROA, dividend yield, price trend (1Y)                     |
| Hypotheses | H1: VCB premium is justified by lower risk; H2: TCB offers better growth |

---

## 2. Complexity Classification (L0-L5)

Every query is classified into one of six levels. This determines which agents are activated.

| Level | Name          | Description                          | Agents                                             | Time    |
| ----- | ------------- | ------------------------------------ | -------------------------------------------------- | ------- |
| L0    | Meta          | About the system itself              | question-framing only                              | <5s     |
| L1    | Simple Lookup | Single data point retrieval          | question-framing, data-explorer (real-time)        | <10s    |
| L2    | Comparison    | Two or more items compared           | + source-tieout, descriptive-analytics, validation | 10-30s  |
| L3    | Investigation | Multi-factor analysis with filtering | + hypothesis, overtime-trend, root-cause           | 30-90s  |
| L4    | Deep Dive     | Full analytical pipeline             | All 17 pipeline agents                             | 1-3min  |
| L5    | Strategic     | Optimization, portfolio construction | Full pipeline + experiment-designer                | 3-10min |

### Classification Heuristics

```
complexity_score = (
    num_tickers * 1
  + num_criteria * 2
  + has_time_comparison * 3
  + has_optimization * 5
  + has_causal_question * 4
)

L0: meta question (no data needed)
L1: score <= 2 (single ticker, single metric)
L2: score 3-5 (2 tickers or 2 metrics)
L3: score 6-10 (multiple criteria, filtering)
L4: score 11-15 (complex multi-factor)
L5: score > 15 (optimization, strategy)
```

---

## 3. Hypothesis Categories

For L3+ queries, hypotheses are generated in four categories adapted for financial markets.

| Category                 | Description                                  | Vietnamese Market Example                              |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------ |
| **Market Dynamics**      | Supply/demand, sector rotation, macro trends | "Banking sector rally driven by credit growth policy"  |
| **Fundamental Factors**  | Company financials, valuation shifts         | "VCB's P/E expansion due to improving ROE trend"       |
| **Technical/Structural** | Data artifacts, market microstructure        | "Low volume during Tet holiday distorts price signals" |
| **External Events**      | Regulatory, geopolitical, global markets     | "Foreign ownership limit removal drives FDI inflows"   |

### Hypothesis Quality Criteria

- **Testable:** Can be confirmed/rejected with available data
- **Specific:** References concrete metrics and thresholds
- **Time-bounded:** Specifies the relevant time period
- **Falsifiable:** Clear criteria for rejection

---

## 4. Four-Layer Validation System

Every analysis output is validated across four layers. Each layer has specific checks and contributes to the overall confidence score.

### Layer Weights

| Layer | Name                  | Weight | Wave   | Focus                                                   |
| ----- | --------------------- | ------ | ------ | ------------------------------------------------------- |
| L1    | Data Quality          | 25%    | Wave 1 | Nulls, duplicates, ranges, staleness                    |
| L2    | Statistical Rigor     | 40%    | Wave 2 | Correct test selection, sample size, effect sizes       |
| L3    | Logical Coherence     | 20%    | Wave 2 | Simpson's paradox, narrative consistency, causal claims |
| L4    | Presentation Accuracy | 15%    | Wave 3 | Chart accuracy, number formatting, label correctness    |

### Confidence Formula

```
confidence = 0.25 * L1_score + 0.40 * L2_score + 0.20 * L3_score + 0.15 * L4_score
```

### Grade Scale

| Grade | Score Range | Meaning                            |
| ----- | ----------- | ---------------------------------- |
| A     | 90-100      | High confidence, all layers pass   |
| B     | 80-89       | Good confidence, minor issues      |
| C     | 70-79       | Acceptable, some concerns noted    |
| D     | 60-69       | Low confidence, significant issues |
| F     | 0-59        | Failed validation, do not present  |

### Simplified Scoring (L1/L2 queries)

For simple lookups and comparisons (L1-L2), only Layer 1 applies:

- Confidence = 100% \* L1_score
- Layers 2-4 default to score=80 (placeholder until Wave 2/3)

### Review Loop Outcomes

| Outcome              | Threshold   | Action                                |
| -------------------- | ----------- | ------------------------------------- |
| APPROVE              | Score >= 80 | Proceed to next pipeline step         |
| APPROVE_WITH_CHANGES | Score 70-79 | Apply suggested fixes, then proceed   |
| REJECT               | Score < 70  | Return to previous step with feedback |

---

## 5. Statistical Ceiling

The following statistical methods are the MAXIMUM allowed. No regression, ML, or forecasting.

### Allowed Methods

| Method                   | Use Case                                         | Implementation                 |
| ------------------------ | ------------------------------------------------ | ------------------------------ |
| **t-test** (two-sample)  | Compare means of two groups                      | `scipy.stats.ttest_ind`        |
| **Chi-square test**      | Test independence of categorical variables       | `scipy.stats.chi2_contingency` |
| **Confidence intervals** | Quantify uncertainty of estimates                | t-distribution based           |
| **Cohen's d**            | Measure effect size for mean comparisons         | Pooled standard deviation      |
| **Cramer's V**           | Measure effect size for categorical associations | From chi-square statistic      |

### Explicitly Forbidden

- Linear/logistic regression
- Machine learning models
- Time-series forecasting (ARIMA, Prophet, etc.)
- Neural networks
- Clustering algorithms
- Factor models

### Why the Ceiling?

Vietnamese stock market data has:

- Short reliable history (2012+ for financials)
- Small sample sizes (30-400 stocks per exchange)
- Non-normal distributions (price limits create truncation)
- Survivorship bias (delisted stocks missing)

These limitations make advanced statistical methods unreliable and potentially misleading.

---

## 6. CTR Narrative Structure

For L4+ queries, the story is structured using the Context-Tension-Resolution pattern.

| Section        | Purpose                           | Example                                                   |
| -------------- | --------------------------------- | --------------------------------------------------------- |
| **Context**    | Set the scene with data           | "Vietnamese banking sector P/E averaged 12x in 2025"      |
| **Tension**    | Identify the surprise or conflict | "But VCB trades at 18x while TCB trades at 8x"            |
| **Resolution** | Explain and recommend             | "VCB's premium reflects lower NPL risk and state backing" |

### Narrative Rules

1. Lead with the most important finding
2. Use numbers to support claims (never claims without data)
3. Acknowledge limitations and data quality
4. End with actionable recommendations
5. Include confidence score on all outputs

---

## 7. Vietnamese Market Defaults

When user query lacks specifics, apply these defaults:

| Parameter           | Default                         | Rationale                       |
| ------------------- | ------------------------------- | ------------------------------- |
| Exchange            | HOSE                            | Largest, most liquid exchange   |
| Benchmark           | VN-Index                        | Primary market benchmark        |
| Currency            | VND                             | Vietnamese Dong                 |
| Timezone            | ICT (UTC+7)                     | Ho Chi Minh City time           |
| Price limits        | +/-7%                           | HOSE and HNX daily limit        |
| Financial lag       | 30-45 days                      | Time from quarter-end to filing |
| Data source         | KBS                             | Primary vnstock source          |
| Significant figures | 0 dp for price, 1 dp for ratios | Vietnamese convention           |

---

**Last Updated:** 2026-02-21
**Maintained By:** Knowledge Bootstrap Skill
