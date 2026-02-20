# vnstock Vietnamese Stock Market Research — Markdown Report Generation

## Quick Start

This workspace generates **markdown research reports** via multi-agent delegation.

**Core workflow**:

1. Main agent delegates to specialist sub-agents
2. Sub-agents **investigate** using notebookmd to capture their research process
3. Main agent **synthesizes discoveries** from all investigations
4. notebookmd captures artifacts (tables, charts) automatically during research

**Data access**:

```python
from vnstock_lib import fetch_quote, fetch_ratios, fetch_financial_data

# Example: Analyze VCB (Vietcombank)
prices = fetch_quote('VCB', start='2025-01-01', end='2026-02-20')
ratios = fetch_ratios('VCB', period='annual')
```

See `.claude/skills/vnstock-data/SKILL.md` for full API reference.

**notebookmd: Streamlit-like API for Report Generation**

```python
from notebookmd import nb, NotebookConfig

cfg = NotebookConfig(max_table_rows=30)
st = nb("analyses/VCB_2026-02-20/drafts/fundamentals/insights.md",
       title="Fundamental Investigation: VCB", cfg=cfg)

# Use section() to organize your investigation
st.section("Hypothesis: VCB Has Exceptional ROE")
ratios = fetch_ratios('VCB')
roe = ratios['roe'].values[0]
st.kv({"ROE": f"{roe:.1f}%"})  # Auto-formatted key-value table

st.section("Question: Is High ROE From Leverage or Genuine Profitability?")
roic = calculate_roic(fetch_financials('VCB'))
st.kv({
    "ROE": f"{roe:.1f}%",
    "ROIC": f"{roic:.1f}%",
    "Finding": "High ROIC confirms genuine profitability, not leverage"
})

st.save()  # Auto-generates markdown with asset management
```

**First-time setup**:

```bash
bash setup.sh
```

## Core Capabilities

### Available Functions (vnstock_lib.py)

- **Price Data**: `fetch_quote()`, `fetch_price_board()`, `calculate_returns()`
- **Financials**: `fetch_balance_sheet()`, `fetch_income_statement()`, `fetch_cash_flow()`, `fetch_ratios()`
- **Market Data**: `list_symbols()` (by exchange, industry, group)

Full documentation: `.claude/skills/vnstock-data/vnstock_lib.py`

### Agent Mindset

**You are an autonomous researcher, not a script executor.**

Core workflow: **Plan -> Gather -> Decide -> Iterate -> Synthesize**

See `vnstock.en-US.md` for detailed agent mindset and philosophy.

## Multi-Agent Research Orchestration

When user requests comprehensive analysis, spawn specialist sub-agents in parallel.

### Available Sub-Agents

See `vnstock.en-US.md` for full table. Quick reference:

- **Macro** - Economic regime analysis
- **Fundamental** - Financial health (ROE, NPL, margins)
- **Factor** - Quantitative factors (value, momentum, quality)
- **Technical** - Price action and momentum
- **Valuation** - Intrinsic value estimation
- **Sentiment** - News and market psychology

### Orchestration Workflow

**Step 1: Create Workspace**

```bash
SYMBOL=VCB
TODAY=$(date +%Y-%m-%d)
ANALYSIS_DIR="analyses/${SYMBOL}_multiagent_${TODAY}"
# notebookmd auto-creates asset directories, just create draft directories
mkdir -p "$ANALYSIS_DIR/drafts"/{macro,fundamentals,factors,technicals,valuation,sentiment}
```

**Step 2: Spawn Agents in Parallel**

Use Task tool with `run_in_background=true`. **Critical**: All spawns in SINGLE message.

Example prompt for each agent:

````
You are the [Fundamental] Analyst for Vietnamese equities. Your job is **discovery**, not report writing.

**Investigation approach**:
1. Form hypothesis (e.g., "VCB has high ROE - is it quality or leverage?")
2. Gather data to test hypothesis
3. Discover what the data reveals (surprises? contradictions?)
4. Iterate: Ask follow-up questions based on findings
5. Capture your investigation using notebookmd (it handles formatting)

Example investigation workflow:
```python
from notebookmd import nb, NotebookConfig
from vnstock_lib import fetch_ratios, fetch_financials

cfg = NotebookConfig(max_table_rows=30)
st = nb("drafts/fundamentals/insights.md", title="Fundamental Investigation: {symbol}", cfg=cfg)

st.section("Hypothesis: {symbol} Has Exceptional ROE")
ratios = fetch_ratios('{symbol}')
roe = ratios['roe'].values[0]
st.kv({"ROE": f"{roe:.1f}%"})
print(f"Confirmed: ROE is {roe:.1f}%")

st.section("Question: Is High ROE From Leverage or Genuine Profitability?")
# Calculate ROIC vs ROE spread
financials = fetch_financials('{symbol}')
roic = calculate_roic(financials)
leverage = ratios['debt_to_equity'].values[0]
st.kv({
    "ROE": f"{roe:.1f}%",
    "ROIC": f"{roic:.1f}%",
    "Leverage": f"{leverage:.1f}x",
    "Finding": "High ROIC confirms genuine profitability, not leverage game"
})

st.section("Peer Validation: Is {symbol} Best-in-Class?")
peers = fetch_ratios(['VCB', 'TCB', 'VPB', 'ACB'])
st.table(peers[['ticker', 'roe', 'roa', 'npm']], name="Peer comparison")
# Discovery: {symbol} is #1 by significant margin

st.section("Deep Dive: Why Is {symbol}'s ROE Superior?")
# DuPont analysis: margin x turnover x leverage
# Discover root causes (e.g., superior NIM, lower cost/income)

st.save()
```

**Focus**: Spend time on **analysis depth**, not markdown formatting. notebookmd handles the formatting.
````

**Step 3: Monitor Completion**

```bash
ls -la analyses/VCB_multiagent_2026-02-20/drafts/*/insights.md
```

**Step 4: Synthesize Investigations into Final Report**

Use notebookmd to synthesize discoveries from sub-agent investigations:

````python
from notebookmd import nb, NotebookConfig
from pathlib import Path

cfg = NotebookConfig(max_table_rows=30)
st = nb("final_report.md", title="Investment Analysis: {symbol}", cfg=cfg)

st.section("Gather Sub-Agent Discoveries")
# Read investigation reports
macro_md = Path('drafts/macro/insights.md').read_text()
fund_md = Path('drafts/fundamentals/insights.md').read_text()
factor_md = Path('drafts/factors/insights.md').read_text()
# Extract key discoveries (not just summaries)

st.section("Executive Summary")
st.write("**Macro**: Expansion regime favors banks...")
st.kv({
    "Recommendation": "STRONG BUY",
    "Entry": "98k VND",
    "Target": "110k (+12%)",
    "Stop": "92k (-6%)"
})

st.section("Triangulate: What Do These Discoveries Reveal Together?")
# Find non-obvious edges by combining insights
st.write("""
**Synthesis**: Market sees VCB as expensive quality bank.
**Reality**: Quality improved faster than price + macro tailwind just starting.
**Edge**: Quality re-rating opportunity in favorable macro regime.
""")

st.section("Investment Thesis")
# Use mermaid for thesis flow (st.write supports mermaid)
st.write("""
```mermaid
graph LR
    A[Macro: Expansion] --> D[Edge: Quality Mispriced]
    B[Fund: ROE 22.5%] --> D
    C[Factor: Quality-Value] --> D
    D --> E[STRONG BUY]
```
""")

st.save()
````

**Step 5: notebookmd API Reference**

Key methods for data visualization:

```python
# Sections (organize your report)
st.section("Key Metrics", "Optional description")

# Tables (auto-formatted DataFrames)
st.table(df, name="Peer comparison", max_rows=30)

# Key-value metrics (cleaner than manual markdown)
st.kv({"ROE": "22.5%", "P/B": "2.3x"}, title="Metrics")

# Metric cards (like st.metric)
st.metric("ROE", "22.5%", delta="+4.5%")
st.metric_row([
    {"label": "P/E", "value": "15.2x"},
    {"label": "P/B", "value": "2.3x"},
])

# Figures (matplotlib/plotly with auto-save)
st.figure(fig, "chart.png", caption="Price trend")
st.line_chart(df, x="date", y="close", title="Price")

# Status messages
st.success("Analysis complete!")
st.warning("Missing data for 3 days")
st.info("Using cached data")

# Smart write (auto-formats any type)
st.write("Some **markdown** text")
st.write({"key": "value"})  # renders as JSON
st.write(df)                # renders as table

# Raw markdown (for mermaid diagrams, etc.)
st.md("""
```mermaid
graph TD
    A --> B
```
""")

# Layout (context managers, like Streamlit)
with st.expander("Show details"):
    st.table(df)

tabs = st.tabs(["Overview", "Details"])
with tabs.tab("Overview"):
    st.metric("Price", "98k")

# CSV exports (data downloads)
st.export_csv(df, "data.csv", name="Full dataset")
```

## Agent Synthesis: Finding Market Edges

**Your job**: SYNTHESIZE (not just concatenate)

**Aggregation** (bad):

- Read each insight separately
- Concatenate all findings
- Present as bullet list

**Synthesis** (agent mindset):

- **Triangulate**: How do findings combine? What emerges from the intersection?
- **Find contradictions**: If macro favors momentum but stock is value, WHY?
- **Discover edges**: What non-obvious opportunity appears when insights combine?

**Example: VCB Investment Thesis**

**Inputs**:

- Macro: "EXPANSION regime, banks favored, credit growth 14.5%"
- Factor: "VCB value z-score +0.8 (cheap), quality z-score +1.5 (high)"
- Fundamental: "VCB ROE 22.5% vs sector 16%, NPL 0.8% vs sector 2.2%"
- Valuation: "Fair P/B 2.6x, current 2.3x -> +13% upside"

**Your Synthesis**:

```markdown
# The Edge

Market underprices VCB quality in an expansion regime that favors banks.

# Why This is Non-Obvious

Most investors see VCB as "fairly valued" (P/B 2.3x vs sector 2.0x).
They miss:

1. Quality premium underpriced (22.5% ROE vs 16% justifies 40% higher P/B, not 15%)
2. Macro tailwind (expansion -> loan growth -> NIM expansion)
3. Factor anomaly (value usually = low quality; VCB = high-quality value)

# Conviction: HIGH

All 4 agents align (macro, factor, fundamental, valuation point to BUY).

# Risk Management

- Stop loss: 92k VND (below support at 95k)
- Regime risk: If CPI > 5.5%, SBV tightens -> exit
- Position size: 5% (high conviction, not overconcentrated)

# Action

BUY VCB at 98k, target 110k (+12%), stop 92k (-6%)
Risk/reward: 2:1
```

**This is synthesis**: Finding edges by triangulating independent viewpoints.

## Vietnamese Market Essentials

See `vnstock.en-US.md` for full context. Quick reference:

**Exchanges**: HOSE (large-cap), HNX (mid-cap), UPCOM (unlisted)

**Key Indices**: VN30 (market bellwether), VNMidCap, VNSmallCap

**Major Symbols**:

- Banks: VCB, TCB, VPB, ACB
- Industrials: HPG (steel), GAS (energy)
- Real Estate: VHM, NVL
- Consumer: VNM, MSN

**Critical Disclaimers**:

1. Data may be incomplete/delayed - verify critical decisions
2. Rate limits: Guest 20 req/min, Community 60 req/min
3. Not for live trading - research only
4. Cross-check with official sources (company filings, exchange announcements)

## Markdown Report Best Practices

### Use Tables for Data Comparison

**Financial metrics comparison**:

```markdown
| Metric | VCB   | Peers | Interpretation    |
| ------ | ----- | ----- | ----------------- |
| ROE    | 22.5% | 16.0% | Best-in-class     |
| P/B    | 2.3x  | 2.0x  | Slight premium    |
| NPL    | 0.8%  | 1.7%  | Strong quality    |
```

**Factor z-scores**:

```markdown
| Factor    | VCB Z-Score | Interpretation  |
| --------- | ----------- | --------------- |
| Value     | +0.8        | Cheap           |
| Quality   | +1.5        | High quality    |
| Momentum  | -0.3        | Weak momentum   |
| Composite | +1.2        | 82nd percentile |
```

### Use Mermaid Diagrams for Insights

**Investment thesis flow**:

````markdown
```mermaid
graph LR
    A[Macro: Expansion] --> B[Banks Favored]
    C[Factor: High Quality Value] --> D[Edge Discovered]
    B --> D
    E[Fundamental: ROE 22.5%] --> D
    D --> F[BUY: VCB at 98k]
```
````

### Final Report Structure (Section-Based)

Use `st.section()` to organize the synthesis:

1. **Gather sub-agent discoveries** - Read investigation reports, extract key findings
2. **Executive Summary** - Use `st.kv()` for recommendation, entry, target, stop
3. **Triangulate insights** - Find non-obvious edges from combined discoveries
4. **Investment Thesis** - Use `st.write()` with mermaid diagram for thesis flow
5. **Conviction drivers** - Use `st.kv()` for conviction scores across agents
6. **Risk Management** - Stop loss logic, position sizing, monitoring plan

**Section structure reflects your synthesis process**, not a rigid template. Focus on discovering edges by triangulating independent agent discoveries.
