#!/usr/bin/env python3
"""
Main Agent Synthesis Example

Demonstrates synthesis (not aggregation) of sub-agent discoveries.
Focus: Finding edges by triangulating independent discoveries
"""

import sys
sys.path.insert(0, '../../..')

from notebookmd import nb, NotebookConfig
from pathlib import Path

# Initialize report
cfg = NotebookConfig(max_table_rows=30)
st = nb('final_report.md', title='Investment Analysis: VCB - Finding the Edge', cfg=cfg)

print("=" * 70)
print("MAIN AGENT: Synthesizing sub-agent discoveries")
print("=" * 70)

# ============================================================================
# Synthesis: NOT just concatenating findings, but TRIANGULATING insights
# ============================================================================

st.section("Gather Sub-Agent Discoveries")

# Read investigation reports (in real usage, parse markdown)
# Here we summarize key discoveries from each agent
discoveries = {
    "Macro": "Mid-expansion regime -> Banks outperform NOW (not later)",
    "Fundamental": "Quality improved +25% (ROE 18->22.5%) but price only +15%",
    "Factor": "Quality-value anomaly -> Market hasn't recognized improvement"
}

st.write("**Sub-agent discoveries:**")
for agent, finding in discoveries.items():
    st.write(f"- **{agent}**: {finding}")

print("Gathered discoveries from 3 specialist agents")

st.section("Triangulate: What Emerges When We Combine Insights?")

# THIS IS SYNTHESIS - finding the non-obvious edge
# by looking at how independent discoveries align
st.write("""
## Triangulation Analysis

**Macro discovery**: Banks outperform in MID-expansion (NOW)
- Why: Credit growth accelerating -> NII expansion
- Timing: Banks lead industrials by 2-3 quarters

**Fundamental discovery**: VCB quality improved but underpriced
- ROE improved +25% (18% -> 22.5%) over 3 years
- Price only up +15% (P/B 2.0x -> 2.3x)
- Quality improvement NOT fully priced in

**Factor discovery**: Quality-value anomaly
- High quality (z=1.5) + cheap valuation (z=0.8)
- Weak momentum (-0.3) indicates market lag
- VCB unique outlier among peers

## The Synthesis (What Most Investors Miss)

**What market sees**:
- "VCB is a quality bank trading at fair value (P/B 2.3x vs sector 2.0x)"
- "15% premium justified by quality"

**What market MISSES** (The Edge):
1. Quality improved +25% but price only +15% -> **10%pts lag**
2. We're in MID-expansion -> Banks outperform **NOW** (not later)
3. Weak momentum is a **feature** not bug -> Market recognition lag = Opportunity

**The Edge**: Quality re-rating opportunity at perfect macro timing
- Quality improvement underpriced (fundamental)
- Macro regime favors banks NOW (macro)
- Statistical anomaly confirms mispricing (factor)
""")

st.section("Conviction Drivers: Why HIGH Confidence?")

# Assess confidence based on agent alignment
alignment = {
    "Macro alignment": "HIGH | Mid-expansion favors banks (VCB benefits NOW)",
    "Fundamental quality": "EXCEPTIONAL | ROE 22.5% best-in-class, sustainable",
    "Valuation": "COMPELLING | Quality improvement underpriced by ~10%",
    "Factor anomaly": "CONFIRMED | Quality-value combination rare + significant",
    "Overall conviction": "VERY HIGH | 4/4 agents aligned (rare)"
}
st.kv(alignment, title="Conviction Scorecard")

st.write("""
**Why HIGH conviction**:

- **All agents align** (macro, fundamental, factor point to BUY)
  - Macro: Right regime, right timing
  - Fundamental: Sustainable quality, underpriced
  - Factor: Statistical mispricing confirmed

- **Multiple independent validations**
  - Fundamental: DuPont, peer comparison, trend analysis
  - Factor: Cross-sectional, time-series, macro alignment

- **Clear catalyst**
  - Q1 earnings (Feb 2026) confirms ROE sustainability
  - Macro expansion continues -> Banks benefit
  - Market recognition lag corrects -> Price catch-up

**This is rare**: Usually 2-3 agents align. 4/4 alignment = very high conviction.
""")

st.section("Investment Thesis: The Complete Picture")

# Use mermaid diagram to show thesis flow
st.write("""
```mermaid
graph TB
    A[Macro: Mid-Expansion] --> E[Edge: Quality Mispriced]
    B[Fund: ROE +25%] --> E
    C[Fund: Price +15%] --> E
    D[Factor: Quality-Value Anomaly] --> E
    E --> F[Thesis: Quality Re-rating]
    F --> G[Target: +12-15%]
    F --> H[Timeline: 3-6M]
```
""")

st.write("""
## Investment Thesis

**Core insight**: Market underprices VCB's quality improvement in favorable macro regime

**Evidence**:
1. **Quality improved faster than price** (+25% vs +15%)
2. **Macro timing perfect** (banks outperform NOW in mid-expansion)
3. **Statistical anomaly** (quality-value rare, VCB unique outlier)
4. **Catalyst identified** (Q1 earnings confirms ROE 22%+)

**Expected return**: +12-15% from quality re-rating
- Base case: P/B 2.3x -> 2.6x (+13%)
- Bull case: P/B 2.3x -> 2.8x (+22%) if macro momentum strengthens

**Timeline**: 3-6 months
- Trigger: Q1 2026 earnings + analyst upgrades
- Macro: Expansion regime continues
""")

st.section("Risk Management: What Could Go Wrong?")

st.kv({
    "Stop loss": "92k VND (-6% from 98k entry)",
    "Rationale": "Below support at 95k, invalidates thesis",
    "Position size": "5-7% (high conviction, not overconcentrated)",
    "Regime risk": "CPI > 5.5% -> SBV tightening -> Exit"
}, title="Risk Parameters")

st.write("""
**Exit signals**:
1. **Fundamental**: ROE < 20% -> Quality thesis broken
2. **Macro**: CPI > 5.5% -> Regime shift to SLOWDOWN
3. **Technical**: Price < 92k -> Stop loss triggered
4. **Valuation**: P/B > 2.8x -> Fully valued, take profits

**Monitoring plan**:
- **Monthly**: NPL ratio, NIM trend, cost/income
- **Quarterly**: ROE decomposition, deposit growth
- **Macro**: CPI, credit growth, PMI
""")

st.section("Bottom Line: Actionable Recommendation")

st.kv({
    "Recommendation": "STRONG BUY",
    "Entry": "98k VND",
    "Target": "110k (+12%)",
    "Stop": "92k (-6%)",
    "Risk/Reward": "2:1",
    "Position size": "5-7%",
    "Timeline": "3-6 months",
    "Conviction": "VERY HIGH (4/4 agents aligned)"
}, title="Final Recommendation")

st.write("""
## Summary

**The Edge**: Quality re-rating opportunity at perfect macro timing
- Fundamental: Quality up +25%, price up +15% -> 10%pts mispricing
- Macro: Mid-expansion favors banks NOW (not later)
- Factor: Statistical anomaly confirms (quality-value rare)
- Catalyst: Q1 earnings + macro momentum

**Action**: STRONG BUY
- Entry: 98k VND (current price)
- Target: 110k (+12% base case, +22% bull case)
- Stop: 92k (-6% if thesis breaks)
- Position: 5-7% (high conviction)

**Why this is NOT obvious**:
- Most investors see: "VCB fairly valued quality bank"
- We discovered: "Quality improved faster than price + perfect macro timing"
- Edge: Triangulating 3 independent agent discoveries revealed mispricing

**Conviction**: VERY HIGH
- Rare 4/4 agent alignment
- Multiple independent validations
- Clear catalyst within 3-6 months
""")

# Save
output_path = st.save()
print(f"\n" + "=" * 70)
print(f"Synthesis complete! Saved to: {output_path}")
print(f"  Edge discovered: Quality re-rating at perfect macro timing")
print(f"  Conviction: VERY HIGH (4/4 agents aligned)")
print("=" * 70)
