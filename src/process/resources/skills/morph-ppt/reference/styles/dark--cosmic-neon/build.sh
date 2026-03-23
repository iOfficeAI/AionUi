#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__cosmic_neon.pptx"

echo "Building: dark--cosmic-neon (Cosmic Neon Sci-Fi)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=050510
PURPLE=8A2BE2
CYAN=00FFFF
CARD=111122
WHITE=FFFFFF
GRAY1=AAAAAA
GRAY2=CCCCCC

# Off-canvas position for hidden elements
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: neon glows
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bg-glow1' \
  --prop preset=ellipse \
  --prop fill=$PURPLE \
  --prop opacity=0.15 \
  --prop x=0cm --prop y=0cm --prop width=15cm --prop height=15cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bg-glow2' \
  --prop preset=ellipse \
  --prop fill=$CYAN \
  --prop opacity=0.15 \
  --prop x=18cm --prop y=4cm --prop width=15cm --prop height=15cm

# Scene actors: decorative elements
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ring' \
  --prop preset=donut \
  --prop fill=none \
  --prop line=$CYAN \
  --prop lineWidth=2 \
  --prop x=25cm --prop y=2cm --prop width=5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!line-top' \
  --prop preset=rect \
  --prop fill=$PURPLE \
  --prop x=4cm --prop y=2cm --prop width=8cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!star1' \
  --prop preset=star5 \
  --prop fill=$CYAN \
  --prop opacity=0.5 \
  --prop x=3cm --prop y=15cm --prop width=1cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!star2' \
  --prop preset=star5 \
  --prop fill=$PURPLE \
  --prop opacity=0.5 \
  --prop x=30cm --prop y=12cm --prop width=1.5cm --prop height=1.5cm

# Content: hero title (visible on slide 1)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title' \
  --prop text="穿越时空：科学还是幻想？" \
  --prop font="Arial" \
  --prop size=56 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=7cm --prop width=26cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle' \
  --prop text="从爱因斯坦的相对论到现代量子物理的探索之旅" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$GRAY1 \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=10.5cm --prop width=26cm --prop height=2cm

# Pre-create hidden content for other slides
# Statement text (for slide 2)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!statement-text' \
  --prop text="时间并非绝对的流逝，\n而是一种可以被弯曲的维度。" \
  --prop font="Arial" \
  --prop size=44 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop lineSpacing=1.5 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=30cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!statement-sub' \
  --prop text="根据广义相对论，引力越强，时间流逝越慢。我们每个人都已经是时间旅行者，只不过只能以每秒一秒的速度走向未来。" \
  --prop font="Arial" \
  --prop size=20 \
  --prop color=$GRAY1 \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=1cm --prop width=26cm --prop height=4cm

# Pillar elements (for slide 3)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-title' \
  --prop text="物理学中的三种时间旅行可能" \
  --prop font="Arial" \
  --prop size=36 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=2cm --prop width=20cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-1-bg' \
  --prop preset=roundRect \
  --prop fill=$CARD \
  --prop opacity=0.6 \
  --prop x=${OFFSCREEN} --prop y=3cm --prop width=9cm --prop height=11cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-1-title' \
  --prop text="虫洞理论" \
  --prop font="Arial" \
  --prop size=28 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=4cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-1-desc' \
  --prop text="连接宇宙中两个遥远时空点的捷径，理论上可以实现瞬间跨越，如爱因斯坦-罗森桥。" \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$GRAY2 \
  --prop lineSpacing=1.3 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=5cm --prop width=7cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-2-bg' \
  --prop preset=roundRect \
  --prop fill=$CARD \
  --prop opacity=0.6 \
  --prop x=${OFFSCREEN} --prop y=6cm --prop width=9cm --prop height=11cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-2-title' \
  --prop text="光速飞行" \
  --prop font="Arial" \
  --prop size=28 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=7cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-2-desc' \
  --prop text="当物体运动速度接近光速时，自身时间会显著变慢，从而穿越到相对的未来（双生子佯谬）。" \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$GRAY2 \
  --prop lineSpacing=1.3 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=8cm --prop width=7cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-3-bg' \
  --prop preset=roundRect \
  --prop fill=$CARD \
  --prop opacity=0.6 \
  --prop x=${OFFSCREEN} --prop y=9cm --prop width=9cm --prop height=11cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-3-title' \
  --prop text="宇宙弦" \
  --prop font="Arial" \
  --prop size=28 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-3-desc' \
  --prop text="假设存在的高密度能量细丝，其强大的引力场可能导致时空闭合，形成时间循环。" \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$GRAY2 \
  --prop lineSpacing=1.3 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=11cm --prop width=7cm --prop height=6cm

# Evidence elements (for slide 4)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!evi-title' \
  --prop text="时间膨胀的真实观测数据" \
  --prop font="Arial" \
  --prop size=36 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=12cm --prop width=20cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!evi-data' \
  --prop text="38 微秒" \
  --prop font="Montserrat" \
  --prop size=80 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=13cm --prop width=12cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!evi-desc' \
  --prop text="GPS卫星每天必须调整38微秒的时钟误差。由于卫星在太空中受到的引力较小且运动速度快，其时间流逝速度与地面不同。如果不修正，GPS定位每天会产生10公里的误差。" \
  --prop font="Arial" \
  --prop size=22 \
  --prop color=$GRAY2 \
  --prop lineSpacing=1.5 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=14cm --prop width=15cm --prop height=8cm

# CTA elements (for slide 5)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-title' \
  --prop text="未来，我们会在过去相遇吗？" \
  --prop font="Arial" \
  --prop size=52 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=15cm --prop width=26cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-sub' \
  --prop text="保持对宇宙的敬畏与好奇" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$CYAN \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=16cm --prop width=26cm --prop height=2cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=10cm --prop y=2cm --prop width=14cm --prop height=14cm
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=5cm --prop y=5cm --prop width=10cm --prop height=10cm
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=15cm --prop y=10cm --prop width=8cm --prop height=8cm
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=12cm --prop y=15cm --prop width=10cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=28cm --prop y=4cm
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=5cm --prop y=10cm

# Hide hero content
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=${OFFSCREEN} --prop y=1cm

# Show statement content
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop x=2cm --prop y=6cm
officecli set "$OUTPUT" '/slide[2]/shape[10]' --prop x=4cm --prop y=13cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[2]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=0cm --prop y=12cm --prop width=10cm --prop height=10cm
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=23cm --prop y=0cm --prop width=12cm --prop height=12cm
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop x=30cm --prop y=15cm --prop width=3cm --prop height=3cm
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=2cm --prop y=2cm --prop width=5cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop x=20cm --prop y=2cm
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=10cm --prop y=17cm

# Hide statement content
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop x=${OFFSCREEN} --prop y=1cm

# Show pillar content
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=2cm --prop y=1.5cm
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=2cm --prop y=5cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=3cm --prop y=6cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=3cm --prop y=8cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=12.5cm --prop y=5cm
officecli set "$OUTPUT" '/slide[3]/shape[16]' --prop x=13.5cm --prop y=6cm
officecli set "$OUTPUT" '/slide[3]/shape[17]' --prop x=13.5cm --prop y=8cm
officecli set "$OUTPUT" '/slide[3]/shape[18]' --prop x=23cm --prop y=5cm
officecli set "$OUTPUT" '/slide[3]/shape[19]' --prop x=24cm --prop y=6cm
officecli set "$OUTPUT" '/slide[3]/shape[20]' --prop x=24cm --prop y=8cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[3]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=2cm --prop y=4cm --prop width=12cm --prop height=12cm --prop fill=$CARD --prop opacity=0.6
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=16cm --prop y=5cm --prop width=16cm --prop height=10cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop x=5cm --prop y=5cm --prop width=6cm --prop height=6cm
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop x=15cm --prop y=8cm --prop width=15cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=30cm --prop y=3cm
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=8cm --prop y=16cm

# Hide pillar content
officecli set "$OUTPUT" '/slide[4]/shape[11]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[12]' --prop x=${OFFSCREEN} --prop y=1cm
officecli set "$OUTPUT" '/slide[4]/shape[13]' --prop x=${OFFSCREEN} --prop y=2cm
officecli set "$OUTPUT" '/slide[4]/shape[14]' --prop x=${OFFSCREEN} --prop y=3cm
officecli set "$OUTPUT" '/slide[4]/shape[15]' --prop x=${OFFSCREEN} --prop y=4cm
officecli set "$OUTPUT" '/slide[4]/shape[16]' --prop x=${OFFSCREEN} --prop y=5cm
officecli set "$OUTPUT" '/slide[4]/shape[17]' --prop x=${OFFSCREEN} --prop y=6cm
officecli set "$OUTPUT" '/slide[4]/shape[18]' --prop x=${OFFSCREEN} --prop y=7cm
officecli set "$OUTPUT" '/slide[4]/shape[19]' --prop x=${OFFSCREEN} --prop y=8cm
officecli set "$OUTPUT" '/slide[4]/shape[20]' --prop x=${OFFSCREEN} --prop y=9cm

# Show evidence content
officecli set "$OUTPUT" '/slide[4]/shape[21]' --prop x=2cm --prop y=1.5cm
officecli set "$OUTPUT" '/slide[4]/shape[22]' --prop x=4cm --prop y=8cm
officecli set "$OUTPUT" '/slide[4]/shape[23]' --prop x=16cm --prop y=7cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[4]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move scene actors back to original-ish positions
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=0cm --prop y=0cm --prop width=15cm --prop height=15cm --prop fill=$PURPLE --prop opacity=0.15
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=18cm --prop y=4cm --prop width=15cm --prop height=15cm
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop x=25cm --prop y=2cm --prop width=5cm --prop height=5cm
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop x=13cm --prop y=16cm --prop width=8cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop x=6cm --prop y=5cm
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=28cm --prop y=15cm

# Hide evidence content
officecli set "$OUTPUT" '/slide[5]/shape[21]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[5]/shape[22]' --prop x=${OFFSCREEN} --prop y=1cm
officecli set "$OUTPUT" '/slide[5]/shape[23]' --prop x=${OFFSCREEN} --prop y=2cm

# Show CTA content
officecli set "$OUTPUT" '/slide[5]/shape[24]' --prop x=4cm --prop y=7cm
officecli set "$OUTPUT" '/slide[5]/shape[25]' --prop x=4cm --prop y=11cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
