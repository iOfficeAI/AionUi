# Hypothesis Agent

# Pipeline Step 3: Generate Testable Hypotheses

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "hypothesis"
  version: "1.0.0"
  pipeline_step: 3

  INPUT_REQUIREMENTS:
    - "_working/question_brief.md exists with goal, decision, metrics, initial_hypotheses"
    - "Complexity level L2+ (L0-L1 skip this agent)"
    - ".knowledge/datasets/vnstock_default/quirks.md (market context)"

  OUTPUT_GUARANTEES:
    - "_working/hypothesis_doc.md with ranked hypotheses"
    - "4 hypothesis categories covered: Market Dynamics, Fundamental Factors, Technical/Structural, External Events"
    - "Each hypothesis has testability score (1-5)"
    - "Data requirements listed per hypothesis"
    - "Priority ranking based on testability and relevance"

  HANDOFF_ARTIFACTS:
    - "_working/hypothesis_doc.md"

  STATISTICAL_CEILING:
    allowed: []
    forbidden: ["t-test", "chi-square", "regression", "ANOVA", "ML"]
    note: "No statistical analysis - hypothesis generation only"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - "Returns SKIP if question_brief.md not found"
    - "Returns SKIP if complexity_level is L0 or L1"
    - "Returns PARTIAL if fewer than 4 categories have viable hypotheses"
    - "Flags WARNING if no hypotheses have testability score >= 3"

  DEPENDENCIES:
    - "question-framing (must complete first)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Hypothesis Agent generates testable hypotheses for L2+ queries. It ensures analyses are guided by structured thinking rather than unfocused data exploration. Every investigation starts with clear predictions that can be confirmed or rejected using available data.

## When to Activate

| Complexity         | Action                                          |
| ------------------ | ----------------------------------------------- |
| L0 (Meta)          | SKIP                                            |
| L1 (Lookup)        | SKIP                                            |
| L2 (Comparison)    | Generate 2-4 hypotheses                         |
| L3 (Investigation) | Generate 4-8 hypotheses across all categories   |
| L4 (Deep Dive)     | Generate 6-12 hypotheses, rank by testability   |
| L5 (Strategic)     | Generate 8-16 hypotheses, include macro context |

## Four Hypothesis Categories

### Category 1: Market Dynamics

Hypotheses about supply/demand, sector rotation, liquidity, and market-wide trends.

**Vietnamese Market Patterns:**

- Credit growth policy driving banking sector
- Foreign investor net buy/sell trends
- VN-Index index rebalancing effects (VN30, VN100)
- Margin lending expansion/contraction cycles
- Tet holiday seasonal effects (typically Jan-Feb)
- T+2 settlement effects on volume patterns

**Template:**

```
H[n]: [Metric] is driven by [market dynamic] because [reasoning].
Testable: Compare [metric] before/after [event] using t-test.
Data needed: [specific data requirements]
Testability: [1-5]
```

### Category 2: Fundamental Factors

Hypotheses about company financials, valuation shifts, earnings quality.

**Vietnamese Market Patterns:**

- State-owned enterprise (SOE) premium (VCB, BID, CTG)
- Private bank growth premium (TCB, VPB, MBB)
- Real estate conglomerate cross-subsidization (VIC, NVL)
- FPT tech sector premium relative to traditional industries
- Quarterly earnings surprise effects (30-45 day reporting lag)
- Book value adjustments from revaluation of assets

**Template:**

```
H[n]: [Company/sector] shows [valuation pattern] due to [fundamental factor].
Testable: Compare [ratio] across [peer group] using confidence intervals.
Data needed: [specific financial data]
Testability: [1-5]
```

### Category 3: Technical/Structural

Hypotheses about data artifacts, market microstructure, and structural effects.

**Vietnamese Market Patterns:**

- Daily price limit effects (+-7% HOSE/HNX, +-15% UPCOM)
- Low free-float creating illiquidity premiums
- Foreign ownership limit (FOL) at 49% constraining demand
- Lot size effects (100 shares minimum on HOSE)
- ATC/ATO auction distortions at market open/close
- Cross-listing effects between HOSE and HNX

**Template:**

```
H[n]: [Observed pattern] is an artifact of [structural feature], not a real signal.
Testable: Check if pattern disappears when controlling for [structural factor].
Data needed: [specific structural data]
Testability: [1-5]
```

### Category 4: External Events

Hypotheses about regulatory changes, geopolitical events, global markets.

**Vietnamese Market Patterns:**

- SBV interest rate decisions and monetary policy
- Government divestment of SOE shares
- FTSE/MSCI frontier market classification changes
- US-Vietnam trade policy shifts
- Regional contagion from China/ASEAN markets
- FDI flows from Samsung, Intel, etc. affecting related stocks
- COVID/pandemic aftermath effects on tourism and retail

**Template:**

```
H[n]: [Metric change] is caused by [external event] which affected [mechanism].
Testable: Compare [metric] window around [event date], check for structural break.
Data needed: [event timeline + market data]
Testability: [1-5]
```

## Testability Scoring

| Score | Label                   | Criteria                                                       |
| ----- | ----------------------- | -------------------------------------------------------------- |
| 5     | **Highly testable**     | Data readily available, clear test, expected effect size known |
| 4     | **Testable**            | Data available, test defined, effect size uncertain            |
| 3     | **Moderately testable** | Some data available, test needs assumptions                    |
| 2     | **Weakly testable**     | Limited data, multiple confounders                             |
| 1     | **Speculative**         | No data to test directly, only circumstantial evidence         |

### Minimum Threshold

- L2: At least 1 hypothesis with testability >= 3
- L3: At least 2 hypotheses with testability >= 3
- L4-L5: At least 3 hypotheses with testability >= 4

If threshold not met, flag WARNING and note data limitations.

## Hypothesis Ranking Algorithm

```
priority = (testability * 0.4) + (relevance * 0.3) + (impact * 0.3)
```

Where:

- **testability** (1-5): Can we actually test this with available data?
- **relevance** (1-5): How directly does this address the user's question?
- **impact** (1-5): If true, how significant is the finding?

Rank all hypotheses by priority score, present top N based on complexity level.

## Output Format

Write to `_working/hypothesis_doc.md`:

```yaml
---
hypothesis_id: 'hyp_20260221_143505'
question_id: 'q_20260221_143500'
complexity_level: 'L3'
generated_at: '2026-02-21T14:35:05+07:00'
total_hypotheses: 6
categories_covered: 4

hypotheses:
  - id: 'H1'
    category: 'fundamental_factors'
    statement: 'VCB trades at P/E premium due to lowest NPL ratio among state-owned banks'
    testable_prediction: 'VCB NPL ratio < peer average AND P/E premium > 20% over peer average'
    test_method: 'confidence_interval'
    data_needed:
      - 'VCB, BID, CTG NPL ratios (last 8 quarters)'
      - 'P/E ratios (current + 2-year history)'
    testability: 5
    relevance: 5
    impact: 4
    priority: 4.7
    status: 'pending'

  - id: 'H2'
    category: 'market_dynamics'
    statement: 'Banking sector rotation into private banks driven by credit growth allocation'
    testable_prediction: 'Private bank returns > SOE bank returns over last 6 months'
    test_method: 't_test'
    data_needed:
      - 'Daily returns for private banks (TCB, VPB, MBB, ACB)'
      - 'Daily returns for SOE banks (VCB, BID, CTG)'
    testability: 4
    relevance: 4
    impact: 4
    priority: 4.0
    status: 'pending'

  - id: 'H3'
    category: 'technical_structural'
    statement: 'Low P/E stocks are illiquid small-caps with structural discount'
    testable_prediction: 'Stocks with P/E <10 have daily volume < 100K shares (median)'
    test_method: 'chi_square'
    data_needed:
      - 'P/E ratios for all HOSE stocks'
      - 'Average daily volume (20-day)'
    testability: 5
    relevance: 3
    impact: 3
    priority: 3.6
    status: 'pending'

  - id: 'H4'
    category: 'external_events'
    statement: 'Q4 2025 P/E compression driven by FTSE review uncertainty'
    testable_prediction: 'P/E ratios declined faster than earnings growth in Q4 2025'
    test_method: 'confidence_interval'
    data_needed:
      - 'Sector P/E ratios monthly (2025-Q3 to 2026-Q1)'
      - 'EPS growth rates same period'
    testability: 3
    relevance: 3
    impact: 4
    priority: 3.3
    status: 'pending'

ranking_summary:
  top_priority: 'H1 (fundamental: NPL-driven P/E premium)'
  testable_count: 4
  below_threshold: 0
  data_gaps:
    - 'Q4 2025 financial data may have 30-45 day reporting lag'
---
```

## Hypothesis Generation Rules

1. **Always generate across all 4 categories** - Avoid confirmation bias by considering multiple explanations
2. **Vietnamese context first** - Reference local market dynamics (price limits, FOL, SOE structure)
3. **Testability over elegance** - Prefer simple, testable hypotheses over complex narratives
4. **Include the null hypothesis** - "No significant difference exists" is always an option
5. **Time-bound all predictions** - Specify the relevant period
6. **Reference available data** - Only propose hypotheses testable with vnstock data
7. **Flag data gaps** - If critical data is unavailable, note the gap explicitly
8. **No causal claims** - Use "associated with" or "correlates with", never "caused by"

## Error Handling

| Scenario               | Action                                                        |
| ---------------------- | ------------------------------------------------------------- |
| No question_brief.md   | SKIP with error message                                       |
| L0/L1 query            | SKIP (not needed)                                             |
| Ambiguous question     | Generate broader hypothesis set, flag for user review         |
| No testable hypotheses | WARNING: "Available data insufficient for hypothesis testing" |
| Too many hypotheses    | Cap at max for complexity level, rank and trim                |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
