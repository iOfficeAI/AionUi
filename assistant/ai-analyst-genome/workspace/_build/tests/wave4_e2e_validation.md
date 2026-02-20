# End-to-End Validation Test -- Wave 4

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

**Date:** 2026-02-21
**Purpose:** Verify all query levels (L0-L5) route correctly through the agent pipeline

---

## Test Cases

### Test 1: L0 Meta Query

**Input:** "What can you do?"
**Expected routing:** question-framing only
**Expected output:** Capabilities overview with slash commands
**Expected time:** <5s
**Pass criteria:**

- [ ] Question classified as L0
- [ ] No data fetched
- [ ] No analysis agents invoked
- [ ] Response includes slash command reference

### Test 2: L1 Simple Lookup

**Input:** "What's VNM's current price?"
**Expected routing:** question-framing -> data-explorer (real-time mode)
**Expected output:** Real-time price in VND with timestamp
**Expected time:** <10s
**Pass criteria:**

- [ ] Price returned in VND format (comma separator)
- [ ] Timestamp within 5 minutes (ICT)
- [ ] No full pipeline invoked
- [ ] Source identified (KBS)

### Test 3: L2 Comparison

**Input:** "Compare VCB and TCB P/E ratios"
**Expected routing:** question-framing -> data-explorer -> source-tieout -> descriptive-analytics -> validation
**Expected output:** Comparison table with confidence score
**Expected time:** 10-30s
**Pass criteria:**

- [ ] Both symbols' P/E values displayed
- [ ] Difference quantified
- [ ] Sector average included for context
- [ ] Confidence score displayed (A-F grade)
- [ ] Bilingual labels: "P/E (He so gia tren thu nhap)"

### Test 4: L3 Investigation

**Input:** "Which banking stocks have ROE > 20%?"
**Expected routing:** question-framing -> hypothesis -> data-explorer -> source-tieout -> descriptive-analytics -> overtime-trend -> validation
**Expected output:** Filtered list with statistics
**Expected time:** 30-90s
**Pass criteria:**

- [ ] Hypothesis generated before analysis
- [ ] Multiple banks screened
- [ ] ROE values with 95% CIs
- [ ] Simpson's Paradox check logged
- [ ] Confidence >= 70 (C)

### Test 5: L4 Deep Dive

**Input:** "Find undervalued stocks with strong fundamentals and momentum"
**Expected routing:** Full 17-agent pipeline
**Expected output:** Analysis report + charts + storyboard
**Expected time:** 1-3 minutes
**Pass criteria:**

- [ ] All 17 pipeline agents invoked
- [ ] 4-layer validation completed
- [ ] Charts generated with SWD patterns
- [ ] Attribution footer present
- [ ] Storyboard uses CTR arc
- [ ] Confidence score displayed

### Test 6: L5 Strategic Query

**Input:** "Build an optimal VN30 portfolio for 2026 with backtesting"
**Expected routing:** Full pipeline + experiment-designer
**Expected output:** Portfolio analysis + experiment brief
**Expected time:** 3-10 minutes
**Pass criteria:**

- [ ] Full pipeline completed
- [ ] Experiment-designer invoked for backtest design
- [ ] Power analysis included
- [ ] Risk controls specified
- [ ] Decision rules pre-specified
- [ ] All outputs in VND format
- [ ] Confidence >= 70 (C)

### Test 7: Slash Command - /explore

**Input:** "/explore VCB"
**Expected output:** Quick stock overview
**Pass criteria:**

- [ ] Price, valuation, fundamentals displayed
- [ ] VND formatting correct
- [ ] Response in <5 seconds

### Test 8: Slash Command - /screen

**Input:** "/screen PE < 15 AND ROE > 20%"
**Expected output:** Filtered stock list
**Pass criteria:**

- [ ] Multiple stocks returned
- [ ] Sorted by default metric
- [ ] Data freshness note included

### Test 9: Slash Command - /backtest

**Input:** '/backtest "Value stocks outperform on HOSE"'
**Expected output:** Experiment brief
**Pass criteria:**

- [ ] Hypothesis formalized (H0/H1)
- [ ] Power analysis completed
- [ ] Decision rules specified
- [ ] Vietnamese market constraints noted

### Test 10: Slash Command - /portfolio

**Input:** "/portfolio VCB TCB FPT VNM HPG"
**Expected output:** Portfolio analysis
**Pass criteria:**

- [ ] Correlation matrix displayed
- [ ] Risk metrics calculated
- [ ] Sector concentration warning if applicable
- [ ] VND formatting throughout

---

## Performance Requirements

| Query Level | Max Time | Agent Count     |
| ----------- | -------- | --------------- |
| L0          | 5s       | 1               |
| L1          | 10s      | 2               |
| L2          | 30s      | 5               |
| L3          | 90s      | 7               |
| L4          | 3 min    | 17              |
| L5          | 10 min   | 17 + standalone |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
