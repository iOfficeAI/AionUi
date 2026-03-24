#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/vivid__candy_stripe.pptx"

echo "Building: vivid--candy-stripe (Rainbow Candy Stripes)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=FFFFFF
RED=FF5252
ORANGE=FF7B39
YELLOW=FFD740
GREEN=69F0AE
BLUE=40C4FF
PURPLE=7C4DFF
BLACK=1A1A1A
GRAY=555555

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: 6 rainbow stripes (evenly distributed)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stripe-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=0cm --prop width=34cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stripe-orange' \
  --prop preset=rect \
  --prop fill=$ORANGE \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=3.4cm --prop width=34cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stripe-yellow' \
  --prop preset=rect \
  --prop fill=$YELLOW \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=6.8cm --prop width=34cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stripe-green' \
  --prop preset=rect \
  --prop fill=$GREEN \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=10.2cm --prop width=34cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stripe-blue' \
  --prop preset=rect \
  --prop fill=$BLUE \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=13.6cm --prop width=34cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stripe-purple' \
  --prop preset=rect \
  --prop fill=$PURPLE \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=17cm --prop width=34cm --prop height=2cm

# Content: hero text
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title' \
  --prop text="Color Your World" \
  --prop font="Segoe UI Black" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=5.5cm --prop width=28cm --prop height=4.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle' \
  --prop text="Creative Festival 2026" \
  --prop font="Segoe UI" \
  --prop size=28 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=10.5cm --prop width=28cm --prop height=2.5cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Compress all stripes to top (thin header bar)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!stripe-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop opacity=1 \
  --prop x=0cm --prop y=0cm --prop width=34cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!stripe-orange' \
  --prop preset=rect \
  --prop fill=$ORANGE \
  --prop opacity=1 \
  --prop x=0cm --prop y=0.5cm --prop width=34cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!stripe-yellow' \
  --prop preset=rect \
  --prop fill=$YELLOW \
  --prop opacity=1 \
  --prop x=0cm --prop y=1cm --prop width=34cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!stripe-green' \
  --prop preset=rect \
  --prop fill=$GREEN \
  --prop opacity=1 \
  --prop x=0cm --prop y=1.5cm --prop width=34cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!stripe-blue' \
  --prop preset=rect \
  --prop fill=$BLUE \
  --prop opacity=1 \
  --prop x=0cm --prop y=2cm --prop width=34cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!stripe-purple' \
  --prop preset=rect \
  --prop fill=$PURPLE \
  --prop opacity=1 \
  --prop x=0cm --prop y=2.5cm --prop width=34cm --prop height=0.5cm

# Content
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-statement' \
  --prop text="6 Days of Inspiration" \
  --prop font="Segoe UI Black" \
  --prop size=54 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=7cm --prop width=28cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-desc' \
  --prop text="Join artists, designers, and creators from around the world\nto celebrate the power of color and imagination." \
  --prop font="Segoe UI" \
  --prop size=20 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=11.5cm --prop width=28cm --prop height=3cm

# ============================================
# SLIDE 3 - PILLARS (3 columns)
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Stripes become card backgrounds (paired: red+orange, yellow+green, blue+purple)
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!stripe-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop opacity=0.12 \
  --prop x=2cm --prop y=5cm --prop width=9cm --prop height=10cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!stripe-orange' \
  --prop preset=rect \
  --prop fill=$ORANGE \
  --prop opacity=0.12 \
  --prop x=2cm --prop y=5cm --prop width=9cm --prop height=10cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!stripe-yellow' \
  --prop preset=rect \
  --prop fill=$YELLOW \
  --prop opacity=0.12 \
  --prop x=12.5cm --prop y=5cm --prop width=9cm --prop height=10cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!stripe-green' \
  --prop preset=rect \
  --prop fill=$GREEN \
  --prop opacity=0.12 \
  --prop x=12.5cm --prop y=5cm --prop width=9cm --prop height=10cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!stripe-blue' \
  --prop preset=rect \
  --prop fill=$BLUE \
  --prop opacity=0.12 \
  --prop x=23cm --prop y=5cm --prop width=9cm --prop height=10cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!stripe-purple' \
  --prop preset=rect \
  --prop fill=$PURPLE \
  --prop opacity=0.12 \
  --prop x=23cm --prop y=5cm --prop width=9cm --prop height=10cm

# Content: title
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-title' \
  --prop text="Three Themes" \
  --prop font="Segoe UI Black" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=1.5cm --prop width=28cm --prop height=2.5cm

# Column 1
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col1-num' \
  --prop text="01" \
  --prop font="Segoe UI Black" \
  --prop size=40 \
  --prop bold=true \
  --prop color=$RED \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=6cm --prop width=7cm --prop height=2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col1-title' \
  --prop text="Color Theory" \
  --prop font="Segoe UI Black" \
  --prop size=24 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=8.5cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col1-desc' \
  --prop text="Understanding harmony, contrast, and emotional impact of color combinations." \
  --prop font="Segoe UI" \
  --prop size=16 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=10.5cm --prop width=7cm --prop height=3cm

# Column 2
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col2-num' \
  --prop text="02" \
  --prop font="Segoe UI Black" \
  --prop size=40 \
  --prop bold=true \
  --prop color=$YELLOW \
  --prop align=center \
  --prop fill=none \
  --prop x=13.5cm --prop y=6cm --prop width=7cm --prop height=2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col2-title' \
  --prop text="Digital Art" \
  --prop font="Segoe UI Black" \
  --prop size=24 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=13.5cm --prop y=8.5cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col2-desc' \
  --prop text="Exploring vibrant palettes in modern digital design and illustration." \
  --prop font="Segoe UI" \
  --prop size=16 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=13.5cm --prop y=10.5cm --prop width=7cm --prop height=3cm

# Column 3
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col3-num' \
  --prop text="03" \
  --prop font="Segoe UI Black" \
  --prop size=40 \
  --prop bold=true \
  --prop color=$BLUE \
  --prop align=center \
  --prop fill=none \
  --prop x=24cm --prop y=6cm --prop width=7cm --prop height=2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col3-title' \
  --prop text="Brand Identity" \
  --prop font="Segoe UI Black" \
  --prop size=24 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=24cm --prop y=8.5cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-col3-desc' \
  --prop text="Creating memorable brands through strategic color selection." \
  --prop font="Segoe UI" \
  --prop size=16 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=24cm --prop y=10.5cm --prop width=7cm --prop height=3cm

# ============================================
# SLIDE 4 - EVIDENCE (data with blue background)
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Blue stripe expands as large background, others retreat to edges
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!stripe-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop opacity=1 \
  --prop x=0cm --prop y=0cm --prop width=34cm --prop height=0.3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!stripe-orange' \
  --prop preset=rect \
  --prop fill=$ORANGE \
  --prop opacity=1 \
  --prop x=0cm --prop y=0.3cm --prop width=34cm --prop height=0.3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!stripe-yellow' \
  --prop preset=rect \
  --prop fill=$YELLOW \
  --prop opacity=1 \
  --prop x=0cm --prop y=0.6cm --prop width=34cm --prop height=0.3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!stripe-green' \
  --prop preset=rect \
  --prop fill=$GREEN \
  --prop opacity=0.3 \
  --prop x=0cm --prop y=5cm --prop width=34cm --prop height=8cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!stripe-blue' \
  --prop preset=rect \
  --prop fill=$BLUE \
  --prop opacity=0.3 \
  --prop x=0cm --prop y=5cm --prop width=34cm --prop height=8cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!stripe-purple' \
  --prop preset=rect \
  --prop fill=$PURPLE \
  --prop opacity=1 \
  --prop x=0cm --prop y=18.5cm --prop width=34cm --prop height=0.3cm

# Content
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-title' \
  --prop text="By The Numbers" \
  --prop font="Segoe UI Black" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=1.5cm --prop width=28cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-num' \
  --prop text="12,000+" \
  --prop font="Segoe UI Black" \
  --prop size=72 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=7cm --prop width=28cm --prop height=4cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-label' \
  --prop text="Creative Professionals Expected to Attend" \
  --prop font="Segoe UI" \
  --prop size=24 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=12cm --prop width=28cm --prop height=2cm

# ============================================
# SLIDE 5 - CTA (bottom rainbow footer)
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# All stripes gather at bottom (inverted rainbow footer)
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!stripe-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=12cm --prop width=34cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!stripe-orange' \
  --prop preset=rect \
  --prop fill=$ORANGE \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=13.2cm --prop width=34cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!stripe-yellow' \
  --prop preset=rect \
  --prop fill=$YELLOW \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=14.4cm --prop width=34cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!stripe-green' \
  --prop preset=rect \
  --prop fill=$GREEN \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=15.6cm --prop width=34cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!stripe-blue' \
  --prop preset=rect \
  --prop fill=$BLUE \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=16.8cm --prop width=34cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!stripe-purple' \
  --prop preset=rect \
  --prop fill=$PURPLE \
  --prop opacity=0.85 \
  --prop x=0cm --prop y=18cm --prop width=34cm --prop height=1.05cm

# Content
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-title' \
  --prop text="Join Us This Summer" \
  --prop font="Segoe UI Black" \
  --prop size=54 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=3cm --prop width=28cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-date' \
  --prop text="June 15-20, 2026" \
  --prop font="Segoe UI" \
  --prop size=28 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=7.5cm --prop width=28cm --prop height=2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-web' \
  --prop text="creativefestival.com" \
  --prop font="Segoe UI" \
  --prop size=24 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=10cm --prop width=28cm --prop height=1.5cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
