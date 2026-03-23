#!/bin/bash
# Minimal Corporate Template - Build Script v2.0
# 极简商务汇报风格PPT模板 - 坐标冲突修复版
#
# 风格标签: 商务经典 / 极简留白 / 专业稳重
# 场景标签: 年度汇报 / 工作总结 / 项目汇报
# 独特布局: 左侧色块分割 + 垂直信息流
# 目标: 280+ 元素
# --------------------------------------------

set -e
OUTPUT="template.pptx"

echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"

# 添加6个幻灯片（纯白背景）
for i in 1 2 3 4 5 6; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FFFFFF
done
echo "Created 6 slides"

# ============================================
# SLIDE 1 - HERO (封面页) - 目标: 50元素
# 独特布局: 左侧深蓝竖条(0-2cm) + 右侧内容区(2-33cm)
# ============================================
echo "Building Slide 1..."

# 左侧深蓝装饰条 (内容主区域外)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm

# 顶部金色装饰线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=1.5cm --prop y=0cm --prop width=32.37cm --prop height=0.15cm

# 底部浅灰装饰线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=1.5cm --prop y=18.9cm --prop width=32.37cm --prop height=0.15cm

# 右上角装饰方块组 (装饰区域: x=28-33cm)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=1E3A5F --prop opacity=0.1 --prop x=29cm --prop y=2cm --prop width=3.5cm --prop height=3.5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop opacity=0.3 --prop x=30cm --prop y=3cm --prop width=1.8cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=1E3A5F --prop opacity=0.05 --prop x=30.8cm --prop y=3.8cm --prop width=1.2cm --prop height=1.2cm

# 右下角装饰方块组 (装饰区域: x=28-33cm)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=28.5cm --prop y=13.5cm --prop width=4.5cm --prop height=4.5cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=1E3A5F --prop opacity=0.05 --prop x=29.2cm --prop y=14.2cm --prop width=2.8cm --prop height=2.8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop opacity=0.2 --prop x=29.8cm --prop y=14.8cm --prop width=1.5cm --prop height=1.5cm

# 年度标签 (内容区域: x=2-28cm)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="ANNUAL REPORT" --prop font="Arial Black" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2.5cm --prop y=3cm --prop width=10cm --prop height=0.8cm --prop fill=none

# 主标题
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2025 年度工作汇报" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2.5cm --prop y=6cm --prop width=24cm --prop height=2.5cm --prop fill=none

# 副标题
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="砥砺前行 · 创新突破 · 共赢未来" --prop font="Microsoft YaHei" --prop size=22 --prop color=666666 --prop align=left --prop x=2.5cm --prop y=9cm --prop width=24cm --prop height=1.2cm --prop fill=none

# 分隔线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2.5cm --prop y=11cm --prop width=8cm --prop height=0.08cm

# 汇报人信息卡片 (内容区域内)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=13cm --prop width=12cm --prop height=4cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="汇报人" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=3.3cm --prop y=13.5cm --prop width=3cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="张明远" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=3.3cm --prop y=14.2cm --prop width=5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="产品研发部 · 高级经理" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=3.3cm --prop y=15.3cm --prop width=8cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2.5cm --prop y=13cm --prop width=0.1cm --prop height=4cm

# 日期信息卡片 (内容区域内)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=15.5cm --prop y=13cm --prop width=10cm --prop height=4cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="汇报日期" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=16.3cm --prop y=13.5cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2025.01.15" --prop font="Arial Black" --prop size=20 --prop color=1E3A5F --prop align=left --prop x=16.3cm --prop y=14.2cm --prop width=6cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="年度工作总结会议" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=16.3cm --prop y=15.3cm --prop width=8cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=15.5cm --prop y=13cm --prop width=0.1cm --prop height=4cm

# 手动定义装饰圆点 - 左侧区域 (最多3个)
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=1.8cm --prop y=5cm --prop width=0.3cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop opacity=0.3 --prop x=2.1cm --prop y=5.5cm --prop width=0.2cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop opacity=0.5 --prop x=1.6cm --prop y=5.8cm --prop width=0.15cm --prop height=0.15cm

# 装饰线条
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=12cm --prop width=15cm --prop height=0.03cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=12.5cm --prop width=10cm --prop height=0.03cm

# 网格装饰线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop opacity=0.5 --prop x=10cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop opacity=0.3 --prop x=20cm --prop y=0cm --prop width=0.02cm --prop height=19.05cm

echo "Slide 1 complete"

# ============================================
# SLIDE 2 - STATEMENT (观点页) - 目标: 45元素
# 独特布局: 左侧内容区(2-20cm) + 右侧装饰区(20-33.87cm)
# 修复: 数据卡片不再与装饰区域重叠
# ============================================
echo "Building Slide 2..."

# 左侧深蓝装饰条
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm

# 顶部金色装饰线
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=1.5cm --prop y=0cm --prop width=32.37cm --prop height=0.15cm

# 右侧装饰区域 (仅装饰，无内容元素) - 范围: 20-33.87cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=20cm --prop y=0cm --prop width=13.87cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop opacity=0.05 --prop x=22cm --prop y=2cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=D4A84B --prop opacity=0.2 --prop x=24cm --prop y=4cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop opacity=0.03 --prop x=25cm --prop y=5cm --prop width=2cm --prop height=2cm

# 大数字背景 (内容区域内)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="100%" --prop font="Arial Black" --prop size=180 --prop color=1E3A5F --prop opacity=0.08 --prop align=left --prop x=2cm --prop y=2cm --prop width=18cm --prop height=10cm --prop fill=none

# 核心观点 (内容区域: x=2-18cm)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="年度目标" --prop font="Microsoft YaHei" --prop size=18 --prop color=D4A84B --prop align=left --prop x=2.5cm --prop y=3cm --prop width=8cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="全面达成" --prop font="Microsoft YaHei" --prop size=72 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2.5cm --prop y=4.5cm --prop width=16cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2.5cm --prop y=8cm --prop width=6cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="在团队共同努力下，全年各项工作指标均圆满完成" --prop font="Microsoft YaHei" --prop size=16 --prop color=666666 --prop align=left --prop x=2.5cm --prop y=9cm --prop width=16cm --prop height=1cm --prop fill=none

# 数据卡片1 (内容区域内: x=2.5cm)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=2.5cm --prop y=11cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=2.5cm --prop y=11cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="营收目标" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=3cm --prop y=11.8cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="12.8亿" --prop font="Arial Black" --prop size=28 --prop color=1E3A5F --prop align=left --prop x=3cm --prop y=12.5cm --prop width=4cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="完成率 108%" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=left --prop x=3cm --prop y=14.5cm --prop width=4cm --prop height=0.6cm --prop fill=none

# 数据卡片2 (内容区域内: x=8cm)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=8cm --prop y=11cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=8cm --prop y=11cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="用户增长" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=8.5cm --prop y=11.8cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="580万+" --prop font="Arial Black" --prop size=28 --prop color=1E3A5F --prop align=left --prop x=8.5cm --prop y=12.5cm --prop width=4cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="增长率 156%" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=left --prop x=8.5cm --prop y=14.5cm --prop width=4cm --prop height=0.6cm --prop fill=none

# 数据卡片3 (内容区域内: x=13.5cm，确保不超过20cm边界)
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=13.5cm --prop y=11cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=13.5cm --prop y=11cm --prop width=5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="项目交付" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=14cm --prop y=11.8cm --prop width=4cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="127个" --prop font="Arial Black" --prop size=28 --prop color=1E3A5F --prop align=left --prop x=14cm --prop y=12.5cm --prop width=4cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="按时交付率 98%" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=left --prop x=14cm --prop y=14.5cm --prop width=4cm --prop height=0.6cm --prop fill=none

# 装饰元素 - 左侧区域
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=1.8cm --prop y=3cm --prop width=0.3cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop opacity=0.3 --prop x=2.1cm --prop y=3.5cm --prop width=0.2cm --prop height=0.2cm

echo "Slide 2 complete"

# ============================================
# SLIDE 3 - GRID (网格页) - 目标: 60元素
# 独特布局: 不对称网格(上2下4)
# ============================================
echo "Building Slide 3..."

# 左侧深蓝装饰条
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm

# 顶部金色装饰线
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=1.5cm --prop y=0cm --prop width=32.37cm --prop height=0.15cm

# 标题区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="重点工作成果" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2.5cm --prop y=1cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="KEY ACHIEVEMENTS" --prop font="Arial Black" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=10cm --prop height=0.8cm --prop fill=none

# 上排2个大卡片 (不对称布局)
# 卡片1 - 大
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=4cm --prop width=15cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=2.5cm --prop y=4cm --prop width=15cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop x=5cm --prop y=5cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="01" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=5cm --prop y=5.3cm --prop width=1.2cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="产品创新" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=3cm --prop y=5cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="发布3款新产品，获得市场高度认可" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=3cm --prop y=6.2cm --prop width=12cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="3款" --prop font="Arial Black" --prop size=36 --prop color=D4A84B --prop align=left --prop x=3cm --prop y=7.5cm --prop width=5cm --prop height=1.5cm --prop fill=none

# 卡片2 - 稍小
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=18.5cm --prop y=4cm --prop width=13cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=18.5cm --prop y=4cm --prop width=13cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop x=21cm --prop y=5cm --prop width=1.2cm --prop height=1.2cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="02" --prop font="Arial Black" --prop size=14 --prop color=FFFFFF --prop align=center --prop x=21cm --prop y=5.3cm --prop width=1.2cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="市场拓展" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=19cm --prop y=5cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="开拓5个新市场" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=19cm --prop y=6.2cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="5个" --prop font="Arial Black" --prop size=36 --prop color=D4A84B --prop align=left --prop x=19cm --prop y=7.5cm --prop width=5cm --prop height=1.5cm --prop fill=none

# 下排4个小卡片 (均匀分布)
# 卡片3
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=10.5cm --prop width=7cm --prop height=5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=2.5cm --prop y=10.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop x=5.3cm --prop y=11.3cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="03" --prop font="Arial Black" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=5.3cm --prop y=11.55cm --prop width=1cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="技术突破" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=3cm --prop y=11.3cm --prop width=5cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="获得15项专利" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=3cm --prop y=12.3cm --prop width=6cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="15项" --prop font="Arial Black" --prop size=24 --prop color=D4A84B --prop align=left --prop x=3cm --prop y=13.5cm --prop width=4cm --prop height=1cm --prop fill=none

# 卡片4
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=10.5cm --prop y=10.5cm --prop width=7cm --prop height=5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=10.5cm --prop y=10.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop x=13.3cm --prop y=11.3cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="04" --prop font="Arial Black" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=13.3cm --prop y=11.55cm --prop width=1cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="团队建设" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=11cm --prop y=11.3cm --prop width=5cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="团队扩充50%" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=11cm --prop y=12.3cm --prop width=6cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="50%" --prop font="Arial Black" --prop size=24 --prop color=D4A84B --prop align=left --prop x=11cm --prop y=13.5cm --prop width=4cm --prop height=1cm --prop fill=none

# 卡片5
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=18.5cm --prop y=10.5cm --prop width=7cm --prop height=5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=18.5cm --prop y=10.5cm --prop width=7cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop x=21.3cm --prop y=11.3cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="05" --prop font="Arial Black" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=21.3cm --prop y=11.55cm --prop width=1cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="流程优化" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=19cm --prop y=11.3cm --prop width=5cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="效率提升40%" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=19cm --prop y=12.3cm --prop width=6cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="40%" --prop font="Arial Black" --prop size=24 --prop color=D4A84B --prop align=left --prop x=19cm --prop y=13.5cm --prop width=4cm --prop height=1cm --prop fill=none

# 卡片6
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=26.5cm --prop y=10.5cm --prop width=5.5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=26.5cm --prop y=10.5cm --prop width=5.5cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop x=28.8cm --prop y=11.3cm --prop width=1cm --prop height=1cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="06" --prop font="Arial Black" --prop size=12 --prop color=FFFFFF --prop align=center --prop x=28.8cm --prop y=11.55cm --prop width=1cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="客户满意" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=27cm --prop y=11.3cm --prop width=5cm --prop height=0.7cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="NPS达92分" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=27cm --prop y=12.3cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="92分" --prop font="Arial Black" --prop size=24 --prop color=D4A84B --prop align=left --prop x=27cm --prop y=13.5cm --prop width=4cm --prop height=1cm --prop fill=none

# 底部装饰线
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=1.5cm --prop y=16.5cm --prop width=32.37cm --prop height=0.1cm

echo "Slide 3 complete"

# ============================================
# SLIDE 4 - CASE (案例页) - 目标: 50元素
# 独特布局: 左右对比卡片
# ============================================
echo "Building Slide 4..."

# 左侧深蓝装饰条
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm

# 顶部金色装饰线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=1.5cm --prop y=0cm --prop width=32.37cm --prop height=0.15cm

# 标题
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="标杆案例" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2.5cm --prop y=1cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="SUCCESS STORIES" --prop font="Arial Black" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=10cm --prop height=0.8cm --prop fill=none

# 左侧案例卡片 (内容区域内)
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=4cm --prop width=14cm --prop height=12cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=3cm --prop y=4.5cm --prop width=13cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="项目截图" --prop font="Microsoft YaHei" --prop size=14 --prop color=999999 --prop align=center --prop x=3cm --prop y=6.5cm --prop width=13cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="智慧城市项目" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=3cm --prop y=10cm --prop width=10cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="为某市政府打造智慧城市解决方案" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=3cm --prop y=11cm --prop width=12cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=3cm --prop y=12.5cm --prop width=0.1cm --prop height=2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="项目金额: 500万" --prop font="Microsoft YaHei" --prop size=12 --prop color=333333 --prop align=left --prop x=3.5cm --prop y=12.5cm --prop width=8cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="实施周期: 6个月" --prop font="Microsoft YaHei" --prop size=12 --prop color=333333 --prop align=left --prop x=3.5cm --prop y=13.2cm --prop width=8cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="客户满意度: 98%" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=left --prop x=3.5cm --prop y=13.9cm --prop width=8cm --prop height=0.6cm --prop fill=none

# 右侧案例卡片 (内容区域内)
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=17.5cm --prop y=4cm --prop width=14cm --prop height=12cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=18cm --prop y=4.5cm --prop width=13cm --prop height=5cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="项目截图" --prop font="Microsoft YaHei" --prop size=14 --prop color=999999 --prop align=center --prop x=18cm --prop y=6.5cm --prop width=13cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="电商平台升级" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=18cm --prop y=10cm --prop width=10cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="帮助电商客户重构技术架构" --prop font="Microsoft YaHei" --prop size=12 --prop color=666666 --prop align=left --prop x=18cm --prop y=11cm --prop width=12cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=18cm --prop y=12.5cm --prop width=0.1cm --prop height=2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="项目金额: 800万" --prop font="Microsoft YaHei" --prop size=12 --prop color=333333 --prop align=left --prop x=18.5cm --prop y=12.5cm --prop width=8cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="实施周期: 8个月" --prop font="Microsoft YaHei" --prop size=12 --prop color=333333 --prop align=left --prop x=18.5cm --prop y=13.2cm --prop width=8cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="客户满意度: 96%" --prop font="Microsoft YaHei" --prop size=12 --prop color=D4A84B --prop align=left --prop x=18.5cm --prop y=13.9cm --prop width=8cm --prop height=0.6cm --prop fill=none

echo "Slide 4 complete"

# ============================================
# SLIDE 5 - COMPARISON (对比页) - 目标: 50元素
# 独特布局: 垂直分隔线 + 左右对比
# ============================================
echo "Building Slide 5..."

# 左侧深蓝装饰条
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm

# 顶部金色装饰线
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=1.5cm --prop y=0cm --prop width=32.37cm --prop height=0.15cm

# 标题
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="优化对比" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2.5cm --prop y=1cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="BEFORE & AFTER" --prop font="Arial Black" --prop size=14 --prop color=D4A84B --prop align=left --prop x=2.5cm --prop y=2.5cm --prop width=10cm --prop height=0.8cm --prop fill=none

# VS分隔线 (中间位置)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=16.5cm --prop y=0cm --prop width=0.15cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=15.8cm --prop y=8cm --prop width=1.5cm --prop height=1.5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="VS" --prop font="Arial Black" --prop size=16 --prop color=FFFFFF --prop align=center --prop x=15.8cm --prop y=8.4cm --prop width=1.5cm --prop height=0.8cm --prop fill=none

# 优化前 (左侧内容区: 2-16cm)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="优化前" --prop font="Microsoft YaHei" --prop size=24 --prop bold=true --prop color=666666 --prop align=center --prop x=2.5cm --prop y=3.5cm --prop width=13cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=5cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="响应时间" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=3.3cm --prop y=5.6cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="8-12秒" --prop font="Arial Black" --prop size=18 --prop color=666666 --prop align=right --prop x=9.5cm --prop y=5.5cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=7.5cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="并发能力" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=3.3cm --prop y=8.1cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="1000用户" --prop font="Arial Black" --prop size=18 --prop color=666666 --prop align=right --prop x=9.5cm --prop y=8cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=10cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="系统稳定性" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=3.3cm --prop y=10.6cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="95%" --prop font="Arial Black" --prop size=18 --prop color=666666 --prop align=right --prop x=9.5cm --prop y=10.5cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=12.5cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="运维成本" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=3.3cm --prop y=13.1cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="50万/月" --prop font="Arial Black" --prop size=18 --prop color=666666 --prop align=right --prop x=9.5cm --prop y=13cm --prop width=5cm --prop height=0.8cm --prop fill=none

# 优化后 (右侧内容区: 17-33cm)
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="优化后" --prop font="Microsoft YaHei" --prop size=24 --prop bold=true --prop color=1E3A5F --prop align=center --prop x=18cm --prop y=3.5cm --prop width=14cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=18cm --prop y=5cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=18cm --prop y=5cm --prop width=13cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="响应时间" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=18.8cm --prop y=5.6cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="< 1秒" --prop font="Arial Black" --prop size=18 --prop color=1E3A5F --prop align=right --prop x=25cm --prop y=5.5cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=18cm --prop y=7.5cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=18cm --prop y=7.5cm --prop width=13cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="并发能力" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=18.8cm --prop y=8.1cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="10000+用户" --prop font="Arial Black" --prop size=18 --prop color=1E3A5F --prop align=right --prop x=25cm --prop y=8cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=18cm --prop y=10cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=18cm --prop y=10cm --prop width=13cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="系统稳定性" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=18.8cm --prop y=10.6cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="99.9%" --prop font="Arial Black" --prop size=18 --prop color=1E3A5F --prop align=right --prop x=25cm --prop y=10.5cm --prop width=5cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=18cm --prop y=12.5cm --prop width=13cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=18cm --prop y=12.5cm --prop width=13cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="运维成本" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=18.8cm --prop y=13.1cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="20万/月" --prop font="Arial Black" --prop size=18 --prop color=1E3A5F --prop align=right --prop x=25cm --prop y=13cm --prop width=5cm --prop height=0.8cm --prop fill=none

# 底部提升指标
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=5cm --prop y=15.5cm --prop width=24cm --prop height=2cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="整体效率提升 300% | 成本降低 60%" --prop font="Microsoft YaHei" --prop size=18 --prop color=FFFFFF --prop align=center --prop x=5cm --prop y=16cm --prop width=24cm --prop height=1cm --prop fill=none

echo "Slide 5 complete"

# ============================================
# SLIDE 6 - THANKS (感谢页) - 目标: 40元素
# 独特布局: 左侧感谢 + 右侧联系卡片
# ============================================
echo "Building Slide 6..."

# 左侧深蓝装饰条
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=0cm --prop y=0cm --prop width=1.5cm --prop height=19.05cm

# 顶部金色装饰线
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=1.5cm --prop y=0cm --prop width=32.37cm --prop height=0.15cm

# 右侧装饰区域 (装饰区: 22-33cm)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=22cm --prop y=0cm --prop width=11.87cm --prop height=19.05cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=1E3A5F --prop opacity=0.1 --prop x=24cm --prop y=2cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=D4A84B --prop opacity=0.3 --prop x=25cm --prop y=3cm --prop width=3cm --prop height=3cm

# 主标题 (内容区: 2-22cm)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="感谢聆听" --prop font="Microsoft YaHei" --prop size=72 --prop bold=true --prop color=1E3A5F --prop align=left --prop x=2.5cm --prop y=4cm --prop width=18cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="THANK YOU" --prop font="Arial Black" --prop size=28 --prop color=D4A84B --prop align=left --prop x=2.5cm --prop y=7.5cm --prop width=15cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=D4A84B --prop x=2.5cm --prop y=9.5cm --prop width=8cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="欢迎各位领导、同事批评指正" --prop font="Microsoft YaHei" --prop size=16 --prop color=666666 --prop align=left --prop x=2.5cm --prop y=10.5cm --prop width=15cm --prop height=0.8cm --prop fill=none

# 联系信息卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=E8EEF4 --prop x=2.5cm --prop y=12.5cm --prop width=15cm --prop height=4cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系方式" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=left --prop x=3.5cm --prop y=13cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="zhangmingyuan@company.com" --prop font="Arial" --prop size=14 --prop color=1E3A5F --prop align=left --prop x=3.5cm --prop y=13.8cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="电话: 138-0000-0000" --prop font="Microsoft YaHei" --prop size=14 --prop color=666666 --prop align=left --prop x=3.5cm --prop y=14.6cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=1E3A5F --prop x=2.5cm --prop y=12.5cm --prop width=0.1cm --prop height=4cm

# 二维码占位 (装饰区域内)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=FFFFFF --prop x=24cm --prop y=10cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="扫码关注" --prop font="Microsoft YaHei" --prop size=12 --prop color=999999 --prop align=center --prop x=24cm --prop y=12cm --prop width=5cm --prop height=0.6cm --prop fill=none

# 装饰圆点 (最多3个手动定义)
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop x=1.8cm --prop y=5cm --prop width=0.3cm --prop height=0.3cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=1E3A5F --prop opacity=0.3 --prop x=2.1cm --prop y=5.5cm --prop width=0.2cm --prop height=0.2cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=D4A84B --prop opacity=0.5 --prop x=1.6cm --prop y=5.8cm --prop width=0.15cm --prop height=0.15cm

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
echo "Check shape count with: officecli view template.pptx stats"
