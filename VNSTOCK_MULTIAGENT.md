# Vietnamese Market Multi-Agent Research System

**Status**: ✅ Implemented
**Date**: 2026-02-20

## Overview

A multi-agent research system for comprehensive analysis of Vietnamese stocks. The system spawns specialist sub-agents in parallel, each focusing on one analytical perspective, then aggregates results into a unified investment report.

## Architecture

```
User Request → Main Agent (CLAUDE.md)
                    ↓
    ┌───────────────┼───────────────┬───────────────┐
    ↓               ↓               ↓               ↓
Macro Agent   Fundamental   Factor Agent   Technical Agent
                Agent
    ↓               ↓               ↓               ↓
drafts/macro/ drafts/fundamentals/ drafts/factors/ drafts/technicals/
    │               │               │               │
    └───────────────┴───────────────┴───────────────┘
                            ↓
                    Aggregation Scripts
                (extract_metrics.py, generate_report.py)
                            ↓
                    final_report.md
```

## Components

### 1. Skills (How to Do)

**Macro Regime Skill** (`assistant/vnstock/workspace/.claude/skills/macro-regime/`)

- Classify Vietnam's economic regime: EXPANSION | SLOWDOWN | RECESSION | RECOVERY
- Map regime to favored sectors and investment factors
- Fetch data from SBV (State Bank) and GSO (General Statistics Office)

**Factor Analyst Skill** (`assistant/vnstock/workspace/.claude/skills/factor-analyst/`)

- Calculate 5 factors: value, momentum, quality, growth, volatility
- Compute z-scores vs VN30/HOSE universe
- Cross-sectional rankings and composite scores

### 2. Sub-Agents (What to Analyze)

Located in `assistant/vnstock/workspace/.claude/agents/`:

| Agent                  | Focus                                           | Output                            |
| ---------------------- | ----------------------------------------------- | --------------------------------- |
| `macro-agent.md`       | Economic regime, sector implications            | `drafts/macro/insights.md`        |
| `fundamental-agent.md` | Financial statements, profitability, growth     | `drafts/fundamentals/insights.md` |
| `factor-agent.md`      | Quantitative factors (value, momentum, quality) | `drafts/factors/insights.md`      |
| `technical-agent.md`   | Price action, support/resistance, signals       | `drafts/technicals/insights.md`   |
| `valuation-agent.md`   | Intrinsic value, DCF, comparables               | `drafts/valuation/insights.md`    |
| `sentiment-agent.md`   | News sentiment, insider activity                | `drafts/sentiment/insights.md`    |

### 3. Aggregation Scripts

**Extract Metrics** (`scripts/extract_metrics.py`)

- Parse all `drafts/*/insights.md` files
- Extract key metrics using regex
- Load JSON data from `drafts/*/data/*.json`
- Output: `summary.json`

**Generate Report** (`scripts/generate_report.py`)

- Aggregate all insights into final markdown report
- Create executive summary from "Bottom Line" sections
- Structure: Executive Summary → Full Analysis Sections → Methodology
- Output: `final_report.md`

### 4. Main Orchestrator

**CLAUDE.md** (Enhanced)

- New section: "Multi-Agent Research Orchestration"
- Agent selection logic (full analysis, macro-first, quant-only, etc.)
- Parallel execution workflow using Task tool
- Aggregation and reporting instructions

## Workflow

### User Request: "Analyze VCB with all perspectives"

**Step 1**: Main agent creates workspace

```bash
analyses/VCB_multiagent_2026-02-20/
└── drafts/
    ├── macro/{data,charts}
    ├── fundamentals/{data,charts}
    ├── factors/{data,charts}
    ├── technicals/{data,charts}
    ├── valuation/{data,charts}
    └── sentiment/{data,charts}
```

**Step 2**: Spawn 6 agents in parallel

- Single message with 6 Task tool calls
- Each agent: `run_in_background=true`
- Agents execute autonomously, write to `drafts/*/insights.md`

**Step 3**: Monitor completion

```bash
ls drafts/*/insights.md  # Check which agents finished
```

**Step 4**: Aggregate results

```bash
python scripts/extract_metrics.py --drafts drafts/ --output summary.json
python scripts/generate_report.py --drafts drafts/ --symbol VCB --output final_report.md
```

**Step 5**: Present executive summary to user

## Example Output

### summary.json (Metrics)

```json
{
  "macro": {
    "insights": {
      "regime": "EXPANSION",
      "confidence": "100",
      "gdp_growth": "7.2",
      "credit_growth": "14.5",
      "inflation": "4.2"
    },
    "data": { "regime": {...} }
  },
  "fundamentals": {
    "insights": {
      "health_score": "STRONG",
      "roe": "22.5",
      "roa": "1.2"
    }
  },
  "factors": {
    "insights": {
      "composite_score": "0.98",
      "percentile_rank": "64"
    }
  }
}
```

### final_report.md (Structured Report)

```markdown
# Investment Analysis: VCB

**Generated**: 2026-02-20 14:21:48 UTC

## Executive Summary

**Macroeconomic Analysis**: Vietnam is in EXPANSION regime. Banks favored.

**Fundamental Analysis**: BUY - Exceptional profitability, pristine asset quality.

**Factor Analysis**: 64th percentile. Quality-momentum tilt. Aligns with expansion.

---

## Macroeconomic Analysis

[Full macro insights]

## Fundamental Analysis

[Full fundamental insights]

## Factor Analysis

[Full factor insights]

---

## Methodology

[Agent descriptions]
```

## Testing

Test workspace created at: `analyses/VCB_test_2026-02-20/`

**Verified**:

1. ✅ Macro regime classifier works (`classify_regime.py`)
2. ✅ Factor calculation works (`calculate_factors.py`)
3. ✅ Metrics extraction works (`extract_metrics.py`)
4. ✅ Report generation works (`generate_report.py`)

**Example Commands**:

```bash
# Test macro classifier
python3 .claude/skills/macro-regime/scripts/classify_regime.py \
  --gdp 7.2 --credit 14.5 --inflation 4.2

# Test factor analyst
python3 .claude/skills/factor-analyst/scripts/calculate_factors.py --symbol VCB

# Test aggregation
python3 scripts/extract_metrics.py \
  --drafts analyses/VCB_test_2026-02-20/drafts \
  --output analyses/VCB_test_2026-02-20/summary.json

python3 scripts/generate_report.py \
  --drafts analyses/VCB_test_2026-02-20/drafts \
  --symbol VCB \
  --output analyses/VCB_test_2026-02-20/final_report.md
```

## Integration Points

### Flask API (Planned - Phase 5)

Add to `assistant/vnstock/workspace/app.py`:

```python
@app.route('/api/research/run', methods=['POST'])
def run_research():
    """Trigger multi-agent research"""
    data = request.json
    symbol = data.get('symbol')
    agents = data.get('agents', ['macro', 'fundamental', 'factor', 'technical', 'valuation', 'sentiment'])

    # Create workspace, trigger Claude Code via MCP
    return jsonify({"status": "initiated", "workspace": workspace_path})

@app.route('/api/research/status/<workspace_id>', methods=['GET'])
def get_status(workspace_id):
    """Check research status"""
    # Check which drafts are complete
    return jsonify({"drafts": {...}, "status": "completed|in_progress"})
```

### TypeScript Service (Planned - Phase 5)

Add to `src/process/services/vnstockService.ts`:

```typescript
async runResearch(params: {
  symbol: string;
  agents?: string[];
}): Promise<ResearchWorkspace> {
  const response = await fetch(`${this.apiBaseUrl}/api/research/run`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return await response.json();
}
```

### IPC Bridge (Planned - Phase 5)

Add to `src/process/bridge/vnstockBridge.ts`:

```typescript
ipcMain.handle('vnstock:runResearch', async (event, params) => {
  return await vnstockService.runResearch(params);
});
```

## Files Created

### Skills (Phase 1)

- `assistant/vnstock/workspace/.claude/skills/macro-regime/SKILL.md`
- `assistant/vnstock/workspace/.claude/skills/macro-regime/scripts/classify_regime.py`
- `assistant/vnstock/workspace/.claude/skills/macro-regime/scripts/fetch_sbv_data.py`
- `assistant/vnstock/workspace/.claude/skills/macro-regime/scripts/fetch_gso_data.py`
- `assistant/vnstock/workspace/.claude/skills/factor-analyst/SKILL.md`
- `assistant/vnstock/workspace/.claude/skills/factor-analyst/scripts/calculate_factors.py`
- `assistant/vnstock/workspace/.claude/skills/factor-analyst/scripts/rank_universe.py`
- `assistant/vnstock/workspace/.claude/skills/factor-analyst/scripts/factor_correlation.py`

### Agents (Phase 2)

- `assistant/vnstock/workspace/.claude/agents/macro-agent.md`
- `assistant/vnstock/workspace/.claude/agents/fundamental-agent.md`
- `assistant/vnstock/workspace/.claude/agents/factor-agent.md`
- `assistant/vnstock/workspace/.claude/agents/technical-agent.md`
- `assistant/vnstock/workspace/.claude/agents/valuation-agent.md`
- `assistant/vnstock/workspace/.claude/agents/sentiment-agent.md`

### Aggregation (Phase 4)

- `assistant/vnstock/workspace/scripts/extract_metrics.py`
- `assistant/vnstock/workspace/scripts/generate_report.py`

### Enhanced (Phase 3)

- `assistant/vnstock/workspace/CLAUDE.md` (multi-agent orchestration section added)

### Test Output

- `assistant/vnstock/workspace/analyses/VCB_test_2026-02-20/` (test workspace)

## Next Steps

1. **Enhance Skills with Real Data**: Replace simulated data with vnstock API calls
2. **Add More Visualizations**: Macro charts, factor radar charts
3. **Implement API Integration**: Flask endpoints, TypeScript service, IPC handlers
4. **Add PowerPoint Generation**: `scripts/generate_deck.py` using python-pptx
5. **Optimize Parallel Execution**: Tune agent timeouts, add retry logic

## Usage Example

```python
# From main agent workspace (assistant/vnstock/workspace/)

# 1. User request
"Analyze VCB with macro, fundamental, and factor perspectives"

# 2. Main agent creates workspace
mkdir -p analyses/VCB_multiagent_2026-02-20/drafts/{macro,fundamentals,factors}/{data,charts}

# 3. Spawn 3 agents in parallel (Task tool, single message)
Task(subagent_type="general-purpose", prompt="Macro Analyst: analyze regime...", run_in_background=true)
Task(subagent_type="general-purpose", prompt="Fundamental Analyst: analyze VCB...", run_in_background=true)
Task(subagent_type="general-purpose", prompt="Factor Analyst: analyze VCB factors...", run_in_background=true)

# 4. Agents write to drafts/*/insights.md

# 5. Aggregate
python scripts/extract_metrics.py --drafts analyses/VCB_multiagent_2026-02-20/drafts --output summary.json
python scripts/generate_report.py --drafts analyses/VCB_multiagent_2026-02-20/drafts --symbol VCB --output final_report.md

# 6. Present executive summary to user
```

## Success Criteria

- ✅ Skills work independently (can run scripts directly)
- ✅ Sub-agents can execute autonomously (markdown templates ready)
- ⚠️ Parallel execution (waiting for real agent invocation test)
- ✅ Draft workspace populated (test workspace verified)
- ✅ Aggregation works (scripts tested successfully)
- ⚠️ API integration (planned for Phase 5)

## Known Limitations

1. **Simulated Data**: Skills currently return simulated data. Need to integrate:
   - vnstock API for real Vietnamese stock data
   - GSO API for GDP/inflation data
   - SBV API for credit/interest rate data

2. **Datetime Deprecation**: Scripts use `datetime.utcnow()` which is deprecated. Should migrate to `datetime.now(datetime.UTC)`.

3. **Error Handling**: Limited error handling in scripts. Should add:
   - Retry logic for API failures
   - Graceful degradation if agent fails
   - Validation of extracted metrics

4. **Agent Coordination**: No explicit dependency management between agents. Currently assumes all agents can run independently.

## Conclusion

The multi-agent research system architecture is fully implemented and tested at the skill/agent/aggregation level. The system can:

1. Classify macro regimes using Vietnamese economic indicators
2. Calculate quantitative investment factors with z-scores
3. Define 6 specialist sub-agents with clear responsibilities
4. Aggregate insights from multiple agents into unified reports
5. Extract structured metrics from unstructured markdown insights

Next phase: Integrate with AionUi's TypeScript/Electron app via Flask API and IPC.
