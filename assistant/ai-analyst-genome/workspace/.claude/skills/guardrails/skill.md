# Guardrails Skill

# Check Trade-Offs and Guardrail Metrics

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Auto-applied during all analyses
- After descriptive-analytics, overtime-trend, or cohort-analysis complete
- Before validation agent runs

## Command

`/guardrails` (manual check) or auto-invoked

## Purpose

Prevent one-sided analysis by ensuring that when a positive metric is reported, its natural trade-off metric is also examined. This catches the "cherry-picking" problem where only favorable data is highlighted.

## Trade-Off Pairs

### Financial Metric Trade-Offs

| Positive Metric       | Guardrail Metric      | Check                                  |
| --------------------- | --------------------- | -------------------------------------- |
| High revenue growth   | Profit margin         | Growing revenue but declining margins? |
| Low P/E (cheap)       | Earnings quality      | Low P/E due to one-time gains?         |
| High ROE              | Leverage (D/E)        | High ROE from excessive debt?          |
| High dividend yield   | Payout ratio          | Unsustainable >100% payout?            |
| Strong price momentum | Volume confirmation   | Price up on declining volume?          |
| Low NPL ratio (banks) | Provisioning coverage | Low NPL because under-provisioning?    |

### Vietnamese Market-Specific Trade-Offs

| Finding                 | Guardrail                  | Check                                            |
| ----------------------- | -------------------------- | ------------------------------------------------ |
| "Foreign buying"        | FOL utilization            | Already near 49% limit?                          |
| "Volume surge"          | Lot size context           | Check if due to block trade, not retail interest |
| "Price at limit"        | Consecutive limit days     | Trapped buyers/sellers?                          |
| "SOE premium"           | Government divestment risk | State selling plans announced?                   |
| "Sector outperformance" | Concentration risk         | One stock driving the whole sector?              |

## Protocol

### Step 1: Identify Positive Claims

Scan analysis outputs for positive assertions:

- "outperformed", "strong", "growing", "high", "improved"
- "undervalued", "cheap", "attractive", "opportunity"

### Step 2: Look Up Trade-Off Metric

For each positive claim, identify the natural guardrail:

```
Claim: "TCB has high ROE of 22%"
Guardrail: Check D/E ratio
Finding: D/E = 8.5x (typical for banks, but high vs non-banks)
Trade-off note: "High ROE partly driven by leverage (D/E 8.5x, sector avg 7.2x)"
```

### Step 3: Flag Trade-Off Violations

| Scenario                               | Flag   | Action                       |
| -------------------------------------- | ------ | ---------------------------- |
| Positive + guardrail also positive     | GREEN  | Strong finding               |
| Positive + guardrail neutral           | GREEN  | Finding holds                |
| Positive + guardrail negative          | YELLOW | Add trade-off note to report |
| Positive + guardrail strongly negative | RED    | Challenge the positive claim |

### Step 4: Report

Add guardrail check results to analysis output:

```yaml
guardrail_checks:
  - claim: 'TCB has high ROE (22%)'
    guardrail: 'leverage_ratio'
    guardrail_value: 8.5
    sector_avg: 7.2
    status: 'YELLOW'
    trade_off_note: 'ROE partially driven by above-average leverage'

  - claim: 'VNM revenue grew 15%'
    guardrail: 'profit_margin'
    guardrail_value: 18.2
    prior_period: 20.1
    status: 'YELLOW'
    trade_off_note: 'Revenue growth accompanied by 190bp margin compression'
```

## Common Guardrail Patterns in Vietnamese Market

1. **Banking ROE vs NPL provisioning** - High ROE may mask under-provisioning
2. **Revenue growth vs forex effects** - Export companies may show FX gains not operational growth
3. **Market cap growth vs dilution** - New share issuance inflates market cap without creating value
4. **Price momentum vs liquidity** - Low-float stocks can show misleading momentum
5. **Dividend yield vs sustainability** - One-time special dividends distort yield

---

**Powered by AI Analyst Lab | aianalystlab.ai**
