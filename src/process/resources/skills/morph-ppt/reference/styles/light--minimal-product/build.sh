#!/bin/bash
# Minimal Product Template - Build Script v2.0
# 极简产品介绍风格PPT模板 - 中央聚焦+极简留白布局
set -e
OUTPUT="template.pptx"
echo "Creating $OUTPUT ..."
officecli create "$OUTPUT"
for i in 1 2 3 4 5 6; do
  officecli add "$OUTPUT" '/' --type slide --prop layout=blank --prop background=FAFAFA
done
echo "Created 6 slides"

# SLIDE 1 - HERO (封面页) - 中央聚焦布局
echo "Building Slide 1 - Hero..."
# 极简边框 - 只保留底部细线
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=00B894 --prop x=10cm --prop y=17.5cm --prop width=14cm --prop height=0.05cm

# 手动定义装饰元素（最多3个）
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.08 --prop x=5cm --prop y=3cm --prop width=8cm --prop height=8cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=2D3436 --prop opacity=0.05 --prop x=20cm --prop y=8cm --prop width=6cm --prop height=6cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.06 --prop x=8cm --prop y=12cm --prop width=4cm --prop height=4cm

# 中央主标题区域
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="MINIMAL" --prop font="Arial" --prop size=72 --prop color=2D3436 --prop align=center --prop x=2cm --prop y=4cm --prop width=30cm --prop height=3cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="极简产品" --prop font="Microsoft YaHei" --prop size=56 --prop bold=true --prop color=2D3436 --prop align=center --prop x=2cm --prop y=7.5cm --prop width=30cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=rect --prop fill=00B894 --prop x=14cm --prop y=10.5cm --prop width=6cm --prop height=0.08cm
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="Minimal Product Introduction" --prop font="Arial" --prop size=18 --prop color=636E72 --prop align=center --prop x=2cm --prop y=11.5cm --prop width=30cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="产品介绍模板" --prop font="Microsoft YaHei" --prop size=14 --prop color=B2BEC3 --prop align=center --prop x=2cm --prop y=13cm --prop width=30cm --prop height=0.8cm --prop fill=none

# 品牌信息
officecli add "$OUTPUT" '/slide[1]' --type shape --prop text="2026" --prop font="Arial Black" --prop size=16 --prop color=00B894 --prop align=center --prop x=2cm --prop y=15.5cm --prop width=30cm --prop height=0.8cm --prop fill=none
echo "Slide 1 complete"

# SLIDE 2 - PRODUCT (产品页) - 中央产品展示
echo "Building Slide 2 - Product..."
# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[1]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.06 --prop x=2cm --prop y=2cm --prop width=4cm --prop height=4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=2D3436 --prop opacity=0.04 --prop x=28cm --prop y=12cm --prop width=5cm --prop height=5cm

# 中央产品展示区 - 白色卡片
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=9cm --prop y=2cm --prop width=16cm --prop height=15cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=00B894 --prop x=9cm --prop y=2cm --prop width=16cm --prop height=0.15cm

# 产品图片区域
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=F5F5F5 --prop x=12cm --prop y=4cm --prop width=10cm --prop height=10cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="产品图片" --prop font="Microsoft YaHei" --prop size=14 --prop color=B2BEC3 --prop align=center --prop x=9cm --prop y=8.5cm --prop width=16cm --prop height=1cm --prop fill=none

# 产品名称
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="产品名称" --prop font="Microsoft YaHei" --prop size=28 --prop bold=true --prop color=2D3436 --prop align=center --prop x=9cm --prop y=14.5cm --prop width=16cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="PRODUCT NAME" --prop font="Arial" --prop size=12 --prop color=00B894 --prop align=center --prop x=9cm --prop y=15.8cm --prop width=16cm --prop height=0.6cm --prop fill=none

# 左侧功能亮点
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=00B894 --prop x=2cm --prop y=5cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="高性能处理器" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=2.8cm --prop y=4.9cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=00B894 --prop x=2cm --prop y=7cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="超长续航72小时" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=2.8cm --prop y=6.9cm --prop width=5cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=ellipse --prop fill=00B894 --prop x=2cm --prop y=9cm --prop width=0.4cm --prop height=0.4cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="智能AI助手" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=2.8cm --prop y=8.9cm --prop width=5cm --prop height=0.6cm --prop fill=none

# 右侧价格信息
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=roundRect --prop fill=00B894 --prop x=26cm --prop y=6cm --prop width=6cm --prop height=2cm
officecli add "$OUTPUT" '/slide[2]' --type shape --prop text="RMB 2999" --prop font="Arial Black" --prop size=20 --prop color=FFFFFF --prop align=center --prop x=26cm --prop y=6.5cm --prop width=6cm --prop height=1cm --prop fill=none

# 底部细线
officecli add "$OUTPUT" '/slide[2]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=10cm --prop y=17.5cm --prop width=14cm --prop height=0.05cm
echo "Slide 2 complete"

# SLIDE 3 - FEATURES (功能页) - 上下两排功能卡片
echo "Building Slide 3 - Features..."
# 标题区
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="核心功能" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=2D3436 --prop align=center --prop x=2cm --prop y=1cm --prop width=30cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="KEY FEATURES" --prop font="Arial" --prop size=14 --prop color=00B894 --prop align=center --prop x=2cm --prop y=2.8cm --prop width=30cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=00B894 --prop x=15cm --prop y=3.6cm --prop width=4cm --prop height=0.08cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.06 --prop x=1cm --prop y=12cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=2D3436 --prop opacity=0.04 --prop x=28cm --prop y=2cm --prop width=4cm --prop height=4cm

# 上排两个功能卡片
# 卡片1
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=3cm --prop y=4.5cm --prop width=13cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=00B894 --prop x=3cm --prop y=4.5cm --prop width=13cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.12 --prop x=6cm --prop y=5.5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="01" --prop font="Arial Black" --prop size=22 --prop color=00B894 --prop align=center --prop x=6cm --prop y=6cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="高性能" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=left --prop x=9cm --prop y=5.5cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="搭载最新处理器" --prop font="Microsoft YaHei" --prop size=14 --prop color=636E72 --prop align=left --prop x=9cm --prop y=6.5cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="性能提升 200%" --prop font="Arial Black" --prop size=28 --prop color=00B894 --prop align=left --prop x=4cm --prop y=8cm --prop width=11cm --prop height=1.2cm --prop fill=none

# 卡片2
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=18cm --prop y=4.5cm --prop width=13cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=18cm --prop y=4.5cm --prop width=13cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=2D3436 --prop opacity=0.12 --prop x=21cm --prop y=5.5cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="02" --prop font="Arial Black" --prop size=22 --prop color=2D3436 --prop align=center --prop x=21cm --prop y=6cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="长续航" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=left --prop x=24cm --prop y=5.5cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="大容量电池" --prop font="Microsoft YaHei" --prop size=14 --prop color=636E72 --prop align=left --prop x=24cm --prop y=6.5cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="续航 72 小时" --prop font="Arial Black" --prop size=28 --prop color=2D3436 --prop align=left --prop x=19cm --prop y=8cm --prop width=11cm --prop height=1.2cm --prop fill=none

# 下排两个功能卡片
# 卡片3
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=3cm --prop y=11cm --prop width=13cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=00B894 --prop x=3cm --prop y=11cm --prop width=13cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.12 --prop x=6cm --prop y=12cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="03" --prop font="Arial Black" --prop size=22 --prop color=00B894 --prop align=center --prop x=6cm --prop y=12.5cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="AI智能" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=left --prop x=9cm --prop y=12cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="内置AI助手" --prop font="Microsoft YaHei" --prop size=14 --prop color=636E72 --prop align=left --prop x=9cm --prop y=13cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="智能语音控制" --prop font="Arial Black" --prop size=28 --prop color=00B894 --prop align=left --prop x=4cm --prop y=14.5cm --prop width=11cm --prop height=1.2cm --prop fill=none

# 卡片4
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=18cm --prop y=11cm --prop width=13cm --prop height=5.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=18cm --prop y=11cm --prop width=13cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=ellipse --prop fill=2D3436 --prop opacity=0.12 --prop x=21cm --prop y=12cm --prop width=2.5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="04" --prop font="Arial Black" --prop size=22 --prop color=2D3436 --prop align=center --prop x=21cm --prop y=12.5cm --prop width=2.5cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="快充" --prop font="Microsoft YaHei" --prop size=20 --prop bold=true --prop color=2D3436 --prop align=left --prop x=24cm --prop y=12cm --prop width=6cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="65W快充技术" --prop font="Microsoft YaHei" --prop size=14 --prop color=636E72 --prop align=left --prop x=24cm --prop y=13cm --prop width=6cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[3]' --type shape --prop text="30分钟充80%" --prop font="Arial Black" --prop size=28 --prop color=2D3436 --prop align=left --prop x=19cm --prop y=14.5cm --prop width=11cm --prop height=1.2cm --prop fill=none

# 底部细线
officecli add "$OUTPUT" '/slide[3]' --type shape --prop preset=rect --prop fill=00B894 --prop x=10cm --prop y=17.5cm --prop width=14cm --prop height=0.05cm
echo "Slide 3 complete"

# SLIDE 4 - COMPARE (对比页) - 中央VS分隔
echo "Building Slide 4 - Compare..."
# 标题
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="产品对比" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=2D3436 --prop align=center --prop x=2cm --prop y=1cm --prop width=30cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="COMPARISON" --prop font="Arial" --prop size=14 --prop color=00B894 --prop align=center --prop x=2cm --prop y=2.8cm --prop width=30cm --prop height=0.6cm --prop fill=none

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.06 --prop x=3cm --prop y=14cm --prop width=4cm --prop height=4cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=2D3436 --prop opacity=0.04 --prop x=27cm --prop y=3cm --prop width=4cm --prop height=4cm

# 中央VS分隔线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=00B894 --prop x=16.5cm --prop y=3.5cm --prop width=0.15cm --prop height=13cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=ellipse --prop fill=00B894 --prop x=15.5cm --prop y=9cm --prop width=2.2cm --prop height=2.2cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="VS" --prop font="Arial Black" --prop size=24 --prop color=FFFFFF --prop align=center --prop x=15.5cm --prop y=9.6cm --prop width=2.2cm --prop height=1cm --prop fill=none

# 左侧 - 我们的产品卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=2cm --prop y=4cm --prop width=13cm --prop height=12cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=00B894 --prop x=2cm --prop y=4cm --prop width=13cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="我们的产品" --prop font="Microsoft YaHei" --prop size=22 --prop bold=true --prop color=2D3436 --prop align=center --prop x=2cm --prop y=5cm --prop width=13cm --prop height=1cm --prop fill=none

# 对比项目 - 左侧
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=F5F5F5 --prop x=3cm --prop y=6.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="处理器" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=3.5cm --prop y=6.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="最新旗舰芯片" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=00B894 --prop align=right --prop x=7cm --prop y=6.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FAFAFA --prop x=3cm --prop y=8.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="续航" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=3.5cm --prop y=8.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="72小时" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=00B894 --prop align=right --prop x=7cm --prop y=8.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=F5F5F5 --prop x=3cm --prop y=10.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="快充" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=3.5cm --prop y=10.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="65W快充" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=00B894 --prop align=right --prop x=7cm --prop y=10.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FAFAFA --prop x=3cm --prop y=12.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="价格" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=3.5cm --prop y=12.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="RMB 2999" --prop font="Microsoft YaHei" --prop size=16 --prop bold=true --prop color=00B894 --prop align=right --prop x=7cm --prop y=12.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 右侧 - 竞品卡片
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=19cm --prop y=4cm --prop width=13cm --prop height=12cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=19cm --prop y=4cm --prop width=13cm --prop height=0.15cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="市场竞品" --prop font="Microsoft YaHei" --prop size=22 --prop bold=true --prop color=2D3436 --prop align=center --prop x=19cm --prop y=5cm --prop width=13cm --prop height=1cm --prop fill=none

# 对比项目 - 右侧
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=F5F5F5 --prop x=20cm --prop y=6.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="处理器" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=20.5cm --prop y=6.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="上一代芯片" --prop font="Microsoft YaHei" --prop size=16 --prop color=B2BEC3 --prop align=right --prop x=24cm --prop y=6.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FAFAFA --prop x=20cm --prop y=8.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="续航" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=20.5cm --prop y=8.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="48小时" --prop font="Microsoft YaHei" --prop size=16 --prop color=B2BEC3 --prop align=right --prop x=24cm --prop y=8.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=F5F5F5 --prop x=20cm --prop y=10.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="快充" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=20.5cm --prop y=10.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="30W快充" --prop font="Microsoft YaHei" --prop size=16 --prop color=B2BEC3 --prop align=right --prop x=24cm --prop y=10.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=FAFAFA --prop x=20cm --prop y=12.5cm --prop width=11cm --prop height=1.8cm
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="价格" --prop font="Microsoft YaHei" --prop size=16 --prop color=636E72 --prop align=left --prop x=20.5cm --prop y=12.9cm --prop width=4cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[4]' --type shape --prop text="RMB 3499" --prop font="Microsoft YaHei" --prop size=16 --prop color=B2BEC3 --prop align=right --prop x=24cm --prop y=12.9cm --prop width=6cm --prop height=0.6cm --prop fill=none

# 底部细线
officecli add "$OUTPUT" '/slide[4]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=10cm --prop y=17.5cm --prop width=14cm --prop height=0.05cm
echo "Slide 4 complete"

# SLIDE 5 - HIGHLIGHTS (亮点页) - 中央大数字
echo "Building Slide 5 - Highlights..."
# 标题
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="核心亮点" --prop font="Microsoft YaHei" --prop size=36 --prop bold=true --prop color=2D3436 --prop align=center --prop x=2cm --prop y=1cm --prop width=30cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="HIGHLIGHTS" --prop font="Arial" --prop size=14 --prop color=00B894 --prop align=center --prop x=2cm --prop y=2.8cm --prop width=30cm --prop height=0.6cm --prop fill=none

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.06 --prop x=28cm --prop y=10cm --prop width=5cm --prop height=5cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=ellipse --prop fill=2D3436 --prop opacity=0.04 --prop x=1cm --prop y=3cm --prop width=4cm --prop height=4cm

# 中央超大数字背景
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="200%" --prop font="Arial Black" --prop size=140 --prop color=00B894 --prop opacity=0.15 --prop align=center --prop x=0cm --prop y=3cm --prop width=22cm --prop height=8cm --prop fill=none

# 中央内容卡片
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=4cm --prop y=5cm --prop width=12cm --prop height=7cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=00B894 --prop x=4cm --prop y=5cm --prop width=12cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="性能提升" --prop font="Microsoft YaHei" --prop size=32 --prop bold=true --prop color=2D3436 --prop align=center --prop x=4cm --prop y=6.5cm --prop width=12cm --prop height=1.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="PERFORMANCE BOOST" --prop font="Arial" --prop size=14 --prop color=00B894 --prop align=center --prop x=4cm --prop y=8.5cm --prop width=12cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="搭载全新处理器" --prop font="Microsoft YaHei" --prop size=14 --prop color=636E72 --prop align=center --prop x=4cm --prop y=10cm --prop width=12cm --prop height=0.6cm --prop fill=none

# 右侧数据卡片
# 卡片1
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=18cm --prop y=4.5cm --prop width=7cm --prop height=4cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=00B894 --prop x=18cm --prop y=4.5cm --prop width=7cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="72h" --prop font="Arial Black" --prop size=36 --prop color=00B894 --prop align=center --prop x=18cm --prop y=5.5cm --prop width=7cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="超长续航" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=18cm --prop y=7cm --prop width=7cm --prop height=0.6cm --prop fill=none

# 卡片2
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=26cm --prop y=4.5cm --prop width=7cm --prop height=4cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=26cm --prop y=4.5cm --prop width=7cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="65W" --prop font="Arial Black" --prop size=36 --prop color=2D3436 --prop align=center --prop x=26cm --prop y=5.5cm --prop width=7cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="极速快充" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=26cm --prop y=7cm --prop width=7cm --prop height=0.6cm --prop fill=none

# 卡片3
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=18cm --prop y=9.5cm --prop width=7cm --prop height=4cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=00B894 --prop x=18cm --prop y=9.5cm --prop width=7cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="AI" --prop font="Arial Black" --prop size=36 --prop color=00B894 --prop align=center --prop x=18cm --prop y=10.5cm --prop width=7cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="智能助手" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=18cm --prop y=12cm --prop width=7cm --prop height=0.6cm --prop fill=none

# 卡片4
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=26cm --prop y=9.5cm --prop width=7cm --prop height=4cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=26cm --prop y=9.5cm --prop width=7cm --prop height=0.12cm
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="RMB" --prop font="Arial Black" --prop size=30 --prop color=2D3436 --prop align=center --prop x=26cm --prop y=10.5cm --prop width=7cm --prop height=1.2cm --prop fill=none
officecli add "$OUTPUT" '/slide[5]' --type shape --prop text="2999起" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=center --prop x=26cm --prop y=12cm --prop width=7cm --prop height=0.6cm --prop fill=none

# 底部细线
officecli add "$OUTPUT" '/slide[5]' --type shape --prop preset=rect --prop fill=00B894 --prop x=10cm --prop y=17.5cm --prop width=14cm --prop height=0.05cm
echo "Slide 5 complete"

# SLIDE 6 - CTA (行动号召页) - 中央大按钮
echo "Building Slide 6 - CTA..."
# 顶部深色区域
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=0cm --prop y=0cm --prop width=33.87cm --prop height=10cm

# 手动定义装饰元素
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=00B894 --prop opacity=0.15 --prop x=5cm --prop y=1cm --prop width=3cm --prop height=3cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=ellipse --prop fill=FFFFFF --prop opacity=0.08 --prop x=26cm --prop y=5cm --prop width=4cm --prop height=4cm

# 中央主标题
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="立即体验" --prop font="Microsoft YaHei" --prop size=52 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=2cm --prop y=2.5cm --prop width=30cm --prop height=2.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="GET IT NOW" --prop font="Arial" --prop size=22 --prop color=00B894 --prop align=center --prop x=2cm --prop y=5.5cm --prop width=30cm --prop height=1cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="开启您的智能生活新篇章" --prop font="Microsoft YaHei" --prop size=16 --prop color=B2BEC3 --prop align=center --prop x=2cm --prop y=7cm --prop width=30cm --prop height=0.8cm --prop fill=none

# 中央大按钮
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=00B894 --prop x=11cm --prop y=12cm --prop width=12cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="立即购买" --prop font="Microsoft YaHei" --prop size=24 --prop bold=true --prop color=FFFFFF --prop align=center --prop x=11cm --prop y=12.5cm --prop width=12cm --prop height=1.5cm --prop fill=none

# 联系信息卡片
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=4cm --prop y=15.5cm --prop width=12cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=00B894 --prop x=4cm --prop y=15.5cm --prop width=12cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="联系我们" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=left --prop x=5cm --prop y=15.8cm --prop width=5cm --prop height=0.5cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="客服热线: 400-888-8888" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=5cm --prop y=16.5cm --prop width=10cm --prop height=0.6cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="官方网站: www.minimal.com" --prop font="Microsoft YaHei" --prop size=14 --prop color=2D3436 --prop align=left --prop x=5cm --prop y=17.1cm --prop width=10cm --prop height=0.6cm --prop fill=none

# 二维码区域
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=18cm --prop y=15.5cm --prop width=5cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=2D3436 --prop x=18cm --prop y=15.5cm --prop width=5cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="扫码关注" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=center --prop x=18cm --prop y=17.2cm --prop width=5cm --prop height=0.5cm --prop fill=none

# 品牌信息
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=roundRect --prop fill=FFFFFF --prop opacity=0.95 --prop x=24cm --prop y=15.5cm --prop width=8cm --prop height=2.5cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop preset=rect --prop fill=00B894 --prop x=24cm --prop y=15.5cm --prop width=8cm --prop height=0.1cm
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="MINIMAL" --prop font="Arial Black" --prop size=18 --prop color=2D3436 --prop align=center --prop x=24cm --prop y=16cm --prop width=8cm --prop height=0.8cm --prop fill=none
officecli add "$OUTPUT" '/slide[6]' --type shape --prop text="极简产品" --prop font="Microsoft YaHei" --prop size=12 --prop color=636E72 --prop align=center --prop x=24cm --prop y=17cm --prop width=8cm --prop height=0.5cm --prop fill=none
echo "Slide 6 complete"

# Morph transitions
echo "Adding Morph transitions..."
for i in 2 3 4 5 6; do
  officecli set "$OUTPUT" "/slide[$i]" --prop transition=morph
done

echo "Validating..."
officecli validate "$OUTPUT"
echo "Complete: $OUTPUT"