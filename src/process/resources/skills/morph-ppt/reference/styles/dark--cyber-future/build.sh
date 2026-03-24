#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__cyber_future.pptx"

echo "Building: dark--cyber-future (未来已来：2050)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=0B0C10
CYAN=66FCF1
GRAY=1F2833
TEAL=45A29E
WHITE=FFFFFF
GRAY2=C5C6C7

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: background elements
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bg-orb' \
  --prop preset=ellipse \
  --prop fill=$CYAN \
  --prop opacity=0.08 \
  --prop x=0cm --prop y=0cm --prop width=20cm --prop height=20cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bg-box' \
  --prop fill=$GRAY \
  --prop opacity=0.3 \
  --prop x=2cm --prop y=2cm --prop width=8cm --prop height=15cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!accent-line' \
  --prop fill=$CYAN \
  --prop x=1cm --prop y=4cm --prop width=0.2cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!frame' \
  --prop fill=none \
  --prop line=$GRAY \
  --prop lineWidth=2 \
  --prop x=1.2cm --prop y=0.8cm --prop width=31.47cm --prop height=17.45cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-1' \
  --prop preset=ellipse \
  --prop fill=$TEAL \
  --prop x=5cm --prop y=10cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-2' \
  --prop preset=ellipse \
  --prop fill=$CYAN \
  --prop x=30cm --prop y=15cm --prop width=1cm --prop height=1cm

# Slide 1 headline actors (visible on hero)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-title' \
  --prop text="未来已来：2050" \
  --prop font="Arial" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=4cm --prop y=6cm --prop width=25cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-sub' \
  --prop text="全息时代的一天" \
  --prop font="Arial" \
  --prop size=36 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=4.2cm --prop y=10.5cm --prop width=15cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!hero-tag' \
  --prop text="THE BOUNDARY DISSOLVES" \
  --prop font="Montserrat" \
  --prop size=16 \
  --prop color=$CYAN \
  --prop bold=true \
  --prop fill=none \
  --prop x=4.2cm --prop y=13cm --prop width=15cm --prop height=1.5cm

# Slide 2 statement actors (hidden initially)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stmt-text' \
  --prop text="物理与数字的边界彻底消融" \
  --prop font="Arial" \
  --prop size=54 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=7cm --prop width=28cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!stmt-sub' \
  --prop text="智能代理、脑机接口与空间计算重塑了我们的每一秒" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$TEAL \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=12cm --prop width=28cm --prop height=2cm

# Slide 3 pillar content actors (hidden initially)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p1-bg' \
  --prop preset=roundRect \
  --prop fill=$GRAY \
  --prop opacity=0.4 \
  --prop x=${OFFSCREEN} --prop y=4.5cm --prop width=9cm --prop height=11cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p1-time' \
  --prop text="07:00" \
  --prop font="Montserrat" \
  --prop size=28 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=5.5cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p1-title' \
  --prop text="基因营养与唤醒" \
  --prop font="Arial" \
  --prop size=24 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=7.5cm --prop width=7.5cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p1-desc' \
  --prop text="AI管家实时读取体征，合成专属营养早餐，温和唤醒意识。" \
  --prop font="Arial" \
  --prop size=16 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10cm --prop width=7cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p2-bg' \
  --prop preset=roundRect \
  --prop fill=$GRAY \
  --prop opacity=0.4 \
  --prop x=${OFFSCREEN} --prop y=4.5cm --prop width=9cm --prop height=11cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p2-time' \
  --prop text="14:00" \
  --prop font="Montserrat" \
  --prop size=28 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=5.5cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p2-title' \
  --prop text="全息远程协同" \
  --prop font="Arial" \
  --prop size=24 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=7.5cm --prop width=7.5cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p2-desc' \
  --prop text="在虚拟火星基地与全球团队开启三维会议，数据触手可及。" \
  --prop font="Arial" \
  --prop size=16 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10cm --prop width=7cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p3-bg' \
  --prop preset=roundRect \
  --prop fill=$GRAY \
  --prop opacity=0.4 \
  --prop x=${OFFSCREEN} --prop y=4.5cm --prop width=9cm --prop height=11cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p3-time' \
  --prop text="21:00" \
  --prop font="Montserrat" \
  --prop size=28 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=5.5cm --prop width=7cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p3-title' \
  --prop text="沉浸式潜意识休眠" \
  --prop font="Arial" \
  --prop size=24 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=7.5cm --prop width=8cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!p3-desc' \
  --prop text="脑机接口连接潜意识网络，在深睡中完成知识载入与精神放松。" \
  --prop font="Arial" \
  --prop size=16 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10cm --prop width=7cm --prop height=4cm

# Slide 4 evidence actors (hidden initially)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-bg' \
  --prop fill=$TEAL \
  --prop opacity=0.3 \
  --prop x=${OFFSCREEN} --prop y=3cm --prop width=15cm --prop height=13cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-num' \
  --prop text="98.5%" \
  --prop font="Montserrat" \
  --prop size=96 \
  --prop bold=true \
  --prop color=$CYAN \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=5cm --prop width=15cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-label' \
  --prop text="全球人口脑机接口接入率" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=11cm --prop width=13cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev2-bg' \
  --prop fill=$GRAY \
  --prop opacity=0.5 \
  --prop x=${OFFSCREEN} --prop y=8cm --prop width=12cm --prop height=8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev2-num' \
  --prop text="12.4 hrs" \
  --prop font="Montserrat" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=9.5cm --prop width=10cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev2-label' \
  --prop text="平均每日混合现实驻留时长" \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=13.5cm --prop width=10cm --prop height=2cm

# Slide 5 CTA actors (hidden initially)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-title' \
  --prop text="准备好迎接你的未来了吗？" \
  --prop font="Arial" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=7cm --prop width=26cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-btn' \
  --prop text="EXPLORE 2050" \
  --prop preset=roundRect \
  --prop font="Montserrat" \
  --prop size=18 \
  --prop bold=true \
  --prop color=$BG \
  --prop fill=$CYAN \
  --prop align=center \
  --prop x=${OFFSCREEN} --prop y=11.5cm --prop width=6cm --prop height=1.5cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=20cm --prop y=8cm --prop opacity=0.05 --prop fill=$TEAL
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=14cm --prop y=2cm --prop width=18cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=2cm --prop y=2cm --prop width=30cm --prop height=0.2cm
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=31cm --prop y=4cm
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=3cm --prop y=16cm

# Hide hero text
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop x=${OFFSCREEN} --prop y=0cm

# Show statement text
officecli set "$OUTPUT" '/slide[2]/shape[10]' --prop x=2.9cm --prop y=7cm
officecli set "$OUTPUT" '/slide[2]/shape[11]' --prop x=2.9cm --prop y=12cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[2]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=10cm --prop y=0cm --prop opacity=0.08 --prop fill=$CYAN
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=2cm --prop y=2cm --prop width=30cm --prop height=2cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop x=31cm --prop y=4cm --prop width=0.2cm --prop height=5cm

# Hide statement text
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=${OFFSCREEN} --prop y=0cm

# Show pillar 1
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=2.5cm --prop y=4.5cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=3.5cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=3.5cm --prop y=7.5cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=3.5cm --prop y=10cm

# Show pillar 2
officecli set "$OUTPUT" '/slide[3]/shape[16]' --prop x=12.5cm --prop y=4.5cm
officecli set "$OUTPUT" '/slide[3]/shape[17]' --prop x=13.5cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[3]/shape[18]' --prop x=13.5cm --prop y=7.5cm
officecli set "$OUTPUT" '/slide[3]/shape[19]' --prop x=13.5cm --prop y=10cm

# Show pillar 3
officecli set "$OUTPUT" '/slide[3]/shape[20]' --prop x=22.5cm --prop y=4.5cm
officecli set "$OUTPUT" '/slide[3]/shape[21]' --prop x=23.5cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[3]/shape[22]' --prop x=23.5cm --prop y=7.5cm
officecli set "$OUTPUT" '/slide[3]/shape[23]' --prop x=23.5cm --prop y=10cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[3]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=15cm --prop y=10cm --prop opacity=0.05
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=2cm --prop y=4cm --prop width=4cm --prop height=11cm
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop x=2cm --prop y=15.5cm --prop width=12cm --prop height=0.2cm

# Hide pillars
officecli set "$OUTPUT" '/slide[4]/shape[12]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[13]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[14]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[15]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[16]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[17]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[18]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[19]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[20]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[21]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[22]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[4]/shape[23]' --prop x=${OFFSCREEN} --prop y=0cm

# Show evidence
officecli set "$OUTPUT" '/slide[4]/shape[24]' --prop x=4cm --prop y=3cm
officecli set "$OUTPUT" '/slide[4]/shape[25]' --prop x=5cm --prop y=5cm
officecli set "$OUTPUT" '/slide[4]/shape[26]' --prop x=5cm --prop y=12cm
officecli set "$OUTPUT" '/slide[4]/shape[27]' --prop x=20cm --prop y=8cm
officecli set "$OUTPUT" '/slide[4]/shape[28]' --prop x=21cm --prop y=9.5cm
officecli set "$OUTPUT" '/slide[4]/shape[29]' --prop x=21cm --prop y=13.5cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[4]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move scene actors
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=8cm --prop y=0cm --prop width=15cm --prop height=15cm --prop opacity=0.08
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=12cm --prop y=10cm --prop width=10cm --prop height=6cm
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop x=16.5cm --prop y=16cm --prop width=0.8cm --prop height=0.2cm

# Hide evidence
officecli set "$OUTPUT" '/slide[5]/shape[24]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[5]/shape[25]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[5]/shape[26]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[5]/shape[27]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[5]/shape[28]' --prop x=${OFFSCREEN} --prop y=0cm
officecli set "$OUTPUT" '/slide[5]/shape[29]' --prop x=${OFFSCREEN} --prop y=0cm

# Show CTA
officecli set "$OUTPUT" '/slide[5]/shape[30]' --prop x=3.9cm --prop y=7cm
officecli set "$OUTPUT" '/slide[5]/shape[31]' --prop x=13.9cm --prop y=11.5cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
