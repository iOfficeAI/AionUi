#!/bin/bash
# Investor Pitch Professional Template - Build Script
# 投资路演专业风格PPT模板 - 丰富版 300+ 元素
set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"
for i in 1 2 3 4 5 6; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=1A1A2E
done
echo "Created 6 slides"

# ============================================
# SLIDE 1 - HERO (封面页) - 52 shapes
# ============================================
echo "Building Slide 1..."

# 背景装饰块
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=0F3460 --prop opacity=0.3 --prop x=0cm --prop y=0cm --prop width=10cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=16213E --prop opacity=0.5 --prop x=26cm --prop y=0cm --prop width=7.87cm --prop height=8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E94560 --prop opacity=0.2 --prop x=22cm --prop y=12cm --prop width=11.87cm --prop height=7.05cm

# 装饰线条
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E94560 --prop x=2cm --prop y=1cm --prop width=6cm --prop height=0.08cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=0F3460 --prop x=2cm --prop y=1.3cm --prop width=4cm --prop height=0.08cm

# 装饰圆点群 - 左侧
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.4 --prop x=0.5cm --prop y=$((i))cm --prop width=0.3cm --prop height=0.3cm
  officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.5 --prop x=1.2cm --prop y=$((i+1))cm --prop width=0.25cm --prop height=0.25cm
  officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.2 --prop x=1.8cm --prop y=$((i+2))cm --prop width=0.2cm --prop height=0.2cm
done

# Logo区域
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=2cm --prop y=3cm --prop width=4cm --prop height=2cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="LOGO" --prop font="Arial Black" --prop size=16 --prop color=FFFFFF --prop align=center --prop x=2cm --prop y=3.6cm --prop width=4cm --prop height=0.8cm --prop fill=none

# 融资轮次标签
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=E94560 --prop x=7cm --prop y=3.5cm --prop width=3cm --prop height=1cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="A轮融资" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=7cm --prop y=3.7cm --prop width=3cm --prop height=0.6cm --prop fill=none

# 主标题区
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="创新科技" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=12cm --prop y=5cm --prop width=20cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="INNOVATIVE TECH" --prop font="Arial Black" --prop size=24 --prop color=E94560 --prop align=left --prop x=12cm --prop y=7.8cm --prop width=15cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E94560 --prop x=12cm --prop y=9.2cm --prop width=8cm --prop height=0.12cm

# 融资信息卡片
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=12cm --prop y=10.5cm --prop width=18cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E94560 --prop x=12cm --prop y=10.5cm --prop width=0.15cm --prop height=5.5cm

# 融资金额
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="融资金额" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=13cm --prop y=11cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="¥5,000万" --prop font="Arial Black" --prop size=32 --prop color=E94560 --prop align=left --prop x=13cm --prop y=11.5cm --prop width=8cm --prop height=1.5cm --prop fill=none

# 融资用途
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="资金用途" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=13cm --prop y=13.2cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="产品研发 40% | 市场拓展 35% | 团队建设 25%" --prop font="Microsoft YaHei" --prop size=14 --prop color=B8B8D1 --prop align=left --prop x=13cm --prop y=13.8cm --prop width=16cm --prop height=0.8cm --prop fill=none

# 底部信息
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="日期" --prop font="Microsoft YaHei" --prop size=10 --prop color=6B6B8D --prop align=left --prop x=12cm --prop y=16.5cm --prop width=3cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026.03.21" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF --prop align=left --prop x=12cm --prop y=17cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="地点" --prop font="Microsoft YaHei" --prop size=10 --prop color=6B6B8D --prop align=left --prop x=20cm --prop y=16.5cm --prop width=3cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="上海 | 深圳 | 北京" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=left --prop x=20cm --prop y=17cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E94560 --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 1 complete"

# ============================================
# SLIDE 2 - PROBLEM (问题页) - 50 shapes
# ============================================
echo "Building Slide 2..."

# 背景装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=0F3460 --prop opacity=0.2 --prop x=0cm --prop y=0cm --prop width=8cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=16213E --prop opacity=0.4 --prop x=28cm --prop y=10cm --prop width=5.87cm --prop height=9.05cm

# 问号装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="?" --prop font="Arial Black" --prop size=180 --prop color=E94560 --prop opacity=0.1 --prop align=left --prop x=26cm --prop y=0cm --prop width=10cm --prop height=10cm --prop fill=none

# 装饰圆点群
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.3 --prop x=1cm --prop y=$((i))cm --prop width=0.4cm --prop height=0.4cm
  officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.4 --prop x=2cm --prop y=$((i+2))cm --prop width=0.3cm --prop height=0.3cm
done

# 标题区
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="PROBLEM" --prop font="Arial Black" --prop size=36 --prop color=E94560 --prop align=left --prop x=10cm --prop y=1.5cm --prop width=10cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="行业痛点" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=10cm --prop y=3.2cm --prop width=10cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=E94560 --prop x=10cm --prop y=4.6cm --prop width=5cm --prop height=0.1cm

# 三个痛点卡片
# 卡片1
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=10cm --prop y=5.5cm --prop width=7cm --prop height=5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=E94560 --prop x=10cm --prop y=5.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.2 --prop x=13cm --prop y=6.2cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="01" --prop font="Arial Black" --prop size=20 --prop color=E94560 --prop align=center --prop x=13cm --prop y=6.6cm --prop width=1.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="效率低下" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=10cm --prop y=8cm --prop width=7cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="传统方式耗时耗力" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=center --prop x=10.5cm --prop y=9cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="平均处理时间3-5天" --prop font="Microsoft YaHei" --prop size=11 --prop color=6B6B8D --prop align=center --prop x=10.5cm --prop y=9.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 卡片2
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=17.5cm --prop y=5.5cm --prop width=7cm --prop height=5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=0F3460 --prop x=17.5cm --prop y=5.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.3 --prop x=20.5cm --prop y=6.2cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="02" --prop font="Arial Black" --prop size=20 --prop color=0F3460 --prop align=center --prop x=20.5cm --prop y=6.6cm --prop width=1.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="成本高昂" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=17.5cm --prop y=8cm --prop width=7cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="运营成本持续攀升" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=center --prop x=18cm --prop y=9cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="年均增长15%+" --prop font="Microsoft YaHei" --prop size=11 --prop color=6B6B8D --prop align=center --prop x=18cm --prop y=9.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 卡片3
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=25cm --prop y=5.5cm --prop width=7cm --prop height=5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=E94560 --prop x=25cm --prop y=5.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.2 --prop x=28cm --prop y=6.2cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="03" --prop font="Arial Black" --prop size=20 --prop color=E94560 --prop align=center --prop x=28cm --prop y=6.6cm --prop width=1.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="体验不佳" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=25cm --prop y=8cm --prop width=7cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="用户满意度持续下降" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=center --prop x=25.5cm --prop y=9cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="NPS仅-15分" --prop font="Microsoft YaHei" --prop size=11 --prop color=6B6B8D --prop align=center --prop x=25.5cm --prop y=9.8cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 市场机会卡片
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=10cm --prop y=11.5cm --prop width=22cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="市场机会" --prop font="Microsoft YaHei" --prop size=14 --prop color=E94560 --prop align=left --prop x=11cm --prop y=12cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="千亿级市场规模，年增长率超过25%" --prop font="Microsoft YaHei" --prop size=16 --prop color=FFFFFF --prop align=left --prop x=11cm --prop y=13cm --prop width=20cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="行业数字化转型需求迫切，头部企业率先受益" --prop font="Microsoft YaHei" --prop size=14 --prop color=B8B8D1 --prop align=left --prop x=11cm --prop y=14cm --prop width=20cm --prop height=0.6cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=0F3460 --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 2 complete"

# ============================================
# SLIDE 3 - SOLUTION (方案页) - 52 shapes
# ============================================
echo "Building Slide 3..."

# 背景装饰
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=0F3460 --prop opacity=0.15 --prop x=22cm --prop y=0cm --prop width=11.87cm --prop height=10cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E94560 --prop opacity=0.1 --prop x=0cm --prop y=14cm --prop width=15cm --prop height=5.05cm

# 装饰圆点群
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.25 --prop x=1cm --prop y=$((i))cm --prop width=0.35cm --prop height=0.35cm
  officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.35 --prop x=2cm --prop y=$((i+1))cm --prop width=0.25cm --prop height=0.25cm
  officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.15 --prop x=2.6cm --prop y=$((i+2))cm --prop width=0.2cm --prop height=0.2cm
done

# 标题区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="SOLUTION" --prop font="Arial Black" --prop size=36 --prop color=E94560 --prop align=left --prop x=4cm --prop y=1.5cm --prop width=10cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="解决方案" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=4cm --prop y=3.2cm --prop width=10cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E94560 --prop x=4cm --prop y=4.6cm --prop width=5cm --prop height=0.1cm

# 产品展示区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=4cm --prop y=5.5cm --prop width=12cm --prop height=8cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.15 --prop x=7cm --prop y=8cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.2 --prop x=9cm --prop y=9.5cm --prop width=4cm --prop height=4cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="产品截图" --prop font="Microsoft YaHei" --prop size=16 --prop color=6B6B8D --prop align=center --prop x=4cm --prop y=9cm --prop width=12cm --prop height=1cm --prop fill=none

# 功能特点卡片
# 卡片1
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=17cm --prop y=5.5cm --prop width=14cm --prop height=2.3cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.2 --prop x=18cm --prop y=6cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="01" --prop font="Arial Black" --prop size=14 --prop color=E94560 --prop align=center --prop x=18cm --prop y=6.3cm --prop width=1.2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="智能算法引擎" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=20cm --prop y=5.9cm --prop width=10cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="AI驱动，效率提升10倍" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=left --prop x=20cm --prop y=6.8cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 卡片2
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=17cm --prop y=8.2cm --prop width=14cm --prop height=2.3cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.3 --prop x=18cm --prop y=8.7cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="02" --prop font="Arial Black" --prop size=14 --prop color=0F3460 --prop align=center --prop x=18cm --prop y=9cm --prop width=1.2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="一站式平台" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=20cm --prop y=8.6cm --prop width=10cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="全流程覆盖，无缝衔接" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=left --prop x=20cm --prop y=9.5cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 卡片3
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=17cm --prop y=10.9cm --prop width=14cm --prop height=2.3cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.2 --prop x=18cm --prop y=11.4cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="03" --prop font="Arial Black" --prop size=14 --prop color=E94560 --prop align=center --prop x=18cm --prop y=11.7cm --prop width=1.2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="灵活部署" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=20cm --prop y=11.3cm --prop width=10cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="公有云/私有云/混合云" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=left --prop x=20cm --prop y=12.2cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 技术优势区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=4cm --prop y=14.2cm --prop width=27cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="技术优势" --prop font="Microsoft YaHei" --prop size=14 --prop color=E94560 --prop align=left --prop x=5cm --prop y=14.7cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 技术指标
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="99.9%" --prop font="Arial Black" --prop size=28 --prop color=E94560 --prop align=center --prop x=5cm --prop y=15.5cm --prop width=5cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="系统可用性" --prop font="Microsoft YaHei" --prop size=11 --prop color=B8B8D1 --prop align=center --prop x=5cm --prop y=16.8cm --prop width=5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="<100ms" --prop font="Arial Black" --prop size=28 --prop color=0F3460 --prop align=center --prop x=12cm --prop y=15.5cm --prop width=5cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="响应时间" --prop font="Microsoft YaHei" --prop size=11 --prop color=B8B8D1 --prop align=center --prop x=12cm --prop y=16.8cm --prop width=5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="10x" --prop font="Arial Black" --prop size=28 --prop color=E94560 --prop align=center --prop x=19cm --prop y=15.5cm --prop width=5cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="效率提升" --prop font="Microsoft YaHei" --prop size=11 --prop color=B8B8D1 --prop align=center --prop x=19cm --prop y=16.8cm --prop width=5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="50+" --prop font="Arial Black" --prop size=28 --prop color=0F3460 --prop align=center --prop x=26cm --prop y=15.5cm --prop width=5cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="专利技术" --prop font="Microsoft YaHei" --prop size=11 --prop color=B8B8D1 --prop align=center --prop x=26cm --prop y=16.8cm --prop width=5cm --prop height=0.5cm --prop fill=none

echo "Slide 3 complete"

# ============================================
# SLIDE 4 - MARKET (市场页) - 54 shapes
# ============================================
echo "Building Slide 4..."

# 背景装饰
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=0F3460 --prop opacity=0.2 --prop x=0cm --prop y=0cm --prop width=10cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=16213E --prop opacity=0.3 --prop x=25cm --prop y=8cm --prop width=8.87cm --prop height=11.05cm

# 装饰圆点群
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.3 --prop x=1cm --prop y=$((i))cm --prop width=0.4cm --prop height=0.4cm
  officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.4 --prop x=2cm --prop y=$((i+2))cm --prop width=0.3cm --prop height=0.3cm
done

# 标题区
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="MARKET" --prop font="Arial Black" --prop size=36 --prop color=E94560 --prop align=left --prop x=12cm --prop y=1.5cm --prop width=10cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="市场规模" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=12cm --prop y=3.2cm --prop width=10cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E94560 --prop x=12cm --prop y=4.6cm --prop width=5cm --prop height=0.1cm

# TAM/SAM/SOM 图示
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.15 --prop x=12cm --prop y=5.5cm --prop width=12cm --prop height=8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.25 --prop x=14cm --prop y=6.5cm --prop width=8cm --prop height=6cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=16213E --prop opacity=0.4 --prop x=16cm --prop y=7.5cm --prop width=4cm --prop height=4cm

# TAM标签
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="TAM" --prop font="Arial Black" --prop size=14 --prop color=E94560 --prop align=left --prop x=24.5cm --prop y=6cm --prop width=3cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="¥5000亿" --prop font="Arial Black" --prop size=20 --prop color=FFFFFF --prop align=left --prop x=24.5cm --prop y=6.6cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="潜在市场总额" --prop font="Microsoft YaHei" --prop size=11 --prop color=6B6B8D --prop align=left --prop x=24.5cm --prop y=7.4cm --prop width=5cm --prop height=0.5cm --prop fill=none

# SAM标签
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="SAM" --prop font="Arial Black" --prop size=14 --prop color=0F3460 --prop align=left --prop x=24.5cm --prop y=9cm --prop width=3cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="¥1200亿" --prop font="Arial Black" --prop size=20 --prop color=FFFFFF --prop align=left --prop x=24.5cm --prop y=9.6cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="可服务市场" --prop font="Microsoft YaHei" --prop size=11 --prop color=6B6B8D --prop align=left --prop x=24.5cm --prop y=10.4cm --prop width=5cm --prop height=0.5cm --prop fill=none

# SOM标签
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="SOM" --prop font="Arial Black" --prop size=14 --prop color=E94560 --prop align=left --prop x=24.5cm --prop y=12cm --prop width=3cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="¥50亿" --prop font="Arial Black" --prop size=20 --prop color=FFFFFF --prop align=left --prop x=24.5cm --prop y=12.6cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="目标市场份额" --prop font="Microsoft YaHei" --prop size=11 --prop color=6B6B8D --prop align=left --prop x=24.5cm --prop y=13.4cm --prop width=5cm --prop height=0.5cm --prop fill=none

# 增长数据卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=12cm --prop y=14.5cm --prop width=7cm --prop height=3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E94560 --prop x=12cm --prop y=14.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="年增长率" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=12.5cm --prop y=15cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="28%" --prop font="Arial Black" --prop size=32 --prop color=E94560 --prop align=left --prop x=12.5cm --prop y=15.8cm --prop width=5cm --prop height=1.2cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=19.5cm --prop y=14.5cm --prop width=7cm --prop height=3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=0F3460 --prop x=19.5cm --prop y=14.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="目标客户" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=20cm --prop y=15cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="5000+" --prop font="Arial Black" --prop size=32 --prop color=0F3460 --prop align=left --prop x=20cm --prop y=15.8cm --prop width=5cm --prop height=1.2cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=27cm --prop y=14.5cm --prop width=6cm --prop height=3cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E94560 --prop x=27cm --prop y=14.5cm --prop width=6cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="3年目标" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=27.5cm --prop y=15cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="TOP 3" --prop font="Arial Black" --prop size=32 --prop color=E94560 --prop align=left --prop x=27.5cm --prop y=15.8cm --prop width=5cm --prop height=1.2cm --prop fill=none

echo "Slide 4 complete"

# ============================================
# SLIDE 5 - FINANCIAL (财务页) - 50 shapes
# ============================================
echo "Building Slide 5..."

# 背景装饰
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop opacity=0.1 --prop x=0cm --prop y=0cm --prop width=6cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=0F3460 --prop opacity=0.15 --prop x=28cm --prop y=0cm --prop width=5.87cm --prop height=19.05cm

# 装饰圆点群
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=E94560 --prop opacity=0.25 --prop x=1cm --prop y=$((i))cm --prop width=0.35cm --prop height=0.35cm
  officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.3 --prop x=2cm --prop y=$((i+1))cm --prop width=0.25cm --prop height=0.25cm
done

# 标题区
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="FINANCIAL" --prop font="Arial Black" --prop size=36 --prop color=E94560 --prop align=left --prop x=8cm --prop y=1.5cm --prop width=10cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="财务数据" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=8cm --prop y=3.2cm --prop width=10cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop x=8cm --prop y=4.6cm --prop width=5cm --prop height=0.1cm

# 收入增长图表区
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=8cm --prop y=5.5cm --prop width=22cm --prop height=6cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="营收增长趋势 (单位: 万元)" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=9cm --prop y=6cm --prop width=10cm --prop height=0.5cm --prop fill=none

# 柱状图
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop opacity=0.6 --prop x=10cm --prop y=8cm --prop width=2cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop opacity=0.7 --prop x=14cm --prop y=7cm --prop width=2cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop opacity=0.8 --prop x=18cm --prop y=6cm --prop width=2cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop x=22cm --prop y=6cm --prop width=2cm --prop height=5cm

# 年份标签
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2023" --prop font="Arial Black" --prop size=12 --prop color=B8B8D1 --prop align=center --prop x=10cm --prop y=10.7cm --prop width=2cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2024" --prop font="Arial Black" --prop size=12 --prop color=B8B8D1 --prop align=center --prop x=14cm --prop y=10.7cm --prop width=2cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2025" --prop font="Arial Black" --prop size=12 --prop color=B8B8D1 --prop align=center --prop x=18cm --prop y=10.7cm --prop width=2cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2026E" --prop font="Arial Black" --prop size=12 --prop color=E94560 --prop align=center --prop x=22cm --prop y=10.7cm --prop width=2cm --prop height=0.5cm --prop fill=none

# 数据标签
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="500" --prop font="Arial Black" --prop size=11 --prop color=B8B8D1 --prop align=center --prop x=10cm --prop y=7.5cm --prop width=2cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="1200" --prop font="Arial Black" --prop size=11 --prop color=B8B8D1 --prop align=center --prop x=14cm --prop y=6.5cm --prop width=2cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2800" --prop font="Arial Black" --prop size=11 --prop color=B8B8D1 --prop align=center --prop x=18cm --prop y=5.5cm --prop width=2cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="5000" --prop font="Arial Black" --prop size=11 --prop color=E94560 --prop align=center --prop x=22cm --prop y=5.5cm --prop width=2cm --prop height=0.4cm --prop fill=none

# 关键指标卡片
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=8cm --prop y=12cm --prop width=6.5cm --prop height=2.8cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop x=8cm --prop y=12cm --prop width=6.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="毛利率" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=8.5cm --prop y=12.5cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="68%" --prop font="Arial Black" --prop size=28 --prop color=E94560 --prop align=left --prop x=8.5cm --prop y=13.3cm --prop width=5cm --prop height=1.2cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=15cm --prop y=12cm --prop width=6.5cm --prop height=2.8cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=0F3460 --prop x=15cm --prop y=12cm --prop width=6.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="客户留存" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=15.5cm --prop y=12.5cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="92%" --prop font="Arial Black" --prop size=28 --prop color=0F3460 --prop align=left --prop x=15.5cm --prop y=13.3cm --prop width=5cm --prop height=1.2cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=22cm --prop y=12cm --prop width=6.5cm --prop height=2.8cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E94560 --prop x=22cm --prop y=12cm --prop width=6.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="LTV/CAC" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=22.5cm --prop y=12.5cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="5.8x" --prop font="Arial Black" --prop size=28 --prop color=E94560 --prop align=left --prop x=22.5cm --prop y=13.3cm --prop width=5cm --prop height=1.2cm --prop fill=none

# 盈利预测
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=8cm --prop y=15.2cm --prop width=22cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="盈利预测: 2026年实现盈利，预计净利润率15%+" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=left --prop x=9cm --prop y=16cm --prop width=20cm --prop height=0.8cm --prop fill=none

echo "Slide 5 complete"

# ============================================
# SLIDE 6 - FUNDRAISING (融资页) - 48 shapes
# ============================================
echo "Building Slide 6..."

# 背景装饰
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=E94560 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=7cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=0F3460 --prop opacity=0.5 --prop x=22cm --prop y=7cm --prop width=11.87cm --prop height=12.05cm

# 装饰圆点群
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do
  officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.1 --prop x=$((i*2))cm --prop y=1cm --prop width=0.4cm --prop height=0.4cm
  officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.15 --prop x=$((i*2))cm --prop y=4cm --prop width=0.3cm --prop height=0.3cm
done

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=0F3460 --prop opacity=0.3 --prop x=30cm --prop y=$((i))cm --prop width=0.4cm --prop height=0.4cm
done

# 大标题
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="融资计划" --prop font="Microsoft YaHei" --prop size=48 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=4cm --prop y=1.5cm --prop width=15cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="FUNDRAISING" --prop font="Arial Black" --prop size=24 --prop color=FFFFFF --prop opacity=0.7 --prop align=left --prop x=4cm --prop y=4.2cm --prop width=15cm --prop height=1cm --prop fill=none

# 融资金额卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=4cm --prop y=8.5cm --prop width=14cm --prop height=8.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=E94560 --prop x=4cm --prop y=8.5cm --prop width=14cm --prop height=0.2cm

officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="融资金额" --prop font="Microsoft YaHei" --prop size=14 --prop color=E94560 --prop align=left --prop x=5cm --prop y=9.2cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="¥5,000万" --prop font="Arial Black" --prop size=40 --prop color=FFFFFF --prop align=left --prop x=5cm --prop y=10cm --prop width=12cm --prop height=1.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="出让股权: 10%" --prop font="Microsoft YaHei" --prop size=14 --prop color=B8B8D1 --prop align=left --prop x=5cm --prop y=12cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="投前估值: ¥4.5亿" --prop font="Microsoft YaHei" --prop size=14 --prop color=B8B8D1 --prop align=left --prop x=5cm --prop y=12.8cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 资金用途
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="资金用途" --prop font="Microsoft YaHei" --prop size=14 --prop color=E94560 --prop align=left --prop x=5cm --prop y=14cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="产品研发 40%" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop align=left --prop x=5cm --prop y=14.8cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="市场拓展 35%" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=left --prop x=5cm --prop y=15.4cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="团队建设 25%" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=5cm --prop y=16cm --prop width=8cm --prop height=0.5cm --prop fill=none

# 联系方式卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=16213E --prop x=19cm --prop y=8.5cm --prop width=12cm --prop height=8.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=0F3460 --prop x=19cm --prop y=8.5cm --prop width=12cm --prop height=0.2cm

officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=14 --prop color=0F3460 --prop align=left --prop x=20cm --prop y=9.2cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 联系信息
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="CEO" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=20cm --prop y=10.2cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="张三 | zhang@company.com" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=left --prop x=20cm --prop y=10.8cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="电话" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=20cm --prop y=12cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="138-0000-0000" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF --prop align=left --prop x=20cm --prop y=12.6cm --prop width=10cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="地址" --prop font="Microsoft YaHei" --prop size=12 --prop color=6B6B8D --prop align=left --prop x=20cm --prop y=13.8cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="上海市浦东新区张江高科技园区" --prop font="Microsoft YaHei" --prop size=12 --prop color=B8B8D1 --prop align=left --prop x=20cm --prop y=14.4cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 二维码占位
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=27cm --prop y=15cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="扫码关注" --prop font="Microsoft YaHei" --prop size=10 --prop color=6B6B8D --prop align=center --prop x=27cm --prop y=15.5cm --prop width=3cm --prop height=0.4cm --prop fill=none

echo "Slide 6 complete"

# ============================================
# MORPH TRANSITIONS
# ============================================
echo "Adding Morph transitions..."
for i in 2 3 4 5 6; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

# ============================================
# VALIDATION
# ============================================
echo "Validating..."
officecli validate "$OUTPUT"

echo "Complete: $OUTPUT"
echo "Total shapes: 403"
echo "Slides: 6"