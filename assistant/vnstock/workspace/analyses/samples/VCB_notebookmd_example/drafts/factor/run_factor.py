#!/usr/bin/env python3
"""
Factor Investigation Example

Demonstrates anomaly detection: WHY does high-quality stock trade cheap?
Focus: Finding mispricings, not just calculating z-scores
"""

import sys
sys.path.insert(0, '../../../..')

from notebookmd import nb, NotebookConfig
import pandas as pd

# Initialize report
cfg = NotebookConfig(max_table_rows=30)
st = nb('insights.md', title='Factor Investigation: VCB', cfg=cfg)

# ============================================================================
# Investigation: Finding anomalies and mispricings
# ============================================================================

st.section("Setup: Calculate Factor Z-Scores")

# Example factor scores (in real usage, calculate from universe data)
factor_scores = {
    "Value": 0.8,       # Cheap (76th percentile)
    "Quality": 1.5,     # High quality (93rd percentile)
    "Momentum": -0.3,   # Weak momentum (38th percentile)
    "Growth": 0.6,      # Moderate growth (73rd percentile)
    "Volatility": 0.9   # Low volatility (82nd percentile)
}

st.kv(factor_scores, title="Factor Z-Scores")
print("Factor scores calculated")

st.section("Observation: Quality + Value Combination (Unusual)")

# THIS IS THE ANOMALY TO INVESTIGATE
# Normal pattern: Quality = Expensive, Value = Low Quality
# VCB pattern: Quality = High, Value = Cheap

st.write("""
## The Puzzle

**Normal market pattern**:
- High quality stocks -> Trade at premium (P/B > 2.5x) -> Negative value score
- Cheap stocks -> Lower quality (ROE < 15%) -> Positive value score

**VCB pattern (ANOMALY)**:
- Quality z-score: **+1.5** (93rd percentile, top 7%)
- Value z-score: **+0.8** (76th percentile, cheaper than 76%)

**Question**: Is this mispricing or hidden risk?
""")

composite = sum(factor_scores.values()) / len(factor_scores)
st.kv({
    "Composite Score": f"{composite:.2f}",
    "Dominant Tilt": "QUALITY-VALUE (rare combination)",
    "Percentile": "82nd",
    "Quartile": "Q1"
}, title="Profile Summary")

st.section("Investigation: Why Does High-Quality Stock Trade Cheap?")

# Hypothesis testing: Multiple possible explanations
st.write("""
**Possible explanations**:

1. **Market hasn't recognized quality improvement yet** <- INVESTIGATE
2. Hidden risk (regulatory, management, NPL) <- CHECK
3. Sector out of favor (all banks cheap) <- CROSS-VALIDATE
4. Liquidity discount (low float) <- VERIFY

**Testing hypothesis #1**: Quality improvement not priced in
""")

# Historical data: Did quality improve recently?
quality_trend = pd.DataFrame({
    'Year': ['2023', '2024', '2025'],
    'ROE': [18.0, 20.0, 22.5],
    'P/B': [2.0, 2.1, 2.3]
})

st.table(quality_trend, name="Quality vs Valuation Trend")

roe_change_pct = (22.5 - 18.0) / 18.0 * 100
pb_change_pct = (2.3 - 2.0) / 2.0 * 100

st.kv({
    "ROE Change": f"+{roe_change_pct:.0f}% (18.0% -> 22.5%)",
    "P/B Change": f"+{pb_change_pct:.0f}% (2.0x -> 2.3x)",
    "Lag": f"{roe_change_pct - pb_change_pct:.0f}%pts",
    "Finding": "Quality improved +25% but price only +15% -> MISPRICING"
}, title="Quality Improvement vs Price")

print("DISCOVERY: Quality improved faster than price - market lag")

st.section("Cross-Sectional Validation: Is VCB Unique?")

# Compare to peers: Are other banks also quality-value?
peers_factors = pd.DataFrame({
    'ticker': ['VCB', 'TCB', 'VPB', 'ACB', 'MBB'],
    'quality_z': [1.5, 0.9, 0.6, 0.3, 0.5],
    'value_z': [0.8, -0.2, 1.2, 0.9, 0.4]
})

st.table(peers_factors, name="Peer Factor Comparison")

st.write("""
**Cross-sectional analysis**:

- **VCB**: Quality 1.5, Value 0.8 -> ANOMALY (high + cheap)
- **TCB**: Quality 0.9, Value -0.2 -> Normal (high quality = expensive)
- **VPB**: Quality 0.6, Value 1.2 -> Normal (cheap = lower quality)
- **ACB**: Quality 0.3, Value 0.9 -> Normal (cheap = low quality)

**Finding**: VCB is UNIQUE outlier
- Only bank with high quality + cheap valuation
- Not a sector-wide pattern -> VCB-specific mispricing
""")

print("DISCOVERY: VCB is unique outlier - not sector-wide pattern")

st.section("Macro Alignment Check: Does Weak Momentum Matter?")

# VCB has weak momentum (-0.3) in EXPANSION regime
regime = "EXPANSION"
favored_factors = ["Momentum", "Growth"]

st.write(f"""
**Regime-factor alignment**:

**Current regime**: {regime} (favors {', '.join(favored_factors)})
**VCB profile**: Quality + Value (weak momentum -0.3)

**Conflict**: Weak momentum contradicts expansion regime

**Why weak momentum?**
- Price up +15% (not bad in absolute terms)
- But quality up +25% -> Price LAGGED quality improvement
- Market recognition lag -> Weak momentum

**Expected**: When market recognizes quality improvement
- Momentum should flip positive
- Price catches up to fundamentals
- Quality-value mispricing corrects
""")

st.section("Catalyst Timeline: When Will Mispricing Correct?")

st.write("""
**Potential catalysts**:

1. **Q1 2026 earnings** (Feb 2026)
   - ROE confirmation at 22%+ level
   - NIM stability demonstrated
   - Market realizes "this is not temporary"

2. **Analyst upgrades** (post-earnings)
   - Consensus ROE estimates raised from 20% -> 22%
   - Target P/B multiples raised from 2.5x -> 2.7x

3. **Macro momentum** (expansion regime)
   - Banks outperform in mid-expansion
   - Sector rotation into banks -> VCB benefits

**Timeline**: 3-6 months for mispricing to correct
**Expected price move**: +12-15% (quality re-rating)
""")

st.section("Bottom Line: Factor-Based Investment Thesis")

st.kv({
    "Anomaly": "Quality-value combination (rare)",
    "Root cause": "Quality improved +25%, price only +15%",
    "Uniqueness": "VCB-specific outlier (not sector pattern)",
    "Catalyst": "Earnings confirmation + macro momentum",
    "Timeline": "3-6 months",
    "Expected": "+12-15% quality re-rating",
    "Rating": "STRONG BUY",
    "Conviction": "HIGH (statistical anomaly + fundamental support)"
}, title="Factor-Based Thesis")

st.write("""
## Summary

**Discovery**: VCB is a **quality-value anomaly**
- High quality (z=1.5) trading cheap (z=0.8)
- Rare combination - most high-quality stocks are expensive

**Why mispriced**:
- Quality improved +25% (ROE 18% -> 22.5%)
- But price only +15% (P/B 2.0x -> 2.3x)
- Market hasn't fully recognized quality improvement

**Edge**: Statistical anomaly + fundamental catalyst
- Weak momentum is a FEATURE not a BUG
- Indicates market lag -> Opportunity to buy before re-rating

**Action**: STRONG BUY before market recognizes quality improvement
- Entry: 98k VND
- Target: 110k (+12% from quality re-rating)
- Stop: 92k (-6%)
""")

# Save
output_path = st.save()
print(f"\nInvestigation complete! Saved to: {output_path}")
print(f"  Anomaly detected: Quality-value combination (market mispricing)")
