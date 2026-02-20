#!/usr/bin/env python3
"""
Macro Regime Investigation Example

Demonstrates how macro agent investigates regime state using notebookmd.
Focus: Finding non-obvious sector rotation insights, not just "expansion = bullish"
"""

import sys
sys.path.insert(0, '../../../..')  # Access vnstock workspace root

from notebookmd import nb, NotebookConfig

# Initialize report
cfg = NotebookConfig(max_table_rows=30)
st = nb('insights.md', title='Macro Regime Investigation: Vietnam', cfg=cfg)

# ============================================================================
# Investigation Workflow: Not a checklist, but a series of questions
# ============================================================================

st.section("Setup: Gather Macro Indicators")

# Example data (in real usage, fetch from GSO/SBV)
indicators = {
    "GDP Growth": "7.2%",
    "Credit Growth": "14.5%",
    "CPI (YoY)": "4.2%",
    "PMI": 52.8,
    "Policy Rate": "4.5%",
    "FX Reserves": "$95bn"
}
st.kv(indicators, title="Key Macro Indicators")
print("Indicators gathered")

st.section("Question: What Regime Are We In?")

# Classification based on thresholds
gdp = 7.2
credit = 14.5
cpi = 4.2

# Logic: GDP > 6.5%, Credit > 12%, CPI 2-4.5% -> EXPANSION
regime = "EXPANSION"
confidence = 85

st.kv({
    "Regime": regime,
    "Confidence": f"{confidence}%",
    "Rationale": "GDP > 6.5%, Credit > 12%, CPI moderate (< 4.5%)"
}, title="Regime Classification")

st.write(f"""
**Finding**: Vietnam is in {regime} phase
- GDP 7.2% indicates strong economic momentum
- Credit 14.5% is healthy (not overheating > 18%)
- Inflation 4.2% is contained (SBV comfort zone)
""")

st.section("Investigation: Are We Early, Mid, or Late Cycle?")

# This is the NON-OBVIOUS question most analysts miss
st.write("""
**Question**: Not just "expansion", but WHERE in expansion?

**Analysis**:
- Credit growth **accelerating** (not just high) -> early/mid cycle
- Inflation moderate but **stable** (not accelerating) -> mid cycle
- PMI strong (52.8) but not peaking (< 55) -> room to run

**Discovery**: MID-CYCLE expansion
""")

phase = "MID-CYCLE"
st.kv({"Expansion Phase": phase}, title="Cycle Timing")

st.section("Deep Dive: What's Driving This Regime?")

# Investigate root causes
drivers = [
    "Export growth +15% YoY (strong global demand)",
    "Domestic consumption recovering post-pandemic",
    "FDI inflows robust ($20bn YTD)",
    "Government infrastructure spending accelerating"
]

st.write("**Regime Drivers:**")
for i, driver in enumerate(drivers, 1):
    st.write(f"{i}. {driver}")

st.section("Non-Obvious Sector Rotation Insight")

# THIS IS WHERE REAL VALUE IS CREATED
st.write("""
## The Edge: Sector Rotation WITHIN Expansion

**What most analysts say**:
- "Expansion -> overweight cyclicals"
- Banks, Real Estate, Industrials all benefit equally

**What the market MISSES**:
Cyclicals don't move together - timing matters!

**Discovery from cycle phase analysis**:
- **NOW (Mid-expansion)**: Banks outperform
  - Why: Credit growth accelerating -> NII expansion -> ROE lift
  - Beneficiaries: VCB, TCB, VPB, ACB
- **LATER (Late expansion)**: Industrials catch up
  - Why: Capacity utilization tightens -> pricing power
  - Lag: Industrials trail banks by 2-3 quarters

**Actionable insight**: Don't just buy "all cyclicals"
- Overweight banks NOW
- Rotate to industrials when capacity tightens (PMI > 55)
""")

sector_timing = {
    "Banks (NOW)": "OVERWEIGHT | Credit growth acceleration phase",
    "Real Estate (NOW)": "OVERWEIGHT | Loose credit + low rates",
    "Industrials (WAIT)": "NEUTRAL | Overweight when PMI > 55",
    "Utilities": "UNDERWEIGHT | Defensive underperforms in expansion"
}
st.kv(sector_timing, title="Sector Rotation Timing")

st.section("Regime Transition Watch: What Could Shift Regime?")

# Monitor leading indicators
st.write("""
**Leading Indicators of Regime Shift:**
1. **CPI > 5.5%** for 2+ months -> SBV forced to tighten -> SLOWDOWN
2. **Credit < 12%** -> Demand weakness -> SLOWDOWN
3. **External shock** -> Fed hawkish pivot, China slowdown -> Risk

**Current assessment:**
- Inflation risk: LOW (CPI 4.2%, stable)
- Credit risk: LOW (14.5%, healthy zone)
- External risk: MEDIUM (Monitor Fed policy)
""")

transition_probs = {
    "EXPANSION continues": "75% | Base case: GDP 7%+, CPI 3.5-4.5%",
    "-> SLOWDOWN": "20% | If CPI > 5.5%, SBV hikes rates",
    "-> RECESSION": "5% | External shock (low probability)"
}
st.kv(transition_probs, title="Transition Probabilities (6M)")

st.section("Bottom Line: Actionable Macro Positioning")

st.write("""
## Summary

**Regime**: EXPANSION (MID-CYCLE, 85% confidence)
**GDP**: 7.2% | **Credit**: 14.5% | **CPI**: 4.2%

**Action**: Risk-on positioning
- Overweight Vietnamese equities 65%
- **NOW**: Overweight banks 25% (VCB, TCB, VPB) - credit growth acceleration
- **NOW**: Overweight real estate 15% (VHM, NVL) - loose credit
- **WAIT**: Hold industrials 10% (HPG, GAS) - rotate when PMI > 55

**Edge**: Timing within regime matters
- Don't just buy "all cyclicals"
- Banks NOW (mid-expansion), Industrials LATER (late-expansion)

**Risk**: Inflation overshoot
- Exit signal: CPI > 5.5% or GDP < 6.5%
- If triggered: Rotate to quality/value, reduce cyclical exposure

**Conviction**: HIGH - All indicators aligned for continued expansion
""")

# Save report
output_path = st.save()
print(f"\nInvestigation complete! Saved to: {output_path}")
