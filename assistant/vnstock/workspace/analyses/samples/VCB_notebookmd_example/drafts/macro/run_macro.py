#!/usr/bin/env python3
"""
Macro Regime Investigation Example

Demonstrates how macro agent investigates regime state using notebookmd.
Focus: Finding non-obvious sector rotation insights, not just "expansion = bullish"
"""

import sys
from pathlib import Path
sys.path.insert(0, '../../../..')  # Access vnstock workspace root

from notebookmd import nb, NotebookConfig

# Initialize notebookmd for investigation capture
cfg = NotebookConfig(
    max_table_rows=30,           # Show enough data for pattern recognition
    echo_to_console=True,        # Live investigation feedback
    include_code_default=False   # Hide code by default (focus on insights)
)

# Save to the macro subfolder
script_dir = Path(__file__).parent
N = nb(script_dir / 'insights.md', title='Macro Regime Investigation: Vietnam', cfg=cfg)

# ============================================================================
# Investigation Workflow: Not a checklist, but a series of questions
# ============================================================================

with N.cell("Setup: Gather macro indicators"):
    # Example data (in real usage, fetch from GSO/SBV)
    indicators = {
        "GDP Growth": "7.2%",
        "Credit Growth": "14.5%",
        "CPI (YoY)": "4.2%",
        "PMI": 52.8,
        "Policy Rate": "4.5%",
        "FX Reserves": "$95bn"
    }
    N.kv(indicators, title="Key Macro Indicators")
    print("✓ Indicators gathered")

with N.cell("Question: What regime are we in?"):
    # Classification based on thresholds
    gdp = 7.2
    credit = 14.5
    cpi = 4.2

    # Logic: GDP > 6.5%, Credit > 12%, CPI 2-4.5% → EXPANSION
    regime = "EXPANSION"
    confidence = 85

    N.kv({
        "Regime": regime,
        "Confidence": f"{confidence}%",
        "Rationale": "GDP > 6.5%, Credit > 12%, CPI moderate (< 4.5%)"
    }, title="Regime Classification")

    N.md(f"""
    **Finding**: Vietnam is in {regime} phase
    - GDP 7.2% indicates strong economic momentum
    - Credit 14.5% is healthy (not overheating > 18%)
    - Inflation 4.2% is contained (SBV comfort zone)
    """)

with N.cell("Investigation: Are we early, mid, or late cycle?"):
    # This is the NON-OBVIOUS question most analysts miss
    N.md("""
    **Question**: Not just "expansion", but WHERE in expansion?

    **Analysis**:
    - Credit growth **accelerating** (not just high) → early/mid cycle
    - Inflation moderate but **stable** (not accelerating) → mid cycle
    - PMI strong (52.8) but not peaking (< 55) → room to run

    **Discovery**: MID-CYCLE expansion
    """)

    phase = "MID-CYCLE"
    N.kv({"Expansion Phase": phase}, title="Cycle Timing")

with N.cell("Deep dive: What's driving this regime?"):
    # Investigate root causes
    drivers = [
        "Export growth +15% YoY (strong global demand)",
        "Domestic consumption recovering post-pandemic",
        "FDI inflows robust ($20bn YTD)",
        "Government infrastructure spending accelerating"
    ]

    N.md("**Regime Drivers:**")
    for i, driver in enumerate(drivers, 1):
        N.md(f"{i}. {driver}")

with N.cell("Non-obvious sector rotation insight"):
    # THIS IS WHERE REAL VALUE IS CREATED
    # Most analysts just say "expansion = overweight cyclicals"
    # But WHICH cyclicals? WHEN?

    N.md("""
    ## The Edge: Sector Rotation WITHIN Expansion

    **What most analysts say**:
    - "Expansion → overweight cyclicals"
    - Banks, Real Estate, Industrials all benefit equally

    **What the market MISSES**:
    Cyclicals don't move together - timing matters!

    **Discovery from cycle phase analysis**:
    - **NOW (Mid-expansion)**: Banks outperform
      - Why: Credit growth accelerating → NII expansion → ROE lift
      - Beneficiaries: VCB, TCB, VPB, ACB
    - **LATER (Late expansion)**: Industrials catch up
      - Why: Capacity utilization tightens → pricing power
      - Lag: Industrials trail banks by 2-3 quarters

    **Actionable insight**: Don't just buy "all cyclicals"
    - Overweight banks NOW
    - Rotate to industrials when capacity tightens (PMI > 55)
    """)

    sector_timing = {
        "Banks (NOW)": "⬆️ OVERWEIGHT | Credit growth acceleration phase",
        "Real Estate (NOW)": "⬆️ OVERWEIGHT | Loose credit + low rates",
        "Industrials (WAIT)": "NEUTRAL | Overweight when PMI > 55",
        "Utilities": "⬇️ UNDERWEIGHT | Defensive underperforms in expansion"
    }
    N.kv(sector_timing, title="Sector Rotation Timing")

with N.cell("Regime transition watch: What could shift regime?"):
    # Monitor leading indicators
    N.md("""
    **Leading Indicators of Regime Shift:**
    1. **CPI > 5.5%** for 2+ months → SBV forced to tighten → SLOWDOWN
    2. **Credit < 12%** → Demand weakness → SLOWDOWN
    3. **External shock** → Fed hawkish pivot, China slowdown → Risk

    **Current assessment:**
    - Inflation risk: 🟢 LOW (CPI 4.2%, stable)
    - Credit risk: 🟢 LOW (14.5%, healthy zone)
    - External risk: 🟡 MEDIUM (Monitor Fed policy)
    """)

    transition_probs = {
        "EXPANSION continues": "75% | Base case: GDP 7%+, CPI 3.5-4.5%",
        "→ SLOWDOWN": "20% | If CPI > 5.5%, SBV hikes rates",
        "→ RECESSION": "5% | External shock (low probability)"
    }
    N.kv(transition_probs, title="Transition Probabilities (6M)")

with N.cell("Bottom line: Actionable macro positioning"):
    N.md("""
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

# Save notebook
output_path = N.save()
print(f"\n✓ Investigation complete! Saved to: {output_path}")
print(f"  Assets saved to: {output_path.parent / 'macro_assets'}")
