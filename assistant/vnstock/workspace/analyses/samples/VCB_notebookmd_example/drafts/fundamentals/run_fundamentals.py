#!/usr/bin/env python3
"""
Fundamental Investigation Example

Demonstrates deep investigation vs surface-level checklist.
Focus: WHY is ROE high? WHY is it sustainable? Not just "ROE is 22.5%"
"""

import sys
sys.path.insert(0, '../../../..')

from notebookmd import nb, NotebookConfig
import pandas as pd

# Initialize report
cfg = NotebookConfig(max_table_rows=30)
st = nb('insights.md', title='Fundamental Investigation: VCB', cfg=cfg)

# ============================================================================
# Investigation: Not a checklist, but a series of "why?" questions
# ============================================================================

st.section("Initial Observation: VCB Has ROE 22.5%")

# Example data (in real usage, fetch with vnstock_lib)
roe = 22.5
roa = 2.8

st.kv({
    "ROE": f"{roe:.1f}%",
    "ROA": f"{roa:.1f}%",
    "Question": "Why is ROE high? Is it sustainable?"
}, title="Initial Metrics")

print("Gathered initial profitability metrics")

st.section("Question: Is High ROE From Profitability or Leverage?")

# DuPont decomposition: ROE = Margin x Turnover x Leverage
npm = 25.0  # Net profit margin
asset_turnover = 0.08
equity_multiplier = 11.25  # 1 / (1 - debt/assets)

# Calculate: ROE = NPM x AT x EM
roe_calculated = npm * asset_turnover * equity_multiplier
print(f"  DuPont ROE: {roe_calculated:.1f}%")

st.write("""
**DuPont Analysis**:
ROE = Net Margin x Asset Turnover x Leverage
22.5% = 25.0% x 0.08 x 11.25
""")

st.kv({
    "Net Margin": f"{npm:.1f}%",
    "Asset Turnover": f"{asset_turnover:.2f}x",
    "Equity Multiplier": f"{equity_multiplier:.2f}x",
    "Finding": "High ROE driven by SUPERIOR MARGINS, not leverage"
}, title="DuPont Breakdown")

st.section("Deep Dive: WHY Is Net Margin Superior?")

vcb_nim = 3.8      # Net Interest Margin
sector_nim = 3.2
vcb_cost_income = 0.35
sector_cost_income = 0.42

st.write("""
**Root Cause Analysis**: Why NPM 25% vs sector 20%?

**Driver 1: Net Interest Margin (NIM)**
- VCB NIM: 3.8%
- Sector NIM: 3.2%
- Spread: +60bp advantage
- Why: Higher retail deposit mix (70% vs 60%) -> lower funding costs

**Driver 2: Operating Efficiency**
- VCB cost/income: 35%
- Sector cost/income: 42%
- Spread: 700bp advantage
- Why: Digital banking adoption (70% vs peers 45%) -> lower branch costs
""")

st.kv({
    "NIM Advantage": f"+{(vcb_nim - sector_nim)*100:.0f}bp (retail deposit mix)",
    "Cost Efficiency": f"{(sector_cost_income - vcb_cost_income)*100:.0f}bp advantage (digital banking)",
    "Result": "Structural margin advantage, not cyclical"
}, title="Margin Deep-Dive")

print("DISCOVERY: Margin advantage from digital banking (structural, not cyclical)")

st.section("Question: Is This SUSTAINABLE or Will Margins Compress?")

nim_trend = pd.DataFrame({
    '2023': [3.5],
    '2024': [3.6],
    '2025': [3.8]
})

st.table(nim_trend, name="NIM Trend (3Y)")

st.write("""
**Sustainability Check**:

- **NIM EXPANDING** (3.5% -> 3.8% over 3Y)
  - Why expanding? Retail deposit mix growing 60% -> 70%
  - Runway: Can reach 75% (still below best-in-class Thai banks 80%)

- **Cost efficiency WIDENING** (digital adoption 45% -> 70%)
  - Competitors: Still at 45-50% digital adoption
  - VCB lead: 2-3 years ahead on digital transformation
  - Moat: Network effects (more users -> better UX -> more users)

**Conclusion**: Margin advantage is STRUCTURAL and WIDENING, not temporary
""")

st.section("Peer Validation: Is VCB an Outlier or #1 by Small Margin?")

peers_data = pd.DataFrame({
    'ticker': ['VCB', 'TCB', 'VPB', 'ACB', 'MBB'],
    'roe': [22.5, 18.0, 16.0, 14.5, 15.5],
    'roa': [2.8, 2.2, 2.0, 1.8, 1.9],
    'npm': [25.0, 22.0, 20.0, 19.0, 19.5],
    'cost_income': [0.35, 0.40, 0.42, 0.45, 0.43]
})

st.table(peers_data, name="Peer Comparison")

sector_avg_roe = peers_data['roe'].mean()
roe_premium = roe - sector_avg_roe

st.kv({
    "VCB ROE": f"{roe:.1f}%",
    "Sector Avg ROE": f"{sector_avg_roe:.1f}%",
    "Premium": f"+{roe_premium:.1f}%pts ({(roe/sector_avg_roe-1)*100:.0f}% higher)",
    "Finding": "VCB is #1 by SIGNIFICANT MARGIN, not close race"
}, title="Relative Positioning")

print(f"DISCOVERY: VCB is {(roe/sector_avg_roe-1)*100:.0f}% better than sector avg - clear leader")

st.section("Investment Implication: Is Quality Premium Justified?")

vcb_pb = 2.3
sector_pb = 2.0

vcb_pb_per_roe = vcb_pb / roe
sector_pb_per_roe = sector_pb / sector_avg_roe

st.kv({
    "VCB P/B": f"{vcb_pb:.1f}x",
    "VCB ROE": f"{roe:.1f}%",
    "VCB P/B per ROE point": f"{vcb_pb_per_roe:.3f}",
    "Sector P/B per ROE point": f"{sector_pb_per_roe:.3f}",
    "Finding": f"VCB CHEAPER on quality-adjusted basis ({vcb_pb_per_roe:.3f} vs {sector_pb_per_roe:.3f})"
}, title="Quality-Adjusted Valuation")

st.write(f"""
## NON-OBVIOUS DISCOVERY

**What market sees**:
- VCB P/B 2.3x vs sector 2.0x -> "15% premium, fairly valued"

**What market MISSES**:
- VCB ROE 22.5% vs sector {sector_avg_roe:.1f}% -> 41% ROE premium
- Quality-adjusted: VCB P/B-per-ROE {vcb_pb_per_roe:.3f} < sector {sector_pb_per_roe:.3f}

**EDGE**: Market underprices quality improvement
- ROE improved +25% (18% -> 22.5%) over 3Y
- But price only up +15%
- Quality improvement NOT FULLY PRICED IN

**Action**: STRONG BUY - Sustainable quality at reasonable price
""")

st.section("Bottom Line: Investment Recommendation")

st.kv({
    "Financial Health": "STRONG",
    "ROE": f"{roe:.1f}% (best-in-class)",
    "Quality": "Structural cost advantage (digital banking)",
    "Sustainability": "HIGH (margins expanding, not compressing)",
    "Valuation": "ATTRACTIVE (quality premium underpriced)",
    "Rating": "STRONG BUY",
    "Conviction": "HIGH"
}, title="Final Assessment")

st.write("""
**Summary**:
VCB demonstrates STRONG fundamentals with best-in-class ROE (22.5% vs sector 16.5%),
driven by structural cost advantage from digital banking (cost/income 35% vs 42%).
Margins expanding (NIM 3.5% -> 3.8%), not compressing - sustainable quality.

**Edge**: Quality improved +25% but price only +15% -> mispriced quality improvement.

**Action**: STRONG BUY
- Entry: 98k VND
- Target: 110k (+12%)
- Stop: 92k (-6%)
""")

# Save
output_path = st.save()
print(f"\nInvestigation complete! Saved to: {output_path}")
print(f"  Deep insights generated: ROE decomposition, margin drivers, sustainability analysis")
