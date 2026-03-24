#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/bw__brutalist_raw.pptx"

echo "Building: bw--brutalist-raw (Brutalist Design)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
WHITE=FFFFFF
BLACK=000000
RED=FF0000

# ============================================
# SLIDE 1 - HERO (反叛 / REVOLT)
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$WHITE

# Scene actors: geometric shapes with thick borders and violent positioning
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!border-box' \
  --prop preset=rect \
  --prop fill=$WHITE \
  --prop line=$BLACK \
  --prop lineWidth=3pt \
  --prop x=20cm --prop y=2cm --prop width=10cm --prop height=8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!block-solid' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=3cm --prop y=13cm --prop width=5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!accent-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=10cm --prop y=15cm --prop width=3cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!line-heavy' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=6cm --prop y=11cm --prop width=20cm --prop height=0.15cm

# Content: oversized titles
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title' \
  --prop text="反叛" \
  --prop font="Arial Black" \
  --prop size=120 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=2cm --prop y=3cm --prop width=15cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle' \
  --prop text="REVOLT" \
  --prop font="Arial Black" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=2cm --prop y=8.5cm --prop width=10cm --prop height=2cm

# ============================================
# SLIDE 2 - STATEMENT (ART IS NOT DECORATION)
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$WHITE
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Scene actors: violent position shifts (12cm+ moves)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!border-box' \
  --prop preset=rect \
  --prop fill=none \
  --prop line=$BLACK \
  --prop lineWidth=3pt \
  --prop x=4cm --prop y=8cm --prop width=12cm --prop height=9cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!block-solid' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=25cm --prop y=2cm --prop width=5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!accent-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=28cm --prop y=12cm --prop width=3cm --prop height=1cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!line-heavy' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=2cm --prop y=13cm --prop width=20cm --prop height=0.15cm

# Add diagonal line (new in slide 2)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!line-diag' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop rotation=35 \
  --prop x=18cm --prop y=8cm --prop width=15cm --prop height=0.08cm

# Content: large statement
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-statement' \
  --prop text="ART IS NOT\nDECORATION" \
  --prop font="Arial Black" \
  --prop size=96 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=2cm --prop y=2cm --prop width=25cm --prop height=10cm

# ============================================
# SLIDE 3 - PILLARS (三位参展艺术家)
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$WHITE
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Scene actors: structural frames
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!border-box' \
  --prop preset=rect \
  --prop fill=$WHITE \
  --prop line=$BLACK \
  --prop lineWidth=3pt \
  --prop x=2cm --prop y=5cm --prop width=8cm --prop height=10cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!block-solid' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=28cm --prop y=8cm --prop width=5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!accent-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=2cm --prop y=16cm --prop width=3cm --prop height=1cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!line-heavy' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=2cm --prop y=4.5cm --prop width=20cm --prop height=0.15cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!line-diag' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop rotation=0 \
  --prop x=25cm --prop y=2cm --prop width=15cm --prop height=0.08cm

# Content: title and artist list
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-title' \
  --prop text="三位参展艺术家" \
  --prop font="Arial Black" \
  --prop size=96 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=2cm --prop y=1.5cm --prop width=20cm --prop height=3cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-artist1' \
  --prop text="01 / 张伟 - 解构主义装置艺术" \
  --prop font="Courier New" \
  --prop size=24 \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=6cm --prop width=25cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-artist2' \
  --prop text="02 / 李娜 - 后现代影像创作" \
  --prop font="Courier New" \
  --prop size=24 \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=8.5cm --prop width=25cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-artist3' \
  --prop text="03 / 王强 - 激进行为艺术" \
  --prop font="Courier New" \
  --prop size=24 \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=11cm --prop width=25cm --prop height=1.5cm

# ============================================
# SLIDE 4 - EVIDENCE (首展反响 / Metrics)
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$WHITE
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Scene actors: asymmetric layout
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!border-box' \
  --prop preset=rect \
  --prop fill=none \
  --prop line=$BLACK \
  --prop lineWidth=3pt \
  --prop x=22cm --prop y=10cm --prop width=10cm --prop height=8cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!block-solid' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=2cm --prop y=15cm --prop width=5cm --prop height=3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!accent-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=15cm --prop y=10.5cm --prop width=1cm --prop height=3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!line-heavy' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=2cm --prop y=9.5cm --prop width=20cm --prop height=0.15cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!line-diag' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop rotation=145 \
  --prop x=20cm --prop y=1cm --prop width=15cm --prop height=0.08cm

# Content: title and metrics
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-title' \
  --prop text="首展反响" \
  --prop font="Arial Black" \
  --prop size=96 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=2cm --prop y=1.5cm --prop width=20cm --prop height=3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-metric1-num' \
  --prop text="3天" \
  --prop font="Courier New" \
  --prop size=72 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=6cm --prop width=10cm --prop height=2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-metric1-label' \
  --prop text="首展持续时间" \
  --prop font="Courier New" \
  --prop size=20 \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=8cm --prop width=15cm --prop height=1cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-metric2-num' \
  --prop text="1200+" \
  --prop font="Courier New" \
  --prop size=72 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=15cm --prop y=6cm --prop width=10cm --prop height=2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-metric2-label' \
  --prop text="观众人次" \
  --prop font="Courier New" \
  --prop size=20 \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=15cm --prop y=8cm --prop width=15cm --prop height=1cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-metric3-num' \
  --prop text="50+" \
  --prop font="Courier New" \
  --prop size=72 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=11cm --prop width=10cm --prop height=2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-metric3-label' \
  --prop text="媒体报道" \
  --prop font="Courier New" \
  --prop size=20 \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=13cm --prop width=15cm --prop height=1cm

# ============================================
# SLIDE 5 - CTA (展览持续至 4月30日)
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$WHITE
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Scene actors: scattered edges with dramatic final positions
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!border-box' \
  --prop preset=rect \
  --prop fill=$WHITE \
  --prop line=$BLACK \
  --prop lineWidth=3pt \
  --prop x=22cm --prop y=3cm --prop width=9cm --prop height=10cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!block-solid' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=2cm --prop y=1cm --prop width=5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!accent-red' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=30cm --prop y=17cm --prop width=3cm --prop height=1cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!line-heavy' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop x=3cm --prop y=12cm --prop width=20cm --prop height=0.15cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!line-diag' \
  --prop preset=rect \
  --prop fill=$BLACK \
  --prop rotation=35 \
  --prop x=10cm --prop y=2cm --prop width=15cm --prop height=0.08cm

# Content: CTA message
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-title' \
  --prop text="展览持续至\n4月30日" \
  --prop font="Arial Black" \
  --prop size=96 \
  --prop bold=true \
  --prop color=$BLACK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=4cm --prop width=25cm --prop height=8cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-details' \
  --prop text="地点: 798艺术区 A12展厅\n时间: 10:00-20:00 (周二闭馆)\n门票: 免费" \
  --prop font="Courier New" \
  --prop size=20 \
  --prop color=$BLACK \
  --prop align=left \
  --prop lineSpacing=1.6 \
  --prop fill=none \
  --prop x=3cm --prop y=13cm --prop width=20cm --prop height=4cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
