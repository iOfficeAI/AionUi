# Tracking Gaps Skill

# Identify Missing Data for Hypothesis Testing

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Auto-invoked after hypothesis agent generates hypotheses (L3-L5)
- Manual via `/gaps` command
- Before analysis agents begin work

## Command

`/gaps` - Show data gaps for current analysis
`/gaps [hypothesis_id]` - Show gaps for a specific hypothesis

## Purpose

Before testing a hypothesis, verify that all required data is available. If data is missing or insufficient, flag the gap and suggest alternatives.

## Gap Detection Protocol

### Step 1: Extract Data Requirements

Read `_working/hypothesis_doc.md` and list all data requirements per hypothesis.

### Step 2: Check Availability

For each data requirement:

```
Required: VCB quarterly earnings (Q1-2024 to Q4-2025, 8 periods)
Available: VCB quarterly earnings (Q1-2024 to Q3-2025, 7 periods)
Gap: Q4-2025 not yet reported (30-45 day Vietnamese filing lag)
Impact: Cannot test most recent quarter, may affect conclusion timeliness
```

### Step 3: Classify Gaps

| Gap Type                                               | Severity | Action                                     |
| ------------------------------------------------------ | -------- | ------------------------------------------ |
| Temporal lag (recent quarter missing)                  | YELLOW   | Proceed with available data, note lag      |
| Historical limit (data starts 2018, need 2015)         | YELLOW   | Adjust hypothesis timeframe                |
| Metric not available (e.g., NPL ratio for non-banks)   | RED      | Cannot test hypothesis, skip or substitute |
| Source not accessible (API error)                      | YELLOW   | Use cache or alternative source            |
| Granularity mismatch (need daily, only have quarterly) | YELLOW   | Adjust analysis method                     |
| Complete absence (no data for symbol)                  | RED      | Drop symbol from analysis                  |

### Step 4: Suggest Alternatives

For each gap, suggest workarounds:

```yaml
gap:
  hypothesis: 'H4: Q4 2025 P/E compression driven by FTSE review'
  required: 'Monthly P/E ratios for Q4 2025'
  available: 'Only up to Q3 2025 financials'
  severity: 'YELLOW'
  alternatives:
    - 'Use price-based P/E (current price / trailing 12M EPS)'
    - 'Estimate Q4 EPS from analyst consensus (if available)'
    - 'Compare Q3 2025 P/E with current P/E (using trailing earnings)'
  recommendation: 'Use trailing 12M EPS to approximate current P/E'
```

## Output Format

```yaml
---
gaps_report_id: 'gaps_20260221'
question_id: 'q_20260221_143500'
hypotheses_checked: 6
data_gaps_found: 3
critical_gaps: 1

gaps:
  - hypothesis: 'H1'
    required_data: 'NPL ratios for VCB, BID, CTG (8 quarters)'
    status: 'available'
    coverage: '100%'

  - hypothesis: 'H4'
    required_data: 'Q4 2025 financials'
    status: 'gap'
    severity: 'YELLOW'
    gap_detail: 'Q4 2025 not yet filed (Vietnamese 30-45 day reporting lag)'
    alternative: 'Use trailing 12M EPS with current price'

  - hypothesis: 'H5'
    required_data: 'Intraday trading data (order book)'
    status: 'gap'
    severity: 'RED'
    gap_detail: 'vnstock does not provide intraday order book data'
    alternative: 'Use daily volume and price range as proxy'
    impact: 'Hypothesis cannot be directly tested, suggest dropping or reformulating'

summary:
  testable_hypotheses: 5
  untestable_hypotheses: 1
  data_coverage: 83%
  recommendation: 'Proceed with 5/6 hypotheses. H5 requires data not available in vnstock.'
---
```

## User-Facing Output

When gaps are found:

```
Data Gaps Report
================

6 hypotheses checked, 5 testable

Gaps found:
  H4: Q4 2025 financials not yet filed (30-45 day reporting lag)
      -> Using trailing 12M EPS as alternative

  H5: Intraday order book data not available in vnstock
      -> Hypothesis dropped (cannot test with available data)

Proceeding with 5 testable hypotheses.
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
