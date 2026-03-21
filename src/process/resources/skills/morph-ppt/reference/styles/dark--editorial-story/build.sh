#!/bin/bash
# Editorial Story Template - Build Script v2.0
# 编辑杂志故事风格PPT模板 - 杂志网格+图文并排布局
set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"
for i in 1 2 3 4 5 6; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF
done
echo "Created 6 slides"

# SLIDE 1 - HERO (封面页) - 杂志封面布局
echo "Building Slide 1..."
# 杂志边框
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=none --prop line=2C3E50 --prop lineWidth=2pt --prop x=0.5cm --prop y=0.5cm --prop width=32.87cm --prop height=18.05cm

# 顶部装饰条
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=18.25cm --prop width=33.87cm --prop height=0.8cm

# 手动定义装饰元素（最多3个）
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop opacity=0.08 --prop x=24cm --prop y=8cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=2C3E50 --prop opacity=0.05 --prop x=3cm --prop y=12cm --prop width=5cm --prop height=5cm

# 左侧红色装饰条
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=1cm --prop y=3cm --prop width=0.3cm --prop height=12cm

# 期号标签 - 右上角
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=26cm --prop y=2cm --prop width=5cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="VOL.06" --prop font="Arial Black" --prop size=18 --prop color=FFFFFF --prop align=center --prop x=26cm --prop y=2.3cm --prop width=5cm --prop height=0.8cm --prop fill=none

# 主标题
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="编辑故事" --prop font="Microsoft YaHei" --prop size=64 --prop bold=true --prop color=2C3E50 --prop align=left --prop x=3cm --prop y=5cm --prop width=20cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="EDITORIAL STORY" --prop font="Georgia" --prop size=28 --prop color=E74C3C --prop align=left --prop x=3cm --prop y=8.5cm --prop width=18cm --prop height=1.5cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=3cm --prop y=11cm --prop width=12cm --prop height=0.1cm

# 副标题
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="探索故事的力量" --prop font="Microsoft YaHei" --prop size=20 --prop color=666666 --prop align=left --prop x=3cm --prop y=11.5cm --prop width=12cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="The Power of Storytelling" --prop font="Georgia" --prop size=14 --prop color=999999 --prop align=left --prop x=3cm --prop y=12.8cm --prop width=15cm --prop height=0.8cm --prop fill=none

# 右侧图片区域
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=F5F5F5 --prop x=20cm --prop y=4cm --prop width=12cm --prop height=10cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=20cm --prop y=4cm --prop width=0.2cm --prop height=10cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="图片区域" --prop font="Microsoft YaHei" --prop size=14 --prop color=999999 --prop align=center --prop x=20cm --prop y=8.5cm --prop width=12cm --prop height=1cm --prop fill=none

# 日期
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026年3月刊" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=3cm --prop y=16cm --prop width=6cm --prop height=0.6cm --prop fill=none
echo "Slide 1 complete"

# SLIDE 2 - STORY (故事页) - 左图右文布局
echo "Building Slide 2..."
# 顶部装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm

# 章节标签
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=2cm --prop y=1.5cm --prop width=3cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="CHAPTER 01" --prop font="Arial Black" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=2cm --prop y=1.65cm --prop width=3cm --prop height=0.5cm --prop fill=none

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop opacity=0.06 --prop x=26cm --prop y=10cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=2C3E50 --prop opacity=0.04 --prop x=3cm --prop y=14cm --prop width=4cm --prop height=4cm

# 左侧图片区域 (0-16cm)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=1cm --prop y=2.5cm --prop width=15cm --prop height=14cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=1cm --prop y=2.5cm --prop width=15cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="配图区域" --prop font="Microsoft YaHei" --prop size=14 --prop color=999999 --prop align=center --prop x=1cm --prop y=9cm --prop width=15cm --prop height=1cm --prop fill=none

# 右侧文字区域 (17-33cm)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="一个改变世界的故事" --prop font="Microsoft YaHei" --prop size=42 --prop bold=true --prop color=2C3E50 --prop align=left --prop x=18cm --prop y=3cm --prop width=14cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="A Story That Changed The World" --prop font="Georgia" --prop size=18 --prop color=E74C3C --prop align=left --prop x=18cm --prop y=5.5cm --prop width=14cm --prop height=1cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=18cm --prop y=7cm --prop width=6cm --prop height=0.1cm

# 正文内容
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="在这个充满变革的时代，故事的力量从未如此重要。每一个伟大的想法背后，都有一个令人动容的故事。" --prop font="Microsoft YaHei" --prop size=16 --prop color=333333 --prop align=left --prop x=18cm --prop y=8cm --prop width=14cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="我们相信，好的故事能够跨越时空，连接人心，创造无限可能。" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=18cm --prop y=10.5cm --prop width=14cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="无论是品牌的成长历程，还是产品的诞生故事，每一个细节都值得被讲述、被铭记。" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=18cm --prop y=12.5cm --prop width=14cm --prop height=2cm --prop fill=none

# 大引号装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text=""" --prop font="Georgia" --prop size=100 --prop color=E74C3C --prop opacity=0.12 --prop align=left --prop x=1cm --prop y=5cm --prop width=4cm --prop height=4cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=18.55cm --prop width=33.87cm --prop height=0.5cm
echo "Slide 2 complete"

# SLIDE 3 - QUOTE (引用页) - 全页引用
echo "Building Slide 3..."
# 左侧装饰条
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=F5F5F5 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop opacity=0.06 --prop x=26cm --prop y=12cm --prop width=6cm --prop height=6cm

# 超大引号
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text=""" --prop font="Georgia" --prop size=320 --prop color=E74C3C --prop opacity=0.15 --prop align=left --prop x=3cm --prop y=0cm --prop width=10cm --prop height=10cm --prop fill=none

# 引用内容
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="好的设计是诚实的。" --prop font="Microsoft YaHei" --prop size=52 --prop bold=true --prop color=2C3E50 --prop align=left --prop x=5cm --prop y=6cm --prop width=24cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="Good design is honest." --prop font="Georgia" --prop size=28 --prop color=E74C3C --prop align=left --prop x=5cm --prop y=9cm --prop width=20cm --prop height=1.5cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=5cm --prop y=11cm --prop width=6cm --prop height=0.1cm

# 作者信息卡片
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=5cm --prop y=12.5cm --prop width=14cm --prop height=4cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=5cm --prop y=12.5cm --prop width=14cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=2C3E50 --prop x=6cm --prop y=13.5cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="迪特·拉姆斯" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=left --prop x=8cm --prop y=13.8cm --prop width=10cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="Dieter Rams" --prop font="Georgia" --prop size=14 --prop color=666666 --prop align=left --prop x=8cm --prop y=15cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="德国工业设计大师" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=8cm --prop y=15.8cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 右下角标签
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=2C3E50 --prop x=26cm --prop y=14cm --prop width=6cm --prop height=3cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="QUOTE" --prop font="Georgia" --prop size=24 --prop color=FFFFFF --prop opacity=0.5 --prop align=center --prop x=26cm --prop y=15cm --prop width=6cm --prop height=1.5cm --prop fill=none
echo "Slide 3 complete"

# SLIDE 4 - TEAM (团队页) - 四宫格杂志排版
echo "Building Slide 4..."
# 顶部装饰
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm

# 章节标签
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=2cm --prop y=1.5cm --prop width=3cm --prop height=0.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="OUR TEAM" --prop font="Arial Black" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=2cm --prop y=1.65cm --prop width=3cm --prop height=0.5cm --prop fill=none

# 标题
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="编辑团队" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=2C3E50 --prop align=left --prop x=2cm --prop y=3cm --prop width=15cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="专业的内容创作者" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=2cm --prop y=5cm --prop width=12cm --prop height=0.8cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=2cm --prop y=6cm --prop width=6cm --prop height=0.1cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop opacity=0.06 --prop x=28cm --prop y=2cm --prop width=4cm --prop height=4cm

# 四宫格成员卡片
# 卡片1 - 左上
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=2cm --prop y=7.5cm --prop width=7.5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=2cm --prop y=7.5cm --prop width=7.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=2C3E50 --prop x=4.5cm --prop y=9cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="张主编" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=center --prop x=2cm --prop y=12cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Chief Editor" --prop font="Georgia" --prop size=12 --prop color=E74C3C --prop align=center --prop x=2cm --prop y=12.8cm --prop width=7.5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="10年媒体经验" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=2cm --prop y=14cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 卡片2 - 右上
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=10.5cm --prop y=7.5cm --prop width=7.5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=10.5cm --prop y=7.5cm --prop width=7.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop x=13cm --prop y=9cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="李记者" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=center --prop x=10.5cm --prop y=12cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Reporter" --prop font="Georgia" --prop size=12 --prop color=E74C3C --prop align=center --prop x=10.5cm --prop y=12.8cm --prop width=7.5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="资深调查记者" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=10.5cm --prop y=14cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 卡片3 - 左下
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=19cm --prop y=7.5cm --prop width=7.5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=19cm --prop y=7.5cm --prop width=7.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=2C3E50 --prop x=21.5cm --prop y=9cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="王编辑" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=center --prop x=19cm --prop y=12cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Editor" --prop font="Georgia" --prop size=12 --prop color=E74C3C --prop align=center --prop x=19cm --prop y=12.8cm --prop width=7.5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="文字功底深厚" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=19cm --prop y=14cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 卡片4 - 右下
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=27.5cm --prop y=7.5cm --prop width=5.5cm --prop height=9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=27.5cm --prop y=7.5cm --prop width=5.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop x=29cm --prop y=9cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="陈设计" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2D3436 --prop align=center --prop x=27.5cm --prop y=12cm --prop width=5.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="Designer" --prop font="Georgia" --prop size=12 --prop color=E74C3C --prop align=center --prop x=27.5cm --prop y=12.8cm --prop width=5.5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="视觉创意专家" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=27.5cm --prop y=14cm --prop width=5.5cm --prop height=0.6cm --prop fill=none

# 底部装饰
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=18.55cm --prop width=33.87cm --prop height=0.5cm
echo "Slide 4 complete"

# SLIDE 5 - DATA (数据页) - 左侧装饰+右侧数据卡片
echo "Building Slide 5..."
# 顶部装饰
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.5cm

# 左侧装饰区域
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=F5F5F5 --prop x=0cm --prop y=0.5cm --prop width=8cm --prop height=18.55cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=1cm --prop y=2cm --prop width=0.2cm --prop height=14cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop opacity=0.06 --prop x=26cm --prop y=10cm --prop width=5cm --prop height=5cm

# 标题
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="数据洞察" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=2C3E50 --prop align=left --prop x=10cm --prop y=2cm --prop width=15cm --prop height=2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="DATA INSIGHTS" --prop font="Georgia" --prop size=16 --prop color=E74C3C --prop align=left --prop x=10cm --prop y=4cm --prop width=12cm --prop height=0.8cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=10cm --prop y=5cm --prop width=5cm --prop height=0.1cm

# 数据卡片 - 2x2布局
# 卡片1
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=10cm --prop y=6.5cm --prop width=10cm --prop height=5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=10cm --prop y=6.5cm --prop width=10cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="读者数量" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=11cm --prop y=7.5cm --prop width=6cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="1.2M+" --prop font="Arial Black" --prop size=40 --prop color=2C3E50 --prop align=left --prop x=11cm --prop y=8.5cm --prop width=8cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="月活读者" --prop font="Microsoft YaHei" --prop size=14 --prop color=E74C3C --prop align=left --prop x=11cm --prop y=10.2cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 卡片2
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=21cm --prop y=6.5cm --prop width=10cm --prop height=5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=21cm --prop y=6.5cm --prop width=10cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="故事发布" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=22cm --prop y=7.5cm --prop width=6cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="500+" --prop font="Arial Black" --prop size=40 --prop color=2C3E50 --prop align=left --prop x=22cm --prop y=8.5cm --prop width=8cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="原创故事" --prop font="Microsoft YaHei" --prop size=14 --prop color=E74C3C --prop align=left --prop x=22cm --prop y=10.2cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 卡片3
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=10cm --prop y=12.5cm --prop width=10cm --prop height=5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=10cm --prop y=12.5cm --prop width=10cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="好评率" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=11cm --prop y=13.5cm --prop width=6cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="98.5%" --prop font="Arial Black" --prop size=40 --prop color=2C3E50 --prop align=left --prop x=11cm --prop y=14.5cm --prop width=8cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="读者满意度" --prop font="Microsoft YaHei" --prop size=14 --prop color=E74C3C --prop align=left --prop x=11cm --prop y=16.2cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 卡片4 - 图表
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=21cm --prop y=12.5cm --prop width=10cm --prop height=5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=21cm --prop y=12.5cm --prop width=10cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="增长趋势" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=22cm --prop y=13.5cm --prop width=6cm --prop height=0.5cm --prop fill=none

# 图表柱状图
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2C3E50 --prop opacity=0.6 --prop x=23cm --prop y=15.5cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2C3E50 --prop opacity=0.7 --prop x=25cm --prop y=14.8cm --prop width=1.2cm --prop height=1.9cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2C3E50 --prop opacity=0.8 --prop x=27cm --prop y=14.3cm --prop width=1.2cm --prop height=2.4cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=29cm --prop y=13.8cm --prop width=1.2cm --prop height=2.9cm

# 底部装饰
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2C3E50 --prop x=0cm --prop y=18.55cm --prop width=33.87cm --prop height=0.5cm
echo "Slide 5 complete"

# SLIDE 6 - THANKS (感谢页) - 杂志末页风格
echo "Building Slide 6..."
# 左侧深色区域
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=2C3E50 --prop x=0cm --prop y=0cm --prop width=20cm --prop height=19.05cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=E74C3C --prop opacity=0.1 --prop x=5cm --prop y=12cm --prop width=4cm --prop height=4cm

# 感谢文字
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="感谢阅读" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=3cm --prop y=5cm --prop width=15cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="THANK YOU FOR READING" --prop font="Georgia" --prop size=24 --prop color=E74C3C --prop align=left --prop x=3cm --prop y=8.5cm --prop width=15cm --prop height=1.2cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=3cm --prop y=10.5cm --prop width=8cm --prop height=0.15cm

# 联系信息
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=14 --prop color=999999 --prop align=left --prop x=3cm --prop y=12cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="editorial@story.com" --prop font="Georgia" --prop size=16 --prop color=FFFFFF --prop align=left --prop x=3cm --prop y=13cm --prop width=12cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="www.editorialstory.com" --prop font="Georgia" --prop size=16 --prop color=FFFFFF --prop align=left --prop x=3cm --prop y=14.2cm --prop width=12cm --prop height=0.8cm --prop fill=none

# 右侧二维码卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=22cm --prop y=4cm --prop width=10cm --prop height=11cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=E74C3C --prop x=22cm --prop y=4cm --prop width=10cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=F5F5F5 --prop x=25cm --prop y=6cm --prop width=4cm --prop height=4cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="扫码关注" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=22cm --prop y=10.5cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="获取更多精彩故事" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=22cm --prop y=11.5cm --prop width=10cm --prop height=0.8cm --prop fill=none

# 版权信息
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="© 2026 Editorial Story. All rights reserved." --prop font="Georgia" --prop size=10 --prop color=666666 --prop align=center --prop x=0cm --prop y=17.5cm --prop width=33.87cm --prop height=0.5cm --prop fill=none
echo "Slide 6 complete"

# Morph transitions
echo "Adding Morph transitions..."
for i in 2 3 4 5 6; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

echo "Validating..."
officecli validate "$OUTPUT"
echo "Complete: $OUTPUT"