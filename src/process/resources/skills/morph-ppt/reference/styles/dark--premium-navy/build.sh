#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__premium_navy.pptx"

echo "Building: dark--premium-navy (Annual Strategy Review)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=0C1B33
GOLD=C9A84C
NAVY=1E3A5F
STEEL=8EACC1
WHITE=FFFFFF
NAVY2=2C4F7C
GRAY=5A7A9A

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: decorative elements
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bar-gold' \
  --prop fill=$GOLD \
  --prop x=7.9cm --prop y=11.5cm --prop width=18cm --prop height=0.08cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bar-navy' \
  --prop fill=$NAVY \
  --prop x=30cm --prop y=2.5cm --prop width=0.06cm --prop height=14cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!frame-gold' \
  --prop preset=roundRect \
  --prop fill=$GOLD \
  --prop opacity=0.15 \
  --prop x=24cm --prop y=1cm --prop width=8cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!frame-navy' \
  --prop preset=roundRect \
  --prop fill=$NAVY \
  --prop opacity=0.3 \
  --prop x=1.2cm --prop y=12cm --prop width=10cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!accent-gold' \
  --prop preset=ellipse \
  --prop fill=$GOLD \
  --prop opacity=0.2 \
  --prop x=28cm --prop y=14cm --prop width=3cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!accent-steel' \
  --prop preset=ellipse \
  --prop fill=$STEEL \
  --prop opacity=0.15 \
  --prop x=1.5cm --prop y=1cm --prop width=4cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-gold' \
  --prop preset=ellipse \
  --prop fill=$GOLD \
  --prop opacity=0.6 \
  --prop x=26cm --prop y=8cm --prop width=1.5cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-white' \
  --prop preset=ellipse \
  --prop fill=$WHITE \
  --prop opacity=0.3 \
  --prop x=5cm --prop y=15cm --prop width=1cm --prop height=1cm

# Slide 1 hero text (visible)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-title' \
  --prop text="Annual Strategy Review" \
  --prop font="Arial" \
  --prop size=60 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=4cm --prop width=26cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-sub' \
  --prop text="Excellence in Execution" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$GOLD \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=7.8cm --prop width=26cm --prop height=2cm

# Pillar card elements (hidden initially, shown on slide 3)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-1-num' \
  --prop text="01" \
  --prop font="Arial" \
  --prop size=48 \
  --prop color=$GOLD \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=6.2cm --prop width=4cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-1-title' \
  --prop text="Vision" \
  --prop font="Arial" \
  --prop size=22 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=8.8cm --prop width=6.5cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-1-desc' \
  --prop text="Setting the direction with bold ambition and strategic foresight" \
  --prop font="Arial" \
  --prop size=14 \
  --prop color=$STEEL \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10.8cm --prop width=6.5cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-2-num' \
  --prop text="02" \
  --prop font="Arial" \
  --prop size=48 \
  --prop color=$GOLD \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=6.2cm --prop width=4cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-2-title' \
  --prop text="Execution" \
  --prop font="Arial" \
  --prop size=22 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=8.8cm --prop width=6.5cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-2-desc' \
  --prop text="Delivering results through disciplined operational excellence" \
  --prop font="Arial" \
  --prop size=14 \
  --prop color=$STEEL \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10.8cm --prop width=6.5cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-3-num' \
  --prop text="03" \
  --prop font="Arial" \
  --prop size=48 \
  --prop color=$GOLD \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=6.2cm --prop width=4cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-3-title' \
  --prop text="Results" \
  --prop font="Arial" \
  --prop size=22 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=8.8cm --prop width=6.5cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!card-3-desc' \
  --prop text="Measuring impact with transparent metrics and accountability" \
  --prop font="Arial" \
  --prop size=14 \
  --prop color=$STEEL \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10.8cm --prop width=6.5cm --prop height=4cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=2cm --prop y=9.5cm --prop width=18cm
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=3cm --prop y=3cm --prop height=14cm
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=26cm --prop y=11cm --prop width=6cm --prop height=5cm
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=20cm --prop y=0.5cm --prop width=12cm --prop height=10cm
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=1cm --prop y=13cm
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=28cm --prop y=2cm
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=6cm --prop y=14cm
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=30cm --prop y=8cm

# Update hero text to statement
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop text="Leading Through Change" --prop size=54 --prop y=6cm --prop height=4cm
officecli set "$OUTPUT" '/slide[2]/shape[10]' --prop text="Navigating uncertainty with clarity and purpose" --prop size=20 --prop color=$STEEL --prop y=10.5cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[2]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=4cm --prop y=2.5cm --prop width=26cm
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=12.5cm --prop y=5cm --prop height=12cm
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop preset=roundRect --prop x=2cm --prop y=5.5cm --prop width=9cm --prop height=11cm --prop opacity=0.12
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop preset=roundRect --prop x=12.8cm --prop y=5.5cm --prop width=9cm --prop height=11cm --prop opacity=0.12
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop preset=roundRect --prop x=23.5cm --prop y=5.5cm --prop width=9cm --prop height=11cm --prop opacity=0.12 --prop fill=$NAVY2
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=30cm --prop y=1cm --prop width=2cm --prop height=2cm
officecli set "$OUTPUT" '/slide[3]/shape[7]' --prop x=1.2cm --prop y=2cm --prop width=1cm --prop height=1cm
officecli set "$OUTPUT" '/slide[3]/shape[8]' --prop x=16cm --prop y=2cm --prop width=0.6cm --prop height=0.6cm

# Update title
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop text="Our Three Pillars" --prop size=40 --prop align=left --prop x=2cm --prop y=0.8cm --prop width=20cm --prop height=2.5cm
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop text="" --prop x=${OFFSCREEN}

# Show pillar cards
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=3.2cm
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=3.2cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=3.2cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=14cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=14cm
officecli set "$OUTPUT" '/slide[3]/shape[16]' --prop x=14cm
officecli set "$OUTPUT" '/slide[3]/shape[17]' --prop x=24.8cm
officecli set "$OUTPUT" '/slide[3]/shape[18]' --prop x=24.8cm
officecli set "$OUTPUT" '/slide[3]/shape[19]' --prop x=24.8cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[3]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=1.2cm --prop y=17cm --prop width=32cm
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=22cm --prop y=1cm --prop height=17cm
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop preset=roundRect --prop x=1.2cm --prop y=3.5cm --prop width=13cm --prop height=12cm --prop opacity=0.45 --prop fill=$GOLD
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop preset=roundRect --prop x=15.5cm --prop y=3.5cm --prop width=8cm --prop height=8cm --prop opacity=0.35 --prop fill=$NAVY
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=28cm --prop y=12cm --prop width=4cm --prop height=4cm --prop opacity=0.25
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=25cm --prop y=4cm --prop width=3cm --prop height=3cm --prop opacity=0.15
officecli set "$OUTPUT" '/slide[4]/shape[7]' --prop x=30cm --prop y=2cm
officecli set "$OUTPUT" '/slide[4]/shape[8]' --prop x=24cm --prop y=16cm

# Update title to metrics
officecli set "$OUTPUT" '/slide[4]/shape[9]' --prop text="Performance Metrics" --prop size=36 --prop align=left --prop x=1.2cm --prop y=0.8cm --prop width=20cm --prop height=2.5cm
officecli set "$OUTPUT" '/slide[4]/shape[10]' --prop text="FY2025 Annual Results" --prop size=16 --prop color=$GRAY --prop align=left --prop x=1.2cm --prop y=2.8cm --prop width=12cm --prop height=1.2cm

# Show metrics (reuse card shapes)
officecli set "$OUTPUT" '/slide[4]/shape[11]' --prop text="$128M" --prop size=64 --prop x=2.4cm --prop y=5.5cm --prop width=10cm --prop height=3.5cm
officecli set "$OUTPUT" '/slide[4]/shape[12]' --prop text="Revenue" --prop size=24 --prop x=2.4cm --prop y=9cm --prop width=10cm --prop height=2cm
officecli set "$OUTPUT" '/slide[4]/shape[13]' --prop text="Year-over-year growth driven by strategic expansion" --prop size=14 --prop x=2.4cm --prop y=11cm --prop width=10cm --prop height=3cm
officecli set "$OUTPUT" '/slide[4]/shape[14]' --prop text="34%" --prop size=54 --prop x=16.5cm --prop y=5cm --prop width=6cm --prop height=3cm
officecli set "$OUTPUT" '/slide[4]/shape[15]' --prop text="Growth" --prop size=22 --prop x=16.5cm --prop y=8cm --prop width=6cm --prop height=1.8cm
officecli set "$OUTPUT" '/slide[4]/shape[16]' --prop text="Outpacing industry average by 2.1x" --prop size=14 --prop x=16.5cm --prop y=9.8cm --prop width=6cm --prop height=2cm
officecli set "$OUTPUT" '/slide[4]/shape[17]' --prop text="#1" --prop size=48 --prop x=25cm --prop y=5cm --prop width=6cm --prop height=3cm
officecli set "$OUTPUT" '/slide[4]/shape[18]' --prop text="Market Share" --prop size=20 --prop x=25cm --prop y=8cm --prop width=6cm --prop height=1.8cm
officecli set "$OUTPUT" '/slide[4]/shape[19]' --prop text="Leading position across all key segments" --prop size=14 --prop x=25cm --prop y=9.8cm --prop width=6cm --prop height=2cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[4]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=10cm --prop y=12.5cm --prop width=14cm
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=16.9cm --prop y=1cm --prop height=10cm
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop preset=roundRect --prop x=2cm --prop y=13cm --prop width=6cm --prop height=4cm --prop opacity=0.15 --prop fill=$GOLD
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop preset=roundRect --prop x=25cm --prop y=1cm --prop width=7cm --prop height=6cm --prop opacity=0.3 --prop fill=$NAVY
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop preset=ellipse --prop x=30cm --prop y=15cm --prop width=2.5cm --prop height=2.5cm --prop opacity=0.2 --prop fill=$GOLD
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=1cm --prop y=14cm --prop width=3cm --prop height=3cm --prop opacity=0.15
officecli set "$OUTPUT" '/slide[5]/shape[7]' --prop x=8cm --prop y=16cm
officecli set "$OUTPUT" '/slide[5]/shape[8]' --prop x=26cm --prop y=10cm

# Update to CTA text
officecli set "$OUTPUT" '/slide[5]/shape[9]' --prop text="The Road Ahead" --prop size=60 --prop align=center --prop x=4cm --prop y=4cm --prop width=26cm --prop height=3.5cm
officecli set "$OUTPUT" '/slide[5]/shape[10]' --prop text="Building the future, together" --prop size=22 --prop color=$GOLD --prop align=center --prop x=4cm --prop y=8cm --prop width=26cm --prop height=2cm

# Hide metrics
officecli set "$OUTPUT" '/slide[5]/shape[11]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[12]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[13]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[14]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[15]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[16]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[17]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[18]' --prop text="" --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[19]' --prop text="" --prop x=${OFFSCREEN}

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
