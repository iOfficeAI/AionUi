#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__liquid_flow.pptx"

echo "Building: dark--liquid-flow (LUXE Brand Visual Upgrade)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=0F0F2D
VIOLET=6C63FF
MINT=48E5C2
CORAL=FF6B8A
EBLUE=3D5AFE
AMBER=F5AF19
TITLE=F5F5FF
BODY=C8C8FF
MUTED=8888CC

# Off-canvas position
OFFSCREEN=36cm

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: large fluid blobs (4 main blobs)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blob-1' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.35 \
  --prop rotation=15 \
  --prop x=2cm --prop y=3cm --prop width=12cm --prop height=8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blob-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.28 \
  --prop rotation=25 \
  --prop x=20cm --prop y=2cm --prop width=10cm --prop height=14cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blob-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.32 \
  --prop rotation=18 \
  --prop x=8cm --prop y=10cm --prop width=13cm --prop height=9cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blob-4' \
  --prop preset=ellipse \
  --prop fill=$EBLUE \
  --prop opacity=0.38 \
  --prop rotation=22 \
  --prop x=24cm --prop y=11cm --prop width=9cm --prop height=11cm

# Scene actors: additional blob (hidden initially, appears in slide 3 & 5)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!blob-5' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.01 \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=8cm --prop height=11cm

# Scene actors: small droplets (3 droplets)
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!drop-1' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.55 \
  --prop rotation=12 \
  --prop x=15cm --prop y=5cm --prop width=3.5cm --prop height=2.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!drop-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.58 \
  --prop rotation=28 \
  --prop x=18cm --prop y=14cm --prop width=4cm --prop height=3.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!drop-3' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.52 \
  --prop rotation=35 \
  --prop x=6cm --prop y=16cm --prop width=2.8cm --prop height=3.8cm

# Content: title text
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title' \
  --prop text="LUXE" \
  --prop font="Arial" \
  --prop size=72 \
  --prop bold=true \
  --prop color=$TITLE \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=6cm --prop width=28cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle' \
  --prop text="品牌视觉升级 2025" \
  --prop font="Arial" \
  --prop size=42 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=3cm --prop y=9.5cm --prop width=28cm --prop height=2cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Move blobs (rotated and moved)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blob-1' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.40 \
  --prop rotation=45 \
  --prop x=4cm --prop y=1cm --prop width=15cm --prop height=10cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blob-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.33 \
  --prop rotation=52 \
  --prop x=18cm --prop y=8cm --prop width=13cm --prop height=9cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blob-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.36 \
  --prop rotation=48 \
  --prop x=1cm --prop y=9cm --prop width=10cm --prop height=13cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blob-4' \
  --prop preset=ellipse \
  --prop fill=$EBLUE \
  --prop opacity=0.42 \
  --prop rotation=58 \
  --prop x=22cm --prop y=3cm --prop width=11cm --prop height=8cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!blob-5' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.01 \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=8cm --prop height=11cm

# Move droplets
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!drop-1' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.60 \
  --prop rotation=38 \
  --prop x=12cm --prop y=8cm --prop width=4.2cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!drop-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.56 \
  --prop rotation=55 \
  --prop x=25cm --prop y=12cm --prop width=3.2cm --prop height=4.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!drop-3' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.54 \
  --prop rotation=62 \
  --prop x=8cm --prop y=15cm --prop width=3.8cm --prop height=2.6cm

# Content: statement text
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-statement1' \
  --prop text="从经典到未来" \
  --prop font="Arial" \
  --prop size=56 \
  --prop bold=true \
  --prop color=$TITLE \
  --prop align=center \
  --prop fill=none \
  --prop x=5cm --prop y=6cm --prop width=24cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-statement2' \
  --prop text="流动不止" \
  --prop font="Arial" \
  --prop size=48 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=5cm --prop y=9cm --prop width=24cm --prop height=2cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Move blobs (further transformed)
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blob-1' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.30 \
  --prop rotation=70 \
  --prop x=1cm --prop y=4cm --prop width=9cm --prop height=12cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blob-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.35 \
  --prop rotation=78 \
  --prop x=10cm --prop y=1cm --prop width=12cm --prop height=8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blob-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.28 \
  --prop rotation=65 \
  --prop x=23cm --prop y=2cm --prop width=10cm --prop height=13cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blob-4' \
  --prop preset=ellipse \
  --prop fill=$EBLUE \
  --prop opacity=0.38 \
  --prop rotation=82 \
  --prop x=15cm --prop y=10cm --prop width=14cm --prop height=9cm

# Show blob-5 on slide 3
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!blob-5' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.32 \
  --prop rotation=72 \
  --prop x=3cm --prop y=14cm --prop width=8cm --prop height=11cm

# Move droplets (only 2 visible)
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!drop-1' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.58 \
  --prop rotation=68 \
  --prop x=20cm --prop y=6cm --prop width=3.8cm --prop height=3cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!drop-2' \
  --prop preset=ellipse \
  --prop fill=$EBLUE \
  --prop opacity=0.56 \
  --prop rotation=85 \
  --prop x=27cm --prop y=14cm --prop width=3.2cm --prop height=4.2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!drop-3' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.01 \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=3.8cm --prop height=2.6cm

# Content: pillars
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-title' \
  --prop text="三大升级维度" \
  --prop font="Arial" \
  --prop size=56 \
  --prop bold=true \
  --prop color=$TITLE \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=2cm --prop width=26cm --prop height=2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-p1-title' \
  --prop text="色彩体系" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=5cm --prop y=7cm --prop width=8cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-p2-title' \
  --prop text="字体系统" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=13cm --prop y=7cm --prop width=8cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-p3-title' \
  --prop text="动态标识" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=21cm --prop y=7cm --prop width=8cm --prop height=1.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-p1-desc' \
  --prop text="现代渐变与流动配色" \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$MUTED \
  --prop align=center \
  --prop fill=none \
  --prop x=5cm --prop y=9cm --prop width=8cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-p2-desc' \
  --prop text="优雅衬线与几何无衬线" \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$MUTED \
  --prop align=center \
  --prop fill=none \
  --prop x=13cm --prop y=9cm --prop width=8cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-p3-desc' \
  --prop text="响应式动效标志" \
  --prop font="Arial" \
  --prop size=18 \
  --prop color=$MUTED \
  --prop align=center \
  --prop fill=none \
  --prop x=21cm --prop y=9cm --prop width=8cm --prop height=1.2cm

# ============================================
# SLIDE 4 - SHOWCASE
# ============================================
echo "Building Slide 4: Showcase..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Move blobs (new positions)
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blob-1' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.35 \
  --prop rotation=95 \
  --prop x=22cm --prop y=1cm --prop width=11cm --prop height=9cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blob-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.30 \
  --prop rotation=105 \
  --prop x=2cm --prop y=2cm --prop width=13cm --prop height=10cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blob-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.40 \
  --prop rotation=92 \
  --prop x=12cm --prop y=9cm --prop width=9cm --prop height=12cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blob-4' \
  --prop preset=ellipse \
  --prop fill=$EBLUE \
  --prop opacity=0.33 \
  --prop rotation=110 \
  --prop x=24cm --prop y=10cm --prop width=10cm --prop height=8cm

# Hide blob-5 on slide 4
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!blob-5' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.01 \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=8cm --prop height=11cm

# Move droplets (all 3 visible again)
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!drop-1' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.58 \
  --prop rotation=100 \
  --prop x=17cm --prop y=4cm --prop width=3.5cm --prop height=4.3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!drop-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.60 \
  --prop rotation=88 \
  --prop x=8cm --prop y=13cm --prop width=4.2cm --prop height=3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!drop-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.55 \
  --prop rotation=115 \
  --prop x=20cm --prop y=15cm --prop width=2.8cm --prop height=3.6cm

# Content: showcase
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-title' \
  --prop text="产品应用展示" \
  --prop font="Arial" \
  --prop size=56 \
  --prop bold=true \
  --prop color=$TITLE \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=3cm --prop width=26cm --prop height=2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-subtitle' \
  --prop text="包装设计 | 数字界面 | 空间体验" \
  --prop font="Arial" \
  --prop size=24 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=5cm --prop y=8cm --prop width=24cm --prop height=2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-desc1' \
  --prop text="全新视觉系统已应用于产品包装、移动应用、" \
  --prop font="Arial" \
  --prop size=20 \
  --prop color=$MUTED \
  --prop align=center \
  --prop fill=none \
  --prop x=6cm --prop y=11cm --prop width=22cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-desc2' \
  --prop text="线下门店及品牌传播的各个触点" \
  --prop font="Arial" \
  --prop size=20 \
  --prop color=$MUTED \
  --prop align=center \
  --prop fill=none \
  --prop x=6cm --prop y=12.5cm --prop width=22cm --prop height=1.2cm

# ============================================
# SLIDE 5 - EVIDENCE
# ============================================
echo "Building Slide 5: Evidence..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Move blobs (data visualization feel)
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blob-1' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.32 \
  --prop rotation=135 \
  --prop x=12cm --prop y=3cm --prop width=10cm --prop height=13cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blob-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.38 \
  --prop rotation=125 \
  --prop x=3cm --prop y=8cm --prop width=8cm --prop height=11cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blob-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.35 \
  --prop rotation=118 \
  --prop x=23cm --prop y=7cm --prop width=9cm --prop height=12cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blob-4' \
  --prop preset=ellipse \
  --prop fill=$EBLUE \
  --prop opacity=0.28 \
  --prop rotation=142 \
  --prop x=1cm --prop y=1cm --prop width=12cm --prop height=9cm

# Show blob-5 again on slide 5
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!blob-5' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.40 \
  --prop rotation=130 \
  --prop x=20cm --prop y=1cm --prop width=11cm --prop height=8cm

# Move droplets (only 2 visible)
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!drop-1' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.58 \
  --prop rotation=138 \
  --prop x=16cm --prop y=10cm --prop width=3.6cm --prop height=2.9cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!drop-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.56 \
  --prop rotation=122 \
  --prop x=6cm --prop y=15cm --prop width=4cm --prop height=3.4cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!drop-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.01 \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=2.8cm --prop height=3.6cm

# Content: evidence
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-title' \
  --prop text="市场成果" \
  --prop font="Arial" \
  --prop size=56 \
  --prop bold=true \
  --prop color=$TITLE \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=2cm --prop width=26cm --prop height=2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-metric1-num' \
  --prop text="+45%" \
  --prop font="Arial" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$MINT \
  --prop align=center \
  --prop fill=none \
  --prop x=6cm --prop y=7cm --prop width=10cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-metric2-num' \
  --prop text="+120%" \
  --prop font="Arial" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$CORAL \
  --prop align=center \
  --prop fill=none \
  --prop x=18cm --prop y=7cm --prop width=10cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-metric1-label' \
  --prop text="品牌认知度提升" \
  --prop font="Arial" \
  --prop size=20 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=6cm --prop y=10cm --prop width=10cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-metric2-label' \
  --prop text="社交媒体互动增长" \
  --prop font="Arial" \
  --prop size=20 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=18cm --prop y=10cm --prop width=10cm --prop height=1.2cm

# ============================================
# SLIDE 6 - CTA
# ============================================
echo "Building Slide 6: CTA..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[6]' --prop transition=morph

# Move blobs (return to center, calmer)
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!blob-1' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.30 \
  --prop rotation=155 \
  --prop x=5cm --prop y=2cm --prop width=10cm --prop height=14cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!blob-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.35 \
  --prop rotation=165 \
  --prop x=18cm --prop y=1cm --prop width=13cm --prop height=10cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!blob-3' \
  --prop preset=ellipse \
  --prop fill=$CORAL \
  --prop opacity=0.28 \
  --prop rotation=148 \
  --prop x=2cm --prop y=11cm --prop width=12cm --prop height=8cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!blob-4' \
  --prop preset=ellipse \
  --prop fill=$EBLUE \
  --prop opacity=0.38 \
  --prop rotation=172 \
  --prop x=22cm --prop y=10cm --prop width=9cm --prop height=11cm

# Hide blob-5 on slide 6
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!blob-5' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.01 \
  --prop x=${OFFSCREEN} --prop y=0cm --prop width=11cm --prop height=8cm

# Move droplets (all 3 visible)
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!drop-1' \
  --prop preset=ellipse \
  --prop fill=$AMBER \
  --prop opacity=0.60 \
  --prop rotation=160 \
  --prop x=12cm --prop y=6cm --prop width=3.2cm --prop height=4cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!drop-2' \
  --prop preset=ellipse \
  --prop fill=$MINT \
  --prop opacity=0.55 \
  --prop rotation=150 \
  --prop x=24cm --prop y=7cm --prop width=3.8cm --prop height=3cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=!!drop-3' \
  --prop preset=ellipse \
  --prop fill=$VIOLET \
  --prop opacity=0.58 \
  --prop rotation=178 \
  --prop x=8cm --prop y=16cm --prop width=2.9cm --prop height=3.5cm

# Content: CTA
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=#s6-title' \
  --prop text="开启品牌新纪元" \
  --prop font="Arial" \
  --prop size=64 \
  --prop bold=true \
  --prop color=$TITLE \
  --prop align=center \
  --prop fill=none \
  --prop x=4cm --prop y=7cm --prop width=26cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop 'name=#s6-subtitle' \
  --prop text="LUXE — 流动的美学 · 未来的经典" \
  --prop font="Arial" \
  --prop size=22 \
  --prop color=$BODY \
  --prop align=center \
  --prop fill=none \
  --prop x=5cm --prop y=10.5cm --prop width=24cm --prop height=1.5cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
