#!/bin/bash
# Project Proposal Template - Build Script v2.0
# 项目提案方案PPT模板 - 丰富版 280+ 元素
# 独特布局: 专业文档 + 信息卡片
# 修复: 移除批量装饰圆点，增强卡片视觉层次
# --------------------------------------------

set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"

# Create 8 slides
for i in 1 2 3 4 5 6 7 8; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=E8EEF4
done
echo "Created 8 slides"

# ============================================
# SLIDE 1 - HERO (封面页)
# 独特布局: 左侧深蓝信息区 + 右侧提案信息
# ============================================
echo "Building Slide 1..."

# 左侧深蓝信息区
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=18cm --prop height=19.05cm

# 装饰线条 (手动定义3条)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop opacity=0.4 --prop x=1cm --prop y=5cm --prop width=4cm --prop height=0.06cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=3498DB --prop opacity=0.3 --prop x=1cm --prop y=10cm --prop width=3cm --prop height=0.04cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FFFFFF --prop opacity=0.2 --prop x=1cm --prop y=15cm --prop width=3.5cm --prop height=0.03cm

# 装饰圆点 (手动定义3个)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop opacity=0.5 --prop x=1cm --prop y=6cm --prop width=0.2cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=3498DB --prop opacity=0.4 --prop x=2cm --prop y=7cm --prop width=0.15cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.3 --prop x=1.5cm --prop y=8cm --prop width=0.1cm --prop height=0.1cm

# 标题区
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="PROJECT" --prop font="Arial" --prop size=18 --prop color=D4A84B --prop align=left --prop x=2cm --prop y=4cm --prop width=12cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="项目提案" --prop font="Microsoft YaHei" --prop size=48 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=2cm --prop y=5.5cm --prop width=12cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="PROPOSAL" --prop font="Arial" --prop size=32 --prop bold=true --prop color=D4A84B --prop align=left --prop x=2cm --prop y=9cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2cm --prop y=11cm --prop width=8cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="企业数字化转型方案" --prop font="Microsoft YaHei" --prop size=14 --prop color=3498DB --prop align=left --prop x=2cm --prop y=12cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026年度重点项目立项报告" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop opacity=0.8 --prop align=left --prop x=2cm --prop y=13.2cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 右侧提案信息卡片 (增强视觉层次)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=20cm --prop y=2cm --prop width=12cm --prop height=9cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=20cm --prop y=2cm --prop width=12cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="提案信息" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=2.8cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="项目编号" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=left --prop x=21cm --prop y=4cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="PRJ-2026-0128" --prop font="Arial" --prop size=14 --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=4.5cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="提案日期" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=left --prop x=21cm --prop y=5.5cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026.03.21" --prop font="Arial" --prop size=14 --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=6cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="提案部门" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=left --prop x=21cm --prop y=7cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="战略发展部" --prop font="Microsoft YaHei" --prop size=14 --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=7.5cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="项目负责人" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=left --prop x=21cm --prop y=8.5cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="张明 / 项目总监" --prop font="Microsoft YaHei" --prop size=14 --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=9cm --prop width=8cm --prop height=0.6cm --prop fill=none

# 右下角项目周期预算卡片
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=3498DB --prop x=20cm --prop y=12cm --prop width=12cm --prop height=5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="项目周期" --prop font="Microsoft YaHei" --prop size=11 --prop color=FFFFFF --prop opacity=0.7 --prop align=left --prop x=21cm --prop y=12.8cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="18个月" --prop font="Arial" --prop size=28 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=21cm --prop y=13.3cm --prop width=6cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="预算金额" --prop font="Microsoft YaHei" --prop size=11 --prop color=FFFFFF --prop opacity=0.7 --prop align=left --prop x=21cm --prop y=14.8cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="￥580万" --prop font="Arial" --prop size=28 --prop bold=true --prop color=D4A84B --prop align=left --prop x=21cm --prop y=15.3cm --prop width=6cm --prop height=1.2cm --prop fill=none

echo "Slide 1 complete"

# ============================================
# SLIDE 2 - BACKGROUND (项目背景页)
# 独特布局: 三痛点卡片 + 市场分析
# ============================================
echo "Building Slide 2..."

# 顶部装饰条
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm

# 标题区
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="项目背景" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2cm --prop y=1.5cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="PROJECT BACKGROUND" --prop font="Arial" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2cm --prop y=3cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2cm --prop y=3.8cm --prop width=4cm --prop height=0.1cm

# 市场背景卡片 (增强视觉层次)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=2cm --prop y=4.5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=3498DB --prop x=2cm --prop y=4.5cm --prop width=14cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="市场背景" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=3cm --prop y=5.5cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="随着数字化转型的深入，企业对信息化建设的需求日益增长。" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=3cm --prop y=6.5cm --prop width=12cm --prop height=2cm --prop fill=none

# 痛点问题卡片 (增强视觉层次)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=18cm --prop y=4.5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=18cm --prop y=4.5cm --prop width=14cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="痛点问题" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=19cm --prop y=5.5cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="1. 数据孤岛严重，信息共享困难" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=6.5cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="2. 业务流程繁琐，效率低下" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=7.2cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="3. 决策缺乏数据支撑" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=7.9cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="4. 客户体验亟需提升" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=8.6cm --prop width=12cm --prop height=0.5cm --prop fill=none

# 市场数据标题
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="市场数据" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2cm --prop y=11.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2cm --prop y=12.3cm --prop width=3cm --prop height=0.08cm

# 数据卡片1
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=2cm --prop y=13cm --prop width=9cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=3498DB --prop x=2cm --prop y=13cm --prop width=9cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="市场规模" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=center --prop x=2cm --prop y=13.8cm --prop width=9cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="2.8万亿" --prop font="Arial" --prop size=28 --prop bold=true --prop color=3498DB --prop align=center --prop x=2cm --prop y=14.5cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="年增长率 15.6%" --prop font="Microsoft YaHei" --prop size=12 --prop color=3498DB --prop align=center --prop x=2cm --prop y=15.8cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 数据卡片2
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=12.5cm --prop y=13cm --prop width=9cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=12.5cm --prop y=13cm --prop width=9cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="企业需求" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=center --prop x=12.5cm --prop y=13.8cm --prop width=9cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="87%" --prop font="Arial" --prop size=28 --prop bold=true --prop color=D4A84B --prop align=center --prop x=12.5cm --prop y=14.5cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="企业有数字化转型需求" --prop font="Microsoft YaHei" --prop size=12 --prop color=3498DB --prop align=center --prop x=12.5cm --prop y=15.8cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 数据卡片3
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=23cm --prop y=13cm --prop width=9cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=23cm --prop y=13cm --prop width=9cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="竞争压力" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=center --prop x=23cm --prop y=13.8cm --prop width=9cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="72%" --prop font="Arial" --prop size=28 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=23cm --prop y=14.5cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="企业面临竞争压力" --prop font="Microsoft YaHei" --prop size=12 --prop color=3498DB --prop align=center --prop x=23cm --prop y=15.8cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 2 complete"

# ============================================
# SLIDE 3 - SOLUTION (解决方案页)
# 独特布局: 左侧信息区 + 右侧策略卡片
# ============================================
echo "Building Slide 3..."

# 左侧深蓝信息区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=10cm --prop height=19.05cm

# 左侧标题
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="解决方案" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=1.5cm --prop y=2cm --prop width=8cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="SOLUTION" --prop font="Arial" --prop size=18 --prop color=D4A84B --prop align=left --prop x=1.5cm --prop y=4.2cm --prop width=8cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=1.5cm --prop y=5.2cm --prop width=4cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="企业数字化转型" --prop font="Microsoft YaHei" --prop size=14 --prop color=3498DB --prop align=left --prop x=1.5cm --prop y=6cm --prop width=7cm --prop height=0.8cm --prop fill=none

# 核心策略标题
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="核心策略" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=12cm --prop y=1.5cm --prop width=10cm --prop height=1cm --prop fill=none

# 策略卡片1 (增强视觉层次)
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=12cm --prop y=3.5cm --prop width=9.5cm --prop height=7cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=3498DB --prop x=12cm --prop y=3.5cm --prop width=9.5cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=3498DB --prop opacity=0.2 --prop x=14cm --prop y=5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="01" --prop font="Arial" --prop size=24 --prop bold=true --prop color=3498DB --prop align=center --prop x=14cm --prop y=5.5cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="数据中台建设" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=13cm --prop y=8cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="打通数据孤岛，实现数据资产统一管理" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=left --prop x=13cm --prop y=9cm --prop width=7.5cm --prop height=1.5cm --prop fill=none

# 策略卡片2
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=22.5cm --prop y=3.5cm --prop width=9.5cm --prop height=7cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=22.5cm --prop y=3.5cm --prop width=9.5cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop opacity=0.2 --prop x=24.5cm --prop y=5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="02" --prop font="Arial" --prop size=24 --prop bold=true --prop color=D4A84B --prop align=center --prop x=24.5cm --prop y=5.5cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="流程自动化" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=23.5cm --prop y=8cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="RPA技术实现业务流程自动化处理" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=left --prop x=23.5cm --prop y=9cm --prop width=7.5cm --prop height=1.5cm --prop fill=none

# 价值主张卡片
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=1E3A5F --prop x=22.5cm --prop y=11.5cm --prop width=9.5cm --prop height=6cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="价值主张" --prop font="Microsoft YaHei" --prop size=14 --prop color=D4A84B --prop align=left --prop x=23.5cm --prop y=12.3cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="效率提升" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop opacity=0.7 --prop align=left --prop x=23.5cm --prop y=13.5cm --prop width=7cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="60%" --prop font="Arial" --prop size=36 --prop bold=true --prop color=D4A84B --prop align=left --prop x=23.5cm --prop y=14cm --prop width=5cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="成本降低" --prop font="Microsoft YaHei" --prop size=12 --prop color=FFFFFF --prop opacity=0.7 --prop align=left --prop x=23.5cm --prop y=15.5cm --prop width=7cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="35%" --prop font="Arial" --prop size=36 --prop bold=true --prop color=3498DB --prop align=left --prop x=23.5cm --prop y=16cm --prop width=5cm --prop height=1.5cm --prop fill=none

echo "Slide 3 complete"

# ============================================
# SLIDE 4 - TIMELINE (时间轴页)
# 独特布局: 横向时间轴 + 季度卡片
# ============================================
echo "Building Slide 4..."

# 顶部装饰条
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm

# 标题区
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="项目时间轴" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2cm --prop y=1.5cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="PROJECT TIMELINE" --prop font="Arial" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2cm --prop y=3cm --prop width=12cm --prop height=0.8cm --prop fill=none

# 时间轴主线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=2cm --prop y=6.5cm --prop width=30cm --prop height=0.15cm

# 时间节点 (手动定义6个)
# Q1
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=3.5cm --prop y=6cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q1" --prop font="Arial" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=3.5cm --prop y=6.25cm --prop width=1cm --prop height=0.5cm --prop fill=none

# Q2
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=9cm --prop y=6cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q2" --prop font="Arial" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=9cm --prop y=6.25cm --prop width=1cm --prop height=0.5cm --prop fill=none

# Q3
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=14.5cm --prop y=6cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q3" --prop font="Arial" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=14.5cm --prop y=6.25cm --prop width=1cm --prop height=0.5cm --prop fill=none

# Q4
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=20cm --prop y=6cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q4" --prop font="Arial" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=20cm --prop y=6.25cm --prop width=1cm --prop height=0.5cm --prop fill=none

# Q5
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=25.5cm --prop y=6cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q5" --prop font="Arial" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=25.5cm --prop y=6.25cm --prop width=1cm --prop height=0.5cm --prop fill=none

# Q6
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=3498DB --prop x=31cm --prop y=6cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q6" --prop font="Arial" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=31cm --prop y=6.25cm --prop width=1cm --prop height=0.5cm --prop fill=none

# 季度卡片 (手动定义6个)
# Q1 卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=1cm --prop y=8cm --prop width=5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=3498DB --prop x=1cm --prop y=8cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q1" --prop font="Arial" --prop size=20 --prop bold=true --prop color=3498DB --prop align=center --prop x=1cm --prop y=8.8cm --prop width=5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="需求调研" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=1cm --prop y=10cm --prop width=5cm --prop height=0.7cm --prop fill=none

# Q2 卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=6.5cm --prop y=8cm --prop width=5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=6.5cm --prop y=8cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q2" --prop font="Arial" --prop size=20 --prop bold=true --prop color=D4A84B --prop align=center --prop x=6.5cm --prop y=8.8cm --prop width=5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="系统设计" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=6.5cm --prop y=10cm --prop width=5cm --prop height=0.7cm --prop fill=none

# Q3 卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=12cm --prop y=8cm --prop width=5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=3498DB --prop x=12cm --prop y=8cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q3" --prop font="Arial" --prop size=20 --prop bold=true --prop color=3498DB --prop align=center --prop x=12cm --prop y=8.8cm --prop width=5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="开发实施" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=12cm --prop y=10cm --prop width=5cm --prop height=0.7cm --prop fill=none

# Q4 卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=17.5cm --prop y=8cm --prop width=5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=17.5cm --prop y=8cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q4" --prop font="Arial" --prop size=20 --prop bold=true --prop color=D4A84B --prop align=center --prop x=17.5cm --prop y=8.8cm --prop width=5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="测试优化" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=17.5cm --prop y=10cm --prop width=5cm --prop height=0.7cm --prop fill=none

# Q5 卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=23cm --prop y=8cm --prop width=5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=3498DB --prop x=23cm --prop y=8cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q5" --prop font="Arial" --prop size=20 --prop bold=true --prop color=3498DB --prop align=center --prop x=23cm --prop y=8.8cm --prop width=5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="上线部署" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=23cm --prop y=10cm --prop width=5cm --prop height=0.7cm --prop fill=none

# Q6 卡片 (最后一阶段特殊处理)
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=1E3A5F --prop x=28.5cm --prop y=8cm --prop width=4.5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Q6" --prop font="Arial" --prop size=20 --prop bold=true --prop color=D4A84B --prop align=center --prop x=28.5cm --prop y=8.8cm --prop width=4.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="运营维护" --prop font="Microsoft YaHei" --prop size=14 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=28.5cm --prop y=10cm --prop width=4.5cm --prop height=0.7cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 4 complete"

# ============================================
# SLIDE 5 - BUDGET (预算页)
# 独特布局: 总预算卡片 + 预算分配
# ============================================
echo "Building Slide 5..."

# 顶部装饰条
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm

# 标题区
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="项目预算" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2cm --prop y=1.5cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="PROJECT BUDGET" --prop font="Arial" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2cm --prop y=3cm --prop width=12cm --prop height=0.8cm --prop fill=none

# 总预算卡片 (增强视觉层次)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=1E3A5F --prop x=2cm --prop y=5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="总预算" --prop font="Microsoft YaHei" --prop size=14 --prop color=D4A84B --prop align=left --prop x=3cm --prop y=6cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="580万" --prop font="Arial" --prop size=48 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=3cm --prop y=7.2cm --prop width=12cm --prop height=2cm --prop fill=none

# 预算分配卡片
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=18cm --prop y=5cm --prop width=14cm --prop height=12cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=18cm --prop y=5cm --prop width=14cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="预算分配" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=19cm --prop y=6cm --prop width=8cm --prop height=0.8cm --prop fill=none

# 模拟饼图
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=3498DB --prop x=21cm --prop y=8cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=21cm --prop y=8cm --prop width=3cm --prop height=3cm

# 预算明细
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="人力成本: 180万 (31%)" --prop font="Microsoft YaHei" --prop size=12 --prop color=3498DB --prop align=left --prop x=19cm --prop y=14cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="硬件设备: 150万 (26%)" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=left --prop x=19cm --prop y=14.8cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="软件开发: 200万 (34%)" --prop font="Microsoft YaHei" --prop size=12 --prop color=1E3A5F --prop align=left --prop x=19cm --prop y=15.6cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="其他费用: 50万 (9%)" --prop font="Microsoft YaHei" --prop size=12 --prop color=95A5A6 --prop align=left --prop x=19cm --prop y=16.4cm --prop width=12cm --prop height=0.5cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 5 complete"

# ============================================
# SLIDE 6 - TEAM (团队页)
# 独特布局: 顶部深蓝区 + 团队卡片
# ============================================
echo "Building Slide 6..."

# 顶部深蓝区域
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=6cm

# 标题区
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="项目团队" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=2cm --prop y=1cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="PROJECT TEAM" --prop font="Arial" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2cm --prop y=2.5cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2cm --prop y=3.3cm --prop width=4cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="专业团队  丰富经验  高效执行" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop opacity=0.8 --prop align=left --prop x=2cm --prop y=4.2cm --prop width=20cm --prop height=0.8cm --prop fill=none

# 团队成员卡片 (增强视觉层次)
# 成员1
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=2cm --prop y=7cm --prop width=8cm --prop height=10.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=3498DB --prop x=2cm --prop y=7cm --prop width=8cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=3498DB --prop opacity=0.2 --prop x=4.5cm --prop y=8.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="张明" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=2cm --prop y=12.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="项目总监" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=center --prop x=2cm --prop y=13.5cm --prop width=8cm --prop height=0.5cm --prop fill=none

# 成员2
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=11cm --prop y=7cm --prop width=8cm --prop height=10.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=11cm --prop y=7cm --prop width=8cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop opacity=0.2 --prop x=13.5cm --prop y=8.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="李华" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=11cm --prop y=12.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="技术负责人" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=center --prop x=11cm --prop y=13.5cm --prop width=8cm --prop height=0.5cm --prop fill=none

# 成员3
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=20cm --prop y=7cm --prop width=8cm --prop height=10.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=3498DB --prop x=20cm --prop y=7cm --prop width=8cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=3498DB --prop opacity=0.2 --prop x=22.5cm --prop y=8.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="王芳" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=20cm --prop y=12.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="产品经理" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=center --prop x=20cm --prop y=13.5cm --prop width=8cm --prop height=0.5cm --prop fill=none

# 联系我们卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=1E3A5F --prop x=29cm --prop y=7cm --prop width=4cm --prop height=10.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=12 --prop bold=true --prop color=D4A84B --prop align=center --prop x=29cm --prop y=8.5cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="400-888-8888" --prop font="Arial" --prop size=10 --prop color=FFFFFF --prop align=center --prop x=29cm --prop y=10.5cm --prop width=4cm --prop height=0.5cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 6 complete"

# ============================================
# SLIDE 7 - RISKS (风险分析页)
# 独特布局: 风险矩阵展示
# ============================================
echo "Building Slide 7..."

# 顶部装饰条
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm

# 标题区
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="风险分析" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2cm --prop y=1.5cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="RISK ANALYSIS" --prop font="Arial" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2cm --prop y=3cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2cm --prop y=3.8cm --prop width=4cm --prop height=0.1cm

# 风险卡片1
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=2cm --prop y=5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=2cm --prop y=5cm --prop width=14cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="技术风险" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=3cm --prop y=6cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="• 技术选型风险" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=3cm --prop y=7.5cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="• 集成兼容性风险" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=3cm --prop y=8.2cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="应对：选择成熟技术栈，预留技术缓冲期" --prop font="Microsoft YaHei" --prop size=11 --prop color=E74C3C --prop align=left --prop x=3cm --prop y=9.5cm --prop width=12cm --prop height=0.5cm --prop fill=none

# 风险卡片2
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=18cm --prop y=5cm --prop width=14cm --prop height=6cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=F39C12 --prop x=18cm --prop y=5cm --prop width=14cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="进度风险" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=19cm --prop y=6cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="• 人员变动风险" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=7.5cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="• 需求变更风险" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=8.2cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="应对：敏捷开发，预留20%缓冲时间" --prop font="Microsoft YaHei" --prop size=11 --prop color=F39C12 --prop align=left --prop x=19cm --prop y=9.5cm --prop width=12cm --prop height=0.5cm --prop fill=none

# 风险卡片3
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=2cm --prop y=12cm --prop width=14cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=3498DB --prop x=2cm --prop y=12cm --prop width=14cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="资源风险" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=3cm --prop y=13cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="• 预算超支风险" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=3cm --prop y=14.5cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="应对：分阶段预算控制，预留10%应急资金" --prop font="Microsoft YaHei" --prop size=11 --prop color=3498DB --prop align=left --prop x=3cm --prop y=15.5cm --prop width=12cm --prop height=0.5cm --prop fill=none

# 风险卡片4
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=18cm --prop y=12cm --prop width=14cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=18cm --prop y=12cm --prop width=14cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="外部风险" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=19cm --prop y=13cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="• 第三方服务依赖" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=14.5cm --prop width=12cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="应对：多供应商策略，关键服务自研" --prop font="Microsoft YaHei" --prop size=11 --prop color=D4A84B --prop align=left --prop x=19cm --prop y=15.5cm --prop width=12cm --prop height=0.5cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 7 complete"

# ============================================
# SLIDE 8 - THANKS (感谢页)
# 独特布局: 中央大字+联系信息
# ============================================
echo "Building Slide 8..."

# 左侧深蓝信息区
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=18cm --prop height=19.05cm

# 装饰线条
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=D4A84B --prop opacity=0.4 --prop x=2cm --prop y=5cm --prop width=6cm --prop height=0.06cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=3498DB --prop opacity=0.3 --prop x=2cm --prop y=10cm --prop width=4cm --prop height=0.04cm

# 主标题
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="感谢聆听" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=2cm --prop y=6cm --prop width=14cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="THANK YOU" --prop font="Arial" --prop size=28 --prop color=D4A84B --prop align=left --prop x=2cm --prop y=10cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="期待您的支持与合作" --prop font="Microsoft YaHei" --prop size=16 --prop color=FFFFFF --prop opacity=0.8 --prop align=left --prop x=2cm --prop y=12.5cm --prop width=14cm --prop height=0.8cm --prop fill=none

# 右侧联系信息卡片
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=20cm --prop y=4cm --prop width=12cm --prop height=10cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=20cm --prop y=4cm --prop width=12cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=5cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="电话" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=left --prop x=21cm --prop y=6.5cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="400-888-8888" --prop font="Arial" --prop size=14 --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=7cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="邮箱" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=left --prop x=21cm --prop y=8.2cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="project@company.com" --prop font="Arial" --prop size=14 --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=8.7cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="地址" --prop font="Microsoft YaHei" --prop size=11 --prop color=95A5A6 --prop align=left --prop x=21cm --prop y=10cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="北京市朝阳区科技园A座" --prop font="Microsoft YaHei" --prop size=12 --prop color=1E3A5F --prop align=left --prop x=21cm --prop y=10.5cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 8 complete"

# ============================================
# MORPH TRANSITIONS
# ============================================
echo "Adding Morph transitions..."
for i in 2 3 4 5 6 7 8; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

echo "Validating..."
officecli validate "$OUTPUT"
echo "✅ Complete: $OUTPUT"