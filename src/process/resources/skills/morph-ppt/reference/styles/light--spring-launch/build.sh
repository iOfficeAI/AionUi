#!/bin/bash
# Spring Launch Template - Build Script v2.0
# 春季发布清新风格PPT模板 - 自然曲线+花瓣布局
set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"
for i in 1 2 3 4 5 6; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=E8F5E9
done
echo "Created 6 slides"

# SLIDE 1 - HERO (封面页) - 曲线分割+花瓣装饰
echo "Building Slide 1..."
# 右侧浅色区域
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FFFFFF --prop opacity=0.4 --prop x=15cm --prop y=0cm --prop width=18.87cm --prop height=19.05cm

# 左侧绿色装饰区域
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=4CAF50 --prop opacity=0.1 --prop x=0cm --prop y=0cm --prop width=10cm --prop height=19.05cm

# 手动定义花瓣装饰（最多3个）
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=4CAF50 --prop opacity=0.15 --prop x=4cm --prop y=3cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.12 --prop x=20cm --prop y=1cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=81C784 --prop opacity=0.1 --prop x=24cm --prop y=12cm --prop width=6cm --prop height=6cm

# 主内容卡片
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=8cm --prop y=4cm --prop width=18cm --prop height=11cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=8cm --prop y=4cm --prop width=18cm --prop height=0.15cm

# 标签
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=4CAF50 --prop x=10cm --prop y=5cm --prop width=4cm --prop height=1cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="春季发布" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=10cm --prop y=5.2cm --prop width=4cm --prop height=0.6cm --prop fill=none

# 主标题
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026 春季" --prop font="Microsoft YaHei" --prop size=28 --prop color=1B5E20 --prop align=left --prop x=10cm --prop y=6.5cm --prop width=14cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="新品发布会" --prop font="Microsoft YaHei" --prop size=52 --prop bold=true --prop color=4CAF50 --prop align=left --prop x=10cm --prop y=8cm --prop width=14cm --prop height=2.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="SPRING LAUNCH EVENT" --prop font="Arial Black" --prop size=18 --prop color=8BC34A --prop align=left --prop x=10cm --prop y=10.5cm --prop width=14cm --prop height=0.8cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=10cm --prop y=12cm --prop width=8cm --prop height=0.1cm

# 日期地点
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="日期" --prop font="Microsoft YaHei" --prop size=11 --prop color=66BB6A --prop align=left --prop x=10cm --prop y=12.5cm --prop width=2cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026.03.21 - 03.25" --prop font="Arial Black" --prop size=14 --prop color=1B5E20 --prop align=left --prop x=10cm --prop y=13cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="地点" --prop font="Microsoft YaHei" --prop size=11 --prop color=66BB6A --prop align=left --prop x=10cm --prop y=13.8cm --prop width=2cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="上海国际会议中心" --prop font="Microsoft YaHei" --prop size=14 --prop color=1B5E20 --prop align=left --prop x=10cm --prop y=14.3cm --prop width=10cm --prop height=0.5cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=0cm --prop y=18.5cm --prop width=33.87cm --prop height=0.55cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=8BC34A --prop x=0cm --prop y=18.3cm --prop width=15cm --prop height=0.2cm
echo "Slide 1 complete"

# SLIDE 2 - HIGHLIGHTS (亮点页) - 四叶草布局
echo "Building Slide 2..."
# 左侧浅色区域
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFFFFF --prop opacity=0.4 --prop x=0cm --prop y=0cm --prop width=12cm --prop height=19.05cm

# 右下角装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=81C784 --prop opacity=0.15 --prop x=22cm --prop y=12cm --prop width=11.87cm --prop height=7.05cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=4CAF50 --prop opacity=0.08 --prop x=5cm --prop y=8cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.06 --prop x=25cm --prop y=2cm --prop width=5cm --prop height=5cm

# 大字背景
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="NEW" --prop font="Arial Black" --prop size=180 --prop color=4CAF50 --prop opacity=0.1 --prop align=left --prop x=2cm --prop y=0cm --prop width=28cm --prop height=10cm --prop fill=none

# 标题
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="核心亮点" --prop font="Microsoft YaHei" --prop size=16 --prop color=8BC34A --prop align=left --prop x=6cm --prop y=2cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="三大突破" --prop font="Microsoft YaHei" --prop size=64 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=6cm --prop y=3.5cm --prop width=16cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="引领行业新标准，开创产品新时代" --prop font="Microsoft YaHei" --prop size=14 --prop color=388E3C --prop align=left --prop x=6cm --prop y=6.5cm --prop width=20cm --prop height=0.8cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=6cm --prop y=7.8cm --prop width=5cm --prop height=0.1cm

# 三卡片（四叶草式错位排列）
# 卡片1 - 左
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=4cm --prop y=9cm --prop width=9cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=4cm --prop y=9cm --prop width=9cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=4CAF50 --prop opacity=0.15 --prop x=5.5cm --prop y=10cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="01" --prop font="Arial Black" --prop size=22 --prop color=4CAF50 --prop align=center --prop x=5.5cm --prop y=10.7cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="技术创新" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=8.5cm --prop y=9.8cm --prop width=4cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="全新核心算法" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=left --prop x=8.5cm --prop y=10.8cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="性能提升 40%" --prop font="Arial Black" --prop size=26 --prop color=4CAF50 --prop align=left --prop x=5cm --prop y=12.2cm --prop width=7cm --prop height=1cm --prop fill=none

# 卡片2 - 中上
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=14cm --prop y=8.5cm --prop width=9cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=8BC34A --prop x=14cm --prop y=8.5cm --prop width=9cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.2 --prop x=15.5cm --prop y=9.5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="02" --prop font="Arial Black" --prop size=22 --prop color=8BC34A --prop align=center --prop x=15.5cm --prop y=10.2cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="设计革新" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=18.5cm --prop y=9.3cm --prop width=4cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="轻薄便携设计" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=left --prop x=18.5cm --prop y=10.3cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="重量减轻 35%" --prop font="Arial Black" --prop size=26 --prop color=8BC34A --prop align=left --prop x=15cm --prop y=11.7cm --prop width=7cm --prop height=1cm --prop fill=none

# 卡片3 - 右
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=24cm --prop y=9cm --prop width=9cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=81C784 --prop x=24cm --prop y=9cm --prop width=9cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=81C784 --prop opacity=0.25 --prop x=25.5cm --prop y=10cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="03" --prop font="Arial Black" --prop size=22 --prop color=81C784 --prop align=center --prop x=25.5cm --prop y=10.7cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="体验升级" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=28.5cm --prop y=9.8cm --prop width=4cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="智能交互系统" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=left --prop x=28.5cm --prop y=10.8cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="满意度 98%" --prop font="Arial Black" --prop size=26 --prop color=81C784 --prop align=left --prop x=25cm --prop y=12.2cm --prop width=7cm --prop height=1cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=0cm --prop y=18.5cm --prop width=33.87cm --prop height=0.55cm
echo "Slide 2 complete"

# SLIDE 3 - FEATURES (功能页) - 纵向功能流
echo "Building Slide 3..."
# 顶部装饰
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=4CAF50 --prop opacity=0.08 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.4cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.12 --prop x=2cm --prop y=2cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=81C784 --prop opacity=0.08 --prop x=5cm --prop y=5cm --prop width=4cm --prop height=4cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.1 --prop x=28cm --prop y=10cm --prop width=5cm --prop height=5cm

# 左侧产品展示区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=1cm --prop y=1.5cm --prop width=14cm --prop height=16cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=1cm --prop y=1.5cm --prop width=14cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="产品展示" --prop font="Microsoft YaHei" --prop size=14 --prop color=66BB6A --prop align=center --prop x=1cm --prop y=8cm --prop width=14cm --prop height=0.6cm --prop fill=none

# 产品信息
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="Spring Pro 2026" --prop font="Microsoft YaHei" --prop size=24 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=2cm --prop y=2cm --prop width=12cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="SPRING PRO 2026" --prop font="Arial Black" --prop size=12 --prop color=8BC34A --prop align=left --prop x=2cm --prop y=3.3cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 首发限定标签
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=4CAF50 --prop x=2cm --prop y=15cm --prop width=6cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="首发限定" --prop font="Microsoft YaHei" --prop size=16 --prop color=FFFFFF --prop align=center --prop x=2cm --prop y=15.4cm --prop width=6cm --prop height=0.8cm --prop fill=none

# 右侧功能卡片 - 纵向排列
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="核心功能" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=16cm --prop y=2cm --prop width=12cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="KEY FEATURES" --prop font="Arial Black" --prop size=12 --prop color=4CAF50 --prop align=left --prop x=16cm --prop y=3.3cm --prop width=8cm --prop height=0.6cm --prop fill=none

# 功能卡片1
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=16cm --prop y=4.5cm --prop width=16cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=16cm --prop y=4.5cm --prop width=16cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=4CAF50 --prop opacity=0.15 --prop x=17.5cm --prop y=5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="AI" --prop font="Arial Black" --prop size=16 --prop color=4CAF50 --prop align=center --prop x=17.5cm --prop y=5.7cm --prop width=2.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="智能AI引擎" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=21cm --prop y=5cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="深度学习算法，智能识别场景，自动优化性能" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=left --prop x=21cm --prop y=6.2cm --prop width=10cm --prop height=1cm --prop fill=none

# 功能卡片2
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=16cm --prop y=8.5cm --prop width=16cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=8BC34A --prop x=16cm --prop y=8.5cm --prop width=16cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.2 --prop x=17.5cm --prop y=9cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="Pro" --prop font="Arial Black" --prop size=16 --prop color=8BC34A --prop align=center --prop x=17.5cm --prop y=9.7cm --prop width=2.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="专业级续航" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=21cm --prop y=9cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="超大容量电池，支持快充技术，续航长达48小时" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=left --prop x=21cm --prop y=10.2cm --prop width=10cm --prop height=1cm --prop fill=none

# 功能卡片3
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=16cm --prop y=12.5cm --prop width=16cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=81C784 --prop x=16cm --prop y=12.5cm --prop width=16cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=81C784 --prop opacity=0.2 --prop x=17.5cm --prop y=13cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="4K" --prop font="Arial Black" --prop size=16 --prop color=81C784 --prop align=center --prop x=17.5cm --prop y=13.7cm --prop width=2.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="超清显示" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=21cm --prop y=13cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="4K超高清屏幕，色彩还原度99%，护眼模式" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=left --prop x=21cm --prop y=14.2cm --prop width=10cm --prop height=1cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=0cm --prop y=18.5cm --prop width=33.87cm --prop height=0.55cm
echo "Slide 3 complete"

# SLIDE 4 - PRICING (价格页) - 三列定价卡片
echo "Building Slide 4..."
# 左侧装饰
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=4CAF50 --prop opacity=0.08 --prop x=0cm --prop y=0cm --prop width=12cm --prop height=19.05cm
# 右侧装饰
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=81C784 --prop opacity=0.1 --prop x=24cm --prop y=0cm --prop width=9.87cm --prop height=19.05cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=4CAF50 --prop opacity=0.08 --prop x=5cm --prop y=10cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.1 --prop x=27cm --prop y=4cm --prop width=4cm --prop height=4cm

# 标题
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="价格方案" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=2cm --prop y=1cm --prop width=12cm --prop height=1.3cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="PRICING PLANS" --prop font="Arial Black" --prop size=14 --prop color=4CAF50 --prop align=left --prop x=2cm --prop y=2.4cm --prop width=10cm --prop height=0.7cm --prop fill=none

# 卡片1 - 基础版
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=1.5cm --prop y=4cm --prop width=9.5cm --prop height=12.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=81C784 --prop x=1.5cm --prop y=4cm --prop width=9.5cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="基础版" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=center --prop x=1.5cm --prop y=4.8cm --prop width=9.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="BASIC" --prop font="Arial Black" --prop size=12 --prop color=81C784 --prop align=center --prop x=1.5cm --prop y=5.6cm --prop width=9.5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="¥1,999" --prop font="Arial Black" --prop size=36 --prop color=81C784 --prop align=center --prop x=1.5cm --prop y=6.8cm --prop width=9.5cm --prop height=1.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="核心功能" --prop font="Microsoft YaHei" --prop size=11 --prop color=388E3C --prop align=left --prop x=2cm --prop y=8.5cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="基础AI功能" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=2cm --prop y=9.2cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="24小时续航" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=2cm --prop y=9.8cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="标准屏幕" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=2cm --prop y=10.4cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="1年保修" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=2cm --prop y=11cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=81C784 --prop x=2cm --prop y=14.5cm --prop width=8cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="选择方案" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=2cm --prop y=14.75cm --prop width=8cm --prop height=0.7cm --prop fill=none

# 卡片2 - 专业版（推荐）
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=12cm --prop y=3.5cm --prop width=9.5cm --prop height=13.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=12cm --prop y=3.5cm --prop width=9.5cm --prop height=0.15cm
# 推荐标签
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=4CAF50 --prop x=14cm --prop y=4cm --prop width=5.5cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="推荐" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=14cm --prop y=4.15cm --prop width=5.5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="专业版" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=1B5E20 --prop align=center --prop x=12cm --prop y=5.2cm --prop width=9.5cm --prop height=0.9cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="PRO" --prop font="Arial Black" --prop size=14 --prop color=4CAF50 --prop align=center --prop x=12cm --prop y=6.2cm --prop width=9.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="¥3,999" --prop font="Arial Black" --prop size=40 --prop color=4CAF50 --prop align=center --prop x=12cm --prop y=7.4cm --prop width=9.5cm --prop height=1.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="全部功能" --prop font="Microsoft YaHei" --prop size=11 --prop color=388E3C --prop align=left --prop x=12.5cm --prop y=9.2cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="高级AI引擎" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=12.5cm --prop y=9.9cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="48小时续航" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=12.5cm --prop y=10.5cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="4K超清屏幕" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=12.5cm --prop y=11.1cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="快充技术" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=12.5cm --prop y=11.7cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="2年保修" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=12.5cm --prop y=12.3cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=4CAF50 --prop x=12.5cm --prop y=14.5cm --prop width=8.5cm --prop height=1.4cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="立即购买" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=12.5cm --prop y=14.85cm --prop width=8.5cm --prop height=0.8cm --prop fill=none

# 卡片3 - 旗舰版
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=22.5cm --prop y=4cm --prop width=9.5cm --prop height=12.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=8BC34A --prop x=22.5cm --prop y=4cm --prop width=9.5cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="旗舰版" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1B5E20 --prop align=center --prop x=22.5cm --prop y=4.8cm --prop width=9.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="ULTIMATE" --prop font="Arial Black" --prop size=12 --prop color=8BC34A --prop align=center --prop x=22.5cm --prop y=5.6cm --prop width=9.5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="¥5,999" --prop font="Arial Black" --prop size=36 --prop color=8BC34A --prop align=center --prop x=22.5cm --prop y=6.8cm --prop width=9.5cm --prop height=1.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="尊享服务" --prop font="Microsoft YaHei" --prop size=11 --prop color=388E3C --prop align=left --prop x=23cm --prop y=8.5cm --prop width=8cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="全部专业版功能" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=23cm --prop y=9.2cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="专属客服" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=23cm --prop y=9.8cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="定制配件" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=23cm --prop y=10.4cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="3年延保" --prop font="Microsoft YaHei" --prop size=10 --prop color=66BB6A --prop align=left --prop x=23cm --prop y=11cm --prop width=8cm --prop height=0.4cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=8BC34A --prop x=23cm --prop y=14.5cm --prop width=8cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="选择方案" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=23cm --prop y=14.75cm --prop width=8cm --prop height=0.7cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=0cm --prop y=18.5cm --prop width=33.87cm --prop height=0.55cm
echo "Slide 4 complete"

# SLIDE 5 - TIMELINE (时间轴页) - 嫩芽生长式垂直时间轴
echo "Building Slide 5..."
# 左侧装饰
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFFFFF --prop opacity=0.35 --prop x=0cm --prop y=0cm --prop width=7cm --prop height=19.05cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.1 --prop x=25cm --prop y=10cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=81C784 --prop opacity=0.08 --prop x=3cm --prop y=12cm --prop width=4cm --prop height=4cm

# 标题
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="发展历程" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=1B5E20 --prop align=left --prop x=8cm --prop y=1cm --prop width=12cm --prop height=1.3cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="OUR JOURNEY" --prop font="Arial Black" --prop size=14 --prop color=4CAF50 --prop align=left --prop x=8cm --prop y=2.4cm --prop width=10cm --prop height=0.7cm --prop fill=none

# 垂直时间轴线（嫩芽式）
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=16.5cm --prop y=3.5cm --prop width=0.1cm --prop height=12cm

# 时间节点 - 垂直排列
# 节点1
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=4CAF50 --prop x=15.5cm --prop y=4cm --prop width=2cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2023" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=15.5cm --prop y=4.5cm --prop width=2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=8cm --prop y=3.5cm --prop width=6.5cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=8cm --prop y=3.5cm --prop width=6.5cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="品牌创立" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1B5E20 --prop align=center --prop x=8cm --prop y=4cm --prop width=6.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="首款产品发布" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=center --prop x=8cm --prop y=5cm --prop width=6.5cm --prop height=0.5cm --prop fill=none

# 节点2
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop x=15.5cm --prop y=7.5cm --prop width=2cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2024" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=15.5cm --prop y=8cm --prop width=2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=19cm --prop y=7cm --prop width=6.5cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=8BC34A --prop x=19cm --prop y=7cm --prop width=6.5cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="快速发展" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1B5E20 --prop align=center --prop x=19cm --prop y=7.5cm --prop width=6.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="用户突破100万" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=center --prop x=19cm --prop y=8.5cm --prop width=6.5cm --prop height=0.5cm --prop fill=none

# 节点3
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=81C784 --prop x=15.5cm --prop y=11cm --prop width=2cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2025" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=15.5cm --prop y=11.5cm --prop width=2cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=8cm --prop y=10.5cm --prop width=6.5cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=81C784 --prop x=8cm --prop y=10.5cm --prop width=6.5cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="技术突破" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1B5E20 --prop align=center --prop x=8cm --prop y=11cm --prop width=6.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="AI引擎升级" --prop font="Microsoft YaHei" --prop size=12 --prop color=388E3C --prop align=center --prop x=8cm --prop y=12cm --prop width=6.5cm --prop height=0.5cm --prop fill=none

# 节点4 - NOW
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=4CAF50 --prop x=15cm --prop y=14cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="NOW" --prop font="Arial Black" --prop size=16 --prop color=FFFFFF --prop align=center --prop x=15cm --prop y=15cm --prop width=3cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=19cm --prop y=13.5cm --prop width=7cm --prop height=4cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=19cm --prop y=13.5cm --prop width=7cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2026春季" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1B5E20 --prop align=center --prop x=19cm --prop y=14.2cm --prop width=7cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="新品发布" --prop font="Microsoft YaHei" --prop size=14 --prop color=4CAF50 --prop align=center --prop x=19cm --prop y=15cm --prop width=7cm --prop height=0.5cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=0cm --prop y=18.5cm --prop width=33.87cm --prop height=0.55cm
echo "Slide 5 complete"

# SLIDE 6 - CTA (行动号召页) - 自然场景+按钮
echo "Building Slide 6..."
# 顶部绿色区域
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=9cm
# 右下角装饰
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=81C784 --prop x=22cm --prop y=9cm --prop width=11.87cm --prop height=10.05cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.15 --prop x=5cm --prop y=2cm --prop width=4cm --prop height=4cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=8BC34A --prop opacity=0.2 --prop x=25cm --prop y=4cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=81C784 --prop opacity=0.12 --prop x=28cm --prop y=12cm --prop width=4cm --prop height=4cm

# 主标题
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="立即行动" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=3cm --prop y=2cm --prop width=16cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="TAKE ACTION NOW" --prop font="Arial Black" --prop size=22 --prop color=8BC34A --prop align=left --prop x=3cm --prop y=5cm --prop width=16cm --prop height=0.9cm --prop fill=none

# 限时首发标签
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=8BC34A --prop x=3cm --prop y=6.5cm --prop width=5cm --prop height=1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="限时首发" --prop font="Microsoft YaHei" --prop size=14 --prop color=1B5E20 --prop align=center --prop x=3cm --prop y=6.7cm --prop width=5cm --prop height=0.6cm --prop fill=none

# 行动按钮
# 按钮1 - 立即购买
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=3cm --prop y=10.5cm --prop width=10cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=3cm --prop y=10.5cm --prop width=10cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="立即购买" --prop font="Microsoft YaHei" --prop size=22 --prop bold=true --prop color=4CAF50 --prop align=center --prop x=3cm --prop y=11.1cm --prop width=10cm --prop height=1.2cm --prop fill=none

# 按钮2 - 预约体验
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop line=4CAF50 --prop lineWidth=2pt --prop x=14cm --prop y=10.5cm --prop width=7cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="预约体验" --prop font="Microsoft YaHei" --prop size=18 --prop color=4CAF50 --prop align=center --prop x=14cm --prop y=11.1cm --prop width=7cm --prop height=1.2cm --prop fill=none

# 联系信息卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=3cm --prop y=14cm --prop width=18cm --prop height=4cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=3cm --prop y=14cm --prop width=18cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=12 --prop color=66BB6A --prop align=left --prop x=4cm --prop y=14.5cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="客服热线: 400-123-4567" --prop font="Microsoft YaHei" --prop size=14 --prop color=1B5E20 --prop align=left --prop x=4cm --prop y=15.3cm --prop width=12cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="官方网站: www.spring-launch.com" --prop font="Microsoft YaHei" --prop size=14 --prop color=1B5E20 --prop align=left --prop x=4cm --prop y=16.1cm --prop width=14cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="邮箱: contact@spring-launch.com" --prop font="Microsoft YaHei" --prop size=14 --prop color=1B5E20 --prop align=left --prop x=4cm --prop y=16.9cm --prop width=14cm --prop height=0.6cm --prop fill=none

# 二维码区域
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=24cm --prop y=11cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=81C784 --prop x=24cm --prop y=11cm --prop width=6cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="扫码关注" --prop font="Microsoft YaHei" --prop size=12 --prop color=66BB6A --prop align=center --prop x=24cm --prop y=13.5cm --prop width=6cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="获取更多资讯" --prop font="Microsoft YaHei" --prop size=10 --prop color=81C784 --prop align=center --prop x=24cm --prop y=14.2cm --prop width=6cm --prop height=0.4cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=4CAF50 --prop x=0cm --prop y=18.5cm --prop width=33.87cm --prop height=0.55cm
echo "Slide 6 complete"

# Morph transitions
echo "Adding Morph transitions..."
for i in 2 3 4 5 6; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

echo "Validating..."
officecli validate "$OUTPUT"
echo "Complete: $OUTPUT"