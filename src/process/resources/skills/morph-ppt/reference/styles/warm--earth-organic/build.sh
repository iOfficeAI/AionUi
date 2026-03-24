#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/warm__earth_organic.pptx"

echo "Building: warm--earth-organic (Sustainable Growth)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=F5F0E8
BROWN=8B6F47
SAGE=A8C686
TERRA=D4956B
SAND=C2A878
FOREST=6B8E6B
CREAM=E8D5B0
GRAY=9E8E7A

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: organic shapes
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!leaf-brown' \
  --prop preset=ellipse \
  --prop fill=$BROWN \
  --prop opacity=0.3 \
  --prop x=1.2cm --prop y=1cm --prop width=6cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!leaf-sage' \
  --prop preset=ellipse \
  --prop fill=$SAGE \
  --prop opacity=0.25 \
  --prop x=25cm --prop y=12cm --prop width=8cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stone-terra' \
  --prop preset=roundRect \
  --prop fill=$TERRA \
  --prop opacity=0.2 \
  --prop x=27cm --prop y=0.8cm --prop width=5cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stone-sand' \
  --prop preset=roundRect \
  --prop fill=$SAND \
  --prop opacity=0.3 \
  --prop x=0.8cm --prop y=13cm --prop width=7cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!seed-forest' \
  --prop preset=ellipse \
  --prop fill=$FOREST \
  --prop x=30cm --prop y=8cm --prop width=3cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!seed-cream' \
  --prop preset=ellipse \
  --prop fill=$CREAM \
  --prop opacity=0.5 \
  --prop x=3cm --prop y=8cm --prop width=2cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pebble-1' \
  --prop preset=ellipse \
  --prop fill=$BROWN \
  --prop opacity=0.4 \
  --prop x=15cm --prop y=16cm --prop width=1.5cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pebble-2' \
  --prop preset=ellipse \
  --prop fill=$SAGE \
  --prop opacity=0.35 \
  --prop x=22cm --prop y=1.5cm --prop width=1.8cm --prop height=1.5cm

# Hero text (visible)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-title' \
  --prop text="Sustainable Growth" \
  --prop font="Segoe UI" \
  --prop size=64 \
  --prop bold=true \
  --prop color=3C2415 \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=5cm --prop width=26cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-sub' \
  --prop text="Building a Better Tomorrow" \
  --prop font="Segoe UI Light" \
  --prop size=24 \
  --prop color=6B5B4A \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=9.5cm --prop width=26cm --prop height=2.5cm

# Pillar card elements (hidden)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-1-num' \
  --prop text="01" \
  --prop font="Segoe UI" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$TERRA \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=6cm --prop width=6.5cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-1-title' \
  --prop text="Reduce" \
  --prop font="Segoe UI" \
  --prop size=28 \
  --prop bold=true \
  --prop color=3C2415 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=9cm --prop width=6.5cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-1-desc' \
  --prop text="Minimize waste at every step of the supply chain" \
  --prop font="Segoe UI Light" \
  --prop size=16 \
  --prop color=6B5B4A \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=11.5cm --prop width=6.5cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-2-num' \
  --prop text="02" \
  --prop font="Segoe UI" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$SAGE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=6cm --prop width=6.5cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-2-title' \
  --prop text="Reuse" \
  --prop font="Segoe UI" \
  --prop size=28 \
  --prop bold=true \
  --prop color=3C2415 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=9cm --prop width=6.5cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-2-desc' \
  --prop text="Extend product lifecycles through circular design" \
  --prop font="Segoe UI Light" \
  --prop size=16 \
  --prop color=6B5B4A \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=11.5cm --prop width=6.5cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-3-num' \
  --prop text="03" \
  --prop font="Segoe UI" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$FOREST \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=6cm --prop width=6.5cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-3-title' \
  --prop text="Regenerate" \
  --prop font="Segoe UI" \
  --prop size=28 \
  --prop bold=true \
  --prop color=3C2415 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=9cm --prop width=6.5cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-3-desc' \
  --prop text="Restore ecosystems and build for the future" \
  --prop font="Segoe UI Light" \
  --prop size=16 \
  --prop color=6B5B4A \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=11.5cm --prop width=6.5cm --prop height=4cm

# Impact metrics (hidden)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-1-num' \
  --prop text="40%" \
  --prop font="Segoe UI" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$BROWN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=5cm --prop width=10cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-1-title' \
  --prop text="Less Waste" \
  --prop font="Segoe UI" \
  --prop size=24 \
  --prop color=3C2415 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=9cm --prop width=10cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-1-desc' \
  --prop text="Reduction in operational waste across all facilities" \
  --prop font="Segoe UI Light" \
  --prop size=14 \
  --prop color=6B5B4A \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=11cm --prop width=10cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-2-num' \
  --prop text="2M" \
  --prop font="Segoe UI" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$SAGE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=2.5cm --prop width=11cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-2-title' \
  --prop text="Trees Planted" \
  --prop font="Segoe UI" \
  --prop size=24 \
  --prop color=3C2415 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=6.5cm --prop width=11cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-2-desc' \
  --prop text="Reforestation efforts spanning three continents" \
  --prop font="Segoe UI Light" \
  --prop size=14 \
  --prop color=6B5B4A \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=8.5cm --prop width=11cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-3-num-1' \
  --prop text="Carbon" \
  --prop font="Segoe UI" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$FOREST \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=13cm --prop width=10cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-3-num-2' \
  --prop text="Neutral" \
  --prop font="Segoe UI" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$FOREST \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=15.5cm --prop width=10cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-3-desc' \
  --prop text="Certified carbon neutral since 2024" \
  --prop font="Segoe UI Light" \
  --prop size=14 \
  --prop color=6B5B4A \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=17.5cm --prop width=10cm --prop height=1.2cm

# CTA elements (hidden)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-title' \
  --prop text="Join Our Mission" \
  --prop font="Segoe UI" \
  --prop size=64 \
  --prop bold=true \
  --prop color=3C2415 \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=4.5cm --prop width=26cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-sub' \
  --prop text="Together, we can build a sustainable future" \
  --prop font="Segoe UI Light" \
  --prop size=24 \
  --prop color=6B5B4A \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=9.5cm --prop width=26cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-web' \
  --prop text="www.earthandsage.org" \
  --prop font="Segoe UI Light" \
  --prop size=18 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=13cm --prop width=26cm --prop height=2cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=24cm --prop y=10cm --prop width=7cm --prop height=5.5cm
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=2cm --prop y=2cm --prop width=9cm --prop height=7cm
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=1.2cm --prop y=14cm --prop width=6cm --prop height=4.5cm
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=28cm --prop y=1cm --prop width=5cm --prop height=4cm
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=14cm --prop y=15cm --prop width=3.5cm --prop height=3cm
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=30cm --prop y=6cm --prop width=2.5cm --prop height=2.5cm
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=20cm --prop y=2cm --prop width=1.8cm --prop height=1.4cm
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=10cm --prop y=16cm --prop width=2cm --prop height=1.6cm

# Update hero text to statement
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop text="Nature Knows Best" --prop size=72
officecli set "$OUTPUT" '/slide[2]/shape[10]' --prop text="Let the earth guide our innovation" --prop y=10.5cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[2]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move scene actors to create pillar card backgrounds
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop preset=roundRect --prop x=1.2cm --prop y=5cm --prop width=9.5cm --prop height=13cm --prop opacity=0.12
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop preset=roundRect --prop x=12.2cm --prop y=5cm --prop width=9.5cm --prop height=13cm --prop opacity=0.12
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop preset=roundRect --prop x=23.2cm --prop y=5cm --prop width=9.5cm --prop height=13cm --prop opacity=0.12
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=${OFFSCREEN} --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop x=${OFFSCREEN} --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=${OFFSCREEN} --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[7]' --prop x=${OFFSCREEN} --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[8]' --prop x=${OFFSCREEN} --prop width=0.1cm --prop height=0.1cm

# Update hero to section title
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop text="Three Pillars of Change" --prop size=40 --prop align=left --prop x=1.2cm --prop y=1cm --prop width=26cm --prop height=3cm
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop text="Our framework for sustainable impact" --prop size=18 --prop align=left --prop x=1.2cm --prop y=3.2cm --prop width=20cm --prop height=1.5cm

# Show pillar 1 cards
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=2.8cm --prop y=6cm
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=2.8cm --prop y=9cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=2.8cm --prop y=11.5cm

# Show pillar 2 cards
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=13.8cm --prop y=6cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=13.8cm --prop y=9cm
officecli set "$OUTPUT" '/slide[3]/shape[16]' --prop x=13.8cm --prop y=11.5cm

# Show pillar 3 cards
officecli set "$OUTPUT" '/slide[3]/shape[17]' --prop x=24.8cm --prop y=6cm
officecli set "$OUTPUT" '/slide[3]/shape[18]' --prop x=24.8cm --prop y=9cm
officecli set "$OUTPUT" '/slide[3]/shape[19]' --prop x=24.8cm --prop y=11.5cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[3]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop preset=ellipse --prop x=1.2cm --prop y=2cm --prop width=14cm --prop height=12cm --prop opacity=0.4
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop preset=ellipse --prop x=18cm --prop y=1cm --prop width=15cm --prop height=10cm --prop opacity=0.35
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop preset=roundRect --prop x=20cm --prop y=12cm --prop width=12cm --prop height=6.5cm --prop opacity=0.25
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop x=30cm --prop y=16cm --prop width=3cm --prop height=2.5cm --prop opacity=0.2
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=1.2cm --prop y=15cm --prop width=2.5cm --prop height=2cm
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=5cm --prop y=16cm --prop width=1.5cm --prop height=1.5cm
officecli set "$OUTPUT" '/slide[4]/shape[7]' --prop x=16cm --prop y=0.8cm --prop width=1.2cm --prop height=1cm
officecli set "$OUTPUT" '/slide[4]/shape[8]' --prop x=8cm --prop y=15cm --prop width=1.5cm --prop height=1.2cm

# Update title to impact
officecli set "$OUTPUT" '/slide[4]/shape[9]' --prop text="Our Impact" --prop size=40 --prop x=1.2cm --prop y=0.8cm --prop width=14cm --prop height=2.5cm
officecli set "$OUTPUT" '/slide[4]/shape[10]' --prop text="Measurable results that matter" --prop size=16 --prop color=$GRAY --prop x=1.2cm --prop y=3cm --prop width=14cm --prop height=1.5cm

# Hide pillar cards
officecli set "$OUTPUT" '/slide[4]/shape[11]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[12]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[13]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[14]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[15]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[16]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[17]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[18]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[19]' --prop x=${OFFSCREEN}

# Show metrics
officecli set "$OUTPUT" '/slide[4]/shape[20]' --prop x=3cm --prop y=5cm
officecli set "$OUTPUT" '/slide[4]/shape[21]' --prop x=3cm --prop y=9cm
officecli set "$OUTPUT" '/slide[4]/shape[22]' --prop x=3cm --prop y=11cm
officecli set "$OUTPUT" '/slide[4]/shape[23]' --prop x=20cm --prop y=2.5cm
officecli set "$OUTPUT" '/slide[4]/shape[24]' --prop x=20cm --prop y=6.5cm
officecli set "$OUTPUT" '/slide[4]/shape[25]' --prop x=20cm --prop y=8.5cm
officecli set "$OUTPUT" '/slide[4]/shape[26]' --prop x=21cm --prop y=13cm
officecli set "$OUTPUT" '/slide[4]/shape[27]' --prop x=21cm --prop y=15.5cm
officecli set "$OUTPUT" '/slide[4]/shape[28]' --prop x=21cm --prop y=17.5cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[4]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop preset=ellipse --prop x=26cm --prop y=2cm --prop width=6cm --prop height=5cm --prop opacity=0.3
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop preset=ellipse --prop x=1.2cm --prop y=13cm --prop width=8cm --prop height=5.5cm --prop opacity=0.25
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop preset=roundRect --prop x=2cm --prop y=1cm --prop width=5cm --prop height=4cm --prop opacity=0.2
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop preset=roundRect --prop x=20cm --prop y=14cm --prop width=7cm --prop height=4.5cm --prop opacity=0.3
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop x=30cm --prop y=14cm --prop width=3cm --prop height=2.5cm
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=28cm --prop y=8cm --prop width=2cm --prop height=2cm
officecli set "$OUTPUT" '/slide[5]/shape[7]' --prop x=8cm --prop y=1cm --prop width=1.5cm --prop height=1.2cm
officecli set "$OUTPUT" '/slide[5]/shape[8]' --prop x=15cm --prop y=16cm --prop width=1.8cm --prop height=1.5cm

# Hide impact title and update hero to CTA
officecli set "$OUTPUT" '/slide[5]/shape[9]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[10]' --prop x=${OFFSCREEN}

# Hide metrics
officecli set "$OUTPUT" '/slide[5]/shape[20]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[21]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[22]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[23]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[24]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[25]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[26]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[27]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[28]' --prop x=${OFFSCREEN}

# Show CTA elements
officecli set "$OUTPUT" '/slide[5]/shape[29]' --prop x=4cm --prop y=4.5cm
officecli set "$OUTPUT" '/slide[5]/shape[30]' --prop x=4cm --prop y=9.5cm
officecli set "$OUTPUT" '/slide[5]/shape[31]' --prop x=4cm --prop y=13cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
