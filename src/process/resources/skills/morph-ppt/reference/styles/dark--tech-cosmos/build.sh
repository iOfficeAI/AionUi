#!/bin/bash
set -e
OUTPUT="TimeTravel.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"

# Create 6 slides
for i in 1 2 3 4 5 6; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=0B0F19
done

# Font settings
FONT_EN="Montserrat"
FONT_CN="Microsoft YaHei"
COLOR_TEXT="FFFFFF"
COLOR_SUB="8B949E"
COLOR_ACCENT="58A6FF"
COLOR_ACCENT2="7C3AED"
COLOR_DARK="161B22"

# --- SLIDE 1 (Hero) ---
# Create scene actors
officecli add "$OUTPUT" '/slide[1]' --type shape --name="scene-circle" --prop preset=ellipse \
  --prop fill=$COLOR_ACCENT2 --prop opacity=0.15 --prop softEdge=60 \
  --prop x=18cm --prop y=4cm --prop width=15cm --prop height=15cm

officecli add "$OUTPUT" '/slide[1]' --type shape --name="scene-slash" --prop preset=diamond \
  --prop fill=$COLOR_ACCENT --prop opacity=0.1 --prop \
  --prop x=4cm --prop y=10cm --prop width=8cm --prop height=8cm --prop rotation=15

officecli add "$OUTPUT" '/slide[1]' --type shape --name="scene-line-top" --prop preset=rect \
  --prop fill=$COLOR_ACCENT --prop opacity=0.8 \
  --prop x=2cm --prop y=2cm --prop width=10cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[1]' --type shape --name="scene-box" --prop preset=rect \
  --prop fill=none --prop line=$COLOR_ACCENT --prop lineWidth=2pt --prop opacity=0.3 \
  --prop x=22cm --prop y=10cm --prop width=6cm --prop height=6cm --prop rotation=45

# Content Actors S1
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s1-title" \
  --prop text="时空旅行指南" --prop font="$FONT_CN" --prop size=56 --prop color=$COLOR_TEXT \
  --prop align=left --prop x=2cm --prop y=6cm --prop width=25cm --prop height=2cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape --name="s1-subtitle" \
  --prop text="从 理 论 到 实 践" --prop font="$FONT_CN" --prop size=28 --prop color=$COLOR_ACCENT \
  --prop align=left --prop x=2cm --prop y=8.5cm --prop width=25cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape --name="s1-desc" \
  --prop text="开启你的第四维之旅，了解关于时间的终极奥秘" --prop font="$FONT_CN" --prop size=16 --prop color=$COLOR_SUB \
  --prop align=left --prop x=2cm --prop y=10.5cm --prop width=25cm --prop height=1cm --prop fill=none

# Pre-create Content Actors for later slides (Ghosted)
# S2
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s2-statement" \
  --prop text="“时间不是一条单行道，而是一片可以航行的海洋。”" --prop font="$FONT_CN" --prop size=40 --prop color=$COLOR_TEXT \
  --prop align=center --prop x=36cm --prop y=6cm --prop width=28cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s2-desc" \
  --prop text="爱因斯坦的相对论打破了绝对时空观" --prop font="$FONT_CN" --prop size=20 --prop color=$COLOR_ACCENT \
  --prop align=center --prop x=36cm --prop y=10cm --prop width=20cm --prop height=1cm --prop fill=none

# S3
for j in 1 2 3; do
  officecli add "$OUTPUT" '/slide[1]' --type shape --name="s3-card-$j" --prop preset=roundRect \
    --prop fill=$COLOR_DARK --prop opacity=0 --prop x=36cm --prop y=6cm --prop width=9cm --prop height=10cm
  officecli add "$OUTPUT" '/slide[1]' --type shape --name="s3-title-$j" \
    --prop text="理论" --prop font="$FONT_CN" --prop size=24 --prop color=$COLOR_TEXT --prop align=left \
    --prop x=36cm --prop y=7cm --prop width=8cm --prop height=1cm --prop fill=none --prop opacity=0
  officecli add "$OUTPUT" '/slide[1]' --type shape --name="s3-desc-$j" \
    --prop text="描述" --prop font="$FONT_CN" --prop size=16 --prop color=$COLOR_SUB --prop align=left \
    --prop x=36cm --prop y=9cm --prop width=8cm --prop height=5cm --prop fill=none --prop opacity=0
done
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s3-header" \
  --prop text="三大理论基石" --prop font="$FONT_CN" --prop size=36 --prop color=$COLOR_TEXT \
  --prop align=left --prop x=36cm --prop y=2cm --prop width=15cm --prop height=1.5cm --prop fill=none

# S4
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s4-data-bg" --prop preset=roundRect \
  --prop fill=$COLOR_ACCENT2 --prop opacity=0 \
  --prop x=36cm --prop y=4cm --prop width=15cm --prop height=10cm
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s4-data-num" \
  --prop text="38微秒" --prop font="$FONT_CN" --prop size=60 --prop color=$COLOR_TEXT \
  --prop align=center --prop x=36cm --prop y=6cm --prop width=15cm --prop height=2cm --prop fill=none --prop opacity=0
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s4-data-desc" \
  --prop text="GPS 卫星每天比地面快的时间\n必须修正否则定位失效" --prop font="$FONT_CN" --prop size=18 --prop color=$COLOR_TEXT \
  --prop align=center --prop x=36cm --prop y=9cm --prop width=15cm --prop height=2cm --prop fill=none --prop opacity=0

# S5 Timeline
for j in 1 2 3 4; do
  officecli add "$OUTPUT" '/slide[1]' --type shape --name="s5-dot-$j" --prop preset=ellipse \
    --prop fill=$COLOR_ACCENT --prop x=36cm --prop y=8cm --prop width=1cm --prop height=1cm --prop opacity=0
  officecli add "$OUTPUT" '/slide[1]' --type shape --name="s5-year-$j" \
    --prop text="20世纪" --prop font="$FONT_CN" --prop size=24 --prop color=$COLOR_TEXT --prop align=center \
    --prop x=36cm --prop y=6cm --prop width=6cm --prop height=1.5cm --prop fill=none --prop opacity=0
  officecli add "$OUTPUT" '/slide[1]' --type shape --name="s5-desc-$j" \
    --prop text="理论奠基" --prop font="$FONT_CN" --prop size=14 --prop color=$COLOR_SUB --prop align=center \
    --prop x=36cm --prop y=9.5cm --prop width=6cm --prop height=3cm --prop fill=none --prop opacity=0
done

# S6 CTA
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s6-cta-title" \
  --prop text="保持好奇，探索未知" --prop font="$FONT_CN" --prop size=48 --prop color=$COLOR_TEXT \
  --prop align=center --prop x=36cm --prop y=7cm --prop width=25cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --name="s6-cta-desc" \
  --prop text="属于人类的时空时代终将到来" --prop font="$FONT_CN" --prop size=20 --prop color=$COLOR_ACCENT \
  --prop align=center --prop x=36cm --prop y=10cm --prop width=25cm --prop height=1cm --prop fill=none

# --- SLIDE 2 (Statement) ---
officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move S1 content out
officecli set "$OUTPUT" '/slide[2]' --name="s1-title" --prop x=36cm --prop y=0cm
officecli set "$OUTPUT" '/slide[2]' --name="s1-subtitle" --prop x=36cm --prop y=2cm
officecli set "$OUTPUT" '/slide[2]' --name="s1-desc" --prop x=36cm --prop y=4cm

# Move Scene actors around
officecli set "$OUTPUT" '/slide[2]' --name="scene-circle" 
  --prop x=4cm --prop y=2cm --prop width=25cm --prop height=25cm --prop opacity=0.08
officecli set "$OUTPUT" '/slide[2]' --name="scene-slash" 
  --prop x=24cm --prop y=2cm --prop rotation=45
officecli set "$OUTPUT" '/slide[2]' --name="scene-line-top" 
  --prop x=11cm --prop y=4cm --prop width=12cm
officecli set "$OUTPUT" '/slide[2]' --name="scene-box" 
  --prop x=4cm --prop y=14cm --prop rotation=15

# Bring S2 content in
officecli set "$OUTPUT" '/slide[2]' --name="s2-statement" 
  --prop x=3cm --prop y=6cm
officecli set "$OUTPUT" '/slide[2]' --name="s2-desc" 
  --prop x=7cm --prop y=11cm

# --- SLIDE 3 (Pillars) ---
officecli add "$OUTPUT" '/' --from '/slide[2]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move S2 out
officecli set "$OUTPUT" '/slide[3]' --name="s2-statement" --prop x=36cm --prop y=1cm
officecli set "$OUTPUT" '/slide[3]' --name="s2-desc" --prop x=36cm --prop y=4cm

# Scene actors change
officecli set "$OUTPUT" '/slide[3]' --name="scene-circle" 
  --prop x=2cm --prop y=-5cm --prop width=30cm --prop height=30cm --prop opacity=0.05
officecli set "$OUTPUT" '/slide[3]' --name="scene-slash" 
  --prop x=2cm --prop y=2cm --prop rotation=90
officecli set "$OUTPUT" '/slide[3]' --name="scene-box" 
  --prop x=28cm --prop y=2cm --prop rotation=90

# Bring S3 header
officecli set "$OUTPUT" '/slide[3]' --name="s3-header" 
  --prop x=2cm --prop y=1.5cm

# Bring S3 Pillars in
officecli set "$OUTPUT" '/slide[3]' --name="s3-card-1" 
  --prop x=2cm --prop y=5cm --prop opacity=0.12 --prop animation=fade-entrance-300-with
officecli set "$OUTPUT" '/slide[3]' --name="s3-title-1" 
  --prop text="① 狭义相对论" --prop x=2.5cm --prop y=6cm --prop opacity=1 --prop animation=fade-entrance-400-with
officecli set "$OUTPUT" '/slide[3]' --name="s3-desc-1" 
  --prop text="速度越快，时间越慢。
光速旅行是通往未来的单程票。" 
  --prop x=2.5cm --prop y=8cm --prop opacity=1 --prop animation=fade-entrance-500-with

officecli set "$OUTPUT" '/slide[3]' --name="s3-card-2" 
  --prop x=12.5cm --prop y=5cm --prop opacity=0.12 --prop animation=fade-entrance-300-with
officecli set "$OUTPUT" '/slide[3]' --name="s3-title-2" 
  --prop text="② 广义相对论" --prop x=13cm --prop y=6cm --prop opacity=1 --prop animation=fade-entrance-400-with
officecli set "$OUTPUT" '/slide[3]' --name="s3-desc-2" 
  --prop text="引力扭曲时空。
黑洞边缘或虫洞可能是穿越时空的捷径。" 
  --prop x=13cm --prop y=8cm --prop opacity=1 --prop animation=fade-entrance-500-with

officecli set "$OUTPUT" '/slide[3]' --name="s3-card-3" 
  --prop x=23cm --prop y=5cm --prop opacity=0.12 --prop animation=fade-entrance-300-with
officecli set "$OUTPUT" '/slide[3]' --name="s3-title-3" 
  --prop text="③ 量子纠缠" --prop x=23.5cm --prop y=6cm --prop opacity=1 --prop animation=fade-entrance-400-with
officecli set "$OUTPUT" '/slide[3]' --name="s3-desc-3" 
  --prop text="微观层面的超距作用，
为超越光速的信息传输提供遐想。" 
  --prop x=23.5cm --prop y=8cm --prop opacity=1 --prop animation=fade-entrance-500-with

# --- SLIDE 4 (Evidence) ---
officecli add "$OUTPUT" '/' --from '/slide[3]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move S3 out
officecli set "$OUTPUT" '/slide[4]' --name="s3-header" --prop x=36cm --prop y=2cm
officecli set "$OUTPUT" '/slide[4]' --name="s3-card-1" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-title-1" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-desc-1" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-card-2" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-title-2" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-desc-2" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-card-3" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-title-3" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[4]' --name="s3-desc-3" --prop x=36cm --prop opacity=0

# Scene actors change
officecli set "$OUTPUT" '/slide[4]' --name="scene-circle" 
  --prop x=18cm --prop y=0cm --prop width=20cm --prop height=20cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[4]' --name="scene-slash" 
  --prop x=5cm --prop y=12cm --prop rotation=135
officecli set "$OUTPUT" '/slide[4]' --name="scene-box" 
  --prop x=2cm --prop y=5cm --prop rotation=180

# Bring S4 evidence in
officecli set "$OUTPUT" '/slide[4]' --name="s4-data-bg" 
  --prop x=2cm --prop y=4cm --prop opacity=0.2
officecli set "$OUTPUT" '/slide[4]' --name="s4-data-num" 
  --prop x=2cm --prop y=6cm --prop opacity=1
officecli set "$OUTPUT" '/slide[4]' --name="s4-data-desc" 
  --prop x=2cm --prop y=9cm --prop opacity=1

# --- SLIDE 5 (Timeline) ---
officecli add "$OUTPUT" '/' --from '/slide[4]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move S4 out
officecli set "$OUTPUT" '/slide[5]' --name="s4-data-bg" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[5]' --name="s4-data-num" --prop x=36cm --prop opacity=0
officecli set "$OUTPUT" '/slide[5]' --name="s4-data-desc" --prop x=36cm --prop opacity=0

# Scene actors change
officecli set "$OUTPUT" '/slide[5]' --name="scene-circle" 
  --prop x=0cm --prop y=0cm --prop width=10cm --prop height=10cm --prop opacity=0.15
officecli set "$OUTPUT" '/slide[5]' --name="scene-line-top" 
  --prop x=4cm --prop y=8.5cm --prop width=26cm --prop height=0.2cm --prop opacity=0.3
officecli set "$OUTPUT" '/slide[5]' --name="scene-box" 
  --prop x=15cm --prop y=6cm --prop width=4cm --prop height=4cm --prop rotation=0

# Bring S5 timeline in
officecli set "$OUTPUT" '/slide[5]' --name="s5-dot-1" 
  --prop x=5cm --prop y=8cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-year-1" 
  --prop text="20世纪" --prop x=2.5cm --prop y=6cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-desc-1" 
  --prop text="理论奠基
相对论与量子力学" --prop x=2.5cm --prop y=9.5cm --prop opacity=1

officecli set "$OUTPUT" '/slide[5]' --name="s5-dot-2" 
  --prop x=12cm --prop y=8cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-year-2" 
  --prop text="21世纪" --prop x=9.5cm --prop y=6cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-desc-2" 
  --prop text="实证阶段
微观粒子验证
时间膨胀" --prop x=9.5cm --prop y=9.5cm --prop opacity=1

officecli set "$OUTPUT" '/slide[5]' --name="s5-dot-3" 
  --prop x=19cm --prop y=8cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-year-3" 
  --prop text="22世纪" --prop x=16.5cm --prop y=6cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-desc-3" 
  --prop text="初步探索
光帆飞行器达到
20%光速" --prop x=16.5cm --prop y=9.5cm --prop opacity=1

officecli set "$OUTPUT" '/slide[5]' --name="s5-dot-4" 
  --prop x=26cm --prop y=8cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-year-4" 
  --prop text="23世纪" --prop x=23.5cm --prop y=6cm --prop opacity=1
officecli set "$OUTPUT" '/slide[5]' --name="s5-desc-4" 
  --prop text="深空航行
搭乘亚光速飞船
跨越星际" --prop x=23.5cm --prop y=9.5cm --prop opacity=1

# --- SLIDE 6 (CTA) ---
officecli add "$OUTPUT" '/' --from '/slide[5]'
officecli set "$OUTPUT" '/slide[6]' --prop transition=morph

# Move S5 out
for j in 1 2 3 4; do
  officecli set "$OUTPUT" '/slide[6]' --name="s5-dot-$j" --prop x=36cm --prop opacity=0
  officecli set "$OUTPUT" '/slide[6]' --name="s5-year-$j" --prop x=36cm --prop opacity=0
  officecli set "$OUTPUT" '/slide[6]' --name="s5-desc-$j" --prop x=36cm --prop opacity=0
done

# Scene actors change
officecli set "$OUTPUT" '/slide[6]' --name="scene-circle" 
  --prop x=9.5cm --prop y=2cm --prop width=15cm --prop height=15cm --prop opacity=0.2
officecli set "$OUTPUT" '/slide[6]' --name="scene-slash" 
  --prop x=28cm --prop y=12cm --prop rotation=180
officecli set "$OUTPUT" '/slide[6]' --name="scene-line-top" 
  --prop x=12cm --prop y=14cm --prop width=10cm

# Bring CTA in
officecli set "$OUTPUT" '/slide[6]' --name="s6-cta-title" 
  --prop x=4.5cm --prop y=7cm
officecli set "$OUTPUT" '/slide[6]' --name="s6-cta-desc" 
  --prop x=4.5cm --prop y=10cm

echo "Validation..."
officecli validate "$OUTPUT"
officecli view outline "$OUTPUT"
