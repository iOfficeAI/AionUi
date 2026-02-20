# Semantic Validation Skill

# Semantic Cross-Checks for Business Plausibility

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Auto-invoked as part of Layer 3 validation (Logical Coherence)
- After analysis agents produce conclusions
- Before narrative generation

## Command

`/semantic-check` (manual) or auto-invoked

## Purpose

Perform business plausibility checks on analytical conclusions. This goes beyond statistical validation (Layer 2) to verify that findings make sense in the context of Vietnamese business and market dynamics.

## Semantic Checks

### 1. Valuation Plausibility

| Claim                  | Cross-Check              | Flag If                                  |
| ---------------------- | ------------------------ | ---------------------------------------- |
| "Stock is undervalued" | Check free cash flow     | Negative FCF = YELLOW                    |
| "Stock is undervalued" | Check earnings trend     | Declining earnings = YELLOW              |
| "Stock is overvalued"  | Check growth rate        | High growth may justify premium = YELLOW |
| "P/E is low"           | Check for one-time gains | One-time gain inflated EPS = RED         |

### 2. Growth Consistency

| Claim                      | Cross-Check          | Flag If                                                          |
| -------------------------- | -------------------- | ---------------------------------------------------------------- |
| "Revenue growing strongly" | Check profit margins | Margins declining = YELLOW (growth at cost of profitability)     |
| "Earnings improving"       | Check revenue        | Revenue flat but earnings up = YELLOW (cost cutting, not growth) |
| "Strong fundamentals"      | Check debt levels    | D/E ratio increasing = YELLOW                                    |
| "High ROE"                 | Check leverage       | ROE driven by debt, not operations = YELLOW                      |

### 3. Market Context Consistency

| Claim                | Cross-Check            | Flag If                                                           |
| -------------------- | ---------------------- | ----------------------------------------------------------------- |
| "Stock outperformed" | Check vs VN-Index      | VN-Index also up strongly = YELLOW (beta, not alpha)              |
| "Sector rally"       | Check breadth          | Only 1-2 stocks driving sector = YELLOW (concentration)           |
| "Volume surge"       | Check vs market volume | Market-wide volume surge = YELLOW (not stock-specific)            |
| "Foreign buying"     | Check FOL              | Near 49% limit = YELLOW (limited further upside from this source) |

### 4. Contradiction Pairs (Vietnamese Market)

These pairs are logically contradictory for Vietnamese stocks:

| Pair                                       | Contradiction                                 | Resolution              |
| ------------------------------------------ | --------------------------------------------- | ----------------------- |
| "Undervalued" + "negative cash flow"       | Value traps have low P/E but burn cash        | RED flag, add nuance    |
| "Strong growth" + "declining margins"      | Growth without profitability is unsustainable | YELLOW, note trade-off  |
| "High quality" + "high NPL" (banks)        | NPL > 3% contradicts quality claim            | RED for banks           |
| "Safe investment" + "low liquidity"        | Illiquid stocks have execution risk           | YELLOW, note risk       |
| "Outperformed" + "higher beta"             | May be market movement, not alpha             | YELLOW, adjust for risk |
| "Improving trend" + "latest quarter worse" | Contradicts recency                           | RED, clarify timeframe  |

### 5. Vietnamese-Specific Sanity

| Scenario              | Plausibility Check                                |
| --------------------- | ------------------------------------------------- |
| Banking ROE > 25%     | Unusual for VN banks, verify (possible error)     |
| P/E > 50x             | Verify not loss-making with small positive EPS    |
| Dividend yield > 10%  | Check if special dividend (one-time)              |
| Volume > 50M shares   | Verify not block trade or error                   |
| Daily return > 7%     | Should hit price limit on HOSE/HNX (verify UPCOM) |
| Market cap < 100B VND | May be delisted or inactive                       |

## Integration

Semantic validation results feed directly into Layer 3 scoring:

```yaml
semantic_validation:
  checks_run: 8
  flags:
    green: 6
    yellow: 2
    red: 0
  issues:
    - type: 'growth_consistency'
      claim: 'VNM showing strong growth'
      cross_check: 'Profit margin declining (-190bp)'
      flag: 'YELLOW'
      recommendation: 'Note that revenue growth accompanied by margin compression'

    - type: 'market_context'
      claim: 'Banking sector outperformed'
      cross_check: 'VN-Index also rose 12%'
      flag: 'YELLOW'
      recommendation: 'Clarify whether banking alpha is above market beta'
```

## Rules

1. **Check every positive claim** - Every "good" finding needs a sanity check
2. **Vietnamese context** - Apply local market ranges and conventions
3. **Flag, don't block** - YELLOW flags add nuance, only RED flags block
4. **Log everything** - All checks logged regardless of outcome
5. **No subjective judgment** - Rule-based checks only (matching claim patterns to data)

---

**Powered by AI Analyst Lab | aianalystlab.ai**
