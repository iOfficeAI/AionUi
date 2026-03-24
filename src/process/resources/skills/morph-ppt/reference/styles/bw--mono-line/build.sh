#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/bw__mono_line.pptx"

echo "Building: bw--mono-line (Minimalist Lines)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=FFFFFF
BLACK=1A1A1A
GRAY=C8C8C8

# Off-canvas position for hidden elements
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: lines
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!line-h-top' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=0cm --prop y=1.5cm --prop width=20cm --prop height=0.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!line-h-mid' \
  --prop preset=rect \
  --prop fill=$GRAY \
  --prop x=10cm --prop y=13cm --prop width=15cm --prop height=0.03cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!line-v-left' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=2cm --prop y=0cm --prop width=0.05cm --prop height=12cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!line-v-right' \
  --prop preset=rect \
  --prop fill=$GRAY \
  --prop x=30cm --prop y=11cm --prop width=0.03cm --prop height=8cm

# Scene actors: dots
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-accent-1' \
  --prop preset=ellipse \
  --prop fill=$BLACK \
  --prop x=28cm --prop y=15cm --prop width=1cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-accent-2' \
  --prop preset=ellipse \
  --prop fill=$GRAY \
  --prop x=31cm --prop y=16cm --prop width=0.8cm --prop height=0.8cm

# Scene actors: all text elements (visible on slide 1, hidden on other slides initially)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-title' \
  --prop text="Your Presentation Title" \
  --prop font="Segoe UI Light" \
  --prop size=54 \
  --prop color=$BLACK \
  --prop x=4cm --prop y=5cm --prop width=26cm --prop height=4cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-subtitle' \
  --prop text="Subtitle goes here" \
  --prop font="Segoe UI" \
  --prop size=20 \
  --prop color=$GRAY \
  --prop x=4cm --prop y=9.5cm --prop width=20cm --prop height=2cm --prop fill=none

officecli set "$OUTPUT" '/slide[1]/shape[7]/paragraph[1]' --prop align=l
officecli set "$OUTPUT" '/slide[1]/shape[8]/paragraph[1]' --prop align=l

# Pre-create text elements for later slides (hidden off-canvas)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!statement-text' \
  --prop text="The Big Idea" \
  --prop font="Segoe UI Light" \
  --prop size=64 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=2cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-1-num' \
  --prop text="01" \
  --prop font="Segoe UI Light" \
  --prop size=40 \
  --prop color=$GRAY \
  --prop x=${OFFSCREEN} --prop y=10cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-1-title' \
  --prop text="Strategy" \
  --prop font="Segoe UI Light" \
  --prop size=28 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=17cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-2-num' \
  --prop text="02" \
  --prop font="Segoe UI Light" \
  --prop size=40 \
  --prop color=$GRAY \
  --prop x=${OFFSCREEN} --prop y=4cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-2-title' \
  --prop text="Design" \
  --prop font="Segoe UI Light" \
  --prop size=28 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=12cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-3-num' \
  --prop text="03" \
  --prop font="Segoe UI Light" \
  --prop size=40 \
  --prop color=$GRAY \
  --prop x=${OFFSCREEN} --prop y=20cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-3-title' \
  --prop text="Growth" \
  --prop font="Segoe UI Light" \
  --prop size=28 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=6cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-1-num' \
  --prop text="42%" \
  --prop font="Segoe UI Light" \
  --prop size=54 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=14cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-1-label' \
  --prop text="Efficiency Gain" \
  --prop font="Segoe UI" \
  --prop size=16 \
  --prop color=$GRAY \
  --prop x=${OFFSCREEN} --prop y=22cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-2-num' \
  --prop text="3.2x" \
  --prop font="Segoe UI Light" \
  --prop size=54 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=8cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-2-label' \
  --prop text="Growth Rate" \
  --prop font="Segoe UI" \
  --prop size=16 \
  --prop color=$GRAY \
  --prop x=${OFFSCREEN} --prop y=16cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-3-num' \
  --prop text="98%" \
  --prop font="Segoe UI Light" \
  --prop size=54 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=24cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!metric-3-label' \
  --prop text="Satisfaction" \
  --prop font="Segoe UI" \
  --prop size=16 \
  --prop color=$GRAY \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-text' \
  --prop text="Let's Connect" \
  --prop font="Segoe UI Light" \
  --prop size=54 \
  --prop color=$BLACK \
  --prop x=${OFFSCREEN} --prop y=18cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-sub' \
  --prop text="hello@company.com" \
  --prop font="Segoe UI" \
  --prop size=18 \
  --prop color=$GRAY \
  --prop x=${OFFSCREEN} --prop y=26cm --prop width=0.1cm --prop height=0.1cm --prop fill=none

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

# Clone slide 1
officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move lines to center intersection
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=7cm --prop y=9.5cm --prop width=20cm --prop height=0.05cm
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=5cm --prop y=9.5cm --prop width=24cm --prop height=0.03cm
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=16.5cm --prop y=3cm --prop width=0.05cm --prop height=13cm
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=17.5cm --prop y=4cm --prop width=0.03cm --prop height=11cm

# Move dots
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=3cm --prop y=9cm --prop width=1cm --prop height=1cm
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=4.5cm --prop y=10.5cm --prop width=0.8cm --prop height=0.8cm

# Hide slide 1 text (hero)
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=${OFFSCREEN} --prop y=2cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=${OFFSCREEN} --prop y=10cm --prop width=0.1cm --prop height=0.1cm

# Show statement text
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop x=4cm --prop y=5.5cm --prop width=26cm --prop height=5cm
officecli set "$OUTPUT" '/slide[2]/shape[9]/paragraph[1]' --prop align=center

# ============================================
# SLIDE 3 - THREE PILLARS
# ============================================
echo "Building Slide 3: Three Pillars..."

# Clone slide 2
officecli add "$OUTPUT" '/' --from '/slide[2]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move lines to create column dividers
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=1.2cm --prop y=1.2cm --prop width=31cm --prop height=0.05cm
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=1.2cm --prop y=4.5cm --prop width=31cm --prop height=0.03cm
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop x=11.5cm --prop y=5cm --prop width=0.05cm --prop height=12cm
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=22.5cm --prop y=5cm --prop width=0.03cm --prop height=12cm

# Move dots
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop x=5cm --prop y=2.8cm --prop width=1cm --prop height=1cm
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=16cm --prop y=2.8cm --prop width=0.8cm --prop height=0.8cm

# Hide statement text
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop x=${OFFSCREEN} --prop y=17cm --prop width=0.1cm --prop height=0.1cm

# Show three pillars
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop x=2cm --prop y=5.5cm --prop width=8cm --prop height=3cm
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=2cm --prop y=9cm --prop width=8cm --prop height=3cm
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=13cm --prop y=5.5cm --prop width=8cm --prop height=3cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=13cm --prop y=9cm --prop width=8cm --prop height=3cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=24cm --prop y=5.5cm --prop width=8cm --prop height=3cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=24cm --prop y=9cm --prop width=8cm --prop height=3cm

# ============================================
# SLIDE 4 - METRICS
# ============================================
echo "Building Slide 4: Metrics..."

# Clone slide 3
officecli add "$OUTPUT" '/' --from '/slide[3]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move lines
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=1.2cm --prop y=8cm --prop width=31cm --prop height=0.05cm
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=20cm --prop y=14cm --prop width=12cm --prop height=0.03cm
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop x=19cm --prop y=1cm --prop width=0.05cm --prop height=6cm
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop x=32cm --prop y=10cm --prop width=0.03cm --prop height=7cm

# Move dots
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=2cm --prop y=4cm --prop width=1cm --prop height=1cm
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=13cm --prop y=4cm --prop width=0.8cm --prop height=0.8cm

# Hide pillars
officecli set "$OUTPUT" '/slide[4]/shape[10]' --prop x=${OFFSCREEN} --prop y=6cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[11]' --prop x=${OFFSCREEN} --prop y=14cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[12]' --prop x=${OFFSCREEN} --prop y=22cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[13]' --prop x=${OFFSCREEN} --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[14]' --prop x=${OFFSCREEN} --prop y=8cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[15]' --prop x=${OFFSCREEN} --prop y=16cm --prop width=0.1cm --prop height=0.1cm

# Show metrics
officecli set "$OUTPUT" '/slide[4]/shape[16]' --prop x=3cm --prop y=2cm --prop width=14cm --prop height=5cm
officecli set "$OUTPUT" '/slide[4]/shape[17]' --prop x=3cm --prop y=6cm --prop width=14cm --prop height=2cm
officecli set "$OUTPUT" '/slide[4]/shape[18]' --prop x=3cm --prop y=9cm --prop width=14cm --prop height=5cm
officecli set "$OUTPUT" '/slide[4]/shape[19]' --prop x=3cm --prop y=13cm --prop width=14cm --prop height=2cm
officecli set "$OUTPUT" '/slide[4]/shape[20]' --prop x=20cm --prop y=2cm --prop width=12cm --prop height=5cm
officecli set "$OUTPUT" '/slide[4]/shape[21]' --prop x=20cm --prop y=6cm --prop width=12cm --prop height=2cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

# Clone slide 4
officecli add "$OUTPUT" '/' --from '/slide[4]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move lines to create border frame
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=0cm --prop y=0.8cm --prop width=33.87cm --prop height=0.05cm
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=0cm --prop y=18.2cm --prop width=33.87cm --prop height=0.03cm
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop x=1.2cm --prop y=0cm --prop width=0.05cm --prop height=19.05cm
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop x=32.6cm --prop y=0cm --prop width=0.03cm --prop height=19.05cm

# Move dots to center
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop x=16cm --prop y=13cm --prop width=1cm --prop height=1cm
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=17.5cm --prop y=13.5cm --prop width=0.8cm --prop height=0.8cm

# Hide metrics
officecli set "$OUTPUT" '/slide[5]/shape[16]' --prop x=${OFFSCREEN} --prop y=8cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[5]/shape[17]' --prop x=${OFFSCREEN} --prop y=16cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[5]/shape[18]' --prop x=${OFFSCREEN} --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[5]/shape[19]' --prop x=${OFFSCREEN} --prop y=24cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[5]/shape[20]' --prop x=${OFFSCREEN} --prop y=2cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[5]/shape[21]' --prop x=${OFFSCREEN} --prop y=10cm --prop width=0.1cm --prop height=0.1cm

# Show CTA
officecli set "$OUTPUT" '/slide[5]/shape[22]' --prop x=5cm --prop y=5cm --prop width=24cm --prop height=5cm
officecli set "$OUTPUT" '/slide[5]/shape[23]' --prop x=8cm --prop y=10.5cm --prop width=18cm --prop height=2cm
officecli set "$OUTPUT" '/slide[5]/shape[22]/paragraph[1]' --prop align=center
officecli set "$OUTPUT" '/slide[5]/shape[23]/paragraph[1]' --prop align=center

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
