#!/bin/bash
# Creative Gradient Brand Template - Build Script v2.0
# 创意渐变品牌风格PPT模板 - 丰富版 280+ 元素
# 独特布局: 渐变背景融合 + 卡片悬浮
# 增强: 内容卡片视觉层次、移除批量装饰圆点
# --------------------------------------------

set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"

# Create 8 slides with gradient backgrounds
for i in 1 2 3 4 5 6 7 8; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=667eea-764ba2-135
done
echo "Created 8 slides"

# ============================================
# SLIDE 1 - HERO (封面页)
# 独特布局: 全幅渐变 + 中央卡片悬浮
# ============================================
echo "Building Slide 1..."

# 装饰光晕 (在内容区域外)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.25 --prop x=0cm --prop y=0cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.3 --prop x=26cm --prop y=10cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.25 --prop x=5cm --prop y=12cm --prop width=8cm --prop height=8cm

# 中央悬浮卡片 (增强视觉层次)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=4cm --prop y=3cm --prop width=26cm --prop height=12cm

# 卡片边框装饰
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=F093FB --prop x=4cm --prop y=3cm --prop width=26cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=4cm --prop y=14.85cm --prop width=26cm --prop height=0.15cm

# 内容文字
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="品牌发布会" --prop font="Microsoft YaHei" --prop size=16 --prop color=F093FB --prop align=center --prop x=4cm --prop y=4cm --prop width=26cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="创意渐变品牌" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=333333 --prop align=center --prop x=4cm --prop y=6cm --prop width=26cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="CREATIVE GRADIENT BRAND" --prop font="Arial Black" --prop size=22 --prop color=667eea --prop align=center --prop x=4cm --prop y=9cm --prop width=26cm --prop height=1cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=F093FB --prop x=11cm --prop y=10.5cm --prop width=12cm --prop height=0.12cm

# 日期和标语
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026.03.21 | 品牌发布会" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=center --prop x=4cm --prop y=11.5cm --prop width=26cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="创新引领未来 · 设计改变世界" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=center --prop x=4cm --prop y=12.8cm --prop width=26cm --prop height=0.6cm --prop fill=none

# 手动定义装饰圆点 (最多3个)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.5 --prop x=8cm --prop y=1cm --prop width=0.25cm --prop height=0.25cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.4 --prop x=15cm --prop y=17cm --prop width=0.2cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.4 --prop x=25cm --prop y=2cm --prop width=0.15cm --prop height=0.15cm

# 底部装饰线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=764ba2 --prop opacity=0.5 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

echo "Slide 1 complete"

# ============================================
# SLIDE 2 - STORY (品牌故事页)
# 独特布局: 垂直时间线 + 渐变背景
# ============================================
echo "Building Slide 2..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.2 --prop x=25cm --prop y=0cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.25 --prop x=0cm --prop y=12cm --prop width=8cm --prop height=8cm

# 标题区
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="品牌故事" --prop font="Microsoft YaHei" --prop size=14 --prop color=F093FB --prop align=left --prop x=2.5cm --prop y=1.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="OUR STORY" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2.5cm --prop y=4.2cm --prop width=6cm --prop height=0.15cm

# 时间线连接线
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFFFFF --prop opacity=0.3 --prop x=5.5cm --prop y=6cm --prop width=0.1cm --prop height=7cm

# 时间节点卡片1 (增强视觉层次)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=2cm --prop y=5.5cm --prop width=7cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2cm --prop y=5.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=F093FB --prop x=4.75cm --prop y=4.8cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="2018" --prop font="Arial Black" --prop size=22 --prop color=F093FB --prop align=center --prop x=2cm --prop y=6cm --prop width=7cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="品牌创立" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=center --prop x=2cm --prop y=7.2cm --prop width=7cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="始于热爱，专注创新" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=2cm --prop y=8.4cm --prop width=7cm --prop height=0.6cm --prop fill=none

# 时间节点卡片2
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=13cm --prop y=5.5cm --prop width=7cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=13cm --prop y=5.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop x=15.75cm --prop y=4.8cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="2021" --prop font="Arial Black" --prop size=22 --prop color=764ba2 --prop align=center --prop x=13cm --prop y=6cm --prop width=7cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="快速发展" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=center --prop x=13cm --prop y=7.2cm --prop width=7cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="获得多轮融资" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=13cm --prop y=8.4cm --prop width=7cm --prop height=0.6cm --prop fill=none

# 时间节点卡片3
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=24cm --prop y=5.5cm --prop width=7cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=667eea --prop x=24cm --prop y=5.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=667eea --prop x=26.75cm --prop y=4.8cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="2026" --prop font="Arial Black" --prop size=22 --prop color=667eea --prop align=center --prop x=24cm --prop y=6cm --prop width=7cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="行业领先" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=center --prop x=24cm --prop y=7.2cm --prop width=7cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="服务百万用户" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=24cm --prop y=8.4cm --prop width=7cm --prop height=0.6cm --prop fill=none

# 理念区
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="我们的理念" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=2.5cm --prop y=12.5cm --prop width=10cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="创新驱动，用户至上，追求卓越" --prop font="Microsoft YaHei" --prop size=14 --prop color=E0E0E0 --prop align=left --prop x=2.5cm --prop y=13.8cm --prop width=25cm --prop height=0.8cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=764ba2 --prop opacity=0.4 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

# 手动定义装饰圆点
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.4 --prop x=10cm --prop y=1cm --prop width=0.2cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=22cm --prop y=11cm --prop width=0.15cm --prop height=0.15cm

echo "Slide 2 complete"

# ============================================
# SLIDE 3 - VALUE (核心价值页)
# 独特布局: 三层叠卡片
# ============================================
echo "Building Slide 3..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.2 --prop x=28cm --prop y=0cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.2 --prop x=0cm --prop y=14cm --prop width=8cm --prop height=8cm

# 标题区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="核心价值" --prop font="Microsoft YaHei" --prop size=14 --prop color=F093FB --prop align=left --prop x=2.5cm --prop y=1.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="OUR VALUES" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2.5cm --prop y=4.2cm --prop width=6cm --prop height=0.15cm

# 价值卡片1 (增强视觉层次)
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=2cm --prop y=5.5cm --prop width=9cm --prop height=11cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=5cm --prop y=6.8cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="创新" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=333333 --prop align=center --prop x=2cm --prop y=10cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="INNOVATION" --prop font="Arial Black" --prop size=12 --prop color=F093FB --prop align=center --prop x=2cm --prop y=11.3cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="持续创新，引领行业发展方向" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=2cm --prop y=12.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="50+" --prop font="Arial Black" --prop size=36 --prop color=F093FB --prop align=center --prop x=2cm --prop y=13.5cm --prop width=9cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="专利技术" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=center --prop x=2cm --prop y=15cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 价值卡片2
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=12.5cm --prop y=5.5cm --prop width=9cm --prop height=11cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=12.5cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.3 --prop x=15.5cm --prop y=6.8cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="品质" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=333333 --prop align=center --prop x=12.5cm --prop y=10cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="QUALITY" --prop font="Arial Black" --prop size=12 --prop color=764ba2 --prop align=center --prop x=12.5cm --prop y=11.3cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="精益求精，追求卓越品质" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=12.5cm --prop y=12.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="99.9%" --prop font="Arial Black" --prop size=36 --prop color=764ba2 --prop align=center --prop x=12.5cm --prop y=13.5cm --prop width=9cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="品质达标率" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=center --prop x=12.5cm --prop y=15cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 价值卡片3
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=23cm --prop y=5.5cm --prop width=9cm --prop height=11cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=667eea --prop x=23cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.3 --prop x=26cm --prop y=6.8cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="服务" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=333333 --prop align=center --prop x=23cm --prop y=10cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="SERVICE" --prop font="Arial Black" --prop size=12 --prop color=667eea --prop align=center --prop x=23cm --prop y=11.3cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="用心服务，超越客户期待" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=23cm --prop y=12.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="7x24" --prop font="Arial Black" --prop size=36 --prop color=667eea --prop align=center --prop x=23cm --prop y=13.5cm --prop width=9cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="全天候服务" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=center --prop x=23cm --prop y=15cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=F093FB --prop opacity=0.4 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

# 手动定义装饰圆点
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.3 --prop x=10cm --prop y=17cm --prop width=0.15cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=20cm --prop y=1cm --prop width=0.2cm --prop height=0.2cm

echo "Slide 3 complete"

# ============================================
# SLIDE 4 - TEAM (团队页)
# 独特布局: 圆形头像 + 环形信息
# ============================================
echo "Building Slide 4..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.2 --prop x=28cm --prop y=2cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.2 --prop x=0cm --prop y=12cm --prop width=7cm --prop height=7cm

# 标题区
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="核心团队" --prop font="Microsoft YaHei" --prop size=14 --prop color=F093FB --prop align=left --prop x=2.5cm --prop y=1.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="OUR TEAM" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2.5cm --prop y=4.2cm --prop width=6cm --prop height=0.15cm

# 成员卡片1 (增强视觉层次)
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=2cm --prop y=5.5cm --prop width=9cm --prop height=10cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.4 --prop x=5cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.3 --prop x=5.3cm --prop y=6.8cm --prop width=2.9cm --prop height=2.9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="张伟" --prop font="Microsoft YaHei" --prop size=22 --prop bold=true --prop color=333333 --prop align=center --prop x=2cm --prop y=10.5cm --prop width=9cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="创始人 & CEO" --prop font="Microsoft YaHei" --prop size=12 --prop color=F093FB --prop align=center --prop x=2cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="10年行业经验" --prop font="Microsoft YaHei" --prop size=10 --prop color=666666 --prop align=center --prop x=2cm --prop y=12.5cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 成员卡片2
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=12.5cm --prop y=5.5cm --prop width=9cm --prop height=10cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=12.5cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.4 --prop x=15.5cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.3 --prop x=15.8cm --prop y=6.8cm --prop width=2.9cm --prop height=2.9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="李娜" --prop font="Microsoft YaHei" --prop size=22 --prop bold=true --prop color=333333 --prop align=center --prop x=12.5cm --prop y=10.5cm --prop width=9cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="联合创始人 & CTO" --prop font="Microsoft YaHei" --prop size=12 --prop color=764ba2 --prop align=center --prop x=12.5cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="技术专家" --prop font="Microsoft YaHei" --prop size=10 --prop color=666666 --prop align=center --prop x=12.5cm --prop y=12.5cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 成员卡片3
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=23cm --prop y=5.5cm --prop width=9cm --prop height=10cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=667eea --prop x=23cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.4 --prop x=26cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=26.3cm --prop y=6.8cm --prop width=2.9cm --prop height=2.9cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="王磊" --prop font="Microsoft YaHei" --prop size=22 --prop bold=true --prop color=333333 --prop align=center --prop x=23cm --prop y=10.5cm --prop width=9cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="设计总监" --prop font="Microsoft YaHei" --prop size=12 --prop color=667eea --prop align=center --prop x=23cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="国际设计奖得主" --prop font="Microsoft YaHei" --prop size=10 --prop color=666666 --prop align=center --prop x=23cm --prop y=12.5cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 团队规模
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="团队规模: 50+ 专业人才" --prop font="Microsoft YaHei" --prop size=12 --prop color=E0E0E0 --prop align=left --prop x=2.5cm --prop y=16.5cm --prop width=20cm --prop height=0.6cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=667eea --prop opacity=0.4 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

# 手动定义装饰圆点
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.3 --prop x=5cm --prop y=17cm --prop width=0.15cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=28cm --prop y=1cm --prop width=0.2cm --prop height=0.2cm

echo "Slide 4 complete"

# ============================================
# SLIDE 5 - CASE (案例页)
# 独特布局: 数据卡片展示
# ============================================
echo "Building Slide 5..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.25 --prop x=0cm --prop y=10cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.2 --prop x=26cm --prop y=0cm --prop width=10cm --prop height=10cm

# 标题区
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="成功案例" --prop font="Microsoft YaHei" --prop size=14 --prop color=F093FB --prop align=left --prop x=2.5cm --prop y=1.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="SUCCESS STORIES" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=18cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2.5cm --prop y=4.2cm --prop width=6cm --prop height=0.15cm

# 案例卡片1 (增强视觉层次)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=2cm --prop y=5.5cm --prop width=9cm --prop height=10cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=5cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="科技企业A" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=center --prop x=2cm --prop y=10.5cm --prop width=9cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="品牌升级项目" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=2cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="200%" --prop font="Arial Black" --prop size=28 --prop color=F093FB --prop align=center --prop x=2cm --prop y=12.8cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="品牌价值提升" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=center --prop x=2cm --prop y=14.2cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 案例卡片2
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=12.5cm --prop y=5.5cm --prop width=9cm --prop height=10cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=12.5cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.3 --prop x=15.5cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="电商平台B" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=center --prop x=12.5cm --prop y=10.5cm --prop width=9cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="营销策划项目" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=12.5cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="5x" --prop font="Arial Black" --prop size=28 --prop color=764ba2 --prop align=center --prop x=12.5cm --prop y=12.8cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="销售增长倍数" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=center --prop x=12.5cm --prop y=14.2cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 案例卡片3
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=23cm --prop y=5.5cm --prop width=9cm --prop height=10cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=667eea --prop x=23cm --prop y=5.5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.3 --prop x=26cm --prop y=6.5cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="金融集团C" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=center --prop x=23cm --prop y=10.5cm --prop width=9cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="数字化转型" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=23cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="100+" --prop font="Arial Black" --prop size=28 --prop color=667eea --prop align=center --prop x=23cm --prop y=12.8cm --prop width=9cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="系统部署数量" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=center --prop x=23cm --prop y=14.2cm --prop width=9cm --prop height=0.5cm --prop fill=none

# 统计信息
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="累计服务客户: 500+ | 项目成功率: 98%" --prop font="Microsoft YaHei" --prop size=12 --prop color=E0E0E0 --prop align=left --prop x=2.5cm --prop y=16.5cm --prop width=25cm --prop height=0.6cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=F093FB --prop opacity=0.4 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

echo "Slide 5 complete"

# ============================================
# SLIDE 6 - THANKS (感谢页)
# 独特布局: 中央大字 + 渐变光晕
# ============================================
echo "Building Slide 6..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=10cm --prop y=0cm --prop width=12cm --prop height=12cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.35 --prop x=20cm --prop y=8cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.25 --prop x=0cm --prop y=12cm --prop width=8cm --prop height=8cm

# 主标题
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="感谢聆听" --prop font="Microsoft YaHei" --prop size=64 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=0cm --prop y=3.5cm --prop width=33.87cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="THANK YOU" --prop font="Arial Black" --prop size=28 --prop color=F093FB --prop align=center --prop x=0cm --prop y=7cm --prop width=33.87cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=F093FB --prop x=12cm --prop y=9cm --prop width=10cm --prop height=0.15cm

# 联系信息卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=4cm --prop y=10.5cm --prop width=12cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=F093FB --prop x=4cm --prop y=10.5cm --prop width=12cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=left --prop x=5cm --prop y=11.2cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="电话: 400-888-8888" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=5cm --prop y=12.5cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="邮箱: hello@brand.com" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=5cm --prop y=13.2cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="地址: 北京市朝阳区科技园" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=5cm --prop y=13.9cm --prop width=10cm --prop height=0.5cm --prop fill=none

# 关注我们卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=18cm --prop y=10.5cm --prop width=12cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=18cm --prop y=10.5cm --prop width=12cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="关注我们" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=left --prop x=19cm --prop y=11.2cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="微信公众号: BrandOfficial" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=12.5cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="微博: @BrandOfficial" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=13.2cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="官网: www.brand.com" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=13.9cm --prop width=10cm --prop height=0.5cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=F093FB --prop opacity=0.5 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

# 手动定义装饰圆点
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.4 --prop x=8cm --prop y=1cm --prop width=0.2cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=26cm --prop y=17cm --prop width=0.15cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.3 --prop x=15cm --prop y=18cm --prop width=0.2cm --prop height=0.2cm

echo "Slide 6 complete"

# ============================================
# SLIDE 7 - PRODUCTS (产品展示页)
# 独特布局: 产品功能卡片展示
# ============================================
echo "Building Slide 7..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.2 --prop x=25cm --prop y=0cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.25 --prop x=0cm --prop y=12cm --prop width=8cm --prop height=8cm

# 标题区
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="产品服务" --prop font="Microsoft YaHei" --prop size=14 --prop color=F093FB --prop align=left --prop x=2.5cm --prop y=1.5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="OUR PRODUCTS" --prop font="Arial Black" --prop size=32 --prop color=FFFFFF --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2.5cm --prop y=4.2cm --prop width=6cm --prop height=0.15cm

# 产品卡片1 (增强视觉层次)
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=2cm --prop y=5cm --prop width=9cm --prop height=11.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=F093FB --prop x=2cm --prop y=5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=5cm --prop y=6.5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="设计服务" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=333333 --prop align=center --prop x=2cm --prop y=9.5cm --prop width=9cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="DESIGN" --prop font="Arial Black" --prop size=12 --prop color=F093FB --prop align=center --prop x=2cm --prop y=10.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="品牌视觉设计" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=2cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="UI/UX设计" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=2cm --prop y=12.3cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="交互动效" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=2cm --prop y=13.1cm --prop width=9cm --prop height=0.6cm --prop fill=none

# 产品卡片2
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=12.5cm --prop y=5cm --prop width=9cm --prop height=11.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=12.5cm --prop y=5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.3 --prop x=15.5cm --prop y=6.5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="开发服务" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=333333 --prop align=center --prop x=12.5cm --prop y=9.5cm --prop width=9cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="DEVELOPMENT" --prop font="Arial Black" --prop size=12 --prop color=764ba2 --prop align=center --prop x=12.5cm --prop y=10.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="网站开发" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=12.5cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="移动应用" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=12.5cm --prop y=12.3cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="系统集成" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=12.5cm --prop y=13.1cm --prop width=9cm --prop height=0.6cm --prop fill=none

# 产品卡片3
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=23cm --prop y=5cm --prop width=9cm --prop height=11.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=667eea --prop x=23cm --prop y=5cm --prop width=9cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.3 --prop x=26cm --prop y=6.5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="咨询服务" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=333333 --prop align=center --prop x=23cm --prop y=9.5cm --prop width=9cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="CONSULTING" --prop font="Arial Black" --prop size=12 --prop color=667eea --prop align=center --prop x=23cm --prop y=10.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="品牌策略" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=23cm --prop y=11.5cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="市场分析" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=23cm --prop y=12.3cm --prop width=9cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[7]' --type shape --prop text="运营支持" --prop font="Microsoft YaHei" --prop size=11 --prop color=666666 --prop align=center --prop x=23cm --prop y=13.1cm --prop width=9cm --prop height=0.6cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[7]' --type shape --prop preset=rect --prop fill=F093FB --prop opacity=0.4 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

echo "Slide 7 complete"

# ============================================
# SLIDE 8 - THANKS (感谢页)
# 独特布局: 中央大字 + 渐变光晕
# ============================================
echo "Building Slide 8..."

# 装饰光晕
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=10cm --prop y=0cm --prop width=12cm --prop height=12cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=ellipse --prop fill=667eea --prop opacity=0.35 --prop x=20cm --prop y=8cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=ellipse --prop fill=764ba2 --prop opacity=0.25 --prop x=0cm --prop y=12cm --prop width=8cm --prop height=8cm

# 主标题
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="感谢聆听" --prop font="Microsoft YaHei" --prop size=64 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=0cm --prop y=3.5cm --prop width=33.87cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="THANK YOU" --prop font="Arial Black" --prop size=28 --prop color=F093FB --prop align=center --prop x=0cm --prop y=7cm --prop width=33.87cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=F093FB --prop x=12cm --prop y=9cm --prop width=10cm --prop height=0.15cm

# 联系信息卡片
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=4cm --prop y=10.5cm --prop width=12cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=F093FB --prop x=4cm --prop y=10.5cm --prop width=12cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=left --prop x=5cm --prop y=11.2cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="电话: 400-888-8888" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=5cm --prop y=12.5cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="邮箱: hello@brand.com" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=5cm --prop y=13.2cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="地址: 北京市朝阳区科技园" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=5cm --prop y=13.9cm --prop width=10cm --prop height=0.5cm --prop fill=none

# 关注我们卡片
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.9 --prop x=18cm --prop y=10.5cm --prop width=12cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=764ba2 --prop x=18cm --prop y=10.5cm --prop width=12cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="关注我们" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=333333 --prop align=left --prop x=19cm --prop y=11.2cm --prop width=10cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="微信公众号: BrandOfficial" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=12.5cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="微博: @BrandOfficial" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=13.2cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[8]' --type shape --prop text="官网: www.brand.com" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=13.9cm --prop width=10cm --prop height=0.5cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=rect --prop fill=F093FB --prop opacity=0.5 --prop x=0cm --prop y=18.7cm --prop width=33.87cm --prop height=0.35cm

# 手动定义装饰圆点
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.4 --prop x=8cm --prop y=1cm --prop width=0.2cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=ellipse --prop fill=F093FB --prop opacity=0.3 --prop x=26cm --prop y=17cm --prop width=0.15cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[8]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.3 --prop x=15cm --prop y=18cm --prop width=0.2cm --prop height=0.2cm

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