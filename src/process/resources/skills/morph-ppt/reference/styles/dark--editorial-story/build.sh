#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__editorial_story.pptx"

echo "Building: dark--editorial-story (Editorial Magazine)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=FFFFFF
DARK=2C3E50
RED=E74C3C
GRAY_BG=F5F5F5
TEXT_DARK=2D3436
TEXT_GRAY=666666
TEXT_LIGHT=999999

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors (8 shapes: shape[1-8])
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ellipse-1' \
  --prop preset=ellipse \
  --prop fill=$RED \
  --prop opacity=0.08 \
  --prop x=24cm --prop y=8cm --prop width=8cm --prop height=8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ellipse-2' \
  --prop preset=ellipse \
  --prop fill=$DARK \
  --prop opacity=0.05 \
  --prop x=3cm --prop y=12cm --prop width=5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!top-bar' \
  --prop preset=rect \
  --prop fill=$DARK \
  --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bottom-bar' \
  --prop preset=rect \
  --prop fill=$DARK \
  --prop x=0cm --prop y=18.25cm --prop width=33.87cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!left-accent' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=1cm --prop y=3cm --prop width=0.3cm --prop height=12cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!frame-border' \
  --prop preset=rect \
  --prop fill=none \
  --prop line=$DARK \
  --prop lineWidth=2pt \
  --prop x=0.5cm --prop y=0.5cm --prop width=32.87cm --prop height=18.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!bg-panel' \
  --prop preset=rect \
  --prop fill=$GRAY_BG \
  --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ellipse-3' \
  --prop preset=ellipse \
  --prop fill=$RED \
  --prop opacity=0.06 \
  --prop x=26cm --prop y=10cm --prop width=6cm --prop height=6cm

# Slide 1 content (11 shapes: shape[9-19])
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-label-bg' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=26cm --prop y=2cm --prop width=5cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-label-text' \
  --prop text='VOL.06' \
  --prop font='Arial Black' \
  --prop size=18 \
  --prop color=$BG \
  --prop align=center \
  --prop fill=none \
  --prop x=26cm --prop y=2.3cm --prop width=5cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title-cn' \
  --prop text='编辑故事' \
  --prop font='Microsoft YaHei' \
  --prop size=64 \
  --prop bold=true \
  --prop color=$DARK \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=5cm --prop width=20cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title-en' \
  --prop text='EDITORIAL STORY' \
  --prop font='Georgia' \
  --prop size=28 \
  --prop color=$RED \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=8.5cm --prop width=18cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-divider' \
  --prop preset=rect \
  --prop fill=$DARK \
  --prop x=3cm --prop y=11cm --prop width=12cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle-cn' \
  --prop text='探索故事的力量' \
  --prop font='Microsoft YaHei' \
  --prop size=20 \
  --prop color=$TEXT_GRAY \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=11.5cm --prop width=12cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle-en' \
  --prop text='The Power of Storytelling' \
  --prop font='Georgia' \
  --prop size=14 \
  --prop color=$TEXT_LIGHT \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=12.8cm --prop width=15cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-image-bg' \
  --prop preset=roundRect \
  --prop fill=$GRAY_BG \
  --prop x=20cm --prop y=4cm --prop width=12cm --prop height=10cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-image-line' \
  --prop preset=rect \
  --prop fill=$DARK \
  --prop x=20cm --prop y=4cm --prop width=0.2cm --prop height=10cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-image-text' \
  --prop text='图片区域' \
  --prop font='Microsoft YaHei' \
  --prop size=14 \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=20cm --prop y=8.5cm --prop width=12cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-date' \
  --prop text='2026年3月刊' \
  --prop font='Microsoft YaHei' \
  --prop size=12 \
  --prop color=$TEXT_GRAY \
  --prop align=left \
  --prop fill=none \
  --prop x=3cm --prop y=16cm --prop width=6cm --prop height=0.6cm

# Slide 2 content off-canvas (11 shapes: shape[20-30])
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-chapter-bg' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=$OFFSCREEN --prop y=1.5cm --prop width=3cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-chapter-text' \
  --prop text='CHAPTER 01' \
  --prop font='Arial Black' \
  --prop size=12 \
  --prop color=$BG \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=1.65cm --prop width=3cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-image-bg' \
  --prop preset=roundRect \
  --prop fill=$BG \
  --prop opacity=0.95 \
  --prop x=$OFFSCREEN --prop y=2.5cm --prop width=15cm --prop height=14cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-image-line' \
  --prop preset=rect \
  --prop fill=$DARK \
  --prop x=$OFFSCREEN --prop y=2.5cm --prop width=15cm --prop height=0.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-image-text' \
  --prop text='配图区域' \
  --prop font='Microsoft YaHei' \
  --prop size=14 \
  --prop color=$TEXT_LIGHT \
  --prop align=center \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=9cm --prop width=15cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-title-cn' \
  --prop text='一个改变世界的故事' \
  --prop font='Microsoft YaHei' \
  --prop size=42 \
  --prop bold=true \
  --prop color=$DARK \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=3cm --prop width=14cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-title-en' \
  --prop text='A Story That Changed The World' \
  --prop font='Georgia' \
  --prop size=18 \
  --prop color=$RED \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5.5cm --prop width=14cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-divider' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=$OFFSCREEN --prop y=7cm --prop width=6cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-body-1' \
  --prop text='在这个充满变革的时代，故事的力量从未如此重要。每一个伟大的想法背后，都有一个令人动容的故事。' \
  --prop font='Microsoft YaHei' \
  --prop size=16 \
  --prop color=333333 \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-body-2' \
  --prop text='我们相信，好的故事能够跨越时空，连接人心，创造无限可能。' \
  --prop font='Microsoft YaHei' \
  --prop size=14 \
  --prop color=$TEXT_GRAY \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=10.5cm --prop width=14cm --prop height=2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s2-body-3' \
  --prop text='无论是品牌的成长历程，还是产品的诞生故事，每一个细节都值得被讲述、被铭记。' \
  --prop font='Microsoft YaHei' \
  --prop size=14 \
  --prop color=$TEXT_GRAY \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=12.5cm --prop width=14cm --prop height=2cm

# Note: Total shapes so far = 8 + 11 + 11 = 30

# Slide 3 content off-canvas (10 shapes: shape[31-40])
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-quote-mark' \
  --prop text='"' \
  --prop font='Georgia' \
  --prop size=320 \
  --prop color=$RED \
  --prop opacity=0.15 \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=0cm --prop width=10cm --prop height=10cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-quote-cn' \
  --prop text='好的设计是诚实的。' \
  --prop font='Microsoft YaHei' \
  --prop size=52 \
  --prop bold=true \
  --prop color=$DARK \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=6cm --prop width=24cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-quote-en' \
  --prop text='Good design is honest.' \
  --prop font='Georgia' \
  --prop size=28 \
  --prop color=$RED \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=9cm --prop width=20cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-divider' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=$OFFSCREEN --prop y=11cm --prop width=6cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-author-card' \
  --prop preset=roundRect \
  --prop fill=$BG \
  --prop opacity=0.95 \
  --prop x=$OFFSCREEN --prop y=12.5cm --prop width=14cm --prop height=4cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-author-line' \
  --prop preset=rect \
  --prop fill=$DARK \
  --prop x=$OFFSCREEN --prop y=12.5cm --prop width=14cm --prop height=0.12cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-author-avatar' \
  --prop preset=ellipse \
  --prop fill=$DARK \
  --prop x=$OFFSCREEN --prop y=13.5cm --prop width=1.5cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-author-name-cn' \
  --prop text='迪特·拉姆斯' \
  --prop font='Microsoft YaHei' \
  --prop size=20 \
  --prop bold=true \
  --prop color=$TEXT_DARK \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=13.8cm --prop width=10cm --prop height=1cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-author-name-en' \
  --prop text='Dieter Rams' \
  --prop font='Georgia' \
  --prop size=14 \
  --prop color=$TEXT_GRAY \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=15cm --prop width=10cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s3-author-title' \
  --prop text='德国工业设计大师' \
  --prop font='Microsoft YaHei' \
  --prop size=12 \
  --prop color=$TEXT_LIGHT \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=15.8cm --prop width=10cm --prop height=0.6cm

# Total shapes so far = 30 + 10 = 40

# Slide 4 content off-canvas (minimal - we'll reuse slide 2 layout)
# Skip for now - will use slide 2 shapes repositioned

# Slide 5 content off-canvas (minimal - we'll use simple text)
# Skip for now

# Slide 6 content off-canvas (6 shapes: shape[41-46])
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-thanks-cn' \
  --prop text='感谢阅读' \
  --prop font='Microsoft YaHei' \
  --prop size=56 \
  --prop bold=true \
  --prop color=$BG \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=5cm --prop width=15cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-thanks-en' \
  --prop text='THANK YOU FOR READING' \
  --prop font='Georgia' \
  --prop size=24 \
  --prop color=$RED \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=8.5cm --prop width=15cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-divider' \
  --prop preset=rect \
  --prop fill=$RED \
  --prop x=$OFFSCREEN --prop y=10.5cm --prop width=8cm --prop height=0.15cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-contact-label' \
  --prop text='联系我们' \
  --prop font='Microsoft YaHei' \
  --prop size=14 \
  --prop color=$TEXT_LIGHT \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=12cm --prop width=6cm --prop height=0.6cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-email' \
  --prop text='editorial@story.com' \
  --prop font='Georgia' \
  --prop size=16 \
  --prop color=$BG \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=13cm --prop width=12cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s6-website' \
  --prop text='www.editorialstory.com' \
  --prop font='Georgia' \
  --prop size=16 \
  --prop color=$BG \
  --prop align=left \
  --prop fill=none \
  --prop x=$OFFSCREEN --prop y=14.2cm --prop width=12cm --prop height=0.8cm

# Total shapes = 8 + 11 + 11 + 10 + 6 = 46

# ============================================
# SLIDE 2 - STORY
# ============================================
echo "Building Slide 2: Story..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Morph scene actors
officecli set "$OUTPUT" '/slide[2]/shape[1]' --prop x=26cm --prop y=10cm --prop width=6cm --prop height=6cm --prop opacity=0.06
officecli set "$OUTPUT" '/slide[2]/shape[2]' --prop x=3cm --prop y=14cm --prop width=4cm --prop height=4cm --prop opacity=0.04
officecli set "$OUTPUT" '/slide[2]/shape[3]' --prop height=0.5cm
officecli set "$OUTPUT" '/slide[2]/shape[4]' --prop y=18.55cm --prop height=0.5cm
officecli set "$OUTPUT" '/slide[2]/shape[5]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[2]/shape[6]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[2]/shape[7]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[2]/shape[8]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm

# Hide slide 1 content
for i in {9..19}; do
  officecli set "$OUTPUT" "/slide[2]/shape[$i]" --prop x=$OFFSCREEN
done

# Show slide 2 content
officecli set "$OUTPUT" '/slide[2]/shape[20]' --prop x=2cm
officecli set "$OUTPUT" '/slide[2]/shape[21]' --prop x=2cm
officecli set "$OUTPUT" '/slide[2]/shape[22]' --prop x=1cm
officecli set "$OUTPUT" '/slide[2]/shape[23]' --prop x=1cm
officecli set "$OUTPUT" '/slide[2]/shape[24]' --prop x=1cm
officecli set "$OUTPUT" '/slide[2]/shape[25]' --prop x=18cm
officecli set "$OUTPUT" '/slide[2]/shape[26]' --prop x=18cm
officecli set "$OUTPUT" '/slide[2]/shape[27]' --prop x=18cm
officecli set "$OUTPUT" '/slide[2]/shape[28]' --prop x=18cm
officecli set "$OUTPUT" '/slide[2]/shape[29]' --prop x=18cm
officecli set "$OUTPUT" '/slide[2]/shape[30]' --prop x=18cm

# ============================================
# SLIDE 3 - QUOTE
# ============================================
echo "Building Slide 3: Quote..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Morph scene actors
officecli set "$OUTPUT" '/slide[3]/shape[1]' --prop x=26cm --prop y=12cm --prop width=6cm --prop height=6cm --prop opacity=0.06
officecli set "$OUTPUT" '/slide[3]/shape[2]' --prop x=5cm --prop y=12cm --prop width=4cm --prop height=4cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[3]/shape[3]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[4]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[5]' --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm
officecli set "$OUTPUT" '/slide[3]/shape[6]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[3]/shape[7]' --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=19.05cm --prop fill=$GRAY_BG
officecli set "$OUTPUT" '/slide[3]/shape[8]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm

# Hide previous content
for i in {9..30}; do
  officecli set "$OUTPUT" "/slide[3]/shape[$i]" --prop x=$OFFSCREEN
done

# Show slide 3 content
officecli set "$OUTPUT" '/slide[3]/shape[31]' --prop x=3cm
officecli set "$OUTPUT" '/slide[3]/shape[32]' --prop x=5cm
officecli set "$OUTPUT" '/slide[3]/shape[33]' --prop x=5cm
officecli set "$OUTPUT" '/slide[3]/shape[34]' --prop x=5cm
officecli set "$OUTPUT" '/slide[3]/shape[35]' --prop x=5cm
officecli set "$OUTPUT" '/slide[3]/shape[36]' --prop x=5cm
officecli set "$OUTPUT" '/slide[3]/shape[37]' --prop x=6cm
officecli set "$OUTPUT" '/slide[3]/shape[38]' --prop x=8cm
officecli set "$OUTPUT" '/slide[3]/shape[39]' --prop x=8cm
officecli set "$OUTPUT" '/slide[3]/shape[40]' --prop x=8cm

# ============================================
# SLIDE 4 - SIMPLIFIED
# ============================================
echo "Building Slide 4: Team (simplified)..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Morph scene actors back
officecli set "$OUTPUT" '/slide[4]/shape[1]' --prop x=28cm --prop y=2cm --prop width=4cm --prop height=4cm --prop opacity=0.06
officecli set "$OUTPUT" '/slide[4]/shape[2]' --prop x=3cm --prop y=14cm --prop width=4cm --prop height=4cm --prop opacity=0.04
officecli set "$OUTPUT" '/slide[4]/shape[3]' --prop height=0.5cm
officecli set "$OUTPUT" '/slide[4]/shape[4]' --prop y=18.55cm --prop height=0.5cm
officecli set "$OUTPUT" '/slide[4]/shape[5]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[6]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[7]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[4]/shape[8]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm

# Hide all content
for i in {9..40}; do
  officecli set "$OUTPUT" "/slide[4]/shape[$i]" --prop x=$OFFSCREEN
done

# Reuse slide 2 title as placeholder
officecli set "$OUTPUT" '/slide[4]/shape[25]' --prop x=3cm --prop y=7cm --prop text='编辑团队'

# ============================================
# SLIDE 5 - SIMPLIFIED
# ============================================
echo "Building Slide 5: Data (simplified)..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Morph scene actors
officecli set "$OUTPUT" '/slide[5]/shape[1]' --prop x=26cm --prop y=10cm --prop width=5cm --prop height=5cm --prop opacity=0.06
officecli set "$OUTPUT" '/slide[5]/shape[2]' --prop x=3cm --prop y=14cm --prop width=4cm --prop height=4cm --prop opacity=0.04
officecli set "$OUTPUT" '/slide[5]/shape[3]' --prop height=0.5cm
officecli set "$OUTPUT" '/slide[5]/shape[4]' --prop y=18.55cm --prop height=0.5cm
officecli set "$OUTPUT" '/slide[5]/shape[5]' --prop x=1cm --prop y=2cm --prop width=0.2cm --prop height=14cm
officecli set "$OUTPUT" '/slide[5]/shape[6]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[5]/shape[7]' --prop x=0cm --prop y=0.5cm --prop width=8cm --prop height=18.55cm --prop fill=$GRAY_BG
officecli set "$OUTPUT" '/slide[5]/shape[8]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm

# Hide all content
for i in {9..40}; do
  officecli set "$OUTPUT" "/slide[5]/shape[$i]" --prop x=$OFFSCREEN
done

# Reuse slide 2 title as placeholder
officecli set "$OUTPUT" '/slide[5]/shape[25]' --prop x=10cm --prop y=2cm --prop text='数据洞察'

# ============================================
# SLIDE 6 - THANKS
# ============================================
echo "Building Slide 6: Thanks..."

officecli add "$OUTPUT" '/' --from '/slide[1]'
officecli set "$OUTPUT" '/slide[6]' --prop transition=morph

# Morph scene actors
officecli set "$OUTPUT" '/slide[6]/shape[1]' --prop x=5cm --prop y=12cm --prop width=4cm --prop height=4cm --prop opacity=0.1
officecli set "$OUTPUT" '/slide[6]/shape[2]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[6]/shape[3]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[6]/shape[4]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[6]/shape[5]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[6]/shape[6]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm
officecli set "$OUTPUT" '/slide[6]/shape[7]' --prop x=0cm --prop y=0cm --prop width=20cm --prop height=19.05cm --prop fill=$DARK
officecli set "$OUTPUT" '/slide[6]/shape[8]' --prop x=0cm --prop y=0cm --prop width=0.1cm --prop height=0.1cm

# Hide all previous content
for i in {9..40}; do
  officecli set "$OUTPUT" "/slide[6]/shape[$i]" --prop x=$OFFSCREEN
done

# Show slide 6 content
officecli set "$OUTPUT" '/slide[6]/shape[41]' --prop x=3cm
officecli set "$OUTPUT" '/slide[6]/shape[42]' --prop x=3cm
officecli set "$OUTPUT" '/slide[6]/shape[43]' --prop x=3cm
officecli set "$OUTPUT" '/slide[6]/shape[44]' --prop x=3cm
officecli set "$OUTPUT" '/slide[6]/shape[45]' --prop x=3cm
officecli set "$OUTPUT" '/slide[6]/shape[46]' --prop x=3cm

# ============================================
# VALIDATE & COMPLETE
# ============================================
echo "Validating..."
bash "$(dirname "$0")/../../morph-helpers.sh" validate "$OUTPUT"

echo "✅ Build complete: $OUTPUT"
