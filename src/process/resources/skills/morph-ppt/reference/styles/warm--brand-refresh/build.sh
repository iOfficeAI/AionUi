#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/warm__brand_refresh.pptx"

echo "Building: warm--brand-refresh (Brand Refresh 2025)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG_LIGHT=F5F0E8
BG_DARK=162040
NAVY=162040
BLUE=1A6BFF
ORANGE=F4713A
CYAN=00C9D4
GREEN=7EC8A0
PINK=E8749A
GRAY1=9A9080
GRAY2=6B6355
GRAY3=4A5A7A
GRAY4=7890B8

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG_LIGHT

# Scene actors: color blocks + photo placeholders
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop x=15.5cm --prop y=0cm --prop width=10cm --prop height=13cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$NAVY \
  --prop x=25.5cm --prop y=0cm --prop width=8.37cm --prop height=7cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLUE \
  --prop x=25.5cm --prop y=7cm --prop width=4cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$ORANGE \
  --prop x=29.5cm --prop y=7cm --prop width=4.37cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-d' \
  --prop fill=$CYAN \
  --prop x=15.5cm --prop y=13cm --prop width=5cm --prop height=6.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-e' \
  --prop fill=$GREEN \
  --prop x=20.5cm --prop y=13cm --prop width=5cm --prop height=6.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-f' \
  --prop fill=$PINK \
  --prop x=25.5cm --prop y=13cm --prop width=8.37cm --prop height=6.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.55cm --prop width=0.5cm --prop height=0.5cm

# Content: hero text
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-tag' \
  --prop text="BRAND REFRESH 2025" \
  --prop font="Arial" \
  --prop size=11 \
  --prop bold=true \
  --prop color=$GRAY1 \
  --prop fill=none \
  --prop x=1.6cm --prop y=7cm --prop width=13cm --prop height=0.7cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title' \
  --prop text="Your Brand, Redefined." \
  --prop font="Arial" \
  --prop size=52 \
  --prop bold=true \
  --prop color=$NAVY \
  --prop fill=none \
  --prop x=1.6cm --prop y=7.8cm --prop width=13cm --prop height=5.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-sub' \
  --prop text="A new visual language built for how the world sees you now." \
  --prop font="Arial" \
  --prop size=15 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=1.6cm --prop y=14cm --prop width=13cm --prop height=2.5cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG_DARK
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move scene actors
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop x=0cm --prop y=0cm --prop width=14cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$NAVY \
  --prop opacity=0.58 \
  --prop x=0cm --prop y=0cm --prop width=14cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLUE \
  --prop x=22cm --prop y=0cm --prop width=11.87cm --prop height=3.2cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$ORANGE \
  --prop x=22cm --prop y=3.2cm --prop width=11.87cm --prop height=3.2cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-d' \
  --prop fill=$CYAN \
  --prop x=22cm --prop y=6.4cm --prop width=11.87cm --prop height=3.2cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-e' \
  --prop fill=$GREEN \
  --prop x=22cm --prop y=9.6cm --prop width=11.87cm --prop height=3.2cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-f' \
  --prop fill=$PINK \
  --prop x=22cm --prop y=12.8cm --prop width=11.87cm --prop height=6.25cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.55cm --prop width=0.5cm --prop height=0.5cm

# Content: statement text
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-tag' \
  --prop text="" \
  --prop font="Arial" \
  --prop size=11 \
  --prop color=$GRAY3 \
  --prop fill=none \
  --prop x=15.2cm --prop y=5cm --prop width=4cm --prop height=0.7cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-title' \
  --prop text="Clarity beats complexity." \
  --prop font="Arial" \
  --prop size=46 \
  --prop bold=true \
  --prop color=$BG_LIGHT \
  --prop fill=none \
  --prop x=15.2cm --prop y=6cm --prop width=15.5cm --prop height=7cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-sub' \
  --prop text="The strongest brands say less — and mean more." \
  --prop font="Arial" \
  --prop size=16 \
  --prop color=$GRAY4 \
  --prop fill=none \
  --prop x=15.2cm --prop y=13.5cm --prop width=15cm --prop height=2.5cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG_LIGHT
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move scene actors - top bar with 3 image columns
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$NAVY \
  --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=2.4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop x=1.6cm --prop y=2.4cm --prop width=9.6cm --prop height=8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop x=12.4cm --prop y=2.4cm --prop width=9.6cm --prop height=8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-e' \
  --prop fill=888888 \
  --prop x=22.8cm --prop y=2.4cm --prop width=9.6cm --prop height=8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$NAVY \
  --prop opacity=0.42 \
  --prop x=1.6cm --prop y=2.4cm --prop width=9.6cm --prop height=8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$ORANGE \
  --prop opacity=0.38 \
  --prop x=12.4cm --prop y=2.4cm --prop width=9.6cm --prop height=8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-d' \
  --prop fill=$CYAN \
  --prop opacity=0.38 \
  --prop x=22.8cm --prop y=2.4cm --prop width=9.6cm --prop height=8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-f' \
  --prop fill=$PINK \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.55cm --prop width=0.5cm --prop height=0.5cm

# Content: pillars text
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-tag' \
  --prop text="THREE PILLARS" \
  --prop font="Arial" \
  --prop size=13 \
  --prop bold=true \
  --prop color=$BG_LIGHT \
  --prop fill=none \
  --prop x=1.6cm --prop y=0.5cm --prop width=20cm --prop height=1.4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-title' \
  --prop text="Identity                    Voice                    Experience" \
  --prop font="Arial" \
  --prop size=14 \
  --prop bold=true \
  --prop color=$NAVY \
  --prop fill=none \
  --prop x=1.6cm --prop y=11cm --prop width=31cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-sub' \
  --prop text="A system that speaks before words do." \
  --prop font="Arial" \
  --prop size=14 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=1.6cm --prop y=12.4cm --prop width=9.6cm --prop height=3.5cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG_LIGHT
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move scene actors - left image with wave overlays, right data panel
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$NAVY \
  --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=AAAAAA \
  --prop x=0cm --prop y=2cm --prop width=19cm --prop height=17.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$NAVY \
  --prop opacity=0.78 \
  --prop geometry="M 0,52 C 22,36 44,66 64,46 C 80,30 92,56 100,42 L 100,100 L 0,100 Z" \
  --prop x=0cm --prop y=2cm --prop width=19cm --prop height=17.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$BLUE \
  --prop opacity=0.72 \
  --prop geometry="M 0,63 C 22,48 44,76 65,57 C 82,44 93,65 100,53 L 100,100 L 0,100 Z" \
  --prop x=0cm --prop y=2cm --prop width=19cm --prop height=17.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-d' \
  --prop fill=$CYAN \
  --prop opacity=0.68 \
  --prop geometry="M 0,73 C 22,60 44,84 65,66 C 83,55 93,74 100,63 L 100,100 L 0,100 Z" \
  --prop x=0cm --prop y=2cm --prop width=19cm --prop height=17.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-e' \
  --prop fill=$GREEN \
  --prop opacity=0.65 \
  --prop geometry="M 0,82 C 24,70 46,90 66,75 C 83,65 93,82 100,72 L 100,100 L 0,100 Z" \
  --prop x=0cm --prop y=2cm --prop width=19cm --prop height=17.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-f' \
  --prop fill=$ORANGE \
  --prop opacity=0.68 \
  --prop geometry="M 0,90 C 24,80 46,96 66,84 C 83,76 93,90 100,82 L 100,100 L 0,100 Z" \
  --prop x=0cm --prop y=2cm --prop width=19cm --prop height=17.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.55cm --prop width=0.5cm --prop height=0.5cm

# Content: evidence data
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-tag' \
  --prop text="THE NUMBERS" \
  --prop font="Arial" \
  --prop size=13 \
  --prop bold=true \
  --prop color=$GRAY1 \
  --prop fill=none \
  --prop x=20.4cm --prop y=0.4cm --prop width=12cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-title' \
  --prop text="+47%" \
  --prop font="Arial" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$NAVY \
  --prop fill=none \
  --prop x=20.4cm --prop y=2.5cm --prop width=12cm --prop height=5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-sub' \
  --prop text="Brand recognition lift\n\n2.8x  Engagement rate\n\n89    Net Promoter Score" \
  --prop font="Arial" \
  --prop size=14 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=20.4cm --prop y=8cm --prop width=12cm --prop height=8cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG_DARK
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move scene actors - final scattered layout
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop x=21cm --prop y=0cm --prop width=9cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$NAVY \
  --prop opacity=0.75 \
  --prop x=21cm --prop y=0cm --prop width=4cm --prop height=5.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLUE \
  --prop x=21cm --prop y=5.5cm --prop width=2.4cm --prop height=4.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$ORANGE \
  --prop x=29.5cm --prop y=13.5cm --prop width=4.37cm --prop height=5.55cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-d' \
  --prop fill=$CYAN \
  --prop x=29.5cm --prop y=0cm --prop width=4.37cm --prop height=5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-e' \
  --prop fill=$GREEN \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.55cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-f' \
  --prop fill=$PINK \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.55cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=AAAAAA \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.55cm --prop width=0.5cm --prop height=0.5cm

# Content: CTA text
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-tag' \
  --prop text="BRAND STRATEGY" \
  --prop font="Arial" \
  --prop size=11 \
  --prop bold=true \
  --prop color=$GRAY3 \
  --prop fill=none \
  --prop x=1.6cm --prop y=5.5cm --prop width=14cm --prop height=0.7cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-title' \
  --prop text="Start the transformation." \
  --prop font="Arial" \
  --prop size=46 \
  --prop bold=true \
  --prop color=$BG_LIGHT \
  --prop fill=none \
  --prop x=1.6cm --prop y=6.4cm --prop width=17cm --prop height=6cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-sub' \
  --prop text="Let's build something that lasts." \
  --prop font="Arial" \
  --prop size=16 \
  --prop color=$GRAY4 \
  --prop fill=none \
  --prop x=1.6cm --prop y=13.2cm --prop width=16cm --prop height=2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-cta' \
  --prop text="Get in touch  ->" \
  --prop font="Arial" \
  --prop size=15 \
  --prop bold=true \
  --prop color=$BG_LIGHT \
  --prop fill=$ORANGE \
  --prop x=1.6cm --prop y=15.6cm --prop width=9cm --prop height=1.8cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
