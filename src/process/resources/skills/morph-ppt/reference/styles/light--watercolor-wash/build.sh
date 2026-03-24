#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/light__watercolor_wash.pptx"

echo "Building: light--watercolor-wash (AI Agent Platform)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=FFFDF7
BLUE=7AADCF
ORANGE=E8A87C
PURPLE=C5B3D1
GREEN=9BC4A8
PEACH=F2C0A2
DARK_GREEN=5A7A6A
BROWN=6A5A4A
GRAY=8A7A6A

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: 6 watercolor ellipses
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!wash-1' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.08 \
  --prop line=none \
  --prop x=0cm --prop y=0cm --prop width=18cm --prop height=15cm --prop rotation=10

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!wash-2' \
  --prop preset=ellipse \
  --prop fill=$ORANGE \
  --prop opacity=0.06 \
  --prop line=none \
  --prop x=20cm --prop y=6cm --prop width=16cm --prop height=14cm --prop rotation=-15

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!wash-3' \
  --prop preset=ellipse \
  --prop fill=$PURPLE \
  --prop opacity=0.10 \
  --prop line=none \
  --prop x=10cm --prop y=0cm --prop width=14cm --prop height=16cm --prop rotation=5

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!wash-4' \
  --prop preset=ellipse \
  --prop fill=$GREEN \
  --prop opacity=0.05 \
  --prop line=none \
  --prop x=24cm --prop y=0cm --prop width=15cm --prop height=12cm --prop rotation=-8

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!wash-5' \
  --prop preset=ellipse \
  --prop fill=$PEACH \
  --prop opacity=0.12 \
  --prop line=none \
  --prop x=0cm --prop y=10cm --prop width=13cm --prop height=17cm --prop rotation=20

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!wash-6' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.07 \
  --prop line=none \
  --prop x=18cm --prop y=8cm --prop width=17cm --prop height=13cm --prop rotation=-12

# Slide 1 text content
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title' \
  --prop text='AI Agent Platform' \
  --prop font='LXGW WenKai' \
  --prop size=56 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=4cm --prop width=26cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle' \
  --prop text='智能体平台发布' \
  --prop font='LXGW WenKai' \
  --prop size=36 \
  --prop bold=true \
  --prop color=$BROWN \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=8.5cm --prop width=26cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-desc' \
  --prop text='让智能体为你工作' \
  --prop font='Noto Serif' \
  --prop size=18 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=12cm --prop width=26cm --prop height=2cm

# Pre-create all other slide text content (off-canvas)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-title' \
  --prop text='从自动化到自主化' \
  --prop font='LXGW WenKai' \
  --prop size=48 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5.5cm --prop width=30cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-desc' \
  --prop text='AI Agent 正在重新定义人机协作的边界' \
  --prop font='Noto Serif' \
  --prop size=18 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10.5cm --prop width=26cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-title' \
  --prop text='三大核心能力' \
  --prop font='LXGW WenKai' \
  --prop size=36 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=0.8cm --prop width=20cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p1-num' \
  --prop text='01' \
  --prop font='LXGW WenKai' \
  --prop size=44 \
  --prop bold=true \
  --prop color=$BLUE \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=3.8cm --prop width=9cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p1-title' \
  --prop text='感知' \
  --prop font='LXGW WenKai' \
  --prop size=24 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6.2cm --prop width=9cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p1-desc' \
  --prop text='多模态输入理解
实时环境感知' \
  --prop font='Noto Serif' \
  --prop size=16 \
  --prop color=$BROWN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8.2cm --prop width=9cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p2-num' \
  --prop text='02' \
  --prop font='LXGW WenKai' \
  --prop size=44 \
  --prop bold=true \
  --prop color=$ORANGE \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=3.8cm --prop width=9cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p2-title' \
  --prop text='推理' \
  --prop font='LXGW WenKai' \
  --prop size=24 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6.2cm --prop width=9cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p2-desc' \
  --prop text='链式思维规划
动态策略生成' \
  --prop font='Noto Serif' \
  --prop size=16 \
  --prop color=$BROWN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8.2cm --prop width=9cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p3-num' \
  --prop text='03' \
  --prop font='LXGW WenKai' \
  --prop size=44 \
  --prop bold=true \
  --prop color=$PURPLE \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=3.8cm --prop width=9cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p3-title' \
  --prop text='执行' \
  --prop font='LXGW WenKai' \
  --prop size=24 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6.2cm --prop width=9cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-p3-desc' \
  --prop text='工具调用编排
闭环反馈迭代' \
  --prop font='Noto Serif' \
  --prop size=16 \
  --prop color=$BROWN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8.2cm --prop width=9cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-title' \
  --prop text='平台数据' \
  --prop font='LXGW WenKai' \
  --prop size=36 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=0.8cm --prop width=20cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-num1' \
  --prop text='10M+' \
  --prop font='LXGW WenKai' \
  --prop size=72 \
  --prop bold=true \
  --prop color=FFFFFF \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5cm --prop width=14cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-label1' \
  --prop text='智能体调用次数' \
  --prop font='Noto Serif' \
  --prop size=18 \
  --prop color=FFFFFF \
  --prop opacity=0.9 \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=9cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-num2' \
  --prop text='99.95%' \
  --prop font='LXGW WenKai' \
  --prop size=56 \
  --prop bold=true \
  --prop color=5A3A2A \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=3cm --prop width=14cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-label2' \
  --prop text='平台可用性' \
  --prop font='Noto Serif' \
  --prop size=18 \
  --prop color=$BROWN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6.5cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-num3' \
  --prop text='50ms' \
  --prop font='LXGW WenKai' \
  --prop size=44 \
  --prop bold=true \
  --prop color=5A3A2A \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10cm --prop width=14cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-label3' \
  --prop text='平均响应延迟' \
  --prop font='Noto Serif' \
  --prop size=18 \
  --prop color=$BROWN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=13cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-title' \
  --prop text='开始构建你的智能体' \
  --prop font='LXGW WenKai' \
  --prop size=48 \
  --prop bold=true \
  --prop color=$DARK_GREEN \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=4.5cm --prop width=26cm --prop height=4.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-link' \
  --prop text='platform.ai/agents  |  立即体验' \
  --prop font='Noto Serif' \
  --prop size=18 \
  --prop color=$GRAY \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10cm --prop width=26cm --prop height=2cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Morph watercolor ellipses - slow drift
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=3cm --prop y=2cm --prop rotation=13 --prop opacity=0.09
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=16cm --prop y=4cm --prop rotation=-12 --prop opacity=0.07
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=12cm --prop y=3cm --prop rotation=8 --prop opacity=0.08
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=22cm --prop y=2cm --prop rotation=-5 --prop opacity=0.06
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=2cm --prop y=8cm --prop rotation=18 --prop opacity=0.10
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=20cm --prop y=10cm --prop rotation=-10 --prop opacity=0.06

# Hide slide 1 content, show slide 2 content
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[2]/shape[10]' --prop x=2cm --prop y=5.5cm
officecli set "$OUTPUT" '/slide[2]/shape[11]' --prop x=4cm --prop y=10.5cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Morph watercolor ellipses
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=0cm --prop y=4cm --prop width=13cm --prop height=14cm --prop rotation=6 --prop opacity=0.10
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=10cm --prop y=3cm --prop width=14cm --prop height=15cm --prop rotation=-10 --prop opacity=0.08
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop x=22cm --prop y=2cm --prop width=13cm --prop height=16cm --prop rotation=12 --prop opacity=0.09
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=28cm --prop y=14cm --prop width=8cm --prop height=8cm --prop rotation=-3 --prop opacity=0.05
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop x=0cm --prop y=14cm --prop width=10cm --prop height=8cm --prop rotation=15 --prop opacity=0.07
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=15cm --prop y=12cm --prop width=12cm --prop height=10cm --prop rotation=-7 --prop opacity=0.04

# Hide previous content, show slide 3 content
officecli set "$OUTPUT" '/slide[3]/shape[7]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[8]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=1.2cm --prop y=0.8cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=1.2cm --prop y=3.8cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=1.2cm --prop y=6.2cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=1.2cm --prop y=8.2cm
officecli set "$OUTPUT" '/slide[3]/shape[16]' --prop x=12.5cm --prop y=3.8cm
officecli set "$OUTPUT" '/slide[3]/shape[17]' --prop x=12.5cm --prop y=6.2cm
officecli set "$OUTPUT" '/slide[3]/shape[18]' --prop x=12.5cm --prop y=8.2cm
officecli set "$OUTPUT" '/slide[3]/shape[19]' --prop x=23.8cm --prop y=3.8cm
officecli set "$OUTPUT" '/slide[3]/shape[20]' --prop x=23.8cm --prop y=6.2cm
officecli set "$OUTPUT" '/slide[3]/shape[21]' --prop x=23.8cm --prop y=8.2cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Morph watercolor ellipses - larger opacities for evidence
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=0cm --prop y=1cm --prop width=18cm --prop height=17cm --prop rotation=8 --prop opacity=0.35
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=18cm --prop y=0cm --prop width=16cm --prop height=14cm --prop rotation=-12 --prop opacity=0.30
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop x=26cm --prop y=12cm --prop width=10cm --prop height=10cm --prop rotation=5 --prop opacity=0.08
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop x=14cm --prop y=14cm --prop width=8cm --prop height=6cm --prop rotation=-6 --prop opacity=0.06
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=30cm --prop y=0cm --prop width=6cm --prop height=6cm --prop rotation=10 --prop opacity=0.05
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=10cm --prop y=15cm --prop width=5cm --prop height=5cm --prop rotation=-4 --prop opacity=0.04

# Hide previous content, show slide 4 content
officecli set "$OUTPUT" '/slide[4]/shape[7]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[4]/shape[8]' --prop x=$OFFSCREEN
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
officecli set "$OUTPUT" '/slide[4]/shape[22]' --prop x=1.2cm --prop y=0.8cm
officecli set "$OUTPUT" '/slide[4]/shape[23]' --prop x=1.2cm --prop y=5cm
officecli set "$OUTPUT" '/slide[4]/shape[24]' --prop x=1.2cm --prop y=9cm
officecli set "$OUTPUT" '/slide[4]/shape[25]' --prop x=19cm --prop y=3cm
officecli set "$OUTPUT" '/slide[4]/shape[26]' --prop x=19cm --prop y=6.5cm
officecli set "$OUTPUT" '/slide[4]/shape[27]' --prop x=19cm --prop y=10cm
officecli set "$OUTPUT" '/slide[4]/shape[28]' --prop x=19cm --prop y=13cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Morph watercolor ellipses - final drift
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=22cm --prop y=8cm --prop width=16cm --prop height=14cm --prop rotation=12 --prop opacity=0.09
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=0cm --prop y=0cm --prop width=14cm --prop height=12cm --prop rotation=-14 --prop opacity=0.07
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop x=8cm --prop y=10cm --prop width=15cm --prop height=16cm --prop rotation=7 --prop opacity=0.10
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop x=26cm --prop y=0cm --prop width=12cm --prop height=10cm --prop rotation=-10 --prop opacity=0.06
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop x=0cm --prop y=12cm --prop width=14cm --prop height=14cm --prop rotation=16 --prop opacity=0.11
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=16cm --prop y=0cm --prop width=13cm --prop height=11cm --prop rotation=-8 --prop opacity=0.05

# Hide previous content, show slide 5 content
officecli set "$OUTPUT" '/slide[5]/shape[7]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[5]/shape[8]' --prop x=$OFFSCREEN
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
officecli set "$OUTPUT" '/slide[5]/shape[29]' --prop x=4cm --prop y=4.5cm
officecli set "$OUTPUT" '/slide[5]/shape[30]' --prop x=4cm --prop y=10cm

# ============================================
# VALIDATE & COMPLETE
# ============================================
echo "Validating..."
bash "$(dirname "$0")/../../morph-helpers.sh" validate "$OUTPUT"

echo "✅ Build complete: $OUTPUT"
