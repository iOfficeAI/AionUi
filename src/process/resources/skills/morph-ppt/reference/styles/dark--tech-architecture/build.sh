#!/bin/bash
# Tech Architecture Sharing Template - Build Script
# 技术架构分享风格PPT模板
# --------------------------------------------

set -e
OUTPUT="template.pptx"

echo "Creating $OUTPUT ..."

# 创建PPT
officecli create "$OUTPUT"

# 添加10个幻灯片（深空黑背景）
for i in 1 2 3 4 5 6 7 8 9 10; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=0D1117
done

echo "Created 10 slides"

# ============================================
# SLIDE 1 - HERO (封面页)
# ============================================
echo "Building Slide 1 - Hero..."

# 光晕装饰
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop preset=ellipse --prop fill=7C3AED --prop opacity=0.12 --prop softEdge=60 \
  --prop x=22cm --prop y=0cm --prop width=20cm --prop height=20cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF --prop opacity=0.1 --prop softEdge=50 \
  --prop x=0cm --prop y=10cm --prop width=16cm --prop height=16cm

# 网格装饰线 - 横线
for y in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
  officecli add "$OUTPUT" '/slide[1]' --type shape \
    --prop preset=rect --prop fill=58A6FF --prop opacity=0.06 \
    --prop x=0cm --prop y=${y}cm --prop width=33.87cm --prop height=0.008cm
done

# 网格装饰线 - 竖线
for x in 2 4 6 8 10 12 14 16 18 20 22 24 26 28 30 32; do
  officecli add "$OUTPUT" '/slide[1]' --type shape \
    --prop preset=rect --prop fill=58A6FF --prop opacity=0.04 \
    --prop x=${x}cm --prop y=0cm --prop width=0.008cm --prop height=19.05cm
done

# 主标题
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="ARCHITECTURE" --prop font="Arial Black" --prop size=64 \
  --prop bold=true --prop spacing=3 --prop color=FFFFFF --prop align=center \
  --prop x=2cm --prop y=5.5cm --prop width=30cm --prop height=2.5cm --prop fill=none

# 副标题
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="技术架构分享 · 系统设计实践" --prop font="Microsoft YaHei" \
  --prop size=22 --prop spacing=6 --prop color=C9D1D9 --prop align=center \
  --prop x=2cm --prop y=8.5cm --prop width=30cm --prop height=1.2cm --prop fill=none

# 技术标签
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=1pt \
  --prop x=4cm --prop y=11cm --prop width=4.5cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="Microservices" --prop font="Microsoft YaHei" --prop size=12 --prop color=58A6FF \
  --prop align=center --prop x=4cm --prop y=11.2cm --prop width=4.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=1pt \
  --prop x=9cm --prop y=11cm --prop width=4.5cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="Cloud Native" --prop font="Microsoft YaHei" --prop size=12 --prop color=58A6FF \
  --prop align=center --prop x=9cm --prop y=11.2cm --prop width=4.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=1pt \
  --prop x=14cm --prop y=11cm --prop width=4.5cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="DevOps" --prop font="Microsoft YaHei" --prop size=12 --prop color=58A6FF \
  --prop align=center --prop x=14cm --prop y=11.2cm --prop width=4.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=1pt \
  --prop x=19cm --prop y=11cm --prop width=4.5cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="AI/ML" --prop font="Microsoft YaHei" --prop size=12 --prop color=58A6FF \
  --prop align=center --prop x=19cm --prop y=11.2cm --prop width=4.5cm --prop height=0.5cm --prop fill=none

# 日期区域
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="DATE" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.5cm --prop y=14.5cm --prop width=3cm --prop height=0.3cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="2026.03.21" --prop font="Consolas" --prop size=14 --prop color=58A6FF \
  --prop align=left --prop x=2.5cm --prop y=14.9cm --prop width=5cm --prop height=0.5cm --prop fill=none

# 演讲者区域
officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="SPEAKER" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.5cm --prop y=15.7cm --prop width=3cm --prop height=0.3cm --prop fill=none

officecli add "$OUTPUT" '/slide[1]' --type shape \
  --prop text="架构师 · Tech Lead" --prop font="Microsoft YaHei" --prop size=12 --prop color=C9D1D9 \
  --prop align=left --prop x=2.5cm --prop y=16.1cm --prop width=6cm --prop height=0.4cm --prop fill=none

echo "Slide 1 complete"

# ============================================
# SLIDE 2 - ARCHITECTURE (架构页)
# ============================================
echo "Building Slide 2 - Architecture..."

# 标题
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="ARCHITECTURE" --prop font="Arial Black" --prop size=36 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=1.2cm --prop width=12cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="系统架构" --prop font="Microsoft YaHei" --prop size=20 --prop color=C9D1D9 \
  --prop align=left --prop x=2cm --prop y=2.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 左侧色条
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=0.5cm --prop y=0.5cm --prop width=0.1cm --prop height=18cm

# 前端层卡片
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=3cm --prop y=4cm --prop width=28cm --prop height=3cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=3cm --prop y=4cm --prop width=0.15cm --prop height=3cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="Frontend Layer" --prop font="Arial Black" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=4cm --prop y=4.4cm --prop width=10cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="React / Vue / Angular · TypeScript · Webpack · Vite" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=left --prop x=4cm --prop y=5.5cm --prop width=25cm --prop height=0.5cm --prop fill=none

# 前端层技术标签
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=0.5pt \
  --prop x=5cm --prop y=6.2cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=0.5pt \
  --prop x=7cm --prop y=6.2cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=0.5pt \
  --prop x=9cm --prop y=6.2cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=0.5pt \
  --prop x=11cm --prop y=6.2cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=58A6FF --prop lineWidth=0.5pt \
  --prop x=13cm --prop y=6.2cm --prop width=2cm --prop height=0.5cm

# 连接箭头
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=downArrow --prop fill=58A6FF --prop opacity=0.6 \
  --prop x=16.5cm --prop y=7.2cm --prop width=0.8cm --prop height=1cm

# 服务层卡片
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=3cm --prop y=8.5cm --prop width=28cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=rect --prop fill=7C3AED \
  --prop x=3cm --prop y=8.5cm --prop width=0.15cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="Service Layer" --prop font="Arial Black" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=4cm --prop y=8.9cm --prop width=10cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="Node.js / Python / Go · gRPC / REST · Kubernetes · Docker" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=left --prop x=4cm --prop y=10cm --prop width=25cm --prop height=0.5cm --prop fill=none

# 服务层技术标签
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=7C3AED --prop lineWidth=0.5pt \
  --prop x=5cm --prop y=10.8cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=7C3AED --prop lineWidth=0.5pt \
  --prop x=7cm --prop y=10.8cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=7C3AED --prop lineWidth=0.5pt \
  --prop x=9cm --prop y=10.8cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=7C3AED --prop lineWidth=0.5pt \
  --prop x=11cm --prop y=10.8cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=7C3AED --prop lineWidth=0.5pt \
  --prop x=13cm --prop y=10.8cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=7C3AED --prop lineWidth=0.5pt \
  --prop x=15cm --prop y=10.8cm --prop width=2cm --prop height=0.5cm

# 连接箭头2
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=downArrow --prop fill=58A6FF --prop opacity=0.6 \
  --prop x=16.5cm --prop y=12.2cm --prop width=0.8cm --prop height=1cm

# 数据层卡片
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=3cm --prop y=13.5cm --prop width=28cm --prop height=3cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=rect --prop fill=06B6D4 \
  --prop x=3cm --prop y=13.5cm --prop width=0.15cm --prop height=3cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="Data Layer" --prop font="Arial Black" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=4cm --prop y=13.9cm --prop width=10cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop text="PostgreSQL / MongoDB / Redis · Kafka · Elasticsearch · S3" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=left --prop x=4cm --prop y=15cm --prop width=25cm --prop height=0.5cm --prop fill=none

# 数据层技术标签
officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=06B6D4 --prop lineWidth=0.5pt \
  --prop x=5cm --prop y=15.7cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=06B6D4 --prop lineWidth=0.5pt \
  --prop x=7cm --prop y=15.7cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=06B6D4 --prop lineWidth=0.5pt \
  --prop x=9cm --prop y=15.7cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=06B6D4 --prop lineWidth=0.5pt \
  --prop x=11cm --prop y=15.7cm --prop width=2cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[2]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=06B6D4 --prop lineWidth=0.5pt \
  --prop x=13cm --prop y=15.7cm --prop width=2cm --prop height=0.5cm

echo "Slide 2 complete"

# ============================================
# SLIDE 3 - FLOW (流程页)
# ============================================
echo "Building Slide 3 - Flow..."

# 标题
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="DATA FLOW" --prop font="Arial Black" --prop size=36 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=1.2cm --prop width=12cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="数据流程" --prop font="Microsoft YaHei" --prop size=20 --prop color=C9D1D9 \
  --prop align=left --prop x=2cm --prop y=2.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 左侧色条
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=0.5cm --prop y=0.5cm --prop width=0.1cm --prop height=18cm

# 流程主线
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=rect --prop fill=58A6FF --prop opacity=0.3 \
  --prop x=2.5cm --prop y=8cm --prop width=29cm --prop height=0.08cm

# Node 1 - Request
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF \
  --prop x=3.5cm --prop y=7.3cm --prop width=1.4cm --prop height=1.4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="01" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=3.5cm --prop y=7.7cm --prop width=1.4cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Request" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=2.5cm --prop y=9cm --prop width=3.5cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="用户请求" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=2.5cm --prop y=9.6cm --prop width=3.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2.5cm --prop y=5cm --prop width=3.5cm --prop height=1.8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Latency: 0ms" --prop font="Consolas" --prop size=10 --prop color=06B6D4 \
  --prop align=center --prop x=2.5cm --prop y=5.5cm --prop width=3.5cm --prop height=0.4cm --prop fill=none

# Node 2 - API GW
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF \
  --prop x=9.5cm --prop y=7.3cm --prop width=1.4cm --prop height=1.4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="02" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=9.5cm --prop y=7.7cm --prop width=1.4cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="API GW" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=8.5cm --prop y=9cm --prop width=3.5cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="API网关" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=8.5cm --prop y=9.6cm --prop width=3.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=8.5cm --prop y=5cm --prop width=3.5cm --prop height=1.8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Latency: 1ms" --prop font="Consolas" --prop size=10 --prop color=06B6D4 \
  --prop align=center --prop x=8.5cm --prop y=5.5cm --prop width=3.5cm --prop height=0.4cm --prop fill=none

# Node 3 - Service
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF \
  --prop x=15.5cm --prop y=7.3cm --prop width=1.4cm --prop height=1.4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="03" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=15.5cm --prop y=7.7cm --prop width=1.4cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Service" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=14.5cm --prop y=9cm --prop width=3.5cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="业务服务" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=14.5cm --prop y=9.6cm --prop width=3.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=14.5cm --prop y=5cm --prop width=3.5cm --prop height=1.8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Latency: 2ms" --prop font="Consolas" --prop size=10 --prop color=06B6D4 \
  --prop align=center --prop x=14.5cm --prop y=5.5cm --prop width=3.5cm --prop height=0.4cm --prop fill=none

# Node 4 - Cache
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF \
  --prop x=21.5cm --prop y=7.3cm --prop width=1.4cm --prop height=1.4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="04" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=21.5cm --prop y=7.7cm --prop width=1.4cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Cache" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=20.5cm --prop y=9cm --prop width=3.5cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="缓存层" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=20.5cm --prop y=9.6cm --prop width=3.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=20.5cm --prop y=5cm --prop width=3.5cm --prop height=1.8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Latency: 3ms" --prop font="Consolas" --prop size=10 --prop color=06B6D4 \
  --prop align=center --prop x=20.5cm --prop y=5.5cm --prop width=3.5cm --prop height=0.4cm --prop fill=none

# Node 5 - DB
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF \
  --prop x=27.5cm --prop y=7.3cm --prop width=1.4cm --prop height=1.4cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="05" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=27.5cm --prop y=7.7cm --prop width=1.4cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="DB" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=26.5cm --prop y=9cm --prop width=3.5cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="数据库" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=26.5cm --prop y=9.6cm --prop width=3.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=26.5cm --prop y=5cm --prop width=3.5cm --prop height=1.8cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Latency: 4ms" --prop font="Consolas" --prop size=10 --prop color=06B6D4 \
  --prop align=center --prop x=26.5cm --prop y=5.5cm --prop width=3.5cm --prop height=0.4cm --prop fill=none

# 连接箭头
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=rightArrow --prop fill=58A6FF --prop opacity=0.5 \
  --prop x=6cm --prop y=7.7cm --prop width=1cm --prop height=0.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=rightArrow --prop fill=58A6FF --prop opacity=0.5 \
  --prop x=12cm --prop y=7.7cm --prop width=1cm --prop height=0.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=rightArrow --prop fill=58A6FF --prop opacity=0.5 \
  --prop x=18cm --prop y=7.7cm --prop width=1cm --prop height=0.6cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=rightArrow --prop fill=58A6FF --prop opacity=0.5 \
  --prop x=24cm --prop y=7.7cm --prop width=1cm --prop height=0.6cm

# 底部性能指标卡片
officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2cm --prop y=14cm --prop width=30cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="PERFORMANCE METRICS" --prop font="Arial Black" --prop size=12 --prop color=8B949E \
  --prop align=left --prop x=3cm --prop y=14.3cm --prop width=8cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="P99 Latency" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=3cm --prop y=15cm --prop width=5cm --prop height=0.4cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="< 50ms" --prop font="Arial Black" --prop size=18 --prop color=58A6FF \
  --prop align=left --prop x=3cm --prop y=15.5cm --prop width=5cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Throughput" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=9cm --prop y=15cm --prop width=5cm --prop height=0.4cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="10K QPS" --prop font="Arial Black" --prop size=18 --prop color=58A6FF \
  --prop align=left --prop x=9cm --prop y=15.5cm --prop width=5cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Error Rate" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=16cm --prop y=15cm --prop width=5cm --prop height=0.4cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="0.01%" --prop font="Arial Black" --prop size=18 --prop color=58A6FF \
  --prop align=left --prop x=16cm --prop y=15.5cm --prop width=5cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="Availability" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=23cm --prop y=15cm --prop width=5cm --prop height=0.4cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape \
  --prop text="99.99%" --prop font="Arial Black" --prop size=18 --prop color=58A6FF \
  --prop align=left --prop x=23cm --prop y=15.5cm --prop width=5cm --prop height=0.8cm --prop fill=none

echo "Slide 3 complete"

# ============================================
# SLIDE 4 - CODE (代码页)
# ============================================
echo "Building Slide 4 - Code..."

# 标题
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="CODE EXAMPLE" --prop font="Arial Black" --prop size=36 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=1.2cm --prop width=14cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="代码示例" --prop font="Microsoft YaHei" --prop size=20 --prop color=C9D1D9 \
  --prop align=left --prop x=2cm --prop y=2.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 左侧色条
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=0.5cm --prop y=0.5cm --prop width=0.1cm --prop height=18cm

# 代码窗口框架
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=roundRect --prop fill=0D1117 --prop line=30363D --prop lineWidth=1pt \
  --prop x=2cm --prop y=4cm --prop width=20cm --prop height=11cm

# 窗口标题栏
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=rect --prop fill=161B22 \
  --prop x=2cm --prop y=4cm --prop width=20cm --prop height=0.8cm

# 窗口按钮
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=ellipse --prop fill=FF5F56 \
  --prop x=2.5cm --prop y=4.25cm --prop width=0.4cm --prop height=0.4cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=ellipse --prop fill=FFBD2E \
  --prop x=3.1cm --prop y=4.25cm --prop width=0.4cm --prop height=0.4cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=ellipse --prop fill=27C93F \
  --prop x=3.7cm --prop y=4.25cm --prop width=0.4cm --prop height=0.4cm

# 文件名
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="api-handler.ts" --prop font="Consolas" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=8cm --prop y=4.2cm --prop width=8cm --prop height=0.5cm --prop fill=none

# 代码行
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="import { Request, Response } from 'express';" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=5cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="export async function handleRequest(" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=5.6cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="  req: Request, res: Response" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=6.2cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text=") {" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=6.8cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="  const data = await fetchData(req.params.id);" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=7.4cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="  return res.json({ success: true, data });" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=8cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="}" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=8.6cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="async function fetchData(id: string) {" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=9.2cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="  return await db.query('SELECT *...', [id]);" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=9.8cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="}" --prop font="Consolas" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=2.8cm --prop y=10.4cm --prop width=18cm --prop height=0.5cm --prop fill=none

# 右侧说明卡片
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=23cm --prop y=4cm --prop width=8.5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="KEY POINTS" --prop font="Arial Black" --prop size=14 --prop color=58A6FF \
  --prop align=left --prop x=23.5cm --prop y=4.5cm --prop width=7cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="• TypeScript 类型安全" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=5.3cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="• Async/Await 异步处理" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=6.1cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="• 参数化查询防注入" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=6.9cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="• 统一错误处理" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=7.7cm --prop width=7cm --prop height=0.5cm --prop fill=none

# 右侧最佳实践卡片
officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=23cm --prop y=10cm --prop width=8.5cm --prop height=5cm

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="BEST PRACTICES" --prop font="Arial Black" --prop size=14 --prop color=7C3AED \
  --prop align=left --prop x=23.5cm --prop y=10.5cm --prop width=7cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="1. 使用连接池管理" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=11.3cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="2. 添加请求限流" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=12.1cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="3. 实现缓存策略" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=12.9cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape \
  --prop text="4. 日志记录追踪" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=13.7cm --prop width=7cm --prop height=0.5cm --prop fill=none

echo "Slide 4 complete"

# ============================================
# SLIDE 5 - DEMO (演示页)
# ============================================
echo "Building Slide 5 - Demo..."

# 标题
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="DEMO" --prop font="Arial Black" --prop size=36 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=1.2cm --prop width=8cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="功能演示" --prop font="Microsoft YaHei" --prop size=20 --prop color=C9D1D9 \
  --prop align=left --prop x=2cm --prop y=2.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 左侧色条
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=0.5cm --prop y=0.5cm --prop width=0.1cm --prop height=18cm

# 演示框架
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=roundRect --prop fill=0D1117 --prop line=30363D --prop lineWidth=2pt \
  --prop x=2cm --prop y=4cm --prop width=20cm --prop height=11cm

# 演示框架标题栏
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=161B22 \
  --prop x=2cm --prop y=4cm --prop width=20cm --prop height=0.8cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="Dashboard - Production Environment" --prop font="Consolas" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=4cm --prop y=4.2cm --prop width=16cm --prop height=0.5cm --prop fill=none

# 模拟仪表板元素
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2.5cm --prop y=5.2cm --prop width=9cm --prop height=4.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="System Metrics" --prop font="Arial Black" --prop size=12 --prop color=FFFFFF \
  --prop align=left --prop x=3cm --prop y=5.5cm --prop width=5cm --prop height=0.5cm --prop fill=none

# 模拟柱状图
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=58A6FF --prop opacity=0.8 \
  --prop x=3cm --prop y=8cm --prop width=0.8cm --prop height=1cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=58A6FF --prop opacity=0.8 \
  --prop x=4.5cm --prop y=7.2cm --prop width=0.8cm --prop height=1.8cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=58A6FF --prop opacity=0.8 \
  --prop x=6cm --prop y=6.5cm --prop width=0.8cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=58A6FF --prop opacity=0.8 \
  --prop x=7.5cm --prop y=6cm --prop width=0.8cm --prop height=3cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=58A6FF --prop opacity=0.8 \
  --prop x=9cm --prop y=6.8cm --prop width=0.8cm --prop height=2.2cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=rect --prop fill=58A6FF --prop opacity=0.8 \
  --prop x=10.5cm --prop y=7.5cm --prop width=0.8cm --prop height=1.5cm

# 统计卡片
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=12cm --prop y=5.2cm --prop width=9.5cm --prop height=1.6cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="CPU" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=12.5cm --prop y=5.4cm --prop width=3cm --prop height=0.4cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="45%" --prop font="Arial Black" --prop size=18 --prop color=58A6FF \
  --prop align=left --prop x=12.5cm --prop y=5.8cm --prop width=4cm --prop height=0.7cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=12cm --prop y=7.2cm --prop width=9.5cm --prop height=1.6cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="Memory" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=12.5cm --prop y=7.4cm --prop width=3cm --prop height=0.4cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="68%" --prop font="Arial Black" --prop size=18 --prop color=58A6FF \
  --prop align=left --prop x=12.5cm --prop y=7.8cm --prop width=4cm --prop height=0.7cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=12cm --prop y=9.2cm --prop width=9.5cm --prop height=1.6cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="Network" --prop font="Microsoft YaHei" --prop size=10 --prop color=8B949E \
  --prop align=left --prop x=12.5cm --prop y=9.4cm --prop width=3cm --prop height=0.4cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="2.1 GB/s" --prop font="Arial Black" --prop size=18 --prop color=58A6FF \
  --prop align=left --prop x=12.5cm --prop y=9.8cm --prop width=4cm --prop height=0.7cm --prop fill=none

# 右侧功能说明
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=23cm --prop y=4cm --prop width=8.5cm --prop height=11cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="FEATURES" --prop font="Arial Black" --prop size=14 --prop color=58A6FF \
  --prop align=left --prop x=23.5cm --prop y=4.5cm --prop width=7cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="✓ 实时监控仪表板" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=5.5cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="✓ 自动化告警系统" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=6.4cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="✓ 日志聚合分析" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=7.3cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="✓ 性能指标追踪" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=8.2cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="✓ 资源使用统计" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=9.1cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="✓ 健康检查状态" --prop font="Microsoft YaHei" --prop size=11 --prop color=C9D1D9 \
  --prop align=left --prop x=23.5cm --prop y=10cm --prop width=7cm --prop height=0.5cm --prop fill=none

# 状态指示器
officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=roundRect --prop fill=161B22 --prop line=27C93F --prop lineWidth=1pt \
  --prop x=23.5cm --prop y=11.5cm --prop width=7.5cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop preset=ellipse --prop fill=27C93F \
  --prop x=24cm --prop y=12.5cm --prop width=0.5cm --prop height=0.5cm

officecli add "$OUTPUT" '/slide[5]' --type shape \
  --prop text="All Systems Operational" --prop font="Arial Black" --prop size=12 --prop color=27C93F \
  --prop align=left --prop x=25cm --prop y=12.4cm --prop width=6cm --prop height=0.6cm --prop fill=none

echo "Slide 5 complete"

# ============================================
# SLIDE 6 - SUMMARY (总结页)
# ============================================
echo "Building Slide 6 - Summary..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=ellipse --prop fill=7C3AED --prop opacity=0.1 --prop softEdge=50 \
  --prop x=10cm --prop y=3cm --prop width=16cm --prop height=16cm

# 标题
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="SUMMARY" --prop font="Arial Black" --prop size=36 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=1.2cm --prop width=10cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="关键要点" --prop font="Microsoft YaHei" --prop size=20 --prop color=C9D1D9 \
  --prop align=left --prop x=2cm --prop y=2.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 左侧色条
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=0.5cm --prop y=0.5cm --prop width=0.1cm --prop height=18cm

# 3个总结卡片
# Card 1
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2cm --prop y=4cm --prop width=9cm --prop height=5cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=2cm --prop y=4cm --prop width=9cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF --prop opacity=0.2 \
  --prop x=5.8cm --prop y=4.8cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="01" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=5.8cm --prop y=5.1cm --prop width=1.2cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="架构设计" --prop font="Microsoft YaHei" --prop size=16 --prop color=FFFFFF \
  --prop align=center --prop x=2cm --prop y=6.2cm --prop width=9cm --prop height=0.7cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="采用分层架构，职责清晰" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=2cm --prop y=7.2cm --prop width=9cm --prop height=1.2cm --prop fill=none

# Card 2
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=12cm --prop y=4cm --prop width=9cm --prop height=5cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=12cm --prop y=4cm --prop width=9cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF --prop opacity=0.2 \
  --prop x=15.8cm --prop y=4.8cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="02" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=15.8cm --prop y=5.1cm --prop width=1.2cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="技术选型" --prop font="Microsoft YaHei" --prop size=16 --prop color=FFFFFF \
  --prop align=center --prop x=12cm --prop y=6.2cm --prop width=9cm --prop height=0.7cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="选择成熟稳定的技术栈" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=12cm --prop y=7.2cm --prop width=9cm --prop height=1.2cm --prop fill=none

# Card 3
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=22cm --prop y=4cm --prop width=9cm --prop height=5cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=22cm --prop y=4cm --prop width=9cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF --prop opacity=0.2 \
  --prop x=25.8cm --prop y=4.8cm --prop width=1.2cm --prop height=1.2cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="03" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF \
  --prop align=center --prop x=25.8cm --prop y=5.1cm --prop width=1.2cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="最佳实践" --prop font="Microsoft YaHei" --prop size=16 --prop color=FFFFFF \
  --prop align=center --prop x=22cm --prop y=6.2cm --prop width=9cm --prop height=0.7cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="遵循行业最佳实践" --prop font="Microsoft YaHei" --prop size=11 --prop color=8B949E \
  --prop align=center --prop x=22cm --prop y=7.2cm --prop width=9cm --prop height=1.2cm --prop fill=none

# 下一步行动卡片
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2cm --prop y=10cm --prop width=30cm --prop height=3cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="NEXT STEPS" --prop font="Arial Black" --prop size=14 --prop color=58A6FF \
  --prop align=left --prop x=3cm --prop y=10.5cm --prop width=5cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="1. 深入调研技术方案细节" --prop font="Microsoft YaHei" --prop size=12 --prop color=C9D1D9 \
  --prop align=left --prop x=3cm --prop y=11.2cm --prop width=28cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="2. 制定详细实施计划" --prop font="Microsoft YaHei" --prop size=12 --prop color=C9D1D9 \
  --prop align=left --prop x=3cm --prop y=11.8cm --prop width=28cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="3. 启动技术原型验证" --prop font="Microsoft YaHei" --prop size=12 --prop color=C9D1D9 \
  --prop align=left --prop x=3cm --prop y=12.4cm --prop width=28cm --prop height=0.5cm --prop fill=none

# Q&A 区域
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="Q&A" --prop font="Arial Black" --prop size=48 --prop color=FFFFFF \
  --prop align=center --prop x=2cm --prop y=14cm --prop width=14cm --prop height=2cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="感谢聆听 · 欢迎交流" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=center --prop x=2cm --prop y=16cm --prop width=14cm --prop height=0.6cm --prop fill=none

# 联系信息卡片
officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=18cm --prop y=14cm --prop width=13cm --prop height=2.5cm

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="CONTACT" --prop font="Arial Black" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=18cm --prop y=14.5cm --prop width=13cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="architect@company.com" --prop font="Consolas" --prop size=14 --prop color=58A6FF \
  --prop align=center --prop x=18cm --prop y=15.2cm --prop width=13cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape \
  --prop text="github.com/company/architecture" --prop font="Consolas" --prop size=12 --prop color=C9D1D9 \
  --prop align=center --prop x=18cm --prop y=15.8cm --prop width=13cm --prop height=0.5cm --prop fill=none

echo "Slide 6 complete"

# ============================================
# SLIDE 7 - DATA (性能数据页)
# ============================================
echo "Building Slide 7 - Data..."

# 光晕装饰
officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop preset=ellipse --prop fill=7C3AED --prop opacity=0.12 --prop softEdge=50 \
  --prop x=25cm --prop y=0cm --prop width=15cm --prop height=15cm

# 标题区
officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="性能指标" --prop font="Microsoft YaHei" --prop size=14 --prop color=58A6FF \
  --prop align=left --prop x=2cm --prop y=1.5cm --prop width=8cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="PERFORMANCE METRICS" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=2.2cm --prop width=20cm --prop height=1.2cm --prop fill=none

# 数据卡片1 - 响应时间
officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2cm --prop y=4.5cm --prop width=14cm --prop height=6cm

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=2cm --prop y=4.5cm --prop width=14cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="响应时间" --prop font="Microsoft YaHei" --prop size=14 --prop color=8B949E \
  --prop align=center --prop x=2cm --prop y=5.5cm --prop width=14cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="< 50ms" --prop font="Arial Black" --prop size=42 --prop color=58A6FF \
  --prop align=center --prop x=2cm --prop y=6.5cm --prop width=14cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="API平均响应延迟" --prop font="Microsoft YaHei" --prop size=12 --prop color=C9D1D9 \
  --prop align=center --prop x=2cm --prop y=8.5cm --prop width=14cm --prop height=0.5cm --prop fill=none

# 数据卡片2 - 吞吐量
officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=17.5cm --prop y=4.5cm --prop width=14cm --prop height=6cm

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop preset=rect --prop fill=7C3AED \
  --prop x=17.5cm --prop y=4.5cm --prop width=14cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="系统吞吐量" --prop font="Microsoft YaHei" --prop size=14 --prop color=8B949E \
  --prop align=center --prop x=17.5cm --prop y=5.5cm --prop width=14cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="10K+/s" --prop font="Arial Black" --prop size=42 --prop color=7C3AED \
  --prop align=center --prop x=17.5cm --prop y=6.5cm --prop width=14cm --prop height=1.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="每秒请求处理能力" --prop font="Microsoft YaHei" --prop size=12 --prop color=C9D1D9 \
  --prop align=center --prop x=17.5cm --prop y=8.5cm --prop width=14cm --prop height=0.5cm --prop fill=none

# 底部数据条
officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2cm --prop y=12cm --prop width=30cm --prop height=5.5cm

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="关键指标" --prop font="Microsoft YaHei" --prop size=14 --prop color=58A6FF \
  --prop align=left --prop x=3cm --prop y=12.8cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 指标列表
officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="可用性 99.99%" --prop font="Consolas" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=3cm --prop y=14cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="错误率 < 0.01%" --prop font="Consolas" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=3cm --prop y=14.8cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="并发连接 50K+" --prop font="Consolas" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=14cm --prop y=14cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="数据量 PB级" --prop font="Consolas" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=14cm --prop y=14.8cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="部署节点 100+" --prop font="Consolas" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=25cm --prop y=14cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[7]' --type shape \
  --prop text="自动扩缩容" --prop font="Consolas" --prop size=16 --prop color=FFFFFF \
  --prop align=left --prop x=25cm --prop y=14.8cm --prop width=10cm --prop height=0.6cm --prop fill=none

echo "Slide 7 complete"

# ============================================
# SLIDE 8 - SECURITY (安全架构页)
# ============================================
echo "Building Slide 8 - Security..."

# 光晕装饰
officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=ellipse --prop fill=06B6D4 --prop opacity=0.1 --prop softEdge=50 \
  --prop x=0cm --prop y=10cm --prop width=12cm --prop height=12cm

# 标题区
officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="安全架构" --prop font="Microsoft YaHei" --prop size=14 --prop color=06B6D4 \
  --prop align=left --prop x=2cm --prop y=1.5cm --prop width=8cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="SECURITY ARCHITECTURE" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=2.2cm --prop width=25cm --prop height=1.2cm --prop fill=none

# 四个安全卡片
# 卡片1 - 身份认证
officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2cm --prop y=4.5cm --prop width=7cm --prop height=12cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=2cm --prop y=4.5cm --prop width=7cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="AUTH" --prop font="Arial Black" --prop size=16 --prop color=58A6FF \
  --prop align=center --prop x=2cm --prop y=6cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="身份认证" --prop font="Microsoft YaHei" --prop size=18 --prop color=FFFFFF \
  --prop align=center --prop x=2cm --prop y=8cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="OAuth 2.0 / JWT" --prop font="Consolas" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=2cm --prop y=10cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="多因素认证" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=2cm --prop y=11cm --prop width=7cm --prop height=0.5cm --prop fill=none

# 卡片2 - 数据加密
officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=10cm --prop y=4.5cm --prop width=7cm --prop height=12cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=rect --prop fill=7C3AED \
  --prop x=10cm --prop y=4.5cm --prop width=7cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="ENCRYPT" --prop font="Arial Black" --prop size=16 --prop color=7C3AED \
  --prop align=center --prop x=10cm --prop y=6cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="数据加密" --prop font="Microsoft YaHei" --prop size=18 --prop color=FFFFFF \
  --prop align=center --prop x=10cm --prop y=8cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="TLS 1.3" --prop font="Consolas" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=10cm --prop y=10cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="AES-256" --prop font="Consolas" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=10cm --prop y=11cm --prop width=7cm --prop height=0.5cm --prop fill=none

# 卡片3 - 访问控制
officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=18cm --prop y=4.5cm --prop width=7cm --prop height=12cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=rect --prop fill=06B6D4 \
  --prop x=18cm --prop y=4.5cm --prop width=7cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="RBAC" --prop font="Arial Black" --prop size=16 --prop color=06B6D4 \
  --prop align=center --prop x=18cm --prop y=6cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="访问控制" --prop font="Microsoft YaHei" --prop size=18 --prop color=FFFFFF \
  --prop align=center --prop x=18cm --prop y=8cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="角色权限管理" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=18cm --prop y=10cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="细粒度授权" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=18cm --prop y=11cm --prop width=7cm --prop height=0.5cm --prop fill=none

# 卡片4 - 审计日志
officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=26cm --prop y=4.5cm --prop width=7cm --prop height=12cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=26cm --prop y=4.5cm --prop width=7cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="AUDIT" --prop font="Arial Black" --prop size=16 --prop color=58A6FF \
  --prop align=center --prop x=26cm --prop y=6cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="审计日志" --prop font="Microsoft YaHei" --prop size=18 --prop color=FFFFFF \
  --prop align=center --prop x=26cm --prop y=8cm --prop width=7cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="操作追踪" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=26cm --prop y=10cm --prop width=7cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[8]' --type shape \
  --prop text="合规报告" --prop font="Microsoft YaHei" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=26cm --prop y=11cm --prop width=7cm --prop height=0.5cm --prop fill=none

echo "Slide 8 complete"

# ============================================
# SLIDE 9 - SCALABILITY (可扩展性页)
# ============================================
echo "Building Slide 9 - Scalability..."

# 光晕装饰
officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop preset=ellipse --prop fill=7C3AED --prop opacity=0.12 --prop softEdge=50 \
  --prop x=25cm --prop y=5cm --prop width=15cm --prop height=15cm

# 标题区
officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="可扩展性设计" --prop font="Microsoft YaHei" --prop size=14 --prop color=7C3AED \
  --prop align=left --prop x=2cm --prop y=1.5cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="SCALABILITY DESIGN" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF \
  --prop align=left --prop x=2cm --prop y=2.2cm --prop width=25cm --prop height=1.2cm --prop fill=none

# 水平扩展卡片
officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=2cm --prop y=4.5cm --prop width=14cm --prop height=12cm

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop preset=rect --prop fill=58A6FF \
  --prop x=2cm --prop y=4.5cm --prop width=14cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="水平扩展" --prop font="Microsoft YaHei" --prop size=20 --prop color=FFFFFF \
  --prop align=left --prop x=3cm --prop y=5.5cm --prop width=12cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="Horizontal Scaling" --prop font="Consolas" --prop size=12 --prop color=58A6FF \
  --prop align=left --prop x=3cm --prop y=6.5cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 无状态服务设计" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=3cm --prop y=8cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 负载均衡策略" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=3cm --prop y=9cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 自动扩缩容" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=3cm --prop y=10cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 容器化部署" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=3cm --prop y=11cm --prop width=12cm --prop height=0.5cm --prop fill=none

# 垂直扩展卡片
officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=17.5cm --prop y=4.5cm --prop width=14cm --prop height=12cm

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop preset=rect --prop fill=7C3AED \
  --prop x=17.5cm --prop y=4.5cm --prop width=14cm --prop height=0.1cm

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="垂直扩展" --prop font="Microsoft YaHei" --prop size=20 --prop color=FFFFFF \
  --prop align=left --prop x=18.5cm --prop y=5.5cm --prop width=12cm --prop height=0.8cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="Vertical Scaling" --prop font="Consolas" --prop size=12 --prop color=7C3AED \
  --prop align=left --prop x=18.5cm --prop y=6.5cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 数据库优化" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=18.5cm --prop y=8cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 缓存策略" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=18.5cm --prop y=9cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 读写分离" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=18.5cm --prop y=10cm --prop width=12cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[9]' --type shape \
  --prop text="• 分库分表" --prop font="Microsoft YaHei" --prop size=14 --prop color=C9D1D9 \
  --prop align=left --prop x=18.5cm --prop y=11cm --prop width=12cm --prop height=0.5cm --prop fill=none

echo "Slide 9 complete"

# ============================================
# SLIDE 10 - THANKS (结束页)
# ============================================
echo "Building Slide 10 - Thanks..."

# 大光晕装饰
officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop preset=ellipse --prop fill=58A6FF --prop opacity=0.15 --prop softEdge=80 \
  --prop x=8cm --prop y=0cm --prop width=20cm --prop height=20cm

officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop preset=ellipse --prop fill=7C3AED --prop opacity=0.12 --prop softEdge=60 \
  --prop x=20cm --prop y=8cm --prop width=15cm --prop height=15cm

# 主标题
officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop text="感谢聆听" --prop font="Microsoft YaHei" --prop size=56 --prop color=FFFFFF \
  --prop align=center --prop x=2cm --prop y=5cm --prop width=30cm --prop height=2.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop text="THANK YOU" --prop font="Arial Black" --prop size=28 --prop color=58A6FF \
  --prop align=center --prop x=2cm --prop y=8cm --prop width=30cm --prop height=1.2cm --prop fill=none

# Q&A
officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop text="Q & A" --prop font="Arial Black" --prop size=48 --prop color=7C3AED \
  --prop align=center --prop x=2cm --prop y=10.5cm --prop width=30cm --prop height=2cm --prop fill=none

# 联系信息
officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop preset=roundRect --prop fill=161B22 \
  --prop x=8cm --prop y=14cm --prop width=18cm --prop height=3.5cm

officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop text="CONTACT" --prop font="Arial Black" --prop size=12 --prop color=8B949E \
  --prop align=center --prop x=8cm --prop y=14.5cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop text="architect@company.com" --prop font="Consolas" --prop size=14 --prop color=58A6FF \
  --prop align=center --prop x=8cm --prop y=15.5cm --prop width=18cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[10]' --type shape \
  --prop text="github.com/company/architecture" --prop font="Consolas" --prop size=12 --prop color=C9D1D9 \
  --prop align=center --prop x=8cm --prop y=16.3cm --prop width=18cm --prop height=0.5cm --prop fill=none

echo "Slide 10 complete"

# ============================================
# MORPH TRANSITIONS
# ============================================
echo "Adding Morph transitions..."
for i in 2 3 4 5 6 7 8 9 10; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

# ============================================
# VALIDATION
# ============================================
echo "Validating..."
officecli validate "$OUTPUT"

echo "Complete: $OUTPUT"
echo "Slides: 10"