#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/dark__blueprint_grid.pptx"

echo "Building: dark--blueprint-grid (AI Agent Platform)"
rm -f "$OUTPUT"
officecli create "$OUTPUT"

# Colors
BG=1B3A5C
BLUE=4A90D9
WHITE=FFFFFF
LIGHT_BLUE=B8D0E8
OVERLAY=2C5F8A

# ============================================
# SLIDE 1 - HERO
# ============================================
echo "Building Slide 1: Hero..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG

# Scene actors: grid lines
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-h1' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=4cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-h2' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=8.5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-h3' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=13cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-h4' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=17.5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-v1' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=6cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-v2' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=12cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-v3' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=22cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!grid-v4' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=28cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

# Scene actors: major lines
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!major-h' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=0cm --prop y=10.5cm --prop width=34cm --prop height=0.04cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!major-v' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=17cm --prop y=0cm --prop width=0.04cm --prop height=19.05cm

# Scene actors: dots
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot1' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=5.75cm --prop y=3.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot2' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=21.75cm --prop y=12.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!dot3' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=27.75cm --prop y=8.25cm --prop width=0.5cm --prop height=0.5cm

# Scene actors: rings
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ring1' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=11.4cm --prop y=12.4cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=!!ring2' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=27cm --prop y=16.5cm --prop width=1.2cm --prop height=1.2cm

# Content: hero text
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-title' \
  --prop text="AI Agent Platform" \
  --prop font="Courier New" \
  --prop size=56 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=2.4cm --prop y=4.8cm --prop width=24cm --prop height=3cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-subtitle' \
  --prop text="智能体平台发布" \
  --prop font="Courier New" \
  --prop size=36 \
  --prop color=$BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=2.4cm --prop y=8cm --prop width=18cm --prop height=2.2cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop 'name=#s1-tag' \
  --prop text="构建 · 编排 · 部署 · 监控" \
  --prop font="Inter" \
  --prop size=18 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=2.4cm --prop y=10.8cm --prop width=18cm --prop height=1.4cm

# ============================================
# SLIDE 2 - STATEMENT
# ============================================
echo "Building Slide 2: Statement..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[2]' --prop transition=morph

# Scene actors: grid lines (moved)
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-h1' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=2cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-h2' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=6.5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-h3' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=11cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-h4' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=15.5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-v1' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=4cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-v2' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=10cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-v3' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=20cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!grid-v4' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=30cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!major-h' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=0cm --prop y=9cm --prop width=34cm --prop height=0.04cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!major-v' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=25cm --prop y=0cm --prop width=0.04cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!dot1' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=9.75cm --prop y=6.25cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!dot2' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=29.75cm --prop y=15.25cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!dot3' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=19.75cm --prop y=1.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!ring1' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=3.4cm --prop y=14.9cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=!!ring2' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=24.4cm --prop y=2cm --prop width=1.2cm --prop height=1.2cm

# Content: statement text
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-statement' \
  --prop text="每个企业都需要\n自己的智能体工厂" \
  --prop font="Courier New" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop valign=middle \
  --prop lineSpacing=1.4 \
  --prop fill=none \
  --prop x=3cm --prop y=5cm --prop width=28cm --prop height=6cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop 'name=#s2-desc' \
  --prop text="从手工搭建到工业化生产，AI Agent 正在重塑企业数字化底座" \
  --prop font="Inter" \
  --prop size=18 \
  --prop color=$LIGHT_BLUE \
  --prop align=center \
  --prop valign=middle \
  --prop fill=none \
  --prop x=5cm --prop y=12cm --prop width=24cm --prop height=1.6cm

# ============================================
# SLIDE 3 - PILLARS
# ============================================
echo "Building Slide 3: Pillars..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[3]' --prop transition=morph

# Scene actors: grid lines (moved again)
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-h1' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=3.4cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-h2' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=9cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-h3' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=14.5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-h4' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=18cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-v1' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=11cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-v2' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=22.6cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-v3' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=8cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!grid-v4' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=33cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!major-h' \
  --prop fill=$BLUE \
  --prop opacity=0.45 \
  --prop x=0cm --prop y=3.4cm --prop width=34cm --prop height=0.04cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!major-v' \
  --prop fill=$BLUE \
  --prop opacity=0.45 \
  --prop x=0.6cm --prop y=0cm --prop width=0.04cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!dot1' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=10.75cm --prop y=8.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!dot2' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=22.35cm --prop y=14.25cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!dot3' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=32.75cm --prop y=3.15cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!ring1' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=7.4cm --prop y=17cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=!!ring2' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=32.4cm --prop y=8cm --prop width=1.2cm --prop height=1.2cm

# Content: pillars
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-title' \
  --prop text="平台三大核心支柱" \
  --prop font="Courier New" \
  --prop size=36 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=1.2cm --prop y=0.8cm --prop width=20cm --prop height=2cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box1-bg' \
  --prop fill=$OVERLAY \
  --prop opacity=0.12 \
  --prop x=1.2cm --prop y=4.2cm --prop width=9.8cm --prop height=12.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box1-title' \
  --prop text="智能编排引擎" \
  --prop font="Courier New" \
  --prop size=22 \
  --prop bold=true \
  --prop color=$BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=1.8cm --prop y=4.8cm --prop width=8.6cm --prop height=1.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box1-desc' \
  --prop text="· 可视化工作流设计器\n· 多 Agent 协作拓扑\n· 动态任务路由与分发\n· 实时调试与回放" \
  --prop font="Inter" \
  --prop size=16 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=top \
  --prop lineSpacing=1.5 \
  --prop fill=none \
  --prop x=1.8cm --prop y=6.8cm --prop width=8.6cm --prop height=9cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box2-bg' \
  --prop fill=$OVERLAY \
  --prop opacity=0.12 \
  --prop x=12.2cm --prop y=4.2cm --prop width=9.8cm --prop height=12.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box2-title' \
  --prop text="全栈工具集成" \
  --prop font="Courier New" \
  --prop size=22 \
  --prop bold=true \
  --prop color=$BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=12.8cm --prop y=4.8cm --prop width=8.6cm --prop height=1.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box2-desc' \
  --prop text="· 200+ 预置工具连接器\n· API / SDK / 插件三模式\n· 安全沙箱执行环境\n· 统一身份与权限管理" \
  --prop font="Inter" \
  --prop size=16 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=top \
  --prop lineSpacing=1.5 \
  --prop fill=none \
  --prop x=12.8cm --prop y=6.8cm --prop width=8.6cm --prop height=9cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box3-bg' \
  --prop fill=$OVERLAY \
  --prop opacity=0.12 \
  --prop x=23.2cm --prop y=4.2cm --prop width=9.8cm --prop height=12.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box3-title' \
  --prop text="企业级可观测" \
  --prop font="Courier New" \
  --prop size=22 \
  --prop bold=true \
  --prop color=$BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=23.8cm --prop y=4.8cm --prop width=8.6cm --prop height=1.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop 'name=#s3-box3-desc' \
  --prop text="· 全链路 Trace 追踪\n· Token 成本实时仪表盘\n· 质量评分与 SLA 告警\n· 合规审计日志" \
  --prop font="Inter" \
  --prop size=16 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=top \
  --prop lineSpacing=1.5 \
  --prop fill=none \
  --prop x=23.8cm --prop y=6.8cm --prop width=8.6cm --prop height=9cm

# ============================================
# SLIDE 4 - EVIDENCE
# ============================================
echo "Building Slide 4: Evidence..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[4]' --prop transition=morph

# Scene actors: grid lines (moved again)
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-h1' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-h2' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=10cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-h3' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=15cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-h4' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=0cm --prop y=1cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-v1' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=16cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-v2' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=26cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-v3' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=5cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!grid-v4' \
  --prop fill=$WHITE \
  --prop opacity=0.2 \
  --prop x=32cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!major-h' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=0cm --prop y=7.5cm --prop width=34cm --prop height=0.04cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!major-v' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=16cm --prop y=0cm --prop width=0.04cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!dot1' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=15.75cm --prop y=4.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!dot2' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=25.75cm --prop y=14.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!dot3' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=4.75cm --prop y=0.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!ring1' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=31.4cm --prop y=9.4cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=!!ring2' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=15.4cm --prop y=14.4cm --prop width=1.5cm --prop height=1.5cm

# Content: evidence data
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-bg1' \
  --prop fill=$OVERLAY \
  --prop opacity=0.4 \
  --prop x=1.2cm --prop y=2cm --prop width=13cm --prop height=14.5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-bg2' \
  --prop fill=$OVERLAY \
  --prop opacity=0.3 \
  --prop x=18cm --prop y=3cm --prop width=14cm --prop height=6cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-num1' \
  --prop text="10,000+" \
  --prop font="Courier New" \
  --prop size=72 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=2cm --prop y=3cm --prop width=11cm --prop height=3.6cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-label1' \
  --prop text="智能体已部署上线" \
  --prop font="Inter" \
  --prop size=18 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=2cm --prop y=6.6cm --prop width=11cm --prop height=1.4cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-num2' \
  --prop text="99.95%" \
  --prop font="Courier New" \
  --prop size=52 \
  --prop bold=true \
  --prop color=$BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=2cm --prop y=9.5cm --prop width=11cm --prop height=3cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-label2' \
  --prop text="平台可用性 SLA" \
  --prop font="Inter" \
  --prop size=16 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=2cm --prop y=12.5cm --prop width=11cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-num3' \
  --prop text="3.2x" \
  --prop font="Courier New" \
  --prop size=48 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=19cm --prop y=4cm --prop width=12cm --prop height=2.8cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-label3' \
  --prop text="开发效率提升" \
  --prop font="Inter" \
  --prop size=16 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=19cm --prop y=6.8cm --prop width=12cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-num4' \
  --prop text="<60s" \
  --prop font="Courier New" \
  --prop size=44 \
  --prop bold=true \
  --prop color=$BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=19cm --prop y=11cm --prop width=12cm --prop height=2.8cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop 'name=#s4-label4' \
  --prop text="平均任务响应时间" \
  --prop font="Inter" \
  --prop size=16 \
  --prop color=$LIGHT_BLUE \
  --prop align=left \
  --prop valign=middle \
  --prop fill=none \
  --prop x=19cm --prop y=13.8cm --prop width=12cm --prop height=1.2cm

# ============================================
# SLIDE 5 - CTA
# ============================================
echo "Building Slide 5: CTA..."

officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=$BG
officecli set "$OUTPUT" '/slide[5]' --prop transition=morph

# Scene actors: grid lines (final positions)
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-h1' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=3cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-h2' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=7.5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-h3' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=12cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-h4' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=0cm --prop y=16.5cm --prop width=34cm --prop height=0.02cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-v1' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=7cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-v2' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=14cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-v3' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=20cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!grid-v4' \
  --prop fill=$WHITE \
  --prop opacity=0.25 \
  --prop x=27cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!major-h' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=0cm --prop y=12cm --prop width=34cm --prop height=0.04cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!major-v' \
  --prop fill=$BLUE \
  --prop opacity=0.5 \
  --prop x=14cm --prop y=0cm --prop width=0.04cm --prop height=19.05cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!dot1' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=6.75cm --prop y=2.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!dot2' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=26.75cm --prop y=11.75cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!dot3' \
  --prop preset=ellipse \
  --prop fill=$BLUE \
  --prop opacity=0.7 \
  --prop x=13.75cm --prop y=16.25cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!ring1' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=19.4cm --prop y=2.4cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=!!ring2' \
  --prop preset=ellipse \
  --prop fill=$BG \
  --prop line=$WHITE \
  --prop lineWidth=0.75pt \
  --prop opacity=0.6 \
  --prop x=6.4cm --prop y=15.4cm --prop width=1.2cm --prop height=1.2cm

# Content: CTA
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-title' \
  --prop text="开启智能体之旅" \
  --prop font="Courier New" \
  --prop size=52 \
  --prop bold=true \
  --prop color=$WHITE \
  --prop align=center \
  --prop valign=middle \
  --prop fill=none \
  --prop x=3cm --prop y=4.5cm --prop width=28cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-actions' \
  --prop text="申请试用  ·  预约演示  ·  联系我们" \
  --prop font="Courier New" \
  --prop size=22 \
  --prop color=$BLUE \
  --prop align=center \
  --prop valign=middle \
  --prop fill=none \
  --prop x=5cm --prop y=9cm --prop width=24cm --prop height=2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop 'name=#s5-url' \
  --prop text="agent.platform.ai" \
  --prop font="Inter" \
  --prop size=16 \
  --prop color=$LIGHT_BLUE \
  --prop align=center \
  --prop valign=middle \
  --prop fill=none \
  --prop x=8cm --prop y=13.5cm --prop width=18cm --prop height=1.4cm

# ============================================
# FINAL VALIDATION
# ============================================
officecli validate "$OUTPUT"
officecli view "$OUTPUT" outline

echo "✅ Build complete: $OUTPUT"
