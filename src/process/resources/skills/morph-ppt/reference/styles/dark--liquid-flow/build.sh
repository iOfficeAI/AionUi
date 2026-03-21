#!/bin/bash

# LUXE 2025 Brand Visual Upgrade - S07 Liquid Flow Style
# 6-slide morph presentation with asymmetric ellipses and fluid animations

OUTPUT="/Users/veryliu/Documents/GitHub/OfficeCli/.tmp/morph-test/test12-brand-liquid.pptx"

# Colors
BG="0F0F2D"
VIOLET="6C63FF"
MINT="48E5C2"
CORAL="FF6B8A"
EBLUE="3D5AFE"
AMBER="F5AF19"
TITLE="F5F5FF"
BODY="C8C8FF"
MUTED="8888CC"

echo "=== Creating LUXE 2025 Brand Visual Upgrade PPT ==="

# Create presentation
officecli create "$OUTPUT"

echo ""
echo "=== SLIDE 1: Hero - LUXE 品牌视觉升级 2025 ==="
officecli add "$OUTPUT" / --type slide --prop layout=blank --prop title="hero"

# Background
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill="$BG" --prop line=none

# Large fluid blobs (4 blobs)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop x=2cm --prop y=3cm --prop width=12cm --prop height=8cm --prop fill="$VIOLET" --prop opacity=0.35 --prop rotation=15 --prop line=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop x=20cm --prop y=2cm --prop width=10cm --prop height=14cm --prop fill="$MINT" --prop opacity=0.28 --prop rotation=25 --prop line=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop x=8cm --prop y=10cm --prop width=13cm --prop height=9cm --prop fill="$CORAL" --prop opacity=0.32 --prop rotation=18 --prop line=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop x=24cm --prop y=11cm --prop width=9cm --prop height=11cm --prop fill="$EBLUE" --prop opacity=0.38 --prop rotation=22 --prop line=none

# Small droplets (3 droplets)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop x=15cm --prop y=5cm --prop width=3.5cm --prop height=2.8cm --prop fill="$AMBER" --prop opacity=0.55 --prop rotation=12 --prop line=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop x=18cm --prop y=14cm --prop width=4cm --prop height=3.2cm --prop fill="$MINT" --prop opacity=0.58 --prop rotation=28 --prop line=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop x=6cm --prop y=16cm --prop width=2.8cm --prop height=3.8cm --prop fill="$VIOLET" --prop opacity=0.52 --prop rotation=35 --prop line=none

# Title text
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="LUXE" --prop x=3cm --prop y=6cm --prop width=28cm --prop height=3cm --prop size=72pt --prop bold=true --prop color="$TITLE" --prop align=center
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="品牌视觉升级 2025" --prop x=3cm --prop y=9.5cm --prop width=28cm --prop height=2cm --prop size=42pt --prop color="$BODY" --prop align=center

echo ""
echo "=== SLIDE 2: Statement - 从经典到未来，流动不止 ==="
officecli add "$OUTPUT" / --type slide --prop layout=blank --prop title="statement" --prop transition=morph

# Background
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill="$BG" --prop line=none

# Large fluid blobs (4 blobs) - rotated and moved from S1
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop x=4cm --prop y=1cm --prop width=15cm --prop height=10cm --prop fill="$VIOLET" --prop opacity=0.40 --prop rotation=45 --prop line=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop x=18cm --prop y=8cm --prop width=13cm --prop height=9cm --prop fill="$MINT" --prop opacity=0.33 --prop rotation=52 --prop line=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop x=1cm --prop y=9cm --prop width=10cm --prop height=13cm --prop fill="$CORAL" --prop opacity=0.36 --prop rotation=48 --prop line=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop x=22cm --prop y=3cm --prop width=11cm --prop height=8cm --prop fill="$EBLUE" --prop opacity=0.42 --prop rotation=58 --prop line=none

# Small droplets (3 droplets) - moved
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop x=12cm --prop y=8cm --prop width=4.2cm --prop height=3.5cm --prop fill="$AMBER" --prop opacity=0.60 --prop rotation=38 --prop line=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop x=25cm --prop y=12cm --prop width=3.2cm --prop height=4.5cm --prop fill="$MINT" --prop opacity=0.56 --prop rotation=55 --prop line=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop x=8cm --prop y=15cm --prop width=3.8cm --prop height=2.6cm --prop fill="$VIOLET" --prop opacity=0.54 --prop rotation=62 --prop line=none

# Statement text
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="从经典到未来" --prop x=5cm --prop y=6cm --prop width=24cm --prop height=2.5cm --prop size=56pt --prop bold=true --prop color="$TITLE" --prop align=center
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="流动不止" --prop x=5cm --prop y=9cm --prop width=24cm --prop height=2cm --prop size=48pt --prop color="$BODY" --prop align=center

echo ""
echo "=== SLIDE 3: Pillars - 三大升级 ==="
officecli add "$OUTPUT" / --type slide --prop layout=blank --prop title="pillars" --prop transition=morph

# Background
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill="$BG" --prop line=none

# Large fluid blobs (5 blobs) - further transformed
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop x=1cm --prop y=4cm --prop width=9cm --prop height=12cm --prop fill="$VIOLET" --prop opacity=0.30 --prop rotation=70 --prop line=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop x=10cm --prop y=1cm --prop width=12cm --prop height=8cm --prop fill="$MINT" --prop opacity=0.35 --prop rotation=78 --prop line=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop x=23cm --prop y=2cm --prop width=10cm --prop height=13cm --prop fill="$CORAL" --prop opacity=0.28 --prop rotation=65 --prop line=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop x=15cm --prop y=10cm --prop width=14cm --prop height=9cm --prop fill="$EBLUE" --prop opacity=0.38 --prop rotation=82 --prop line=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop x=3cm --prop y=14cm --prop width=8cm --prop height=11cm --prop fill="$AMBER" --prop opacity=0.32 --prop rotation=72 --prop line=none

# Small droplets (2 droplets)
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop x=20cm --prop y=6cm --prop width=3.8cm --prop height=3cm --prop fill="$CORAL" --prop opacity=0.58 --prop rotation=68 --prop line=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop x=27cm --prop y=14cm --prop width=3.2cm --prop height=4.2cm --prop fill="$EBLUE" --prop opacity=0.56 --prop rotation=85 --prop line=none

# Title and content
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="三大升级维度" --prop x=4cm --prop y=2cm --prop width=26cm --prop height=2cm --prop size=56pt --prop bold=true --prop color="$TITLE" --prop align=center
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="色彩体系" --prop x=5cm --prop y=7cm --prop width=8cm --prop height=1.5cm --prop size=24pt --prop color="$BODY" --prop align=center
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="字体系统" --prop x=13cm --prop y=7cm --prop width=8cm --prop height=1.5cm --prop size=24pt --prop color="$BODY" --prop align=center
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="动态标识" --prop x=21cm --prop y=7cm --prop width=8cm --prop height=1.5cm --prop size=24pt --prop color="$BODY" --prop align=center
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="现代渐变与流动配色" --prop x=5cm --prop y=9cm --prop width=8cm --prop height=1.2cm --prop size=18pt --prop color="$MUTED" --prop align=center
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="优雅衬线与几何无衬线" --prop x=13cm --prop y=9cm --prop width=8cm --prop height=1.2cm --prop size=18pt --prop color="$MUTED" --prop align=center
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="响应式动效标志" --prop x=21cm --prop y=9cm --prop width=8cm --prop height=1.2cm --prop size=18pt --prop color="$MUTED" --prop align=center

echo ""
echo "=== SLIDE 4: Showcase - 全新视觉在产品上的呈现 ==="
officecli add "$OUTPUT" / --type slide --prop layout=blank --prop title="showcase" --prop transition=morph

# Background
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill="$BG" --prop line=none

# Large fluid blobs (4 blobs) - new positions
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop x=22cm --prop y=1cm --prop width=11cm --prop height=9cm --prop fill="$VIOLET" --prop opacity=0.35 --prop rotation=95 --prop line=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop x=2cm --prop y=2cm --prop width=13cm --prop height=10cm --prop fill="$MINT" --prop opacity=0.30 --prop rotation=105 --prop line=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop x=12cm --prop y=9cm --prop width=9cm --prop height=12cm --prop fill="$CORAL" --prop opacity=0.40 --prop rotation=92 --prop line=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop x=24cm --prop y=10cm --prop width=10cm --prop height=8cm --prop fill="$EBLUE" --prop opacity=0.33 --prop rotation=110 --prop line=none

# Small droplets (3 droplets)
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop x=17cm --prop y=4cm --prop width=3.5cm --prop height=4.3cm --prop fill="$AMBER" --prop opacity=0.58 --prop rotation=100 --prop line=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop x=8cm --prop y=13cm --prop width=4.2cm --prop height=3cm --prop fill="$MINT" --prop opacity=0.60 --prop rotation=88 --prop line=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop x=20cm --prop y=15cm --prop width=2.8cm --prop height=3.6cm --prop fill="$CORAL" --prop opacity=0.55 --prop rotation=115 --prop line=none

# Title and content
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="产品应用展示" --prop x=4cm --prop y=3cm --prop width=26cm --prop height=2cm --prop size=56pt --prop bold=true --prop color="$TITLE" --prop align=center
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="包装设计 | 数字界面 | 空间体验" --prop x=5cm --prop y=8cm --prop width=24cm --prop height=2cm --prop size=24pt --prop color="$BODY" --prop align=center
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="全新视觉系统已应用于产品包装、移动应用、" --prop x=6cm --prop y=11cm --prop width=22cm --prop height=1.2cm --prop size=20pt --prop color="$MUTED" --prop align=center
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="线下门店及品牌传播的各个触点" --prop x=6cm --prop y=12.5cm --prop width=22cm --prop height=1.2cm --prop size=20pt --prop color="$MUTED" --prop align=center

echo ""
echo "=== SLIDE 5: Evidence - 品牌认知度 +45% / 社媒互动 +120% ==="
officecli add "$OUTPUT" / --type slide --prop layout=blank --prop title="evidence" --prop transition=morph

# Background
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill="$BG" --prop line=none

# Large fluid blobs (5 blobs) - data visualization feel
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop x=3cm --prop y=8cm --prop width=8cm --prop height=11cm --prop fill="$MINT" --prop opacity=0.38 --prop rotation=125 --prop line=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop x=12cm --prop y=3cm --prop width=10cm --prop height=13cm --prop fill="$VIOLET" --prop opacity=0.32 --prop rotation=135 --prop line=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop x=23cm --prop y=7cm --prop width=9cm --prop height=12cm --prop fill="$CORAL" --prop opacity=0.35 --prop rotation=118 --prop line=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop x=1cm --prop y=1cm --prop width=12cm --prop height=9cm --prop fill="$EBLUE" --prop opacity=0.28 --prop rotation=142 --prop line=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop x=20cm --prop y=1cm --prop width=11cm --prop height=8cm --prop fill="$AMBER" --prop opacity=0.40 --prop rotation=130 --prop line=none

# Small droplets (2 droplets)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop x=16cm --prop y=10cm --prop width=3.6cm --prop height=2.9cm --prop fill="$VIOLET" --prop opacity=0.58 --prop rotation=138 --prop line=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop x=6cm --prop y=15cm --prop width=4cm --prop height=3.4cm --prop fill="$MINT" --prop opacity=0.56 --prop rotation=122 --prop line=none

# Title and metrics
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="市场成果" --prop x=4cm --prop y=2cm --prop width=26cm --prop height=2cm --prop size=56pt --prop bold=true --prop color="$TITLE" --prop align=center
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="+45%" --prop x=6cm --prop y=7cm --prop width=10cm --prop height=2.5cm --prop size=64pt --prop bold=true --prop color="$MINT" --prop align=center
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="+120%" --prop x=18cm --prop y=7cm --prop width=10cm --prop height=2.5cm --prop size=64pt --prop bold=true --prop color="$CORAL" --prop align=center
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="品牌认知度提升" --prop x=6cm --prop y=10cm --prop width=10cm --prop height=1.2cm --prop size=20pt --prop color="$BODY" --prop align=center
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="社交媒体互动增长" --prop x=18cm --prop y=10cm --prop width=10cm --prop height=1.2cm --prop size=20pt --prop color="$BODY" --prop align=center

echo ""
echo "=== SLIDE 6: CTA - 开启品牌新纪元 ==="
officecli add "$OUTPUT" / --type slide --prop layout=blank --prop title="cta" --prop transition=morph

# Background
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop x=0 --prop y=0 --prop width=33.87cm --prop height=19.05cm --prop fill="$BG" --prop line=none

# Large fluid blobs (4 blobs) - return to center, calmer
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop x=5cm --prop y=2cm --prop width=10cm --prop height=14cm --prop fill="$VIOLET" --prop opacity=0.30 --prop rotation=155 --prop line=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop x=18cm --prop y=1cm --prop width=13cm --prop height=10cm --prop fill="$MINT" --prop opacity=0.35 --prop rotation=165 --prop line=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop x=2cm --prop y=11cm --prop width=12cm --prop height=8cm --prop fill="$CORAL" --prop opacity=0.28 --prop rotation=148 --prop line=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop x=22cm --prop y=10cm --prop width=9cm --prop height=11cm --prop fill="$EBLUE" --prop opacity=0.38 --prop rotation=172 --prop line=none

# Small droplets (3 droplets)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop x=12cm --prop y=6cm --prop width=3.2cm --prop height=4cm --prop fill="$AMBER" --prop opacity=0.60 --prop rotation=160 --prop line=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop x=24cm --prop y=7cm --prop width=3.8cm --prop height=3cm --prop fill="$MINT" --prop opacity=0.55 --prop rotation=150 --prop line=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop x=8cm --prop y=16cm --prop width=2.9cm --prop height=3.5cm --prop fill="$VIOLET" --prop opacity=0.58 --prop rotation=178 --prop line=none

# CTA text
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="开启品牌新纪元" --prop x=4cm --prop y=7cm --prop width=26cm --prop height=2.5cm --prop size=64pt --prop bold=true --prop color="$TITLE" --prop align=center
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="LUXE — 流动的美学 · 未来的经典" --prop x=5cm --prop y=10.5cm --prop width=24cm --prop height=1.5cm --prop size=22pt --prop color="$BODY" --prop align=center

echo ""
echo "=== Validation and Outline ==="
officecli view "$OUTPUT" outline

echo ""
echo "=== COMPLETE ==="
echo "PPT created at: $OUTPUT"
echo "Total slides: 6"
echo "Transitions: Slides 2-6 have morph transitions"
echo "Style: S07 Liquid Flow with asymmetric ellipses and fluid animations"
