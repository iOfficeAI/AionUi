#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/bw__swiss_bauhaus.pptx"

echo "Building: bw--swiss-bauhaus (Swiss/Bauhaus Design)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
RED=E63322
BLACK=1C1C1C
OFFWHITE=F5F5F5

# ============================================
# SLIDE 1 - COVER
# ============================================
echo "Building Slide 1: Cover..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$OFFWHITE

# Scene actors: color blocks
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$RED \
  --prop x=0cm --prop y=0cm --prop width=14cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLACK \
  --prop x=14cm --prop y=14cm --prop width=19.87cm --prop height=5.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$OFFWHITE \
  --prop x=16cm --prop y=0cm --prop width=8cm --prop height=8cm

# Scene actors: line and dots
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bar-1' \
  --prop fill=$BLACK \
  --prop x=14cm --prop y=8.3cm --prop width=19.87cm --prop height=0.4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-1' \
  --prop fill=$RED \
  --prop x=25cm --prop y=9.5cm --prop width=2.5cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-2' \
  --prop fill=$BLACK \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

# Scene actors: photo placeholders (hidden initially)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

# Content: slide 1 text
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-main' \
  --prop text="DESIGN\nTHINKING" \
  --prop font="Arial" \
  --prop size=64 \
  --prop bold=true \
  --prop color=FFFFFF \
  --prop fill=none \
  --prop x=1.6cm --prop y=3cm --prop width=10cm --prop height=8.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-sub' \
  --prop text="INNOVATION WORKSHOP 2025" \
  --prop font="Arial" \
  --prop size=12 \
  --prop color=$BLACK \
  --prop fill=none \
  --prop x=15cm --prop y=9cm --prop width=17cm --prop height=1.2cm

# ============================================
# SLIDE 2 - FIVE STAGES
# ============================================
echo "Building Slide 2: Five Stages..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BLACK
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Scene actors: color blocks (moved)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$RED \
  --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=5.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLACK \
  --prop x=0cm --prop y=5.5cm --prop width=33.87cm --prop height=13.55cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$RED \
  --prop x=27cm --prop y=5.5cm --prop width=6.87cm --prop height=6cm

# Scene actors: line and dots (moved)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!bar-1' \
  --prop fill=$OFFWHITE \
  --prop x=0cm --prop y=10.5cm --prop width=33.87cm --prop height=0.2cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!dot-1' \
  --prop fill=$OFFWHITE \
  --prop x=2cm --prop y=12cm --prop width=1.5cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!dot-2' \
  --prop fill=$RED \
  --prop x=5cm --prop y=11.8cm --prop width=2cm --prop height=2cm

# Scene actors: photos (photo-1 visible, photo-2 hidden)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop x=0cm --prop y=5.5cm --prop width=14cm --prop height=13.55cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

# Content: slide 2 text
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-main' \
  --prop text="5 STAGES" \
  --prop font="Arial" \
  --prop size=56 \
  --prop bold=true \
  --prop color=FFFFFF \
  --prop fill=none \
  --prop x=15cm --prop y=0.8cm --prop width=17cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-sub' \
  --prop text="Empathize — Define — Ideate — Prototype — Test" \
  --prop font="Arial" \
  --prop size=14 \
  --prop color=CCCCCC \
  --prop fill=none \
  --prop x=15cm --prop y=11.5cm --prop width=17cm --prop height=1.5cm

# ============================================
# SLIDE 3 - INSIGHT
# ============================================
echo "Building Slide 3: Insight..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$OFFWHITE
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Scene actors: color blocks (moved)
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$RED \
  --prop x=0cm --prop y=7.3cm --prop width=33.87cm --prop height=2.2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLACK \
  --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=7.3cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$RED \
  --prop x=24cm --prop y=9.5cm --prop width=9.87cm --prop height=9.55cm

# Scene actors: line and dots (moved)
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!bar-1' \
  --prop fill=$RED \
  --prop x=0cm --prop y=7.1cm --prop width=33.87cm --prop height=0.2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!dot-1' \
  --prop fill=FFFFFF \
  --prop x=2cm --prop y=10cm --prop width=2cm --prop height=2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!dot-2' \
  --prop fill=$BLACK \
  --prop x=5cm --prop y=10cm --prop width=2cm --prop height=2cm

# Scene actors: photos (photo-1 moved, photo-2 hidden)
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop x=12cm --prop y=0cm --prop width=21.87cm --prop height=7.3cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

# Content: slide 3 text
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-main' \
  --prop text="THE INSIGHT" \
  --prop font="Arial" \
  --prop size=48 \
  --prop bold=true \
  --prop color=FFFFFF \
  --prop fill=none \
  --prop x=1.6cm --prop y=1.5cm --prop width=10cm --prop height=4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-sub' \
  --prop text="Users do not want features.\nThey want outcomes." \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$BLACK \
  --prop fill=none \
  --prop x=1.6cm --prop y=10.5cm --prop width=21cm --prop height=3cm

# ============================================
# SLIDE 4 - DATA
# ============================================
echo "Building Slide 4: Data..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BLACK
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Scene actors: color blocks (moved)
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$RED \
  --prop x=0cm --prop y=9cm --prop width=33.87cm --prop height=10.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLACK \
  --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=9cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$RED \
  --prop x=26cm --prop y=0cm --prop width=7.87cm --prop height=9cm

# Scene actors: line and dots (moved)
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!bar-1' \
  --prop fill=FFFFFF \
  --prop x=0cm --prop y=9cm --prop width=33.87cm --prop height=0.2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!dot-1' \
  --prop fill=FFFFFF \
  --prop x=2cm --prop y=0.5cm --prop width=3cm --prop height=3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!dot-2' \
  --prop fill=$BLACK \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

# Scene actors: photos (photo-1 moved, photo-2 hidden)
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop x=0cm --prop y=0cm --prop width=26cm --prop height=9cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

# Content: slide 4 text
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-main' \
  --prop text="87%" \
  --prop font="Arial" \
  --prop size=80 \
  --prop bold=true \
  --prop color=FFFFFF \
  --prop fill=none \
  --prop x=1.6cm --prop y=9.8cm --prop width=12cm --prop height=5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-sub' \
  --prop text="Of teams report breakthrough ideas\nemerge from diverse perspectives." \
  --prop font="Arial" \
  --prop size=15 \
  --prop color=FFFFFF \
  --prop fill=none \
  --prop x=15cm --prop y=10.5cm --prop width=17cm --prop height=3cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$RED
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Scene actors: color blocks (moved - full coverage)
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-a' \
  --prop fill=$RED \
  --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-b' \
  --prop fill=$BLACK \
  --prop x=0cm --prop y=12.5cm --prop width=33.87cm --prop height=6.55cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blk-c' \
  --prop fill=$OFFWHITE \
  --prop x=28cm --prop y=0cm --prop width=5.87cm --prop height=12.5cm

# Scene actors: line and dots (moved)
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!bar-1' \
  --prop fill=FFFFFF \
  --prop x=0cm --prop y=12.5cm --prop width=33.87cm --prop height=0.3cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!dot-1' \
  --prop fill=FFFFFF \
  --prop x=1.6cm --prop y=13.5cm --prop width=2.5cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!dot-2' \
  --prop fill=$RED \
  --prop x=5.5cm --prop y=13.8cm --prop width=1.5cm --prop height=1.5cm

# Scene actors: photos (both hidden)
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!photo-1' \
  --prop fill=999999 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!photo-2' \
  --prop fill=666666 \
  --prop opacity=0.01 \
  --prop x=33cm --prop y=18.5cm --prop width=0.5cm --prop height=0.5cm

# Content: slide 5 text
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-main' \
  --prop text="START\nBUILDING." \
  --prop font="Arial" \
  --prop size=68 \
  --prop bold=true \
  --prop color=FFFFFF \
  --prop fill=none \
  --prop x=1.6cm --prop y=1.5cm --prop width=25cm --prop height=9.8cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-sub' \
  --prop text="workshop@company.com  |  Book your session" \
  --prop font="Arial" \
  --prop size=15 \
  --prop color=CCCCCC \
  --prop fill=none \
  --prop x=1.6cm --prop y=14cm --prop width=24cm --prop height=1.6cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
