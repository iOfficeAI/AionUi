#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/Cat-Secret-Life.pptx"

# Colors
BG_COLOR="FFF8E7"
TEXT_DARK="3D3B3C"
TEXT_LIGHT="FFFFFF"
C_ORANGE="FF8A65"
C_YELLOW="FFD54F"
C_TEAL="4DB6AC"
C_DARK="3D3B3C"

# Off-canvas position
OFFSCREEN=36cm

echo "Building: warm--playful-organic (Cat Secret Life)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG_COLOR

# Scene actors: organic shapes that morph
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blob-main' \
  --prop preset=roundRect \
  --prop fill=$C_ORANGE \
  --prop opacity=0.15 \
  --prop x=18cm --prop y=5cm --prop width=20cm --prop height=15cm --prop rotation=15

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-orange' \
  --prop preset=ellipse \
  --prop fill=$C_ORANGE \
  --prop x=0cm --prop y=12cm --prop width=12cm --prop height=12cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot-yellow' \
  --prop preset=ellipse \
  --prop fill=$C_YELLOW \
  --prop x=26cm --prop y=0cm --prop width=8cm --prop height=8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!line-teal' \
  --prop preset=roundRect \
  --prop fill=$C_TEAL \
  --prop x=6cm --prop y=4cm --prop width=3cm --prop height=0.6cm --prop rotation=-20

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!tri-dark' \
  --prop preset=triangle \
  --prop fill=$C_DARK \
  --prop opacity=0.8 \
  --prop x=30cm --prop y=15cm --prop width=3cm --prop height=3cm --prop rotation=45

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!accent-star' \
  --prop preset=star5 \
  --prop fill=$C_YELLOW \
  --prop x=10cm --prop y=16cm --prop width=2cm --prop height=2cm --prop rotation=10

# Slide 1 content
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-hero-title' \
  --prop text='猫的秘密生活' \
  --prop font='思源黑体' \
  --prop size=72 \
  --prop bold=true \
  --prop color=$TEXT_DARK \
  --prop align=center \
  --prop valign=middle \
  --prop fill=none \
  --prop x=4.4cm --prop y=7cm --prop width=25cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-hero-sub' \
  --prop text='人类观察报告（代号：喵星卧底）' \
  --prop font='思源黑体' \
  --prop size=32 \
  --prop color=$TEXT_DARK \
  --prop opacity=0.8 \
  --prop align=center \
  --prop valign=middle \
  --prop fill=none \
  --prop x=4.4cm --prop y=10.5cm --prop width=25cm --prop height=2cm

# Pre-create all other slide content (off-canvas)
# Slide 2: Statement
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-statement-main' \
  --prop text='你以为你在养猫？
其实是猫在观察你。' \
  --prop font='思源黑体' \
  --prop size=54 \
  --prop bold=true \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop valign=middle \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6cm --prop width=26cm --prop height=6cm

# Slide 3: Pillars (3 cards)
for i in 1 2 3; do
  officecli add "$OUTPUT" '/slide[1]' --type shape \
    --prop "name=#s3-pillar-bg-$i" \
    --prop preset=roundRect \
    --prop fill=$C_DARK \
    --prop opacity=0.05 \
    --prop x=$OFFSCREEN --prop y=4cm --prop width=8cm --prop height=12cm

  officecli add "$OUTPUT" '/slide[1]' --type shape \
    --prop "name=#s3-pillar-num-$i" \
    --prop text="0$i" \
    --prop font='Montserrat' \
    --prop size=48 \
    --prop bold=true \
    --prop color=$C_ORANGE \
    --prop align=left \
    --prop fill=none \
    --prop x=$OFFSCREEN --prop y=5cm --prop width=6cm --prop height=2cm

  officecli add "$OUTPUT" '/slide[1]' --type shape \
    --prop "name=#s3-pillar-title-$i" \
    --prop font='思源黑体' \
    --prop size=28 \
    --prop bold=true \
    --prop color=$TEXT_DARK \
    --prop align=left \
    --prop fill=none \
    --prop x=$OFFSCREEN --prop y=7cm --prop width=6cm --prop height=1.5cm

  officecli add "$OUTPUT" '/slide[1]' --type shape \
    --prop "name=#s3-pillar-desc-$i" \
    --prop font='思源黑体' \
    --prop size=16 \
    --prop color=$TEXT_DARK \
    --prop align=left \
    --prop fill=none \
    --prop x=$OFFSCREEN --prop y=8.5cm --prop width=6.5cm --prop height=4cm
done

# Set pillar text content
officecli set "$OUTPUT" '/slide[1]/shape[12]' --prop text='日常充电'
officecli set "$OUTPUT" '/slide[1]/shape[13]' --prop text='寻找阳光最充足的位置，进入深度休眠模式，补充能量。'
officecli set "$OUTPUT" '/slide[1]/shape[16]' --prop text='幻觉狩猎'
officecli set "$OUTPUT" '/slide[1]/shape[17]' --prop text='在夜深人静时，捕捉人类看不见的"空气猎物"。'
officecli set "$OUTPUT" '/slide[1]/shape[20]' --prop text='高冷监视'
officecli set "$OUTPUT" '/slide[1]/shape[21]' --prop text='居高临下，用充满智慧的眼神审视人类的愚蠢行为。'

# Slide 4: Evidence
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-evi-num' \
  --prop text='70%' \
  --prop font='Montserrat' \
  --prop size=120 \
  --prop bold=true \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=4cm --prop width=15cm --prop height=6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s4-evi-desc' \
  --prop text='猫咪一生中睡觉的时间占比。剩余时间里，一半在舔毛，一半在夜间跑酷。' \
  --prop font='思源黑体' \
  --prop size=24 \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=12cm --prop width=13cm --prop height=5cm

# Slide 5: Comparison
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-comp-title-l' \
  --prop text='狗' \
  --prop font='思源黑体' \
  --prop size=64 \
  --prop bold=true \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=4cm --prop width=10cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-comp-desc-l' \
  --prop text='"你是神！
你给我吃的！"' \
  --prop font='思源黑体' \
  --prop size=32 \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=9cm --prop width=12cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-comp-title-r' \
  --prop text='猫' \
  --prop font='思源黑体' \
  --prop size=64 \
  --prop bold=true \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=4cm --prop width=10cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s5-comp-desc-r' \
  --prop text='"我是神！
你给我吃的！"' \
  --prop font='思源黑体' \
  --prop size=32 \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=9cm --prop width=12cm --prop height=5cm

# Slide 6: CTA
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-cta-title' \
  --prop text='观察结束，去开罐头吧！' \
  --prop font='思源黑体' \
  --prop size=54 \
  --prop bold=true \
  --prop color=$TEXT_DARK \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6.5cm --prop width=26cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-cta-sub' \
  --prop text='毕竟，主子已经等急了。' \
  --prop font='思源黑体' \
  --prop size=28 \
  --prop color=$TEXT_DARK \
  --prop opacity=0.8 \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=9.5cm --prop width=26cm --prop height=2cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Morph scene actors - dark background
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop preset=rect --prop x=0cm --prop y=0cm --prop width=45cm --prop height=30cm --prop rotation=0 --prop opacity=1
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=0cm --prop y=12cm --prop width=10cm --prop height=10cm --prop rotation=45 --prop opacity=0.3
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=28cm --prop y=2cm --prop width=8cm --prop height=8cm --prop opacity=0.5
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop x=5cm --prop y=0cm --prop width=12cm --prop height=12cm --prop opacity=0.2
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop x=16cm --prop y=15cm --prop width=4cm --prop height=0.6cm --prop rotation=0
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=25cm --prop y=14cm --prop rotation=90

# Hide slide 1 content, show slide 2 content
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[2]/shape[9]' --prop x=3.9cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Morph scene actors
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop preset=triangle --prop x=28cm --prop y=0cm --prop width=8cm --prop height=8cm --prop rotation=180 --prop opacity=0.1
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=2cm --prop y=2cm --prop width=30cm --prop height=15cm --prop rotation=0 --prop opacity=0.05
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=0cm --prop y=0cm --prop width=15cm --prop height=15cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop x=25cm --prop y=14cm --prop width=12cm --prop height=12cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=1.5cm --prop y=1.5cm --prop width=30cm --prop height=0.2cm --prop rotation=0
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=2cm --prop y=16cm --prop rotation=180

# Hide previous content
officecli set "$OUTPUT" '/slide[3]/shape[7]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[8]' --prop x=$OFFSCREEN
officecli set "$OUTPUT" '/slide[3]/shape[9]' --prop x=$OFFSCREEN

# Show pillars
officecli set "$OUTPUT" '/slide[3]/shape[10]' --prop x=2.5cm
officecli set "$OUTPUT" '/slide[3]/shape[11]' --prop x=3.5cm
officecli set "$OUTPUT" '/slide[3]/shape[12]' --prop x=3.5cm
officecli set "$OUTPUT" '/slide[3]/shape[13]' --prop x=3.5cm
officecli set "$OUTPUT" '/slide[3]/shape[14]' --prop x=12.9cm
officecli set "$OUTPUT" '/slide[3]/shape[15]' --prop x=13.9cm
officecli set "$OUTPUT" '/slide[3]/shape[16]' --prop x=13.9cm
officecli set "$OUTPUT" '/slide[3]/shape[17]' --prop x=13.9cm
officecli set "$OUTPUT" '/slide[3]/shape[18]' --prop x=23.3cm
officecli set "$OUTPUT" '/slide[3]/shape[19]' --prop x=24.3cm
officecli set "$OUTPUT" '/slide[3]/shape[20]' --prop x=24.3cm
officecli set "$OUTPUT" '/slide[3]/shape[21]' --prop x=24.3cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Morph scene actors - asymmetric data highlight
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop fill=$C_TEAL --prop x=0cm --prop y=0cm --prop width=25cm --prop height=30cm --prop rotation=0 --prop opacity=1
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=24cm --prop y=10cm --prop width=8cm --prop height=8cm --prop opacity=1
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop x=28cm --prop y=2cm --prop width=4cm --prop height=4cm --prop opacity=1
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop x=18cm --prop y=4cm --prop width=6cm --prop height=0.6cm --prop rotation=45
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=20cm --prop y=14cm --prop width=4cm --prop height=4cm --prop rotation=90
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=30cm --prop y=16cm --prop rotation=30

# Hide previous content
for i in {7..22}; do
  officecli set "$OUTPUT" "/slide[4]/shape[$i]" --prop x=$OFFSCREEN
done

# Show evidence
officecli set "$OUTPUT" '/slide[4]/shape[23]' --prop x=1cm
officecli set "$OUTPUT" '/slide[4]/shape[24]' --prop x=1cm

# ============================================
# SLIDE 5 - COMPARISON
# ============================================
echo "Building Slide 5: Comparison..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Morph scene actors - split 50/50
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop preset=rect --prop fill=$C_TEAL --prop x=0cm --prop y=0cm --prop width=16.9cm --prop height=19.05cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop preset=rect --prop x=16.9cm --prop y=0cm --prop width=17cm --prop height=19.05cm --prop rotation=0 --prop opacity=1
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop x=14cm --prop y=16cm --prop width=6cm --prop height=6cm --prop opacity=0.3
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop x=16.9cm --prop y=0cm --prop width=0.4cm --prop height=19cm --prop rotation=0 --prop fill=$TEXT_LIGHT
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop x=2cm --prop y=2cm --prop width=3cm --prop height=3cm --prop rotation=180 --prop opacity=0.3
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=30cm --prop y=2cm --prop opacity=0.3

# Hide previous content
for i in {7..24}; do
  officecli set "$OUTPUT" "/slide[5]/shape[$i]" --prop x=$OFFSCREEN
done

# Show comparison
officecli set "$OUTPUT" '/slide[5]/shape[25]' --prop x=3.5cm
officecli set "$OUTPUT" '/slide[5]/shape[26]' --prop x=2.5cm
officecli set "$OUTPUT" '/slide[5]/shape[27]' --prop x=20cm
officecli set "$OUTPUT" '/slide[5]/shape[28]' --prop x=19cm

# ============================================
# SLIDE 6 - CTA
# ============================================
echo "Building Slide 6: CTA..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[6]' --prop transition=morph

# Morph scene actors - back to warm/inviting
officecli set "$OUTPUT" '/slide[6]/shape[1]' --prop preset=roundRect --prop fill=$C_YELLOW --prop x=6.9cm --prop y=4cm --prop width=20cm --prop height=11cm --prop rotation=0 --prop opacity=0.2
officecli set "$OUTPUT" '/slide[6]/shape[2]' --prop preset=ellipse --prop fill=$C_ORANGE --prop x=28cm --prop y=12cm --prop width=10cm --prop height=10cm --prop rotation=0 --prop opacity=0.8
officecli set "$OUTPUT" '/slide[6]/shape[3]' --prop x=0cm --prop y=0cm --prop width=8cm --prop height=8cm --prop opacity=0.8
officecli set "$OUTPUT" '/slide[6]/shape[4]' --prop x=20cm --prop y=15cm --prop width=6cm --prop height=0.6cm --prop fill=$C_TEAL --prop rotation=-10
officecli set "$OUTPUT" '/slide[6]/shape[5]' --prop preset=triangle --prop x=5cm --prop y=15cm --prop width=4cm --prop height=4cm --prop rotation=45 --prop opacity=0.5
officecli set "$OUTPUT" '/slide[6]/shape[6]' --prop x=16cm --prop y=3cm --prop width=3cm --prop height=3cm --prop rotation=45 --prop opacity=1

# Hide previous content
for i in {7..28}; do
  officecli set "$OUTPUT" "/slide[6]/shape[$i]" --prop x=$OFFSCREEN
done

# Show CTA
officecli set "$OUTPUT" '/slide[6]/shape[28]' --prop x=3.9cm
officecli set "$OUTPUT" '/slide[6]/shape[29]' --prop x=3.9cm

# ============================================
# VALIDATE & COMPLETE
# ============================================
echo "Validating..."
bash "$(dirname "$0")/../../morph-helpers.sh" validate "$OUTPUT"

echo "✅ Build complete: $OUTPUT"
