#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__luxury_minimal.pptx"

echo "Building: dark--luxury-minimal (AURA COFFEE)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=111111
GOLD=D4AF37
WHITE=FFFFFF
GRAY1=888888
GRAY2=555555
GRAY3=333333
GRAY4=CCCCCC

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: golden line + all text elements
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!deco-line' \
  --prop fill=$GOLD \
  --prop x=4cm --prop y=8.5cm --prop width=2cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!brand-title' \
  --prop text="AURA COFFEE" \
  --prop font="Helvetica" \
  --prop size=60 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=4cm --prop y=9cm --prop width=25cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!brand-sub' \
  --prop text="纯 粹 之 境 | 极简高级精品咖啡" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$GRAY1 \
  --prop lineSpacing=1.5 \
  --prop fill=none \
  --prop x=4.2cm --prop y=12cm --prop width=25cm --prop height=1cm

# Pre-create all other actors (hidden off-canvas)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!statement-main' \
  --prop text="少即是多，剥离繁杂，只为一杯纯粹好咖啡。" \
  --prop font="Helvetica" \
  --prop size=36 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=25cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!statement-sub' \
  --prop text="在喧嚣的都市中，我们坚持做减法。\n拒绝过度包装与人工添加，让咖啡回归最本真的风味，\n这是 AURA 的美学，也是对品质的极致专注。" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$GRAY1 \
  --prop lineSpacing=1.8 \
  --prop valign=top \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=1cm --prop width=20cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!pillar-title' \
  --prop text="三大核心原则" \
  --prop font="Helvetica" \
  --prop size=24 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=2cm --prop width=25cm --prop height=1.5cm

# Pillar 1
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box1-line' \
  --prop fill=$GRAY3 \
  --prop x=${OFFSCREEN} --prop y=3cm --prop width=0.1cm --prop height=7cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box1-title' \
  --prop text="01. 严苛寻豆" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=4cm --prop width=8cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box1-desc' \
  --prop text="深入埃塞俄比亚、哥伦比亚等原产地，仅甄选海拔 1500 米以上的 SCA 85+ 级精品生豆。" \
  --prop font="Helvetica" \
  --prop size=14 \
  --prop color=$GRAY1 \
  --prop lineSpacing=1.6 \
  --prop valign=top \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=5cm --prop width=7.5cm --prop height=5cm

# Pillar 2
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box2-line' \
  --prop fill=$GRAY3 \
  --prop x=${OFFSCREEN} --prop y=6cm --prop width=0.1cm --prop height=7cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box2-title' \
  --prop text="02. 精准烘焙" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=7cm --prop width=8cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box2-desc' \
  --prop text="采用德国 Probat 烘焙机，结合气象数据微调曲线，激发每一支豆子的风土之味。" \
  --prop font="Helvetica" \
  --prop size=14 \
  --prop color=$GRAY1 \
  --prop lineSpacing=1.6 \
  --prop valign=top \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=8cm --prop width=7.5cm --prop height=5cm

# Pillar 3
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box3-line' \
  --prop fill=$GRAY3 \
  --prop x=${OFFSCREEN} --prop y=9cm --prop width=0.1cm --prop height=7cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box3-title' \
  --prop text="03. 科学萃取" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=10cm --prop width=8cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!box3-desc' \
  --prop text="精准控制 93°C 水温与 9 Bar 压力，金杯法则护航，确保每一杯出品的稳定与完美。" \
  --prop font="Helvetica" \
  --prop size=14 \
  --prop color=$GRAY1 \
  --prop lineSpacing=1.6 \
  --prop valign=top \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=11cm --prop width=7.5cm --prop height=5cm

# Evidence elements
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-number' \
  --prop text="1%" \
  --prop font="Arial" \
  --prop size=110 \
  --prop bold=true \
  --prop color=$GOLD \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=12cm --prop width=10cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-title' \
  --prop text="全球前 1% 极微批次特选" \
  --prop font="Helvetica" \
  --prop size=20 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=13cm --prop width=12cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-desc1' \
  --prop text="• 年度限量供应 500kg 庄园级瑰夏" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$GRAY4 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=14cm --prop width=15cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-desc2' \
  --prop text="• 100% 环保可降解极简材质包装" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$GRAY4 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=15cm --prop width=15cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ev-desc3' \
  --prop text="• 多位 Q-Grader 国际品鉴师严格把控" \
  --prop font="Helvetica" \
  --prop size=16 \
  --prop color=$GRAY4 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=16cm --prop width=15cm --prop height=1.5cm

# CTA elements
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-title' \
  --prop text="品味纯粹，即刻启程" \
  --prop font="Helvetica" \
  --prop size=44 \
  --prop color=$WHITE \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=17cm --prop width=25cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-web' \
  --prop text="www.auracoffee.com" \
  --prop font="Helvetica" \
  --prop size=14 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=18cm --prop width=10cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!cta-email' \
  --prop text="partner@auracoffee.com" \
  --prop font="Helvetica" \
  --prop size=14 \
  --prop color=$GRAY2 \
  --prop fill=none \
  --prop x=${OFFSCREEN} --prop y=18.5cm --prop width=10cm --prop height=1cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move actors
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=4cm --prop y=7cm --prop width=1cm
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=4cm --prop y=2cm --prop width=10cm --prop height=1cm --prop size=14 --prop color=$GRAY2
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=${OFFSCREEN}

# Show statement
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=4cm --prop y=8cm
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=4cm --prop y=11cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[2]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move actors
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=4cm --prop y=4.5cm --prop width=5cm
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=4cm --prop y=2cm

# Hide statement
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop x=${OFFSCREEN}

# Show pillars
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=4cm --prop y=3cm
officecli set "$OUTPUT" '/slide[3]/shape[7]' --prop x=4cm --prop y=7cm
officecli set "$OUTPUT" '/slide[3]/shape[8]' --prop x=4.5cm --prop y=7cm
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop x=4.5cm --prop y=8.5cm
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop x=13.5cm --prop y=7cm
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=14cm --prop y=7cm
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=14cm --prop y=8.5cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=23cm --prop y=7cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=23.5cm --prop y=7cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=23.5cm --prop y=8.5cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[3]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move actors
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=15cm --prop y=10.5cm --prop width=3cm
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=4cm --prop y=2cm

# Hide pillars
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[7]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[8]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[9]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[10]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[11]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[12]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[13]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[14]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[4]/shape[15]' --prop x=${OFFSCREEN}

# Show evidence
officecli set "$OUTPUT" '/slide[4]/shape[16]' --prop x=4cm --prop y=7cm
officecli set "$OUTPUT" '/slide[4]/shape[17]' --prop x=4cm --prop y=12cm
officecli set "$OUTPUT" '/slide[4]/shape[18]' --prop x=15cm --prop y=7cm
officecli set "$OUTPUT" '/slide[4]/shape[19]' --prop x=15cm --prop y=8.5cm
officecli set "$OUTPUT" '/slide[4]/shape[20]' --prop x=15cm --prop y=12cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[4]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move actors
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=4cm --prop y=7cm --prop width=2cm
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=4cm --prop y=12cm --prop width=15cm --prop height=1.5cm --prop size=20

# Hide evidence
officecli set "$OUTPUT" '/slide[5]/shape[16]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[17]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[18]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[19]' --prop x=${OFFSCREEN}
officecli set "$OUTPUT" '/slide[5]/shape[20]' --prop x=${OFFSCREEN}

# Show CTA
officecli set "$OUTPUT" '/slide[5]/shape[21]' --prop x=4cm --prop y=8cm
officecli set "$OUTPUT" '/slide[5]/shape[22]' --prop x=4cm --prop y=14cm
officecli set "$OUTPUT" '/slide[5]/shape[23]' --prop x=10cm --prop y=14cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
