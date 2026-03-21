#!/bin/bash
# Playful Marketing Template - Build Script v2.0
# 活力青春营销风格PPT模板 - 丰富版 300+ 元素
# 坐标冲突修复版：采用左右分割布局
#
# 独特布局: 大色块拼接 + 对角线分割
# 设计特点: 左色块(0-12cm) + 右内容(14-33cm)
# 修复: 卡片与装饰区域不再重叠，移除批量装饰圆点
# --------------------------------------------

set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"

# 添加6个幻灯片
for i in 1 2 3 4 5 6; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF
done
echo "Created 6 slides"

# ============================================
# SLIDE 1 - HERO (封面页)
# 独特布局: 左色块(0-12cm) + 右内容区(14-33cm)
# 修复: 白色卡片不再与右侧色块重叠
# ============================================
echo "Building Slide 1..."

# 左侧珊瑚橙大色块 (装饰区: 0-12cm)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=0cm --prop width=12cm --prop height=19.05cm

# 右下角装饰色块 (装饰区)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=28cm --prop y=11cm --prop width=5.87cm --prop height=8.05cm

# 右上角装饰色块 (装饰区)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=29cm --prop y=0cm --prop width=4.87cm --prop height=5cm

# 装饰圆 (在装饰区域内) - 手动定义最多3个
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.3 --prop x=5cm --prop y=12cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.4 --prop x=3cm --prop y=8cm --prop width=4cm --prop height=4cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.3 --prop x=6cm --prop y=3cm --prop width=3cm --prop height=3cm

# 主内容卡片 (内容区: 14-28cm，不与右侧装饰重叠)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=14cm --prop y=2cm --prop width=13cm --prop height=15cm

# 卡片内容
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop x=16cm --prop y=3.5cm --prop width=5cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="新品发布" --prop font="Microsoft YaHei" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=16cm --prop y=3.7cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026 夏季" --prop font="Microsoft YaHei" --prop size=28 --prop color=2C2C54 --prop align=left --prop x=16cm --prop y=5.5cm --prop width=10cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="营销活动" --prop font="Microsoft YaHei" --prop size=52 --prop bold=true --prop color=FF6B6B --prop align=left --prop x=16cm --prop y=7.2cm --prop width=10cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="SUMMER CAMPAIGN" --prop font="Arial Black" --prop size=20 --prop color=4ECDC4 --prop align=left --prop x=16cm --prop y=10.2cm --prop width=10cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=16cm --prop y=12cm --prop width=8cm --prop height=0.15cm

# 日期和地点
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="日期" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=16cm --prop y=12.8cm --prop width=3cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026.06.15 - 06.30" --prop font="Arial Black" --prop size=14 --prop color=2C2C54 --prop align=left --prop x=16cm --prop y=13.3cm --prop width=8cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="地点" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=16cm --prop y=14.1cm --prop width=3cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="全国线下门店 + 线上商城" --prop font="Microsoft YaHei" --prop size=14 --prop color=2C2C54 --prop align=left --prop x=16cm --prop y=14.6cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

# 左侧装饰圆点 (手动定义3个)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.6 --prop x=8cm --prop y=15cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.5 --prop x=9cm --prop y=16cm --prop width=0.3cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.4 --prop x=10cm --prop y=15.5cm --prop width=0.25cm --prop height=0.25cm

echo "Slide 1 complete"

# ============================================
# SLIDE 2 - STATEMENT (观点页)
# 独特布局: 左侧装饰区 + 中央内容区
# ============================================
echo "Building Slide 2..."

# 左侧黄色装饰条 (装饰区)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=0cm --prop y=0cm --prop width=5cm --prop height=19.05cm

# 右下角装饰色块
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=27cm --prop y=13cm --prop width=6.87cm --prop height=6.05cm

# 大数字背景 (内容区)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="500%" --prop font="Arial Black" --prop size=180 --prop color=FF6B6B --prop opacity=0.12 --prop align=left --prop x=6cm --prop y=0cm --prop width=25cm --prop height=10cm --prop fill=none

# 左侧装饰圆点 (手动定义3个)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.3 --prop x=1cm --prop y=5cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.4 --prop x=2cm --prop y=7cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=1.5cm --prop y=9cm --prop width=0.35cm --prop height=0.35cm

# 核心内容 (内容区: 6-26cm)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="营销活动" --prop font="Microsoft YaHei" --prop size=18 --prop color=4ECDC4 --prop align=left --prop x=7cm --prop y=3cm --prop width=8cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="效果提升" --prop font="Microsoft YaHei" --prop size=72 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=7cm --prop y=4.5cm --prop width=18cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="通过创新营销策略，实现品牌曝光与销售转化的双重突破" --prop font="Microsoft YaHei" --prop size=16 --prop color=666666 --prop align=left --prop x=7cm --prop y=8.5cm --prop width=20cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=7cm --prop y=10cm --prop width=6cm --prop height=0.15cm

# 数据卡片 (内容区域内，不与右侧装饰重叠)
# 卡片1: x=7cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=7cm --prop y=11.5cm --prop width=6cm --prop height=4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=7cm --prop y=11.5cm --prop width=6cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="品牌曝光" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=7.5cm --prop y=12.2cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="2.8亿+" --prop font="Arial Black" --prop size=26 --prop color=FF6B6B --prop align=left --prop x=7.5cm --prop y=13cm --prop width=5cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="同比+380%" --prop font="Microsoft YaHei" --prop size=12 --prop color=4ECDC4 --prop align=left --prop x=7.5cm --prop y=14.5cm --prop width=5cm --prop height=0.5cm --prop fill=none

# 卡片2: x=14cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=14cm --prop y=11.5cm --prop width=6cm --prop height=4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=14cm --prop y=11.5cm --prop width=6cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="销售转化" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=14.5cm --prop y=12.2cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="15.6%" --prop font="Arial Black" --prop size=26 --prop color=FFE66D --prop align=left --prop x=14.5cm --prop y=13cm --prop width=5cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="行业平均3倍" --prop font="Microsoft YaHei" --prop size=12 --prop color=4ECDC4 --prop align=left --prop x=14.5cm --prop y=14.5cm --prop width=5cm --prop height=0.5cm --prop fill=none

# 卡片3: x=21cm (确保不与右下角装饰色块重叠)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=21cm --prop y=11.5cm --prop width=5.5cm --prop height=4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=21cm --prop y=11.5cm --prop width=5.5cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="ROI回报" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=21.5cm --prop y=12.2cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="8.5x" --prop font="Arial Black" --prop size=26 --prop color=4ECDC4 --prop align=left --prop x=21.5cm --prop y=13cm --prop width=4cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="超预期目标" --prop font="Microsoft YaHei" --prop size=12 --prop color=FF6B6B --prop align=left --prop x=21.5cm --prop y=14.5cm --prop width=4cm --prop height=0.5cm --prop fill=none

echo "Slide 2 complete"

# ============================================
# SLIDE 3 - PRODUCT (产品页)
# 独特布局: 左图右文
# ============================================
echo "Building Slide 3..."

# 顶部装饰条
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=0.3cm

# 左侧产品展示区 (内容区: 1-15cm)
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=F5F5F5 --prop x=1cm --prop y=1.5cm --prop width=14cm --prop height=16cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=3cm --prop y=4cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.2 --prop x=5cm --prop y=6cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="产品图片" --prop font="Microsoft YaHei" --prop size=16 --prop color=999999 --prop align=center --prop x=1cm --prop y=8.5cm --prop width=14cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="智能新品 Pro" --prop font="Microsoft YaHei" --prop size=24 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=1.5cm --prop y=2cm --prop width=12cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="SMART PRODUCT PRO" --prop font="Arial Black" --prop size=12 --prop color=4ECDC4 --prop align=left --prop x=1.5cm --prop y=3.2cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop x=1.5cm --prop y=14.5cm --prop width=5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="RMB 1999" --prop font="Arial Black" --prop size=22 --prop color=FFFFFF --prop align=center --prop x=1.5cm --prop y=14.8cm --prop width=5cm --prop height=1cm --prop fill=none

# 右侧功能介绍 (内容区: 17-33cm)
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="核心功能" --prop font="Microsoft YaHei" --prop size=24 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=17cm --prop y=2cm --prop width=10cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="KEY FEATURES" --prop font="Arial Black" --prop size=12 --prop color=FF6B6B --prop align=left --prop x=17cm --prop y=3.2cm --prop width=8cm --prop height=0.6cm --prop fill=none

# 功能卡片1
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=17cm --prop y=4.5cm --prop width=15cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.15 --prop x=18.5cm --prop y=5.2cm --prop width=2cm --prop height=2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="01" --prop font="Arial Black" --prop size=16 --prop color=FF6B6B --prop align=center --prop x=18.5cm --prop y=5.7cm --prop width=2cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="智能AI助手" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=21.5cm --prop y=5cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="内置先进AI算法，智能识别用户需求" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=21.5cm --prop y=6cm --prop width=9cm --prop height=1.2cm --prop fill=none

# 功能卡片2
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=17cm --prop y=8.5cm --prop width=15cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=18.5cm --prop y=9.2cm --prop width=2cm --prop height=2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="02" --prop font="Arial Black" --prop size=16 --prop color=FFE66D --prop align=center --prop x=18.5cm --prop y=9.7cm --prop width=2cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="超长续航" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=21.5cm --prop y=9cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="大容量电池设计，续航时间长达72小时" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=21.5cm --prop y=10cm --prop width=9cm --prop height=1.2cm --prop fill=none

# 功能卡片3
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=17cm --prop y=12.5cm --prop width=15cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.3 --prop x=18.5cm --prop y=13.2cm --prop width=2cm --prop height=2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="03" --prop font="Arial Black" --prop size=16 --prop color=4ECDC4 --prop align=center --prop x=18.5cm --prop y=13.7cm --prop width=2cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="极速快充" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=21.5cm --prop y=13cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="支持65W快充技术，30分钟充电80%" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=21.5cm --prop y=14cm --prop width=9cm --prop height=1.2cm --prop fill=none

# 右下角装饰
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=29cm --prop y=16cm --prop width=4.87cm --prop height=3.05cm

echo "Slide 3 complete"

# ============================================
# SLIDE 4 - GRID (网格页)
# 独特布局: 六边形蜂窝网格概念 - 实际用2x3卡片
# ============================================
echo "Building Slide 4..."

# 左侧装饰区
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FF6B6B --prop opacity=0.1 --prop x=0cm --prop y=0cm --prop width=10cm --prop height=19.05cm

# 右侧装饰区
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop opacity=0.1 --prop x=27cm --prop y=0cm --prop width=6.87cm --prop height=19.05cm

# 左侧装饰圆点 (手动定义3个)
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.2 --prop x=2cm --prop y=5cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=3cm --prop y=7cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.25 --prop x=4cm --prop y=9cm --prop width=0.35cm --prop height=0.35cm

# 标题 (内容区)
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="为什么选择我们" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=2cm --prop y=1cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="WHY CHOOSE US" --prop font="Arial Black" --prop size=14 --prop color=FF6B6B --prop align=left --prop x=2cm --prop y=2.5cm --prop width=10cm --prop height=0.8cm --prop fill=none

# 上排3个卡片 (内容区: 2-26cm)
# 卡片1
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=2cm --prop y=4cm --prop width=7.5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop x=5.25cm --prop y=4.8cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="品质保障" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2C2C54 --prop align=center --prop x=2cm --prop y=6.8cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="严格质量管控体系" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=2cm --prop y=7.8cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 卡片2
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=10.5cm --prop y=4cm --prop width=7.5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop x=13.75cm --prop y=4.8cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="极速发货" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2C2C54 --prop align=center --prop x=10.5cm --prop y=6.8cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="48小时内发货" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=10.5cm --prop y=7.8cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 卡片3
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=19cm --prop y=4cm --prop width=7.5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop x=22.25cm --prop y=4.8cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="专业客服" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2C2C54 --prop align=center --prop x=19cm --prop y=6.8cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="7x24小时在线" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=19cm --prop y=7.8cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 下排3个卡片
# 卡片4
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=2cm --prop y=10.5cm --prop width=7.5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop x=5.25cm --prop y=11.3cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="无忧退换" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2C2C54 --prop align=center --prop x=2cm --prop y=13.3cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="30天无理由退换" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=2cm --prop y=14.3cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 卡片5
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=10.5cm --prop y=10.5cm --prop width=7.5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop x=13.75cm --prop y=11.3cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="正品保证" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2C2C54 --prop align=center --prop x=10.5cm --prop y=13.3cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="官方授权正品" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=10.5cm --prop y=14.3cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 卡片6
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=19cm --prop y=10.5cm --prop width=7.5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop x=22.25cm --prop y=11.3cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="会员特权" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2C2C54 --prop align=center --prop x=19cm --prop y=13.3cm --prop width=7.5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="积分兑换好礼" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=center --prop x=19cm --prop y=14.3cm --prop width=7.5cm --prop height=0.6cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=18.8cm --prop width=33.87cm --prop height=0.25cm

echo "Slide 4 complete"

# ============================================
# SLIDE 5 - QUOTE (引用页)
# 独特布局: 大引号居中 + 评价环绕
# ============================================
echo "Building Slide 5..."

# 左侧黄色装饰条 (装饰区)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFE66D --prop x=0cm --prop y=0cm --prop width=4cm --prop height=19.05cm

# 大引号背景 (内容区)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text=""" --prop font="Georgia" --prop size=180 --prop color=FF6B6B --prop opacity=0.12 --prop align=left --prop x=5cm --prop y=1cm --prop width=10cm --prop height=8cm --prop fill=none

# 左侧装饰圆点 (手动定义3个)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=FF6B6B --prop opacity=0.2 --prop x=1cm --prop y=5cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.25 --prop x=2cm --prop y=7cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.3 --prop x=1.5cm --prop y=9cm --prop width=0.35cm --prop height=0.35cm

# 核心引用内容 (内容区: 5-30cm)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="客户评价" --prop font="Microsoft YaHei" --prop size=14 --prop color=4ECDC4 --prop align=left --prop x=6cm --prop y=3cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="这是我用过最好的产品，" --prop font="Microsoft YaHei" --prop size=36 --prop color=2C2C54 --prop align=left --prop x=6cm --prop y=4.5cm --prop width=22cm --prop height=1.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="体验超出预期！" --prop font="Microsoft YaHei" --prop size=36 --prop color=2C2C54 --prop align=left --prop x=6cm --prop y=6.5cm --prop width=18cm --prop height=1.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=6cm --prop y=9cm --prop width=4cm --prop height=0.15cm

# 客户信息卡片
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=6cm --prop y=10.5cm --prop width=12cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.3 --prop x=7.5cm --prop y=11.2cm --prop width=1.6cm --prop height=1.6cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="张女士" --prop font="Microsoft YaHei" --prop size=18 --prop bold=true --prop color=2C2C54 --prop align=left --prop x=9.5cm --prop y=11cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="资深用户 | 使用3年" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=9.5cm --prop y=12cm --prop width=8cm --prop height=0.6cm --prop fill=none

# 满意度指标
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=19cm --prop y=10.5cm --prop width=10cm --prop height=3cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="客户满意度" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=center --prop x=19cm --prop y=11cm --prop width=10cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="98.5%" --prop font="Arial Black" --prop size=36 --prop color=FF6B6B --prop align=center --prop x=19cm --prop y=11.8cm --prop width=10cm --prop height=1.5cm --prop fill=none

# 更多评价卡片
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="更多评价" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=6cm --prop y=14.5cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 评价小卡片
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=6cm --prop y=15.5cm --prop width=8.5cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="服务态度好，物流速度快" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=6.5cm --prop y=15.8cm --prop width=7.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="- 李先生" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=right --prop x=6.5cm --prop y=16.5cm --prop width=7.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=15cm --prop y=15.5cm --prop width=8.5cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="产品做工精细，性价比高" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=15.5cm --prop y=15.8cm --prop width=7.5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="- 王女士" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=right --prop x=15.5cm --prop y=16.5cm --prop width=7.5cm --prop height=0.5cm --prop fill=none

officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=24cm --prop y=15.5cm --prop width=8cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="功能强大，超出预期" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=24.5cm --prop y=15.8cm --prop width=7cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="- 陈先生" --prop font="Microsoft YaHei" --prop size=10 --prop color=999999 --prop align=right --prop x=24.5cm --prop y=16.5cm --prop width=7cm --prop height=0.5cm --prop fill=none

echo "Slide 5 complete"

# ============================================
# SLIDE 6 - CTA (行动号召页)
# 独特布局: 顶部大色块 + 底部行动区
# ============================================
echo "Building Slide 6..."

# 顶部珊瑚橙大色块 (装饰区)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=FF6B6B --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=8cm

# 右下角装饰色块
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=4ECDC4 --prop x=27cm --prop y=8cm --prop width=6.87cm --prop height=11.05cm

# 顶部装饰圆点 (手动定义，在装饰区域内)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.15 --prop x=5cm --prop y=2cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFE66D --prop opacity=0.2 --prop x=10cm --prop y=4cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.1 --prop x=15cm --prop y=1cm --prop width=0.35cm --prop height=0.35cm

# 右侧装饰圆点
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.15 --prop x=29cm --prop y=10cm --prop width=0.5cm --prop height=0.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.1 --prop x=30cm --prop y=13cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=4ECDC4 --prop opacity=0.1 --prop x=31cm --prop y=16cm --prop width=0.35cm --prop height=0.35cm

# 主标题 (在珊瑚橙背景上)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="立即行动" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=FFFFFF --prop align=left --prop x=4cm --prop y=2cm --prop width=15cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="TAKE ACTION NOW" --prop font="Arial Black" --prop size=22 --prop color=FFE66D --prop align=left --prop x=4cm --prop y=4.8cm --prop width=15cm --prop height=1cm --prop fill=none

# 限时优惠标签
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFE66D --prop x=4cm --prop y=6cm --prop width=4cm --prop height=1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="限时优惠" --prop font="Microsoft YaHei" --prop size=14 --prop color=2C2C54 --prop align=center --prop x=4cm --prop y=6.2cm --prop width=4cm --prop height=0.6cm --prop fill=none

# 主按钮 (内容区)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FF6B6B --prop x=4cm --prop y=10cm --prop width=10cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="立即购买" --prop font="Microsoft YaHei" --prop size=24 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=4cm --prop y=10.6cm --prop width=10cm --prop height=1.2cm --prop fill=none

# 次按钮
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop line=FF6B6B --prop lineWidth=2pt --prop x=15cm --prop y=10cm --prop width=8cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="了解更多" --prop font="Microsoft YaHei" --prop size=18 --prop color=FF6B6B --prop align=center --prop x=15cm --prop y=10.6cm --prop width=8cm --prop height=1.2cm --prop fill=none

# 联系信息卡片 (内容区: 4-25cm)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop x=4cm --prop y=14cm --prop width=18cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=14 --prop color=999999 --prop align=left --prop x=5cm --prop y=14.5cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="客服热线: 400-888-8888" --prop font="Microsoft YaHei" --prop size=16 --prop color=2C2C54 --prop align=left --prop x=5cm --prop y=15.3cm --prop width=12cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="官方网站: www.brand.com" --prop font="Microsoft YaHei" --prop size=16 --prop color=2C2C54 --prop align=left --prop x=5cm --prop y=16.2cm --prop width=12cm --prop height=0.7cm --prop fill=none

# 二维码占位 (装饰区内)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=28cm --prop y=10cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="扫码关注" --prop font="Microsoft YaHei" --prop size=14 --prop color=999999 --prop align=center --prop x=28cm --prop y=12cm --prop width=5cm --prop height=0.6cm --prop fill=none

echo "Slide 6 complete"

# ============================================
# MORPH TRANSITIONS
# ============================================
echo "Adding Morph transitions..."
for i in 2 3 4 5 6; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

echo "Validating..."
officecli validate "$OUTPUT"
echo "✅ Complete: $OUTPUT"