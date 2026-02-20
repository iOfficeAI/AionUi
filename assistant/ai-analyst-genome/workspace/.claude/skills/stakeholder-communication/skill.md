# Stakeholder Communication Skill

# Audience-Adapted Communication for Analysis Outputs

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Adapt analysis communication (language, detail level, emphasis) to the detected user role. This skill ensures that quant researchers get statistical rigor, retail investors get plain language, traders get actionable signals, and portfolio managers get risk-adjusted recommendations.

## When to Use

- **Trigger:** Auto-applied during narrative generation (storytelling agent) and deck assembly (deck-creator agent)
- **Context:** Any time analysis results are being communicated to the user
- **Also invoked by:** story-architect for audience adaptation in storyboard

## Audience Profiles

### Profile 1: Quant Researcher

**Detected by:** User mentions factor analysis, backtesting, alpha, Sharpe ratio, or statistical tests

| Dimension           | Adaptation                                                     |
| ------------------- | -------------------------------------------------------------- |
| **Language**        | Technical, precise, statistical                                |
| **Detail level**    | High - include all test results, p-values, CIs                 |
| **Chart density**   | High (3-5 charts per analysis)                                 |
| **Emphasis**        | Methodology, edge magnitude, statistical significance          |
| **Metrics shown**   | Cohen's d, p-values, CIs, effect sizes, sample sizes           |
| **Recommendations** | Quantitative signals with parameters                           |
| **Example**         | "Banking ROE > Tech ROE (d=0.82, p<0.01, 95% CI: [2.1, 14.9])" |

### Profile 2: Retail Investor

**Detected by:** Simple questions, no statistical jargon, asks "should I buy?"

| Dimension           | Adaptation                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Language**        | Plain, accessible, no unexplained jargon                                                                         |
| **Detail level**    | Low - key findings and recommendations only                                                                      |
| **Chart density**   | Low (1-2 charts per analysis)                                                                                    |
| **Emphasis**        | Actionability, risk awareness, practical next steps                                                              |
| **Metrics shown**   | Price, P/E, ROE (with plain-language explanations)                                                               |
| **Recommendations** | Clear actions with risk caveats                                                                                  |
| **Example**         | "Banking stocks are significantly cheaper than their historical average, which may present a buying opportunity" |

### Profile 3: Trader

**Detected by:** Mentions entry/exit, technical signals, momentum, support/resistance

| Dimension           | Adaptation                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Language**        | Signal-oriented, concise, market terminology                                                                 |
| **Detail level**    | Medium - signals with confirmation criteria                                                                  |
| **Chart density**   | Medium (2-3 charts, price-focused)                                                                           |
| **Emphasis**        | Entry/exit levels, timing, risk/reward ratio                                                                 |
| **Metrics shown**   | Price levels, volume, momentum indicators                                                                    |
| **Recommendations** | Trade setups with entry, target, stop-loss                                                                   |
| **Example**         | "Banking P/E at 2-year low: mean-reversion signal. Entry below 10.5x, target 12.8x (+22%), stop 9.5x (-10%)" |

### Profile 4: Portfolio Manager

**Detected by:** Mentions allocation, benchmark, tracking error, risk budget

| Dimension           | Adaptation                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| **Language**        | Portfolio-oriented, risk-adjusted, institutional                                                          |
| **Detail level**    | Medium - focus on portfolio impact                                                                        |
| **Chart density**   | Medium (2-3 charts, allocation-focused)                                                                   |
| **Emphasis**        | Risk/reward, allocation impact, benchmark-relative                                                        |
| **Metrics shown**   | Alpha, tracking error, Sharpe, portfolio weight                                                           |
| **Recommendations** | Allocation changes with portfolio impact quantified                                                       |
| **Example**         | "Banking overweight (+5pp) generates 192bps alpha vs VN-Index benchmark, Sharpe 0.62, max drawdown -8.5%" |

## Communication Templates

### Finding Statement

```
Quant:    "{{METRIC}} shows {{DIRECTION}} of {{MAGNITUDE}} [95% CI: {{CI}}], d={{EFFECT_SIZE}} ({{INTERPRETATION}})"
Retail:   "{{METRIC_PLAIN_NAME}} has {{DIRECTION_PLAIN}} by {{MAGNITUDE_SIMPLE}}, meaning {{PLAIN_EXPLANATION}}"
Trader:   "{{METRIC}} {{SIGNAL}}: {{CURRENT_VALUE}} vs {{REFERENCE}} ({{GAP}}), {{CONVICTION}} signal"
PM:       "{{METRIC}} {{DIRECTION}} creates {{ALPHA}}bps alpha opportunity, {{RISK_METRIC}} within budget"
```

### Recommendation Statement

```
Quant:    "Factor tilt toward {{FACTOR}} (z-score={{Z}}, decay={{HALF_LIFE}})"
Retail:   "Consider {{ACTION}} {{SUBJECT}} if comfortable with {{RISK_LEVEL}} risk over {{HORIZON}}"
Trader:   "{{DIRECTION}} {{SUBJECT}}: entry {{ENTRY}}, target {{TARGET}} (+{{UPSIDE}}%), stop {{STOP}} (-{{DOWNSIDE}}%)"
PM:       "Adjust {{SUBJECT}} weight by {{DELTA}}pp, expected tracking error impact: {{TE}}bps"
```

### Caveat Statement

```
Quant:    "Analysis confidence {{GRADE}} ({{SCORE}}). Key limitation: {{LIMITATION}}. Sample n={{N}}."
Retail:   "This analysis has {{GRADE_PLAIN}} confidence. Keep in mind: {{LIMITATION_PLAIN}}"
Trader:   "Confidence: {{GRADE}}. Key risk: {{RISK}}. Invalid if: {{INVALIDATION_CONDITION}}"
PM:       "Confidence {{GRADE}} ({{SCORE}}). Tracking error contribution: {{TE}}bps. Tail risk: {{TAIL}}"
```

## Instructions

1. **Check user profile:** Read `.knowledge/user/profile.yaml` for `role` field
2. **Default to retail** if no profile or role unknown (safest, most accessible)
3. **Adapt all outputs:** Executive summary, slide body text, speaker notes, chart titles
4. **Maintain accuracy:** Simplification must not change the analytical conclusion
5. **Include bilingual terms** where relevant for Vietnamese market context
6. **Never give financial advice:** Use "may consider" not "should buy"

## Vietnamese Market Communication Norms

- **Formal address:** Use respectful tone appropriate for Vietnamese business culture
- **Risk emphasis:** Vietnamese retail investors may need extra risk framing
- **VND context:** Always provide VND amounts, avoid USD-only figures
- **Regulatory awareness:** Note that analysis is informational, not investment advice
- **Seasonal awareness:** Reference Tet, quarterly earnings, FTSE reviews as context

---

**Powered by AI Analyst Lab | aianalystlab.ai**
