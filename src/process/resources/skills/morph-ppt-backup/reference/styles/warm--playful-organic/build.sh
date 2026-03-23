#!/bin/bash
set -e

# Configuration
PPT_FILE="Cat-Secret-Life.pptx"
FONT_MAIN="思源黑体"
FONT_TITLE="Montserrat"
BG_COLOR="FFF8E7"
TEXT_DARK="3D3B3C"
TEXT_LIGHT="FFFFFF"
C_ORANGE="FF8A65"
C_YELLOW="FFD54F"
C_TEAL="4DB6AC"
C_DARK="3D3B3C"

# 1. Create file and Slide 1 (Hero)
echo "Creating PPT and Slide 1..."
officecli create "$PPT_FILE"
officecli add "$PPT_FILE" '/' --type slide --prop layout=blank --prop background="$BG_COLOR"

# ----- Define Scene Actors (Create on Slide 1) -----
# !!blob-main (Large background blob)
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="blob-main" --prop preset=roundRect --prop fill="$C_ORANGE" --prop opacity=0.15 --prop x=18cm --prop y=5cm --prop width=20cm --prop height=15cm --prop rotation=15

# !!dot-orange (Large orange circle)
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="dot-orange" --prop preset=ellipse --prop fill="$C_ORANGE" --prop x=0cm --prop y=12cm --prop width=12cm --prop height=12cm

# !!dot-yellow (Medium yellow circle)
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="dot-yellow" --prop preset=ellipse --prop fill="$C_YELLOW" --prop x=26cm --prop y=0cm --prop width=8cm --prop height=8cm

# !!line-teal (Teal accent pill)
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="line-teal" --prop preset=roundRect --prop fill="$C_TEAL" --prop x=6cm --prop y=4cm --prop width=3cm --prop height=0.6cm --prop rotation=-20

# !!tri-dark (Dark triangle)
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="tri-dark" --prop preset=triangle --prop fill="$C_DARK" --prop opacity=0.8 --prop x=30cm --prop y=15cm --prop width=3cm --prop height=3cm --prop rotation=45

# !!accent-star (Star)
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="accent-star" --prop preset=star5 --prop fill="$C_YELLOW" --prop x=10cm --prop y=16cm --prop width=2cm --prop height=2cm --prop rotation=10


# ----- Slide 1 Content Actors -----
# Hero Title
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="hero-title" --prop text="猫的秘密生活" --prop font="$FONT_MAIN" --prop size=72 --prop bold=true --prop color="$TEXT_DARK" --prop align=center --prop valign=middle --prop x=4.4cm --prop y=7cm --prop width=25cm --prop height=3.5cm

# Hero Subtitle
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="hero-sub" --prop text="人类观察报告（代号：喵星卧底）" --prop font="$FONT_MAIN" --prop size=32 --prop color="$TEXT_DARK" --prop opacity=0.8 --prop align=center --prop valign=middle --prop x=4.4cm --prop y=10.5cm --prop width=25cm --prop height=2cm

# ----- Define other slides' content actors (Ghosted on Slide 1) -----
# S2 Statement text
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="statement-main" --prop text="你以为你在养猫？
其实是猫在观察你。" --prop font="$FONT_MAIN" --prop size=54 --prop bold=true --prop color="$TEXT_LIGHT" --prop align=center --prop valign=middle --prop x=36cm --prop y=6cm --prop width=26cm --prop height=6cm

# S3 Pillars content
for i in {1..3}; do
  officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="pillar-bg-$i" --prop preset=roundRect --prop fill="$C_DARK" --prop opacity=0.05 --prop x=36cm --prop y=8cm --prop width=8cm --prop height=8cm
  officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="pillar-num-$i" --prop text="0$i" --prop font="$FONT_TITLE" --prop size=48 --prop bold=true --prop color="$C_ORANGE" --prop align=left --prop x=36cm --prop y=8cm --prop width=6cm --prop height=2cm
  officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="pillar-title-$i" --prop font="$FONT_MAIN" --prop size=28 --prop bold=true --prop color="$TEXT_DARK" --prop align=left --prop x=36cm --prop y=10cm --prop width=6cm --prop height=1.5cm
  officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="pillar-desc-$i" --prop font="$FONT_MAIN" --prop size=16 --prop color="$TEXT_DARK" --prop align=left --prop x=36cm --prop y=11.5cm --prop width=6.5cm --prop height=4cm
done
officecli set "$PPT_FILE" '/slide[1]/shape[12]' --prop text="日常充电"
officecli set "$PPT_FILE" '/slide[1]/shape[13]' --prop text="寻找阳光最充足的位置，进入深度休眠模式，补充能量。"
officecli set "$PPT_FILE" '/slide[1]/shape[16]' --prop text="幻觉狩猎"
officecli set "$PPT_FILE" '/slide[1]/shape[17]' --prop text="在夜深人静时，捕捉人类看不见的“空气猎物”。"
officecli set "$PPT_FILE" '/slide[1]/shape[20]' --prop text="高冷监视"
officecli set "$PPT_FILE" '/slide[1]/shape[21]' --prop text="居高临下，用充满智慧的眼神审视人类的愚蠢行为。"

# S4 Evidence content
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="evi-num" --prop text="70%" --prop font="$FONT_TITLE" --prop size=120 --prop bold=true --prop color="$TEXT_LIGHT" --prop align=right --prop x=36cm --prop y=5cm --prop width=15cm --prop height=6cm
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="evi-desc" --prop text="猫咪一生中睡觉的时间占比。剩余时间里，一半在舔毛，一半在夜间跑酷。" --prop font="$FONT_MAIN" --prop size=24 --prop color="$TEXT_LIGHT" --prop align=left --prop x=36cm --prop y=11cm --prop width=12cm --prop height=5cm

# S5 Comparison content
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="comp-title-l" --prop text="狗" --prop font="$FONT_MAIN" --prop size=64 --prop bold=true --prop color="$TEXT_LIGHT" --prop align=center --prop x=36cm --prop y=4cm --prop width=10cm --prop height=3cm
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="comp-desc-l" --prop text="“你是神！
你给我吃的！”" --prop font="$FONT_MAIN" --prop size=32 --prop color="$TEXT_LIGHT" --prop align=center --prop x=36cm --prop y=8cm --prop width=12cm --prop height=5cm
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="comp-title-r" --prop text="猫" --prop font="$FONT_MAIN" --prop size=64 --prop bold=true --prop color="$TEXT_LIGHT" --prop align=center --prop x=36cm --prop y=4cm --prop width=10cm --prop height=3cm
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="comp-desc-r" --prop text="“我是神！
你给我吃的！”" --prop font="$FONT_MAIN" --prop size=32 --prop color="$TEXT_LIGHT" --prop align=center --prop x=36cm --prop y=8cm --prop width=12cm --prop height=5cm

# S6 CTA content
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="cta-title" --prop text="观察结束，去开罐头吧！" --prop font="$FONT_MAIN" --prop size=54 --prop bold=true --prop color="$TEXT_DARK" --prop align=center --prop x=36cm --prop y=6cm --prop width=26cm --prop height=3cm
officecli add "$PPT_FILE" '/slide[1]' --type shape --prop name="cta-sub" --prop text="毕竟，主子已经等急了。" --prop font="$FONT_MAIN" --prop size=28 --prop color="$TEXT_DARK" --prop opacity=0.8 --prop align=center --prop x=36cm --prop y=10cm --prop width=26cm --prop height=2cm

echo "Slide 1 built."


# =================================================================================
# 2. Slide 2: Statement (The core realization)
# =================================================================================
echo "Building Slide 2..."
officecli add "$PPT_FILE" '/' --from '/slide[1]'
officecli set "$PPT_FILE" '/slide[2]' --prop transition=morph

# Move Hero content off-screen
officecli set "$PPT_FILE" '/slide[2]/shape[7]' --prop x=36cm --prop y=0cm # hero-title
officecli set "$PPT_FILE" '/slide[2]/shape[8]' --prop x=36cm --prop y=5cm # hero-sub

# Bring Statement content on-screen
officecli set "$PPT_FILE" '/slide[2]/shape[9]' --prop x=3.9cm --prop y=6cm

# Morph Scene Actors for Statement (Dark background via huge dark tri)
# Make !!tri-dark huge and cover the screen to create a dark background
officecli set "$PPT_FILE" '/slide[2]/shape[5]' --prop preset=rect --prop x=0cm --prop y=0cm --prop width=45cm --prop height=30cm --prop rotation=0 --prop opacity=1

# Adjust other scene actors
officecli set "$PPT_FILE" '/slide[2]/shape[1]' --prop x=0cm --prop y=12cm --prop width=10cm --prop height=10cm --prop rotation=45 --prop opacity=0.3 # blob
officecli set "$PPT_FILE" '/slide[2]/shape[2]' --prop x=28cm --prop y=2cm --prop width=8cm --prop height=8cm --prop opacity=0.5 # dot-orange
officecli set "$PPT_FILE" '/slide[2]/shape[3]' --prop x=5cm --prop y=0cm --prop width=12cm --prop height=12cm --prop opacity=0.2 # dot-yellow
officecli set "$PPT_FILE" '/slide[2]/shape[4]' --prop x=16cm --prop y=15cm --prop width=4cm --prop height=0.6cm --prop rotation=0 # line-teal
officecli set "$PPT_FILE" '/slide[2]/shape[6]' --prop x=25cm --prop y=14cm --prop rotation=90 # accent-star


# =================================================================================
# 3. Slide 3: Pillars (Three core behaviors)
# =================================================================================
echo "Building Slide 3..."
officecli add "$PPT_FILE" '/' --from '/slide[2]'
officecli set "$PPT_FILE" '/slide[3]' --prop transition=morph

# Ghost previous content
officecli set "$PPT_FILE" '/slide[3]/shape[9]' --prop x=36cm --prop y=0cm # statement-main

# Scene Actors Morph: Revert dark bg, structure nicely
officecli set "$PPT_FILE" '/slide[3]/shape[5]' --prop preset=triangle --prop x=28cm --prop y=0cm --prop width=8cm --prop height=8cm --prop rotation=180 --prop opacity=0.1 # tri-dark returns to normal
officecli set "$PPT_FILE" '/slide[3]/shape[1]' --prop x=2cm --prop y=2cm --prop width=30cm --prop height=15cm --prop rotation=0 --prop opacity=0.05 # blob-main
officecli set "$PPT_FILE" '/slide[3]/shape[2]' --prop x=0cm --prop y=0cm --prop width=15cm --prop height=15cm --prop opacity=0.1 # dot-orange
officecli set "$PPT_FILE" '/slide[3]/shape[3]' --prop x=25cm --prop y=14cm --prop width=12cm --prop height=12cm --prop opacity=0.1 # dot-yellow
officecli set "$PPT_FILE" '/slide[3]/shape[4]' --prop x=1.5cm --prop y=1.5cm --prop width=30cm --prop height=0.2cm --prop rotation=0 # line-teal spans top
officecli set "$PPT_FILE" '/slide[3]/shape[6]' --prop x=2cm --prop y=16cm --prop rotation=180 # accent-star

# Bring Pillars on-screen
# Col 1: x=2.5cm
officecli set "$PPT_FILE" '/slide[3]/shape[10]' --prop x=2.5cm --prop y=4cm --prop width=8cm --prop height=12cm
officecli set "$PPT_FILE" '/slide[3]/shape[11]' --prop x=3.5cm --prop y=5cm --prop animation=fade-entrance-400-with
officecli set "$PPT_FILE" '/slide[3]/shape[12]' --prop x=3.5cm --prop y=7cm --prop animation=fade-entrance-400-with
officecli set "$PPT_FILE" '/slide[3]/shape[13]' --prop x=3.5cm --prop y=8.5cm --prop width=6cm --prop height=6cm --prop animation=fade-entrance-400-with

# Col 2: x=12.5cm
officecli set "$PPT_FILE" '/slide[3]/shape[14]' --prop x=12.9cm --prop y=4cm --prop width=8cm --prop height=12cm
officecli set "$PPT_FILE" '/slide[3]/shape[15]' --prop x=13.9cm --prop y=5cm --prop animation=fade-entrance-400-with-delay=100
officecli set "$PPT_FILE" '/slide[3]/shape[16]' --prop x=13.9cm --prop y=7cm --prop animation=fade-entrance-400-with-delay=100
officecli set "$PPT_FILE" '/slide[3]/shape[17]' --prop x=13.9cm --prop y=8.5cm --prop width=6cm --prop height=6cm --prop animation=fade-entrance-400-with-delay=100

# Col 3: x=22.5cm
officecli set "$PPT_FILE" '/slide[3]/shape[18]' --prop x=23.3cm --prop y=4cm --prop width=8cm --prop height=12cm
officecli set "$PPT_FILE" '/slide[3]/shape[19]' --prop x=24.3cm --prop y=5cm --prop animation=fade-entrance-400-with-delay=200
officecli set "$PPT_FILE" '/slide[3]/shape[20]' --prop x=24.3cm --prop y=7cm --prop animation=fade-entrance-400-with-delay=200
officecli set "$PPT_FILE" '/slide[3]/shape[21]' --prop x=24.3cm --prop y=8.5cm --prop width=6cm --prop height=6cm --prop animation=fade-entrance-400-with-delay=200


# =================================================================================
# 4. Slide 4: Evidence (Data Reveal)
# =================================================================================
echo "Building Slide 4..."
officecli add "$PPT_FILE" '/' --from '/slide[3]'
officecli set "$PPT_FILE" '/slide[4]' --prop transition=morph

# Ghost Pillars
for i in {10..21}; do
  officecli set "$PPT_FILE" "/slide[4]/shape[$i]" --prop x=36cm
done

# Scene Actors Morph: Asymmetric data highlight
# Use !!blob-main as dark background on the left
officecli set "$PPT_FILE" '/slide[4]/shape[1]' --prop fill="$C_TEAL" --prop x=0cm --prop y=0cm --prop width=25cm --prop height=30cm --prop rotation=0 --prop opacity=1

# Other actors
officecli set "$PPT_FILE" '/slide[4]/shape[2]' --prop x=24cm --prop y=10cm --prop width=8cm --prop height=8cm --prop opacity=1 # dot-orange
officecli set "$PPT_FILE" '/slide[4]/shape[3]' --prop x=28cm --prop y=2cm --prop width=4cm --prop height=4cm --prop opacity=1 # dot-yellow
officecli set "$PPT_FILE" '/slide[4]/shape[4]' --prop x=18cm --prop y=4cm --prop width=6cm --prop height=0.6cm --prop rotation=45 # line-teal
officecli set "$PPT_FILE" '/slide[4]/shape[5]' --prop x=20cm --prop y=14cm --prop width=4cm --prop height=4cm --prop rotation=90 # tri-dark
officecli set "$PPT_FILE" '/slide[4]/shape[6]' --prop x=30cm --prop y=16cm --prop rotation=30 # accent-star

# Bring Evidence on-screen
officecli set "$PPT_FILE" '/slide[4]/shape[22]' --prop x=1cm --prop y=4cm --prop align=center # evi-num (over teal background)
officecli set "$PPT_FILE" '/slide[4]/shape[23]' --prop x=1cm --prop y=12cm --prop width=13cm --prop align=center # evi-desc (over teal background)


# =================================================================================
# 5. Slide 5: Comparison (Dog vs. Cat)
# =================================================================================
echo "Building Slide 5..."
officecli add "$PPT_FILE" '/' --from '/slide[4]'
officecli set "$PPT_FILE" '/slide[5]' --prop transition=morph

# Ghost Evidence
officecli set "$PPT_FILE" '/slide[5]/shape[22]' --prop x=36cm
officecli set "$PPT_FILE" '/slide[5]/shape[23]' --prop x=36cm

# Scene Actors Morph: Split 50/50
# !!blob-main (Teal) goes left
officecli set "$PPT_FILE" '/slide[5]/shape[1]' --prop preset=rect --prop fill="$C_TEAL" --prop x=0cm --prop y=0cm --prop width=16.9cm --prop height=19.05cm --prop opacity=1

# !!dot-orange morphs into huge right background
officecli set "$PPT_FILE" '/slide[5]/shape[2]' --prop preset=rect --prop x=16.9cm --prop y=0cm --prop width=17cm --prop height=19.05cm --prop rotation=0 --prop opacity=1

# Other actors small/scattered
officecli set "$PPT_FILE" '/slide[5]/shape[3]' --prop x=14cm --prop y=16cm --prop width=6cm --prop height=6cm --prop opacity=0.3 # dot-yellow
officecli set "$PPT_FILE" '/slide[5]/shape[4]' --prop x=16.9cm --prop y=0cm --prop width=0.4cm --prop height=19cm --prop rotation=0 --prop fill="$TEXT_LIGHT" # line-teal becomes divider
officecli set "$PPT_FILE" '/slide[5]/shape[5]' --prop x=2cm --prop y=2cm --prop width=3cm --prop height=3cm --prop rotation=180 --prop opacity=0.3 # tri-dark
officecli set "$PPT_FILE" '/slide[5]/shape[6]' --prop x=30cm --prop y=2cm --prop opacity=0.3 # accent-star

# Bring Comparison on-screen
# Left (Dog)
officecli set "$PPT_FILE" '/slide[5]/shape[24]' --prop x=3.5cm --prop y=4cm # comp-title-l
officecli set "$PPT_FILE" '/slide[5]/shape[25]' --prop x=2.5cm --prop y=9cm # comp-desc-l
# Right (Cat)
officecli set "$PPT_FILE" '/slide[5]/shape[26]' --prop x=20cm --prop y=4cm # comp-title-r
officecli set "$PPT_FILE" '/slide[5]/shape[27]' --prop x=19cm --prop y=9cm # comp-desc-r


# =================================================================================
# 6. Slide 6: CTA (Conclusion)
# =================================================================================
echo "Building Slide 6..."
officecli add "$PPT_FILE" '/' --from '/slide[5]'
officecli set "$PPT_FILE" '/slide[6]' --prop transition=morph

# Ghost Comparison
officecli set "$PPT_FILE" '/slide[6]/shape[24]' --prop x=36cm
officecli set "$PPT_FILE" '/slide[6]/shape[25]' --prop x=36cm
officecli set "$PPT_FILE" '/slide[6]/shape[26]' --prop x=36cm
officecli set "$PPT_FILE" '/slide[6]/shape[27]' --prop x=36cm

# Scene Actors Morph: Back to Hero-like but warmer/inviting
officecli set "$PPT_FILE" '/slide[6]/shape[1]' --prop preset=roundRect --prop fill="$C_YELLOW" --prop x=6.9cm --prop y=4cm --prop width=20cm --prop height=11cm --prop rotation=0 --prop opacity=0.2 # blob-main
officecli set "$PPT_FILE" '/slide[6]/shape[2]' --prop preset=ellipse --prop fill="$C_ORANGE" --prop x=28cm --prop y=12cm --prop width=10cm --prop height=10cm --prop rotation=0 --prop opacity=0.8 # dot-orange
officecli set "$PPT_FILE" '/slide[6]/shape[3]' --prop x=0cm --prop y=0cm --prop width=8cm --prop height=8cm --prop opacity=0.8 # dot-yellow
officecli set "$PPT_FILE" '/slide[6]/shape[4]' --prop x=20cm --prop y=15cm --prop width=6cm --prop height=0.6cm --prop fill="$C_TEAL" --prop rotation=-10 # line-teal
officecli set "$PPT_FILE" '/slide[6]/shape[5]' --prop preset=triangle --prop x=5cm --prop y=15cm --prop width=4cm --prop height=4cm --prop rotation=45 --prop opacity=0.5 # tri-dark
officecli set "$PPT_FILE" '/slide[6]/shape[6]' --prop x=16cm --prop y=3cm --prop width=3cm --prop height=3cm --prop rotation=45 --prop opacity=1 # accent-star

# Bring CTA on-screen
officecli set "$PPT_FILE" '/slide[6]/shape[28]' --prop x=3.9cm --prop y=6.5cm
officecli set "$PPT_FILE" '/slide[6]/shape[29]' --prop x=3.9cm --prop y=9.5cm

echo "Validating PPT..."
officecli validate "$PPT_FILE"
officecli view "$PPT_FILE" outline

echo "Done! Presentation is ready: $PPT_FILE"
