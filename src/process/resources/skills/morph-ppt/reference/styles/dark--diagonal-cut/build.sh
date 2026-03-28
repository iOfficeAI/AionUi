#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__diagonal_cut.pptx"

echo "Building: dark--diagonal-cut (Industrial Design)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=1A1A1A
ORANGE=FF6600
YELLOW=FFCC00
WHITE=FFFFFF
GRAY=333333
LIGHT_GRAY=CCCCCC

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: diagonal slashes
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!slash-orange' \
  --prop preset=rect \
  --prop fill=$ORANGE \
  --prop opacity=0.9 \
  --prop x=0cm --prop y=2cm --prop width=30cm --prop height=6cm --prop rotation=35

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!slash-white' \
  --prop preset=rect \
  --prop fill=$WHITE \
  --prop opacity=0.15 \
  --prop x=5cm --prop y=8cm --prop width=25cm --prop height=4cm --prop rotation=-30

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!slash-yellow' \
  --prop preset=rect \
  --prop fill=$YELLOW \
  --prop opacity=0.85 \
  --prop x=18cm --prop y=12cm --prop width=20cm --prop height=3cm --prop rotation=40

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!slash-gray' \
  --prop preset=rect \
  --prop fill=$GRAY \
  --prop opacity=0.7 \
  --prop x=0cm --prop y=10cm --prop width=28cm --prop height=5cm --prop rotation=-35

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cut-line-1' \
  --prop preset=rect \
  --prop fill=$ORANGE \
  --prop opacity=1.0 \
  --prop x=0cm --prop y=6cm --prop width=34cm --prop height=0.15cm --prop rotation=30

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cut-line-2' \
  --prop preset=rect \
  --prop fill=$WHITE \
  --prop opacity=0.3 \
  --prop x=2cm --prop y=14cm --prop width=34cm --prop height=0.1cm --prop rotation=-25

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-orange' \
  --prop preset=ellipse \
  --prop fill=$ORANGE \
  --prop opacity=0.9 \
  --prop x=29cm --prop y=1cm --prop width=3cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-yellow' \
  --prop preset=ellipse \
  --prop fill=$YELLOW \
  --prop opacity=0.8 \
  --prop x=1.2cm --prop y=15cm --prop width=2cm --prop height=2cm

# Slide 1 content
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-hero-title' \
  --prop text='CUT THROUGH' \
  --prop font='Segoe UI Black' \
  --prop size=72 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=2cm --prop y=4.5cm --prop width=26cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-hero-subtitle' \
  --prop text='Industrial Design Co.' \
  --prop font='Segoe UI' \
  --prop size=24 \
  --prop color=$LIGHT_GRAY \
  --prop fill=none \
  --prop x=2cm --prop y=10cm --prop width=20cm --prop height=2.5cm

# Pre-create all other slide text content (off-canvas)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-title' \
  --prop text='Precision Meets Power' \
  --prop font='Segoe UI Black' \
  --prop size=64 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5.5cm --prop width=28cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-subtitle' \
  --prop text='Where engineering excellence meets bold design' \
  --prop font='Segoe UI' \
  --prop size=20 \
  --prop color=$LIGHT_GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=11cm --prop width=24cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-pillar-title' \
  --prop text='What We Build' \
  --prop font='Segoe UI Black' \
  --prop size=40 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=0.8cm --prop width=20cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p1-num' \
  --prop text='01' \
  --prop font='Segoe UI Black' \
  --prop size=48 \
  --prop color=$ORANGE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5.5cm --prop width=8cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p1-title' \
  --prop text='Engineer' \
  --prop font='Segoe UI Black' \
  --prop size=28 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8cm --prop width=8cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p1-desc' \
  --prop text='Structural integrity through precision engineering' \
  --prop font='Segoe UI' \
  --prop size=14 \
  --prop color=$LIGHT_GRAY \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10cm --prop width=8cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p2-num' \
  --prop text='02' \
  --prop font='Segoe UI Black' \
  --prop size=48 \
  --prop color=$YELLOW \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5.5cm --prop width=8cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p2-title' \
  --prop text='Design' \
  --prop font='Segoe UI Black' \
  --prop size=28 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8cm --prop width=8cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p2-desc' \
  --prop text='Bold aesthetics that command attention' \
  --prop font='Segoe UI' \
  --prop size=14 \
  --prop color=$LIGHT_GRAY \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10cm --prop width=8cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p3-num' \
  --prop text='03' \
  --prop font='Segoe UI Black' \
  --prop size=48 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5.5cm --prop width=8cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p3-title' \
  --prop text='Deliver' \
  --prop font='Segoe UI Black' \
  --prop size=28 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8cm --prop width=8cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p3-desc' \
  --prop text='On time, on spec, every single build' \
  --prop font='Segoe UI' \
  --prop size=14 \
  --prop color=$LIGHT_GRAY \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10cm --prop width=8cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-evidence-title' \
  --prop text='Our Numbers' \
  --prop font='Segoe UI Black' \
  --prop size=40 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=1cm --prop width=16cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-ev1-num' \
  --prop text='500+' \
  --prop font='Segoe UI Black' \
  --prop size=64 \
  --prop color=$ORANGE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5cm --prop width=14cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-ev1-label' \
  --prop text='Units Manufactured' \
  --prop font='Segoe UI' \
  --prop size=20 \
  --prop color=$LIGHT_GRAY \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8.5cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-ev2-num' \
  --prop text='99.8%' \
  --prop font='Segoe UI Black' \
  --prop size=64 \
  --prop color=$YELLOW \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=3cm --prop width=14cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-ev2-label' \
  --prop text='Quality Control Pass Rate' \
  --prop font='Segoe UI' \
  --prop size=20 \
  --prop color=$LIGHT_GRAY \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6.5cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-ev3-num' \
  --prop text='24/7' \
  --prop font='Segoe UI Black' \
  --prop size=64 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=12cm --prop width=14cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-ev3-label' \
  --prop text='Operations Running' \
  --prop font='Segoe UI' \
  --prop size=20 \
  --prop color=$LIGHT_GRAY \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=15.5cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-cta-title' \
  --prop text='Build With Us' \
  --prop font='Segoe UI Black' \
  --prop size=72 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=4cm --prop width=28cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-cta-contact' \
  --prop text='contact@industrialdesign.co' \
  --prop font='Segoe UI' \
  --prop size=24 \
  --prop color=$ORANGE \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10cm --prop width=28cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-cta-tagline' \
  --prop text='Precision. Power. Performance.' \
  --prop font='Segoe UI' \
  --prop size=18 \
  --prop color=$LIGHT_GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=12.5cm --prop width=28cm --prop height=2cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Morph scene actors - dramatic shift
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=8cm --prop y=0cm --prop rotation=55
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=0cm --prop y=5cm --prop rotation=-5
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=22cm --prop y=14cm --prop rotation=15
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=10cm --prop y=0cm --prop rotation=-60
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=0cm --prop y=12cm --prop rotation=55
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=6cm --prop y=2cm --prop rotation=-50
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=2cm --prop y=14cm
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=30cm --prop y=2cm

# Hide slide 1 content, show slide 2 content
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[2]/shape[10]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[2]/shape[11]' --prop x=3cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[2]/shape[12]' --prop x=5cm --prop y=11cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Morph scene actors - become vertical dividers
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=9cm --prop y=0cm --prop width=3cm --prop height=24cm --prop rotation=8 --prop opacity=0.12
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=20.5cm --prop y=0cm --prop width=3cm --prop height=24cm --prop rotation=-8 --prop opacity=0.08
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop x=0cm --prop y=0cm --prop width=0.4cm --prop height=19.05cm --prop rotation=0 --prop opacity=0.7
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=0cm --prop y=17cm --prop width=33.87cm --prop height=2.5cm --prop rotation=-3 --prop opacity=0.5
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop x=0cm --prop y=4.5cm --prop width=33.87cm --prop rotation=2 --prop opacity=0.8
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=0cm --prop y=16cm --prop width=33.87cm --prop rotation=-1 --prop opacity=0.2
officecli set "$OUTPUT" '/slide[3]/shape[7]' --prop x=31cm --prop y=0.8cm --prop width=2cm --prop height=2cm
officecli set "$OUTPUT" '/slide[3]/shape[8]' --prop x=16cm --prop y=16.5cm --prop width=1.5cm --prop height=1.5cm --prop opacity=0.7

# Hide previous content, show slide 3 content
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=1.2cm --prop y=0.8cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=1.2cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=1.2cm --prop y=8cm
officecli set "$OUTPUT" '/slide[3]/shape[16]' --prop x=1.2cm --prop y=10cm
officecli set "$OUTPUT" '/slide[3]/shape[17]' --prop x=12.4cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[3]/shape[18]' --prop x=12.4cm --prop y=8cm
officecli set "$OUTPUT" '/slide[3]/shape[19]' --prop x=12.4cm --prop y=10cm
officecli set "$OUTPUT" '/slide[3]/shape[20]' --prop x=23.6cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[3]/shape[21]' --prop x=23.6cm --prop y=8cm
officecli set "$OUTPUT" '/slide[3]/shape[22]' --prop x=23.6cm --prop y=10cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Morph scene actors - asymmetric frame
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=0cm --prop y=0cm --prop rotation=-40 --prop opacity=0.5
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=16cm --prop y=6cm --prop rotation=45 --prop opacity=0.1
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop x=20cm --prop y=2cm --prop rotation=-25 --prop opacity=0.45
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop x=0cm --prop y=14cm --prop rotation=20 --prop opacity=0.6
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=2cm --prop y=0cm --prop rotation=-35
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=0cm --prop y=8cm --prop rotation=40
officecli set "$OUTPUT" '/slide[4]/shape[7]' --prop x=14cm --prop y=1cm --prop width=3.5cm --prop height=3.5cm --prop opacity=0.8
officecli set "$OUTPUT" '/slide[4]/shape[8]' --prop x=28cm --prop y=15cm --prop width=2.5cm --prop height=2.5cm --prop opacity=0.7

# Hide previous content, show slide 4 content
officecli set "$OUTPUT" '/slide[4]/shape[9]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[10]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[11]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[12]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[13]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[14]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[15]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[16]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[17]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[18]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[19]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[20]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[21]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[22]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[23]' --prop x=1.2cm --prop y=1cm
officecli set "$OUTPUT" '/slide[4]/shape[24]' --prop x=1.2cm --prop y=5cm
officecli set "$OUTPUT" '/slide[4]/shape[25]' --prop x=1.2cm --prop y=8.5cm
officecli set "$OUTPUT" '/slide[4]/shape[26]' --prop x=19cm --prop y=3cm
officecli set "$OUTPUT" '/slide[4]/shape[27]' --prop x=19cm --prop y=6.5cm
officecli set "$OUTPUT" '/slide[4]/shape[28]' --prop x=8cm --prop y=12cm
officecli set "$OUTPUT" '/slide[4]/shape[29]' --prop x=8cm --prop y=15.5cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Morph scene actors - return to bold pattern
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=4cm --prop y=6cm --prop rotation=-35 --prop opacity=0.9
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=0cm --prop y=12cm --prop rotation=30 --prop opacity=0.15
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop x=0cm --prop y=0cm --prop rotation=-40 --prop opacity=0.85
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop x=12cm --prop y=4cm --prop rotation=35 --prop opacity=0.7
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop x=0cm --prop y=3cm --prop rotation=-30
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=0cm --prop y=16cm --prop rotation=25
officecli set "$OUTPUT" '/slide[5]/shape[7]' --prop x=1cm --prop y=2cm --prop width=3cm --prop height=3cm --prop opacity=0.9
officecli set "$OUTPUT" '/slide[5]/shape[8]' --prop x=30cm --prop y=14cm --prop opacity=0.8

# Hide previous content, show slide 5 content
officecli set "$OUTPUT" '/slide[5]/shape[9]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[10]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[11]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[12]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[13]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[14]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[15]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[16]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[17]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[18]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[19]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[20]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[21]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[22]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[23]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[24]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[25]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[26]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[27]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[28]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[29]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[30]' --prop x=3cm --prop y=4cm
officecli set "$OUTPUT" '/slide[5]/shape[31]' --prop x=3cm --prop y=10cm
officecli set "$OUTPUT" '/slide[5]/shape[32]' --prop x=3cm --prop y=12.5cm

# ============================================
# VALIDATE & COMPLETE
# ============================================
echo "Validating..."
python3 "$(dirname "$0")/../../morph-helpers.py" final-check "$OUTPUT"

echo "✅ Build complete: $OUTPUT"
