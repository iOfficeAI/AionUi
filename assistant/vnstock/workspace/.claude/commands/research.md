---
name: research
description: Scenario-aware entry point for Vietnamese stock market research. Routes to the right analysis pipeline automatically.
---

# /research Command

Intelligent entry point that classifies your research intent and routes to the appropriate analysis pipeline.

## Usage

```
/research VCB
/research macro first then find tech stocks
/research should I buy ACB
/research compare VCB vs ACB
/research Buffett view on VNM
```

## Scenario Classification

The command analyzes your query and routes to one of 5 scenarios:

### 1. Deep Dive (`/analyze` pipeline)

**Triggers:** Single stock with full analysis request

- "VCB", "analyze ACB", "full report on VNM"

**Output:** Complete analysis with all 4 investor personas + fundamental/technical + macro context

### 2. Macro First (`/macro` → screen → ideas)

**Triggers:** Macro-driven stock search

- "macro first then find tech stocks"
- "which Vietnamese stocks fit current regime"

**Output:** Macro report + sector screen + top 3 stock trade ideas

### 3. Trade Idea (`/trading-ideas` pipeline)

**Triggers:** Buy/sell decision request

- "should I buy TCB"
- "trade idea for HPG"

**Output:** Institutional research with BUY/HOLD/SELL recommendation

### 4. Compare (`/compare` pipeline)

**Triggers:** Side-by-side comparison

- "VCB vs ACB"
- "compare MBB or TCB"

**Output:** Parallel fundamentals + valuation + technicals

### 5. Persona View (single persona analysis)

**Triggers:** Specific investor perspective

- "Buffett view on VNM"
- "what would Graham think of HPG"

**Output:** Single-persona research note

## Vietnamese Market Context

The command understands Vietnamese stocks:

- **Banking**: VCB, ACB, TCB, MBB, VPB, CTG, BID
- **Consumer**: VNM, SAB, MSN, MWG
- **Industrial**: HPG, GAS, PLX
- **Real Estate**: VHM, VRE, NVL
- **Tech**: FPT

## Data Sources

- **vnstock**: Vietnamese market data (HOSE, HNX, UPCOM)
- **Financial Datasets API**: US stocks (if applicable)

## Examples

```bash
# Deep dive on Vietcombank
/research VCB

# Compare top banks
/research compare VCB ACB TCB

# Trading idea for Vinamilk
/research should I buy VNM

# Macro-driven search
/research macro then find best banking stocks

# Buffett perspective
/research Buffett view on HPG
```

## Implementation

1. **Parse query** - Extract intent, symbols, personas
2. **Classify scenario** - Match to one of 5 patterns
3. **Route to pipeline** - Execute appropriate command
4. **Generate report** - Save to analyses/ directory

## Output Structure

All research outputs saved to:

```
analyses/{TICKER}_{command}_{YYYY-MM-DD}/
├── report.md
├── charts/
└── data/
```
